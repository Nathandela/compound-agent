---
title: "State Management Architecture for Web Applications"
date: 2026-03-26
summary: A comprehensive survey of client-side and server-side state management architectures in modern web applications, covering the theoretical foundations in finite automata and reactive programming, the taxonomy of approaches from flux/redux through signals and CRDTs, and the emerging convergence toward fine-grained reactivity and local-first paradigms.
keywords: [state-management, web-applications, reactivity, client-state, server-state, signals]
---

# State Management Architecture for Web Applications

*2026-03-26*

## Abstract

State management is the central architectural concern of interactive web applications. Every user interaction, network response, navigation event, and background synchronization produces state transitions that must be captured, propagated, and rendered with correctness guarantees ranging from immediate UI consistency to eventual convergence across distributed replicas. The problem is deceptively complex: a modern single-page application may simultaneously manage ephemeral UI state (modal visibility, scroll position), form state under validation, cached server data subject to staleness and invalidation, URL-encoded navigation state, derived computations that must remain consistent with their sources, and persistent state that survives page reloads and must synchronize across tabs or devices. The design space for addressing these concerns has expanded dramatically since Facebook's introduction of the Flux architecture in 2014, producing a rich taxonomy of approaches that differ in their granularity of reactivity, consistency models, coupling to rendering frameworks, and assumptions about the boundary between client and server.

This survey examines the full landscape of state management architecture for web applications as of early 2026. It traces the theoretical foundations in finite state machine theory, Harel statecharts, reactive programming models, and distributed consistency theory. It classifies the major architectural families -- unidirectional data flow stores, atomic/fine-grained reactive systems, proxy-based observable graphs, state machines and statecharts, server state caches, URL-driven state, and conflict-free replicated data types -- and analyzes each with respect to mechanism, evidence, implementation, and trade-offs. The survey synthesizes cross-cutting concerns including performance characteristics, developer ergonomics, server-side rendering compatibility, and framework coupling. It identifies open problems including the TC39 signals standardization effort, the convergence of client databases with reactive query engines, and the unresolved tension between normalized caches and document-oriented optimistic updates.

The presentation is descriptive rather than prescriptive. No single approach dominates all dimensions of the design space, and the selection among architectures remains fundamentally a function of application requirements, team constraints, and the specific mix of state categories an application must manage.

---

## 1. Introduction

### 1.1 Problem Statement

A web application's state is the totality of information that determines what the user sees and what the application will do next. This definition, while simple, masks extraordinary complexity. Consider a dashboard application: the currently authenticated user (authentication state), the selected date range (UI state encoded in the URL), the list of metrics fetched from an API five seconds ago (server/cached state), a half-completed filter form (form state), whether a tooltip is visible (ephemeral component state), a computed aggregate derived from the fetched metrics and the selected range (derived state), and user preferences stored in localStorage (persisted state). Each category has different consistency requirements, different lifetimes, different update frequencies, and different failure modes.

The evolution of web applications from server-rendered pages with minimal client-side logic to rich single-page applications (SPAs) and now to hybrid server/client architectures (Next.js App Router, Remix, SolidStart) has progressively shifted state management complexity to the client. Where a traditional server-rendered application could rely on the HTTP request/response cycle and server-side sessions to manage most state, a modern SPA must maintain a coherent in-memory representation of application state across asynchronous data fetching, optimistic mutations, real-time subscriptions, client-side navigation, and offline operation.

The consequences of poor state management architecture are well-documented in industry experience: inconsistent UI rendering from stale or duplicated state, cascading re-renders degrading performance, race conditions from concurrent asynchronous operations, lost user input from navigation or hydration mismatches, and maintenance burden from tangled state dependencies that make refactoring hazardous. These failure modes motivate the search for architectural patterns that provide correctness, performance, and maintainability guarantees.

### 1.2 Scope

This survey covers state management architecture for web applications running in browser environments, with attention to:

- **Client state categories**: UI state, form state, component-local state, global application state
- **Server/remote state**: Cache invalidation, stale-while-revalidate, optimistic updates, mutation lifecycle
- **Global state patterns**: Flux/Redux unidirectional data flow, signals, atoms, proxies, stores
- **State machines and statecharts**: Finite automata applied to UI logic, XState and the actor model
- **URL-as-state**: Router-driven state, search parameter management, deep linking
- **Derived/computed state**: Memoization, selectors, computed values, dependency tracking
- **State synchronization**: Cross-tab communication, Web Workers, multi-device sync, CRDTs
- **Persistence layers**: localStorage, IndexedDB, OPFS, session storage, WASM-SQLite
- **SSR/hydration**: State serialization, hydration mismatches, server components, streaming
- **Emerging patterns**: Signals (Solid, Angular, Preact, TC39 proposal), fine-grained reactivity, client databases

The survey covers approaches as implemented in the major JavaScript/TypeScript frameworks (React, Vue, Angular, Svelte, Solid) and their associated ecosystems through early 2026.

### 1.3 Key Definitions

**State**: Any data that, if changed, requires the application to update its behavior or rendered output.

**Reactivity**: The automatic propagation of state changes to dependent computations and UI bindings, without explicit imperative notification by the programmer.

**Granularity of reactivity**: The precision with which a reactive system identifies and updates only the specific computations or DOM nodes affected by a state change, ranging from component-level (React's model) to node-level (Solid's model).

**Consistency model**: The guarantees a system provides about the relationship between writes and subsequent reads, ranging from strong consistency (every read reflects the most recent write) to eventual consistency (reads will eventually reflect all writes, but may transiently return stale values).

**Memoization**: The caching of computed results keyed by their inputs, such that repeated invocations with identical inputs return the cached result without recomputation.

---

## 2. Foundations

### 2.1 Finite State Machines and Statecharts

The theoretical foundation for modeling UI behavior as discrete states with explicit transitions derives from automata theory and its extension by David Harel. A finite state machine (FSM) is a quintuple (Q, Sigma, delta, q0, F) consisting of a finite set of states Q, a finite input alphabet Sigma, a transition function delta: Q x Sigma -> Q, an initial state q0, and a set of accepting states F [Hopcroft et al. 2006]. FSMs model systems where behavior depends not only on current inputs but on the history of prior inputs as encoded in the current state.

Harel's statecharts [Harel 1987] extend classical FSMs with three critical features for modeling complex interactive systems: **hierarchy** (states can contain substates, enabling abstraction and reducing the state explosion problem), **orthogonality** (independent concurrent state regions that execute in parallel without requiring the Cartesian product of their state spaces), and **broadcast communication** (events can trigger transitions across orthogonal regions). These extensions address the central limitation of flat FSMs for UI modeling: a realistic interface with n independent binary features would require 2^n states in a flat FSM but only n orthogonal regions in a statechart.

The application of statecharts to UI modeling is grounded in the observation that many UI bugs arise from implicit, unmodeled states. A data fetching component may be idle, loading, displaying data, or displaying an error -- but without explicit state modeling, intermediate states (loading while stale data is displayed) and impossible transitions (error-to-loading without a retry action) become sources of defects. The statechart formalism makes the set of valid states and transitions explicit and exhaustive.

### 2.2 Reactive Programming Models

Reactive programming provides the theoretical framework for automatic change propagation that underlies all modern state management systems. The field distinguishes several reactive paradigms relevant to web applications:

**Functional Reactive Programming (FRP)**, introduced by Elliott and Hudak [1997], models time-varying values as continuous functions of time (behaviors) and discrete occurrences (events). While pure FRP is rarely implemented directly in web frameworks due to its continuous-time semantics, its conceptual influence pervades the field, particularly the separation of declarative state definitions from imperative side effects.

**Transparent Reactive Programming (TRP)**, as embodied by MobX [Weststrate 2016], tracks dependencies at runtime by intercepting property accesses during computation execution. The key insight, articulated by Michel Weststrate, is that "anything that can be derived from the application state, should be derived -- automatically" [Weststrate 2016]. TRP systems maintain a directed acyclic graph (DAG) of dependencies between observable values, computed derivations, and side-effecting reactions. The critical invariant is **glitch-freedom**: no derivation ever observes an inconsistent intermediate state during a batch of updates.

