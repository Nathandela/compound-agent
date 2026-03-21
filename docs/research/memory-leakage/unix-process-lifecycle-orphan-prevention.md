# Unix Process Lifecycle, Orphan Prevention & Process Group Management

*March 2026*

---

## Abstract

This survey examines the mechanisms by which Unix-family operating systems manage process lifecycle and the strategies available to software systems for preventing child-process orphaning. The core problem is a structural tension in the Unix design: the parent-child relationship is the primary mechanism for process supervision, yet SIGKILL—the only guaranteed termination signal—provides no opportunity for cleanup, leaving child processes to be adopted by init or a subreaper with no notification to the child itself.

The survey covers ten interlocking areas: the fork-exec model and POSIX reparenting semantics; signal delivery guarantees and their limits; process group and session management; the Linux PR_SET_CHILD_SUBREAPER and PR_SET_PDEATHSIG prctl interfaces; PID-file and advisory-lock tracking; cgroup v2 process containment including the cgroup.kill interface; macOS kqueue EVFILT_PROC; Node.js child_process semantics (detached, unref, AbortController, zombie accumulation in worker threads); container and sandbox approaches (Docker PID namespaces, tini, bubblewrap, Chromium zygote); and real-world supervision patterns (double-fork daemon, pipe-based parent-death detection, supervisord, pidfd).

The analysis reveals that no single mechanism covers all failure modes. PR_SET_PDEATHSIG carries threading and setuid caveats that make it hazardous in general-purpose applications. Process group signaling is portable but cannot reach grandchild processes in distinct groups. The cgroup.kill interface (Linux 5.14+) offers the strongest atomicity guarantees but requires kernel version and privilege assumptions. The pipe-EOF idiom remains the most portable and threading-safe approach for detecting parent death, though it cannot bridge the gap between SIGKILL delivery and pipe closure. The survey closes by identifying open problems: there is no portable, race-free, SIGKILL-resistant mechanism for orphan prevention that works across Linux and macOS without elevated privilege.

---

## 1. Introduction

### 1.1 Problem Statement

When a software system spawns child processes to perform background work—document indexing, compilation, network serving—it implicitly takes on a lifecycle management obligation. Under normal operation the parent controls children through signals and wait(2) calls. The breakdown occurs when the parent is force-killed with SIGKILL: the kernel delivers the signal immediately without invoking signal handlers, exit hooks, atexit functions, or destructors. Children are reparented to PID 1 (or a subreaper) and continue running indefinitely, consuming resources with no supervising parent.

This problem is not hypothetical. It is a documented failure mode in:

- AI agent frameworks where user sessions are terminated under memory pressure, orphaning background embedding or indexing processes.
- Container escape scenarios where the container runtime is killed but container processes survive because the cgroup was not cleaned up.
- Node.js applications using `detached: true` + `child.unref()` for background work, where accumulated orphans eventually exhaust PIDs or disk I/O bandwidth.
- CI systems where test runners are killed but subprocess trees survive and block subsequent runs.

### 1.2 Scope

This survey covers:

- Linux (kernel 2.6.18 through 6.9+) and macOS (Darwin 20+)
- POSIX.1-2017 process, session, and signal semantics
- Node.js child_process module (v18–v22)
- Container runtimes: Docker (via containerd/runc), bubblewrap, Chromium zygote
- Process supervision: supervisord, systemd, launchd, tini, dumb-init

Out of scope: Windows process management, Java process API, hardware-level CPU context switching, memory management, and network process isolation (seccomp, namespaces beyond PID).

### 1.3 Key Definitions

| Term | Definition |
|---|---|
| Orphan | A process whose parent has exited; reparented to init or subreaper |
| Zombie | A process that has exited but not yet been waited on (still in process table) |
| Process Group (PG) | A set of processes sharing a PGID; signals can be sent to the whole group |
| Session | A set of process groups sharing a SID; associated with a controlling terminal |
| Session Leader | The process whose PID equals the SID of the session |
| Process Group Leader | The process whose PID equals the PGID |
| Subreaper | A process marked with PR_SET_CHILD_SUBREAPER; receives orphans instead of init |
| Controlling Terminal | The terminal device associated with a session; sends SIGHUP on hangup |
| Orphaned Process Group | A process group where no member's parent is outside the group and in the same session |

---

## 2. Foundations

### 2.1 The Fork-Exec Model

Unix process creation is a two-step operation defined in POSIX.1-2017 §2.3 (Process Creation):

1. `fork(2)` duplicates the calling process, creating an identical child with a new PID. The child inherits open file descriptors, signal dispositions, environment, memory mappings (copy-on-write), and crucially the parent's PGID and SID.

2. `exec(2)` replaces the calling process's address space with a new program. Signal dispositions reset to default for caught signals; ignored signals remain ignored. The PGID and SID are preserved across execve unless explicitly changed.

The separation of fork and exec is intentional and powerful: code between fork and exec can set up file descriptors, change user identity, alter process group membership, or call prctl before the new program starts.

```c
// Canonical fork-exec with process group isolation
pid_t pid = fork();
if (pid == 0) {
    // Child: create new process group before exec
    setpgid(0, 0);          // PGID = child's PID
    // Set up stdio, close fds, etc.
    execvp(argv[0], argv);
    _exit(1);               // exec failed
}
// Parent: may also call setpgid(pid, pid) — race with child's setpgid
setpgid(pid, pid);          // Both parent and child call this; idempotent
```

The race between parent and child calling setpgid is a classic POSIX concurrency problem. Both sides must call it to guarantee the child is in its own group before either side proceeds.

### 2.2 The Parent-Child Relationship

The kernel maintains each process's `ppid` (parent PID). When a child exits, it sends SIGCHLD to its parent and enters zombie state, retaining its PID in the process table until the parent calls wait(2) or waitpid(2) to retrieve the exit status. If the parent never calls wait, the zombie persists.

```
Process State Machine (POSIX)

   fork()          exec()          exit()         wait()
[CREATED] -----> [RUNNABLE] -----> [EXITED] -----> [REAPED]
                     |                 |
                  running          [ZOMBIE]
                                (in process table,
                                 no resources held)
```

When a parent exits before its children, the kernel's `forget_original_parent()` function in `kernel/exit.c` performs reparenting:

```c
// Simplified from Linux kernel/exit.c
static struct task_struct *find_new_reaper(struct task_struct *father,
                                           struct task_struct *child_reaper) {
    // 1. Try alive thread in same thread group
    struct task_struct *thread = find_alive_thread(father);
    if (thread) return thread;

    // 2. Walk ancestor chain for subreaper
    if (father->signal->has_child_subreaper) {
        for (reaper = father;
             !same_thread_group(reaper, child_reaper);
             reaper = reaper->real_parent) {
            if (reaper == &init_task) break;
            if (!reaper->signal->is_child_subreaper) continue;
            thread = find_alive_thread(reaper);
            if (thread) return thread;
        }
    }
    // 3. Fall back to child_reaper (init or PID namespace init)
    return child_reaper;
}
```

The full `forget_original_parent()` then sends pdeath_signal to each child if configured, and appends the entire children list to the new reaper's children list.

### 2.3 Process Groups and Sessions

The Unix process namespace is organized hierarchically:

```
Session (SID)
  ├─ Process Group A (PGID = A)
  │    ├─ Process P1 (PID = A, group leader)
  │    ├─ Process P2
  │    └─ Process P3
  ├─ Process Group B (PGID = B)
  │    ├─ Process P4 (PID = B, group leader)
  │    └─ Process P5
  └─ (foreground group is one of A or B at a time)

Controlling Terminal ─────────────────── Session Leader (PID = SID)
```

Key properties:

- A process belongs to exactly one group and one session at any moment.
- `setpgid(pid, pgid)` moves a process to an existing group or creates a new one. A process cannot join a group in a different session, and cannot leave its group if it is the group leader.
- `setsid()` creates a new session. It fails if the caller is already a process group leader. The new session has no controlling terminal.
- `killpg(pgid, sig)` is equivalent to `kill(-pgid, sig)`: delivers sig to all processes in the group.

### 2.4 Signal Semantics

POSIX defines three categories relevant to lifecycle management:

**Catchable, blockable signals (SIGTERM, SIGHUP, SIGUSR1, SIGUSR2, etc.)**: A process can install a handler, block delivery with sigprocmask, or ignore. Delivery guarantees are "eventually"—the kernel queues the signal and delivers it at the next safe point.

**Stop/continue signals (SIGSTOP, SIGCONT)**: SIGSTOP cannot be caught or blocked (like SIGKILL). SIGCONT resumes stopped processes and clears pending SIGSTOP.

**SIGKILL**: Cannot be caught, blocked, or ignored by any process except PID 1 (init) in its own PID namespace. The kernel enforces this in `sig_kernel_only()` which tests for `SIGKILL | SIGSTOP`. rt_sigprocmask removes both from any provided mask. Delivery is synchronous: the kernel terminates the process before returning to user space.

