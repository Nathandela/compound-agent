---
title: "Optimistic UI and Local-First Patterns for Web Applications"
date: 2026-03-26
summary: Surveys the engineering landscape of optimistic user interfaces, local-first software architecture, and offline-capable web applications, covering CRDT theory and implementations, sync engine architectures, client-side storage, conflict resolution strategies, and the emerging ecosystem of tools that enable instant, network-independent user interactions.
keywords: [optimistic-ui, local-first, crdt, offline-first, sync-engines]
---

# Optimistic UI and Local-First Patterns for Web Applications

*2026-03-26*

## Abstract

The architectural shift from server-centric request-response cycles toward client-authoritative, locally-persistent, and eventually-consistent web applications represents one of the most consequential transformations in frontend engineering of the past decade. This survey examines the full technical landscape spanning three interlocking domains: optimistic UI patterns that decouple perceived performance from network latency, local-first software architectures that treat the user's device as the primary site of computation and data ownership, and the synchronization machinery that reconciles divergent state across distributed replicas. The mathematical foundations of Conflict-free Replicated Data Types (CRDTs), formalized by Shapiro et al. (2011), provide the theoretical backbone for much of this work, guaranteeing strong eventual consistency through algebraic properties of join semilattices. Practical implementations span a wide spectrum from pure peer-to-peer CRDT libraries (Yjs, Automerge, Loro) through server-authoritative sync engines (Replicache, Zero, PowerSync, ElectricSQL) to hybrid architectures that blend operational transformation with CRDT principles (Eg-walker).

Below the sync layer, client-side storage technologies—IndexedDB, the Origin Private File System (OPFS), and SQLite compiled to WebAssembly—provide the persistence substrate, each with distinct performance profiles and capability trade-offs. Above it, service workers, the Cache API, and Background Sync enable Progressive Web Applications to function across connectivity states. The interaction between these layers produces an engineering design space where choices about consistency models, conflict resolution semantics, storage engines, and UI feedback mechanisms are deeply interdependent. This survey maps that design space without prescriptive recommendation, documenting the theory, evidence, implementations, and open problems that practitioners and researchers face when building applications where the network is treated as an optimization rather than a requirement.

## 1. Introduction

### 1.1 Problem Statement

Web applications have historically operated under an implicit assumption: the server is the source of truth, the network is available, and every user action requires a round-trip to confirm its effect. This assumption produces a characteristic user experience pattern—click, wait, see result—that introduces perceptible latency into every interaction. Nielsen's seminal response-time thresholds (1993) established that users perceive delays above 100 milliseconds as noticeable and delays above 1 second as interrupting their flow of thought. Yet typical server round-trips, even on fast networks, impose 50–300 milliseconds of unavoidable latency before any server-side processing begins (Hearne, 2021). On mobile networks with variable connectivity, round-trip times regularly exceed 1 second.

The optimistic UI pattern addresses this tension directly: apply the expected result of an action to the user interface immediately, before the server confirms it, and reconcile or roll back if the server disagrees. Twitter's favorite button, Facebook's like button, and shopping cart additions on major e-commerce platforms all employ this pattern, creating the perception of instant response despite asynchronous server communication (Hearne, 2021). But optimistic UI in isolation is a surface-level technique—it addresses perceived performance without solving the deeper architectural questions that arise when applications must function without any network connectivity, when multiple users modify shared state concurrently, or when data must persist reliably across sessions and devices.

Local-first software, as formalized by Kleppmann, Wiggins, van Hardenberg, and McGranaghan in the Ink & Switch research essay (2019), extends the optimistic principle into a comprehensive architectural philosophy. The seven ideals—fast, multi-device, offline, collaborative, long-lived, private, and user-controlled—reframe the relationship between client and server. In a local-first architecture, the user's device holds the primary copy of data, all reads and writes operate against local state, the network is used for asynchronous synchronization when available, and the cloud serves as an optional secondary replica rather than the canonical authority. This inversion of the traditional client-server hierarchy has profound implications for consistency models, conflict resolution, data persistence, and the engineering infrastructure required to build reliable applications.

### 1.2 Scope and Definitions

This survey covers the engineering foundations and implementation landscape of three interlocking concerns:

1. **Optimistic UI**: Patterns for immediate user feedback that decouple perceived performance from network latency, including rollback mechanisms, error recovery, and the interaction between optimistic mutations and server reconciliation.

2. **Local-first and offline-first architecture**: System designs where the client-side database is the primary data store, applications function fully without network connectivity, and synchronization occurs asynchronously. This encompasses client-side storage technologies (IndexedDB, OPFS, SQLite/WASM), service workers and caching strategies, and the philosophical principles articulated by the Ink & Switch manifesto.

3. **Synchronization and conflict resolution**: The algorithms, protocols, and engines that reconcile divergent state across distributed replicas, from the mathematical foundations of CRDTs and Operational Transformation through practical sync engine implementations (Replicache, Zero, PowerSync, ElectricSQL, Triplit, LiveStore) to application-level conflict resolution strategies.

**Key definitions.** *Strong eventual consistency* (SEC): if any two replicas have received the same set of updates in any order, they are in identical states (Shapiro et al., 2011). *Optimistic replication*: a replica applies updates locally without coordinating with other replicas, diverging temporarily and converging later. *CRDT*: a data structure whose merge operation satisfies commutativity, associativity, and idempotency, guaranteeing SEC without coordination. *Sync engine*: middleware that manages bidirectional data synchronization between client-side storage and a backend database, providing conflict resolution, offline queuing, and reactive query interfaces.

### 1.3 Relationship to Adjacent Surveys

A companion survey (Real-time and Collaborative UX in Web Applications, 2026) covers the UX layer of collaborative systems—presence indicators, cursor sharing, undo semantics, notification design, and the CSCW framework. This survey goes deeper on the engineering substrate: CRDT theory and implementations, sync engine architectures, client-side storage, and the mechanics of optimistic mutations. A separate survey (Local-First AI and On-Device Intelligence, 2026) addresses the intersection of local-first architecture with on-device machine learning; this survey focuses on data synchronization rather than inference.

## 2. Foundations

### 2.1 Consistency Models for the Browser

The CAP theorem (Brewer, 2000; Gilbert & Lynch, 2002) states that a distributed system can guarantee at most two of Consistency, Availability, and Partition tolerance. Web applications with offline capability implicitly choose AP: they remain available during network partitions (offline operation) at the cost of consistency. The PACELC extension (Abadi, 2012) adds that even without partitions, there is a trade-off between latency and consistency—precisely the trade-off that optimistic UI exploits.

In the browser context, each client operates as an independent replica of application state. When two browser tabs, two devices, or two users modify the same data without synchronizing, their replicas diverge. The consistency model chosen determines how and when these replicas converge:

- **Strong consistency** requires synchronous coordination before acknowledging writes. This is the traditional request-response model: a mutation is not reflected in the UI until the server confirms it. It sacrifices availability (the application cannot function offline) and latency (every interaction incurs a round-trip).
- **Eventual consistency** guarantees that replicas will converge if they eventually receive the same updates, but places no constraint on intermediate states or the final merged result.
- **Strong eventual consistency** (SEC), as defined by Shapiro et al. (2011), strengthens eventual consistency with a determinism requirement: any two replicas that have received the same set of updates are in identical states, regardless of delivery order. This eliminates non-determinism in the merge outcome and is the consistency model that CRDTs are designed to provide.

### 2.2 Mathematical Foundations of CRDTs

