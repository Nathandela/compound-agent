# Operating System Virtual Memory Reclamation: Why RSS Lies and Memory Doesn't Come Back

*2026-03-21*

---

## Abstract

Resident Set Size (RSS) is the ubiquitous process memory metric reported by every monitoring tool, process manager, and operations dashboard in production infrastructure. It is also the metric most prone to misinterpretation: a process can call `free()` on every allocation it holds, yet RSS remains completely unchanged. This survey examines the layered mechanisms — from POSIX standard contracts through allocator internals to kernel page management — that collectively explain why freed memory frequently does not return to the operating system and therefore does not reduce RSS.

The paper organizes these mechanisms into a taxonomy of five layers: (1) the POSIX contract for `free()` which guarantees only reusability within the allocator, not OS return; (2) user-space allocator strategies including ptmalloc2 (glibc), jemalloc, tcmalloc, and mimalloc, each with distinct policies for heap retention, arena management, and OS return thresholds; (3) kernel virtual memory mechanisms including `brk`/`sbrk` heap topology, `mmap`/`munmap` semantics, `madvise` hints, and Transparent Huge Pages; (4) platform-specific divergences between Linux and macOS, including macOS's memory compressor which fundamentally changes what "resident" means; and (5) runtime-level complications introduced by managed runtimes such as V8/Node.js, where RSS reflects allocator arenas, V8 semi-spaces, and native addon memory simultaneously.

The survey is motivated by a concrete production scenario: loading ONNX Runtime (~460 MB RSS footprint) and better-sqlite3 as native addons in a Node.js process, calling their respective `dispose()`/`close()` methods, and observing no RSS reduction. Understanding the precise mechanisms behind this failure informs architectural choices around subprocess isolation, allocator selection, explicit memory hints, and the conditions under which in-process cleanup is mechanically feasible.

---

## 1. Introduction

### 1.1 Problem Statement

A fundamental mismatch exists between what programmers expect and what operating systems guarantee when memory is freed. Programmers working in languages with manual memory management (C, C++) or with native-addon integration (Node.js, Python, Ruby) routinely observe that RSS climbs to a peak and then stays there indefinitely, even after all allocated objects are logically destroyed.

This gap has at least three distinct root causes, which this survey terms the *three-tier lie*:

1. **Allocator retention**: `free()` returns memory to the allocator's internal free lists; the allocator retains the memory as its own reserve and does not call `munmap` or `sbrk` decrement.
2. **Arena fragmentation**: Even when an allocator is willing to return memory, a single small live allocation within a contiguous arena region prevents the entire region from being released.
3. **Kernel page accounting**: Even after a process releases virtual memory, the kernel's RSS measurement depends on page table state, TLB flush timing, and whether MADV_DONTNEED or MADV_FREE semantics were applied.

The combined effect means that RSS is a high-water-mark metric masquerading as a current-usage metric.

### 1.2 Scope

This survey covers:

- Virtual memory fundamentals: address space, page tables, TLB, RSS/VSZ/PSS/USS definitions
- The POSIX contract for `malloc`/`free` and what it does not guarantee
- glibc's ptmalloc2 allocator internals (arenas, bins, trimming)
- Alternative allocators: jemalloc, tcmalloc (gperftools and Google), mimalloc
- Linux kernel mechanisms: `brk`, `mmap`/`munmap`, `madvise` flags
- Transparent Huge Pages (THP) and their fragmentation implications
- macOS Mach VM subsystem and the memory compressor
- V8/Node.js memory architecture and external memory accounting
- Memory fragmentation taxonomy
- Diagnostic toolchain (Linux and macOS)

Out of scope: kernel memory (kmalloc, slab), garbage-collected managed heaps (beyond their interaction with RSS), persistent memory (pmem/NVDIMM), and NUMA topology beyond brief mentions.

### 1.3 Key Definitions

| Term | Definition |
|------|-----------|
| **VSZ** (Virtual Size) | Total virtual address space reserved by the process. Includes unmapped regions, demand-paged areas, and memory-mapped files. Does not reflect physical memory. |
| **RSS** (Resident Set Size) | Physical pages currently mapped into the process's page table and resident in RAM. Includes shared pages at full weight; does not account for sharing. |
| **PSS** (Proportional Set Size) | RSS adjusted for page sharing: each shared page is counted as 1/N where N is the number of processes sharing it. Available in `/proc/PID/smaps`. |
| **USS** (Unique Set Size) | Only pages exclusively resident in this process (Private_Clean + Private_Dirty in smaps). The most accurate single-process footprint. |
| **Arena** | A heap region managed by an allocator, typically per-thread or per-CPU to reduce lock contention. |
| **Chunk** | The smallest allocation unit managed internally by an allocator; contains metadata plus user data. |
| **Top chunk** | The highest-addressed free region in a glibc arena that can be extended via `sbrk`. Only the top chunk can be returned to the OS via `sbrk` decrement. |
| **Anonymous page** | A physical page not backed by a file; used for heap, stack, and `MAP_ANONYMOUS` mappings. Must be zeroed or paged to swap. |
| **File-backed page** | A physical page that backs a portion of a file. Can be evicted without swap space since it can be re-read from disk. |
| **THP** | Transparent Huge Pages: 2 MB pages managed automatically by the kernel to reduce TLB pressure. |
| **MADV_DONTNEED** | Linux kernel hint: the kernel immediately unmaps and zeros pages, reducing RSS immediately. |
| **MADV_FREE** | Linux kernel hint: pages are lazily reclaimed only under memory pressure; RSS may not decrease immediately. |

---

## 2. Foundations

### 2.1 Virtual Memory Architecture

Modern processes operate in a virtual address space that is far larger than available physical RAM. On x86-64 Linux, 64-bit processes have a 128 TB virtual address space (bits 0–46 in a 4-level page table, extended to 57 bits in 5-level paging). On macOS Apple Silicon (arm64), the usable virtual space depends on entitled entitlements but typically spans ~32 TB per process.

The hardware Memory Management Unit (MMU) translates virtual addresses to physical addresses via a multi-level page table hierarchy:

```
Virtual Address [63:0]
  ├── Page Global Directory index  [47:39]  (PGD)
  ├── Page Upper Directory index   [38:30]  (PUD)
  ├── Page Middle Directory index  [29:21]  (PMD)
  ├── Page Table Entry index       [20:12]  (PTE)
  └── Page offset                  [11:0]   (4 KB pages)
```

Each leaf PTE maps a 4 KB virtual page to a 4 KB physical page frame. The hardware TLB (Translation Lookaside Buffer) caches recent translations; a TLB miss triggers a page walk which may cost 10–100+ cycles on modern hardware.

Physical pages exist in one of several kernel-tracked states:

```
Physical Page States (Linux)
  ┌──────────────────────────────────────┐
  │  Active     │  Recently accessed,    │
  │             │  mapped to a process   │
  ├─────────────┼────────────────────────┤
  │  Inactive   │  Resident but not      │
  │             │  recently accessed     │
  ├─────────────┼────────────────────────┤
  │  Free       │  In buddy allocator    │
  │             │  free lists            │
  ├─────────────┼────────────────────────┤
  │  Swap/File  │  Evicted to backing    │
  │             │  store                 │
  └─────────────┴────────────────────────┘
```

RSS counts only Active and Inactive pages mapped to the process. Free pages are not counted; swapped pages are not counted.

### 2.2 How RSS is Measured

RSS is computed by the kernel when `/proc/PID/status` or `/proc/PID/smaps` is read. The kernel walks the process's Virtual Memory Area (VMA) tree and, for each VMA, counts pages with present PTEs. The sum is reported as VmRSS.

Linux decomposes VmRSS into three components (available since Linux 4.5):

```
VmRSS = RssAnon + RssFile + RssShmem

RssAnon   = anonymous pages (heap, stack, MAP_ANONYMOUS private)
RssFile   = file-backed pages (executable, shared libraries, mmap'd files)
RssShmem  = shared memory (SysV shm, tmpfs mappings, shared-anonymous)
```

The `/proc/PID/smaps` file provides per-VMA breakdowns with additional fields:

```
55c3a4200000-55c3a4400000 rw-p 00000000 00:00 0   [heap]
Size:               2048 kB     <- virtual size
KernelPageSize:        4 kB
MMUPageSize:           4 kB
Rss:                1024 kB     <- physically resident
Pss:                 512 kB     <- proportional share (if shared)
Shared_Clean:          0 kB
Shared_Dirty:          0 kB
Private_Clean:         0 kB
Private_Dirty:      1024 kB     <- modified, not shared
Referenced:         1024 kB
Anonymous:          1024 kB
AnonHugePages:         0 kB     <- THP contribution
Swap:                  0 kB
SwapPss:               0 kB
Locked:                0 kB
```

USS (Unique Set Size) is computed as `Private_Clean + Private_Dirty` summed across all VMAs. PSS is provided directly per VMA.

### 2.3 The Process Memory Layout

A typical 64-bit Linux process has the following virtual address space layout (low to high):

```
Virtual Address Space Layout (x86-64 Linux)
─────────────────────────────────────────────
0x0000000000001000  ← text segment (executable code)
                      data segment (initialized globals)
                      BSS segment (uninitialized globals)
[heap grows up]
                   ↓
[heap: managed by brk/sbrk, or anonymous mmaps]
                   ↑
─────────────────────────────────────────────
[mmap region: shared libs, file mmaps, large malloc]
─────────────────────────────────────────────
                   ↓
[stack grows down]
0x00007fffffffffff ← top of user space
─────────────────────────────────────────────
0xffff800000000000 ← kernel space (inaccessible to user)
```

The heap (sbrk-managed region) and the mmap region are the two key arenas where `malloc` operates, and their distinct behaviors drive much of the RSS-retention phenomenon.