**Signal-based reactivity**, as pioneered by Solid.js [Carniato 2021] and now adopted across the framework ecosystem, refines TRP with three primitive constructs: **signals** (mutable reactive values with getter/setter interfaces), **derivations/memos** (cached computations that automatically track which signals they read and recompute only when those specific signals change), and **effects** (side-effecting functions that re-execute when their tracked dependencies change). The critical architectural distinction from virtual-DOM-based systems is that signals enable **fine-grained reactivity**: when a signal changes, only the specific DOM text nodes or attributes that depend on that signal are updated, without re-executing component functions or diffing virtual trees [Carniato 2021].

The reactive evaluation algorithm common to signal-based systems operates as a hybrid push/pull mechanism. When a signal is written, dependent computations are **pushed** into a "dirty" state. However, the actual recomputation is **pulled** -- it occurs only when a dirty computation's value is read, either by the rendering system or by another computation. This lazy evaluation avoids unnecessary work when dirty computations are not currently observed. The topological ordering of the dependency DAG ensures that computations are evaluated in dependency order, preventing glitches [TC39 Signals Proposal 2024].

### 2.3 Consistency Models

State management architectures implicitly or explicitly adopt consistency models that determine the guarantees applications can rely on:

**Strong consistency** ensures that every read reflects the most recent write. Local, synchronous state management (React's `useState`, Svelte's `$state`) provides strong consistency within a single browser tab by construction -- the reactive system ensures that all derivations and renderings reflect the latest state after each synchronous update batch.

**Eventual consistency** guarantees that, in the absence of new writes, all replicas will eventually converge to the same state. This model is relevant when state must synchronize across tabs (via BroadcastChannel or localStorage events), across devices (via server synchronization), or across users in collaborative applications.

**Strong eventual consistency (SEC)**, formalized through conflict-free replicated data types (CRDTs) [Shapiro et al. 2011], strengthens eventual consistency with the guarantee that any two replicas that have received the same set of updates (regardless of order) will be in the same state, without requiring conflict resolution. CRDTs achieve this through algebraic properties: state-based CRDTs use join-semilattice merge functions, while operation-based CRDTs require commutative update operations. Libraries such as Yjs [Nicolaescu et al. 2016] and Automerge [Kleppmann & Beresford 2017] implement CRDT-based state synchronization for web applications, enabling local-first architectures where the application operates offline and synchronizes state upon reconnection.

**Stale-while-revalidate** is a caching consistency model, originally specified in HTTP Cache-Control headers (RFC 5861), that has been adopted as a state management paradigm by libraries including SWR and TanStack Query. Under this model, stale cached data is served immediately to the UI while a background revalidation request fetches fresh data. The UI may transiently display stale state, but responsiveness is prioritized over freshness -- a deliberate trade-off appropriate for read-heavy interfaces where data changes infrequently relative to access patterns.

### 2.4 The CQRS and Event Sourcing Influence

The Command Query Responsibility Segregation (CQRS) pattern, which separates read operations (queries) from write operations (commands), has influenced frontend state architecture in several ways. Redux's strict separation of action dispatching (commands) from state reading via selectors (queries) directly mirrors CQRS principles. Event sourcing -- the pattern of persisting state as an append-only log of events rather than mutable current state -- appears in Redux's action history (enabling time-travel debugging) and in CRDT operation logs. The Redux DevTools' ability to replay, skip, and reorder actions is a direct application of event sourcing principles to client-side state.

---

## 3. Taxonomy of Approaches

The state management landscape can be organized along multiple dimensions. The following classification framework captures the primary architectural families and their relationships:

### 3.1 Classification Framework

```
State Management Architecture
├── By State Category
│   ├── Client/UI State (component-local, global, ephemeral)
│   ├── Server/Remote State (cached, stale-while-revalidate)
│   ├── URL State (route params, search params)
│   ├── Persistent State (localStorage, IndexedDB, OPFS)
│   └── Synchronized State (cross-tab, cross-device, collaborative)
│
├── By Architectural Pattern
│   ├── Unidirectional Data Flow (Flux, Redux, NgRx, Pinia)
│   ├── Atomic/Bottom-Up (Recoil, Jotai, Nanostores)
│   ├── Proxy-Based Observable (MobX, Valtio, Legend-State)
│   ├── Signal-Based Fine-Grained (Solid, Angular Signals, Svelte Runes)
│   ├── Server State Cache (TanStack Query, SWR, RTK Query, Apollo)
│   ├── State Machine/Statechart (XState, Robot)
│   ├── URL State Manager (nuqs, TanStack Router)
│   └── CRDT/Local-First (Yjs, Automerge, TanStack DB)
│
├── By Reactivity Granularity
│   ├── Component-Level (React useState/useReducer, Redux)
│   ├── Selector-Level (Redux + Reselect, Zustand selectors)
│   └── Node-Level / Fine-Grained (Solid signals, Svelte runes)
│
└── By Framework Coupling
    ├── Framework-Specific (Pinia/Vue, NgRx/Angular, Svelte stores)
    ├── Framework-Adapted (Redux, Zustand, Jotai -- React-primary)
    └── Framework-Agnostic (Nanostores, TanStack Store, XState)
```

### 3.2 Dimensional Analysis

| Dimension | Range | Significance |
|-----------|-------|-------------|
| Reactivity granularity | Component-level to DOM-node-level | Determines re-render scope and performance characteristics |
| State topology | Single store to distributed atoms | Affects code splitting, mental model, and subscription efficiency |
| Mutability model | Immutable (Redux) to mutable-observed (MobX, Valtio) | Impacts developer ergonomics, time-travel debugging, and equality checking |
| Consistency model | Strongly consistent to eventually consistent | Determines correctness guarantees for multi-source state |
| Framework coupling | Tightly coupled to fully agnostic | Affects portability, testing, and migration cost |
| Server boundary | Client-only to server-aware (SSR, RSC) | Determines hydration strategy and serialization requirements |
| Persistence model | Ephemeral to durable (IndexedDB, CRDT sync) | Determines offline capability and cross-session continuity |

---

## 4. Analysis

### 4.1 Unidirectional Data Flow: Flux, Redux, and Descendants

#### Theory and Mechanism

The Flux architecture, introduced by Facebook in 2014, established the unidirectional data flow pattern as a response to the cascading update problems observed in bidirectional data binding systems (notably Backbone.js models with two-way binding to views). The core insight is that state mutations should flow through a single, predictable path: **Action -> Dispatcher -> Store -> View**. Views never mutate stores directly; instead, they dispatch actions (plain data objects describing what happened) to a central dispatcher, which routes them to registered stores. Stores update their internal state in response to actions and emit change events that trigger view re-rendering.

Redux [Abramov & Clark 2015] refined Flux by consolidating multiple stores into a **single immutable state tree** managed by **pure reducer functions**: (state, action) => newState. This design yields three foundational properties: (1) **single source of truth** -- the entire application state lives in one object tree, eliminating synchronization between stores; (2) **state is read-only** -- the only way to change state is to dispatch an action; (3) **changes are made with pure functions** -- reducers are deterministic transformations with no side effects. These properties enable time-travel debugging, state serialization/hydration, and straightforward testing.

Redux Toolkit (RTK), released as the official Redux development toolset, addresses the boilerplate criticism by providing `createSlice` (auto-generating action creators and action types from reducer definitions), `createAsyncThunk` (standardizing async action lifecycle), and Immer integration (enabling "mutative" syntax that produces immutable updates). RTK Query extends the pattern to server state management with auto-generated API hooks, caching, and cache invalidation.

#### Literature and Evidence

Dan Abramov's "You Might Not Need Redux" [2016] remains a foundational text, articulating that Redux's value proposition -- indirection between "what happened" and "how things change" -- is a trade-off, not an unconditional improvement. The indirection enables logging, undo/redo, time-travel debugging, and collaborative features, but imposes cognitive overhead inappropriate for simple applications. Mark Erikson's "Idiomatic Redux: The Tao of Redux" [2017] codified the philosophy that Redux is best understood as a tool for managing change events across decoupled components, not merely a global variable store.