The theoretical framework for CRDTs rests on order theory and abstract algebra. A *join semilattice* is a partially ordered set (S, ≤) in which every pair of elements has a least upper bound (join). The merge operation of a state-based CRDT computes the join of two replica states, and the three algebraic properties of the join operation—commutativity (a ⊔ b = b ⊔ a), associativity ((a ⊔ b) ⊔ c = a ⊔ (b ⊔ c)), and idempotency (a ⊔ a = a)—collectively ensure that message reordering, duplication, and re-delivery cannot produce divergent states (Shapiro et al., 2011).

**State-based CRDTs** (Convergent Replicated Data Types, CvRDTs) propagate their entire local state to other replicas. Upon receiving a remote state, a replica merges it with its own state using the join operation. The full-state transmission model is simple but bandwidth-intensive for large data structures, motivating the *delta-state* optimization (Almeida, Shoker, & Baquero, 2018) that transmits only the incremental state change (delta) produced by each mutation. Delta-state CRDTs preserve the convergence guarantees of full-state CRDTs while achieving the bandwidth efficiency of operation-based approaches.

**Operation-based CRDTs** (Commutative Replicated Data Types, CmRDTs) transmit individual update operations rather than states. If all operations commute—that is, applying operations in any order produces the same result—then replicas converge without a merge function. Operation-based CRDTs require reliable, causally-ordered delivery from the communication layer, a stronger requirement than state-based CRDTs which tolerate arbitrary message loss and reordering.

**Pure operation-based CRDTs** (Baquero, Almeida, & Shoker, 2014) relax the causal delivery requirement by embedding causal metadata in the operations themselves, enabling deployment over unreliable networks while maintaining the small message size of operation-based approaches.

### 2.3 CRDT Type Taxonomy

The CRDT literature defines a hierarchy of data types with increasing complexity (Duncan, 2025):

| Type | Mechanism | Semantic | Limitations |
|---|---|---|---|
| **G-Counter** | Per-replica counter; merge via max | Grow-only counting | Cannot decrement |
| **PN-Counter** | Two G-Counters (inc/dec) | Bidirectional counting | Double space overhead |
| **G-Set** | Union merge | Grow-only set | Cannot remove elements |
| **2P-Set** | Add set + remove set | Add then remove once | Removed elements cannot be re-added |
| **OR-Set** | Unique tags per add; remove observed tags | Add-wins semantics | Tag metadata overhead; GC complexity |
| **LWW-Register** | Value + timestamp; highest timestamp wins | Single-value register | Loses concurrent updates; clock-dependent |
| **MV-Register** | Stores all concurrent values | Returns conflict set | Application must resolve conflicts |
| **RGA** | Unique IDs + tree structure | Sequence/list operations | Tombstone accumulation |
| **YATA** | Left-origin + right-origin references | Sequence with interleaving control | Complex implementation |

These primitives compose hierarchically: a PN-Counter is two G-Counters, an OR-Map combines OR-Set key management with per-key CRDTs, and collaborative text editors build on sequence CRDTs (RGA, YATA, Logoot, LSEQ) with rich-text extensions like Peritext (Litt et al., 2022).

### 2.4 Operational Transformation

Operational Transformation (OT), originating with Ellis and Gibbs (1989) and refined through the Jupiter protocol (Nichols et al., 1995), achieves consistency through a different mechanism: a central server orders concurrent operations and applies transformation functions that adjust each operation's parameters to account for preceding concurrent operations. OT does not require algebraic properties of the operations themselves; instead, the transformation function T(op1, op2) must satisfy convergence properties (TP1, and optionally TP2 for decentralized variants) that ensure all replicas reach the same state after applying transformed operations.

The practical distinction is architectural: OT traditionally requires a central server to establish operation ordering, while CRDTs can operate peer-to-peer. However, many production CRDT deployments also use central servers for coordination (Figma, Linear), and recent work on Eg-walker (Gentle & Kleppmann, 2024) blurs the boundary by using OT-style indexed operations during normal editing and temporarily constructing CRDT state only during merge, achieving storage and memory efficiency closer to OT with the convergence guarantees of CRDTs.

## 3. Taxonomy of Approaches

The design space for optimistic, local-first, and offline-capable web applications can be organized along three orthogonal axes:

### 3.1 Classification Framework

**Axis 1: Authority model**
- **Server-authoritative**: A central server holds the canonical state; client mutations are speculative and may be rebased or rejected. (Replicache, Zero, PowerSync, ElectricSQL, Linear)
- **Peer-to-peer / decentralized**: No canonical server; all replicas have equal authority; convergence is achieved through CRDT merge semantics. (Yjs, Automerge, Loro)
- **Hybrid**: Server-mediated coordination with CRDT-like local merge for offline operation. (Figma, Triplit)

**Axis 2: Sync granularity**
- **Document-level**: Entire documents are synced as atomic units. (Automerge, early Yjs usage)
- **Row/entity-level**: Individual database rows or entities are synced with per-field conflict resolution. (PowerSync, ElectricSQL, Triplit)
- **Query-level**: The sync boundary is defined by client-side queries; only data matching active queries is replicated. (Zero, Replicache)
- **Operation-level**: Individual operations (inserts, deletes, format changes) are synced. (Yjs, OT systems)

**Axis 3: Conflict resolution strategy**
- **Automatic (CRDT merge)**: Mathematical properties guarantee deterministic convergence. (Yjs, Automerge, Loro, ElectricSQL)
- **Last-write-wins (LWW)**: The most recent mutation by wall-clock or logical timestamp prevails. (Figma properties, many sync engines as default)
- **Application-defined**: Conflict resolution logic is delegated to developer-written mutators. (Replicache, Zero)
- **Manual**: Conflicts are surfaced to users for resolution. (CouchDB optional, Git)

**Table 2. Taxonomy of Local-First and Optimistic UI Approaches**

| Category | Representative | Authority | Sync Granularity | Conflict Strategy | Offline Support |
|---|---|---|---|---|---|
| CRDT Libraries | Yjs, Automerge, Loro | Peer-to-peer | Operation/Document | Automatic (CRDT) | Full |
| Server-Auth Sync Engines | Replicache, Zero | Server | Query-level | App-defined mutators | Full |
| DB Sync Engines | PowerSync, ElectricSQL | Server | Row/Entity | LWW / CRDT | Full |
| Full-Stack Sync DB | Triplit, LiveStore | Hybrid | Row/Entity | CRDT / Event-sourcing | Full |
| OT Systems | Google Docs, Etherpad | Server | Operation | OT Transform | Partial |
| Replication Protocols | PouchDB/CouchDB | Multi-master | Document | Revision tree | Full |
| Optimistic UI Frameworks | TanStack Query, SWR | Server | Query-level | Rollback on error | Cache only |
| PWA Infrastructure | Service Workers, Cache API | Client | Resource-level | Cache-first / Network-first | Partial |

### 3.2 The Spectrum of Local-First

Tolinski (2025) organizes the practical library landscape along a control-vs-convenience spectrum:

1. **"Do it all for me" platforms** (Triplit, Evolu): Complete solutions managing server storage, local persistence, sync, and real-time queries with minimal configuration. Trade-off: platform lock-in and less transparency into server-side data handling.

2. **"Give me more control" frameworks** (RxDB, ElectricSQL, TinyBase): Provide sync and local database layers while requiring integration with existing backends. Trade-off: more development work but greater architectural flexibility.

3. **"I want to do it all" primitives** (Replicache, PowerSync, Yjs): Sync-layer-focused solutions requiring custom backend implementation. Trade-off: maximum control at the cost of substantial engineering investment.

This spectrum reflects a fundamental tension in the local-first ecosystem: the more a framework handles automatically, the less control the developer retains over sync semantics, conflict resolution, and backend architecture.

## 4. Analysis

### 4.1 Optimistic UI Patterns

