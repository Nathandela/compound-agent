---
title: "Real-time and Collaborative UX in Web Applications"
date: 2026-03-25
summary: Surveys the technical foundations, consistency models, data structures, library ecosystem, transport mechanisms, and UX design patterns of real-time and collaborative web applications, from Operational Transformation and CRDTs through presence indicators, undo semantics, version history, and the local-first software movement.
keywords: [web-apps, real-time, collaboration, crdt, operational-transformation, local-first]
---

# Real-time and Collaborative UX in Web Applications

*2026-03-25*

## Abstract

Real-time and collaborative web applications occupy an expanding design space stretching from lightweight co-presence indicators to fully peer-to-peer local-first document systems. This survey synthesizes the theoretical foundations, algorithmic mechanisms, library ecosystem, transport architectures, and practitioner UX patterns that constitute this domain. Two consistency primitives dominate: Operational Transformation (OT), which achieves convergence through server-mediated transformation of concurrent operations, and Conflict-free Replicated Data Types (CRDTs), which guarantee convergence through algebraic properties (commutativity, associativity, idempotency) without centralized coordination. The local-first software movement (Kleppmann et al., 2019) reframes both technical and ownership concerns, positioning CRDTs as the enabling technology for applications that remain fully functional offline while supporting seamless multi-party synchronization. The UX layer above these primitives—covering presence awareness, conflict resolution affordances, undo semantics, version history, permission models, notification design, and scale architecture—constitutes an equally rich design problem. This survey examines all layers without prescriptive recommendation, mapping the landscape and its unresolved tensions.

## 1. Introduction

The shared document problem has occupied computer science since the earliest network experiments. Engelbart's NLS (1968) demonstrated that distributed teams could work on shared hypermedia; Ellis and Gibbs's groundbreaking 1989 paper on Groupware defined the synchronous/asynchronous matrix that still structures CSCW research today. [operationalTransformationWikipedia](https://en.wikipedia.org/wiki/Operational_transformation) The emergence of the web as the dominant application platform shifted the problem from specialized groupware to general-purpose collaborative software, with Google Docs (2006) as the inflection point that made real-time co-editing a mass-market expectation.

The difficulty of building collaborative software arises from a fundamental tension in distributed systems: enabling multiple parties to modify shared state without coordination produces conflicts, yet requiring coordination reintroduces latency and single points of failure. This is the classic CAP theorem situation applied to human-readable documents: consistency, availability, and partition tolerance cannot simultaneously be maximized. [wikiCRDT](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type)

Two decades of research have produced two principal algorithmic responses. Operational Transformation transforms the parameters of concurrent operations so they remain semantically consistent after reordering. CRDTs design data structures whose merge operation is mathematically guaranteed to produce identical results regardless of operation order, message arrival order, or network partitions. Both families have been deployed at scale; both carry inherent trade-offs in complexity, performance, and expressiveness.

Above the algorithmic layer, a richer UX design space has emerged. Collaborative applications must communicate social presence (who else is here, what are they doing), manage the cognitive overhead of concurrent changes, provide affordances for reviewing and reverting history, enforce access permissions that may be granular and contextual, and deliver notifications that inform without overwhelming. These concerns interact non-trivially: a permission model that allows fine-grained annotation affects how version history must be stored; an undo system that is predictable in a solo context becomes ambiguous when multiple users undo concurrently.

This survey proceeds from foundations through algorithms, libraries, transport mechanisms, and UX patterns, concluding with comparative synthesis and open problems.

## 2. Foundations

### 2.1 The CSCW Framework

Computer-Supported Cooperative Work (CSCW) research, formalized by Greif and Cashman (1986) and systematized by Ellis, Gibbs, and Rein (1991), provides the conceptual framework for classifying collaborative software. The two-by-two time/space matrix—same-time same-place, same-time different-place, different-time same-place, different-time different-place—maps directly to the collaboration spectrum this survey addresses. [cscwWikipedia](https://en.wikipedia.org/wiki/Computer-supported_cooperative_work)

Real-time collaboration occupies the "same-time different-place" quadrant; asynchronous collaboration the "different-time" quadrants. Near-real-time collaboration—where updates propagate within seconds rather than milliseconds—occupies a pragmatically important middle zone. The technical requirements differ significantly across these modes: real-time collaboration demands sub-100ms propagation and sophisticated conflict handling; asynchronous collaboration tolerates higher latency but requires robust merge semantics and clear notification channels.

### 2.2 Consistency Models

Distributed systems literature defines a hierarchy of consistency levels. Strong consistency guarantees that all reads reflect the most recent write across all replicas; this requires synchronous coordination and sacrifices availability during partitions. Eventual consistency guarantees only that all replicas will converge to the same state eventually if they receive the same set of updates. Strong eventual consistency (SEC), introduced formally by Shapiro et al. (2011), strengthens eventual consistency with a determinism requirement: whenever any two replicas have received the same set of updates (possibly in different orders), they are in identical states. [shapiroSEC](https://inria.hal.science/inria-00609399v1/document)

SEC is the consistency property that CRDTs are designed to provide. It is strictly weaker than strong consistency—CRDTs do not guarantee that all clients see writes in real time—but it is stronger than plain eventual consistency because it eliminates non-determinism in the merge outcome. The SEC guarantee enables local-first architectures where devices can operate independently for extended periods and merge deterministically on reconnection.

### 2.3 The CAP Theorem and Collaboration Trade-offs

Brewer's CAP theorem (2000, formalized by Gilbert and Lynch 2002) states that a distributed data store can provide at most two of: Consistency, Availability, and Partition tolerance. Real-time collaborative applications typically favor AP (Availability + Partition tolerance), accepting eventual consistency for the sake of offline operation and resilience to network interruption. CRDTs are an AP-system primitive; OT as typically implemented depends on server availability for transformation, making it closer to CP during the transformation phase.

PACELC, a refinement of CAP by Abadi (2012), adds latency to the framework: even during normal operation without partitions, there is a trade-off between latency and consistency. Collaborative systems that commit locally before propagation (optimistic local-first updates) accept higher consistency uncertainty to achieve lower perceived latency.

### 2.4 The CAP Theorem Applied to UX

The fundamental distributed systems constraint has direct UX consequences. When a client applies a local edit optimistically before confirmation, the user perceives instant responsiveness but may later discover that the edit was reordered, transformed, or rolled back. This creates a UX requirement: the system must either prevent the user from seeing intermediate inconsistent states (requires hiding latency entirely, which is only feasible for fast networks), or provide affordances that make the eventual consistency process comprehensible—for example, animated merge indicators, activity feeds, or conflict dialogs.

## 3. Taxonomy of Approaches

Table 1 maps the primary algorithmic and architectural families addressed in this survey, organized by consistency mechanism and coordination topology.

**Table 1. Taxonomy of real-time collaborative UX approaches**

| Family | Coordination topology | Consistency guarantee | Representative systems |
|---|---|---|---|
| 1) Operational Transformation (OT) | Server-mediated (hub-and-spoke) | Convergence via server ordering | Google Docs, Etherpad, Quill OT |
| 2) State-based CRDTs (CvRDT) | Peer-to-peer or any | Strong eventual consistency (SEC) | G-Counter, LWW-Register, Riak |
| 3) Operation-based CRDTs (CmRDT) | Any (reliable delivery) | Strong eventual consistency | OR-Set, RGA, Logoot |
| 4) Sequence CRDTs for text | Any | SEC for ordered sequences | RGA (Roh 2011), LSEQ, Fugue |
| 5) Rich-text CRDTs | Any | SEC for formatted text | Peritext (Litt et al. 2022) |
| 6) Managed CRDT libraries | Client–server hybrid | Library-defined | Yjs, Automerge, Loro |
| 7) Collaboration infrastructure | Server-managed state | Platform-defined | Liveblocks, PartyKit, Ably |
| 8) Local-first software | Peer-to-peer; server optional | SEC + offline | Automerge, Yjs + local storage |
| 9) Locking / pessimistic concurrency | Server-enforced locks | No conflicts (serialized) | GitLab file editing, some CMSes |
| 10) Snapshot/version branching | Server or CRDT-backed | No real-time merging | Git, Figma version history |

## 4. Analysis

### 4.1 Operational Transformation

#### Theory

Operational Transformation was introduced by Ellis and Gibbs (1989) and formalized through a decade of subsequent work. The core idea is: when two concurrent operations arrive at a replica in an order different from the order they were generated, transform one operation with respect to the other so that applying the transformed operation produces the intended semantic result.

The transformation must satisfy two correctness criteria, defined as CP1 and CP2 by Sun et al. (1998) in the foundational CSCW'98 paper: [sunEllis1998](https://dl.acm.org/citation.cfm?id=289469)

- **CP1 (Convergence):** Given operations `O1` and `O2` generated concurrently on equivalent states, `O2 ∘ T(O1, O2) = O1 ∘ T(O2, O1)` — applying both operations in any order with appropriate transformation produces the same final state.
- **CP2 (Intention preservation):** The transformation must preserve the semantic intention of the original operation in the context of the concurrent operation.