The academic survey by Khan et al. [2024] classifies Redux as the dominant representative of the "State Management Libraries" category, noting its ecosystem maturity and DevTools as key differentiators. Industry surveys consistently show Redux/RTK maintaining the largest installed base among dedicated state management solutions, particularly in enterprise applications where team coordination and strict patterns are valued [State of React 2025].

#### Implementations and Benchmarks

Redux's primary performance concern is **selector efficiency**: naively connecting many components to a single store risks O(n) equality checks on every dispatch. Reselect addresses this through memoized selector composition, where `createSelector` caches computed results and returns cached values when input selectors return referentially identical results. The `re-reselect` library extends memoization with cache key management for parameterized selectors.

Redux Toolkit's adoption of `useSyncExternalStore` (React 18) ensures **tearing-free** rendering under concurrent features -- all components reading from the Redux store see a consistent state snapshot within a single render pass, preventing the visual inconsistencies that concurrent rendering could otherwise introduce with external stores.

#### Strengths and Limitations

**Strengths**: Predictable state transitions; excellent DevTools with time-travel debugging and action replay; mature ecosystem with extensive middleware; explicit action/reducer pattern facilitates code review and reasoning about state changes; strong TypeScript support in RTK; proven at enterprise scale.

**Limitations**: Significant boilerplate even with RTK (compared to Zustand or signals); indirection overhead inappropriate for simple state; single-store model complicates code splitting; component-level reactivity granularity requires manual selector optimization; the action/reducer pattern is verbose for straightforward CRUD operations.

### 4.2 Centralized Store with Minimal API: Zustand

#### Theory and Mechanism

Zustand [Poimandres collective] occupies a design point that preserves Redux's centralized store model while dramatically reducing ceremony. A Zustand store is created with `create((set, get) => ({...}))`, where `set` merges partial state updates (using Immer-compatible shallow merging) and `get` reads current state. Components subscribe to stores via `useStore(selector)`, where the selector function extracts the relevant slice and Zustand only triggers re-renders when the selected value changes (by default via `Object.is` comparison).

The critical architectural choice is using `useSyncExternalStore` internally, making Zustand a thin wrapper around React's official external store subscription mechanism. This provides concurrent rendering safety without the complexity of Redux's middleware chain. Zustand stores are plain JavaScript modules with no providers, no context wrappers, and no action type constants.

#### Implementations and Benchmarks

Zustand's bundle size is approximately 1.2 KB minified and gzipped, roughly an order of magnitude smaller than Redux Toolkit. Its middleware system supports persistence (`persist` middleware for localStorage/AsyncStorage), Immer integration, Redux DevTools compatibility, and subscription-based side effects. The State of React 2025 survey identifies Zustand as the state management library with the highest developer satisfaction, and it has surpassed Redux in npm download growth rate [State of React 2025].

#### Strengths and Limitations

**Strengths**: Minimal API surface; excellent TypeScript inference; no provider components required; works outside React components; trivial middleware composition; concurrent rendering compatible; small bundle size.

**Limitations**: Module-state design can complicate SSR (requires per-request store isolation); selector optimization is manual (unlike atomic approaches); lacks built-in computed/derived state primitives (must compose with external solutions); single-store pattern, while simpler than Redux, still requires deliberate state slicing for performance.

### 4.3 Atomic and Bottom-Up State: Recoil, Jotai, Nanostores

#### Theory and Mechanism

The atomic state model inverts the centralized store topology: instead of a single tree that components select into, state is composed of independent **atoms** -- minimal units of reactive state that components subscribe to directly. Derived state is expressed as **selectors** (Recoil) or **derived atoms** (Jotai) that automatically track their atom dependencies and recompute when those dependencies change.

Recoil, developed at Facebook [2020], introduced the atom/selector model with string-keyed atoms, async selectors with Suspense integration, and atom families for parameterized state creation. However, Recoil's development has stalled since 2023, and its experimental status has driven adoption toward Jotai.

Jotai [Poimandres collective] refines the atomic model with several architectural improvements: atoms use **object identity** rather than string keys (eliminating naming collisions), the API is minimal (`atom()` and `useAtom()`), atoms can be composed into derived atoms with automatic dependency tracking, and async atoms integrate with React Suspense. Jotai's mental model is described as "bottom-up": state is defined at the leaf level and composed upward, contrasting with Redux's "top-down" approach where components reach into a monolithic tree [Jotai documentation].

Nanostores takes the atomic model to its minimal expression at 286 bytes (minified and brotlied) for the core library. Its stores are framework-agnostic reactive containers with separate integration packages for React, Vue, Svelte, Solid, Angular, and Lit. This makes Nanostores particularly suitable for multi-framework architectures such as Astro's island architecture, where different interactive components may use different frameworks.

#### Literature and Evidence

The Jotai documentation's comparison page explicitly positions the atomic model against centralized stores: "Jotai's state resides in React component tree" versus Zustand's "state resides in store outside React." This distinction has practical implications for SSR (Jotai's state is naturally scoped to React rendering contexts) and for React Suspense integration (atoms can natively suspend during async resolution) [Jotai documentation].

#### Implementations and Benchmarks

Jotai's render optimization is automatic through atom dependency tracking: a component using `useAtom(derivedAtom)` re-renders only when the specific atoms that `derivedAtom` depends on change, without requiring manual selector optimization. Complex form applications using Jotai's atomic approach show average update times of 35ms compared to 220ms with traditional React state management approaches in reported benchmarks [Beyond the Virtual DOM, 2024].

#### Strengths and Limitations

**Strengths**: Automatic render optimization through dependency tracking; natural code splitting (atoms are independent modules); composable derived state; React Suspense integration (Jotai, Recoil); minimal boilerplate; excellent for fine-grained subscription patterns.

**Limitations**: Bottom-up composition can become difficult to trace in large codebases (the "atom soup" problem); debugging requires understanding the atom dependency graph; less mature DevTools compared to Redux; atomic model may be unfamiliar to developers accustomed to centralized stores; Recoil's uncertain maintenance status creates ecosystem risk.

### 4.4 Proxy-Based Observable State: MobX, Valtio, Legend-State

#### Theory and Mechanism

Proxy-based state management leverages JavaScript's `Proxy` object to transparently intercept property access and mutation on ordinary JavaScript objects, enabling automatic dependency tracking without explicit subscription APIs. The programmer writes natural mutative code (`state.count++`), and the proxy layer converts these mutations into reactive notifications.

MobX [Weststrate 2016] implements **transparent functional reactive programming (TFRP)**: observable state is declared with `makeObservable` or `makeAutoObservable`, computed values derive from observables via `computed`, and reactions (`autorun`, `reaction`, `when`) execute side effects when their tracked observables change. Weststrate's two critical invariants are: (1) "for any given set of mutations, any affected derivation will run exactly once" and (2) "derivations are never stale, and their effects are immediately visible to any observer" [Weststrate 2016]. MobX achieves these through synchronous, topologically ordered derivation execution within atomic action boundaries.

Valtio [Poimandres collective] simplifies the proxy model for React: `proxy({...})` creates a mutable proxy object, and `useSnapshot(proxyState)` returns an immutable snapshot for rendering. Mutations to the proxy trigger snapshot updates, which trigger React re-renders. The mutable/immutable duality provides ergonomic mutation (no reducers, no action creators) while preserving React's immutable rendering contract.

Legend-State combines proxy-based observables with automatic persistence and sync capabilities. Its observable system tracks property access at the leaf level, enabling fine-grained reactivity where array element updates re-render only the affected element, not the entire list. Benchmarks show Legend-State outperforming vanilla JavaScript on specific operations (swap, replace all rows) in the js-framework-benchmark suite.

#### Literature and Evidence

Weststrate's "Becoming Fully Reactive" [2016] provides the deepest architectural exposition, explaining MobX's derivation graph as three layers: **observable state** (blue -- raw data under application control), **computed values** (green -- derived data expressing relationships), and **reactions** (red -- side effects triggered by changes). Computed values that are not observed by any reaction are automatically **suspended**, enabling garbage collection of unused derivations -- a property unique to MobX's eager subscription model.