#### 4.1.1 Theory and Mechanism

Optimistic UI decouples the user's perception of action completion from the server's confirmation of that action. The core mechanism is straightforward: (1) capture the pre-mutation state, (2) apply the expected mutation to the local UI immediately, (3) send the mutation to the server asynchronously, (4) on success, optionally reconcile with the server's canonical response, and (5) on failure, roll back to the captured pre-mutation state.

The perceived performance improvement is substantial. Research indicates that users perceive applications with optimistic updates as 2–3x faster than those employing synchronous confirmation, and that immediate visual feedback reduces perceived wait time by up to 40% even when actual processing time remains unchanged (Glushenkov, 2024). Nielsen's 100-millisecond threshold for perceived instantaneity is achievable with optimistic updates but essentially impossible with server round-trips on typical networks.

#### 4.1.2 Pattern Taxonomy

Hearne (2021) identifies five categories of optimistic UI patterns with increasing sophistication:

**Optimistic atomic actions.** Single-step mutations where the probability of server rejection is very low—likes, favorites, bookmarks. Twitter's favorite button exemplifies this: the animation triggers instantly on click, the API call proceeds asynchronously, and failures are queued for retry rather than immediately reverted. Only after multiple failures does the UI roll back.

**Optimistic cart/form submission.** Multi-step interactions where an animation or transition (typically 300–500ms) covers the server round-trip. Allbirds' mini-cart opens with an animation immediately upon product addition, masking the API call within the animation duration.

**Contextual feedback.** Immediate physical responses (button depression, shadow effects, state changes) at the user's point of focus, providing haptic-like confirmation before semantic confirmation.

**Pre-emptive loading.** Attaching prefetch directives to `mouseover` and `touchstart` events to begin loading likely navigation targets before the user commits to the action, reducing the gap between click and content display.

**Interstitial states.** Placeholder content, skeleton screens, or blur effects that acknowledge the user's action while asynchronous operations complete—useful when the optimistic result cannot be predicted (e.g., search results).

#### 4.1.3 Implementation in Modern Frameworks

**TanStack Query** (formerly React Query) provides a structured API for optimistic updates via its `useMutation` hook. The `onMutate` callback captures pre-mutation state and applies the optimistic update to the query cache; `onError` rolls back using the captured state; `onSettled` invalidates the cache to reconcile with server state. Version 5 introduced simplified patterns that reduce manual cache manipulation (Khokhlov, 2024).

**React's `useOptimistic` hook** (React 19+) provides a built-in primitive for optimistic state updates that automatically revert when the underlying state updates from the server, integrating with React's concurrent rendering model to avoid tearing between optimistic and server-confirmed states (React Team, 2024).

**Replicache** embeds optimistic updates as a core architectural primitive rather than an application-layer pattern: every client mutation executes immediately against the local key-value store, is persisted for offline safety, and is later rebased against the server's canonical state using a git-like versioning mechanism (Rocicorp, 2024).

#### 4.1.4 Strengths and Limitations

Optimistic UI dramatically improves perceived performance and user satisfaction. However, it introduces complexity in error handling (what does the user see when a "completed" action fails?), creates potential for "phantom state" where the UI shows something that was never confirmed, and becomes increasingly difficult to implement correctly as mutation complexity grows. Atomic actions (toggle a boolean) are straightforward; multi-entity transactions with cross-references are substantially harder to roll back convincingly. The pattern also assumes that most mutations succeed—if failure rates are high, constant rollbacks degrade rather than improve the user experience.

### 4.2 CRDT Libraries

#### 4.2.1 Yjs

**Theory and mechanism.** Yjs implements the YATA (Yet Another Transformation Approach) algorithm for sequence CRDTs, using left-origin and right-origin references to determine insertion positions without central coordination (Nicolaescu et al., 2016). The YATA algorithm has been formally verified using the Lean theorem prover, confirming preservation and commutativity properties, though the verification also revealed errors in the original paper's pseudocode.

**Architecture.** Yjs is network-agnostic with a modular provider system: `y-websocket` for WebSocket communication, `y-webrtc` for peer-to-peer via WebRTC, and third-party providers for other transports. The sync protocol uses three message types (SyncStep1, SyncStep2, Update) for efficient document synchronization. The Awareness protocol, defined in `y-protocols`, provides a state-based CRDT for ephemeral presence information (cursor positions, user names, online status) that is separate from document state (Yjs Docs, 2025).

**Performance.** Yjs consistently benchmarks as the fastest mainstream CRDT library for text editing workloads. On the canonical Martin Kleppmann editing trace (~260,000 keystrokes), Yjs processes the full trace in approximately 1,074ms with 10MB memory consumption (Automerge blog, 2023). Its pure JavaScript implementation avoids WASM initialization overhead, making it well-suited for applications where startup time is critical.

**Limitations.** Yjs does not store complete editing history by default; recovering version snapshots requires additional storage of version vectors and delete sets at each save point, adding overhead proportional to document size. Rich text support requires integration with editor bindings (ProseMirror, Tiptap, Slate, Quill, Monaco) rather than being built into the core library.

#### 4.2.2 Automerge

**Theory and mechanism.** Automerge implements a JSON-compatible CRDT data model supporting maps, lists, text, and counters. Version 2.0 (2023) represents a complete rewrite in Rust, compiled to WebAssembly for browser environments, replacing the original JavaScript implementation that was functional but prohibitively slow for production use.

**Performance evolution.** The Rust rewrite achieved dramatic improvements on the Kleppmann editing trace:

| Version | Timing (ms) | Memory (bytes) |
|---|---|---|
| Automerge 0.14 (JS) | ~500,000 | ~1.1 GB |
| Automerge 1.0.1 (JS) | 13,052 | 184 MB |
| Automerge 2.0.1 (Rust/WASM) | 1,816 | 44 MB |
| Automerge 2.0.2-unstable | 661 | — |
| Yjs (reference) | 1,074 | 10 MB |

The compressed columnar storage format achieves remarkable density: a 107KB plaintext document requires only 129KB in Automerge 2.0 format, approximately 30% overhead, compared to over 1,300 bytes per character in the naive JSON encoding of Automerge 0.14 (Automerge blog, 2023). Automerge 3 further reduced memory usage by approximately 10x.

**Architecture.** The Rust core compiles to WASM for browsers, with C FFI bindings for React Native (which lacks WASM support), native Rust for server-side applications, and additional language bindings. Automerge includes a sync protocol for efficient document exchange and integrates with Cambria (Litt et al., 2021) for schema evolution using bidirectional edit lenses. The Automerge-Repo library provides a higher-level document management layer with pluggable storage and network adapters.

**Limitations.** WASM initialization adds approximately 500ms of startup overhead. While performance has improved dramatically, Yjs remains faster for pure text editing. Automerge's strength lies in its richer data model (nested JSON-compatible structures) and its complete editing history, which enables features like time-travel debugging and version branching at the cost of larger document sizes.

#### 4.2.3 Loro

**Theory and mechanism.** Loro implements a CRDT based on the Replayable Event Graph model, supporting rich text (compliant with Peritext semantics), lists, maps, movable trees, and counters. Implemented in Rust with JavaScript bindings via WASM, Loro aims to combine the performance characteristics of Yjs with the rich history capabilities of Automerge.

**Architecture.** Loro stores a complete DAG of editing history for each operation, enabling full version control semantics. Its rich text implementation follows Peritext criteria for intent-preserving concurrent formatting, addressing a gap in earlier CRDT libraries where concurrent bold/italic operations could produce unexpected results (Litt et al., 2022). The movable tree CRDT supports hierarchical data structures (file systems, outlines, organizational charts) with concurrent move operations—a data type not available in Yjs or Automerge at the time of writing.