The consequence: **any cleanup relying on signal handlers is incompatible with SIGKILL**. atexit handlers, C++ destructors, Node.js `process.on('exit')`, and Python's `atexit` module are all bypassed.

### 2.5 SIGHUP and Session Leader Death

When a session leader exits and the session has a controlling terminal, the kernel sends SIGHUP to all processes in the foreground process group. This is the terminal hangup mechanism.

When a process group becomes orphaned (all members' parents are either in the group or have exited), and the group contains stopped processes, POSIX requires sending SIGHUP followed by SIGCONT to every member of the orphaned group. This prevents stopped processes from languishing forever.

Shell behavior: bash and most interactive shells maintain a job table and send SIGHUP to all tracked jobs when the shell exits. However, this is a shell feature, not a kernel guarantee. `nohup` sets SIG_IGN for SIGHUP before exec; since SIG_IGN is preserved across exec, the child process ignores SIGHUP.

---

## 3. Taxonomy of Approaches

Approaches to orphan prevention can be classified along three axes:

1. **Prevention vs. Detection**: Does the mechanism prevent orphans from forming, or detect and clean them up after the fact?
2. **OS-level vs. Application-level**: Does it rely on kernel interfaces, or application-layer protocols (pipes, files, IPC)?
3. **Push vs. Pull**: Does the OS push a notification to the child, or does the child poll for parent presence?

```
Taxonomy Tree

Orphan Prevention & Lifecycle Management
├─ Kernel-enforced (Prevention)
│   ├─ PR_SET_PDEATHSIG       (Linux, push, per-thread parent tracking)
│   ├─ PR_SET_CHILD_SUBREAPER (Linux, reparenting to controlled process)
│   ├─ cgroup.kill            (Linux 5.14+, group termination)
│   ├─ PID namespaces         (container model, group lifecycle)
│   └─ kqueue EVFILT_PROC     (macOS/BSD, push notification to watcher)
│
├─ Application-layer (Detection + Response)
│   ├─ Pipe EOF               (portable, push via EOF on all platforms)
│   ├─ eventfd                (Linux, lower overhead than pipe)
│   ├─ Heartbeat file touch   (poll, parent touches file; child watches)
│   ├─ PID file + flock       (stale detection; not death notification)
│   └─ pidfd poll/epoll       (Linux 5.3+, race-free process monitoring)
│
├─ Process Group Management
│   ├─ setpgid + killpg       (portable, group-level signaling)
│   ├─ setsid + detach        (terminal disconnection; creates orphan risk)
│   └─ supervisord/systemd    (external supervisor holds process tree)
│
└─ Isolation / Containment
    ├─ Docker PID namespace   (PID 1 lifecycle, kernel SIGKILL on namespace exit)
    ├─ tini / dumb-init       (minimal init, zombie reaping, signal forwarding)
    └─ bubblewrap             (namespace sandbox, --die-with-parent)
```

Visual classification table:

| Approach | Platform | Privilege | Push/Pull | SIGKILL-safe | Grandchild-safe |
|---|---|---|---|---|---|
| PR_SET_PDEATHSIG | Linux | None | Push | Yes* | No |
| PR_SET_CHILD_SUBREAPER | Linux 3.4+ | None | Push (reparent) | Yes | Yes |
| cgroup.kill | Linux 5.14+ | cgroup write | Push | Yes | Yes |
| PID namespace | Linux (containers) | CAP_SYS_ADMIN | Push | Yes | Yes |
| kqueue EVFILT_PROC | macOS/BSD | None | Push | Yes | No |
| Pipe EOF | POSIX | None | Push | Yes | No |
| pidfd + epoll | Linux 5.3+ | None | Push | N/A (monitor only) | No |
| setpgid + killpg | POSIX | None | Explicit | No | No |
| PID file + flock | POSIX | None | Poll | No | No |
| tini/dumb-init | Linux (container) | None (PID 1) | Reap | Yes | Yes |
| supervisord | POSIX | None | Poll+signal | No | No |

\* PR_SET_PDEATHSIG is SIGKILL-safe in the sense that the signal is delivered to the child when the parent thread exits (regardless of cause), but it tracks the creating thread, not the process, which introduces its own hazard.

---

## 4. Analysis

### 4.1 PR_SET_PDEATHSIG

#### Theory & Mechanism

`prctl(PR_SET_PDEATHSIG, sig)` installs a deferred signal delivery: when the thread that created the calling process exits, the specified signal is sent to the calling process. This is a per-process attribute set by the child in its own address space, typically in the window between fork and exec.

```c
// Typical usage: child sets immediately after fork, before exec
pid_t pid = fork();
if (pid == 0) {
    // Set SIGKILL to be sent when parent thread dies
    if (prctl(PR_SET_PDEATHSIG, SIGKILL) == -1) {
        perror("prctl");
        _exit(1);
    }
    // Check if parent already died between fork and prctl
    if (getppid() != expected_parent_pid) {
        _exit(0);
    }
    execvp(argv[0], argv);
    _exit(1);
}
```

The check after prctl is critical: there is a race window between fork() returning in the child and prctl() executing. If the parent exits in this window, the pdeath signal is never sent (because the prctl hadn't registered yet when the parent thread exited). The child must verify its ppid and self-exit if the parent is already gone.

#### Literature Evidence

The kernel implementation is in `kernel/exit.c`'s `forget_original_parent()`: after updating `real_parent`, it iterates all threads and calls `group_send_sig_info(t->pdeath_signal, ...)` for each. The signal is sent using the same path as a normal `kill(2)` call.

Linux manual page `PR_SET_PDEATHSIG(2const)` documents the following clearing conditions:
- The setting is cleared for the child produced by `fork(2)`
- Since Linux 2.4.36 / 2.6.23, it is cleared when executing a set-user-ID or set-group-ID binary, or a binary with associated capabilities
- It is preserved across `execve(2)` (unless the executable is setuid/setgid)

#### Implementations & Benchmarks

Major users include:
- **systemd** service processes: each service's main process has PR_SET_PDEATHSIG set to SIGKILL so it dies if the service manager dies
- **bubblewrap** `--die-with-parent`: uses `prctl(PR_SET_PDEATHSIG, SIGKILL)` to ensure sandboxed processes die with the launcher
- **Docker** (`runc`): sets pdeathsig in the container's init process setup

There are no published benchmarks for pdeathsig delivery latency. It is delivered synchronously with the parent thread's exit path in `do_exit()`.

#### Strengths & Limitations

**Strengths:**
- No privilege required
- Works even with SIGKILL on the parent (because the parent thread's exit invokes pdeathsig delivery)
- No polling; purely event-driven

**Limitations:**
- **Thread-level granularity, not process-level**: The signal tracks the specific thread that called `fork()`, not the entire parent process. In runtimes with thread pools (Go, Tokio, Node.js worker threads), the creating thread may be reaped by the runtime before the process exits. Recall.ai documented this failure with Bubblewrap inside a Tokio application: the worker thread that spawned the child was parked and eventually reaped by Tokio's scheduler, triggering SIGKILL on the still-needed child process.
- **Race window at fork**: The window between `fork()` and `prctl()` in the child requires an explicit ppid re-check.
- **Cleared on setuid/setgid exec**: Cannot protect processes that transition privilege levels.
- **Does not protect grandchildren**: The signal is sent only to the direct child. Grandchildren that have not independently set PR_SET_PDEATHSIG will become orphans.
- **Linux only**: Not available on macOS, FreeBSD, or other POSIX systems.

---

### 4.2 PR_SET_CHILD_SUBREAPER

#### Theory & Mechanism

`prctl(PR_SET_CHILD_SUBREAPER, 1)` marks the calling process as a subreaper. When any descendant process becomes an orphan (its parent exits), the kernel's `find_new_reaper()` walks up the ancestor chain and reparents the orphan to the nearest living subreaper rather than PID 1.

The mechanism operates at two levels:
1. `signal->is_child_subreaper`: set on the process that called prctl
2. `signal->has_child_subreaper`: set on all descendants to indicate a subreaper exists in the ancestor chain (optimization flag to avoid the ancestor walk for most processes)

After reparenting, the subreaper receives SIGCHLD when the orphan exits and can call `wait(2)` to reap it.

```c
// Minimal subreaper daemon (Node.js embedder pattern)
#include <sys/prctl.h>
#include <signal.h>
#include <wait.h>

int main(void) {
    // Mark this process as subreaper for all descendants
    if (prctl(PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0) == -1) {
        perror("prctl PR_SET_CHILD_SUBREAPER");
        return 1;
    }

    // Handle SIGCHLD to reap adopted orphans
    struct sigaction sa;
    sigemptyset(&sa.sa_mask);
    sa.sa_flags = SA_RESTART | SA_NOCLDSTOP;
    sa.sa_handler = reap_children; // calls waitpid(-1, NULL, WNOHANG)
    sigaction(SIGCHLD, &sa, NULL);

    // ... launch and manage child processes ...
    pause(); // wait for events
    return 0;
}

static void reap_children(int sig) {
    int saved_errno = errno;
    while (waitpid(-1, NULL, WNOHANG) > 0) {}
    errno = saved_errno;
}
```

#### Literature Evidence

Introduced in Linux 3.4 (commit 3b125a8, January 2012). The LWN article from the original patch submission describes the primary motivation: systemd's per-user instance and D-Bus activation needed to manage double-forking daemons that ordinarily escape to PID 1.

The patch shows a `ps` output comparison: before PR_SET_CHILD_SUBREAPER, double-forked daemons appear as direct children of PID 1 and systemd loses track of them. After the patch, they appear as children of the systemd user session manager, preserving the supervision tree.

The kernel documentation at `PR_SET_CHILD_SUBREAPER(2const)` specifies:
- The subreaper attribute is **not** inherited across `fork()` or `clone()`
- The attribute **is** preserved across `execve()`
- Orphans are reparented to the "nearest still living ancestor subreaper"

#### Implementations & Benchmarks

- **systemd**: Every systemd instance (system and user) calls `prctl(PR_SET_CHILD_SUBREAPER, 1)` at startup. This is documented in `src/core/main.c`.
- **tini**: The `-s` flag or `TINI_SUBREAPER` environment variable invokes `prctl(PR_SET_CHILD_SUBREAPER, 1)` when tini cannot run as PID 1.
- **D-Bus**: Uses subreaper for service activation.
- **containerd**: Uses subreaper mode when running outside a PID namespace.

#### Strengths & Limitations

**Strengths:**
- Captures all orphaned descendants regardless of depth (grandchildren, great-grandchildren)
- No per-child setup required; the subreaper registration is done once by the parent
- Works with double-forking daemons (which would otherwise escape to PID 1)
- No privilege required
- Preserved across execve

**Limitations:**
- **Linux only (3.4+)**: macOS does not have an equivalent. FreeBSD 9.3+ has a similar mechanism.
- **Only reparenting, not termination**: The subreaper receives orphans but must proactively kill them. It does not automatically terminate orphaned descendants.
- **Reaping obligation**: The subreaper must install a SIGCHLD handler and call waitpid in a loop, or zombies accumulate.
- **Subreaper attribute not inherited**: Each child process that should act as a sub-subreaper must independently call prctl.
- **has_child_subreaper flag propagation**: There was a known kernel bug where the `has_child_subreaper` flag was not propagated to processes created before the subreaper registration. This was partially addressed in later kernels.

---

### 4.3 Process Group Management (setpgid/killpg)

#### Theory & Mechanism

POSIX process groups provide the standard mechanism for delivering signals to a collection of related processes. When a shell runs a pipeline, it creates a process group for all pipeline members and can kill the entire pipeline with a single `killpg()` call.

```c
// Parent: create child in its own process group
pid_t pid = fork();
if (pid == 0) {
    setpgid(0, 0);   // child's PGID = child's PID
    execvp(argv[0], argv);
}
// Parent: race-safe version also calls:
setpgid(pid, pid);   // idempotent if child already changed its group

// ... later, to kill the child and all its same-group descendants:
killpg(pid, SIGTERM);
sleep(2);
killpg(pid, SIGKILL);
```

In Node.js, `spawn({ detached: true })` calls `setsid()` on Linux/macOS (not just `setpgid`), making the child both a new session leader and a new process group leader. This is stronger than `setpgid` alone.

```javascript
// Node.js: spawn child in its own process group
const child = spawn('node', ['worker.js'], {
  detached: true,  // calls setsid() on Unix
  stdio: 'ignore'
});
child.unref();  // removes child from parent's event loop ref count

// To kill the entire process group (note negative PID):
process.kill(-child.pid, 'SIGTERM');
```

The key difference between `child.kill('SIGTERM')` and `process.kill(-child.pid, 'SIGTERM')`:
- `child.kill()` sends the signal to the process with `child.pid`
- `process.kill(-child.pid, ...)` sends the signal to the process **group** with PGID equal to `child.pid`

#### Literature Evidence

POSIX.1-2017 §2.3 defines process group semantics. The `killpg()` function is specified in POSIX.1-2017 `sys/types.h` and `signal.h`. `setpgid()` restrictions include: a process cannot change its group after it has called `exec` while being the session leader, and a process cannot change the group of a child process after that child has called `exec`.

The Node.js documentation explicitly warns: "Child processes of child processes are not terminated when killing their parent" via `child.kill()`, and recommends using negative PID targeting for group kills.

#### Implementations & Benchmarks

Shell implementations (bash, zsh) universally use setpgid to give each pipeline its own process group. The terminal driver uses the foreground process group to direct Ctrl-C (SIGINT) and Ctrl-Z (SIGTSTP) to the right set of processes.

The `pgroup` utility on GitHub (ha7ilm/pgroup) wraps any command to ensure all its descendants are in a process group that is killed on exit.

#### Strengths & Limitations

**Strengths:**
- POSIX-portable (Linux, macOS, BSD, Solaris)
- No privilege required
- Kills entire groups atomically from the parent's perspective (though the kernel delivers signals sequentially, so there is a window where some processes have received the signal and others have not)

**Limitations:**
- **Does not cross group boundaries**: If a child spawns grandchildren with `setpgid(0,0)`, those grandchildren are in their own group and are not affected by `killpg(child_pgid, sig)`.
- **No automatic cleanup on SIGKILL**: If the parent is killed with SIGKILL, it cannot call `killpg`. The group members survive unless another mechanism is in place.
- **Race on group membership changes**: Between `fork()` and `setpgid()`, the child is temporarily in the parent's group. If the parent calls `killpg` in this window, it may also signal the child before it has moved to its own group.
- **setsid restrictions**: A process group leader cannot call `setsid()`. The double-fork pattern exists specifically to work around this.

---

### 4.4 Pipe-Based Parent Death Detection

#### Theory & Mechanism

The pipe EOF idiom is the most portable mechanism for detecting parent death, including death by SIGKILL. The invariant is: the read end of a pipe receives EOF when all write ends are closed. Since file descriptors are closed automatically when a process exits (for any reason, including SIGKILL), a child holding the read end of a pipe whose write end is exclusively held by the parent will receive EOF exactly when the parent exits.

```
Setup:

Parent                     Child
  |                          |
  | fork()                   |
  |──────────────────────────|
  |                          |
  | pipe[1] (write end)      | pipe[0] (read end)
  | holds open               | reads (blocks until EOF)
  |                          | EOF detected → self-exit
```

Implementation:

```c
// C implementation
int pipefd[2];
pipe(pipefd);

pid_t pid = fork();
if (pid == 0) {
    // Child: close write end, read from read end
    close(pipefd[1]);
    // Set read end close-on-exec so it's not inherited by grandchildren
    fcntl(pipefd[0], F_SETFD, FD_CLOEXEC);

    // Background thread or select() watching for EOF
    char buf[1];
    read(pipefd[0], buf, 1);  // blocks until parent exits
    // Parent is dead — exit self
    kill(0, SIGKILL);  // kill our process group
    _exit(0);
} else {
    // Parent: close read end
    close(pipefd[0]);
    // Parent keeps pipefd[1] open; when parent exits, it closes automatically
    // ...
}
```

In Node.js, this pattern maps to passing a custom file descriptor in the `stdio` array:

```javascript
// Node.js pipe-based parent death detection
const { spawn } = require('node:child_process');
const net = require('node:net');

// Create a socket pair (or use a pipe fd)
// Pass read end to child as fd 3
const child = spawn('node', ['worker.js'], {
  detached: false,  // Keep in same group for easier management
  stdio: ['ignore', 'ignore', 'ignore', 'pipe']  // fd 3 = pipe
});

// Parent holds the write end of fd 3 implicitly via the 'pipe' stdio
// When parent exits, fd 3 closes, child's read(fd3) returns 0 (EOF)
```

The worker process monitors fd 3:

```javascript
// worker.js
const fs = require('node:fs');
const parentPipe = fs.createReadStream(null, { fd: 3 });
parentPipe.on('end', () => {
  console.error('Parent gone, exiting');
  process.exit(0);
});
parentPipe.on('error', () => {
  process.exit(0);
});
parentPipe.resume();
```

#### Literature Evidence

The pipe-EOF idiom is documented in the Linux Programming Interface (Kerrisk, 2010) and referenced in multiple StackOverflow and POSIX discussions as the most reliable cross-platform approach. It appears in POSIX discussions from as early as 1991 (comp.unix.wizards archives).

Key correctness property: POSIX guarantees that all file descriptors are closed on process exit, including abnormal exits from SIGKILL. The kernel's `do_exit()` calls `close_files()` unconditionally before any cleanup that could be skipped.

#### Implementations & Benchmarks

- **PostgreSQL**: Uses a postmaster death watcher via a pipe to ensure backend processes die when the postmaster exits.
- **SSH**: Uses a similar mechanism for ControlMaster connections.
- **Most job management systems** include some form of this pattern.

There is a small constant overhead: one pipe per child process, two file descriptors, and a blocked read in a monitoring thread or an additional epoll entry.

#### Strengths & Limitations

**Strengths:**
- Works on any POSIX system (Linux, macOS, BSD, Solaris)
- SIGKILL-safe: file descriptors are always closed on exit
- No threading hazards (unlike PR_SET_PDEATHSIG)
- No privilege required
- Can be combined with other monitoring (epoll/select alongside other fds)

**Limitations:**
- **Requires child cooperation**: The child must be written to monitor the pipe. Cannot retroactively add this to arbitrary child programs.
- **Propagation requires forwarding**: If the child spawns grandchildren, it must forward the mechanism explicitly. Using `FD_CLOEXEC` on the pipe read end prevents accidental inheritance but also means grandchildren do not benefit.
- **Notification is asynchronous**: There is a window between SIGKILL delivery to the parent and EOF delivery to the child (though in practice this window is measured in microseconds).
- **Single-use**: Once EOF is received, the mechanism is exhausted. If the child survives and respawns, a new pipe must be established.

---

### 4.5 cgroup v2 Process Containment

#### Theory & Mechanism

Control groups (cgroups) are a Linux kernel facility for organizing processes into hierarchical groups and applying resource constraints. Cgroup v2 (the unified hierarchy), enabled by default in kernels 4.5+ and required by systemd since v243, provides a mechanism for atomically terminating all processes in a cgroup tree.

The `cgroup.kill` file (introduced in Linux 5.14, commit 14a7d7db) accepts a write of `"1"` to send SIGKILL to every process in the cgroup and all descendant cgroups:

```bash
# Create a cgroup for background workers
mkdir /sys/fs/cgroup/myapp-workers

# Assign background worker process
echo $WORKER_PID > /sys/fs/cgroup/myapp-workers/cgroup.procs

# Later: atomically kill all workers (handles concurrent forks)
echo 1 > /sys/fs/cgroup/myapp-workers/cgroup.kill
```

Before `cgroup.kill`, the standard approach was freeze-then-kill:

```bash
# Legacy approach: freeze, kill, unfreeze (has race conditions)
echo 1 > /sys/fs/cgroup/myapp-workers/cgroup.freeze
# Wait for frozen state
while ! grep -q "frozen 1" /sys/fs/cgroup/myapp-workers/cgroup.events; do
    sleep 0.01
done
# Kill all processes
cat /sys/fs/cgroup/myapp-workers/cgroup.procs | xargs kill -9
echo 0 > /sys/fs/cgroup/myapp-workers/cgroup.freeze
```

The freeze-then-kill approach has a documented deadlock risk in runc: if a process inside the cgroup has itself frozen a sub-cgroup, the unfreeze cannot proceed because the frozen process cannot execute, creating a deadlock.

`cgroup.kill` avoids this by being a single atomic kernel operation that handles concurrent forks and migrations.

#### Literature Evidence

LWN article "A kill button for control groups" (August 2021) describes the motivation: "Writing '1' to this file causes all processes in that cgroup to be killed with SIGKILL." The critical design property is that it "deals with concurrent forks appropriately and is protected against migrations."

The runc issue tracker (opencontainers/runc#3135) documents the transition from freeze-kill to `cgroup.kill` in container runtimes.

Container lifecycle on `cgroup.kill`:
```
Container exit sequence (runc with cgroupv2):
1. containerd signals runc to stop container
2. runc sends SIGTERM to container's init process (PID 1 in namespace)
3. If timeout exceeded: echo 1 > cgroup.kill (atomically kills everything)
4. runc waits for cgroup.events populated=0
5. runc removes cgroup directory
```

#### Implementations & Benchmarks

- **runc** (opencontainers/runc): Uses `cgroup.kill` for container stop when cgroupv2 is available and kernel >= 5.14
- **systemd**: Uses cgroup-per-service; `systemctl stop` first sends SIGTERM, then after `TimeoutStopSec`, writes to `cgroup.kill`
- **Kubernetes**: Pod termination uses the cgroup of the pod's sandbox to ensure all containers' processes are killed

Performance characteristics: `cgroup.kill` is a synchronous kernel operation. The signal delivery is asynchronous (processes must be scheduled to handle it), but the instruction is atomic—all processes that exist at write time are marked for SIGKILL delivery.

#### Strengths & Limitations

**Strengths:**
- **Strongest atomicity guarantee**: handles racy forkers (processes forking between the kill decision and its execution)
- **Depth-unlimited**: kills entire process subtrees regardless of process group or session structure
- **No per-process setup**: any process in the cgroup is covered automatically
- **Migration-safe**: processes that move between sub-cgroups during kill are still covered

**Limitations:**
- **Linux 5.14+ required** for `cgroup.kill`; older kernels need the freeze-kill approach
- **Privilege required**: writing to `cgroup.procs` requires privilege or cgroup delegation. Rootless containers (e.g., Podman rootless) require user namespace + cgroup v2 delegation.
- **Kernel threads are not killed**: processes of type `PF_KTHREAD` survive a `cgroup.kill` write
- **Setup overhead**: creating and managing cgroups requires process spawning infrastructure (cgroupfs mounting, directory creation)
- **Linux only**: macOS has no equivalent

---

### 4.6 pidfd (Linux Process File Descriptors)

#### Theory & Mechanism

`pidfd_open(2)` (Linux 5.3+) creates a file descriptor that refers to a process by PID. Unlike storing a raw PID, a pidfd is immune to PID reuse races: the file descriptor refers to the specific process instance, not just its numeric identifier. If the process exits and a new process gets the same PID, the pidfd still refers to the original (now-dead) process.

```c
// Monitor a process for exit using epoll + pidfd
int pidfd = pidfd_open(target_pid, 0);
if (pidfd == -1) {
    perror("pidfd_open");
    return -1;
}

int epollfd = epoll_create1(EPOLL_CLOEXEC);
struct epoll_event ev = {
    .events = EPOLLIN,
    .data.fd = pidfd
};
epoll_ctl(epollfd, EPOLL_CTL_ADD, pidfd, &ev);

// Block until process exits
struct epoll_event events[1];
epoll_wait(epollfd, events, 1, -1);
// Process has exited

// If pidfd refers to a child process, retrieve exit status:
siginfo_t info;
waitid(P_PIDFD, pidfd, &info, WEXITED | WNOHANG);
printf("Exit code: %d\n", info.si_status);

close(pidfd);
```

For process creation with a pidfd (avoiding the open-then-created race):

```c
// clone3 with CLONE_PIDFD (Linux 5.2+)
struct clone_args cl_args = {
    .flags = CLONE_PIDFD,
    .pidfd = (uint64_t)&pidfd,  // kernel writes pidfd here
    .exit_signal = SIGCHLD,
};
pid_t pid = syscall(SYS_clone3, &cl_args, sizeof(cl_args));
```

Pidfds move through three states visible to epoll:

| State | Polls readable | Notes |
|---|---|---|
| Alive | No | epoll returns nothing |
| Zombie | Yes (EPOLLIN) | Exited but not yet waited on |
| Dead | Yes (EPOLLHUP) | After wait has been called |

#### Literature Evidence

LWN series by Brauner and Hartman (2019–2020): "Toward race-free process signaling", "Completing the pidfd API", "Adding the pidfd abstraction to the kernel". The pidfs filesystem (Linux 6.9) exposes pidfds as real filesystem paths, enabling statx() comparisons and additional introspection.

The Go standard library added native pidfd support in `os/pidfd_linux.go` (Go 1.23), using `CLONE_PIDFD` when available.

#### Implementations & Benchmarks

- **Go runtime** (1.23+): Uses `CLONE_PIDFD` for subprocess creation to get a race-free handle
- **systemd**: Uses pidfds to track service processes without PID reuse races
- **containerd**: Transitioning to pidfds for container process monitoring

No published latency benchmarks for pidfd vs. traditional PID tracking, but the design goal is elimination of TOCTOU (time-of-check-time-of-use) races rather than throughput improvement.

#### Strengths & Limitations

**Strengths:**
- Race-free: no PID reuse hazard
- Integrates with standard epoll/select/poll event loops
- Available to non-root processes
- Can send signals via `pidfd_send_signal()` with the same race safety

**Limitations:**
- **Linux 5.3+ required** (pidfd_open); 5.2 required for CLONE_PIDFD
- **Monitor only**: pidfds do not kill processes or establish parent-death notification. They are a monitoring primitive, not a lifecycle enforcement primitive.
- **No macOS equivalent**: The macOS kqueue EVFILT_PROC serves a similar monitoring role
- **Cannot reference individual threads**: only thread-group leaders

---

### 4.7 macOS: kqueue EVFILT_PROC

#### Theory & Mechanism

macOS (and FreeBSD, OpenBSD, NetBSD) provide kqueue as a general event notification interface. The `EVFILT_PROC` filter monitors process state changes, including exit (`NOTE_EXIT`), fork (`NOTE_FORK`), exec (`NOTE_EXEC`), and signal (`NOTE_SIGNAL`).

```c
// macOS: monitor a PID for exit
int kq = kqueue();

struct kevent ke;
EV_SET(&ke, target_pid, EVFILT_PROC,
       EV_ADD | EV_ENABLE | EV_ONESHOT,
       NOTE_EXIT,
       0, NULL);
kevent(kq, &ke, 1, NULL, 0, NULL);  // register event

// Wait for process exit
struct kevent event;
kevent(kq, NULL, 0, &event, 1, NULL);  // blocking wait
// event.data contains the exit status (WIFEXITED-compatible)
int exit_status = (int)event.data;
```

For a child process to monitor when its parent exits:

```c
// Child monitors parent PID
pid_t parent_pid = getppid();
int kq = kqueue();
struct kevent ke;
EV_SET(&ke, parent_pid, EVFILT_PROC, EV_ADD, NOTE_EXIT, 0, NULL);
kevent(kq, &ke, 1, NULL, 0, NULL);

// Watch in a background thread
struct kevent event;
kevent(kq, NULL, 0, &event, 1, NULL);
// Parent exited — take cleanup action
kill(0, SIGKILL);  // kill our process group
```

**launchd** uses this mechanism internally: the macOS init system registers EVFILT_PROC with NOTE_EXIT for every managed process, receiving an event when any managed process exits. This allows instant cleanup without polling.

#### Literature Evidence

The Apple Developer Library `kqueue(2)` man page and the FreeBSD kqueue tutorial (wiki.netbsd.org/tutorials/kqueue_tutorial) document EVFILT_PROC semantics. The kqueue interface was first introduced in FreeBSD 4.1 (2000) by Jonathan Lemon, predating the Linux epoll API.

The exit status behavior: for EVFILT_PROC with NOTE_EXIT, `event.data` contains the wait-compatible exit status (can be checked with WIFEXITED, WIFSIGNALED, WEXITSTATUS macros).

#### Implementations & Benchmarks

- **launchd**: All process tracking; no polling is used. The launchd source (opensource.apple.com) shows EV_ADD with NOTE_EXIT for every spawned process.
- **Node.js libuv** (macOS): Uses kqueue internally for I/O event loop; process monitoring uses a combination of EVFILT_PROC and SIGCHLD.
- **Chromium** (macOS): Uses a Mach-level equivalent for process monitoring.

#### Strengths & Limitations

**Strengths:**
- Native macOS/BSD interface; no polling required
- Can monitor arbitrary PIDs (not just children), given appropriate permissions
- Delivers the exit status in the event data
- Integrates naturally with run loops and event-driven architectures

**Limitations:**
- **macOS/BSD only**: No equivalent on Linux (use pidfd + epoll instead)
- **Requires the monitored process to still exist at registration time**: If the parent exits before `kevent()` registers, the event is missed
- **Only one EVFILT_PROC per pid per kqueue**: Multiple monitors for the same PID require multiple kqueues
- **Cannot enforce lifecycle**: Like pidfd, this is a monitoring primitive, not enforcement

---

### 4.8 Node.js child_process Deep Dive

#### Theory & Mechanism

Node.js `child_process.spawn()` wraps libuv's `uv_spawn()`. On Unix, libuv calls `fork()` and then `exec()` (or directly calls the child setup code). The relationship between `detached`, `stdio`, and `unref()` is the key to understanding Node.js orphan creation.

**`detached: true`**: On Unix, calls `setsid()` in the child before exec. This makes the child a new session leader and new process group leader. Effect: the child is completely detached from the parent's terminal and process group. On Windows, the child gets its own console window.

**`stdio: 'ignore'`**: Opens `/dev/null` for stdin, stdout, and stderr. Critical for detached background processes: without this, the child inherits the parent's stdio file descriptors, and those descriptors hold references that prevent stdio from closing, which prevents the parent from exiting cleanly (and also means the child's stdio blocks on the parent's terminal).

**`child.unref()`**: Calls `uv_unref()` on the child's handle in libuv's event loop. This removes the child from the event loop's active reference count, allowing the parent to exit even while the child is still running. Without `unref()`, Node's event loop keeps running to wait for the child's SIGCHLD.

The canonical detached background pattern:

```javascript
const { spawn } = require('node:child_process');

const child = spawn('node', ['background-worker.js'], {
  detached: true,
  stdio: ['ignore', 'ignore', 'ignore'],
  // No IPC channel — IPC would re-add a reference even after unref()
});
child.unref();
// Parent can now exit; child continues independently
```

**`exit` vs `close` event ordering**:

```
Timeline after child exits:

[Child process exits]
     │
     ▼
[SIGCHLD received by parent event loop]
     │
     ▼
['exit' event emitted]  ← exit code and signal available
     │
     ▼ (async: stdio streams drain and close)
     │
     ▼
['close' event emitted] ← all stdio streams are closed
```

If `stdio: 'pipe'`, there can be a measurable delay between `exit` and `close` while buffered data in the pipe is consumed. If `stdio: 'ignore'`, both events fire in rapid succession.

**AbortController / `signal` option**:

```javascript
const controller = new AbortController();

const child = spawn('long-running-task', [], {
  signal: controller.signal  // Abort signal
});

child.on('error', (err) => {
  if (err.name === 'AbortError') {
    console.log('Process was aborted');
  }
});

// Cancel the process
controller.abort();
// Equivalent to child.kill() — sends SIGTERM
```

**`child.kill(signal)`**: Sends `signal` to `child.pid`. Does not signal the child's process group. For group-level signaling from Node.js:

```javascript
// Kill entire process group
process.kill(-child.pid, 'SIGTERM');
// Note: This only works if child was spawned with detached: true
// (otherwise child.pid is not a group leader, and the group
//  may include the parent itself)
```

#### Literature Evidence

Node.js issue #46569 (Unrefed child_process inside a worker thread becomes a zombie) documents a design-level limitation: when a child process is spawned inside a Worker thread and `unref()` is called, the child becomes a zombie when the Worker exits. The root cause (per Node.js core contributor Ben Noordhuis): "Node closes libuv's `uv_process_t` handles when the thread exits, meaning libuv won't reap the child processes when they exit." This creates zombie accumulation in long-running processes that spawn many worker threads.

Node.js issue #5614 documents that on Windows, `detached: true` + `unref()` does not always work correctly.

Node.js issue #60077 (October 2025) documents that `exec()` and `execFile()` do not allow setting stdin to `'ignore'`, causing hangs with commands like `rg` that block on stdin when it remains open.

#### Implementations & Benchmarks

The Node.js documentation is the primary reference. The libuv source (`src/unix/process.c`) shows the exact fork/exec implementation.

Practical measurements: spawning a detached process with `stdio: 'ignore'` + `unref()` adds approximately 1–5 ms on a typical system (fork overhead). There is no measurable overhead from `unref()` itself.

#### Strengths & Limitations

**Strengths:**
- `detached: true` + `stdio: 'ignore'` + `unref()` is well-supported and reliable for intentional background processes
- `signal` option with AbortController integrates naturally with modern async JavaScript patterns
- The `exit`/`close` event distinction handles edge cases around stdio flushing

**Limitations:**
- **No built-in parent-death notification for detached processes**: once `unref()` is called, the parent has no mechanism to notify the child when the parent exits
- **Worker thread zombie bug (#46569)**: unrefed processes spawned in worker threads become zombies, requiring the main process to handle reaping
- **stdin hang risk**: commands that read from stdin will block indefinitely if stdin is inherited (not `'ignore'`) and the parent exits without closing its stdin end
- **`child.kill()` does not kill the process group**: grandchild processes (spawned by the child) are not killed
- **`detached: true` on macOS calls `setsid()`**, making the child a session leader. Subsequent `kill(-child.pid, sig)` works because the child's PGID equals its PID, but the child can never change its process group or create a new session.

---

### 4.9 Container and Sandbox Approaches

#### Theory & Mechanism

Container runtimes exploit PID namespaces to enforce lifecycle bounds. When a PID namespace is created with `CLONE_NEWPID`, the first process in the namespace gets PID 1. This has two important properties:

1. When the PID-1 process in the namespace exits, the kernel sends SIGKILL to all other processes in the namespace. This is enforced by the kernel's namespace cleanup code, not by a signal handler.

2. PID 1 within its namespace has the same special signal-handling semantics as global PID 1: signals with default disposition SIG_DFL and no installed handler are **silently dropped** rather than delivered. This is why `tini` and `dumb-init` exist—they provide a minimal PID 1 that forwards signals to the actual application.

```
Container process hierarchy:

[Container]
  PID 1: tini (or dumb-init)
    │
    └─ PID 2: application
         │
         ├─ PID 3: worker
         └─ PID 4: logger

When `docker stop`:
1. Docker sends SIGTERM to PID 1 (tini)
2. tini forwards SIGTERM to PID 2 (application)
3. tini waits for PID 2 to exit
4. tini calls waitpid(-1, WNOHANG) loop to reap any remaining zombies
5. tini exits with child's exit code
6. Kernel sees PID 1 exit → sends SIGKILL to all remaining PIDs in namespace
7. Namespace is destroyed
```

**tini** behavior:
- Installs signal handlers for all signals except SIGKILL and SIGSTOP
- Forwards received signals to the child process
- Calls `waitpid(-1, WNOHANG)` in SIGCHLD handler to reap zombies
- Optionally runs as subreaper (`-s` flag): `prctl(PR_SET_CHILD_SUBREAPER, 1)`
- Exits with child's exit code, causing the namespace to clean up

**dumb-init** behavior:
- Sends signals to the child's process group (`kill(-child_pgid, sig)`) rather than just the child, ensuring grandchildren receive signals too
- Reaps zombies via SIGCHLD handler

**bubblewrap** `--die-with-parent`:
- Calls `prctl(PR_SET_PDEATHSIG, SIGKILL)` on itself
- Creates its own PID namespace (if `--pid`)
- Acts as PID 1 in the sandbox, providing trivial zombie reaping

The Chromium zygote uses a layered PID namespace approach:

```
Browser process
  └─ Zygote parent (in new PID namespace)
       │  (acts as PID 1, only reaps children)
       └─ Zygote worker (forks renderer processes)
            └─ Renderer 1 (sandboxed)
            └─ Renderer 2 (sandboxed)
```

The outer zygote parent "does nothing but sit and wait for the child (the actual zygote that does all the forking) to die; it doesn't handle anything else, including termination of renderers." This is a deliberate design: the PID namespace PID 1 is responsible only for reaping, not for process management.

#### Literature Evidence

Docker's `--init` flag documentation, tini README (krallin/tini), and dumb-init engineering blog (Yelp Engineering, January 2016). The Yelp blog post "Introducing dumb-init, an init system for Docker containers" provides the clearest explanation of the PID 1 signal-handling problem.

The Chromium zygote documentation (chromium.googlesource.com) describes the two-layer architecture and the security rationale (address space randomization isolation between browser and renderer).

#### Implementations & Benchmarks

- **tini** binary size: ~25 KB stripped
- **dumb-init** binary size: ~20 KB stripped
- Both add negligible overhead to process startup (a few milliseconds)
- Docker's built-in `--init` flag uses tini

#### Strengths & Limitations

**Strengths:**
- PID namespace approach provides the strongest guarantee: kernel-enforced lifecycle bounds
- Works for all processes in the namespace, including those spawned by third-party code that doesn't cooperate
- tini/dumb-init solve the PID 1 signal-handling problem without requiring application changes
- cgroup + PID namespace combination (container model) provides both resource limiting and lifecycle enforcement

**Limitations:**
- **Container model requires privilege** (CAP_SYS_ADMIN or user namespaces) to create PID namespaces
- **PID namespace isolation is bidirectional**: processes inside cannot see (or signal) processes outside
- **PID 1 signal-handling subtlety**: forgetting to use tini/dumb-init causes SIGTERM to be silently dropped if the application doesn't install a handler
- **Overhead**: Container namespace creation adds 10–100 ms to startup time
- **Not applicable to lightweight background tasks**: creating a full PID namespace for a background indexing process is disproportionate

---

### 4.10 The Double-Fork Daemon Pattern

#### Theory & Mechanism

The double-fork pattern is the traditional Unix method for creating a fully detached background process. Its purpose is to produce a grandchild that is:
1. Not a session leader (cannot accidentally acquire a controlling terminal)
2. Adopted by init (not by the grandparent)
3. Disconnected from any controlling terminal

```c
// Double-fork daemon implementation
void daemonize(void) {
    // First fork: ensure we're not a process group leader
    pid_t pid = fork();
    if (pid < 0) { perror("fork 1"); exit(1); }
    if (pid > 0) { exit(0); }  // Parent exits

    // Child A: create new session (setsid requires non-group-leader)
    if (setsid() == -1) { perror("setsid"); exit(1); }
    // Child A is now session leader of a new session with no terminal

    // Second fork: ensure we're not a session leader
    // (session leaders can acquire a controlling terminal on open())
    pid = fork();
    if (pid < 0) { perror("fork 2"); exit(1); }
    if (pid > 0) { exit(0); }  // Child A exits

    // Grandchild B: not a session leader, not a group leader
    // Cannot acquire a controlling terminal
    // Will be adopted by init when Child A exits

    // Standard daemon setup:
    chdir("/");              // release any directory handles
    umask(0);                // clear inherited umask
    // Close all inherited fds and reopen /dev/null
    for (int fd = 0; fd < sysconf(_SC_OPEN_MAX); fd++) close(fd);
    open("/dev/null", O_RDONLY);  // fd 0 (stdin)
    open("/dev/null", O_WRONLY);  // fd 1 (stdout)
    open("/dev/null", O_WRONLY);  // fd 2 (stderr)
}
```

The key structural properties:
- `setsid()` fails if the caller is a process group leader (PID == PGID). The first fork guarantees success by creating a child whose PID differs from the grandparent's PGID.
- After `setsid()`, Child A is a session leader with POSIX permission to open a controlling terminal. The second fork creates Grandchild B, a non-leader, which cannot acquire a terminal under POSIX.1-2008 §9.3.1.

#### Literature Evidence

Documented in APUE (Advanced Programming in the Unix Environment, Stevens & Rago, 3rd ed., §13.3), the GNU C Library manual §28.7, and numerous OS textbooks. The `daemon(3)` library function on Linux does not use the double-fork pattern (as documented in its man page): "Note: The GNU C library implementation of daemon() does not employ the double-fork technique that is necessary to ensure that the resulting daemon process is not a session leader."

POSIX.1-2017 §11.1.3 specifies the conditions under which a process acquires a controlling terminal: "If the process is a session leader and does not have a controlling terminal, the open of a terminal that is not already the controlling terminal for some session shall cause the terminal to become the controlling terminal for the session."

#### Implementations & Benchmarks

The Python `Daemon` context manager (PEP 3143), Apache httpd, nginx, and most traditional Unix daemons use the double-fork pattern. Modern init systems (systemd) document that they can manage single-fork daemons and prefer the "new-style daemon" pattern where the process stays in the foreground.

#### Strengths & Limitations

**Strengths:**
- Completely portable; works on all POSIX systems
- Produces a process that is immune to SIGHUP from terminal disconnection
- The grandchild is guaranteed to be adopted by init

**Limitations:**
- **Actively creates orphans**: the entire purpose is to escape the supervision tree. This is the opposite of orphan prevention.
- **Modern init systems prefer Type=forking or Type=simple**: systemd can track daemon processes using cgroups, making double-fork unnecessary
- **Debugging is harder**: detached daemons require explicit log files; stderr output is lost

---

## 5. Comparative Synthesis

### 5.1 Trade-off Matrix

| Mechanism | SIGKILL-safe | Depth | Portability | Privilege | Setup Complexity | Auto-cleanup | Precision |
|---|---|---|---|---|---|---|---|
| PR_SET_PDEATHSIG | Yes* | Direct child only | Linux only | None | Low (one prctl) | Yes (kills child) | Thread-level (hazardous) |
| PR_SET_CHILD_SUBREAPER | Yes† | All descendants | Linux 3.4+ | None | Medium (SIGCHLD handler) | No (must kill manually) | Process-level |
| Pipe EOF (parent writes) | Yes | Direct child | POSIX | None | Low-Medium | No (child must self-exit) | Process-level |
| kqueue EVFILT_PROC | Yes | Any monitored PID | macOS/BSD | None | Medium | No (monitor calls action) | Process-level |
| pidfd + epoll | N/A (monitor) | Direct target | Linux 5.3+ | None | Medium | No (monitor only) | Process-level, race-free |
| setpgid + killpg | No | Same process group | POSIX | None | Low | No (requires explicit kill) | Group-level |
| cgroup.kill | Yes | All in cgroup | Linux 5.14+ | cgroup write | High | Yes (atomically kills all) | Cgroup-level |
| PID namespace (container) | Yes | All in namespace | Linux | CAP_SYS_ADMIN | High | Yes (kernel-enforced) | Namespace-level |
| tini/dumb-init | Yes | All in container | Linux (container) | PID 1 in namespace | Low (add to image) | Yes (via PID namespace exit) | Container-level |
| PID file + flock | No | Any polled PID | POSIX | None | Medium | No (stale detection only) | Point-in-time |

\* SIGKILL-safe in the sense that it is triggered by parent thread exit regardless of cause; hazardous due to thread-level tracking in multithreaded runtimes.

† Subreaper receives orphans but does not automatically kill them; it must proactively kill them or allow them to run to completion.

### 5.2 Decision Dimensions

**When SIGKILL resistance is the primary concern**:
The pipe-EOF idiom and cgroup.kill are the most reliable. Pipe-EOF works at the child cooperation level; cgroup.kill works without child cooperation. PR_SET_PDEATHSIG provides resistance but with threading caveats.

**When portability (Linux + macOS) is required**:
Pipe-EOF is the only truly portable mechanism. kqueue EVFILT_PROC covers macOS; pidfd covers Linux. No kernel-level enforcement mechanism is portable across both.

**When third-party child processes cannot be modified**:
cgroup.kill (Linux 5.14+) or PID namespace destruction are the only options. These require privilege but provide coverage for unmodified children.

**When process depth (grandchildren) matters**:
cgroup.kill, PID namespace, and PR_SET_CHILD_SUBREAPER cover descendants at arbitrary depth. Process group signals (killpg) cover only same-group descendants. Pipe-EOF covers only direct children unless explicitly forwarded.

**In Node.js specifically**:
- For intentional long-lived background work: `detached: true` + `stdio: 'ignore'` + `unref()` is correct, but creates an orphan by design
- For supervised background work: avoid `unref()`, use `AbortController` for cancellation
- For worker thread spawned processes: be aware of the zombie bug (#46569); either move spawning to the main thread or implement explicit reaping
- For parent-death notification to background process: use the pipe-fd-in-stdio trick (pass a custom fd)

### 5.3 Failure Mode Analysis

```
Failure mode: parent receives SIGKILL
─────────────────────────────────────
                    ┌─ PR_SET_PDEATHSIG set? ──YES──► child receives signal
                    │                               (if parent THREAD dies,
                    │                                not just parent process)
parent dies ────────┤
(SIGKILL)          │
                    └─ NO
                         │
                         ├─ cgroup.kill triggered externally? ──YES──► all in cgroup die
                         │
                         ├─ Pipe write-end held by parent? ──YES──► child reads EOF → can exit
                         │
                         ├─ PID namespace? ──YES──► kernel kills all on PID1 exit
                         │
                         └─ NO ──► children become orphans (adopted by init/subreaper)
                                   ● child.pgid can still be killed by monitoring process
                                   ● subreaper can kill adopted children
                                   ● otherwise: children run until natural exit
```

---

## 6. Open Problems & Gaps

### 6.1 No Portable SIGKILL-Resistant Mechanism

The fundamental gap: there is no mechanism that is simultaneously:
- SIGKILL-resistant (works even if parent is force-killed)
- Cross-platform (Linux and macOS)
- Privilege-free
- Requires no child cooperation

The pipe-EOF idiom comes closest but requires child cooperation. kqueue + pipe together can cover both platforms but the enforcement (actually killing the child) still requires child cooperation.

### 6.2 PR_SET_PDEATHSIG Thread Hazard in Modern Runtimes

The thread-level tracking of PR_SET_PDEATHSIG is a documented source of production bugs in runtimes with thread pools (Go, Tokio, Node.js with worker threads). There is no kernel-level alternative that tracks parent process exit instead of parent thread exit. The closest workaround—calling `fork()` from a dedicated, long-lived thread—is not practical in general-purpose libraries. This is an open problem with no clean solution at the OS API level.

### 6.3 Node.js Worker Thread + Unrefed Child Zombie Bug

Node.js issue #46569 (filed February 2023) remains unresolved as of early 2026. The design tension is: the worker thread's libuv event loop is destroyed when the thread exits, taking the `uv_process_t` handle with it, but the child process is still running. There is no mechanism in libuv to "transfer" ownership of a process handle to another event loop. A systemic fix would require either (a) a global process reaper in Node.js, or (b) requiring callers to move process handles to the main loop before the worker exits.

### 6.4 macOS Lack of PR_SET_CHILD_SUBREAPER Equivalent

macOS has launchd as a system-level process supervisor, but there is no API equivalent to PR_SET_CHILD_SUBREAPER that allows an application-level process to designate itself as a subreaper. The closest available mechanism is kqueue EVFILT_PROC for monitoring, but it does not intercept the reparenting of orphans to launchd. This is a portability gap for applications that need subreaper semantics on macOS.

### 6.5 cgroup.kill Availability Gap

As of 2026, many production Linux deployments still run kernels below 5.14. Distributions like RHEL 8 (kernel 4.18), Ubuntu 20.04 (kernel 5.4), and embedded Linux systems frequently lack `cgroup.kill`. The freeze-kill workaround is the only option on these systems, with its documented deadlock risks. Migration timelines for enterprise distributions suggest this gap will persist through at least 2027.

### 6.6 Race Between Process Creation and Monitoring

When using `pidfd_open()` with an existing PID (not `CLONE_PIDFD`), there is a window between the process exiting and the pidfd being opened. If the process exits before `pidfd_open()` runs, the call fails with ESRCH. `CLONE_PIDFD` closes this race for newly spawned processes but cannot be used to monitor pre-existing processes. This is an inherent limitation of the design.

### 6.7 Signal Delivery to Frozen cgroup Members

A process in a frozen cgroup state (cgroup.freeze=1) can receive SIGKILL from the `cgroup.kill` interface. However, signals sent via `kill(2)` or `killpg(2)` are queued but not delivered until the cgroup is unfrozen. This distinction is only documented informally and causes subtle behavior differences between the freeze-kill and cgroup.kill approaches in container runtimes.

### 6.8 Compound Agent Specific Gap

The compound-agent project spawns embedding indexers with `detached: true` + `stdio: 'ignore'` + `unref()`. These indexers become true orphans after the CLI exits. There is no mechanism currently in place to notify them when the CLI is force-killed (which happens under memory pressure during agent sessions). A combination of pipe-EOF (for notification) and process group membership (for group-level cleanup) could address this, but neither is currently implemented. The stdin-hang variant (issue #60077) is a separate but related problem: if stdin is not `'ignore'`, indexers may block on stdin indefinitely.

---

## 7. Conclusion

Unix process lifecycle management is built on a foundation of parent-child relationships, process groups, and sessions—a design that works well for interactive job control but has structural gaps when processes need to survive their parent (intentionally or not) and when parents can be force-killed.

The survey identifies ten distinct mechanisms with fundamentally different trade-offs. No single mechanism dominates across all dimensions. The cgroup.kill interface (Linux 5.14+) provides the strongest atomicity and depth guarantees but is Linux-specific and requires privilege. The pipe-EOF idiom provides the broadest portability and SIGKILL resistance but requires child cooperation and has no depth propagation. PR_SET_PDEATHSIG is elegant in concept but carries thread-level tracking hazards that make it dangerous in modern asynchronous runtimes. PR_SET_CHILD_SUBREAPER is the right tool for service managers but provides reparenting without automatic cleanup.

The container model—PID namespace + tini/dumb-init—provides the most comprehensive lifecycle enforcement by leveraging kernel-level namespace destruction, but at the cost of privilege requirements and isolation overhead that make it disproportionate for lightweight background processes.

For Node.js applications specifically, the most impactful gap is the absence of a parent-death notification mechanism for `detached: true` + `unref()` processes. The closest portable solution is the pipe-EOF idiom extended with a custom fd in the stdio array, combined with process group-level cleanup on the monitoring side. The worker thread zombie issue (#46569) remains an unresolved design-level problem requiring either systemic Node.js changes or careful architecture (spawning from the main thread only).

The landscape is actively evolving: pidfds (Linux 5.2+), cgroup.kill (Linux 5.14+), and pidfs (Linux 6.9+) represent continued kernel investment in process lifecycle management. The persistent gap is macOS portability—without an equivalent to PR_SET_CHILD_SUBREAPER or cgroup.kill, cross-platform applications must rely on the pipe-EOF idiom or accept that orphan prevention is best-effort on macOS.

---

## References

1. **POSIX.1-2017 (IEEE Std 1003.1-2017)**. "Process Creation and Termination," §2.3; "Job Control," §11. https://pubs.opengroup.org/onlinepubs/9699919799/

2. **Linux Kernel Source: kernel/exit.c** (torvalds/linux). `forget_original_parent()`, `find_new_reaper()`, `do_exit()`. https://github.com/torvalds/linux/blob/eae21770b4fed5597623aad0d618190fa60426ff/kernel/exit.c

3. **Linux Manual Page: prctl(2)**. PR_SET_PDEATHSIG, PR_SET_CHILD_SUBREAPER. https://man7.org/linux/man-pages/man2/prctl.2.html

4. **Linux Manual Page: PR_SET_CHILD_SUBREAPER(2const)**. https://man7.org/linux/man-pages/man2/PR_SET_CHILD_SUBREAPER.2const.html

5. **Linux Manual Page: PR_SET_PDEATHSIG(2const)**. https://man7.org/linux/man-pages/man2/pr_set_pdeathsig.2const.html

6. **Linux Manual Page: pidfd_open(2)**. https://man7.org/linux/man-pages/man2/pidfd_open.2.html

7. **Linux Manual Page: setpgid(2)**. https://man7.org/linux/man-pages/man2/setpgid.2.html

8. **Linux Manual Page: killpg(3)**. https://man7.org/linux/man-pages/man3/killpg.3.html

9. **Linux Manual Page: signal(7)** — Standard signals, SIGKILL/SIGSTOP special handling. https://man7.org/linux/man-pages/man7/signal.7.html

10. **Control Group v2 — The Linux Kernel documentation**. cgroup.kill, cgroup.freeze, cgroup.events. https://docs.kernel.org/admin-guide/cgroup-v2.html

11. **LWN: "prctl: add PR_{SET,GET}_CHILD_SUBREAPER to allow simple process supervision"** (January 2012). https://lwn.net/Articles/474787/

12. **LWN: "A kill button for control groups"** (August 2021). https://lwn.net/Articles/855049/

13. **LWN: "Toward race-free process signaling"** (2019). https://lwn.net/Articles/773459/

14. **LWN: "Completing the pidfd API"** (2019). https://lwn.net/Articles/794707/

15. **LWN: "Adding the pidfd abstraction to the kernel"** (2019). https://lwn.net/Articles/801319/

16. **Biriukov, Viacheslav. "Process groups, jobs and sessions"**. https://biriukov.dev/docs/fd-pipe-session-terminal/3-process-groups-jobs-and-sessions/

17. **iximiuz. "Dealing with process termination in Linux (with Rust examples)"**. https://iximiuz.com/en/posts/dealing-with-processes-termination-in-Linux/

18. **0xjet. "UNIX daemonization and the double fork"** (April 2022). https://0xjet.github.io/3OHA/2022/04/11/post.html

19. **Recall.ai. "PDEATHSIG is almost never what you want"** — Thread-level tracking hazard. https://www.recall.ai/blog/pdeathsig-is-almost-never-what-you-want

20. **Node.js Documentation: child_process module** (v22). https://nodejs.org/api/child_process.html

21. **Node.js Issue #46569: "Unrefed child_process inside a worker thread becomes a zombie"** (February 2023). https://github.com/nodejs/node/issues/46569

22. **Node.js Issue #60077: "child_process.exec{,File} don't allow setting stdin to ignore"** (October 2025). https://github.com/nodejs/node/issues/60077

23. **Node.js Issue #5614: "Spawn-ed detached unref-ed child process in Windows still prevents parent from exit"**. https://github.com/nodejs/node/issues/5614

24. **tini README** (krallin/tini). Subreaper mode, signal forwarding, zombie reaping. https://github.com/krallin/tini

25. **Yelp Engineering. "Introducing dumb-init, an init system for Docker containers"** (January 2016). https://engineeringblog.yelp.com/2016/01/dumb-init-an-init-for-docker.html

26. **dumb-init README** (Yelp/dumb-init). Process group signal forwarding. https://github.com/Yelp/dumb-init

27. **Chromium Docs: Linux Zygote Process** (chromium/src). https://chromium.googlesource.com/chromium/src/+/HEAD/docs/linux/zygote.md

28. **Sargić, Igor. "Killing a process and all of its descendants"** (morningcoffee.io). https://morningcoffee.io/killing-a-process-and-all-of-its-descendants

29. **corsix.org. "What even is a pidfd anyway?"** — pidfd lifecycle states table. https://www.corsix.org/content/what-is-a-pidfd

30. **Apple Developer Library: kqueue(2)**, EVFILT_PROC, NOTE_EXIT. https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/kqueue.2.html

31. **runc Issue #3135: "Make use of cgroup.kill"** (opencontainers/runc). https://github.com/opencontainers/runc/issues/3135

32. **OpenSourcE For You. "What are Subreapers in Linux?"** (May 2023). https://www.opensourceforu.com/2023/05/what-are-subreapers-in-linux/

33. **bubblewrap (containers/bubblewrap)**. --die-with-parent, --pid namespace. https://github.com/containers/bubblewrap

34. **Wikipedia: Orphan process**. Historical overview of reparenting semantics. https://en.wikipedia.org/wiki/Orphan_process

35. **Wikipedia: Fork–exec**. https://en.wikipedia.org/wiki/Fork%E2%80%93exec

36. **Andy Pearce. "Process groups and sessions"** (August 2013). https://www.andy-pearce.com/blog/posts/2013/Aug/process-groups-and-sessions/

37. **Google Gemini CLI Issue #20941: "PTY Shell aborts orphan nested background processes causing OS-level resource exhaustion"**. https://github.com/google-gemini/gemini-cli/issues/20941

---

## Practitioner Resources

### Kernel Documentation and Man Pages

- **cgroup v2 documentation**: https://docs.kernel.org/admin-guide/cgroup-v2.html — The authoritative reference for cgroup.kill, cgroup.freeze, and process lifecycle in cgroupv2.
- **prctl(2) man page**: https://man7.org/linux/man-pages/man2/prctl.2.html — PR_SET_PDEATHSIG, PR_SET_CHILD_SUBREAPER, all options.
- **pidfd_open(2) man page**: https://man7.org/linux/man-pages/man2/pidfd_open.2.html — Full API including poll/epoll usage and waitid example.
- **signal(7) man page**: https://man7.org/linux/man-pages/man7/signal.7.html — Signal dispositions, async-signal-safe functions, standard signals reference.
- **POSIX Exit specification**: https://pubs.opengroup.org/onlinepubs/9699919799/functions/_Exit.html — _Exit() and orphaned process group SIGHUP/SIGCONT rules.

### Libraries and Tools

- **tini** (krallin/tini): Minimal init process for containers. Supports subreaper mode for non-PID-1 use. https://github.com/krallin/tini
- **dumb-init** (Yelp/dumb-init): Similar to tini; differs in signal forwarding behavior (uses killpg). https://github.com/Yelp/dumb-init
- **bubblewrap** (containers/bubblewrap): Unprivileged sandboxing with `--die-with-parent`. https://github.com/containers/bubblewrap
- **pgroup** (ha7ilm/pgroup): Wraps any command to ensure all descendants die with the parent via process group management. https://github.com/ha7ilm/pgroup
- **pid** (trbs/pid, PyPI): PID file library with stale detection and flock-based advisory locking. https://github.com/trbs/pid
- **node-monitor-pid** (Inist-CNRS): Monitors a pid and all its children in Node.js. https://github.com/Inist-CNRS/node-monitor-pid

### Deep-Dive Articles

- **iximiuz: "Dealing with process termination in Linux"**: Hands-on Rust examples for PR_SET_PDEATHSIG, subreaper, waitpid. https://iximiuz.com/en/posts/dealing-with-processes-termination-in-Linux/
- **Recall.ai: "PDEATHSIG is almost never what you want"**: Production incident analysis of the thread-tracking hazard. https://www.recall.ai/blog/pdeathsig-is-almost-never-what-you-want
- **morningcoffee.io: "Killing a process and all of its descendants"**: Survey of process tree killing approaches with shell examples. https://morningcoffee.io/killing-a-process-and-all-of-its-descendants
- **Biriukov: "Process groups, jobs and sessions"**: Comprehensive tutorial on sessions, terminals, job control. https://biriukov.dev/docs/fd-pipe-session-terminal/3-process-groups-jobs-and-sessions/
- **corsix.org: "What even is a pidfd anyway?"**: Complete pidfd API reference with lifecycle state table. https://www.corsix.org/content/what-is-a-pidfd
- **LWN subreaper patch discussion**: Original kernel patch motivation and systemd use case. https://lwn.net/Articles/474787/
- **LWN cgroup.kill**: Design rationale for atomic cgroup termination. https://lwn.net/Articles/855049/

### Node.js Specific

- **Node.js child_process documentation**: https://nodejs.org/api/child_process.html — Official reference for spawn options, events, and signals.
- **Node.js issue #46569** (zombie in worker threads): https://github.com/nodejs/node/issues/46569 — Critical issue for applications spawning processes from Worker threads.
- **Node.js issue #60077** (stdin hang in exec/execFile): https://github.com/nodejs/node/issues/60077 — Affects any use of exec with commands that read stdin.

### Textbooks

- **"The Linux Programming Interface"** (Kerrisk, 2010): Chapters 24–26 (process creation/execution), Chapter 34 (process groups/sessions), Chapter 20 (signals). Comprehensive reference for all mechanisms described in this survey.
- **"Advanced Programming in the Unix Environment"** (Stevens & Rago, 3rd ed.): Chapters 8–10 (processes, signals), Chapter 13 (daemons). Canonical reference for POSIX process semantics.