The Jupiter system (Nichols et al., UIST 1995) pioneered a client-server OT architecture that constrains the problem to two concurrent participants (client and server), making the transformation function tractable. Google Wave (2009) and Google Docs adopted this two-party constraint. [googleWaveOT](https://svn.apache.org/repos/asf/incubator/wave/whitepapers/operational-transform/operational-transform.html)

#### Correctness Problems

The correctness of OT algorithms has proven elusive. The original dOPT algorithm, proposed by Ellis and Gibbs, was later shown to fail in scenarios involving more than two concurrent clients (the "dOPT puzzle"). Multiple research groups independently discovered cases where dOPT could not ensure convergence when operations from three or more sites were combined. [otWikipedia](https://en.wikipedia.org/wiki/Operational_transformation)

Proving CP1 and CP2 for realistic operations beyond character insert/delete requires formal verification. Li and Li (2010) noted that "due to the need to consider complicated case coverage, formal proofs are very complicated and error-prone, even for OT algorithms that only treat two characterwise primitives." A former Google Wave engineer famously wrote: "Unfortunately, implementing OT sucks... The algorithms are really hard and time consuming to implement correctly. [...] Wave took 2 years to write and if we rewrote it today, it would take almost as long to write a second time." [hackernewsOT](https://news.ycombinator.com/item?id=1354427)

#### Google Docs Implementation

Google Docs uses OT with a central server that defines a single authoritative ordering of all operations. Each client maintains a local copy of the document and sends operations to the server with a revision number indicating the document state at which the operation was generated. The server transforms incoming operations against all operations it has received since that revision, then broadcasts the transformed operation to all other clients. The server's single ordering of operations sidesteps the multi-party convergence problem by making the server the sole authority for the operation order. [googledriveBlog](https://drive.googleblog.com/2010/09/whats-different-about-new-google-docs.html) [devtoDhanush](https://dev.to/dhanush___b/how-google-docs-uses-operational-transformation-for-real-time-collaboration-119)

This architecture provides strong convergence guarantees—all clients eventually converge to the server's authoritative state—but at the cost of server dependency: clients cannot operate independently and later merge. Offline editing in Google Docs is limited because the central transform arbiter is unavailable.

#### Strengths and Limitations

OT's principal strength is its natural alignment with existing document semantics: operations correspond to user intentions (insert text at position X, delete selection Y), and the transformation function can be designed to preserve those intentions under permutation. The server-centric model simplifies the correctness argument and avoids the complexity of peer-to-peer merge.

OT's principal limitations are: (1) dependence on a central server, creating availability and latency coupling; (2) algorithmic complexity that makes correct implementation difficult and error-prone; (3) difficulty extending the operation set beyond basic insert/delete to rich formatting, structural changes, or multi-document operations; and (4) inherent inapplicability to peer-to-peer or fully offline scenarios.

### 4.2 CRDTs: Theory and Mathematical Foundations

#### Shapiro et al. (2011)

The formal CRDT framework was established by Marc Shapiro, Nuno Preguiça, Carlos Baquero, and Marek Zawirski in two 2011 papers: "Conflict-free Replicated Data Types" (SSS 2011) and the INRIA technical report RR-7687. [shapiroCRDT](https://link.springer.com/chapter/10.1007/978-3-642-24550-3_29) [shapiroRR7687](https://pages.lip6.fr/Marc.Shapiro/papers/RR-7687.pdf) These papers provided the first unified theoretical treatment of data types whose replicas converge without coordination, introducing the Strong Eventual Consistency guarantee and proving convergence conditions for both state-based and operation-based approaches.

#### State-Based CRDTs (CvRDTs)

State-based CRDTs propagate their entire local state to other replicas. The merge function must satisfy monotone semilattice properties:

- **Commutative:** `merge(a, b) = merge(b, a)` — order of merging does not matter
- **Associative:** `merge(merge(a, b), c) = merge(a, merge(b, c))` — grouping does not matter
- **Idempotent:** `merge(a, a) = a` — merging the same state twice has no additional effect

These properties guarantee that any two replicas that have received the same set of state updates will be in identical states, regardless of the order in which they received those updates. [crdtTech](https://crdt.tech/)

**G-Counter (Grow-only Counter):** The simplest CRDT. Each replica maintains a vector of per-replica increment counts. The local value is the sum of all entries. Merge takes the component-wise maximum. Since counters only increment, the lattice order is total and convergence is trivially guaranteed. [wikiCRDT](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type)

**LWW-Register (Last-Write-Wins Register):** Stores a value with a timestamp. Merge selects the value with the highest timestamp. This is semantically simple but requires synchronized clocks or globally unique timestamps (e.g., Lamport timestamps with replica IDs as tiebreakers). LWW-Register is widely deployed in production systems including Cassandra and DynamoDB. Its limitation is that one of two concurrent writes is always silently discarded—an acceptable semantics for some domains (user profile picture) but not others (document text). [bartoszczCRDT](https://www.bartoszsypytkowski.com/the-state-of-a-state-based-crdts/)

#### Operation-Based CRDTs (CmRDTs)

Operation-based CRDTs broadcast operations rather than states. The operations must be:

- **Commutative:** Concurrent operations (causally unrelated) can be applied in any order
- **Delivered at most once** (the transport layer must guarantee at-most-once delivery of each operation)
- **Causal order preserved** (causally related operations must arrive in causal order)

Operation-based CRDTs typically generate smaller network messages than state-based ones (an operation vs. the entire state), making them preferable for high-throughput collaborative editing. Most modern collaborative editing libraries (Yjs, Automerge) use operation-based approaches with delta-state hybrids for reconnection.

**OR-Set (Observed-Remove Set):** Supports add and remove operations on a set with the semantics "observed removes win." Each add operation tags the element with a unique identifier; remove sends the specific tag. If add and remove are concurrent, the add wins because only tagged removes are processed. [wikiCRDT](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type)

#### Formal Verification

The CRDT framework has been subject to formal verification. The 2017 paper "Verifying Strong Eventual Consistency in Distributed Systems" (Gomes et al., OOPSLA 2017) used Isabelle/HOL to mechanically prove SEC for several CRDT implementations, providing machine-checked confidence in their convergence guarantees. [arxivVerifying](https://arxiv.org/pdf/1707.01747)

### 4.3 Sequence CRDTs for Collaborative Text Editing

Text editing requires an ordered sequence CRDT—a data structure supporting concurrent insertions and deletions with a stable, convergent ordering. Several designs have been proposed.

#### RGA (Replicated Growable Array)

RGA was introduced by Roh et al. in "Replicated Abstract Data Types: Building Blocks for Collaborative Applications" (JPDC, 2011). [rgaRoh2011](http://csl.skku.edu/papers/jpdc11.pdf) RGA implements a sequence as a linked list where each element is tagged with a unique timestamp. The `addRight(v, a)` operation inserts element `a` immediately after element `v`. Concurrent insertions at the same position are resolved by comparing timestamps, with higher timestamps taking priority—producing a deterministic but potentially non-intuitive character ordering that the CRDT algorithm ensures is identical across all replicas.

RGA's key insight is that elements are never removed from the list; deleted elements are marked as "tombstones" that remain in the structure but are hidden from users. This allows positions to remain stable references even as other elements are deleted. Tombstone accumulation is a significant memory overhead in long-lived documents, motivating periodic garbage collection or compaction strategies.

#### LSEQ and Logoot

LSEQ (Nédelec et al., 2013) and Logoot (Weiss et al., 2009) assign each element a unique identifier in a sparse identifier space, enabling O(log n) insertion at arbitrary positions. Unlike RGA's linked-list approach, these positional identifiers allow elements to be compared without traversing the structure. The trade-off is identifier explosion: as more concurrent insertions occur at the same logical position, identifier lengths grow, increasing per-element overhead.

#### Fugue (2023)

Fugue is a sequence CRDT designed by Weidner, Gentle, and Kleppmann (2023) specifically to minimize interleaving anomalies—cases where concurrent insertions produce unexpected character orderings. Fugue maintains an explicit tree structure for insertion ordering that avoids the pathological interleaving cases that can occur in RGA and LSEQ when many concurrent users insert at the same position. Loro, a newer CRDT library, implements Fugue as its sequence primitive. [loroDev](https://loro.dev/)

#### Peritext: Rich-Text CRDTs

Plain-text sequence CRDTs handle character insertion and deletion but cannot represent rich formatting (bold, italic, links) because formatting spans must be associated with character ranges that may be concurrently modified.

Peritext (Litt, Lim, Kleppmann, van Hardenberg; CSCW 2022) introduced the first principled CRDT for rich-text formatting. The key insight is to anchor format spans to specific character insertion IDs rather than to positional indices. Because character IDs are stable (they do not change when other characters are inserted or deleted), format operations remain valid even as the surrounding text is concurrently modified. Merge is achieved by a deterministic algorithm that computes the final formatting state from all format operations in causal order. [peritext](https://www.inkandswitch.com/peritext/) [peritextACM](https://dl.acm.org/doi/abs/10.1145/3555644)

### 4.4 Yjs

Yjs, authored by Kevin Jahns, is a CRDT framework designed for building collaborative web applications. It implements an operation-based sequence CRDT (YATA—Yet Another Transformation Approach) and exposes shared data types including `Y.Text`, `Y.Array`, `Y.Map`, and `Y.XmlFragment`.

#### Architecture

Yjs uses a compound representation that groups consecutive insertions by the same client into single `Item` objects rather than creating one object per character. This dramatically reduces memory overhead: a 100k character document created through normal typing (predominantly left-to-right consecutive insertions) results in approximately 11,000 Item objects rather than 100,000. [kevinjahns](https://blog.kevinjahns.de/are-crdts-suitable-for-shared-editing)

Internally, Yjs maintains an `StructStore` mapping each client ID to a sorted list of `Item` objects ordered by sequence number. Deleted items remain as `GC` (garbage-collected) structs, compressing tombstones.

#### Performance

The `dmonad/crdt-benchmarks` benchmark suite measures encoding size, parse time, memory consumption, and operation throughput. Yjs demonstrates: [crdtBenchmarks](https://github.com/dmonad/crdt-benchmarks)

- Worst-case benchmark (1M right-to-left insertions): ~112 MB memory, 368ms parse time, ~1 MB encoded size
- Real-world scenario (260k operations on a conference paper): ~19.7 MB memory, 10,971 Item objects, 20ms parse time

In independent performance comparisons, Yjs is "30x faster than a reference-crdts implementation, uses only about 10% as much RAM, and is 300x faster than automerge [v1]." Automerge 2.0 significantly closed this gap.

#### Ecosystem

Yjs integrates with ProseMirror, Quill, CodeMirror, Monaco, TipTap, Slate, and other editors via provider packages. Network providers include `y-websocket` (server-mediated), `y-webrtc` (peer-to-peer), and `y-indexeddb` (local persistence). [yjsDocs](https://docs.yjs.dev)

### 4.5 Automerge

Automerge was originally developed by Martin Kleppmann and collaborators as part of the local-first research agenda at Ink & Switch. It implements a JSON document CRDT where the entire document state—nested maps, lists, and text—is conflict-free replicated. [automergeHN](https://news.ycombinator.com/item?id=40976731)

#### Automerge 2.0

Automerge 2.0, released in 2023, rewrote the core in Rust and exposed JavaScript bindings through WebAssembly. This architectural change addressed the performance gap with Yjs: Automerge 2.0 achieves comparable performance for most workloads while offering a richer API for structured JSON documents. [automerge2HN](https://news.ycombinator.com/item?id=34586433)

The Automerge format uses columnar encoding for operation logs—inspired by Automerge's Rust rewrite and subsequently adopted by Loro—which allows efficient WASM-side processing and compact binary serialization.

#### Upwelling

The Upwelling project (Ink & Switch, 2023) built an experimental collaborative writing environment on an extended Automerge fork, adding rich-text support and a version-control metaphor for writers (private drafts, named commits, merge requests). Upwelling demonstrated that CRDT-based collaborative editing can support non-linear version history workflows inspired by Git without requiring the complexity of distributed version control systems. [upwelling](https://www.inkandswitch.com/upwelling/)

### 4.6 Liveblocks and PartyKit

Beyond raw CRDT libraries, a new generation of collaboration infrastructure platforms abstracts the network, presence, and storage layers.

**Liveblocks** provides managed WebSocket infrastructure with purpose-built APIs for Presence, Storage (based on CRDTs), Broadcast, and Comments. Developers integrate Liveblocks via React hooks or vanilla JavaScript; the platform handles connection management, authentication, and scaling. Liveblocks Storage uses a custom CRDT implementation with LiveList, LiveMap, and LiveObject types that synchronize across clients in real time. [liveblocksIO](https://liveblocks.io/)

**PartyKit**, founded in 2023 and acquired by Cloudflare in 2024, provides a programming model for stateful real-time servers. Each "party" (room) runs as a Durable Object on Cloudflare's edge network, approximately 50ms from 95% of global internet users. PartyKit's model is lower-level than Liveblocks—developers write server-side JavaScript that handles WebSocket connections, state, and broadcast logic—but benefits from edge deployment and deep integration with the Cloudflare ecosystem. [cloudflarePartyKit](https://blog.cloudflare.com/cloudflare-acquires-partykit/) [partykitJoining](https://blog.partykit.io/posts/partykit-is-joining-cloudflare/)

Durable Objects provide a critical architectural primitive: each object instance runs in a single location, eliminating the need for distributed consensus within a session while still providing global availability through Cloudflare's network. This "local" within a Durable Object maps naturally to the session-level synchronization pattern of collaborative documents.

### 4.7 Local-First Software

The local-first software manifesto (Kleppmann, Wiggins, van Hardenberg, McGranaghan; Onward! 2019, ACM SIGPLAN) argued that the cloud-centric software model—where user data lives on servers operated by third parties—creates problematic dependencies on vendor availability, internet connectivity, and corporate data stewardship. [localFirstACM](https://dl.acm.org/doi/10.1145/3359591.3359737) [localFirstEssay](https://www.inkandswitch.com/essay/local-first/)

#### The Seven Ideals

The manifesto articulates seven properties that local-first software should exhibit:

1. **No spinners:** Operations respond instantly without waiting for server round-trips
2. **Multi-device access:** Data synchronizes across all personal devices
3. **Optional network:** The software functions fully offline, syncing when connectivity returns
4. **Seamless collaboration:** Multiple users edit simultaneously without conflicts
5. **The Long Now:** Data remains accessible indefinitely, surviving software shutdowns
6. **Security and privacy by default:** End-to-end encryption; servers hold only encrypted copies
7. **Ultimate ownership and control:** Users retain complete agency over their data

CRDTs are positioned as the enabling technology: "data structures that are multi-user from the ground up while also being fundamentally local and private." The manifesto's prototypes (Trellis, Pixelpusher, PushPin) demonstrated that CRDTs work reliably for real applications and that offline-first UX is qualitatively superior to spinner-dependent cloud applications.

#### Practical Adoption

Linear (the project management tool) implements a local-first architecture using IndexedDB as the primary client-side database, with WebSocket-based synchronization to the server. Every action happens locally first, eliminating perceived latency for the user. [scalingLinear](https://linear.app/now/scaling-the-linear-sync-engine) [linearLocalFirst](https://bytemash.net/posts/i-went-down-the-linear-rabbit-hole/)

Notion shipped offline mode in August 2025 after migrating its architecture to use CRDTs for pages marked as offline-available. The migration reportedly represented "one of the largest production CRDT systems" for Notion's use case. Notably, Notion adopted a hybrid: CRDTs for document structure (block insertions/deletions) but OT for text within blocks, reflecting the different trade-offs appropriate for each data type. [notionOffline](https://www.notion.com/blog/how-we-made-notion-available-offline)

### 4.8 Presence Indicators and Awareness

Awareness—the ability to perceive the activities, locations, and states of collaborators—is a primary social feature of collaborative software, directly affecting how natural and coordinated collaborative work feels.

#### Cursor Presence

Live cursors transmit each collaborator's pointer position, rendered with a distinctive color and name label. In documents, cursors indicate the current insertion point; in canvas applications like Figma and Miro, they track mouse position across an infinite canvas. The UX challenge with live cursors is density: beyond approximately four concurrent users, cursor overlays introduce visual noise that exceeds the cognitive benefit of awareness. Figma addresses this through opacity reduction for distant cursors and name-label visibility only on nearby or recently moved cursors. [ablyUX](https://ably.com/blog/collaborative-ux-best-practices)

#### Avatar Stacks

Virtually all collaborative editors render an avatar stack (stacked profile pictures or initials) in the document toolbar showing currently active users. This pattern originated in Google Docs and has become a standard affordance. Avatar stacks typically collapse beyond four or five users into a "+N" overflow indicator, providing ambient awareness without interface pollution.

#### Selection Highlights

When a collaborator has text or objects selected, overlaying a translucent colored highlight (matching the collaborator's cursor color) communicates what they are currently working on before they make edits. This transforms the awareness model from "where are they" to "what are they about to do," enabling implicit coordination without explicit communication.

#### Typing Indicators

In chat and comment contexts, typing indicators (the familiar "..." animation) provide sub-second social feedback that a response is in progress. In document contexts, typing indicators are less common because the selection highlight already conveys active editing.

#### The Awareness Information Model

Yjs models awareness as a separate protocol from document synchronization via `y-protocols/awareness`. Each client maintains a local awareness state (cursor position, user metadata, custom fields) and broadcasts updates using a gossip protocol. Unlike document changes, awareness updates are not persisted—they reflect ephemeral presence state that is valid only while the connection is open. [yjsDocs](https://docs.yjs.dev)

Liveblocks provides a first-class Presence API that integrates awareness into its managed infrastructure, allowing developers to broadcast arbitrary per-user presence state (cursor, selected nodes, active tools) with automatic lifecycle management (clearing state on disconnection). [liveblocksPresence](https://liveblocks.io/presence)

### 4.9 Conflict Resolution UX

Mathematical convergence guarantees that all replicas reach the same state, but they do not guarantee that the converged state is what any user intended. When two users concurrently modify the same region of a document or the same property of an object, the CRDT or OT algorithm will produce a deterministic merge result—but that result may surprise users who expected their edit to "win."

#### Transparent vs. Opaque Merging

Most consumer collaborative applications use transparent merging: edits from concurrent users are automatically merged into the document without surfacing a conflict dialog. This approach works well for text editing (where concurrent edits to non-overlapping regions trivially merge) and produces plausible results even for overlapping edits (both insertions are preserved, positioned deterministically). The cost is that users may discover unexpected content without understanding why it appeared.

Opaque conflict detection—surfacing merge conflicts to users and requiring manual resolution—is standard in version-control workflows (Git's merge conflicts) but rare in real-time collaborative editors. The VS Code merge editor explores three-way visual merge for Git conflicts, presenting the user's version, the incoming version, and a live output, with tools to cherry-pick lines from either side. [vsCodeMerge](https://github.com/microsoft/vscode/issues/146091) This pattern is not yet common in real-time collaboration but represents a direction for more explicit conflict UX.

#### Property-Level Conflicts

Conflicts become more visible at the property level. Notion's CRDT system "handles text merges well, but text isn't the only thing in workspaces—database properties like select fields, dates, and relations don't merge, and when two people edit the same property offline, only one version survives and the other is silently overwritten." [notionOffline](https://www.notion.com/blog/how-we-made-notion-available-offline) This is a UX consequence of LWW-Register semantics for scalar properties: convergence is guaranteed, but semantic loss occurs without notification.

#### Conflict Prevention via Locking

Some collaborative systems avoid merging entirely by locking entities when a user is actively editing them. Content management systems with "currently editing" indicators, Google Sheets (which does allow concurrent edits to different cells but effectively prevents conflicts through cell-level granularity), and CAD tools (Onshape's version/branch/merge model) use variations of optimistic locking. The UX trade-off is between merge complexity and editing latency: locked-entity models eliminate merge uncertainty but require users to wait for locks to be released.

### 4.10 Latency Hiding and Optimistic Updates

The primary mechanism for making collaborative applications feel fast despite network round-trips is optimistic local application of user edits. The client applies the edit to its local state immediately, renders the change in the UI, and concurrently sends the operation to the server or peer. If the server responds with a transformed version of the operation (OT) or with conflicting operations from other clients (CRDT), the client reconciles its local state.

#### The "Ghost" Problem

When optimistic updates are applied before remote state is received, clients may briefly display inconsistent states—for example, a cursor jumping as remote operations arrive and are inserted before the local cursor position. Yjs addresses this by maintaining a stable cursor anchor (pointing to a specific `Item` ID rather than a character offset) that remains valid under concurrent insertions. Zed's CRDT uses explicit "anchors" defined as `(insertion_id, offset)` pairs for the same purpose, ensuring that cursor positions remain semantically stable under arbitrary concurrent edits. [zedCRDTs](https://zed.dev/blog/crdts)

#### Read-Your-Writes Consistency

A minimum UX requirement is read-your-writes: a user must always see their own edits immediately after making them. In OT systems, this is trivially guaranteed because the client applies operations locally before sending them to the server. In CRDT systems with network latency, IndexedDB-backed local storage typically provides read-your-writes through the local replica, which is updated synchronously.

#### React 19 useOptimistic

React 19 introduced a built-in `useOptimistic()` hook that formalizes the optimistic update pattern: the hook applies an optimistic update to local state immediately while an async operation is in flight, then reverts if the operation fails or replaces the optimistic state with the confirmed server state on success. [reactOptimistic](https://www.freecodecamp.org/news/how-to-use-the-optimistic-ui-pattern-with-the-useoptimistic-hook-in-react/)

### 4.11 Transport Mechanisms

The network layer mediates all real-time state propagation. The choice of transport affects latency, connection overhead, directionality, browser support, and infrastructure cost.

#### WebSocket

WebSocket (RFC 6455, standardized 2011) provides full-duplex bidirectional communication over a persistent TCP connection. A WebSocket handshake upgrades an HTTP connection, after which either side can send framed messages at any time with minimal overhead (~2-14 bytes per frame). WebSocket is the de facto standard transport for collaborative editing applications. [ably_WebSocketSSE](https://ably.com/blog/websockets-vs-sse)

The fundamental challenge of WebSocket at scale is statefulness: each WebSocket connection pins a user to a specific server process. When a document session spans thousands of concurrent users, operations must be broadcast to all participants who may be connected to different server processes. The standard architectural solution is a publish-subscribe message bus (Redis Pub/Sub, Kafka) or a shared in-memory state layer that bridges server processes. [ablyWebSocketArch](https://ably.com/topic/websocket-architecture-best-practices)

#### WebRTC

WebRTC enables direct peer-to-peer communication between browsers using UDP (via SRTP/DTLS for security). After a signaling phase (typically via a WebSocket-based server to exchange SDP offers and ICE candidates), peers communicate directly. WebRTC data channels (`RTCDataChannel`) provide the equivalent of WebSocket channels between peers, with the option of unreliable (UDP) or reliable (SCTP over UDP) delivery semantics. [ably_WebRTCWebSocket](https://ably.com/topic/webrtc-vs-websocket)

WebRTC's advantages for collaborative applications include lower latency (UDP circumvents TCP's head-of-line blocking), reduced server load (peer-to-peer removes the server from the critical path after connection establishment), and alignment with local-first principles (peers can synchronize without a server). Its disadvantages include complex connection establishment (especially through symmetric NATs), dependency on STUN/TURN servers for peer discovery, and additional complexity for sessions involving more than two participants (requiring either a mesh topology or an SFU media server).

Yjs's `y-webrtc` provider uses WebRTC for peer-to-peer synchronization with a WebSocket-based signaling server as a fallback for peers that cannot connect directly. [yjsDocs](https://docs.yjs.dev)

#### Server-Sent Events (SSE)

SSE (the `EventSource` API) provides unidirectional server-to-client streaming over HTTP. The server sends a stream of `event:` and `data:` lines; the client receives them as DOM events. SSE is simpler to implement than WebSocket (it works over regular HTTP, passes through more proxies, and provides automatic reconnection), but its unidirectionality requires a separate HTTP POST channel for client-to-server messages. SSE is well-suited for read-heavy collaborative scenarios (activity feeds, presence broadcasting, live dashboards) where most data flows from server to client. [ably_WebSocketSSE](https://ably.com/blog/websockets-vs-sse)

#### WebTransport

WebTransport is an emerging W3C standard (draft as of 2025, charter expires December 2025) built on HTTP/3 and QUIC. It provides both reliable bidirectional streams (analogous to WebSocket) and unreliable datagrams (analogous to UDP), multiplexed over a single QUIC connection. QUIC eliminates TCP's head-of-line blocking by using independent stream multiplexing; connection resumption is faster than TLS over TCP. [webTransportExplained](https://www.gocodeo.com/post/webtransport-explained-low-latency-communication-over-http-3)

WebTransport's relevance to collaborative applications lies primarily in latency reduction and the availability of unreliable datagrams for presence broadcasting (where dropping stale cursor positions is acceptable and retransmission wastes round-trips). However, browser support remains incomplete (not yet available in Safari as of early 2026) and the standard is still undergoing finalization. [webtransportW3C](https://www.w3.org/2024/09/webtransport-wg-charter.html)

#### Transport Comparison

| Transport | Direction | Latency | Server state | Offline | Browser support | Use cases |
|---|---|---|---|---|---|---|
| WebSocket | Bidirectional | Low (TCP) | Stateful | No | Universal | Real-time editing, presence, chat |
| WebRTC | Peer-to-peer | Very low (UDP) | Stateless after signaling | No | Universal | P2P sync, video, local-first |
| SSE | Server→client | Low (HTTP) | Stateless | No | Universal | Activity feeds, notifications |
| Long polling | Server→client | High (per-poll) | Stateless | No | Universal | Legacy fallback |
| WebTransport | Bidirectional + datagrams | Very low (QUIC) | Varies | No | Partial (no Safari) | Future: low-latency collab |

### 4.12 Multiplayer UX Patterns

Beyond presence indicators, mature collaborative applications have developed a vocabulary of interaction patterns for multi-user sessions.

#### Follow Mode / Observation Mode

Figma's Observation Mode allows a user to follow another collaborator's viewport: clicking an avatar in the editor causes the follower's view to mirror the leader's movements, zoom changes, and page navigation in real time. [figmaObservation](https://www.figma.com/blog/figma-feature-highlight-observation-mode/)

This pattern is valuable for design reviews (an observer follows the presenter's walkthrough), mentorship (a junior designer observes a senior's workflow), and remote user testing (a moderator follows the participant's path). The UX requires clear opt-in/opt-out affordances and immediate exit on the follower's intentional scroll/zoom, to prevent the disorienting experience of a viewport that moves unexpectedly.

#### Spotlight

Figma's Spotlight feature (also called Presentation Mode) forces all collaborators' viewports to follow the spotlight holder's position and zoom, implementing the "bring everyone to me" pattern. Unlike follow mode (which is unilateral), spotlight is broadcast: anyone with appropriate permissions can spotlight themselves, immediately redirecting all participants. [figmaSpotlight](https://help.figma.com/hc/en-us/articles/360040322673-Present-to-collaborators-using-spotlight)

Miro implements a similar "Attention Management" feature that physically moves all collaborators' viewports to the facilitator's position, which is particularly useful for workshop facilitation where the leader needs to synchronize a large group.

#### Comments and Annotations

Comment threads anchored to specific document regions (Figma's comment pins, Google Docs inline comments, Notion inline comments) provide the asynchronous collaboration layer within a synchronous editing environment. The UX design challenge is threading: comments must remain anchored to their target even as the document is edited around them. CRDT anchor techniques (attaching to stable character or element IDs) provide a natural solution; OT systems must separately track comment anchors and transform them alongside document operations.

Annotation systems for non-text content (image annotation, canvas annotation in Figma/Miro, code annotation in GitHub) add spatial anchoring on top of semantic anchoring, introducing additional complexity when the underlying canvas is transformed (resized, repositioned, deleted).

#### Version History and Time Travel

Google Docs maintains a complete version history at the level of individual keystrokes (grouped by time and author into "named revisions"). Users can open the version history panel, browse a timeline of changes, preview the document at any historical state, and restore a previous version. Named versions allow specific states to be labeled (e.g., "Submitted to client 2026-03-15") for direct navigation. [namedVersionsGoogle](https://sites.google.com/site/scriptsexamples/home/announcements/named-versions-what-youll-love-about-the-new-version-history-for-google-docs)

CKEditor 5 adds version history as a real-time collaboration feature where revision boundaries are set by users and each revision can be reviewed as a standalone document diff. [ckeditorRevision](https://ckeditor.com/blog/revision-history-now-available-with-real-time-collaboration-in-ckeditor-5/)

Branching—creating a parallel version of a document that can be edited independently and merged later—extends the version history model toward Git-like workflows. Onshape (CAD) implements explicit branching/merging for engineering assemblies. Figma provides branch-and-merge for design files. The Ink & Switch Upwelling project explored branching for collaborative writing with private draft support. [upwelling](https://www.inkandswitch.com/upwelling/)

#### Permission Models

Collaborative applications implement access control systems ranging from simple role-based models to fine-grained attribute-based controls.

**Standard role hierarchy:** Owner (full control including deletion), Editor (can modify content), Commenter (can add annotations but not edit content), Viewer (read-only access). This model, used by Google Docs, Figma, and Notion, covers the majority of use cases with manageable complexity. [permissionModelOneUptime](https://oneuptime.com/blog/post/2026-01-30-permission-model-design/view)

**Link-based sharing:** Generating sharable links with embedded access levels (view-only, comment, edit) without requiring authentication decouples access from identity. This enables public collaboration without account creation, trading security for accessibility.

**Granular permissions:** Enterprise collaborative applications (Notion, Confluence, Coda) implement hierarchical spaces where permissions cascade from parent to child pages, with the ability to set overrides at any level. This creates a ReBAC (Relationship-Based Access Control) structure where access decisions follow ownership chains. [osohqRBAC](https://www.osohq.com/learn/rbac-role-based-access-control)

**Real-time permission enforcement:** When permissions change while users are actively collaborating, systems must handle the case where a user who was an Editor is downgraded to Viewer mid-session. The UX patterns range from immediate lock-out (with a notification) to graceful read-only transition (pending edits are silently discarded or queued for permission re-evaluation).

### 4.13 Undo in Collaborative Contexts

Undo is one of the hardest problems in collaborative editing, combining the algorithmic challenges of CRDT/OT operation history with fundamental conceptual ambiguities about whose undo semantics should apply.

#### Local Undo

Local undo (a user can only undo their own operations, regardless of what other users have done since) is tractable. Zed implements local undo via an undo map that associates operation IDs with undo counts, enabling each user to maintain an independent undo stack that can be applied in arbitrary order. [zedCRDTs](https://zed.dev/blog/crdts) Yjs similarly supports local undo through `Y.UndoManager`, which tracks local operations and can invert them while leaving remote operations in place.

The UX complexity with local undo: if User A deletes a paragraph, then User B inserts text into that paragraph, User A's undo would restore the paragraph—but now containing User B's text, which was inserted into what User A intended as deleted. This may surprise User A but is consistent with local-undo semantics (User A's operation is reversed; User B's independent operation stands).

#### Global Undo

Global undo—undoing the most recent operation regardless of who performed it—is mathematically hard in a distributed CRDT system. The 2019 paper "A Generic Undo Support for State-Based CRDTs" (Yu, OPODIS 2019) formally established that "there is currently no generic support of undo for CRDTs, and there is currently no simple applicable abstraction that sufficiently captures the relations between undo and normal operations with respect to concurrency and causality." [genericUndoCRDT](https://drops.dagstuhl.de/storage/00lipics/lipics-vol153-opodis2019/LIPIcs.OPODIS.2019.14/LIPIcs.OPODIS.2019.14.pdf)

The paper "A CRDT Supporting Selective Undo for Collaborative Text Editing" (Yu and Ignat, DAIS 2015) proposed a specific CRDT for text that supports selective undo—undoing a specific historical operation while preserving operations that happened after it—by maintaining a causal history and computing the "effect inverse" of the undone operation with respect to subsequent operations. [selectiveUndoCRDT](https://members.loria.fr/CIgnat/files/pdf/YuDAIS15.pdf) This is algorithmically more general than local undo but requires O(n) historical context per undo operation.

Global undo in Google Docs is not exposed to users: Ctrl+Z only undoes the current user's operations (effectively local undo). This is a deliberate UX choice that avoids the confusion of undoing another user's actions without their consent.

#### Undo in Register CRDTs

For non-text CRDTs, the 2024 paper "Undo and Redo Support for Replicated Registers" (arXiv 2024) analyzes undo semantics for registers—single-value CRDTs—and characterizes the conditions under which undo can be defined consistently for concurrent register operations. [undoRegisters](https://arxiv.org/html/2404.11308v1) The paper establishes that undo for registers is achievable under specific causal delivery assumptions but becomes ambiguous when concurrent undos are applied to overlapping sets of operations.

### 4.14 Notification Design for Collaborative Events

Collaborative applications generate high volumes of events: edits, comments, mentions, permission changes, version saves, and presence changes. Notification design must balance awareness (keeping users informed) with attention management (avoiding interruption and notification fatigue).

#### Notification Taxonomy

Notifications in collaborative apps can be classified by urgency and directionality:

- **Ambient/passive:** Avatar stacks, activity indicators, view counts—visible without interrupting the user's current task
- **In-app transient:** Toast notifications ("User X commented on your selection") that appear briefly and auto-dismiss
- **In-app persistent:** Notification center/inbox listing all unread events with snooze and archive controls
- **Push notifications:** Mobile/desktop OS notifications for high-priority events (mentions, approval requests) when the user is not active in the app

#### Notification Fatigue

The primary failure mode in collaborative notification design is frequency overload. When a document is actively edited by multiple users, generating a notification for every keystroke (or even every saved change) produces an unworkable stream. The standard mitigations are: [smashingNotifications](https://smart-interface-design-patterns.com/articles/notifications/) [toptalNotifications](https://www.toptal.com/designers/ux/notification-design)

- **Throttling:** Batch notifications within a time window (e.g., notify once per user per document per session)
- **Relevance filtering:** Notify only when the event is directly relevant (e.g., mentions of @user rather than all edits)
- **Digest mode:** Aggregate notifications into periodic summaries (hourly or daily)
- **Progressive disclosure:** Show a summary count in a badge; expand to full list on demand

#### Activity Feeds

Activity feeds (Notion's "Updates" panel, Figma's project activity feed, GitHub's repository feed) provide a chronological stream of collaborative events that users can scan asynchronously. An effective activity feed design must handle both real-time updates (new events appearing at the top) and historical browsing (infinite scroll into past events), with clear authorship, timestamps, and document context for each entry. [aubergineActivityFeed](https://www.aubergine.co/insights/a-guide-to-designing-chronological-activity-feeds)

### 4.15 Scale Architecture

Scaling collaborative applications introduces distinct challenges at each concurrency tier.

#### Small Sessions (2–20 Users)

At this scale, a single WebSocket server process can hold all session state in memory. The architecture is a simple hub-and-spoke: the server receives operations from any client, broadcasts to all others, and maintains the authoritative document state. This is the architecture used by Yjs's `y-websocket` server, Liveblocks, and most basic WebSocket implementations.

#### Medium Sessions (20–200 Users)

At this scale, a single process may reach memory or CPU limits. The standard pattern is horizontal scaling behind a load balancer with session affinity (sticky sessions): all WebSocket connections for a given document are routed to the same server process by consistent hashing on the document ID. This avoids cross-process synchronization for in-session operations. Figma uses a similar pattern: "multiplayer holds the state of the file in-memory and updates it as changes come in, periodically writing the state of the file to storage every 30 to 60 seconds in a process called 'checkpointing.'" [figmaMultiplayer](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/)

#### Large Sessions (200–1000+ Users)

At this scale, a single server process becomes a bottleneck. Architectural responses include:

1. **Sharding by document region:** Divide a document into regions (e.g., Miro's infinite canvas into spatial cells) and route operations based on the affected region to a responsible shard
2. **Fan-out services:** A dedicated broadcast service receives operations from the edit server and fans them out to many read-only WebSocket servers, trading consistency for scale
3. **CRDT peer-to-peer mesh:** Offload synchronization to a WebRTC mesh among clients (as `y-webrtc` supports), reducing server load to signaling only
4. **Cloudflare Durable Objects:** Each document room runs as a single Durable Object instance at the edge, providing stateful single-process semantics with global distribution [cloudflarePartyKit](https://blog.cloudflare.com/cloudflare-acquires-partykit/)

The MDPI 2024 paper "Real-Time Document Collaboration—System Architecture and Design" (Iovescu and Tudose, Applied Sciences 14(18):8356) specifically targets the 1000 concurrent user case, proposing a microservice architecture with a dedicated real-time communications (RTC) service for WebSocket management, an event messaging bus (Kafka) for cross-service operation propagation, and stateless application services behind a load balancer. [mdpiRealTime](https://www.mdpi.com/2076-3417/14/18/8356)

### 4.16 Case Studies

#### Figma

Figma is the design industry's canonical example of real-time multiplayer done right. The multiplayer architecture (described in detail by the Figma engineering blog) uses WebSockets between clients and a cluster of stateful multiplayer servers. Figma explicitly chose not to use OT, opting instead for a simpler custom property-merge scheme suited to structured design objects (each object property is LWW-merged by timestamp). Since Figma is not primarily a text editor, the full generality of OT or sequence CRDTs was deemed unnecessary for most operations. [figmaMultiplayer](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/) [figmaReliable](https://www.figma.com/blog/making-multiplayer-more-reliable/)

The follow/spotlight/observation mode patterns described in §4.12 originated in Figma and have been widely adopted by other collaborative tools.

#### Google Docs

Google Docs pioneered mass-market real-time collaborative editing, implementing OT over WebSockets with a central server as the transform arbiter. The operational log and OT implementation handle all document structure changes including text, tables, images, and formatting. Google Docs' strong consistency guarantee (all users converge to the server-determined state) comes at the cost of offline capability and server dependency. [googledriveBlog](https://drive.googleblog.com/2010/09/whats-different-about-new-google-docs.html)

#### Zed

Zed, the Rust-based code editor, built CRDT-based collaboration into its core architecture from the start, treating multiplayer as a first-class feature rather than a plugin. Zed's CRDT uses Lamport timestamps and replica IDs for operation ordering, tombstones for deletions, and an undo map for per-user undo history. Collaboration uses WebRTC for peer-to-peer connections with encrypted channels, minimizing server involvement in the synchronization critical path. [zedCRDTs](https://zed.dev/blog/crdts) [zedSpectrum](https://zed.dev/blog/full-spectrum-of-collaboration)

#### VS Code Live Share

VS Code Live Share (Microsoft) provides real-time collaborative editing through a relay server architecture: the "host" computer shares its local workspace; "guests" connect and see the host's editor state transmitted in real time. Unlike CRDT or OT approaches, Live Share transmits the host's complete editor state to guests and relays guests' edits back to the host's process. This avoids distributed consistency problems but requires the host to be continuously connected; if the host disconnects, the session ends. [vsCodeLiveShare](https://visualstudio.microsoft.com/services/live-share/)

#### Linear

Linear's "sync engine" implements local-first architecture using IndexedDB as a client-side database. All user actions are applied locally first and then replicated to the server via GraphQL mutations and WebSocket-based real-time sync. The architecture provides instant UI response and resilience to network interruption, with conflicts resolved through server-side timestamp-based LWW semantics. [scalingLinear](https://linear.app/now/scaling-the-linear-sync-engine)

## 5. Comparative Synthesis

**Table 2. Comparative analysis of primary collaborative consistency mechanisms**

| Dimension | Operational Transformation | State-based CRDT (CvRDT) | Operation-based CRDT (CmRDT) | Local-first (CRDT + offline) |
|---|---|---|---|---|
| Coordination topology | Server-required | Any (gossip or server) | Any (requires causal delivery) | Peer-to-peer; server optional |
| Offline support | Limited (no server = no transforms) | Full (local state always valid) | Full (operations buffered) | Full (by design) |
| Convergence guarantee | Yes (under server availability) | SEC (Strong Eventual Consistency) | SEC | SEC |
| Implementation complexity | High (transform function correctness) | Medium (merge function design) | Medium–High (causal delivery) | High (offline merge + UX) |
| Memory overhead | Low (operations only) | High (full state replicated) | Medium (operation log) | High (local storage + sync metadata) |
| Undo support | Local undo (standard) | Local undo tractable; global hard | Local undo tractable; global hard | Local undo; per-library |
| Rich text support | Yes (OT for formatting) | Via Peritext (CRDT) | Via Peritext | Via Automerge/Yjs + Peritext |
| Scale ceiling (single document) | Server-bound (~10k with sharding) | Library-bound | Library-bound | Local-bound (device storage/CPU) |
| Representative implementations | Google Docs, Etherpad | Riak, Redis, Cosmos DB | Yjs, Automerge, Loro | Automerge, Yjs + local storage |
| Primary practical limitation | Server dependency; correctness complexity | Tombstone accumulation; state size | Causal delivery requirement | Storage limits; garbage collection |

**Table 3. Collaborative library ecosystem comparison (2024–2026)**

| Library | Language | Data model | Performance (vs. Yjs) | Rich text | Offline | Transport | Notes |
|---|---|---|---|---|---|---|---|
| Yjs | JavaScript | Typed shared types | Baseline (fastest) | Via TipTap/ProseMirror + Peritext | Yes (y-indexeddb) | WebSocket, WebRTC, any | Most widely deployed; modular |
| Automerge 2.0 | Rust/WASM+JS | JSON document | ~Comparable to Yjs | Via Automerge-richtext | Yes | Any | Richer data model; local-first focus |
| Loro | Rust/WASM+JS | JSON + rich text | Competitive (columnar encoding) | Yes (Fugue + Peritext) | Yes | Any | Newer; emerging ecosystem |
| Diamond Types | Rust | Sequence (text) | Claims world's fastest | Text only | Yes | Any | Research/experimental focus |
| Liveblocks | Managed JS | LiveList, LiveMap, LiveObject | Managed (SLA) | Via Tiptap integration | Partial | Managed WebSocket | Fully managed infrastructure |
| PartyKit | JS (edge) | Custom per-room state | Edge-native (Cloudflare) | Custom | Partial | Durable Objects WebSocket | Developer-controlled; acquired by Cloudflare |

## 6. Open Problems

### 6.1 Undo as an Unsolved General Problem

As established in §4.13, there is no general solution to global undo in CRDT systems with concurrent operations. The 2024 paper on undo for replicated registers provides a partial advance for scalar types, but the generalization to sequences, rich text, and nested document structures remains open. The fundamental difficulty is that undo semantics are inherently social (whose undo? what intention should be preserved?) as well as mathematical, requiring a combination of formal CRDT theory and user-centered design research that has not yet been systematically applied.

### 6.2 CRDT Garbage Collection in Long-Lived Documents

CRDT sequence structures accumulate tombstones (markers for deleted elements) that are never physically removed because they may be needed as anchor points for operations from disconnected peers. In long-lived documents with high edit rates (such as a code file with months of revision history), tombstone accumulation can substantially increase memory usage and parse time. No generally satisfactory garbage collection strategy exists: naively removing tombstones breaks anchors for offline peers; sophisticated GC protocols require coordination that undermines CRDT's coordination-free guarantee. [yjsDocs](https://docs.yjs.dev)

### 6.3 Interoperability Between CRDT Libraries

Different CRDT libraries use incompatible on-wire formats and internal representations. A document edited in Yjs cannot be natively synchronized with one edited in Automerge without a translation layer. This is not merely an engineering problem—the two libraries' operation semantics differ in ways that make bidirectional translation non-trivial. The absence of a standard CRDT interchange format limits ecosystem composability and creates vendor lock-in for application developers.

### 6.4 Permission Models in CRDT Systems

CRDTs' peer-to-peer and local-first properties complicate permission enforcement. In a client-server system, the server can enforce permissions by refusing to apply unauthorized operations. In a true peer-to-peer CRDT system, any peer can generate and propagate operations, making server-side enforcement impossible without sacrificing the peer-to-peer property. Cryptographic access control schemes (encrypting document regions with role-specific keys) provide a technical solution but add complexity and may not integrate cleanly with existing CRDT semantics. [securesCRDT](https://dl.acm.org/doi/10.1145/3427796.3427831)

### 6.5 Awareness Scalability

Current awareness protocols (such as Yjs's awareness protocol) use gossip or broadcast to propagate presence state. At large session sizes (hundreds of concurrent users), the bandwidth consumption of broadcasting cursor positions for all participants to all participants becomes O(n²). Spatial partitioning (only broadcasting presence for users visible in the current viewport) reduces this to O(visible users) but requires the transport layer to understand spatial semantics—an application-specific concern that breaks the transport abstraction. Miro and Figma both implement spatial presence filtering but have not published detailed specifications of their approaches.

### 6.6 AI-Assisted Collaborative Editing

The emergence of AI writing assistants (GitHub Copilot, Notion AI, Google Docs with Gemini) introduces a new participant type into collaborative sessions: an AI agent that may generate, rewrite, or suggest content. AI-generated operations must be attributed (for version history and undo purposes), may conflict with human edits in semantically complex ways (unlike character-level text operations, AI rewrites operate at paragraph or document level), and raise new UX questions about consent, oversight, and the semantics of "accepting" or "rejecting" AI suggestions. The CRDT and OT frameworks that handle human concurrent edits have not been extended to handle AI-scale operations (replacing thousands of characters in a single atomic action) in ways that remain understandable to human collaborators.

### 6.7 End-to-End Encryption and Collaborative Editing

Local-first software's privacy ideal requires end-to-end encryption where servers hold only ciphertext. Implementing collaborative editing over encrypted documents requires either: (a) decrypting at the client before applying CRDT operations (which means all clients with access can always see the plaintext, and the server is excluded from the critical sync path), or (b) applying CRDTs to encrypted ciphertext (which requires homomorphic or structure-preserving encryption, current research frontiers that are not yet practical for document editing). The tension between E2E encryption and rich collaboration features is a significant unresolved design problem.

### 6.8 Formalization of OT for Rich Operations

While the OT framework is well-understood for character-level insert/delete operations, formalizing and verifying transformation functions for richer operation sets (table operations, image repositioning, style changes, comment anchoring) remains an active area with incomplete coverage. Attempts to prove CP1 and CP2 for complex operation sets have produced either incomplete proofs or very restrictive operation subsets. This limits the provable correctness of OT-based systems that extend beyond basic text editing.

## 7. Conclusion

Real-time and collaborative UX in web applications constitutes a rich intersection of distributed systems theory, programming language design, network engineering, and human-computer interaction. The field has moved substantially from its CSCW origins in the late 1980s to a mature ecosystem of production systems serving hundreds of millions of users, yet fundamental research problems remain open.

The algorithmic landscape has consolidated around two complementary approaches. OT retains dominance in server-mediated systems where a central transform arbiter provides simplicity at the cost of offline capability and implementation fragility. CRDTs have gained ground across the spectrum from browser-embedded libraries (Yjs, Automerge) to platform infrastructure (Liveblocks, PartyKit) to production applications (Notion, Linear, Zed), particularly where local-first semantics, peer-to-peer synchronization, or offline capability are required. The theoretical foundations of CRDTs have been formally verified; OT's correctness proofs remain harder to establish for non-trivial operation sets.

The library ecosystem has matured significantly. Yjs remains the performance leader for sequence CRDTs; Automerge 2.0's Rust/WASM rewrite closed the gap while providing a richer JSON data model; Loro and Diamond Types represent active research pushing performance and expressiveness further. Managed infrastructure platforms (Liveblocks, PartyKit/Cloudflare) abstract infrastructure complexity for application developers at the cost of some control and portability.

The UX layer above the algorithmic primitives is equally important and less well-characterized in formal literature. Presence indicators, awareness models, conflict resolution affordances, version history, branching, undo semantics, permission models, notification design, and scale architecture each constitute design problems whose solutions interact non-trivially. The case studies surveyed—Figma's LWW-based multiplayer, Google Docs' OT-based convergence, Zed's CRDT-native collaboration, Linear's local-first sync engine—illustrate different points in the design space, each representing deliberate trade-offs among consistency, performance, offline capability, and UX complexity.

The local-first software movement represents the most significant conceptual reframing of this space: from collaboration as a server-mediated service to collaboration as a peer-to-peer capability built on mathematically convergent data structures, with data ownership returning to the user. As CRDTs mature and garbage collection, permission enforcement, and AI-integration problems are addressed, the local-first paradigm is likely to become the dominant architectural pattern for collaborative web applications, with server infrastructure playing the role of introduction/synchronization facilitator rather than authoritative state holder.

The open problems surveyed—global undo, CRDT garbage collection, library interoperability, encrypted collaboration, AI participant semantics—define a research agenda at the intersection of formal methods, systems engineering, and human-computer interaction. Progress on these problems will determine the ceiling of what collaborative web applications can offer: not merely faster or more reliable versions of existing tools, but qualitatively new capabilities for human creative and professional work.

## References

Shapiro, M., Preguiça, N., Baquero, C., and Zawirski, M. (2011). "Conflict-free Replicated Data Types." In Symposium on Self-Stabilizing Systems (SSS 2011), Springer LNCS 6976. https://link.springer.com/chapter/10.1007/978-3-642-24550-3_29 [shapiroSSS](https://link.springer.com/chapter/10.1007/978-3-642-24550-3_29)

Shapiro, M., Preguiça, N., Baquero, C., and Zawirski, M. (2011). "A Comprehensive Study of Convergent and Commutative Replicated Data Types." INRIA Technical Report RR-7687. https://inria.hal.science/inria-00609399v1/document [shapiroRR](https://inria.hal.science/inria-00609399v1/document)

Sun, C. and Ellis, C. (1998). "Operational transformation in real-time group editors: issues, algorithms, and achievements." In Proc. ACM CSCW 1998. https://dl.acm.org/citation.cfm?id=289469 [sunEllis](https://dl.acm.org/citation.cfm?id=289469)

Roh, H.-G., Jeon, M., Kim, J.-S., and Lee, J. (2011). "Replicated abstract data types: Building blocks for collaborative applications." J. Parallel Distrib. Comput. 71(3):354–368. http://csl.skku.edu/papers/jpdc11.pdf [rga2011](http://csl.skku.edu/papers/jpdc11.pdf)

Kleppmann, M., Wiggins, A., van Hardenberg, P., and McGranaghan, M. (2019). "Local-first software: You own your data, in spite of the cloud." In Proc. Onward! 2019, ACM SIGPLAN. https://dl.acm.org/doi/10.1145/3359591.3359737 [localFirst](https://dl.acm.org/doi/10.1145/3359591.3359737)

Litt, G., Lim, S., Kleppmann, M., and van Hardenberg, P. (2022). "Peritext: A CRDT for Collaborative Rich Text Editing." Proc. ACM Hum.-Comput. Interact. (CSCW) 6, CSCW2, Article 531. https://dl.acm.org/doi/abs/10.1145/3555644 [peritextACM](https://dl.acm.org/doi/abs/10.1145/3555644)

Gomes, V., Kleppmann, M., Mulligan, D.P., and Beresford, A.R. (2017). "Verifying strong eventual consistency in distributed systems." Proc. ACM Program. Lang. (OOPSLA). https://arxiv.org/pdf/1707.01747 [verifyingSEC](https://arxiv.org/pdf/1707.01747)

Yu, W. and Ignat, C.-L. (2015). "A CRDT Supporting Selective Undo for Collaborative Text Editing." In Proc. DAIS 2015, Springer. https://members.loria.fr/CIgnat/files/pdf/YuDAIS15.pdf [selectiveUndo](https://members.loria.fr/CIgnat/files/pdf/YuDAIS15.pdf)

Yu, W. (2019). "A Generic Undo Support for State-Based CRDTs." In Proc. OPODIS 2019. https://drops.dagstuhl.de/storage/00lipics/lipics-vol153-opodis2019/LIPIcs.OPODIS.2019.14/LIPIcs.OPODIS.2019.14.pdf [genericUndo](https://drops.dagstuhl.de/storage/00lipics/lipics-vol153-opodis2019/LIPIcs.OPODIS.2019.14/LIPIcs.OPODIS.2019.14.pdf)

Jahns, K. (2020). "Are CRDTs suitable for shared editing?" Kevin's Blog. https://blog.kevinjahns.de/are-crdts-suitable-for-shared-editing [kevinjahns](https://blog.kevinjahns.de/are-crdts-suitable-for-shared-editing)

Iovescu, D. and Tudose, C. (2024). "Real-Time Document Collaboration—System Architecture and Design." Applied Sciences 14(18):8356. https://www.mdpi.com/2076-3417/14/18/8356 [mdpiRealTime](https://www.mdpi.com/2076-3417/14/18/8356)

Kleppmann, M. and Beresford, A.R. (2017). "A Conflict-Free Replicated JSON Datatype." IEEE Trans. Parallel Distrib. Syst. 28(10):2733–2746. https://arxiv.org/abs/1805.06358 [crdtJSON](https://arxiv.org/abs/1805.06358)

Ink & Switch. (2023). "Upwelling: Combining real-time collaboration with version control for writers." https://www.inkandswitch.com/upwelling/ [upwelling](https://www.inkandswitch.com/upwelling/)

Ink & Switch. (2019). "Local-First Software." https://www.inkandswitch.com/essay/local-first/ [localFirstEssay](https://www.inkandswitch.com/essay/local-first/)

Figma Engineering. (2019). "How Figma's multiplayer technology works." Figma Blog. https://www.figma.com/blog/how-figmas-multiplayer-technology-works/ [figmaMultiplayer](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/)

Figma Engineering. (2019). "Making multiplayer more reliable." Figma Blog. https://www.figma.com/blog/making-multiplayer-more-reliable/ [figmaReliable](https://www.figma.com/blog/making-multiplayer-more-reliable/)

Zed Industries. (2024). "How CRDTs make multiplayer text editing part of Zed's DNA." Zed Blog. https://zed.dev/blog/crdts [zedCRDTs](https://zed.dev/blog/crdts)

Cloudflare. (2024). "Cloudflare acquires PartyKit." Cloudflare Blog. https://blog.cloudflare.com/cloudflare-acquires-partykit/ [cloudflareAcquires](https://blog.cloudflare.com/cloudflare-acquires-partykit/)

Notion. (2025). "How we made Notion available offline." Notion Blog. https://www.notion.com/blog/how-we-made-notion-available-offline [notionOffline](https://www.notion.com/blog/how-we-made-notion-available-offline)

Linear. "Scaling the Linear Sync Engine." Linear Blog. https://linear.app/now/scaling-the-linear-sync-engine [linearSync](https://linear.app/now/scaling-the-linear-sync-engine)

CRDT.tech. "About CRDTs." https://crdt.tech/ [crdtTech](https://crdt.tech/)

Yjs. "Introduction." https://docs.yjs.dev [yjsDocs](https://docs.yjs.dev)

dmonad. "crdt-benchmarks: A collection of CRDT benchmarks." https://github.com/dmonad/crdt-benchmarks [crdtBenchmarks](https://github.com/dmonad/crdt-benchmarks)

Liveblocks. "Ready-made collaboration for your product." https://liveblocks.io/ [liveblocksIO](https://liveblocks.io/)

PartyKit. "PartyKit is joining Cloudflare!" https://blog.partykit.io/posts/partykit-is-joining-cloudflare/ [partykitJoins](https://blog.partykit.io/posts/partykit-is-joining-cloudflare/)

Google Drive Blog. (2010). "What's different about the new Google Docs: Making collaboration fast." https://drive.googleblog.com/2010/09/whats-different-about-new-google-docs.html [googledriveBlog](https://drive.googleblog.com/2010/09/whats-different-about-new-google-docs.html)

Wikipedia. "Operational transformation." https://en.wikipedia.org/wiki/Operational_transformation [otWikipedia](https://en.wikipedia.org/wiki/Operational_transformation)

Wikipedia. "Conflict-free replicated data type." https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type [wikiCRDT](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type)

RxDB. "WebSockets vs Server-Sent Events vs Long-Polling vs WebRTC vs WebTransport." https://rxdb.info/articles/websockets-sse-polling-webrtc-webtransport.html [rxdbTransport](https://rxdb.info/articles/websockets-sse-polling-webrtc-webtransport.html)

Ably. "WebSockets vs Server-Sent Events: Key differences and which to use." https://ably.com/blog/websockets-vs-sse [ablyWebSocketSSE](https://ably.com/blog/websockets-vs-sse)

Ably. "Collaboration is futile without these UX best practices." https://ably.com/blog/collaborative-ux-best-practices [ablyCollabUX](https://ably.com/blog/collaborative-ux-best-practices)

Ably. "How to scale WebSockets for high-concurrency systems." https://ably.com/topic/the-challenge-of-scaling-websockets [ablyScaleWS](https://ably.com/topic/the-challenge-of-scaling-websockets)

Ably. "WebRTC vs. WebSocket: Key differences." https://ably.com/topic/webrtc-vs-websocket [ablyWebRTCvWS](https://ably.com/topic/webrtc-vs-websocket)

W3C. "WebTransport Working Group Charter." https://www.w3.org/2024/09/webtransport-wg-charter.html [webTransportW3C](https://www.w3.org/2024/09/webtransport-wg-charter.html)

Visual Studio. "Live Share: Real-Time Code Collaboration." https://visualstudio.microsoft.com/services/live-share/ [vsLiveShare](https://visualstudio.microsoft.com/services/live-share/)

Figma Help. "Present to collaborators using spotlight." https://help.figma.com/hc/en-us/articles/360040322673-Present-to-collaborators-using-spotlight [figmaSpotlight](https://help.figma.com/hc/en-us/articles/360040322673-Present-to-collaborators-using-spotlight)

Loro. "Reimagine state management with CRDTs." https://loro.dev/ [loroDev](https://loro.dev/)

Sypytkowski, B. "An introduction to state-based CRDTs." https://www.bartoszsypytkowski.com/the-state-of-a-state-based-crdts/ [bartoszczCvRDT](https://www.bartoszsypytkowski.com/the-state-of-a-state-based-crdts/)

Smashing Magazine. "Design Guidelines for Better Notifications UX." https://smart-interface-design-patterns.com/articles/notifications/ [smashingNotifications](https://smart-interface-design-patterns.com/articles/notifications/)

Toptal. "A Comprehensive Guide to Notification Design." https://www.toptal.com/designers/ux/notification-design [toptalNotifications](https://www.toptal.com/designers/ux/notification-design)

Aubergine Solutions. "A Guide to Designing Chronological Activity Feeds." https://www.aubergine.co/insights/a-guide-to-designing-chronological-activity-feeds [aubergineFeeds](https://www.aubergine.co/insights/a-guide-to-designing-chronological-activity-feeds)

Liveblocks. "Presence: Realtime presence indicators." https://liveblocks.io/presence [liveblocksPresence](https://liveblocks.io/presence)

Meiklejohn, C. (2014). "Readings in conflict-free replicated data types." https://christophermeiklejohn.com/crdt/2014/07/22/readings-in-crdts.html [meiklejohnReadings](https://christophermeiklejohn.com/crdt/2014/07/22/readings-in-crdts.html)

Hoverify. "Conflict Resolution in Real-Time Collaborative Editing." https://tryhoverify.com/blog/conflict-resolution-in-real-time-collaborative-editing/ [hoverifyConflict](https://tryhoverify.com/blog/conflict-resolution-in-real-time-collaborative-editing/)

Undo and Redo Support for Replicated Registers (2024). arXiv:2404.11308. https://arxiv.org/html/2404.11308v1 [undoRegisters](https://arxiv.org/html/2404.11308v1)

Microsoft VS Code. "Explore UX for three-way merge." Issue #146091. https://github.com/microsoft/vscode/issues/146091 [vsCodeThreeWayMerge](https://github.com/microsoft/vscode/issues/146091)

## Practitioner Resources

- CRDT.tech — https://crdt.tech/
  Curated resource hub maintained by the CRDT research community, with links to papers, implementations, and introductory materials. [crdtTech](https://crdt.tech/)

- Yjs Documentation — https://docs.yjs.dev
  Official documentation for the Yjs CRDT framework, covering shared types, providers, editor integrations, and awareness protocol. [yjsDocs](https://docs.yjs.dev)

- crdt-benchmarks — https://github.com/dmonad/crdt-benchmarks
  Reproducible benchmark suite comparing Yjs, Automerge, and other CRDT implementations on encoding size, parse time, memory, and operation throughput. [crdtBenchmarks](https://github.com/dmonad/crdt-benchmarks)

- Automerge — https://automerge.org
  Local-first CRDT library (Rust/WASM + JavaScript/Swift bindings), part of the Ink & Switch research ecosystem. [automerge](https://automerge.org)

- Liveblocks — https://liveblocks.io
  Managed collaboration infrastructure providing Presence, Storage (CRDT), Broadcast, and Comments APIs. [liveblocksIO](https://liveblocks.io/)

- PartyKit / Cloudflare — https://docs.partykit.io
  Open-source framework for stateful real-time servers on Cloudflare's global edge (Durable Objects). [partykitDocs](https://docs.partykit.io)

- Ink & Switch local-first essay — https://www.inkandswitch.com/essay/local-first/
  Foundational manifesto articulating the seven ideals of local-first software and proposing CRDTs as the enabling technology. [localFirstEssay](https://www.inkandswitch.com/essay/local-first/)

- Peritext — https://www.inkandswitch.com/peritext/
  Research project and implementation of a CRDT for collaborative rich-text editing with inline formatting semantics. [peritext](https://www.inkandswitch.com/peritext/)

- Loro — https://loro.dev
  Modern CRDT library (Rust/WASM) implementing Fugue for sequences and Peritext for rich text with columnar encoding. [loroDev](https://loro.dev/)

- Ably collaborative UX guide — https://ably.com/blog/collaborative-ux-best-practices
  Practitioner guide covering presence indicators, cursors, avatars, and real-time UX patterns. [ablyCollabUX](https://ably.com/blog/collaborative-ux-best-practices)

- Zed CRDT blog post — https://zed.dev/blog/crdts
  Detailed engineering article explaining Zed's CRDT implementation choices: Lamport timestamps, tombstones, anchor-based cursor positions, and undo maps. [zedCRDTs](https://zed.dev/blog/crdts)

- Figma multiplayer blog post — https://www.figma.com/blog/how-figmas-multiplayer-technology-works/
  Primary source on Figma's architecture: WebSocket-based stateful multiplayer, in-memory state checkpointing, and LWW property merging. [figmaMultiplayer](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/)

- RxDB transport comparison — https://rxdb.info/articles/websockets-sse-polling-webrtc-webtransport.html
  Comprehensive comparison of WebSocket, SSE, long-polling, WebRTC, and WebTransport for real-time web applications. [rxdbTransport](https://rxdb.info/articles/websockets-sse-polling-webrtc-webtransport.html)
```

Now I need to save this paper to the file system. Since I don't have a direct write tool available, I'll need to check if there's another way. Let me look at what the agent SDK provides for file operations. Looking back at my available tools list: Glob, Grep, Read, WebFetch, WebSearch.

I notice I truly don't have a write tool. However, looking at other papers in the repository, they were clearly written by agents (the git commits say "PhD-level research: 17 papers..."). This suggests the agent running this task should have a write capability. Let me check if I might have missed a tool by reviewing the tool definitions once more.

The tools defined are exactly: Glob, Grep, Read, WebFetch, WebSearch. There is no Bash tool, no Write tool, no CreateFile tool in this session.

I need to be transparent about this constraint and present the complete paper content for the user to save manually, clearly indicating the target path.

---

**Source Assessment**

The research draws from multiple source tiers:

- **Tier 1 (Peer-reviewed academic):** Shapiro et al. 2011 (CRDT foundations), Sun & Ellis 1998 (OT theory), Roh et al. 2011 (RGA), Litt et al. 2022 (Peritext), Gomes et al. 2017 (SEC verification), Yu & Ignat 2015 and Yu 2019 (undo in CRDTs), Kleppmann et al. 2019 (local-first), Iovescu & Tudose 2024 (scale architecture). These form the scholarly core.
- **Tier 2 (Primary technical sources):** Figma engineering blog, Zed blog, Ink & Switch project pages, Google Drive blog, Notion blog, Linear blog, Yjs documentation. High-quality primary sources from practitioners who built the systems described.
- **Tier 3 (Reference and survey):** Wikipedia, CRDT.tech, Ably technical blog, MDN. Reliable reference material for well-established concepts.
- **Tier 4 (Practitioner articles):** DEV.to, Medium articles on OT/CRDT. Used to cross-check consensus understanding but not as primary evidence for claims.

**Limitations and Gaps**

- Figma's full multiplayer source code and internal architecture documentation are proprietary; the engineering blog describes the system at a level of abstraction that elides implementation details
- The performance benchmarks for Loro and newer libraries are less extensively validated than Yjs's benchmarks
- User studies on collaborative UX patterns (specifically on how users perceive conflict resolution, undo semantics, and presence indicators) are sparse in the literature; most evidence is practitioner-reported or observational
- Google Docs' current implementation details are not publicly documented; the 2010 blog post and academic accounts describe the original system
- Miro's internal architecture is essentially undocumented publicly beyond marketing materials
- The paper does not cover collaborative spreadsheet editing (Google Sheets' cell-level model) or collaborative CAD (Onshape) in depth, both of which have distinct algorithmic and UX characteristics worth a dedicated treatment
- WebTransport deployment timelines are speculative given ongoing standardization

---

The complete paper content is provided above. It should be saved to:

**`/Users/Nathan/Documents/Code/docs_personal/research/design/web-apps/real-time-and-collaborative-ux.md`**

After saving, the `research/design/INDEX.md` should be updated to add a **Web Apps** section with this paper's entry.

Sources:
- [Conflict-Free Replicated Data Types | Springer](https://link.springer.com/chapter/10.1007/978-3-642-24550-3_29)
- [Conflict-free replicated data type - Wikipedia](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type)
- [About CRDTs - CRDT.tech](https://crdt.tech/)
- [INRIA CRDT Technical Report RR-7687](https://inria.hal.science/inria-00609399v1/document)
- [Operational transformation - Wikipedia](https://en.wikipedia.org/wiki/Operational_transformation)
- [Google Drive Blog: Making collaboration fast](https://drive.googleblog.com/2010/09/whats-different-about-new-google-docs.html)
- [Local-first software: You own your data, in spite of the cloud](https://dl.acm.org/doi/10.1145/3359591.3359737)
- [Ink & Switch: Local-First Software Essay](https://www.inkandswitch.com/essay/local-first/)
- [Peritext: A CRDT for Collaborative Rich Text Editing](https://dl.acm.org/doi/abs/10.1145/3555644)
- [Peritext - Ink & Switch](https://www.inkandswitch.com/peritext/)
- [Yjs Documentation](https://docs.yjs.dev)
- [crdt-benchmarks - GitHub](https://github.com/dmonad/crdt-benchmarks)
- [Are CRDTs suitable for shared editing? - Kevin Jahns](https://blog.kevinjahns.de/are-crdts-suitable-for-shared-editing)
- [How CRDTs make multiplayer text editing part of Zed's DNA](https://zed.dev/blog/crdts)
- [How Figma's multiplayer technology works](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/)
- [How we made Notion available offline](https://www.notion.com/blog/how-we-made-notion-available-offline)
- [Scaling the Linear Sync Engine](https://linear.app/now/scaling-the-linear-sync-engine)
- [Cloudflare acquires PartyKit](https://blog.cloudflare.com/cloudflare-acquires-partykit/)
- [PartyKit is joining Cloudflare](https://blog.partykit.io/posts/partykit-is-joining-cloudflare/)
- [Liveblocks](https://liveblocks.io/)
- [Upwelling - Ink & Switch](https://www.inkandswitch.com/upwelling/)
- [Verifying strong eventual consistency in distributed systems](https://arxiv.org/pdf/1707.01747)
- [A Generic Undo Support for State-Based CRDTs](https://drops.dagstuhl.de/storage/00lipics/lipics-vol153-opodis2019/LIPIcs.OPODIS.2019.14/LIPIcs.OPODIS.2019.14.pdf)
- [A CRDT Supporting Selective Undo for Collaborative Text Editing](https://members.loria.fr/CIgnat/files/pdf/YuDAIS15.pdf)
- [Undo and Redo Support for Replicated Registers (arXiv 2024)](https://arxiv.org/html/2404.11308v1)
- [Real-Time Document Collaboration - MDPI 2024](https://www.mdpi.com/2076-3417/14/18/8356)
- [RGA: Replicated Abstract Data Types (Roh 2011)](http://csl.skku.edu/papers/jpdc11.pdf)
- [WebSockets vs SSE vs WebRTC - RxDB](https://rxdb.info/articles/websockets-sse-polling-webrtc-webtransport.html)
- [WebRTC vs WebSocket - Ably](https://ably.com/topic/webrtc-vs-websocket)
- [WebSockets vs SSE - Ably](https://ably.com/blog/websockets-vs-sse)
- [WebTransport Working Group Charter - W3C](https://www.w3.org/2024/09/webtransport-wg-charter.html)
- [Collaborative UX best practices - Ably](https://ably.com/blog/collaborative-ux-best-practices)
- [Liveblocks Presence](https://liveblocks.io/presence)
- [Figma Spotlight help](https://help.figma.com/hc/en-us/articles/360040322673-Present-to-collaborators-using-spotlight)
- [VS Code Live Share](https://visualstudio.microsoft.com/services/live-share/)
- [Loro CRDT](https://loro.dev/)
- [Google Wave OT whitepaper](https://svn.apache.org/repos/asf/incubator/wave/whitepapers/operational-transform/operational-transform.html)
- [Sun & Ellis CSCW 1998](https://dl.acm.org/citation.cfm?id=289469)
- [Activity feed design guide](https://www.aubergine.co/insights/a-guide-to-designing-chronological-activity-feeds)
- [Notification design - Smashing Magazine](https://smart-interface-design-patterns.com/articles/notifications/)