**Performance and status.** Early benchmarks showed Loro competitive with or exceeding Yjs on several operations, though the project has since prioritized encoding compatibility over raw speed to ensure stability after version 1.0 (Loro team, 2024). Loro remains under active development and is approaching production readiness; its Rust implementation and WASM compilation follow the pattern established by Automerge 2.0.

### 4.3 Sync Engines

#### 4.3.1 Replicache and Zero (Rocicorp)

**Theory and mechanism.** Replicache implements a client-side persistent key-value store with a git-like sync protocol. The architecture has three phases: *Push* batches pending mutations to the server's push endpoint, where they are executed against canonical state. *Pull* fetches the latest canonical state as a diff against the client's known version. *Rebase* rewinds the client to the last confirmed server state, applies the server's patch, and replays remaining pending (unconfirmed) mutations—a process invisible to the application layer (Rocicorp, 2024).

Conflict resolution is application-defined: developers write *mutators*—named JavaScript functions that transactionally read and write the key-value store. The same mutator code executes speculatively on the client and authoritatively on the server, potentially producing different results depending on the current state. This makes conflict resolution explicit rather than automatic, enabling domain-specific logic (e.g., rejecting a duplicate reservation, merging concurrent list additions).

*Pokes* provide real-time update notification: the server sends a contentless hint (via WebSocket, SSE, or pubsub) telling connected clients to initiate a pull, enabling sub-second propagation without polling.

**Performance.** The client-side store operates at memory-level speeds: sub-millisecond latency and 500MB/s scanning. The 100MB dataset limit requires selective syncing and active management of the client-side data boundary.

**Zero** is Rocicorp's second-generation sync engine, currently in alpha/beta, that replaces Replicache's key-value model with query-driven synchronization. Zero's architecture introduces three key innovations:

1. *ZQL (Zero Query Language)*: A TypeScript-native query interface that runs against a client-side SQLite replica, returning instant results from the local cache while fetching authoritative results from the server asynchronously.
2. *Incremental View Maintenance (IVM)*: Both client and server maintain materialized views of active queries, pushing only diffs when underlying data changes rather than re-executing queries from scratch.
3. *Predictive caching*: Zero attempts to predict what data the user will need and pre-populates the client cache, further reducing the frequency of cache misses.

The zero-cache component runs server-side, maintaining a read-only replica of the PostgreSQL database and streaming changes to clients via the WAL (Write-Ahead Log). Client-side mutations are optimistic and synced back to the server, with last-update-wins as the apparent default strategy (Marmelab, 2025).

**Limitations.** Zero currently supports only PostgreSQL, lacks documented conflict resolution beyond LWW, provides no client-side error feedback for rejected mutations, and is not yet production-stable.

#### 4.3.2 PowerSync

**Theory and mechanism.** PowerSync implements a server-mediated sync architecture with the client-side SQLite database as the primary local store. The PowerSync Service connects to backend databases (PostgreSQL, MongoDB, MySQL, SQL Server) via Change Data Capture mechanisms—Postgres logical replication, MongoDB change streams, MySQL binlog—and streams incremental changes to each client according to declarative *Sync Streams* (formerly Sync Rules) that define per-user data partitioning and transformation.

**Architecture.** The two-component architecture separates the sync service (responsible for data replication, transformation, and partitioning) from client SDKs (responsible for local persistence, consistency, reactivity, and write queuing). Writes are applied locally to the embedded SQLite database and queued for upload to the developer's custom backend API, maintaining server authority over write validation while enabling full offline-first operation.

**Implementation breadth.** PowerSync provides SDKs for JavaScript/TypeScript (web), React Native, Flutter, Kotlin Multiplatform, Swift, and .NET, making it one of the most broadly portable sync engines. The MongoDB Atlas partnership (2024) extended the backend from PostgreSQL-only to multi-database support.

**Strengths and limitations.** PowerSync excels at large dataset synchronization across heterogeneous client platforms with fine-grained control over which data reaches which users. Its architecture is designed for enterprise scenarios where offline operation must be fully functional, not merely cache-based. The trade-off is complexity: developers must implement their own backend write API, manage Sync Streams configuration, and handle conflict resolution at the application layer.

#### 4.3.3 ElectricSQL

**Theory and mechanism.** ElectricSQL positions itself as a Postgres sync engine that brings the database to the client. After a substantial "clean rebuild" in mid-2024 (replacing the original Elixir-based CRDT engine with a leaner architecture called "electric-next"), ElectricSQL focuses on partial replication of PostgreSQL data to client-side storage using CRDTs for automatic conflict resolution.

**Architecture.** The system comprises a PostgreSQL extension for server-side integration, a backend sync service, and TypeScript client libraries managing local persistence and optimistic updates. ElectricSQL supports integration with multiple client-side ORMs and frameworks including Prisma, Rails, and Laravel.

**Strengths and limitations.** ElectricSQL's primary strength is deep PostgreSQL integration—it works with existing Postgres databases rather than requiring a separate backend. CRDT-based automatic conflict resolution reduces developer burden but limits control over merge semantics. The mid-2024 rewrite signals architectural maturation but also introduced instability during the transition period.

#### 4.3.4 Triplit

**Theory and mechanism.** Triplit implements a dual-database architecture: one database runs in the browser, another on the server, connected by a custom sync engine. The data model is inherently CRDT-based, with conflicts resolved at the attribute (column) level rather than the entity (row) level, minimizing the blast radius of concurrent modifications.

**Architecture.** Triplit's sync protocol supports automatic server-side eviction of client data when permissions change, and handles reconnection with stale caches. Schema is separated from data to prevent accidental data loss during schema modifications, and the system can detect backwards-incompatible schema changes to warn connected clients. The framework supports pluggable storage (IndexedDB, SQLite, Cloudflare Durable Objects) and multiple frontend frameworks (React, Solid, Vue, Svelte).

**Implementation.** Triplit uses incremental view maintenance to keep "live queries" updated as data changes, avoiding full re-execution on each mutation. The 1.0 release (2024) brought production stability with a comprehensive feature set spanning real-time sync, offline support, role-based access control, and end-to-end type safety.

#### 4.3.5 LiveStore

**Theory and mechanism.** LiveStore takes a fundamentally different approach from CRDT-based sync engines by adopting *event-sourcing* with read/write model separation. All writes are stored and synced as mutation events in an event log (write model), which are applied/reduced onto a SQLite database (read model). The event log is the unit of synchronization, using a push/pull mechanism with client-side rebasing analogous to Git.

**Architecture.** LiveStore provides a reactive SQLite database with a signal-based reactivity layer, enabling live query results that update automatically when underlying data changes. Developed over three years by Johannes Schickling (founder of Prisma), LiveStore includes schema management with automatic migrations and type-safe query building. The Expo integration, developed in collaboration with the Expo team, extends LiveStore to React Native mobile applications.

**Strengths and limitations.** The event-sourcing model provides a complete audit trail and enables time-travel debugging. However, event log growth requires compaction strategies, and the approach diverges from the CRDT consensus in the local-first community, requiring developers to reason about event ordering rather than state convergence.

### 4.4 Client-Side Storage Technologies

#### 4.4.1 IndexedDB

IndexedDB is the foundational browser storage API for structured data, available in all modern browsers. It provides asynchronous, transactional access to a key-value store with indexing support, capable of storing gigabytes of data (Chromium allows up to 80% of available disk space). Write latency averages approximately 0.17ms per document, with reads at roughly 0.05ms—fast enough for most application needs but 10x slower than localStorage for individual operations (RxDB, 2025). IndexedDB supports Web Worker access, enabling off-main-thread database operations.