---

## 3. Taxonomy of Approaches

The mechanisms that determine whether freed memory returns to the OS can be classified across five layers:

```
Memory Reclamation Taxonomy
═══════════════════════════

Layer 5: Runtime/VM layer
  ├─ V8 (Node.js): semi-space, old-space, large-object-space
  ├─ External memory tracking via AdjustExternalMemory
  └─ Native addon allocations entirely outside V8 heap

Layer 4: Platform-specific OS mechanisms
  ├─ Linux: madvise MADV_DONTNEED / MADV_FREE
  ├─ macOS: Mach VM zones, memory compressor
  └─ Windows: VirtualFree / MEM_DECOMMIT

Layer 3: Kernel virtual memory
  ├─ Anonymous mmap / munmap (guaranteed reclamation)
  ├─ brk / sbrk (linear heap, top-only reclamation)
  ├─ Transparent Huge Pages (coarsens reclamation granularity)
  └─ TLB shootdown cost (makes frequent munmap expensive)

Layer 2: Allocator strategies
  ├─ ptmalloc2 (glibc): brk + mmap, arena fragmentation
  ├─ jemalloc: extent-based, decay purging, background threads
  ├─ tcmalloc: per-CPU caches, hugepage-aware, ReleaseToOS
  └─ mimalloc: sharded free lists, eager decommit

Layer 1: Standard library contract
  ├─ POSIX: free() guarantees reusability, NOT OS return
  ├─ C17: same — implementation-defined OS interaction
  └─ No standard mechanism to force OS return
```

This taxonomy structures the analysis in Section 4. The critical insight is that failure at any layer prevents OS return even if all higher layers are cooperating.

---

## 4. Analysis

### 4.1 The POSIX/C Standard Contract

#### Theory and mechanism

The POSIX standard defines `free(ptr)` as: "The free() function shall cause the space pointed to by ptr to be deallocated; that is, made available for further allocation." The specification makes no statement about whether the physical memory is returned to the OS. This is not an oversight — it is an explicit design choice that grants allocator implementations maximum freedom.

The C17 standard (ISO/IEC 9899:2018 §7.22.3.3) similarly specifies: "The free function causes the space pointed to by ptr to be deallocated, that is, made available for further allocation." No OS return is required.

The consequence is irreducible: **`free()` is a contract with the allocator, not with the OS**. Any behavior beyond this — including `munmap` calls, `sbrk` decrements, `madvise` hints — is an allocator quality-of-implementation decision.

#### Literature evidence

The glibc source documentation at sourceware.org/glibc/wiki/MallocInternals explicitly states: "In general, 'freeing' memory does not actually return it to the operating system for other applications to use. The free() call marks a chunk of memory as 'free to be reused' by the application, but from the operating system's point of view, the memory still 'belongs' to the application."

The taxonomy of "three kinds of leaks" by Nelson Elhage identifies "free but unused memory" as the hardest category precisely because "the allocator has freed memory internally, but has not managed to return a single byte to the operating system."

#### Strengths and limitations

The permissive contract enables allocators to implement high-performance free-list strategies without paying `munmap` syscall overhead on every `free()`. The cost is that developers cannot rely on freed memory reducing process RSS. The absence of a standard "return to OS" API means there is no portable way to force reclamation; allocator-specific mechanisms (e.g., `malloc_trim`, `jemalloc` epoch bumping, `tcmalloc::MallocExtension::ReleaseMemoryToSystem`) are all non-portable.

---

### 4.2 glibc ptmalloc2

#### Theory and mechanism

glibc's allocator derives from Doug Lea's dlmalloc via Wolfram Gloger's ptmalloc and the ptmalloc2 variant that ships in glibc. The architecture has two distinct allocation paths based on size:

**Path 1: sbrk heap (allocations below M_MMAP_THRESHOLD, default 128 KB)**

The main arena uses a contiguous sbrk heap. Memory is laid out linearly, and the "top chunk" is the expandable frontier:

```
sbrk Heap Layout
────────────────────────────────────────────────────────
│ allocated │  free  │  allocated │    top chunk        │ ← program break
│  chunk A  │ chunk  │  chunk B   │  (can be trimmed)   │
────────────────────────────────────────────────────────
                                  ↑
                            Only this region can be
                            returned via sbrk(-n)
```

A single live allocation anywhere below the top chunk prevents the contiguous region from being trimmed. This is the *high-water-mark problem*: if a 256 MB object was allocated at the base of the arena and then freed, with subsequent small allocations filling the vacated space, those small allocations may be interspersed with the residual structure in ways that prevent the top chunk from shrinking to the base.

**Path 2: mmap for large allocations (at or above M_MMAP_THRESHOLD)**

Allocations at or above the threshold use `mmap(MAP_ANONYMOUS|MAP_PRIVATE)`. When freed, `munmap` is called, returning the pages immediately. The threshold is dynamic: when a large chunk is freed via munmap, glibc increases the threshold to that size (capped at `DEFAULT_MMAP_THRESHOLD_MAX`: 512 KB on 32-bit, 4 MB * sizeof(long) on 64-bit).

**Thread-local arenas**

In multi-threaded programs, glibc creates additional arenas when the primary arena is contended. The number of arenas is capped at `8 * nproc` (configurable via `M_ARENA_MAX`). Each arena is a separate sbrk or mmap region with its own free lists and fragmentation state. Freed memory in thread arena X cannot be transferred to satisfy an allocation in thread arena Y — it is trapped in X's arena until X's top chunk grows large enough to trim.

**Bin structure**

Within each arena, free chunks are organized into bins by size:

```
Bin Organization (64-bit glibc)
──────────────────────────────────────────────────────────
tcache bins     (per-thread, 64 bins, max 7 entries each)
                Size: 24–1,032 bytes

fastbins        (per-arena, 10 bins, no coalescing)
                Size: 32–176 bytes (MAX_FAST_SIZE = 160 bytes)

unsorted bin    (single doubly-linked list, newly freed large chunks)
                Size: any

smallbins       (62 bins, fixed size, doubly-linked, coalesced)
                Size: 32–1,008 bytes (32-bit: 16–504 bytes)

largebins       (63 bins, size ranges, skip-list for search)
                Size: > 1,008 bytes
──────────────────────────────────────────────────────────
```

The fastbin optimization is particularly relevant to RSS: fastbin chunks are small, non-coalesced, and not merged with the top chunk until `malloc_consolidate()` runs (triggered by a large malloc or `malloc_trim()`). A heap where many small objects were freed may have all their memory sitting in fastbins, preventing top-chunk growth, preventing trimming.

**malloc_trim()**

`malloc_trim(pad)` attempts to return free memory at the top of the main arena to the OS via `sbrk(-n)`. Since glibc 2.8, it also calls `madvise(MADV_DONTNEED)` on free pages in all arenas and in all chunks with whole free pages.

Key limitations:
- The `pad` parameter only affects the main arena's sbrk trim; thread arenas are unaffected by pad
- Only the *topmost* contiguous free region in each arena can be returned; holes in the middle of an arena are invisible to trim
- A single 8-byte live allocation at the highest address prevents the entire arena below it from being returned

#### Literature evidence

Nate Berkopec's research on Ruby malloc behavior demonstrated that glibc's per-thread arena feature can cause memory use 1.73x the baseline, with only 10% performance gain. Setting `MALLOC_ARENA_MAX=2` reduced memory to 0.87x baseline with negligible performance impact. This is a direct measurement of the multi-arena fragmentation problem.

Facebook's jemalloc paper demonstrates that ptmalloc's contention-driven arena creation and fragmentation behavior is measurably worse than jemalloc's approach in multi-threaded server workloads.

#### Implementations and benchmarks

The glibc tunables most relevant to RSS behavior:

| Parameter | Default | Effect on RSS |
|-----------|---------|---------------|
| `M_TRIM_THRESHOLD` | 128 KB | Below this, top chunk is not trimmed after free. Higher = more retention. |
| `M_MMAP_THRESHOLD` | 128 KB | Below this, sbrk path is used (trapped). Above, mmap path (returnable). |
| `M_ARENA_MAX` | 8 * nproc | More arenas = more fragmentation surface. Set to 1-4 in memory-sensitive workloads. |
| `M_MMAP_MAX` | 65536 | Maximum simultaneous mmap allocations. |

Environment variable override: `MALLOC_ARENA_MAX`, `MALLOC_TRIM_THRESHOLD_`, `MALLOC_MMAP_THRESHOLD_` (glibc 2.26+ also supports the `GLIBC_TUNABLES` mechanism).

ONNX Runtime uses mimalloc as its default allocator on most platforms. The native Node.js addon (onnxruntime-node) loads a large shared library (~460 MB) whose own memory management behavior depends on the allocator linked into that library. After `session.release()` or the session object being garbage-collected, the ~460 MB allocated by the inference engine does not return to the OS because:

1. ONNX Runtime pre-allocates a large memory arena for model weights and activation buffers
2. These arenas are managed by mimalloc or system malloc
3. The OS memory for those arenas may remain mapped even after mimalloc marks them as free, depending on purge configuration
4. Even if mimalloc purges (MADV_DONTNEED), the VMA entries may remain and RSS measurement depends on whether pages have been accessed since the purge

#### Strengths and limitations

**Strengths**: ptmalloc2's per-thread arenas genuinely reduce lock contention in CPU-bound multi-threaded workloads. The tcache (thread-local cache, introduced in glibc 2.26) provides ~O(1) allocation/deallocation without any locking for common sizes.

**Limitations**: The sbrk heap model is fundamentally ill-suited to workloads with mixed small and large allocations, and to any workload that allocates a large object early and then frees it. The arena-per-thread default is aggressive and causes significant fragmentation in I/O-bound multi-threaded workloads where threads block frequently (like most Node.js native addon usage patterns). There is no compaction, no moving of live objects to consolidate free space.