Weststrate strongly emphasizes preferring computed values over reactions because they provide conceptual clarity through pure expressions, enable automatic suspension and garbage collection, and prevent side-effect-driven code chains. Actions automatically apply transaction semantics, grouping mutations atomically while maintaining synchronous derivation execution [Weststrate 2016].

#### Implementations and Benchmarks

MobX 6+ uses ES Proxies by default (falling back to Object.defineProperty for environments without Proxy support). The `observer` higher-order component (via `mobx-react-lite`) wraps React components to automatically track which observables they access during rendering, creating a fine-grained subscription that re-renders only when accessed observables change.

A comparison of proxy-based approaches [FrontendUndefined 2024] notes that MobX provides the most complete reactive system (observables, computed, reactions, actions) while Valtio offers the simplest API with the mutable proxy/immutable snapshot split. Legend-State's 4 KB bundle size and built-in persistence/sync plugins position it as a full-stack client state solution.

#### Strengths and Limitations

**Strengths**: Natural mutative syntax reduces cognitive overhead; automatic fine-grained dependency tracking; MobX's computed value model is theoretically elegant and efficient; Valtio's snapshot model integrates cleanly with React's rendering; Legend-State provides built-in persistence and sync.

**Limitations**: Proxy interception adds runtime overhead compared to direct signal reads; deep nesting can produce complex proxy chains; TypeScript inference through proxies can be unreliable for complex nested structures; the implicit nature of dependency tracking can make data flow harder to trace than explicit subscriptions; MobX's learning curve for the full observable/computed/reaction model is non-trivial.

### 4.5 Signal-Based Fine-Grained Reactivity: Solid, Angular, Svelte, Preact

#### Theory and Mechanism

Signals represent the convergence of the JavaScript framework ecosystem toward a common reactivity primitive. The term refers to reactive values with getter/setter interfaces that automatically track their dependents and notify them of changes, enabling DOM updates at the granularity of individual text nodes and attributes rather than component subtrees.

Ryan Carniato's exposition of fine-grained reactivity [2021] identifies the three foundational constructs: **Signals** (storage containers with getters and setters that can execute arbitrary code), **Derivations/Memos** (cached intermediate computations that prevent unnecessary recalculation by storing derived values and only recomputing when source dependencies change), and **Effects** (observer functions that automatically re-execute whenever their dependency signals update). Carniato describes the system as "an idealized electric circuit" where changes propagate simultaneously across connected nodes. The critical innovation is **dynamic dependency management**: every time a reactive expression executes, it rebuilds its dependency list based on which signals were actually read, enabling automatic cleanup when conditions change which data a derivation uses.

**Solid.js** compiles JSX templates to direct DOM operations with signal-based reactivity, achieving near-vanilla-JavaScript performance with a bundle size of approximately 7.6 KB (compared to React + ReactDOM at approximately 45 KB). In Solid's model, component functions execute exactly once to set up the reactive graph and create DOM nodes; subsequent updates propagate through signals directly to DOM bindings without re-executing component functions.

**Angular Signals**, introduced in Angular v16 (2023) and production-ready in v19/v20, mirror Solid's API with `signal()`, `computed()`, and `effect()`. Angular's adoption of signals represents a fundamental architectural shift from its previous Zone.js-based change detection (which detected changes by monkey-patching asynchronous APIs) to explicit, fine-grained reactivity. The NgRx ecosystem has responded with `@ngrx/signals` and `SignalStore`, integrating the signal primitive with Redux-style patterns.

**Svelte 5 Runes** (`$state`, `$derived`, `$effect`) replace Svelte 4's compiler-based reactivity with an explicit signal-like system that works outside `.svelte` components in `.svelte.js` and `.svelte.ts` files. This represents a shift from compile-only to compile-enhanced reactivity with a minimal runtime footprint. Runes are memoized (`$derived` computes only when needed), portable across files, and explicit in their reactivity boundaries.

**Preact Signals** (`@preact/signals`) bring fine-grained reactivity to the Preact/React ecosystem, where signal reads in JSX bypass React's component re-rendering entirely by updating DOM nodes directly through a special Signal-aware rendering path.

#### Literature and Evidence

The TC39 Signals Proposal [2024], currently at Stage 1, represents the strongest institutional validation of the signal pattern. Authored collaboratively by maintainers of Angular, Solid, Vue, Svelte, Preact, Qwik, MobX, and others, the proposal defines `Signal.State` (writable reactive values), `Signal.Computed` (lazy-evaluated cached derivations with automatic dependency tracking and glitch-free evaluation), and `Signal.subtle.Watcher` (a framework-level primitive for scheduling effects). The proposal's evaluation algorithm maintains a directed acyclic graph (DAG) of signals with lazy evaluation, topological ordering for glitch-free consistency, and a two-stage effect scheduling model that decouples dependency notification from effect execution [TC39 Signals Proposal 2024].

Redmonk analyst Kate Holterhoff [2025] positions signals and React Compiler as complementary rather than competing approaches: "The best of both worlds might be frameworks that use compilers and signals, each for what they do best." Misko Hevery (Angular, Qwik creator) argues that "signals are more efficient because they are not bound by the component render tree" [Holterhoff 2025].

Solid.js in 2026 maintains approximately 35,200 GitHub stars and 1.49 million weekly npm downloads. While modest by React standards, its influence is disproportionate: Angular's signal API mirrors Solid's model directly, and the TC39 proposal draws heavily on Solid's design [Listiak 2026]. React's response -- React Compiler v1.0 (October 2025), which automatically applies memoization at build time -- represents an alternative approach to the same performance problem signals address, preserving React's component re-execution model while reducing unnecessary work.

#### Implementations and Benchmarks

In the Krausest js-framework-benchmark, Solid consistently places near the top for both DOM manipulation speed and memory efficiency, competing with vanilla JavaScript implementations. Vue 3.5 with Vapor Mode (experimental fine-grained rendering without virtual DOM) achieves 36% improvement over React in raw DOM manipulation, completing 1,000-row updates in 27ms versus React's 42ms, with 40% less memory usage at idle [benchmark reports 2024].

The performance advantage of signals derives from elimination of three costs inherent in virtual DOM systems: (1) re-execution of component functions to produce new virtual trees, (2) diffing of old and new virtual trees to identify changes, and (3) patching of the real DOM with the identified changes. Signal-based systems skip all three steps, instead propagating changes directly from the reactive graph to the specific DOM nodes that depend on the changed signal.

#### Strengths and Limitations

**Strengths**: Maximum reactivity granularity (DOM-node-level updates); minimal runtime overhead; composable reactive primitives; growing cross-framework convergence toward standard semantics; TC39 standardization effort may provide native browser optimization and DevTools support.

**Limitations**: Different mental model from React's "re-render the world" approach requires learning investment; ecosystem maturity varies (Solid's component library ecosystem is smaller than React's); fine-grained reactivity complicates some patterns (e.g., "render props" patterns that rely on component re-execution); TC39 standardization timeline is measured in years; debugging fine-grained reactive graphs requires specialized tooling.

### 4.6 Server State Management: TanStack Query, SWR, RTK Query

#### Theory and Mechanism