**Limitations.** IndexedDB lacks SQL query capabilities—no JOINs, no aggregations, no complex relational queries. Cross-browser behavior differences persist in edge cases. There is no native multi-tab synchronization; applications must implement their own coordination (BroadcastChannel, SharedWorker, or polling).

#### 4.4.2 Origin Private File System (OPFS)

OPFS provides file-system-level access optimized for performance, achieving 3–4x faster operations than IndexedDB for bulk I/O when accessed from a Web Worker using synchronous methods. The 2025 ecosystem has converged on `wa-sqlite`'s `OPFSCoopSyncVFS` as a general-purpose virtual file system for SQLite-over-OPFS that works across all major browsers with excellent performance even for large databases (PowerSync, 2025).

**Constraints.** The highest-performance synchronous APIs (`read()`, `write()`) are available only inside Web Workers, not on the main thread, iframes, or SharedWorkers. This architectural requirement means applications must manage cross-thread communication for database operations.

#### 4.4.3 SQLite via WebAssembly

Compiling SQLite to WebAssembly enables a full relational database in the browser with standard SQL support, JOINs, complex queries, and the extensive SQLite feature set. The Chrome team's official SQLite-over-WASM project, backed by OPFS for persistence, provides a reference implementation (Chrome Developers, 2022). The wa-sqlite project offers alternative VFS implementations with different performance/compatibility trade-offs.

**Performance characteristics.** WASM SQLite adds approximately 500ms of initialization overhead—significant for applications that must be interactive immediately, but amortized over long-lived sessions. Once initialized, query performance benefits from SQLite's decades of optimization. The combination of WASM SQLite with OPFS persistence represents the current state of the art for high-performance client-side relational storage.

#### 4.4.4 Comparative Analysis of Browser Storage

| Technology | Max Size | Write Latency | Query Capability | Worker Support | Init Overhead |
|---|---|---|---|---|---|
| localStorage | 4–10 MB | 0.017ms | Key lookup only | Blocked | None |
| IndexedDB | GB-scale | 0.17ms | Indexed ranges | Yes | Minimal |
| OPFS | GB-scale | ~0.05ms (Worker) | File I/O only | Required | Minimal |
| WASM SQLite | GB-scale | Varies | Full SQL | Recommended | ~500ms |
| Cookies | ~4 KB | N/A | None | Blocked | None |

### 4.5 Offline Infrastructure: Service Workers and PWAs

#### 4.5.1 Theory and Mechanism

Service workers provide a programmable network proxy that intercepts all fetch requests from a web application, enabling caching strategies that operate independently of network connectivity. The Cache API provides persistent storage for Request/Response pairs, while the Background Sync API enables deferred network operations that execute when connectivity is restored.

#### 4.5.2 Caching Strategies

The established caching strategy taxonomy maps directly to the local-first spectrum:

- **Cache First** (offline-first): Serve from cache; fall back to network only on cache miss. Appropriate for static assets, app shells, and versioned resources.
- **Network First** (online-first with offline fallback): Attempt network fetch; fall back to cache on failure. Appropriate for frequently-updated content where freshness is preferred.
- **Stale-While-Revalidate**: Serve from cache immediately (stale); simultaneously fetch from network and update cache. Balances performance with freshness.
- **Network Only**: No caching; traditional server-dependent behavior.
- **Cache Only**: Serve exclusively from cache; useful for fully offline-packaged content.

For local-first applications, service workers primarily handle the *resource layer* (HTML, CSS, JavaScript, images) while sync engines handle the *data layer*. The two are complementary: service workers ensure the application code is available offline, while sync engines ensure the application data is available offline.

#### 4.5.3 Background Sync and Periodic Background Sync

The Background Sync API allows web applications to defer actions until the user has stable connectivity. When a sync event is registered while offline, the browser fires the `sync` event in the service worker scope as soon as connectivity is detected, automatically restarting the service worker if necessary. The Periodic Background Sync API extends this to recurring tasks—refreshing cached data, synchronizing state—that execute at browser-determined intervals when the device has connectivity.

#### 4.5.4 PWA Integration

A production-ready PWA for offline-first operation requires three foundational elements: HTTPS for all resources, a Web App Manifest for installability, and a service worker with appropriate caching strategies. The 2025 best practice is to combine Cache First with versioned URLs for the app shell and static assets, Stale-While-Revalidate for list/feed data, and Network First for detail views requiring freshness—with critical write actions queued via Background Sync (MDN, 2025).

### 4.6 The PouchDB/CouchDB Replication Model

#### 4.6.1 Theory and Mechanism

CouchDB's Multi-Version Concurrency Control (MVCC) replication protocol, implemented client-side by PouchDB, represents one of the earliest and most complete offline-first architectures. The protocol synchronizes JSON documents between peers over HTTP using CouchDB's public REST API. CouchDB supports multi-master replication: any node can accept writes, and the protocol reconciles divergent histories using a deterministic winner-selection algorithm applied to the revision tree.

#### 4.6.2 Conflict Resolution

When concurrent modifications produce conflicting revisions, CouchDB selects a deterministic winner that all nodes can agree upon without coordination. However, all conflicting revisions are preserved in the document's revision tree (analogous to Git's branch history), enabling application-level conflict resolution where developers surface conflicts to users or implement custom merge logic.

#### 4.6.3 Strengths and Limitations

The CouchDB/PouchDB model pioneered many patterns now standard in the local-first ecosystem: local-first writes, bidirectional replication, conflict preservation, and API-less synchronization. However, PouchDB's requirement to maintain CouchDB-compatible revision trees creates significant performance overhead—every document carries its full revision history, and the adapter system (IndexedDB, SQLite, filesystem) adds abstraction layers that impact throughput. For modern local-first applications, PouchDB/CouchDB remains a viable option for document-oriented workloads but has been superseded in performance and developer experience by purpose-built sync engines.

### 4.7 Operational Transformation and Hybrid Approaches

#### 4.7.1 OT in Practice

Google Docs remains the highest-profile OT deployment, using a server-mediated Jupiter-derived protocol where the server establishes a total order of operations and each client transforms incoming remote operations against its pending local operations. ProseMirror's collaborative editing module implements a serialization-based OT variant where the server rejects out-of-order operations, requiring clients to rebase and retry.

#### 4.7.2 Eg-walker: The OT-CRDT Hybrid

Eg-walker (Gentle & Kleppmann, 2024) resolves a long-standing tension between OT and CRDTs. Traditional CRDTs carry per-character metadata (16–32 bytes per character for sequence CRDTs) and store the full operation history, causing documents to consume far more memory than their plaintext content. OT stores only compact indexed operations but struggles to merge branches that have diverged substantially during offline editing.

Eg-walker stores operations in OT-style compact format—`insert(position, character)` and `delete(position)`—and constructs CRDT state temporarily during merge operations to resolve concurrent edits. After the merge, the CRDT state is discarded. This produces documents that consume an order of magnitude less memory than traditional CRDTs in the steady state, load orders of magnitude faster from disk, while maintaining the ability to merge long-diverged branches orders of magnitude faster than OT (Gentle & Kleppmann, 2024).

Figma adopted Eg-walker for their Code Layers feature (2024), choosing it over their existing CRDT-inspired approach for its performance and memory advantages in text-heavy collaborative scenarios.

### 4.8 State Persistence and Session Recovery

#### 4.8.1 Draft Recovery Patterns

Client-side state persistence enables applications to recover user work across page reloads, browser crashes, and offline sessions. The standard approach uses localStorage or IndexedDB to periodically save application state (form contents, editor drafts, scroll positions), with debounced writes to avoid excessive I/O during rapid user input.