---

### 4.3 jemalloc

#### Theory and mechanism

jemalloc (originally by Jason Evans for FreeBSD, later adopted by Facebook, used by default in Rust until 2019) uses a fundamentally different architecture based on *extents* rather than a contiguous sbrk heap.

**Core concepts**

```
jemalloc Memory Hierarchy
─────────────────────────────────────────────────────
Arena (4x nCPU default)
  └── Extent tree (red-black tree of page-aligned extents)
        ├── Dirty extents  (recently freed, physical pages resident)
        ├── Muzzy extents  (purged via madvise, pages may be released)
        └── Retained extents (returned to OS via munmap, or held)

Small allocation path:
  Thread → tcache (slab of fixed-size objects) → arena slab

Large allocation path:
  Thread → arena extent (dedicated extent per large object)
─────────────────────────────────────────────────────
```

**Extent-based vs. arena-based**

Unlike ptmalloc's contiguous heap, jemalloc manages memory as independently allocatable extents, always aligned to page boundaries. This means that when all objects within an extent are freed, the entire extent can be returned to the OS via `munmap` regardless of whether adjacent extents contain live objects. This is the fundamental advantage over ptmalloc: fragmentation is bounded by extent size, not arena size.

**Dirty page decay and purging**

jemalloc uses a decay-based purging system rather than immediate return:

```
Page Lifecycle in jemalloc
──────────────────────────────────────────────────────
Allocated → [app writes] → Freed
                              ↓
                         DIRTY state
                    (physical pages resident)
                              ↓
                    [decay timer: dirty_decay_ms]
                    [default: 10,000 ms = 10 seconds]
                              ↓
              madvise(MADV_FREE) or madvise(MADV_DONTNEED)
                              ↓
                         MUZZY state
                  (physical pages may be reclaimed
                   by kernel under memory pressure)
                              ↓
                    [decay timer: muzzy_decay_ms]
                    [default: 10,000 ms = 10 seconds]
                              ↓
              munmap() OR retained in virtual space
                              ↓
                         RETAINED state
                  (virtual address space reused
                   for future allocations)
──────────────────────────────────────────────────────
```

The decay uses a *sigmoidal curve* rather than a fixed timer: pages decay at a rate proportional to how much of the decay window has elapsed, smoothing out burst deallocations.

**Key configuration parameters**:

```
opt.dirty_decay_ms  = 10000   # ms before dirty → muzzy (0 = immediate)
opt.muzzy_decay_ms  = 10000   # ms before muzzy → retained
opt.retain          = true    # true = keep virtual, false = munmap
background_thread   = false   # enable for async purging
```

Setting `opt.dirty_decay_ms=0` and `opt.muzzy_decay_ms=0` causes immediate purging on free, which maximizes RSS reduction at the cost of more kernel pressure and fault overhead on reallocation.

**Thread-local caches**

jemalloc's tcache is a thread-local cache similar to glibc's but more sophisticated. Each thread has a tcache with bins for each size class. Garbage collection of tcache bins occurs automatically when bins become full, flushing objects back to the arena. The `background_thread` option enables a background thread that periodically purges dirty pages from all arenas without waiting for allocation activity to trigger cleanup.

#### Literature evidence

Facebook's 2011 blog post on jemalloc reports that in real-world multi-threaded web server benchmarks, jemalloc 2.1.0 outperformed tcmalloc by approximately 4.5% and significantly outperformed glibc ptmalloc in contended scenarios. More critically, jemalloc showed substantially lower peak RSS compared to ptmalloc in the same workloads due to better fragmentation management.

Nate Berkopec's Ruby memory analysis found that switching from glibc ptmalloc to jemalloc could reduce a typical Rails application's memory footprint by 2–4x, primarily by eliminating the multi-arena fragmentation problem.

#### Implementations and benchmarks

Relevant deployments:
- **Rust** (before 2019): jemalloc was Rust's default system allocator on non-Windows platforms. The team switched to system malloc for smaller binaries; users can opt back with the `tikv-jemallocator` crate.
- **Chromium**: Used jemalloc historically; migrated to PartitionAlloc.
- **Firefox**: Used jemalloc; now uses a custom variant.
- **Redis**: Optionally uses jemalloc for better memory fragmentation control.

Measurement tools available via jemalloc:
```
# Via mallctl API
MALLOC_CONF="stats_print:true" ./program  # Print stats on exit
MALLOC_CONF="dirty_decay_ms:0" ./program  # Immediate dirty purging
MALLOC_CONF="background_thread:true" ./program  # Async purging thread

# Via jemalloc epoch API
mallctl("epoch", NULL, NULL, &(uint64_t){1}, sizeof(uint64_t));
mallctl("stats.active", &active, &sz, NULL, 0);
```

#### Strengths and limitations

**Strengths**: Extent-based design allows OS return even amid partial fragmentation. Decay-based purging smooths the trade-off between RSS and re-fault overhead. The background thread option enables proactive memory return without waiting for allocation activity. Size-class spacing limits internal fragmentation to ~20%.

**Limitations**: Higher per-allocation metadata overhead than ptmalloc (~2% of total managed memory). The `retain` option (default: true on some platforms) may keep virtual address space reserved even after physical pages are released, which can inflate VSZ while keeping RSS low. Multiple arenas (4x nCPU default) still introduce some fragmentation between arenas even if intra-arena fragmentation is better managed. The 10-second default decay means a process that allocates 460 MB and frees it all will still show elevated RSS for up to 20 seconds afterward.

---

### 4.4 tcmalloc

#### Theory and mechanism

tcmalloc (Thread-Caching Malloc) was developed at Google and is used by the Go runtime and Chromium. It exists in two variants: the original gperftools tcmalloc and the rewritten Google tcmalloc (github.com/google/tcmalloc).

**Architecture layers**

```
tcmalloc Architecture
─────────────────────────────────────────────────────
Front-end (per-CPU or per-thread caches):
  ├── 60-80 size classes
  ├── Per-CPU slab with object pointers (no locks)
  └── Falls back to middle-end on miss

Middle-end (Transfer Cache + Central Free List):
  ├── Transfer cache: buffer between front/back
  └── Central free list: manages spans (page runs)
       └── Uses pagemap (radix tree) for object→span lookup

Back-end (Page Heap):
  ├── Legacy: fixed-size page chunks
  └── Hugepage-aware: 2 MiB-aligned chunks for THP benefits
─────────────────────────────────────────────────────
```

**Memory return to OS**

tcmalloc returns memory from the PageHeap via `tcmalloc::MallocExtension::ReleaseMemoryToSystem(bytes)`. A background thread can be configured to call `ProcessBackgroundActions()` which releases memory at a configured rate (default: gradual release from peak).

Key limitation documented by Google: "It is not possible to release memory from other internal structures, like the CentralFreeList." This means that even with aggressive PageHeap release, memory stranded in per-CPU caches or the central free list is not returnable.

**Hugepage-aware allocator**

The newer tcmalloc backend maintains 2 MiB-aligned hugepage-sized slabs. Allocations within a slab are grouped to fill complete hugepages before spilling to a new hugepage. When a hugepage slab is completely freed, the entire 2 MiB can be returned to the OS as a complete THP, avoiding the fragmentation problem of releasing partial hugepages.

**TLB fragmentation concern**

Google's documentation explicitly warns: "Memory that is unmapped at small granularity will break up hugepages, and this will cause some performance loss due to increased TLB misses." This is the core tension in all OS-return strategies: fine-grained `munmap` returns memory promptly but destroys THP coverage, which degrades performance.

#### Literature evidence

Facebook's jemalloc paper shows tcmalloc underperforms jemalloc by ~4.5% in web server benchmarks due to scalability limitations in the central free list. The Google tcmalloc rewrite addresses many of these issues.

Go's runtime historically used a tcmalloc-derived allocator. Go's `GOGC` and scavenger system return pages to the OS on a background timer, with configurable aggressiveness via `GOMEMLIMIT` (introduced in Go 1.19).

#### Implementations and benchmarks

```bash
# gperftools tcmalloc: link with -ltcmalloc
LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libtcmalloc.so.4 ./node app.js

# Force immediate release
MallocExtension::instance()->ReleaseFreeMemory();

# Background release rate (bytes/sec)
MallocExtension::instance()->SetMemoryReleaseRate(1000000);
```

#### Strengths and limitations

**Strengths**: Per-CPU caches scale extremely well with core count, avoiding the arena-count problem of ptmalloc. Hugepage-aware backend reduces TLB pressure in workloads that retain large working sets. Modern Google tcmalloc has lower metadata overhead than jemalloc in many benchmarks.

**Limitations**: Cannot return memory stranded in the CentralFreeList or per-CPU caches — only PageHeap memory is releasable. The hugepage-aware backend may delay OS return while waiting to fill complete hugepages. Not available as a drop-in replacement in all environments (requires linking or LD_PRELOAD).

---

### 4.5 mimalloc

#### Theory and mechanism