Server state management libraries formalize the insight that data fetched from a server is fundamentally different from client state: it is **asynchronous** (requiring loading/error states), **shared** (potentially needed by multiple components), **stale** (the server's truth may diverge from the cached copy at any time), and **not owned** by the client (the server is the source of truth). TanStack Query (formerly React Query) [Linsley 2020] and SWR [Vercel] implement the **stale-while-revalidate** caching strategy: cached data is served immediately while a background fetch retrieves fresh data, providing instant UI responsiveness at the cost of transiently displaying stale values.

The TanStack Query architecture centers on three concepts: **query keys** (serializable identifiers that uniquely determine a piece of server data), **query functions** (async functions that fetch data), and **cache entries** keyed by query keys with configurable `staleTime` (duration before data is considered stale) and `gcTime` (duration before unused cache entries are garbage collected). The mutation lifecycle provides `onMutate` (for optimistic updates), `onError` (for rollback), and `onSettled` (for cache invalidation after mutation completion).

**Optimistic updates** are a critical pattern within server state management. The approach stores the previous cache state before applying an optimistic update, immediately reflects the mutation in the UI, and reverts to the stored state if the server request fails. Two levels of optimism exist: **UI-level** (updating only local component state, appropriate when cache invalidation will refresh data) and **cache-level** (directly updating the query cache, necessary when multiple components observe the same data) [TanStack Query documentation].

SWR, maintained by Vercel, provides a deliberately minimal API (the cache key is the URL, the fetcher is user-provided) with automatic revalidation on focus, on reconnect, and on interval. Its 5.3 KB bundle (versus TanStack Query's 16.2 KB) reflects a philosophy of simplicity over feature completeness. RTK Query integrates server state caching into the Redux Toolkit ecosystem, providing auto-generated API hooks and cache management within Redux's single-store architecture.

#### Literature and Evidence

TanStack Query's documentation explicitly frames its value as separating server state from client state: "Server state is 'borrowed' -- it's data that exists remotely, owned by the server, and can become stale without you knowing." Industry experience reports that combining Zustand (for client state) with TanStack Query (for server state) replaces the majority of Redux use cases in modern applications [dev.to community reports, 2025]. The State of React 2025 survey shows TanStack Query as the dominant data fetching library, with SWR as the primary alternative.

#### Implementations and Benchmarks

TanStack Query supports React, Vue, Solid, Angular, and Svelte through framework-specific adapters. Its SSR integration supports both server-side prefetching (hydrating the cache before client rendering) and streaming (suspense-based fetching during server rendering). TanStack Query v5 introduced the `dehydrate`/`hydrate` API for serializing cache state during SSR and restoring it on the client.

TanStack DB [2025], currently in beta, extends the TanStack Query paradigm toward a client-side reactive database. Collections store normalized records, and live queries use differential dataflow (d2ts) to update results incrementally as underlying data changes. Benchmarks report sub-millisecond update times: updating one row in a sorted 100,000-item collection completes in approximately 0.7ms on an M1 Pro MacBook [TanStack DB documentation].

#### Strengths and Limitations

**Strengths**: Clean separation of server state from client state; automatic cache management reduces boilerplate; stale-while-revalidate provides excellent perceived performance; built-in loading/error state management; DevTools for cache inspection; framework-agnostic (TanStack Query); SSR/streaming support.

**Limitations**: Does not solve client state management (must be combined with another solution); cache invalidation strategies require careful design; normalized caching (as in Apollo Client) is not supported by default (TanStack Query uses document-based caching); optimistic update rollback requires manual implementation; background refetching can produce visual "flicker" when stale and fresh data differ.

### 4.7 State Machines and Statecharts: XState

#### Theory and Mechanism

XState [Thielen 2019] implements Harel statecharts and the actor model for managing complex, state-dependent application logic. An XState machine is a formal specification of: finite states (and hierarchical substates), transitions triggered by events, guards (boolean conditions on transitions), actions (side effects executed on transitions or state entry/exit), and invoked services (child actors for asynchronous operations).

The actor model integration (XState v5) enables composition of independent state machines that communicate through message passing, each with its own encapsulated state and behavior. This model is particularly suited for complex orchestration scenarios: multi-step forms, authentication flows, payment processes, and real-time collaboration features where the system must track multiple independent but interacting state-dependent processes.

#### Literature and Evidence

The primary argument for statechart-based state management is the elimination of **impossible states** through explicit modeling. Consider a data-fetching component: a boolean-based approach (`isLoading`, `isError`, `hasData`) produces 2^3 = 8 possible combinations, of which several are semantically meaningless (e.g., `isLoading && isError && hasData`). A state machine with four states (idle, loading, success, error) and explicit transitions between them makes impossible states unrepresentable and ensures all transitions are intentional [Thielen 2019].

David Khourshid (XState creator) has documented how statecharts reduce bugs by making state transitions explicit and exhaustive. The visual representation of state machines (via the Stately editor) provides a shared language between developers, designers, and product managers for specifying application behavior.

#### Implementations and Benchmarks

XState provides framework adapters for React (`@xstate/react`), Vue (`@xstate/vue`), Svelte (`@xstate/svelte`), and Solid (`@xstate/solid`). XState v5 reduced bundle size significantly and adopted the actor model as its primary composition mechanism. The Stately visual editor allows creating and editing state machines graphically, generating XState code from visual diagrams.

#### Strengths and Limitations

**Strengths**: Formally grounded in automata theory; eliminates impossible states; visual representation aids communication; testable by construction (enumerate states and transitions); excellent for complex, multi-step workflows; actor model enables composition of independent processes.

**Limitations**: Significant conceptual overhead for simple state management tasks; learning curve for statechart formalism (hierarchy, orthogonality, history states); verbose for CRUD operations that don't benefit from explicit state modeling; smaller ecosystem compared to Redux or signals-based approaches; the formalism can feel heavy for prototyping.

### 4.8 URL-as-State and Router-Driven State

#### Theory and Mechanism

URL-as-state is the principle that application state relevant to navigation, sharing, and bookmarking should be encoded in the URL (path parameters, search parameters, hash fragments) rather than in ephemeral in-memory state. This principle is grounded in the web's architectural constraint that URLs are the primary interface for identifying and sharing application states.

URL state management involves serialization (encoding application state into URL-compatible strings), synchronization (keeping URL state and application state consistent), type safety (parsing URL strings into typed application values), and history integration (managing browser history entries for back/forward navigation).

**nuqs** [Best 2023] provides a `useState`-like API for URL search parameters in React and Next.js applications. `useQueryState('key', parseAsInteger)` returns a reactive value and setter that are synchronized with the URL's query string, with built-in parsers for common types and support for custom serialization. nuqs handles the complexity of Next.js App Router integration, server component access to search parameters, and batched URL updates to avoid unnecessary history entries.

TanStack Router provides deeply type-safe URL state through its search parameter schema validation, where route definitions include typed search parameter schemas and route components receive type-safe access to parsed search parameters.

#### Strengths and Limitations

**Strengths**: Enables deep linking and sharing of application state; integrates with browser history (back/forward navigation); survives page refreshes; provides a natural serialization boundary for SSR; search parameters can be read in server components.

**Limitations**: URL length limits constrain the amount of state that can be encoded; serialization/deserialization adds complexity; frequent URL updates can degrade performance (especially with Next.js router integrations that trigger re-renders); not all state is semantically appropriate for URL encoding (ephemeral UI state, sensitive data); coordinating URL state with in-memory state requires careful synchronization.

### 4.9 Derived and Computed State

#### Theory and Mechanism

Derived state is data that can be computed from other state without independent storage. The principle that "anything that can be derived from the application state should be derived -- automatically" [Weststrate 2016] is a cornerstone of effective state management: storing derived values independently introduces the risk of inconsistency when source state changes.

Derived state implementations span a spectrum of granularity. **Reselect** provides memoized selector composition for Redux, where `createSelector` caches the result of an "output selector" function based on the referential equality of its "input selector" results. **React's `useMemo`** memoizes computations within a component render based on a dependency array. **MobX's `computed`** tracks which observables were accessed during computation and recalculates only when those specific observables change. **Signal-based `memo`/`computed`** (Solid's `createMemo`, Angular's `computed()`, Svelte's `$derived`) provides the finest granularity, caching derivations within the reactive graph and updating only when their signal dependencies change.

React Compiler v1.0 [October 2025] automates derived state optimization by analyzing component source code at build time and inserting memoization (`useMemo`, `useCallback`, `React.memo`) where the compiler determines it would prevent unnecessary re-computation or re-rendering. This approach eliminates the manual optimization burden that characterizes React's memoization APIs while preserving the component re-execution model.

#### Strengths and Limitations

**Strengths**: Eliminates redundant state; ensures consistency between source and derived values; memoization prevents unnecessary recomputation; selector composition enables building complex derivations from simple building blocks.

**Limitations**: Memoization is not free -- cache maintenance consumes memory and cache invalidation checks consume CPU; overuse of `useMemo` can degrade performance when the memoization overhead exceeds the computation cost; selector composition can become deeply nested and difficult to debug; React Compiler's automatic memoization may produce suboptimal results for edge cases.

### 4.10 Persistence Layers: localStorage, IndexedDB, OPFS

#### Theory and Mechanism

Browser persistence technologies provide durable state storage that survives page reloads, browser restarts, and (with synchronization layers) cross-device state sharing. The selection among persistence technologies involves trade-offs in capacity, performance, API complexity, and concurrent access:

| Technology | Capacity | API | Thread Safety | Performance (Single Write) |
|------------|----------|-----|---------------|--------------------------|
| Cookies | ~4 KB | Synchronous string | Main thread only | N/A (HTTP overhead) |
| localStorage | 5-10 MB | Synchronous key-value string | Main thread only | ~0.017ms |
| IndexedDB | Up to 80% of disk | Asynchronous transactional | Main thread + Workers | ~0.17ms |
| OPFS | Up to 80% of disk | Async (main), Sync (Worker) | Workers only (sync mode) | ~1.54ms |
| WASM-SQLite | Up to 80% of disk | SQL via WASM | Workers | ~3.17ms (504ms init) |

[RxDB benchmark data, 2024]

**localStorage** provides the simplest API with the fastest single-operation performance (0.017ms writes) but is synchronous (blocking the main thread), limited to 5-10 MB, and stores only strings (requiring JSON serialization). Its `storage` event enables cross-tab state synchronization but fires only in other tabs, not the tab that made the change.

**IndexedDB** provides an asynchronous, transactional API for structured data with indexing support and effectively unlimited storage. However, individual write operations are approximately 10x slower than localStorage (0.17ms), and its callback-based API is notoriously complex. Libraries like Dexie.js and idb provide Promise-based wrappers that substantially improve ergonomics.

**OPFS (Origin Private File System)** provides file-system-like access with synchronous mode available in Web Workers, offering high-throughput binary I/O. **WASM-SQLite** provides full SQL database functionality in the browser but incurs significant initialization overhead (~504ms).

State management persistence is typically implemented through middleware (Zustand's `persist` middleware, Nanostores' `@nanostores/persistent`, Legend-State's built-in persistence) that automatically serializes state to a storage backend and rehydrates it on application startup.

### 4.11 State Synchronization Across Tabs, Workers, and Devices

#### Theory and Mechanism

Cross-context state synchronization addresses the problem of maintaining consistent state across multiple browser tabs, Web Workers, and devices. The available mechanisms form a hierarchy of capability and complexity:

**BroadcastChannel API** provides a simple message bus for same-origin communication across tabs, iframes, and workers. Creating `new BroadcastChannel('channel-name')` in multiple contexts allows `postMessage` and `onmessage` for broadcasting state changes. It is suitable for simple state synchronization (e.g., authentication state, theme preferences) but provides no guarantees about message ordering or delivery.

**SharedWorker** provides a single worker instance shared across all same-origin tabs, enabling centralized state management with message-passing communication. SharedWorkers can manage WebSocket connections, maintain canonical state, and broadcast updates to connected tabs, but their API complexity and limited debugging support limit adoption.

**Service Workers** provide background execution that persists across tab closures, enabling offline state management and background synchronization. However, Service Workers communicate only through message passing and cannot directly access DOM or synchronous storage APIs.

**CRDTs and Local-First Architecture** provide the strongest synchronization guarantees for cross-device state. **Yjs** implements operation-based CRDTs with shared types (Y.Map, Y.Array, Y.Text) that merge concurrently without conflicts. Yjs is network-agnostic, supporting peer-to-peer (WebRTC), client-server (WebSocket), and offline synchronization via IndexedDB persistence. **Automerge** provides a JSON-like CRDT data model built in Rust with JavaScript bindings via WebAssembly, optimized for document-level synchronization with efficient binary encoding.

The local-first software movement [Kleppmann et al. 2019] advocates architectures where the primary copy of data lives on the client device, with server synchronization as an optional enhancement rather than a requirement. This inverts the traditional client-server relationship and demands state management solutions that handle conflict resolution, offline operation, and convergence guarantees.

### 4.12 SSR, Hydration, and Server Components

#### Theory and Mechanism

Server-side rendering (SSR) introduces unique state management challenges: state must be produced on the server, serialized into the HTML response, and deserialized (hydrated) on the client to restore interactivity without visual discontinuity (hydration mismatch). The requirements for state serialization constrain which values can be included in server-rendered state: functions, Symbols, undefined, Dates, Maps, Sets, and circular references are not natively serializable by React's server component protocol.

**React Server Components (RSC)** fundamentally restructure the client/server state boundary. Server Components execute on the server and produce a binary payload (the RSC Payload) that includes rendered output and serialized props for Client Components. Server Components cannot use `useState`, `useContext`, or other client-side state hooks; they access data directly (database queries, file system reads) without the client-side caching layer. Client Components receive props from Server Components through the RSC serialization boundary and manage their own local and shared state.

**Hydration strategies** have evolved from full-page hydration (React's traditional `hydrateRoot`) to **selective hydration** (React 18's `Suspense`-based approach that hydrates independent subtrees as they become interactive), **progressive hydration** (hydrating components as they enter the viewport), and **resumability** (Qwik's approach of serializing the reactive graph itself, allowing interactivity without re-executing component initialization code).

State management libraries must explicitly support SSR to avoid hydration mismatches. The primary pattern is: initialize state with a server-safe default, render on the server with that default, hydrate on the client, then update state in a `useEffect` (which runs only on the client). Libraries like Zustand require per-request store isolation in SSR to prevent state leaking between requests. TanStack Query's `dehydrate`/`hydrate` API serializes the query cache during SSR and restores it on the client, enabling instant data display without client-side refetching.

---

## 5. Comparative Synthesis

### 5.1 Cross-Cutting Trade-Off Analysis

| Dimension | Redux/RTK | Zustand | Jotai | MobX | Solid Signals | TanStack Query | XState |
|-----------|-----------|---------|-------|------|---------------|----------------|--------|
| **Bundle size** | ~11 KB | ~1.2 KB | ~2.4 KB | ~16 KB | ~7.6 KB (framework) | ~16 KB | ~18 KB |
| **Reactivity granularity** | Component (selector) | Component (selector) | Atom-level | Observable-level | DOM-node-level | Query-level | State-level |
| **Mutability model** | Immutable (Immer optional) | Immutable (shallow merge) | Immutable | Mutable (observed) | Mutable signals | N/A (cache) | Immutable (context) |
| **DevTools** | Excellent | Good (Redux DevTools) | Basic | Good | Growing | Excellent | Visual editor |
| **TypeScript** | Good (RTK) | Excellent | Excellent | Good | Excellent | Excellent | Excellent |
| **SSR support** | Manual | Manual (per-request) | Built-in (React tree) | Manual | Native | Built-in (dehydrate) | Manual |
| **Learning curve** | Moderate (RTK) | Low | Low | Moderate | Moderate (new model) | Low | High (formalism) |
| **Framework coupling** | React-primary | React-primary | React-primary | Multi-framework | Solid-native | Multi-framework | Framework-agnostic |
| **State category** | Client global | Client global | Client (any) | Client (any) | Client (any) | Server/remote | Complex workflows |
| **Best scale** | Large teams | Any | Any | Medium-large | Any | Any w/ server data | Complex flows |

### 5.2 State Category Coverage Matrix

| State Category | Built-in (useState, etc.) | Zustand/Redux | Jotai/Atoms | TanStack Query/SWR | XState | URL State (nuqs) | Persistence (persist middleware) |
|----------------|--------------------------|---------------|-------------|--------------------|---------|-----------------|---------------------------------|
| Component-local UI | Primary | Overkill | Possible | No | Possible | No | No |
| Global UI | Lifting/Context | Primary | Primary | No | Possible | No | Possible |
| Form state | Primary (+ React Hook Form) | Possible | Possible | No | Good | Partial | Possible |
| Server/cached | No | Manual | Manual | Primary | No | No | No |
| URL/navigation | useSearchParams | No | No | No | No | Primary | No |
| Persistent | No | Via middleware | Via integration | Via cache | Via persist | Inherent | Primary |
| Cross-tab sync | No | Via middleware | Via integration | Via refetch | No | Inherent | Via storage events |
| Cross-device/collab | No | No | No | Via refetch | No | No | CRDT layer required |

### 5.3 The Convergence Toward Signals

A striking pattern in the 2023-2026 period is the convergence of major frameworks toward signal-based reactivity:

- **Solid.js**: Pioneered the modern signal model (2021+)
- **Angular**: Adopted signals in v16-v20, replacing Zone.js change detection (2023-2025)
- **Svelte**: Replaced compiler-only reactivity with runes (`$state`, `$derived`, `$effect`) in Svelte 5 (2024)
- **Vue**: Built on similar reactive primitives (`ref()`, `computed()`) since Vue 3 (2020), with Vapor Mode moving toward fine-grained DOM updates
- **Preact**: Introduced `@preact/signals` for fine-grained reactivity in the React-compatible ecosystem (2022)
- **TC39**: Stage 1 proposal for JavaScript-native signals with broad framework author collaboration (2024)

React remains the notable exception, pursuing build-time optimization (React Compiler) rather than runtime signal primitives. This divergence reflects a philosophical difference: React's model prioritizes the simplicity of "just a function that returns UI" at the component level, relying on compilation to optimize performance, while signal-based frameworks prioritize runtime efficiency through explicit reactive primitives.

---

## 6. Open Problems and Gaps

### 6.1 The TC39 Signals Standardization Timeline

The TC39 signals proposal, while broadly supported by framework authors, faces a multi-year standardization timeline. The proposal champions have stated they expect "at least 2-3 years at an absolute minimum" before native browser availability without polyfills [TC39 Signals Proposal 2024]. Key unresolved questions include garbage collection of computed signals in active graphs, the adequacy of the `Signal.subtle` namespace for separating framework-level from application-level APIs, and whether frameworks will actually adopt built-in signals or continue parallel implementations. The interoperability promise -- sharing reactive state across frameworks -- remains the strongest motivation, but its realization depends on adoption by Angular, Vue, Solid, and Svelte of the standardized primitives.

### 6.2 The Normalized Cache Problem

TanStack Query's document-based caching (keyed by query parameters, returning complete response shapes) and Apollo Client's normalized caching (decomposing responses into individually cached entities by ID) represent fundamentally different approaches to server state consistency. Document caching is simpler but can produce inconsistencies when the same entity appears in multiple queries. Normalized caching ensures entity-level consistency but is dramatically more complex to implement and reason about. No current solution fully resolves this tension: TanStack Query's cache invalidation strategy (mark queries as stale and refetch) trades bandwidth for simplicity, while Apollo's normalized cache trades complexity for consistency. TanStack DB's collections and reactive queries may represent a convergence point, but the project remains in beta.

### 6.3 Server Components and State Boundaries

React Server Components introduce a novel state boundary: Server Components can access data directly but cannot hold client state, while Client Components can hold state but access data only through network requests (or props serialized from Server Components). The optimal partition of state between server and client layers remains an active design question. Current patterns (fetching in Server Components, passing to Client Components as props, using TanStack Query for dynamic client-side data) are pragmatic but lack a unified theory. The relationship between server-side data access, client-side caching, and the RSC serialization boundary needs formal articulation.

### 6.4 Local-First State Management

CRDT-based local-first architectures promise offline operation, instant responsiveness, and multi-device synchronization, but introduce significant complexity: CRDT data structures have higher memory overhead than plain objects, merge semantics may surprise users (e.g., concurrent list insertions producing unexpected orderings), and the "local writes, eventual sync" model complicates server-side validation and authorization. Some teams have moved away from CRDTs for synchronization, finding that simpler approaches (last-write-wins with conflict detection, operational transformation) better fit their requirements [PowerSync 2025]. The integration of CRDT synchronization with existing state management libraries remains largely manual.

### 6.5 State Management for AI-Integrated Applications

The emergence of streaming AI responses, tool-calling patterns, and agentic interfaces introduces state management patterns not well-served by existing architectures. Streaming server responses produce state that incrementally grows rather than replacing previous state; tool calls create branching execution paths with rollback requirements; and conversational interfaces maintain unbounded, append-only state histories that challenge fixed-schema state models. These patterns are actively being explored (TanStack AI toolkit, Vercel AI SDK) but lack established architectural consensus.

### 6.6 Performance Measurement and Comparison

The js-framework-benchmark provides standardized DOM manipulation measurements, but real-world state management performance depends on application-specific factors (state graph topology, update frequency, derivation complexity, component tree depth) that synthetic benchmarks cannot capture. There is no widely adopted benchmark for state management library performance in isolation from rendering frameworks, making evidence-based comparisons dependent on application-specific profiling.

---

## 7. Conclusion

State management architecture for web applications has evolved from a landscape dominated by a single pattern (Flux/Redux unidirectional data flow, 2014-2019) to a rich ecosystem of specialized approaches addressing distinct state categories with different consistency models, reactivity granularities, and trade-off profiles. The major architectural families -- centralized immutable stores, atomic bottom-up composition, proxy-based observable graphs, fine-grained signal reactivity, server state caches, state machines, and CRDT-based local-first systems -- each address real architectural needs and each carry inherent limitations.

The most significant trend of the 2023-2026 period is the convergence toward fine-grained reactivity primitives (signals), driven by Solid.js's demonstrated performance advantages and formalized through the TC39 standardization proposal. This convergence has reshaped Angular's core architecture, motivated Svelte's runes redesign, and prompted React's alternative response through build-time compilation. Simultaneously, the separation of server state from client state (pioneered by TanStack Query and SWR) has become conventional wisdom, reducing the scope of global client state management in many applications.

The emerging frontier is the integration of reactive state management with client-side databases (TanStack DB), CRDT-based synchronization (Yjs, Automerge), and streaming AI interfaces. These domains demand state management architectures that handle incremental updates, conflict resolution, and unbounded state growth -- requirements that push beyond the assumptions of current tools.

No single architecture dominates all dimensions of the design space. The selection among approaches remains a function of the specific mix of state categories an application manages, the performance characteristics it requires, the team's familiarity with different reactive models, the deployment architecture (SPA, SSR, RSC), and the synchronization requirements across tabs, devices, and users. The field's trajectory suggests continued specialization and composition -- applications combining multiple approaches (e.g., signals for client state, TanStack Query for server state, URL state for navigation, IndexedDB for persistence) -- rather than convergence toward a single universal solution.

---

## References

1. Abramov, D. (2016). "You Might Not Need Redux." Medium. https://medium.com/@dan_abramov/you-might-not-need-redux-be46360cf367

2. Abramov, D. & Clark, A. (2015). Redux: Predictable State Container for JS Apps. https://redux.js.org/

3. Carniato, R. (2021). "A Hands-on Introduction to Fine-Grained Reactivity." DEV Community. https://dev.to/ryansolid/a-hands-on-introduction-to-fine-grained-reactivity-3ndf

4. Carniato, R. (2021). "The Fastest Way to Render the DOM." Better Programming. https://betterprogramming.pub/the-fastest-way-to-render-the-dom-e3b226b15ca3

5. Elliott, C. & Hudak, P. (1997). "Functional Reactive Animation." Proceedings of ICFP '97.

6. Erikson, M. (2017). "Idiomatic Redux: The Tao of Redux, Part 2 -- Practice and Philosophy." https://blog.isquaredsoftware.com/2017/05/idiomatic-redux-tao-of-redux-part-2/

7. Harel, D. (1987). "Statecharts: A Visual Formalism for Complex Systems." Science of Computer Programming, 8(3), 231-274. https://www.state-machine.com/doc/Harel87.pdf

8. Holterhoff, K. (2025). "Optimizing JavaScript Delivery: Signals v React Compiler." RedMonk. https://redmonk.com/kholterhoff/2025/05/13/javascript-signals-react-compiler/

9. Hopcroft, J., Motwani, R., & Ullman, J. (2006). Introduction to Automata Theory, Languages, and Computation. 3rd ed. Pearson.

10. Khan, M. et al. (2024). "Application State Management (ASM) in the Modern Web and Mobile Applications: A Comprehensive Review." arXiv:2407.19318. https://arxiv.org/abs/2407.19318

11. Kleppmann, M. & Beresford, A. (2017). "A Conflict-Free Replicated JSON Datatype." IEEE Transactions on Parallel and Distributed Systems.

12. Kleppmann, M. et al. (2019). "Local-First Software: You Own Your Data, in spite of the Cloud." Proceedings of Onward! 2019.

13. Linsley, T. (2020). TanStack Query. https://tanstack.com/query

14. Listiak, M. (2026). "The State of Solid.js in 2026: Signals, Performance, and Growing Influence." https://listiak.dev/blog/the-state-of-solid-js-in-2026-signals-performance-and-growing-influence

15. Nicolaescu, P. et al. (2016). "Yjs: A Framework for Near Real-Time P2P Shared Editing on Arbitrary Data Types." Proceedings of ECSCW 2015.

16. React Documentation. "useSyncExternalStore." https://react.dev/reference/react/useSyncExternalStore

17. Redux Documentation. "Deriving Data with Selectors." https://redux.js.org/usage/deriving-data-selectors

18. Shapiro, M. et al. (2011). "Conflict-free Replicated Data Types." Proceedings of SSS 2011.

19. TC39. (2024). "Proposal: Signals." https://github.com/tc39/proposal-signals

20. Weststrate, M. (2016). "The Fundamental Principles Behind MobX." HackerNoon. https://medium.com/hackernoon/the-fundamental-principles-behind-mobx-7a725f71f3e8

21. Weststrate, M. (2016). "Becoming Fully Reactive: An In-Depth Explanation of MobX." HackerNoon. https://medium.com/hackernoon/becoming-fully-reactive-an-in-depth-explanation-of-mobservable-55995262a254

22. State of React 2025 Survey. "State Management." https://2025.stateofreact.com/en-US/libraries/state-management/

23. Jotai Documentation. "Comparison." https://jotai.org/docs/basics/comparison

24. TanStack Query Documentation. "Query Invalidation." https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation

25. TanStack Query Documentation. "Optimistic Updates." https://tanstack.com/query/v4/docs/react/guides/optimistic-updates

26. TanStack DB Documentation. "Overview." https://tanstack.com/db/latest/docs/overview

27. XState Documentation. https://stately.ai/docs/xstate

28. Svelte Documentation. "Introducing Runes." https://svelte.dev/blog/runes

29. Angular Signals Discussion. https://github.com/angular/angular/discussions/49090

30. Zustand Documentation. "Comparison." https://zustand.docs.pmnd.rs/learn/getting-started/comparison

31. Pinia Documentation. https://pinia.vuejs.org/

32. nuqs Documentation. https://nuqs.dev

33. RxDB. "LocalStorage vs. IndexedDB vs. Cookies vs. OPFS vs. WASM-SQLite." https://rxdb.info/articles/localstorage-indexeddb-cookies-opfs-sqlite-wasm.html

34. Chrome Developers. "BroadcastChannel API -- A Message Bus for the Web." https://developer.chrome.com/blog/broadcastchannel

35. Krausest. "JS Framework Benchmark." https://krausest.github.io/js-framework-benchmark/

36. Nanostores. GitHub repository. https://github.com/nanostores/nanostores

37. Legend-State. GitHub repository. https://github.com/LegendApp/legend-state

38. TanStack Store. "Overview." https://tanstack.com/store/latest/docs/overview

---

## Practitioner Resources

### Libraries and Tools

- **Redux Toolkit** (https://redux-toolkit.js.org/) -- Official, batteries-included Redux development toolset with RTK Query for server state. The standard choice for large teams requiring strict patterns and comprehensive DevTools.

- **Zustand** (https://zustand.docs.pmnd.rs/) -- Minimal centralized store with hooks-based API, ~1.2 KB. Widely adopted as a simpler Redux alternative with excellent TypeScript support and middleware composition.

- **Jotai** (https://jotai.org/) -- Atomic state management with bottom-up composition, automatic render optimization, and React Suspense integration. Created by the Poimandres collective (same team as Zustand and Valtio).

- **TanStack Query** (https://tanstack.com/query) -- Server state management with stale-while-revalidate caching, available for React, Vue, Solid, Angular, and Svelte. The de facto standard for async server data.

- **TanStack DB** (https://tanstack.com/db) -- Beta-stage reactive client-side database built on TanStack Query, with collections, live queries, and differential dataflow for sub-millisecond incremental updates.

- **XState** (https://stately.ai/docs/xstate) -- Statechart and actor model implementation for complex state-dependent logic. Includes visual editor (Stately) for creating and debugging state machines.

- **MobX** (https://mobx.js.org/) -- Transparent reactive programming with observables, computed values, and reactions. Mature library with strong theoretical foundations.

- **Valtio** (https://valtio.dev/) -- Proxy-based state with mutable API and immutable snapshots for React rendering. Minimal API surface from the Poimandres collective.

- **SolidJS** (https://www.solidjs.com/) -- Fine-grained reactive framework that pioneered the modern signal model, achieving near-vanilla-JS performance.

- **Pinia** (https://pinia.vuejs.org/) -- Official Vue 3 state management with Composition API integration, TypeScript support, and modular store design.

- **nuqs** (https://nuqs.dev) -- Type-safe URL search parameter state management for React frameworks, providing useState-like API synchronized with the URL.

- **Nanostores** (https://github.com/nanostores/nanostores) -- Framework-agnostic atomic stores at 286 bytes, supporting React, Vue, Svelte, Solid, Angular, Lit, and vanilla JS.

- **Legend-State** (https://legendapp.com/open-source/state/) -- High-performance proxy-based state with built-in persistence and sync, fine-grained reactivity, and automatic local-first capabilities.

- **Yjs** (https://github.com/yjs/yjs) -- CRDT implementation for real-time collaborative editing with shared types, offline support, and network-agnostic synchronization.

- **Automerge** (https://automerge.org/) -- CRDT implementation with JSON data model, built in Rust with JavaScript/WebAssembly bindings for local-first applications.

### Key Articles and Talks

- Abramov, D. "You Might Not Need Redux" -- Foundational text on when centralized state management is and is not appropriate. https://medium.com/@dan_abramov/you-might-not-need-redux-be46360cf367

- Carniato, R. "A Hands-on Introduction to Fine-Grained Reactivity" -- Definitive explanation of signal-based reactive primitives from the SolidJS creator. https://dev.to/ryansolid/a-hands-on-introduction-to-fine-grained-reactivity-3ndf

- Weststrate, M. "The Fundamental Principles Behind MobX" -- Architectural exposition of transparent reactive programming and the observable/computed/reaction model. https://medium.com/hackernoon/the-fundamental-principles-behind-mobx-7a725f71f3e8

- TC39 Signals Proposal README -- Comprehensive technical specification of the proposed JavaScript signals standard, including API design, evaluation algorithm, and framework integration strategy. https://github.com/tc39/proposal-signals/blob/main/README.md

- Holterhoff, K. "Optimizing JavaScript Delivery: Signals v React Compiler" -- Analyst assessment of the signals vs. compilation approaches to rendering optimization. https://redmonk.com/kholterhoff/2025/05/13/javascript-signals-react-compiler/

- Kleppmann, M. et al. "Local-First Software: You Own Your Data, in spite of the Cloud" -- Academic paper defining the local-first software paradigm and its requirements for state management. https://www.inkandswitch.com/local-first/

- Harel, D. "Statecharts: A Visual Formalism for Complex Systems" -- The foundational paper on statecharts, extending finite state machines with hierarchy, orthogonality, and broadcast communication. https://www.state-machine.com/doc/Harel87.pdf