Production implementations typically include expiration policies (timestamps that invalidate stale persisted state), cross-tab synchronization (via BroadcastChannel or storage events), and quota management (handling `QuotaExceededError` gracefully). The local-first pattern subsumes draft recovery: since all data is written to local storage as the primary operation, there is no separate "save draft" mechanism—the user's work is always persisted.

#### 4.8.2 Resumable Sessions

Qwik's *resumability* concept (Hevery, 2023) applies to the application framework layer rather than data: instead of re-executing all JavaScript to reconstruct UI state after server-side rendering (hydration), Qwik serializes the application state, event handlers, and component hierarchy, enabling the client to resume execution without replay. While not directly a local-first pattern, resumability represents the same philosophical principle—preserving state to avoid redundant computation—applied at the framework level rather than the data layer.

### 4.9 Real-Time Collaboration via Local-First Patterns

#### 4.9.1 Multiplayer Editing

Local-first CRDT libraries enable real-time collaborative editing where each participant works against their local replica, with changes propagated to peers via network providers. The CRDT merge guarantees convergence regardless of operation order, enabling collaboration patterns that survive network partitions: users can work offline and merge their changes when reconnecting.

Peritext (Litt et al., 2022) specifically addresses the rich text collaboration problem, where concurrent formatting operations (e.g., one user bolds a word while another italicizes it) must produce intuitive results. The Peritext algorithm stores formatting spans linked to stable character identifiers, ensuring that concurrent format operations commute correctly. Loro's rich text CRDT implements Peritext-compliant semantics.

#### 4.9.2 Presence and Awareness

The Yjs Awareness protocol provides a standardized mechanism for ephemeral presence information: each peer maintains a local awareness state (cursor position, selection, user name, color) that is broadcast to all connected peers. The awareness CRDT is state-based, with each peer allocated a unique entry that only they can modify. Unlike document CRDTs, awareness state is intentionally ephemeral—it is not persisted and expires when a peer disconnects.

This separation of document state (persistent, conflict-free, eventually consistent) from presence state (ephemeral, real-time, loss-tolerant) reflects a design insight: the consistency requirements for "where is my collaborator's cursor right now?" differ fundamentally from "what does the document contain?"

### 4.10 Edge Computing and Local-First Convergence

Edge computing—moving computation closer to the data source—shares philosophical alignment with local-first architecture. Both paradigms reduce dependence on centralized infrastructure; the difference is granularity: edge computing typically refers to CDN nodes, regional servers, or IoT gateways, while local-first places computation on the user's personal device.

The practical convergence appears in edge databases (Cloudflare D1, Turso/libSQL, Couchbase Edge Server) that provide SQLite-compatible databases running at edge locations with synchronization to central stores. Triplit's support for Cloudflare Durable Objects as a storage backend exemplifies this convergence: a Triplit server can run at the edge, reducing the distance between the sync engine and the client while maintaining the same CRDT-based consistency model.

For web applications, the most relevant edge pattern is read replication: serving frequently-accessed data from edge locations to reduce initial load times, while maintaining a central write authority. This complements rather than replaces client-side local-first storage, as the edge layer optimizes the sync path rather than eliminating the need for it.

## 5. Comparative Synthesis

### 5.1 Cross-Cutting Trade-Off Analysis

The following table synthesizes the primary trade-offs across the approaches analyzed in Section 4.

**Table 3. Comparative Synthesis of Local-First and Sync Approaches**

| Dimension | CRDT Libraries (Yjs, Automerge, Loro) | Server-Auth Sync (Replicache, Zero) | DB Sync (PowerSync, ElectricSQL) | Full-Stack Sync (Triplit, LiveStore) | OT Systems | PouchDB/CouchDB |
|---|---|---|---|---|---|---|
| **Authority** | Peer-to-peer | Server canonical | Server canonical | Hybrid | Server required | Multi-master |
| **Offline capability** | Full, indefinite | Full, with rebase | Full, with queue | Full | Partial, time-limited | Full, indefinite |
| **Conflict resolution** | Automatic (mathematical) | App-defined mutators | LWW / CRDT | CRDT / Event-sourcing | Server-ordered transform | Deterministic winner + revision tree |
| **Developer control** | Low (merge is automatic) | High (mutator logic) | Medium (sync rules) | Medium | Low (transform is fixed) | Medium (revision access) |
| **Memory overhead** | High (per-element metadata) | Low (key-value store) | Low (SQLite) | Medium | Low | Medium (revision trees) |
| **History/versioning** | Full (Automerge, Loro) / Partial (Yjs) | Via server | Via database | Event log (LiveStore) | Server-side | Full revision tree |
| **Backend requirement** | None (p2p possible) | Custom backend API | Existing Postgres/Mongo | Managed or self-hosted | Central server | CouchDB-compatible |
| **Startup overhead** | Low (Yjs) / Medium (WASM: Automerge, Loro) | Low | Low–Medium | Medium | Low | Medium |
| **Max dataset size** | Document-scale (MB) | ~100MB (Replicache) | Large (query-bounded) | Medium | Document-scale | Document-scale |
| **Real-time collaboration** | Native (awareness protocol) | Via poke mechanism | Via change streams | Native | Native | Polling/long-poll |
| **Rich text support** | Strong (editor bindings) | None (data layer) | None (data layer) | Limited | Strong (purpose-built) | None |
| **Schema evolution** | Cambria (Automerge) | App-managed | Database migrations | Built-in | App-managed | Schemaless (JSON) |
| **Maturity** | Production (Yjs); Maturing (Automerge, Loro) | Production (Replicache); Alpha (Zero) | Production | Production (Triplit 1.0); Dev (LiveStore) | Decades of production | Mature but declining |

### 5.2 Decision Axes

The choice among these approaches is shaped by several cross-cutting concerns that do not reduce to a single recommendation:

**Collaboration topology.** Applications requiring peer-to-peer collaboration without server dependency (e.g., local network collaboration, end-to-end encrypted documents) must use CRDT libraries. Applications with a natural server authority (e.g., business applications with access control, inventory systems) can leverage simpler sync engine architectures.

**Data model complexity.** Rich text and document editing favor CRDT libraries with editor bindings (Yjs, Automerge) or purpose-built OT systems. Relational data with complex queries favor SQL-based sync engines (PowerSync, Zero, ElectricSQL). JSON document stores favor Automerge, Triplit, or PouchDB/CouchDB.

**Conflict semantics.** Applications where "last write wins" is acceptable (user preferences, configuration) can use simple sync engines. Applications requiring intent preservation (collaborative editing, concurrent inventory updates) need CRDT merge semantics or application-defined mutators.

**Team capacity.** The control-vs-convenience spectrum (Section 3.2) directly maps to engineering investment: full-stack sync platforms (Triplit) minimize setup time but constrain architecture; sync primitives (Replicache, Yjs) maximize flexibility but require substantial engineering effort for production deployment.

## 6. Open Problems and Gaps

### 6.1 CRDT Garbage Collection

CRDTs achieve convergence by monotonically accumulating information—tombstones for deleted elements, metadata tags for conflict resolution, version vectors for causal ordering. Production systems cannot grow unbounded: a 1,000-character document with heavy editing history might internally contain 50,000 tombstones (Duncan, 2025). Garbage collection of CRDT metadata requires consensus among replicas about which metadata is no longer needed, reintroducing the coordination that CRDTs are designed to avoid. No general solution exists; current approaches (Yjs's delete set compaction, Automerge's change pruning) are heuristic and application-specific.

### 6.2 Schema Evolution in Distributed Systems