mimalloc (Microsoft's mi-malloc) was designed specifically to be a drop-in replacement with low fragmentation and competitive performance. It is used by ONNX Runtime, which makes it directly relevant to the motivating scenario.

**Architecture**

```
mimalloc Memory Hierarchy
─────────────────────────────────────────────────────
Heap (per-thread)
  └── Pages (64 KiB typical, contain uniform-size blocks)
        ├── Thread-local free list (no atomics needed)
        └── Cross-thread free list (single CAS per object)

Segments (larger regions: 4 MiB or 8 MiB chunks)
  └── Collection of pages of same size class

Arena (v3: ~1 GiB blocks)
  └── Source of memory for segments
─────────────────────────────────────────────────────
```

**Free list sharding**

mimalloc's critical innovation is *free list multi-sharding*: rather than one global free list per size class, each 64 KiB page maintains two separate free lists:
1. Thread-local free list: accessed without any synchronization
2. Cross-thread free list: receives frees from other threads via a single CAS operation

When a page's thread-local free list is empty, the cross-thread list is swapped in as the new thread-local list. This design means that a page either becomes entirely empty (all blocks freed) or remains partially used — maximizing the chance that a page can be fully reclaimed.

**OS memory return**

mimalloc has two OS return modes, configurable at runtime or compile time:

1. **Decommit** (default): Calls `madvise(MADV_DONTNEED)` on Linux or `MEM_DECOMMIT` on Windows. Immediately reduces RSS. Virtual address space is retained for future reuse.

2. **Reset**: Calls `madvise(MADV_FREE)` on Linux or `MEM_RESET` on Windows. Lazy reclamation: the kernel may or may not actually reclaim the pages depending on memory pressure.

Set via `MIMALLOC_PURGE_DECOMMITS=0` to use reset/MADV_FREE instead of decommit/MADV_DONTNEED.

**Eager page purging**

mimalloc's free-list sharding design means pages become entirely empty more often than in other allocators. When a page becomes empty, it is eagerly purged (decommitted or reset), reducing fragmentation in long-running processes. In contrast, ptmalloc chunks can only be trimmed from the top of the arena.

**ONNX Runtime usage**

ONNX Runtime links mimalloc by default on Linux and macOS. The model weights, activation tensors, and intermediate computation buffers are all allocated through mimalloc's arena system. When `InferenceSession.release()` is called:

1. The C++ InferenceSession destructor runs, freeing all managed tensors
2. mimalloc marks the memory as free in its page/segment structures
3. If decommit mode is active, `madvise(MADV_DONTNEED)` is called on emptied pages
4. The virtual address space entries may remain (reducing RSS but not VSZ)
5. The OS kernel zerosizes the physical pages on next access (if remapped)

The reason RSS does not return to pre-load levels: the dynamic shared library itself (~100-200 MB of code and static data in RssFile) remains mapped until the process exits or explicitly calls `dlclose()`. Native Node.js addons loaded via `require()` are never unloaded by Node.js — `dlclose()` is never called.

#### Literature evidence

The mimalloc research paper (Leijen et al., Microsoft Research, 2019) reports that mimalloc consistently outperforms jemalloc, tcmalloc, and Hoard in throughput benchmarks while also using less memory (RSS) in the eminently comparable "larson" server benchmark due to superior page reclamation.

#### Implementations and benchmarks

```bash
# Use mimalloc via LD_PRELOAD on Linux
LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libmimalloc.so.2 node app.js

# Configure decommit behavior
MIMALLOC_PURGE_DECOMMITS=1   # default: use MADV_DONTNEED
MIMALLOC_PURGE_DECOMMITS=0   # use MADV_FREE instead

# Print memory statistics on exit
MIMALLOC_SHOW_STATS=1 ./program
```

#### Strengths and limitations

**Strengths**: Eager page reclamation due to sharded free lists. Deterministic MADV_DONTNEED purging means RSS reduction is immediate when pages become empty (unlike jemalloc's decay model). Low metadata overhead (~0.2%). NUMA-aware with huge page support.

**Limitations**: Arena-based virtual address retention means VSZ may remain high even when RSS drops. Cross-thread free list design means a single cross-thread free in progress can delay a page from being marked empty. The default decommit-based purge incurs page-fault overhead on reallocation (the trade-off is explicit).

---

### 4.6 mmap/munmap Semantics and TLB Shootdown

#### Theory and mechanism

`mmap(MAP_ANONYMOUS|MAP_PRIVATE, ...)` is the only mechanism that *guarantees* memory return to the OS. When `munmap()` is called on an anonymous mapping:

1. Kernel removes the VMA entry from the process's VMA tree
2. Page table entries for the range are cleared
3. Physical pages are freed to the buddy allocator
4. **TLB shootdown**: The kernel sends Inter-Processor Interrupts (IPIs) to all CPU cores that have cached TLB entries for the unmapped range, forcing those TLB entries to be invalidated

The TLB shootdown step is the key performance cost of `munmap`. On a system with N cores, removing a mapping requires N-1 IPIs (one to each non-executing core), each requiring the target core to interrupt its current execution to process the invalidation. On a 64-core server, a single `munmap` call may generate 63 IPIs. The latency cost scales roughly as O(nCPU) and can be measured in microseconds to tens of microseconds in practice.

This cost is why allocators batch `munmap` calls rather than calling it per-`free()`. jemalloc's decay model, tcmalloc's gradual release, and mimalloc's page-granular decommit all amortize this cost.

**madvise alternatives**

`madvise(MADV_DONTNEED)` and `madvise(MADV_FREE)` allow the kernel to reclaim physical pages *without* removing the VMA or clearing PTEs in the conventional sense. The behavior differs:

```
madvise Comparison
──────────────────────────────────────────────────────────
                    MADV_DONTNEED       MADV_FREE
────────────────────────────────────────────────────────
RSS impact          Immediate           Deferred (lazy)
Page state after    Zeroed on access    May retain data until pressure
Write after call    OK (zero page)      Cancels reclamation
PTE state           Marked not-present  Present (swappable)
TLB shootdown       Yes (immediate)     Deferred
Linux availability  Since 2.4           Since 4.5
macOS behavior      Hints only, no      Similar to DONTNEED
                    immediate effect    (advisory)
──────────────────────────────────────────────────────────
```

**MADV_DONTNEED on macOS vs Linux**

This is a critical platform divergence: on Linux, `MADV_DONTNEED` causes the kernel to *immediately* unmap physical pages and return them to the free pool. The VMA remains, but subsequent accesses fault in fresh zero pages. RSS drops immediately.

On macOS, `madvise(MADV_DONTNEED)` is treated as an advisory hint. The kernel *may* reclaim the pages, but is not required to. The Mach VM subsystem uses different reclamation heuristics. As a result, allocators designed for Linux behavior may observe no RSS reduction on macOS when relying on MADV_DONTNEED semantics.

#### Literature evidence

Google's tcmalloc documentation explicitly identifies TLB fragmentation as a reason *not* to aggressively call munmap at fine granularity: "Memory that is unmapped at small granularity will break up hugepages, and this will cause some performance loss due to increased TLB misses."

Linux kernel documentation on MADV_FREE (added in 4.5) explains the semantic: "After a successful MADV_FREE operation, any stale data (i.e., dirty, unwritten pages) will be lost when the kernel frees the pages. However, subsequent writes to pages in the range will succeed and then kernel cannot free those pages, until the pages are freed via subsequent call to MADV_FREE."

#### Implementations and benchmarks

```bash
# Demonstrating MADV_DONTNEED effect on RSS (Linux)
# Allocate 1 GB, touch all pages, then madvise DONTNEED, observe RSS
cat /proc/$PID/status | grep -E "VmRSS|VmSize"
# After madvise(MADV_DONTNEED):
cat /proc/$PID/status | grep -E "VmRSS|VmSize"
# VSZ unchanged; RSS drops immediately

# On macOS: vmmap <PID> shows region types
# Regions marked "(cow)" are copy-on-write
# Regions marked "(NUL)" have been zeroed
vmmap -verbose $PID | grep -E "MALLOC|__DATA"
```

#### Strengths and limitations

**munmap strengths**: Only guaranteed OS return mechanism; reduces both RSS and VSZ.
**munmap limitations**: TLB shootdown cost; VMA count limits (default 65536 on Linux, configurable via `/proc/sys/vm/max_map_count`); must be page-aligned.
**MADV_DONTNEED strengths**: Cheaper than munmap (no VMA removal); allows virtual address space reuse; immediate RSS reduction on Linux.
**MADV_DONTNEED limitations**: macOS behavior is advisory only; re-access incurs page-fault cost; data is lost (fine for allocators, not for explicit data retention).
**MADV_FREE strengths**: No immediate page fault on re-write; allows kernel to optimize reclamation timing.
**MADV_FREE limitations**: RSS may not decrease for seconds or indefinitely; data loss is racy (write after MADV_FREE before kernel reclaim retains data, creating subtle bugs in allocator implementations that rely on detecting "freshly freed" pages).

---

### 4.7 Transparent Huge Pages

#### Theory and mechanism

Standard Linux page size is 4 KB. Transparent Huge Pages (THP) allow the kernel to use 2 MB pages (PMD-level) for anonymous mappings without explicit application involvement. The benefits are twofold: (1) a single TLB entry covers 512x more virtual address space, reducing TLB misses significantly; (2) page faults cover 512x more memory per fault, reducing page fault frequency.

THP operation modes:

```
/sys/kernel/mm/transparent_hugepage/enabled
  "always"  - All anonymous mappings backed with huge pages when possible
  "madvise" - Only regions with MADV_HUGEPAGE annotation
  "never"   - THP disabled system-wide
```

**khugepaged daemon**

The `khugepaged` kernel thread continuously scans memory looking for 512 consecutive 4 KB pages that could be collapsed into a single 2 MB page. When found, it allocates a huge page, copies the data, and updates the page table. This process is transparent to applications but consumes CPU time and causes brief memory pressure during the copy.

**Impact on memory reclamation**

THP significantly complicates partial memory reclamation:

```
4 KB pages (standard):
┌──┬──┬──┬──┬──┬──┬──┬──┐
│F │A │F │F │F │A │F │F │  (F=Free, A=Allocated)
└──┴──┴──┴──┴──┴──┴──┴──┘
  6 free pages can be returned independently

2 MB huge page (THP):
┌─────────────────────────────────────────────┐
│                    HUGE PAGE                │
│  F  F  F  F  F  F  A  F  F  F  ...  F  F  │
└─────────────────────────────────────────────┘
  Cannot return any portion — one live page
  pins the entire 2 MB huge page in RSS
```

When a 2 MB THP contains even one live 4 KB page, the entire 2 MB remains in RSS. The kernel can *split* the THP under memory pressure (via the deferred split queue), but this splitting is asynchronous and not guaranteed to happen immediately after a `free()`.

The `shrink_underused` kernel feature (configurable via `/sys/kernel/mm/transparent_hugepage/khugepaged/max_ptes_none`) places THPs that are more than a threshold fraction empty on a deferred split queue. However, splitting still happens asynchronously.

**Measurement**

```bash
# System-wide THP usage
grep AnonHugePages /proc/meminfo

# Per-process THP usage
grep AnonHugePages /proc/$PID/smaps | awk '{sum+=$2} END {print sum " kB"}'

# Disable THP for a specific process at runtime (via prctl)
prctl(PR_SET_THP_DISABLE, 1, 0, 0, 0);

# Disable THP for a specific memory region
madvise(addr, length, MADV_NOHUGEPAGE);
```

#### Literature evidence

The Linux kernel documentation notes that THP "maximizes the usefulness of free memory" from a fragmentation standpoint by not requiring pre-allocated huge page pools. However, it also notes that "applications that use large mappings of data and access large regions" benefit, while applications with sparse access patterns (loading a model and accessing only specific weights) may see THP as a net negative.

The Redis project documents THP causing fork-time copy-on-write overhead during `BGSAVE` or `BGREWRITEAOF`, and recommends disabling THP for Redis workloads.

#### Strengths and limitations

**Strengths**: Substantial TLB pressure reduction for workloads with large, dense working sets. Transparent to applications. Reduced page fault count for initial memory access.

**Limitations**: 2 MB granularity dramatically worsens external fragmentation and prevents partial reclamation. khugepaged compaction can cause latency spikes. Applications with sparse access patterns (e.g., loading a large model but accessing only specific weights) may see large RSS from THP coverage of cold regions. The kernel may promote 4 KB pages to THP during allocation, then prevent their reclamation when only a small subset remains live.

---

### 4.8 macOS Mach VM and the Memory Compressor

#### Theory and mechanism

macOS uses the Mach microkernel's VM subsystem, which differs fundamentally from Linux's VM in both architecture and memory accounting semantics.

**Mach VM regions**

The macOS virtual address space is organized into *VM regions* (analogous to Linux VMAs) managed by the Mach VM subsystem. Each region has properties including protection, inheritance, and whether it is backed by the default pager, a file, or shared memory.

The macOS equivalent of `/proc/PID/smaps` is `vmmap <PID>`:

```
# macOS vmmap output example
vmmap -verbose <PID>

Virtual Memory Map of process 12345 (node)
Output report format:  2.4  -- 64-bit process
...
REGION TYPE           START - END         SIZE  PRT/MAX SHRMOD REGION DETAIL
__TEXT                 1002d0000-100350000    512K r-x/rwx SM=COW ...node
__DATA_CONST           100350000-100380000    192K r--/rwx SM=COW ...node
__DATA                 100380000-100390000     64K rw-/rwx SM=PRV ...node
MALLOC_LARGE           140000000-160000000    512M rw-/rwx SM=PRV
MALLOC_SMALL           160000000-164000000     64M rw-/rwx SM=PRV
```

**The Memory Compressor**

macOS's most significant departure from Linux is the memory compressor, introduced in OS X Mavericks (10.9). Instead of paging anonymous memory to a swap file, macOS compresses inactive memory pages in RAM using a hardware-accelerated LZ-style compressor.

Compressed pages:
- Reduce physical RAM consumption by approximately 2-4x for typical data
- Are faster to access than disk-backed swap (nanoseconds vs milliseconds)
- Are counted differently in memory reporting tools

The Activity Monitor on macOS shows memory in four categories:
1. **App Memory**: Memory in use by applications
2. **Wired Memory**: Memory that cannot be paged or compressed (kernel, DMA buffers)
3. **Compressed**: Pages currently compressed by the compressor
4. **Cached Files**: File-backed pages (can be evicted without swap)

**RSS measurement divergence**

This creates a critical divergence from Linux RSS semantics: on macOS, `process.memoryUsage().rss` (or `ps` VmRSS equivalent) reports *uncompressed resident* memory. Pages compressed by the Mach compressor are **not** counted in RSS. As a result:

- A Node.js process that appears to have 460 MB RSS on macOS may have significant additional memory in compressed state
- After calling `dispose()`, memory may appear to "drop" in RSS because it transitioned to compressed state, not because it was actually returned to the OS
- The converse: processes can have higher actual memory pressure than RSS indicates, because the compressor is CPU-intensive

**macOS madvise behavior**

On macOS, `madvise(MADV_DONTNEED)` is advisory only — the kernel is permitted to ignore it. In practice, macOS may or may not act on the hint depending on current memory pressure and the recency of the page's last access. This is the reverse of Linux's guarantees, where MADV_DONTNEED causes immediate physical page return.

The macOS-specific `madvise(MADV_FREE_REUSE)` / `madvise(MADV_FREE_REUSABLE)` pair (non-standard) allows more explicit control over the macOS VM's page reclamation behavior.

**vmmap and diagnostic tools**

```bash
# macOS memory diagnostics
vmmap <PID>                    # Full VM map with region types
vmmap -summary <PID>           # Summarized by region type
leaks <PID>                    # Detect unreferenced heap allocations
malloc_history <PID> <address> # Allocation backtrace for an address
heap <PID>                     # Summary of heap zones
# Instruments.app: Allocations template provides live heap graphs

# Force macOS to show compressed memory in Terminal
memory_pressure -S             # Show system memory pressure status
```

#### Literature evidence

Apple's developer documentation describes the compressor as a layer below swap but above physical RAM, enabling macOS to maintain larger effective working sets. The system is designed so that "applications generally do not need to worry about memory management" in the paging sense, but this creates ambiguity in RSS reporting.

The divergence between macOS and Linux RSS semantics is a known source of confusion in cross-platform Node.js diagnostics: a 460 MB RSS on Linux after ONNX Runtime loading may show as only 300 MB on macOS (the remaining 160 MB being compressed), giving a false impression of better memory behavior.

#### Strengths and limitations

**Compressor strengths**: Extends effective RAM without disk I/O overhead; good latency profile for typical data patterns; transparent to applications.

**Compressor limitations**: Creates CPU overhead during compression/decompression; RSS becomes an undercount of actual memory pressure; makes cross-platform memory comparisons unreliable; compressed pages are not returned to the OS.

**madvise on macOS limitations**: Advisory-only semantics mean allocator behaviors tuned for Linux MADV_DONTNEED may have no effect on macOS RSS. ONNX Runtime's mimalloc-based memory management may purge pages on macOS without any observable RSS reduction.

---

### 4.9 Memory Fragmentation Taxonomy

#### Theory and mechanism

Memory fragmentation describes the state where available memory cannot be used for a given allocation request despite sufficient aggregate free space. Three distinct types arise in practice:

```
Fragmentation Taxonomy
──────────────────────────────────────────────────────────────
Type 1: External Fragmentation
  Free space exists, but not in contiguous blocks large enough
  for the requested allocation.

  ┌──┬──┬──┬──┬──┬──┬──┬──┐
  │A │F │A │F │A │F │A │F │
  └──┴──┴──┴──┴──┴──┴──┴──┘
  4 free blocks × 4B each = 16B free, but 8B alloc fails
  (no 8B contiguous run)

Type 2: Internal Fragmentation
  Allocated block is larger than requested; slack is wasted.

  Request: 17 bytes → Allocated: 24 bytes (next size class)
  ┌──────────────────────┬───────┐
  │    useful: 17 bytes  │ 7B   │← wasted inside allocation
  └──────────────────────┴───────┘

Type 3: Memory Bloat (allocated but unused)
  Memory is held by the allocator's free lists; technically
  "freed" by the application but not by the allocator.

  ┌──────────────────────────────────────────────────────┐
  │ Arena: 128 MB total                                  │
  │  - 5 MB in-use allocations                          │
  │  - 123 MB in free lists / top chunk                 │
  │  RSS: 128 MB                                        │
  └──────────────────────────────────────────────────────┘
──────────────────────────────────────────────────────────────
```

**Fragmentation measurement**

For an allocator, fragmentation ratio can be defined as:

```
Fragmentation ratio = RSS / (live bytes allocated by app)

Ideal: ratio = 1.0 (no waste)
Typical post-workload ptmalloc: 2.0–4.0
After load-large/free-all pattern: potentially > 10.0
```

With `/proc/PID/smaps`, the gap between `Private_Dirty` (pages actually written) and `Rss` (all resident pages) gives insight into fragmentation from a kernel perspective.

**Anti-fragmentation strategies**

1. **Compaction**: Moving live objects to consolidate free space. Requires either a stop-the-world phase (Java GC) or a read barrier for concurrent compaction. Not applicable to C/C++ allocators managing objects with raw pointers.

2. **Slab allocation**: Pre-allocate fixed-size "slabs" for specific object types. All objects in a slab are the same size, eliminating external fragmentation entirely for that type. The Linux kernel uses this for kernel objects. User-space equivalents: memory pools, arena allocators.

3. **Pool allocation**: Application-managed pool of same-type objects. When all objects are freed, the pool returns its backing memory. Pattern: `napi_env` environments in Node.js native addons use pool-like patterns for NAPI values.

4. **Region-based allocation**: All allocations in a "region" or "arena" are freed at once by destroying the arena. No individual `free()` calls; the entire region is `munmap()`'d at destruction. Pattern: HTTP request arenas (Apache, nginx), game level loading.

5. **Size-class segregation**: Allocating objects of similar sizes into the same arenas/slabs. Reduces external fragmentation by ensuring free blocks can serve similar-size requests. All modern allocators (jemalloc, tcmalloc, mimalloc) implement this.

#### Literature evidence

The three-category fragmentation taxonomy is formalized in Wilson et al. "Dynamic Storage Allocation: A Survey and Critical Review" (IWMM 1995), one of the foundational papers in the allocator design literature.

The Ruby community's extensive work on ptmalloc fragmentation demonstrates Type 3 (memory bloat): Ruby processes holding ~20 MB of live Ruby objects can consume 200+ MB of RSS due to fragmented arena regions that cannot be returned to the OS.

#### Strengths and limitations

Understanding which fragmentation type dominates determines the appropriate intervention:
- Type 1 (external): Use compacting allocator or region-based allocation
- Type 2 (internal): Use size-class-separated allocator; impossible to eliminate entirely
- Type 3 (bloat/retained): Use allocator with aggressive OS return (jemalloc with decay=0, mimalloc with decommit, malloc_trim, subprocess isolation)

The key diagnostic question is: "Is RSS high because pages are live, or because they are in the allocator's free list?" The difference is invisible to RSS alone but visible by comparing RSS to the allocator's own `stats.allocated` metric.

---

### 4.10 V8 and Node.js Memory Architecture

#### Theory and mechanism

Node.js processes run V8, a JavaScript engine with its own memory management layer on top of the OS allocator. V8's heap is entirely separate from the memory used by native addons, creating a multi-layered memory picture:

```
Node.js Memory Layers
──────────────────────────────────────────────────────────────────
RSS (from OS)
  ├── V8 Heap (managed by V8 GC)
  │     ├── Young Generation (nursery + intermediate)
  │     │     └── Semi-space: 2× (~32 MB each, configurable)
  │     ├── Old Generation
  │     │     ├── Old Space: long-lived JS objects
  │     │     ├── Code Space: JIT-compiled code
  │     │     └── Map Space: hidden classes / shapes
  │     └── Large Object Space: objects > 1 MB (no moving GC)
  │
  ├── External Memory (tracked by V8)
  │     └── ArrayBuffer backing stores (Buffer in Node.js)
  │         ├── Allocated via malloc, tracked via AdjustExternalMemory()
  │         └── GC pressure: external memory influences GC trigger timing
  │
  └── Native Addon Memory (NOT tracked by V8)
        ├── ONNX Runtime model weights, activation buffers
        ├── better-sqlite3 page cache, statement cache
        ├── Loaded shared libraries (.so/.dylib code + data)
        └── Addon's own malloc/new allocations
──────────────────────────────────────────────────────────────────
```

**process.memoryUsage() fields**

```javascript
process.memoryUsage()
// Returns:
{
  rss:          // Resident Set Size (from /proc/PID/status VmRSS)
                // TOTAL: includes V8 heap + external + native addons
  heapTotal:    // V8 heap: total allocated (committed virtual memory)
  heapUsed:     // V8 heap: currently live objects
  external:     // V8-tracked external memory (ArrayBuffer backing stores)
  arrayBuffers: // subset of external: specifically ArrayBuffer/SharedArrayBuffer
}
```

The critical observation: `rss - (heapTotal + external)` is the memory consumed by native addons, loaded libraries, and other non-V8 allocations. For a Node.js process with ONNX Runtime loaded, this gap is typically hundreds of megabytes.

**V8 GC architecture**

V8's garbage collector (Orinoco) manages the V8 heap through two primary collection types:

1. **Minor GC (Scavenger)**: Collects the young generation. Uses a semi-space copy collector: live objects are evacuated from From-Space to To-Space. Dead objects are left behind and overwritten on the next minor GC. Very fast (~1 ms); completely eliminates fragmentation within the young generation by compaction via copying.

2. **Major GC (Mark-Compact)**: Collects the full heap. Three phases:
   - **Marking**: Traces all reachable objects from the root set, using incremental and concurrent marking to spread work over multiple JavaScript time slices
   - **Sweeping**: Identifies dead objects and adds their memory to size-class free lists (similar to allocator bins)
   - **Compaction**: *Selectively* evacuates highly fragmented pages to consolidate free space. Not all pages are compacted — only pages where the live-data fraction is below a threshold.

**External memory and RSS divergence**

`Buffer.allocUnsafe(n)` and `new ArrayBuffer(n)` in Node.js allocate backing memory via `malloc()` (or the configured allocator) outside V8's heap. V8 is notified via `AdjustExternalMemory()` to include this in GC pressure calculations, but the actual pages are managed by the allocator, not V8's GC.

When an ONNX Runtime `InferenceSession` loads a model:
1. The session C++ object is created as a native addon wrapper (small V8 object in the heap)
2. All model weights, operator kernels, and execution provider buffers are allocated via mimalloc in native code
3. These are `external` to V8's heap, so `heapUsed` does not reflect the true memory cost
4. `rss` does reflect the cost (it measures all physical pages)
5. When the session wrapper becomes garbage-collected, the finalizer calls the C++ destructor
6. The destructor releases mimalloc-managed memory — but as analyzed in section 4.5, mimalloc retains virtual address space

**Native addon shared library retention**

A uniquely important source of RSS permanence in Node.js: native addons (.node files) are loaded via `dlopen()`. Node.js's `require()` system **never calls `dlclose()`**. The Node.js module system caches loaded native modules indefinitely. This means:

- The `.text` (code) and `.rodata` (read-only data) sections of the addon shared library remain mapped for the process lifetime
- For onnxruntime-node, the shared library itself is large (hundreds of MB of model execution code)
- RSS reduction after `session.release()` is limited to: dynamically allocated arena memory that mimalloc returns via MADV_DONTNEED/DONTNEED — the library code itself stays

**GC tracing for diagnosis**

```bash
# Trace all GC events with heap size before/after
node --trace-gc app.js

# Example output:
# [1234:0x...] 1053 ms: Scavenge 45.2 (65.0) -> 38.1 (65.0) MB, 0.8 ms
# [1234:0x...] 1102 ms: Mark-Compact 65.0 (65.0) -> 42.3 (67.0) MB, 12.4 ms

# Heap statistics from within the process:
v8.getHeapStatistics()
// {
//   used_heap_size: 45_000_000,
//   heap_size_limit: 4_294_967_296,  // --max-old-space-size
//   total_physical_size: 65_000_000, // V8's view of physical allocation
//   external_memory: 460_000_000,    // native addon allocations tracked by V8
// }
```

#### Literature evidence

V8's Orinoco GC is documented in the blog post "Trash Talk: The Orinoco Garbage Collector" (v8.dev, 2019), detailing the concurrent and parallel GC phases that allow most GC work to proceed without pausing JavaScript execution.

Node.js memory debugging guides consistently identify the RSS - heap gap as the indicator for native addon memory leaks vs. JavaScript heap leaks, with the guidance that native addon memory appearing in RSS but not in `heapUsed` requires native-level profiling tools.

#### Strengths and limitations

**V8 GC strengths**: Concurrent and incremental marking dramatically reduces GC pause times. Semi-space young generation eliminates young-generation fragmentation entirely. Selective compaction reduces old-generation fragmentation without full-heap compaction overhead.

**V8 GC limitations**: External memory (ArrayBuffers, native addon allocations) is only approximately tracked; GC pressure heuristics may not accurately reflect true memory pressure when external memory dominates. `heapUsed` is an unreliable predictor of RSS when native addons are present.

**Native addon limitations**: `dlclose()` is never called; addon code stays mapped. Native memory is managed entirely by the addon's own allocator, with V8 having no visibility or control. Memory profiling must use OS-level tools (`/proc/PID/smaps`, `vmmap`) rather than V8 DevTools heap profiler for native allocations.

---

## 5. Comparative Synthesis

The following table synthesizes the key trade-offs across the mechanisms analyzed:

### 5.1 Allocator Comparison

| Attribute | ptmalloc2 (glibc) | jemalloc | tcmalloc (Google) | mimalloc |
|-----------|-------------------|----------|-------------------|----------|
| **Architecture** | Contiguous sbrk arena + mmap for large | Extent-based per-arena | Per-CPU caches + PageHeap | Per-thread pages + segments |
| **OS return mechanism** | sbrk decrement + MADV_DONTNEED via malloc_trim | madvise after decay timer | ReleaseToOS from PageHeap | MADV_DONTNEED per empty page |
| **Fragmentation model** | Arena-level; holes trap memory below top chunk | Extent-level; fine-grained reclamation | Span-level; CentralFreeList not returnable | Page-level; sharding maximizes page emptying |
| **Return latency** | Requires malloc_trim() call or M_TRIM_THRESHOLD trigger | 10s decay default (configurable 0) | Background thread at set rate | Immediate on page empty (decommit mode) |
| **Multi-thread fragmentation** | High (up to 8×nproc arenas) | Moderate (4×nproc arenas, but extent-based) | Low (per-CPU, no global arena contention) | Low (sharded free lists reduce cross-thread fragmentation) |
| **RSS after load+free-all** | High (arena retained until trim) | Moderate-low (decay purge) | Moderate (PageHeap release) | Low-moderate (eager decommit) |
| **THP interaction** | Default arena size not THP-aware | Extent-aligned, THP compatible | Hugepage-aware backend available | THP-compatible, NUMA-aware |
| **Drop-in replacement** | N/A (default) | LD_PRELOAD or link | LD_PRELOAD or link | LD_PRELOAD or link |
| **Used by** | Default on Linux (glibc) | Rust (historical), Firefox, Redis | Go runtime, Chromium | ONNX Runtime, Windows default |

### 5.2 Memory Return Mechanism Comparison

| Mechanism | Guaranteed RSS reduction | Guaranteed VSZ reduction | TLB cost | macOS support | Granularity |
|-----------|-------------------------|-------------------------|----------|--------------|-------------|
| `munmap()` | Yes (immediate) | Yes (immediate) | High (IPI) | Yes | Page-aligned |
| `sbrk(-n)` | Yes (top only) | Yes (top only) | Low | Partial | Page-aligned |
| `MADV_DONTNEED` | Yes on Linux; advisory on macOS | No (VMA remains) | Low | Advisory only | Arbitrary |
| `MADV_FREE` | No (lazy) | No | Lower | Similar to DONTNEED | Arbitrary |
| `malloc_trim(0)` | Partial (top-chunk + post-2.8 arenas) | Partial | Low | Yes | Allocator-controlled |
| Process exit | Yes (all) | Yes (all) | N/A | Yes | All |
| Subprocess isolation | Yes (all in child) | Yes (all in child) | N/A | Yes | All |

### 5.3 Diagnostic Tool Comparison

| Tool | Platform | What it measures | Best for |
|------|----------|-----------------|---------|
| `/proc/PID/smaps` | Linux | Per-VMA RSS, PSS, USS, anon/file breakdown | Detailed per-region analysis |
| `/proc/PID/smaps_rollup` | Linux 4.14+ | Sum of all smaps fields, efficient | Quick USS/PSS summary |
| `/proc/PID/status` | Linux | VmRSS, RssAnon, RssFile breakdown | Quick VmHWM tracking |
| `pmap -x <PID>` | Linux | Formatted smaps output | Human-readable VMA listing |
| `valgrind --tool=massif` | Linux/macOS | Heap allocation snapshots over time | Finding allocation hotspots |
| `heaptrack <cmd>` | Linux | Low-overhead heap profiler | Tracking allocator fragmentation |
| `vmmap <PID>` | macOS | Mach VM region map | macOS region type analysis |
| `leaks <PID>` | macOS | Unreferenced heap nodes | macOS leak detection |
| `heap <PID>` | macOS | malloc zone summary | macOS heap zone analysis |
| `Instruments.app` | macOS | Allocations, leaks, VM tracker | Full macOS memory profile |
| `v8.getHeapStatistics()` | Node.js | V8 heap breakdown | V8 heap vs external gap |
| `process.memoryUsage()` | Node.js | RSS + V8 heap fields | Quick rss vs heap comparison |
| `--trace-gc` | Node.js | GC events with heap before/after | GC frequency and heap trajectory |
| Chrome DevTools Heap | Node.js/V8 | Object-level JS heap snapshot | JS-layer leaks only |

### 5.4 Fragmentation Type vs. Remedy

| Fragmentation type | Observable pattern | Applicable remedy |
|-------------------|--------------------|-------------------|
| External (allocator) | RSS >> live bytes; allocator stats show large free lists | Alternative allocator; malloc_trim; subprocess isolation |
| External (THP) | AnonHugePages high; RSS rounded to 2 MB multiples | Disable THP for arena regions (MADV_NOHUGEPAGE); madvise mode |
| Internal (size class) | RSS ≈ live bytes; small gap | Inherent cost; tunable with custom size classes |
| Memory bloat (free list) | rss >> heapUsed + external; allocator stats show high retained | malloc_trim; jemalloc decay=0; aggressive ReleaseToOS; subprocess isolation |
| Native addon code | RSS stays high after dispose(); RssFile >> expected | dlclose() not available in Node.js; subprocess isolation; restart |
| Arena fragmentation | RSS stays at peak despite freeing all objects | Region-based allocation; subprocess isolation; allocator switch |

---

## 6. Open Problems and Gaps

### 6.1 No Standard "Return to OS" API

The C and POSIX standards provide no portable mechanism to force an allocator to return memory to the OS. `malloc_trim()` is glibc-specific; jemalloc's `mallctl` is jemalloc-specific; tcmalloc's `MallocExtension` is tcmalloc-specific. Application code that wishes to minimize RSS must either commit to a specific allocator or accept that RSS control is unavailable.

An open question in the systems community is whether a `posix_malloc_trim()` or similar standard should be proposed, with implementations being quality-of-implementation decisions.

### 6.2 dlclose Safety in Native Addon Environments

Node.js's policy of never calling `dlclose()` is conservative but defensible: many shared libraries have global state or thread-local state that is not safely tearable while other threads run. The Node.js core team has debated this for years (node issue #5044 and related).

The fundamental problem is that C++ does not have a reliable way to verify a shared library's safety for unloading. ONNX Runtime in particular initializes thread pools, registers operators, and allocates global state whose lifetime is essentially process-scoped. Even if Node.js called `dlclose()`, the shared library's global destructors might leave dangling state.

This is an unsolved problem: in-process native addon lifecycle management conflicts with the memory reclamation requirements of long-running servers that load and unload models.

### 6.3 MADV_FREE Race Condition

MADV_FREE introduces a subtle race condition in allocator implementations: after calling `madvise(MADV_FREE)` on freed pages, if the allocator reuses a page for a new allocation before the kernel reclaims it, the data is preserved (the kernel checks if the page is dirty before reclaiming). But if the kernel reclaims the page first and then the allocator reuses it, the allocator will observe a fresh zero page rather than its expected free-list metadata.

Allocators that use MADV_FREE must either zero-initialize pages after reuse (adding overhead) or implement careful epoch tracking to detect kernel-reclaimed pages. This adds implementation complexity and subtle correctness concerns.

### 6.4 Measurement Accuracy Limitations

All current RSS measurement tools have fundamental limitations:
- `/proc/PID/smaps` requires a read lock on the process's VMA tree, causing brief scheduling interference in high-allocation-rate processes
- VmHWM (high water mark) in `/proc/PID/status` resets only on process restart, making it useless for tracking within-session peaks
- macOS compressed memory means RSS is systematically undercount; there is no per-process tool that reports both resident + compressed pages for a specific process without root access

### 6.5 THP Interaction with Allocator Design

The interaction between allocator extent alignment and THP promotion is poorly specified and implementation-dependent. An allocator that aligns extents to 2 MB boundaries may have its extents automatically promoted to THPs by khugepaged, then find that partial-free of the extent does not trigger THP splitting before the kernel attempts to measure RSS.

The correct allocation strategy for minimizing THP-induced fragmentation (align all extents to 2 MB boundaries AND ensure extents are freed as complete 2 MB units, as tcmalloc's hugepage-aware backend attempts) is not universally implemented, and the kernel's behavior when this contract is violated is not fully documented.

### 6.6 ONNX Runtime Memory Arena Design

ONNX Runtime's `IArenaAllocator` interface manages device-specific memory pools. The BFCArena (Best-Fit with Coalescing) strategy used for GPU memory is not applied to CPU memory, which uses a simpler region-based approach. The behavior of CPU memory arenas on session dispose is not fully documented: whether `BFCArena::Free()` calls `mimalloc::mi_free()` or releases the entire arena as a single `munmap` call is implementation-specific and may change across ONNX Runtime versions.

This is an active gap: users of ONNX Runtime in Node.js do not have reliable documentation on whether dispose() triggers OS memory return or merely allocator-internal free.

---

## 7. Conclusion

The phenomenon of RSS remaining elevated after `free()`/`dispose()` is not a bug but an emergent property of five cooperating design decisions made at different system layers:

1. **The POSIX contract** explicitly does not require OS return from `free()`, granting allocators full latitude to retain memory.

2. **Allocator strategies** trade OS return latency for allocation performance. glibc's sbrk heap model creates an irremediable high-water-mark problem for mixed-size workloads. jemalloc and mimalloc have more aggressive OS return policies, but both retain virtual address space by default and have decay-based rather than immediate return for performance reasons.

3. **The `mmap`/`munmap` cost asymmetry** — where `mmap` is cheap but `munmap` triggers O(nCPU) TLB shootdowns — makes frequent OS return genuinely expensive and explains why allocators batch returns aggressively.

4. **Transparent Huge Pages** coarsen reclamation granularity from 4 KB to 2 MB, meaning a single live byte in a THP page pins 2 MB of RSS. This is a system-wide default on many Linux distributions.

5. **Platform divergence** between Linux and macOS (where `MADV_DONTNEED` is advisory and the memory compressor creates a third state between "resident" and "freed") means that behaviors tuned for one platform are unreliable on the other.

For native addons specifically, a sixth factor dominates: **shared library code never unloads**. Node.js's design choice to never call `dlclose()` means the executable pages of a loaded native addon remain in RSS for the entire process lifetime, regardless of what the JavaScript application does with the addon's exports.

The practical consequence is that subprocess isolation — running native addon work in a child process and letting the OS reclaim all memory on `process.exit()` — is the only mechanism that guarantees complete memory reclamation to the process footprint before the addon was loaded. In-process reclamation strategies can reduce, but cannot eliminate, the RSS delta from loading a large native addon.

This is not a statement about correctness or quality of the allocators or Node.js runtime — each makes reasonable engineering trade-offs for their respective design constraints. It is a structural property of how virtual memory, allocators, shared libraries, and managed runtimes compose.

---

## References

1. **glibc Malloc Internals**. Sourceware. https://sourceware.org/glibc/wiki/MallocInternals

2. **jemalloc(3) Manual Page**. jemalloc.net. https://jemalloc.net/jemalloc.3.html

3. **TCMalloc Design Document**. Google. https://github.com/google/tcmalloc/blob/master/docs/design.md

4. **TCMalloc Tuning Guide**. Google. https://google.github.io/tcmalloc/tuning.html

5. **mimalloc: Free List Sharding in Action**. Leijen, D., Zorn, B., de Moura, L. Microsoft Research, 2019. https://www.microsoft.com/en-us/research/publication/mimalloc-free-list-sharding-in-action/

6. **Scalable Memory Allocation using jemalloc**. Evans, J. Facebook Engineering, 2011. https://engineering.fb.com/2011/01/03/core-data/scalable-memory-allocation-using-jemalloc/

7. **Transparent Huge Pages**. Linux Kernel Documentation. https://www.kernel.org/doc/html/latest/admin-guide/mm/transhuge.html

8. **madvise(2) Linux Manual Page**. man7.org. https://man7.org/linux/man-pages/man2/madvise.2.html

9. **mmap(2) Linux Manual Page**. man7.org. https://man7.org/linux/man-pages/man2/mmap.2.html

10. **brk(2) Linux Manual Page**. man7.org. https://man7.org/linux/man-pages/man2/brk.2.html

11. **malloc(3) Linux Manual Page**. man7.org. https://man7.org/linux/man-pages/man3/malloc.3.html

12. **malloc_trim(3) Linux Manual Page**. man7.org. https://man7.org/linux/man-pages/man3/malloc_trim.3.html

13. **mallopt(3) Linux Manual Page**. man7.org. https://man7.org/linux/man-pages/man3/mallopt.3.html

14. **free(3p) POSIX Manual Page**. pubs.opengroup.org. https://pubs.opengroup.org/onlinepubs/9699919799/functions/free.html

15. **proc_pid_smaps(5) Linux Manual Page**. man7.org. https://man7.org/linux/man-pages/man5/proc_pid_smaps.5.html

16. **proc_pid_status(5) Linux Manual Page**. man7.org. https://man7.org/linux/man-pages/man5/proc_pid_status.5.html

17. **Linux Virtual Memory Areas (VMAs)**. Linux Kernel Documentation. https://www.kernel.org/doc/html/latest/mm/process_addrs.html

18. **Three Kinds of Memory Leaks**. Elhage, N. 2016. https://blog.nelhage.com/post/three-kinds-of-leaks/

19. **Malloc Triples Ruby Memory**. Berkopec, N. 2017. https://www.speedshop.co/2017/12/04/malloc-doubles-ruby-memory.html

20. **Trash Talk: The Orinoco Garbage Collector**. V8 Blog. https://v8.dev/blog/trash-talk

21. **Node.js GC Traces Diagnostics**. Node.js Documentation. https://nodejs.org/en/docs/guides/diagnostics/memory/using-gc-traces

22. **process.memoryUsage() Documentation**. Node.js Documentation. https://nodejs.org/api/process.html#processmemoryusage

23. **About the Virtual Memory System**. Apple Developer Documentation. https://developer.apple.com/library/archive/documentation/Performance/Conceptual/ManagingMemory/Articles/AboutMemory.html

24. **DAMON: Data Access Monitor**. Linux Kernel Documentation. https://www.kernel.org/doc/html/latest/mm/damon/index.html

25. **BCC memleak tool**. iovisor/bcc. https://github.com/iovisor/bcc

26. **Dynamic Storage Allocation: A Survey and Critical Review**. Wilson, P., Johnstone, M., Neely, M., Boles, D. IWMM 1995. Proceedings of the International Workshop on Memory Management.

27. **Go GC Pacer Redesign Proposal**. Knyszek, M. 2021. https://go.googlesource.com/proposal/+/refs/heads/master/design/44167-gc-pacer-redesign.md

28. **pmap(1) Linux Manual Page**. man7.org. https://man7.org/linux/man-pages/man1/pmap.1.html

---

## Practitioner Resources

### Linux Memory Diagnosis

**Immediate process snapshot**:
```bash
# All-in-one memory snapshot for PID
PID=<your_pid>
echo "=== /proc/$PID/status memory fields ===" && \
  grep -E "^(Vm|Rss)" /proc/$PID/status

echo "=== smaps_rollup (efficient aggregate) ===" && \
  cat /proc/$PID/smaps_rollup

echo "=== Top 10 memory regions by RSS ===" && \
  awk '/^[0-9a-f]/{region=$0} /^Rss/{print $2, region}' \
  /proc/$PID/smaps | sort -rn | head -10

echo "=== Shared library RSS ===" && \
  pmap -x $PID | grep '\.so' | sort -k3 -rn | head -20
```

**Fragmentation diagnosis**:
```bash
# Check if RSS >> live heap (fragmentation indicator)
# For Node.js:
node -e "
  const used = process.memoryUsage();
  console.log('RSS:         ', (used.rss / 1e6).toFixed(1), 'MB');
  console.log('heapTotal:   ', (used.heapTotal / 1e6).toFixed(1), 'MB');
  console.log('heapUsed:    ', (used.heapUsed / 1e6).toFixed(1), 'MB');
  console.log('external:    ', (used.external / 1e6).toFixed(1), 'MB');
  console.log('native addon:', ((used.rss - used.heapTotal - used.external) / 1e6).toFixed(1), 'MB');
"
```

**glibc malloc tuning for reduced fragmentation**:
```bash
# Reduce arenas (most impactful for multi-threaded apps)
MALLOC_ARENA_MAX=2 node app.js

# Force aggressive trimming
MALLOC_TRIM_THRESHOLD_=0 node app.js

# Combine both
MALLOC_ARENA_MAX=2 MALLOC_TRIM_THRESHOLD_=0 node app.js
```

**Force glibc heap trim from within a process**:
```c
#include <malloc.h>
malloc_trim(0);  // trim all arenas, no pad
```

**Alternative allocator via LD_PRELOAD**:
```bash
# jemalloc with immediate dirty purging
MALLOC_CONF="dirty_decay_ms:0,muzzy_decay_ms:0,background_thread:true" \
  LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2 \
  node app.js

# mimalloc with decommit mode
MIMALLOC_PURGE_DECOMMITS=1 \
  LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libmimalloc.so.2 \
  node app.js

# tcmalloc with release
LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libtcmalloc.so.4 \
  node app.js
```

**Transparent Huge Pages management**:
```bash
# Check current THP mode
cat /sys/kernel/mm/transparent_hugepage/enabled

# Set to madvise-only (recommended for allocator-intensive workloads)
echo madvise | sudo tee /sys/kernel/mm/transparent_hugepage/enabled

# Per-process THP disable (Linux 5.4+)
# Via prctl in C/C++ code:
prctl(PR_SET_THP_DISABLE, 1, 0, 0, 0);

# Check THP contribution to RSS
grep AnonHugePages /proc/$PID/smaps | awk '{sum+=$2} END {print sum/1024 " MB THP"}'
```

### macOS Memory Diagnosis

```bash
# Full VM map with region summary
vmmap -summary <PID>

# Detailed region listing (focus on MALLOC regions)
vmmap <PID> | grep -E "MALLOC|__DATA"

# Check for unreferenced heap blocks
leaks <PID>

# Malloc zone summary
heap <PID>

# Malloc history for a specific address (requires MallocStackLogging=1 env)
malloc_history <PID> <address>

# Enable malloc stack logging before process start:
MallocStackLogging=1 node app.js
# Then: malloc_history <PID> <address>
```

### Node.js Memory Profiling

```javascript
// Continuous memory monitoring
const v8 = require('v8');

function printMemory(label) {
  const mem = process.memoryUsage();
  const heap = v8.getHeapStatistics();
  console.log(`\n[${label}]`);
  console.log(`  RSS:              ${(mem.rss / 1e6).toFixed(1)} MB`);
  console.log(`  heapUsed:         ${(mem.heapUsed / 1e6).toFixed(1)} MB`);
  console.log(`  heapTotal:        ${(mem.heapTotal / 1e6).toFixed(1)} MB`);
  console.log(`  external:         ${(mem.external / 1e6).toFixed(1)} MB`);
  console.log(`  native (approx):  ${((mem.rss - mem.heapTotal - mem.external) / 1e6).toFixed(1)} MB`);
  console.log(`  peak_heap (V8):   ${(heap.peak_malloced_memory / 1e6).toFixed(1)} MB`);
}

// Before loading addon
printMemory('baseline');

// After loading ONNX Runtime session
const session = await InferenceSession.create('./model.onnx');
printMemory('after load');

// After dispose
await session.release();
// Force V8 GC to run finalizers (not guaranteed)
if (global.gc) global.gc(); // requires --expose-gc flag
printMemory('after dispose');
```

```bash
# Run with GC exposed for testing
node --expose-gc app.js

# V8 GC trace to watch heap trajectory
node --trace-gc app.js 2>&1 | grep -E "Scavenge|Mark-Compact"
```

### Key Academic and Design References

- **Wilson et al. (1995)** "Dynamic Storage Allocation: A Survey and Critical Review" — foundational taxonomy of allocator design and fragmentation metrics
- **Evans (2006)** "A Scalable Concurrent malloc(3) Implementation for FreeBSD" — original jemalloc paper
- **Leijen et al. (2019)** "mimalloc: Free List Sharding in Action" — mimalloc design paper with benchmarks
- **Berger et al. (2000)** "Hoard: A Scalable Memory Allocator for Multithreaded Applications" — foundational multi-threaded allocator theory
- **Ghemawat & Menage** "TCMalloc: Thread-Caching Malloc" — original tcmalloc description at google.github.io/tcmalloc/

### Tools Repository Quick Reference

| Tool | Source | Install |
|------|--------|---------|
| jemalloc | https://github.com/jemalloc/jemalloc | `apt install libjemalloc-dev` |
| mimalloc | https://github.com/microsoft/mimalloc | `apt install libmimalloc-dev` |
| heaptrack | https://github.com/KDE/heaptrack | `apt install heaptrack` |
| BCC memleak | https://github.com/iovisor/bcc | `apt install bpfcc-tools` |
| gperftools (tcmalloc) | https://github.com/gperftools/gperftools | `apt install google-perftools` |
| Valgrind Massif | https://valgrind.org | `apt install valgrind` |