When replicas operate independently for extended periods, schema changes become a distributed migration problem. Cambria's bidirectional lens approach (Litt et al., 2021) demonstrates that schema evolution can be embedded in the document itself, allowing older clients to read newer schemas and vice versa. However, Cambria remains experimental, and no production CRDT library has integrated schema evolution as a first-class feature. The problem is particularly acute for local-first applications where devices may run different application versions for months.

### 6.3 Large Dataset Synchronization

Most CRDT libraries are optimized for document-scale data (kilobytes to low megabytes). Synchronizing large datasets—thousands of database rows, multimedia assets, large spreadsheets—requires selective sync (syncing only relevant subsets), compression, and incremental transfer. Sync engines like PowerSync and Zero address this through query-based partitioning, but the general problem of efficiently synchronizing large CRDT-managed datasets without centralized coordination remains open.

### 6.4 Authorization and Access Control

Local-first architecture inherently tensions with server-enforced authorization. If the client holds the primary data copy and operates independently, how does the system enforce access control, content moderation, or data validation? Current approaches range from server-side validation on sync (Replicache, PowerSync) to client-side policy enforcement with server attestation (Triplit's sync protocol evicts data when permissions change). No consensus architecture has emerged for fine-grained, dynamic authorization in peer-to-peer local-first systems.

### 6.5 End-to-End Encryption with Collaboration

The local-first manifesto lists privacy as an ideal, suggesting end-to-end encryption. However, E2EE complicates server-mediated sync engines (the server cannot validate, transform, or index encrypted data) and limits query capability (encrypted data cannot be filtered server-side). Solutions like Excalidraw's encrypted collaboration demonstrate feasibility for specific use cases, but general-purpose E2EE local-first applications with rich query and sync capabilities remain an open engineering challenge.

### 6.6 Standardization and Interoperability

The local-first ecosystem lacks interoperability standards. A document created in a Yjs application cannot be opened in an Automerge application; a sync engine built for Replicache cannot communicate with ElectricSQL. The Open Local First initiative and the Ossa Protocol (2025) represent early efforts toward universal sync protocols, but standardization is nascent. The absence of standards creates ecosystem fragmentation and raises longevity concerns—one of the Ink & Switch ideals—since application data is locked to specific CRDT implementations.

### 6.7 Testing and Debugging Distributed State

Testing local-first applications requires simulating network partitions, concurrent modifications, conflict scenarios, and offline-to-online transitions—a combinatorial explosion that traditional testing methodologies are ill-equipped to handle. Formal verification (Lean-yjs for the YATA algorithm) addresses algorithmic correctness but not integration-level behavior. Debugging tools for visualizing CRDT state, operation history, and sync status are limited compared to the mature tooling available for server-centric applications.

### 6.8 Connectivity Detection Reliability

The `navigator.onLine` property and the Network Information API provide imperfect signals about actual connectivity. `navigator.onLine` returns `true` whenever a network interface is active, even without internet access (e.g., connected to a VPN or captive portal). The Network Information API provides connection type and estimated bandwidth but is not universally supported and cannot detect whether specific endpoints are reachable. Reliable offline detection typically requires application-level heartbeats to known endpoints, adding complexity and latency.

## 7. Conclusion

The landscape of optimistic UI and local-first patterns for web applications has evolved from a collection of ad-hoc techniques into a rich architectural discipline with theoretical foundations, production-quality implementations, and an active research frontier. At the theoretical core, CRDTs provide mathematically-grounded convergence guarantees through the algebraic properties of join semilattices, while Operational Transformation offers an alternative coordination model with different complexity and capability trade-offs. The Eg-walker algorithm (2024) demonstrates that these traditions can be synthesized, achieving the convergence properties of CRDTs with the storage efficiency of OT.

The practical ecosystem spans a spectrum from low-level CRDT libraries (Yjs, Automerge, Loro) that provide maximum flexibility with maximum engineering investment, through sync engines (Replicache, Zero, PowerSync, ElectricSQL) that abstract synchronization complexity behind higher-level APIs, to full-stack platforms (Triplit, LiveStore) that offer turnkey local-first operation. Client-side storage has matured from the single option of IndexedDB to a layered stack including OPFS and WASM-compiled SQLite, each with distinct performance characteristics suited to different workload profiles. Service workers and the PWA infrastructure provide the resource-layer complement to data-layer sync engines.

The Ink & Switch seven ideals—fast, multi-device, offline, collaborative, long-lived, private, user-controlled—articulate an aspirational vision that no single implementation fully achieves. Each tool in the current ecosystem makes trade-offs among these ideals: Yjs excels at speed and collaboration but lacks built-in longevity guarantees; Replicache provides excellent developer control but requires server authority; PowerSync offers broad platform support but delegates conflict resolution to the application layer. The open problems—garbage collection, schema evolution, authorization, encryption, standardization, testing—represent the gap between the theoretical promise of local-first computing and its practical realization.

What is clear is that the underlying architectural shift is substantive and accelerating. The first Local-First Conference (2024) and its successors, the proliferation of sync engines, the maturation of CRDT libraries from research prototypes to production systems, and the adoption of local-first principles by companies like Linear, Figma, and Notion indicate that the treatment of the network as optional rather than essential is transitioning from an ideological position to an engineering norm. Whether this transition completes—whether the open problems are solved, whether standardization emerges, whether the developer experience reaches parity with traditional server-centric frameworks—remains an active question that will define the next generation of web application architecture.

## References

Abadi, D. (2012). Consistency tradeoffs in modern distributed database system design. *IEEE Computer*, 45(2), 37–42.

Almeida, P. S., Shoker, A., & Baquero, C. (2018). Delta state replicated data types. *Journal of Parallel and Distributed Computing*, 111, 162–173. https://arxiv.org/abs/1603.01529

Automerge Team. (2023). Introducing Automerge 2.0. https://automerge.org/blog/automerge-2/

Baquero, C., Almeida, P. S., & Shoker, A. (2014). Making operation-based CRDTs operation-based. *Proceedings of the 14th IFIP International Conference on Distributed Applications and Interoperable Systems (DAIS)*. Springer.

Brewer, E. (2000). Towards robust distributed systems. *Proceedings of the ACM Symposium on Principles of Distributed Computing (PODC)*.

Chrome Developers. (2022). SQLite Wasm in the browser backed by the Origin Private File System. https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system

CouchDB Documentation. (2024). CouchDB Replication Protocol. https://docs.couchdb.org/en/stable/replication/protocol.html

Dmonad. (2024). CRDT Benchmarks. https://github.com/dmonad/crdt-benchmarks

Duncan, I. (2025). The CRDT Dictionary: A Field Guide to Conflict-Free Replicated Data Types. https://www.iankduncan.com/engineering/2025-11-27-crdt-dictionary/

Ellis, C. A., & Gibbs, S. J. (1989). Concurrency control in groupware systems. *Proceedings of the 1989 ACM SIGMOD International Conference on Management of Data*, 399–407.

Gentle, J., & Kleppmann, M. (2024). Collaborative text editing with Eg-walker: Better, faster, smaller. *arXiv preprint arXiv:2409.14252*. https://arxiv.org/abs/2409.14252

Gilbert, S., & Lynch, N. (2002). Brewer's conjecture and the feasibility of consistent, available, partition-tolerant web services. *ACM SIGACT News*, 33(2), 51–59.

Glushenkov, A. (2024). Optimistic UI: Making apps feel faster (even when they're not). *Medium*. https://medium.com/@alexglushenkov/optimistic-ui-making-apps-feel-faster-even-when-theyre-not-ea296bc84720

Hearne, S. (2021). Optimistic UI patterns for improved perceived performance. https://simonhearne.com/2021/optimistic-ui-patterns/

Hevery, M. (2023). Resumability. *Qwik Documentation*. https://qwik.dev/docs/concepts/resumable/

Kleppmann, M., Wiggins, A., van Hardenberg, P., & McGranaghan, M. (2019). Local-first software: You own your data, in spite of the cloud. *Proceedings of the 2019 ACM SIGPLAN International Symposium on New Ideas, New Paradigms, and Reflections on Programming and Software (Onward!)*, 154–178. https://www.inkandswitch.com/local-first/

Litt, G., Hardenberg, P. van, & Kleppmann, M. (2021). Cambria: Schema evolution in distributed systems with edit lenses. *Proceedings of the 2021 ACM SIGPLAN International Symposium on New Ideas, New Paradigms, and Reflections on Programming and Software (Onward!)*. https://www.inkandswitch.com/cambria/

Litt, G., Lim, S., Kleppmann, M., & van Hardenberg, P. (2022). Peritext: A CRDT for collaborative rich text editing. *Proceedings of the ACM on Human-Computer Interaction*, 6(CSCW2), Article 531. https://www.inkandswitch.com/peritext/

LiveStore. (2025). LiveStore: Local-first data layer for high-performance apps. https://livestore.dev/

Loro Team. (2024). Introduction to Loro's Rich Text CRDT. https://loro.dev/blog/loro-richtext

Marmelab. (2025). Testing Zero: Rocicorp's ultra-fast sync engine for the web. https://marmelab.com/blog/2025/02/28/zero-sync-engine.html

MDN Web Docs. (2025). Offline and background operation—Progressive web apps. https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation

MDN Web Docs. (2025). Origin Private File System. https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system

MerginIT. (2025). Sync engines compared: ElectricSQL vs Convex vs Zero. https://merginit.com/blog/24082025-sync-engines-guide-electricsql-convex-zero

Nichols, D. A., Curtis, P., Dixon, M., & Lamping, J. (1995). High-latency, low-bandwidth windowing in the Jupiter collaboration system. *Proceedings of the 8th Annual ACM Symposium on User Interface Software and Technology (UIST)*, 111–120.

Nicolaescu, P., Jahns, K., Derntl, M., & Klamma, R. (2016). Yjs: A framework for near real-time p2p shared editing on arbitrary data types. *Engineering the Web in the Big Data Era*, Springer.

Nielsen, J. (1993). *Usability Engineering*. Academic Press.

PowerSync. (2025). Local-First Software: Origins and Evolution. https://www.powersync.com/blog/local-first-software-origins-and-evolution

PowerSync. (2025). The current state of SQLite persistence on the web: November 2025 update. https://www.powersync.com/blog/sqlite-persistence-on-the-web

Rocicorp. (2024). How Replicache Works. https://doc.replicache.dev/concepts/how-it-works

Rocicorp. (2025). Zero Sync Engine. https://zero.rocicorp.dev/

RxDB. (2025). LocalStorage vs. IndexedDB vs. Cookies vs. OPFS vs. WASM-SQLite. https://rxdb.info/articles/localstorage-indexeddb-cookies-opfs-sqlite-wasm.html

Shapiro, M., Preguiça, N., Baquero, C., & Zawirski, M. (2011). A comprehensive study of Convergent and Commutative Replicated Data Types. *INRIA Research Report RR-7506*. https://inria.hal.science/inria-00555588v1/document

Shapiro, M., Preguiça, N., Baquero, C., & Zawirski, M. (2011). Conflict-free Replicated Data Types. *Stabilization, Safety, and Security of Distributed Systems (SSS 2011)*, Springer. https://link.springer.com/chapter/10.1007/978-3-642-24550-3_29

TanStack. (2025). Optimistic Updates. https://tanstack.com/query/v5/docs/react/guides/optimistic-updates

Tolinski, S. (2025). The spectrum of local-first libraries. https://tolin.ski/posts/local-first-options

Triplit. (2024). Triplit 1.0: The database that's in sync with your frontend. https://www.triplit.dev/blog/triplit-1.0

Weidner, M. (2024). Architectures for central server collaboration. https://mattweidner.com/2024/06/04/server-architectures.html

Yjs Documentation. (2025). Awareness Protocol. https://docs.yjs.dev/api/about-awareness

Zero Sync Engine Blog. (2024). Reverse engineering Linear's sync magic. https://marknotfound.com/posts/reverse-engineering-linears-sync-magic/

## Practitioner Resources

### CRDT Libraries

- **Yjs** — High-performance CRDT framework for collaborative editing. Pure JavaScript, modular provider system, extensive editor bindings. Best-in-class speed for text editing workloads. https://github.com/yjs/yjs
- **Automerge** — JSON-compatible CRDT with full edit history. Rust core compiled to WASM. Rich data model supporting maps, lists, text, counters. https://github.com/automerge/automerge
- **Loro** — Rust-based CRDT with Peritext-compliant rich text, movable trees, and Replayable Event Graph model. Approaching production readiness. https://github.com/loro-dev/loro

### Sync Engines

- **Replicache** — Client-side sync framework with git-like rebase protocol. Application-defined mutators for conflict resolution. Production-ready. https://replicache.dev/
- **Zero** — Query-driven sync engine with client-side SQLite replica and Incremental View Maintenance. Alpha/beta status. https://zero.rocicorp.dev/
- **PowerSync** — Postgres/MongoDB-to-SQLite sync engine with declarative sync rules. Broad SDK support (Web, React Native, Flutter, Kotlin, Swift). https://www.powersync.com/
- **ElectricSQL** — Postgres sync engine using CRDTs for automatic conflict resolution. Deep Postgres integration. https://electric-sql.com/
- **Triplit** — Full-stack syncing database with CRDT data model, live queries, and pluggable storage. Production-ready (v1.0). https://www.triplit.dev/
- **LiveStore** — Event-sourcing-based state management with reactive SQLite and git-inspired sync. Expo integration for mobile. https://livestore.dev/

### Client-Side Storage

- **Dexie.js** — Streamlined IndexedDB wrapper (~29KB minified) with batched transactions and cloud sync capabilities. https://dexie.org/
- **RxDB** — Reactive NoSQL database with multiple storage backends (IndexedDB, OPFS, SQLite) and real-time sync. https://rxdb.info/
- **wa-sqlite** — WebAssembly SQLite with multiple VFS implementations including OPFS. OPFSCoopSyncVFS recommended for general use. https://github.com/niclasengelbrechtsen/niclas-niclasengelbrechtsen.github.io
- **PGlite** — Postgres compiled to WASM, running in the browser with full SQL support. https://pglite.dev/

### Research and Reference

- **Ink & Switch Local-First Essay** — The foundational manifesto defining seven ideals for local-first software. Essential reading. https://www.inkandswitch.com/local-first/
- **crdt.tech** — Academic resource hub with papers, implementations, and glossary. https://crdt.tech/
- **CRDT Benchmarks** — Reproducible benchmark suite comparing Yjs, Automerge, Loro, and others. https://github.com/dmonad/crdt-benchmarks
- **Local-First Conf** — Annual conference on local-first software engineering. Talks, resources, and community. https://www.localfirstconf.com/
- **Matthew Weidner's Server Architectures** — Taxonomy of central server collaboration patterns with practical framework for choosing approaches. https://mattweidner.com/2024/06/04/server-architectures.html
- **Eg-walker Paper** — The OT-CRDT hybrid algorithm achieving best-of-both-worlds performance. https://arxiv.org/abs/2409.14252
- **Peritext Paper** — CRDT algorithm for intent-preserving rich text collaboration. https://www.inkandswitch.com/peritext/
- **Awesome Local-First** — Community-curated list of local-first resources, libraries, and articles. https://github.com/alexanderop/awesome-local-first
