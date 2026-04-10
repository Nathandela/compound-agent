---
title: "Schema Evolution and Breaking Change Detection: From Protobuf to Universal API Contracts"
date: 2026-04-10
summary: >
  Survey of static breaking change detection across schema-driven API technologies including Protobuf (Buf), OpenAPI, GraphQL, Avro, and Thrift, covering compatibility theory, migration patterns, and automated enforcement in CI/CD pipelines.
keywords: [spec-design, schema-evolution, protobuf, breaking-changes, api-contracts]
---

# Schema Evolution and Breaking Change Detection: From Protobuf to Universal API Contracts

*2026-04-10*

---

## Abstract

Schema evolution -- the problem of changing data format definitions without breaking existing producers or consumers -- is one of the most consequential and underappreciated challenges in distributed systems engineering. This survey examines the prevention side of the API contract problem: how teams detect breaking changes before they reach production, what tools exist for automated enforcement, and what the full taxonomy of incompatible changes looks like across the major schema-driven API technologies.

We analyze the Buf ecosystem (buf lint, buf breaking, Buf Schema Registry) as the most systematic contemporary treatment of protobuf breaking change detection, catalog the 300+ categories of incompatible changes it and its OpenAPI counterpart oasdiff define, and examine parallel approaches in GraphQL (Apollo schema checks, graphql-inspector), Avro (built-in schema resolution rules, Confluent Schema Registry), Thrift, and JSON Schema. We situate these tools within the broader landscape of compatibility theory -- BACKWARD, FORWARD, FULL, and NONE modes, transitive vs. non-transitive checking -- and migration patterns including expand-contract, dual-write, and consumer-driven contract testing via Pact.

Our comparative synthesis reveals that no single tool provides universal coverage: Buf delivers the deepest protobuf analysis, oasdiff covers OpenAPI comprehensively, Apollo adds a unique traffic-based behavioral dimension to GraphQL checks, while Avro's approach embeds compatibility into the serialization format itself. Open problems include semantic/behavioral compatibility beyond syntactic structure, cross-format schema migration, and automated migration generation.

---

## 1. Introduction

### 1.1 The Cost of Breaking Changes

A breaking change in a published API schema is not merely a developer inconvenience -- it is an operational failure mode with measurable economic consequences. Industry data reveals sobering figures: API-related outages now cost organizations billions annually, with more than 90% of companies reporting at least one API incident in the past twelve months. Average downtime cost for enterprise applications runs to $5,600 per minute, and schema drift incidents average 3.5 days to resolve. Unmanaged API changes cause an estimated 40% of integration failures and cost development teams an average of 15--20 hours per incident in emergency remediation.

Real incidents illustrate the stakes concretely. PayPal experienced an unannounced API version change during a peak shopping period that caused transaction losses for merchants whose integrations silently broke. A major news API provider changed their JSON response format without notice; within hours, over 200 downstream applications failed. A production enum field reuse -- the number `3` recycled from a deleted "needs_review" status to a new "failed" status -- triggered a cascade of incorrect refund processes across a payment system.

The fundamental asymmetry between creating a breaking change and absorbing its impact makes prevention far more cost-effective than detection after deployment. A developer can introduce a breaking change in seconds by deleting a field or changing a type; reversing it requires coordinating upgrades across every consumer. When those consumers are external -- third-party API clients, mobile apps already shipped to devices, embedded firmware -- reversal may be impossible.

### 1.2 The Prevention Imperative

Two distinct approaches exist for managing schema incompatibility: runtime detection (observe failures in production and remediate) and static prevention (analyze schema changes before deployment and block incompatible ones). This survey concerns exclusively the latter.

Static breaking change detection operates on the principle that schemas are formal contracts, and contract violations can be mechanically identified by comparing schema versions. Unlike runtime detection -- which requires traffic to reveal problems, produces partial visibility, and requires post-hoc incident response -- static analysis operates in CI/CD pipelines on every pull request, providing deterministic feedback before any consumer is affected.

The maturity of static analysis tools varies dramatically by schema format. Protobuf, through the Buf ecosystem, has the most systematically cataloged and tool-enforced taxonomy of breaking changes. OpenAPI, through oasdiff and Optic, has comparably comprehensive coverage. GraphQL has sophisticated tooling with the unique addition of traffic-based impact analysis. Avro embeds compatibility rules in the serialization format specification itself. Thrift and JSON Schema have less mature tooling ecosystems.

### 1.3 Scope and Structure

This survey covers:

- The theoretical foundations of schema compatibility: wire formats, field identity mechanisms, compatibility theory, and semantic versioning for schemas (Section 2)
- A taxonomy of approaches organized by schema type, detection method, and compatibility mode (Section 3)
- Deep technical analysis of each major schema ecosystem and its tooling (Section 4)
- Comparative synthesis with trade-off analysis (Section 5)
- Open problems and research gaps (Section 6)

The survey excludes runtime API testing (contract test execution against live services), API design best practices (this concerns change detection, not initial design), and performance compatibility (behavioral changes that do not alter schema structure).

---

## 2. Foundations

### 2.1 Wire Format Fundamentals and Field Identity

The mechanism by which a schema format encodes field identity is the foundational design decision that determines all subsequent compatibility properties. Three distinct strategies exist in widespread use.

**Tag-based identity (Protobuf, Thrift).** Fields are identified by an integer tag assigned in the schema definition. The tag appears in every serialized record alongside a wire type code. Parsers encountering an unknown tag can skip it without disruption. This design enables independent schema evolution at producer and consumer: either side can add or remove fields without coordination, provided tags are never reused. The critical constraint is tag immutability -- changing a tag number is equivalent to deleting the original field and creating a new one with different identity, with no warning to parsers.

**Name-based identity (Avro).** Fields are encoded in declaration order, without tags. The parser must receive both the writer's schema (what produced the bytes) and the reader's schema (what the consumer expects) and resolve the mapping by name. This enables field renaming without binary breakage (via aliases), eliminates per-field tag overhead, and produces compact encodings, but requires schema distribution infrastructure -- container files with embedded schemas, RPC-time negotiation, or a schema registry that can serve schemas by fingerprint.

**Structural identity (JSON Schema, OpenAPI schemas).** JSON has no built-in field identity beyond property names in serialized form. Compatibility analysis is purely schema-structural: does the new schema accept all values the old schema accepted (BACKWARD), or accept all values the new schema can produce (FORWARD)?

Martin Kleppmann's 2012 analysis of Avro, Protobuf, and Thrift summarizes the trade-off precisely: "In Protocol Buffers, every field is tagged, whereas in Avro, the entire record, file or network connection is tagged with a schema version." The choice distributes schema management overhead differently: tag-per-field distributes schema into each record; schema-per-session centralizes it into infrastructure.

### 2.2 Wire Compatibility, JSON Compatibility, and Semantic Compatibility

For protobuf specifically, three distinct compatibility levels must be distinguished, as they determine which schema changes are safe in which contexts.

**Wire (binary) compatibility.** The binary wire format uses field numbers (tags) and wire types. A change is wire-compatible if messages encoded with the old schema can be decoded with the new schema (backward wire compatibility) or if messages encoded with the new schema can be decoded with the old schema (forward wire compatibility), without parse errors. Wire-compatible changes include:

- Adding new fields (unknown fields are skipped by parsers)
- Removing fields (absent fields take default values)
- Certain type promotions: `int32` to `int64`, `uint32` to `uint64`, `bool` to `int32/int64`, `sint32` to `sint64` (with value range caveat), `string` to `bytes` (if UTF-8), `fixed32` to `sfixed32`, `fixed64` to `sfixed64`
- `singular` to `repeated` (with caveats for numeric types: packed vs. non-packed encoding)
- `enum` to integer types (int32, uint32, int64, uint64)
- `map` to `repeated` message field with key/value sub-fields (the map wire representation is equivalent)

Wire-incompatible changes include:

- Changing field numbers (the parser will misinterpret the field)
- Changing wire types incompatibly (e.g., `int32` to `string`)
- Moving fields into an existing `oneof` (can cause field clearing)
- Removing fields from a `oneof` (ambiguity about field presence state)

**JSON compatibility.** ProtoJSON serializes using field names (converted to lowerCamelCase, or the value of `json_name` if set) rather than field numbers. This creates an entirely different compatibility surface. JSON compatibility is more fragile than wire compatibility in several dimensions:

- Renaming a field changes its JSON key, breaking JSON consumers even though binary consumers are unaffected
- Deleting a field is a parse error in ProtoJSON (unknown JSON fields cause errors, unlike unknown binary fields which are skipped)
- Enum value names appear in JSON output; renaming an enum value breaks JSON consumers
- The `json_name` option can preserve JSON names under field renames, but this adds operational complexity
- Package renames change the type URL used in `google.protobuf.Any` fields

**Semantic (code) compatibility.** Semantic compatibility concerns whether generated code in consumer languages continues to compile and behave correctly. Even a wire-compatible change can be semantically breaking:

- Adding a field changes generated code (new accessor methods appear; some code generation options create struct fields)
- Changing a file option like `java_package` or `go_package` relocates generated code into a different namespace, breaking imports
- Changing `java_multiple_files` from `false` to `true` moves generated classes between files, breaking import statements
- Renaming a message changes generated type names across all language targets
- The distinction between `proto2` and `proto3` syntax (and Editions) affects default value behavior and required-field semantics in generated code

Buf's four-tier rule hierarchy (FILE, PACKAGE, WIRE_JSON, WIRE) directly encodes this three-level compatibility model: FILE rules protect all three levels, WIRE rules protect only binary compatibility.

### 2.3 Compatibility Theory: BACKWARD, FORWARD, FULL, NONE

Schema registry systems, particularly Confluent Schema Registry, formalize compatibility checking into four named modes that precisely specify the direction of compatibility being enforced.

**BACKWARD compatibility** means consumers using the new schema can read data written by producers using the previous schema. This is the most common requirement: deploy new consumers that can read old data, upgrade producers afterward. For Avro: new fields must have default values; deleted fields must have had default values. For Protobuf: fields can be added (they parse as default) or removed (they parse as zero/empty). The upgrade order implication is: upgrade consumers first, then producers.

**BACKWARD_TRANSITIVE** extends BACKWARD to require compatibility not just with the immediately preceding schema version, but with all previous versions. This is the stronger guarantee needed when consumers may be running any historical version, not just the latest.

**FORWARD compatibility** means data produced with the new schema can be read by consumers using the previous schema. For Avro: new fields can be added (old consumers ignore them); fields removed must have had default values in the old schema. The upgrade order: upgrade producers first, then consumers.

**FORWARD_TRANSITIVE** requires forward compatibility with all previous consumer schema versions.

**FULL compatibility** means both BACKWARD and FORWARD simultaneously. New schemas can both read old data and produce data readable by old consumers. For Avro: all new fields must have default values; removed fields must have had default values. This is the strictest operational mode but enables independent producer/consumer upgrade ordering.

**FULL_TRANSITIVE** applies FULL against all historical versions.

**NONE** disables compatibility checking. Breaking changes are permitted, requiring coordinated simultaneous deployment of all producers and consumers, or explicit migration strategies (dual-write, topic migration).

Confluent Schema Registry notes a crucial ecosystem constraint: "For Kafka Streams, only BACKWARD compatibility is supported" due to state store requirements during rolling upgrades. Industry best practice for Protobuf in Confluent Schema Registry is BACKWARD_TRANSITIVE, because adding new Protobuf message types is not forward-compatible.

### 2.4 Semantic Versioning for Schemas

The relationship between semantic versioning (SemVer) and API schema evolution is more complex than typically acknowledged. SemVer prescribes: MAJOR for breaking changes, MINOR for backward-compatible additions, PATCH for backward-compatible fixes. Applied naively to schemas, this seems sufficient -- but the reality is multi-dimensional.

As InfoQ analysis observes, most teams interpret "breaking" purely through API signatures, missing several other dimensions of breakage:

- **Performance compatibility**: Increasing operation latency can break implicit contracts (timeouts, SLAs)
- **Wire format compatibility**: Even when signatures are unchanged, serialization format changes require synchronized deployment
- **System-level compatibility**: Requirements on client runtime versions (OS, SDK) constitute breaking changes not reflected in schema syntax
- **Downgrade compatibility**: Database migrations that cannot be reversed create one-way gates that prevent rollback during incidents
- **Behavioral compatibility**: Changing the semantics of a field without changing its type is undetectable by static schema analysis

The practical consequence is that SemVer major version bumps become feared events that cause organizational hesitation, leading to "minor" versions that smuggle in breaking changes. Stripe's date-based rolling version strategy (Section 4.6) represents an operational alternative that acknowledges this tension.

---

## 3. Taxonomy of Approaches

### 3.1 By Schema Format

| Schema Format | Identity Mechanism | Primary Tools | Compatibility Modes | Built-in Rules |
|---|---|---|---|---|
| Protocol Buffers | Field number tags | Buf, Confluent SR | BACKWARD, FORWARD, FULL, NONE + transitive | 70+ Buf rules |
| Apache Avro | Field names + schema fingerprint | Confluent SR, Apicurio | BACKWARD, FORWARD, FULL, NONE + transitive | Avro spec §schema-resolution |
| OpenAPI 3.x | Path + operation + parameter names | oasdiff, Optic, openapi-diff | Non-formal (breaking/warning/info) | 300+ oasdiff rules |
| GraphQL | Type + field names | graphql-inspector, Apollo | Non-formal (breaking/dangerous/safe) | Usage-traffic augmented |
| Apache Thrift | Field integer tags | No major registry | Convention-based | None standard |
| JSON Schema | Property names | json-schema-diff, rusty-schema-diff | None standard | Minimal |
| gRPC | protobuf + HTTP/2 URL | Buf + Pact gRPC plugin | Protobuf rules + behavioral | 70+ Buf rules |

### 3.2 By Detection Method

**Static structural analysis** compares two schema snapshots and identifies changes that violate compatibility rules without executing any code. This is the dominant mode for Buf, oasdiff, graphql-inspector, and Avro compatibility checking. Advantages: fast, deterministic, no infrastructure required, operates in CI on pure text. Limitations: cannot detect semantic/behavioral changes, cannot determine which changes affect which consumers.

**Traffic-based impact analysis** augments structural analysis with data about which operations real clients are actually using. Apollo schema checks compare proposed changes against a historical window (default 7 days) of observed operations. A field removal that affects no real operations is non-breaking in practice even if structurally breaking. A required argument addition that affects only operations from deprecated client versions can be cleared. Advantages: reduces false positives, enables deprecation workflows. Limitations: requires production traffic data collection infrastructure, misses new clients not yet in traffic window.

**Consumer-driven contract testing** inverts the question: instead of asking "does the provider schema break any consumer?", it asks "does the provider's actual behavior match each consumer's explicitly declared contract?". Pact-generated contracts capture the exact request/response pairs each consumer uses. Provider verification runs these contracts against a real provider instance. Advantages: detects behavioral changes invisible to structural analysis, models actual consumer dependencies precisely. Limitations: requires consumer participation, tests must be maintained, introduces infrastructure (Pact Broker/PactFlow).

**Compiler-based type checking** uses the host language's type system to check schema compatibility, as Notion does with TypeScript. Advantages: leverages existing tooling, no additional infrastructure. Limitations: language-specific, requires schema types to be expressed in the host type system.

### 3.3 By Compatibility Mode

| Mode | Schema Formats | When to Use | Upgrade Order |
|---|---|---|---|
| BACKWARD | Avro, Protobuf, JSON Schema | New consumers before new producers | Consumers first |
| BACKWARD_TRANSITIVE | Avro, Protobuf | Long-lived consumer versions exist | Consumers first |
| FORWARD | Avro, Protobuf | Producers upgrade before consumers | Producers first |
| FORWARD_TRANSITIVE | Avro, Protobuf | Multiple historical consumer versions | Producers first |
| FULL | Avro, Protobuf | Independent upgrade order required | Any order |
| FULL_TRANSITIVE | Avro, Protobuf | Maximum safety, strict governance | Any order |
| NONE | All | Greenfield, internal only, migration | Coordinated |
| FILE (Buf) | Protobuf | Public APIs, generated code stability | All consumers |
| PACKAGE (Buf) | Protobuf | Allows intra-package element moves | All consumers |
| WIRE_JSON (Buf) | Protobuf | Binary + JSON encoding protection | Binary + JSON consumers |
| WIRE (Buf) | Protobuf | Binary encoding protection only | Binary consumers |

---

## 4. Analysis

### 4.1 Buf and the Protobuf Ecosystem

#### 4.1.1 Design Philosophy

Buf (bufbuild) was founded on the premise that Protocol Buffers' engineering experience was unnecessarily painful and that breaking changes should be mechanically preventable rather than dependent on developer vigilance. The Buf CLI provides three integrated capabilities: `buf lint` (style and consistency enforcement), `buf breaking` (breaking change detection), and `buf push` (publishing to the Buf Schema Registry). These are composed into a single workflow that mirrors how teams use `eslint` for JavaScript -- automated, integrated into editors and CI, enforcing a codified contract.

The core design decision separating Buf from ad-hoc schema review is the categorical rule system. Rather than requiring teams to enumerate specific rules they care about, Buf provides four cumulative categories (FILE > PACKAGE > WIRE_JSON > WIRE) where stricter categories imply all guarantees of less strict ones. This mirrors the spirit of compatibility mode selection in schema registries.

#### 4.1.2 Breaking Change Rule Taxonomy

Buf's built-in rule set comprises approximately 70 named rules organized across five semantic domains. The following is the complete taxonomy:

**Deletion rules** (prevent removal of schema elements):

Rules at the FILE level enforce that files, messages, enums, services, extensions, and fields cannot be deleted -- these deletions break generated code that imports specific types. At the PACKAGE level, parallel rules enforce that packages, messages, enums, and services cannot disappear from a package even if elements move between files. At the WIRE/WIRE_JSON level, the deletion rules shift to requiring that deleted elements have reserved numbers or names before removal: `FIELD_NO_DELETE_UNLESS_NUMBER_RESERVED` (WIRE, WIRE_JSON), `FIELD_NO_DELETE_UNLESS_NAME_RESERVED` (WIRE_JSON), `ENUM_VALUE_NO_DELETE_UNLESS_NUMBER_RESERVED` (WIRE, WIRE_JSON), `ENUM_VALUE_NO_DELETE_UNLESS_NAME_RESERVED` (WIRE_JSON). `RESERVED_MESSAGE_NO_DELETE` and `RESERVED_ENUM_NO_DELETE` prevent removal of existing `reserved` statements.

Complete deletion rules: `ENUM_NO_DELETE`, `ENUM_VALUE_NO_DELETE`, `ENUM_VALUE_NO_DELETE_UNLESS_NAME_RESERVED`, `ENUM_VALUE_NO_DELETE_UNLESS_NUMBER_RESERVED`, `EXTENSION_MESSAGE_NO_DELETE`, `EXTENSION_NO_DELETE`, `FIELD_NO_DELETE`, `FIELD_NO_DELETE_UNLESS_NAME_RESERVED`, `FIELD_NO_DELETE_UNLESS_NUMBER_RESERVED`, `FILE_NO_DELETE`, `MESSAGE_NO_DELETE`, `ONEOF_NO_DELETE`, `PACKAGE_ENUM_NO_DELETE`, `PACKAGE_EXTENSION_NO_DELETE`, `PACKAGE_MESSAGE_NO_DELETE`, `PACKAGE_NO_DELETE`, `PACKAGE_SERVICE_NO_DELETE`, `RESERVED_ENUM_NO_DELETE`, `RESERVED_MESSAGE_NO_DELETE`, `RPC_NO_DELETE`, `SERVICE_NO_DELETE`.

**Field consistency rules** (prevent mutation of field properties):

`FIELD_SAME_TYPE` prevents type changes between incompatible protobuf types. `FIELD_SAME_CARDINALITY` prevents changes between `optional`, `required`, and `repeated`. `FIELD_SAME_NAME` prevents field renames (which break JSON serialization). `FIELD_SAME_JSON_NAME` prevents changes to the explicit `json_name` option. `FIELD_SAME_ONEOF` prevents fields moving into or out of oneofs. `FIELD_SAME_DEFAULT` (v2 config) prevents default value changes. Language-specific options: `FIELD_SAME_CPP_STRING_TYPE`, `FIELD_SAME_JAVA_UTF8_VALIDATION`, `FIELD_SAME_JSTYPE`, `FIELD_SAME_UTF8_VALIDATION`.

Wire-level relaxations exist: `FIELD_WIRE_COMPATIBLE_TYPE` permits type exchanges that are wire-compatible (e.g., `int32` to `int64`), and `FIELD_WIRE_COMPATIBLE_CARDINALITY` permits compatible cardinality changes. `FIELD_WIRE_JSON_COMPATIBLE_TYPE` and `FIELD_WIRE_JSON_COMPATIBLE_CARDINALITY` apply analogous relaxations for the WIRE_JSON category.

**Enum rules**: `ENUM_SAME_JSON_FORMAT` prevents changes to JSON format support for enums. `ENUM_SAME_TYPE` prevents changing between open (proto3) and closed (proto2) enum semantics -- a critical distinction because closed enums store unknown values in the unknown field set while open enums store them inline, affecting repeated field ordering. `ENUM_VALUE_SAME_NAME` prevents enum value renames (which break JSON and reflection-based code).

**File option rules** (language-specific code generation): A substantial category of rules prevents changing file-level options that affect generated code organization without affecting wire format: `FILE_SAME_GO_PACKAGE`, `FILE_SAME_JAVA_PACKAGE`, `FILE_SAME_JAVA_MULTIPLE_FILES`, `FILE_SAME_JAVA_OUTER_CLASSNAME`, `FILE_SAME_CSHARP_NAMESPACE`, `FILE_SAME_PHP_NAMESPACE`, `FILE_SAME_RUBY_PACKAGE`, `FILE_SAME_SWIFT_PREFIX`, `FILE_SAME_OBJC_CLASS_PREFIX`. `FILE_SAME_PACKAGE` protects the protobuf package declaration at WIRE level because it appears in `google.protobuf.Any` type URLs. `FILE_SAME_SYNTAX` prevents moving between proto2, proto3, and Editions syntax.

**Service and RPC rules**: `RPC_NO_DELETE` prevents method removal. `RPC_SAME_REQUEST_TYPE` and `RPC_SAME_RESPONSE_TYPE` prevent changing the message types a method operates on. `RPC_SAME_CLIENT_STREAMING` and `RPC_SAME_SERVER_STREAMING` prevent changing streaming modes -- switching a unary RPC to streaming or vice versa is both a wire and semantic breaking change. `RPC_SAME_IDEMPOTENCY_LEVEL` protects the idempotency annotation used by some proxies and retry logic.

#### 4.1.3 The Oneof Compatibility Problem

Oneofs deserve special treatment because their compatibility rules are both complex and poorly understood. The protobuf specification and Buf documentation identify several dangerous operations:

**Moving existing fields into an existing oneof**: When multiple fields are moved into an existing oneof simultaneously, serialization/parse round-trips can clear fields. This happens because the oneof semantics require only one member to be set; upon deserialization, if two oneof members are found on the wire (from old-format messages), only one survives.

**Deleting a field from a oneof and re-adding it**: The deleted field's wire-format value arrives as an unknown field. Upon re-adding, the re-added field's presence cannot be distinguished from an absent field in an old schema version.

**Splitting or merging oneofs**: Merging two oneofs into one can cause all-but-one members to be cleared upon deserialization due to implementation-specific serialization ordering.

The only safe oneof changes per the official specification: (1) converting a single explicit-presence field into a new single-member oneof; (2) converting a single-member oneof into an explicit-presence field. Even these carry caveats about language-specific behavior.

Buf's protovalidate tooling offers an alternative to native oneofs through the `(buf.validate.message).oneof` annotation, which implements oneof semantics via runtime validation rather than schema structure. This eliminates the backwards-compatibility constraints of native oneofs at the cost of runtime validation overhead.

#### 4.1.4 Buf Schema Registry and Enterprise Governance

The Buf Schema Registry (BSR) extends local `buf breaking` enforcement to a centralized governance model. Key capabilities:

**Push-time enforcement**: When breaking change prevention is enabled, schema pushes that violate the configured rule category are rejected at the registry level. This prevents circumventing local checks.

**Configurable strictness by package stability**: The BSR allows breaking changes to alpha (`foo.bar.v1alpha1`), beta (`foo.bar.v1beta1`), and test packages while enforcing strict rules on stable packages. This enables experimental APIs to evolve rapidly while protecting production consumers.

**Governance workflow** (Enterprise): Administrators can configure a review workflow where breaking changes are routed for explicit approval rather than rejected outright. An audit trail records approvals and the reviewer identity.

**CI/CD integration**: The `bufbuild/buf-action` GitHub Action provides automated lint, format, and breaking change checks on every pull request, with inline PR comments identifying specific violations. The `buf skip breaking` PR label allows intentional breaking changes to bypass automated checks with explicit acknowledgment.

The BSR's breaking change detection compares pushed schemas against the last accepted version, using any configured buf.yaml rule category (FILE, PACKAGE, WIRE_JSON, or WIRE).

#### 4.1.5 Buf Lint (Style Enforcement)

Separate from breaking change detection, `buf lint` enforces style consistency rules that prevent problems before they become breaking changes. The STANDARD category (default) includes:

- `ENUM_VALUE_PREFIX`: Enum values must be prefixed with the enum name in UPPER_SNAKE_CASE, preventing namespace collisions
- `ENUM_ZERO_VALUE_SUFFIX`: Zero values must end in `_UNSPECIFIED`, making default state explicit
- `FILE_LOWER_SNAKE_CASE`: Files must use lower_snake_case naming
- `MESSAGE_PASCAL_CASE`, `ENUM_PASCAL_CASE`: Type names must be PascalCase
- `SERVICE_SUFFIX`: Services must end in `Service`
- `RPC_REQUEST_RESPONSE_UNIQUE`: Each RPC must have its own dedicated request/response messages

These style rules enforce patterns that make schemas easier to evolve -- for example, requiring dedicated request/response messages prevents the common anti-pattern of sharing message types between RPCs, which creates coupling that makes individual RPC evolution harder.

### 4.2 Protobuf Official Compatibility Guide

Google's official protobuf documentation defines wire compatibility rules at a lower level of detail than Buf, focusing on the binary format contract.

**Wire type system**: Each field is preceded by a tag containing the field number and wire type. Wire type 0 (varint) covers int32, int64, uint32, uint64, sint32, sint64, bool, and enum. Wire type 1 (64-bit) covers fixed64, sfixed64, double. Wire type 2 (length-delimited) covers string, bytes, embedded messages, packed repeated fields. Wire type 5 (32-bit) covers fixed32, sfixed32, float. Changing a field's wire type incompatibly causes parse failures.

**Reserved fields**: When deleting a field, its number and name must be reserved: `reserved 2, 15, 9 to 11; reserved "foo", "bar";`. The protoc compiler will reject future field definitions that attempt to reuse reserved numbers. The practical consequence of not reserving: a future field assigned the same number as the deleted field will be interpreted as the deleted field's type by old parsers that still hold the original schema. This can produce subtle data corruption -- the "enum value 3" incident where `status_code = 3` was reinterpreted from "needs_review" to "FAILED", triggering incorrect refunds.

**Unknown fields**: Proto3 preserves unknown fields during parse and reserialization by default. However, unknown fields are silently dropped when: (1) serializing to JSON (ProtoJSON has no unknown field passthrough), (2) iterating all fields and copying field-by-field. Using message-oriented APIs (CopyFrom, MergeFrom) rather than field-by-field copy preserves unknown fields.

**JSON (ProtoJSON) format**: ProtoJSON uses field names (lowerCamelCase or json_name) rather than numbers. Conformant parsers must accept both the lowerCamelCase version and the original proto field name. However, ProtoJSON does not preserve unknown fields, making JSON consumers less resilient to schema drift than binary consumers.

**Protobuf Editions**: Introduced in protoc 27.0, Editions replace the `syntax = "proto2"/"proto3"` directive with `edition = "2024"` plus feature flags. Editions allow mixing proto2 and proto3 behaviors at the file, message, or field level. Edition 2023 established the baseline by unifying proto2 and proto3; Edition 2024 removed the deprecated `ctype` option. Editions do not change binary or JSON serialization format -- `edition` is a pure tooling/code-generation annotation.

### 4.3 OpenAPI Breaking Change Detection

#### 4.3.1 oasdiff

oasdiff is a Go-based OpenAPI diff and breaking change detection tool that checks OpenAPI 3.0 and 3.1 specifications. Its scope parallels Buf's for protobuf: 300+ rules organized by severity (ERR for definite breaking changes, WARN for potential breaking changes, INFO for significant non-breaking changes).

**Breaking change categories** in oasdiff:

*Endpoint changes*: Removing an endpoint (path + method combination) is an ERR. Adding required path parameters is an ERR. Changing an endpoint from deprecated to non-deprecated is a WARN.

*Parameter changes* (62 rules): Removing a required parameter is an ERR. Making an optional parameter required is an ERR. Changing a parameter's type is an ERR. Removing enum values from parameters is an ERR. Changing parameter location (query to header, etc.) is an ERR. Adding a new required header parameter is an ERR. These represent the largest category because the OpenAPI parameter space is multi-dimensional (path, query, header, cookie, each with name, required, type, format, schema, encoding, style, explode).

*Request body changes* (48 rules): Removing a required request body is an ERR. Adding a required property to a request body schema is an ERR. Changing a request body property's type is an ERR. Removing enum values is an ERR. Removing content-type variants from a request is an ERR.

*Response body changes* (58 rules): Removing a successful response status code is an ERR. Adding a required property to a response body schema is a WARN (consumers must handle unknown fields). Changing a response property's type is an ERR. Removing response headers is an ERR.

*Schema changes* (84 rules): The schema sub-category is the most complex because OpenAPI schemas use JSON Schema semantics with allOf/anyOf/oneOf composition. Changes to minimum/maximum constraints, pattern constraints, array item types, and discriminators are all tracked.

*Security changes* (32 rules): Removing a security scheme is an ERR. Changing required scopes is an ERR. Removing security requirements from an endpoint is an ERR (this weakens authorization expectations).

*Extensions* (12 rules): The `x-extensible-enum` extension is treated specially -- it represents an "open enum" contract where new values may appear, and removing declared values is an ERR.

oasdiff integrates into CI via GitHub Actions, provides output in YAML, JSON, Markdown, HTML, and JUnit XML formats, and supports configuration files for suppressing specific checks or adjusting severity levels.

#### 4.3.2 Optic

Optic focuses on both breaking change detection and specification accuracy. Its distinctive contribution is verification that the OpenAPI spec matches actual API behavior through a proxy-based capture mechanism: test traffic is routed through Optic's proxy, which validates real request/response pairs against the spec. This bridges the gap between schema-only analysis (which can miss spec-implementation divergence) and runtime testing.

Optic's diff command runs on pull requests to detect backward-compatible violations and enforces organizational API style guides. The changelogs produced are human-readable, designed for API reviewers rather than just CI gate status.

#### 4.3.3 Other OpenAPI Tools

**openapi-diff** (Azure): Used internally by the azure-rest-api-specs repository. Focuses on Azure-specific API conventions in addition to general breaking change detection.

**pb33f openapi-changes**: Provides a "time machine" visualization of changes across the full version history of an OpenAPI spec, enabling historical impact analysis not available in simple two-version diff tools.

### 4.4 GraphQL Breaking Change Detection

GraphQL's type system has different compatibility properties than protobuf or OpenAPI. GraphQL has no wire-format field numbers -- fields are always identified by name. All schema changes that touch names are potentially breaking for clients using those names. However, GraphQL has an advantage: operations (queries) are strongly typed against the schema, enabling the unique capability of detecting which specific operations are affected by proposed changes.

#### 4.4.1 graphql-inspector (The Guild)

graphql-inspector classifies schema changes into three categories:

**Breaking changes**: Removing or renaming types, fields, arguments, enum values, directive definitions. Adding required arguments to existing fields (mandatory arguments existing clients do not provide). Making a nullable field non-nullable (clients handling null now receive non-null values they may not handle correctly). Changing a field's return type. Removing union members. Removing interface implementations. These represent changes that will cause existing client operations to become syntactically or semantically invalid.

**Dangerous changes**: Adding new values to input enums (clients using exhaustive switch statements may miss new values). Making non-nullable fields nullable (semantics change). Changing default argument values (clients relying on the old default receive different behavior). Union member changes (clients using inline fragments may encounter unexpected types). These are changes that may or may not break specific clients depending on their implementation.

**Safe changes**: Adding new types, fields, optional arguments, enum values on output types. Adding directive definitions. These cannot break existing operations.

graphql-inspector integrates with GitHub, GitLab, BitBucket, and generic CI. The `dangerousBreaking` rule escalates dangerous changes to breaking status for teams that want zero-tolerance policies. The `considerUsage` rule -- analogous to Apollo's traffic-based analysis -- can determine whether a "breaking" change actually affects any real operations based on usage data.

#### 4.4.2 Apollo Schema Checks (GraphOS)

Apollo GraphOS introduces the most sophisticated GraphQL breaking change detection by incorporating production traffic data. The system maintains a registry of operations clients have executed against the graph, and compares proposed schema changes against this operation corpus.

**Operation check mechanics**: Each operation is represented by its normalized signature (deduplicating structurally equivalent queries with different variable values or whitespace). GraphOS tracks which fields, arguments, enum values, and type conditions appear in real operations within a configurable time window (default: last 7 days). A proposed schema change is "breaking" only if it affects fields/arguments/types that appear in this corpus.

**Operation safety classification**:
- *Broken*: The operation becomes syntactically invalid against the new schema (removed field or type used in query)
- *Potentially affected*: The operation remains syntactically valid but may return errors or unexpected results at runtime
- *Unaffected*: No intersection between the change and the operation's field access pattern

**Enhanced reference reporting**: Apollo Router's experimental enhanced metrics mode tracks usage at the granularity of input object fields and enum values, not just top-level types and fields. This enables schema checks to pass for removals of enum values that no current client operation uses, even though pure static analysis would flag the removal as breaking.

**Supergraph (federation) schema checks**: In a federated GraphQL graph, build checks verify that subgraph schema changes compose into a valid supergraph schema. Operation checks then validate the composed supergraph against the operation corpus. This two-phase approach catches both composition errors and behavioral breakage.

**Threshold configuration**: Teams can ignore operations below a specified usage percentage threshold. This enables clearing historical operations from deprecated clients while maintaining protection for current consumers.

### 4.5 Apache Avro Schema Evolution

Avro differs from protobuf and OpenAPI in embedding schema evolution rules directly into the serialization specification rather than relying on external tooling.

#### 4.5.1 Schema Resolution Specification

The Avro specification defines schema resolution as a matching algorithm between a "writer schema" (what produced the bytes) and a "reader schema" (what the consumer will use to decode). The key rules:

**Field matching**: Fields are matched by name between writer and reader schemas. Fields present in the writer schema but absent in the reader schema are silently ignored. Fields present in the reader schema but absent in the writer schema receive their default value if one is declared, or produce a schema resolution error if no default exists.

**Type promotion**: Avro allows widening type promotions within the same wire encoding group: `int` to `long`, `int` to `float`, `int` to `double`, `long` to `float`, `long` to `double`, `float` to `double`, `string` to `bytes`, `bytes` to `string`.

**Union handling**: A non-union writer schema can resolve against a union reader schema if the writer's type is one of the union's branches. A union writer schema resolves against a non-union reader schema only if the union has exactly one branch matching the reader type.

**Enum handling**: Enums match by name and namespace. An enum symbol present in the writer schema but absent in the reader schema (without a `default` declared) produces a resolution error.

**Aliases**: Record, enum, and fixed types can declare alternative names via `aliases`. A writer schema can match a reader schema field when the writer's type name matches any of the reader type's aliases.

#### 4.5.2 Compatibility Implications

Avro's name-based field matching creates a compatibility profile distinct from protobuf:

- **Field addition** is backward-compatible only if the new field has a default value. Without a default, old-schema messages cannot be resolved against the new schema (the missing field has no value to assign).
- **Field deletion** is forward-compatible if the deleted field had a default in the old schema (new schema ignores it). Without a default, new-schema readers cannot process old messages that contain the field.
- **Field renaming** is a breaking change in both directions unless aliases are declared. Aliases provide a migration path but require schema coordination.
- **Type changes** are only safe within the promotion lattice (int → long, etc.). Arbitrary type changes require a new field with migration.
- **Null handling**: Because Avro has no "optional" keyword, optionality is expressed via union types: `["null", "string"]`. Making a field nullable requires changing its type from `"string"` to `["null", "string"]`, which is a type change that Avro's union resolution handles if declared correctly, but which changes the field's default handling.

Martin Kleppmann observes a key Avro design advantage: "Avro enables wonderfully self-describing container files" and interactive tools like Pig can process Avro files without pre-configuration. The cost is mandatory schema distribution infrastructure for non-container-format use cases (Kafka, gRPC, network protocols).

### 4.6 Apache Thrift Schema Evolution

Thrift uses the same field-tagging approach as protobuf, making its compatibility profile similar. Fields are identified by integer field identifiers (called "tags" in Thrift terminology, analogous to protobuf field numbers). The core rules:

- **Tags must not be changed**: Changing a tag number is equivalent to deleting the old field and creating a new one. All existing serialized data becomes misinterpreted.
- **New fields must be optional**: Required fields in Thrift are deprecated for the same reason as in protobuf -- they cannot be added or removed safely.
- **Field names can be changed**: Because the wire format uses tags, not names, renaming is safe for binary compatibility. Unlike protobuf, Thrift does not use field names in any standard serialization format.
- **Type changes**: Adding a new field with a different type and deprecating the old one is the safe migration path. Direct type changes risk parse errors.

Thrift lacks a standard schema registry or automated breaking change detection tool equivalent to Buf or Confluent Schema Registry. Teams typically enforce compatibility through code review, documentation (the Thrift Versioning Guide), and organizational convention. This represents a significant gap compared to the protobuf ecosystem.

### 4.7 Schema Registries as Governance Infrastructure

Schema registries solve the schema distribution problem for name-based identity formats (Avro) and provide centralized governance for all schema-driven systems.

#### 4.7.1 Confluent Schema Registry

Confluent Schema Registry is the most widely deployed schema registry, tightly integrated with Kafka. Key capabilities:

**Subject and version management**: Each Kafka topic has an associated subject (by convention, `<topic>-key` and `<topic>-value`). Each schema version is assigned a globally unique integer ID that appears in message headers, enabling consumers to retrieve the exact schema that produced a message.

**Compatibility enforcement**: New schema versions are rejected unless they satisfy the configured compatibility mode for the subject. This is enforced at registration time (when the producer registers a new schema) rather than at consume time, ensuring consumers never encounter incompatible schemas.

**Format support**: Avro, Protobuf, and JSON Schema are all supported with format-specific compatibility rules. Avro compatibility uses the built-in Avro schema resolution rules. Protobuf compatibility uses Confluent's own protobuf compatibility checker (distinct from Buf, with its own rule set). JSON Schema uses a lenient policy (any superset passes backward compatibility) and a strict policy (more conservative).

**Schema references**: Schemas can reference other schemas by subject and version, enabling schema composition and shared type libraries.

#### 4.7.2 Apicurio Registry

Apicurio Registry is the leading open-source alternative, notable for its format breadth: Avro, Protobuf, JSON Schema, OpenAPI, AsyncAPI, GraphQL, WSDL, and XML Schema. This makes it a unified governance layer for organizations managing heterogeneous API types alongside Kafka schemas.

Storage backends are pluggable: in-memory (development), PostgreSQL (production), or Kafka topic (KafkaSQL). Apicurio implements the Confluent Schema Registry API for drop-in compatibility with existing Kafka clients.

#### 4.7.3 AWS Glue Schema Registry

AWS Glue Schema Registry is the serverless option for AWS-native architectures, with zero operational overhead and native integration with Amazon MSK, Kinesis, and Lambda. It supports Avro and JSON Schema (Protobuf support is limited). Eight compatibility modes are available including transitive variants. The licensing model is pay-per-API-call with no separate registry charge.

#### 4.7.4 Buf Schema Registry (BSR)

BSR is purpose-built for protobuf, providing capabilities not available in general-purpose schema registries: dependency management (consuming and publishing shared proto packages), code generation (BSR can generate client libraries on demand), breaking change enforcement at push time, and the governance workflow for approving intentional breaking changes.

### 4.8 Consumer-Driven Contract Testing: Pact

Pact occupies a different position in the schema evolution landscape than the static analysis tools above. Rather than analyzing schemas for structural compatibility, Pact verifies that provider behavior matches the behavioral expectations each consumer has declared.

**Contract generation**: Consumer tests use a Pact mock provider. The test records the exact request the consumer sends and the minimum response structure it requires (not the full response, only fields the consumer actually uses). This produces a "pact file" -- a formal contract per consumer.

**Provider verification**: Provider tests replay each pact file's requests against the real provider implementation and verify that responses satisfy each consumer's minimum requirements.

**Implications for schema evolution**: Pact's approach makes implicit assumptions explicit. A field removal that Pact detects as breaking is one that at least one consumer actually reads in its test code. A field removal that passes all Pact contracts is one that no consumer test exercises -- a signal (though not a guarantee) of safe removability.

**Expand-and-contract pattern with Pact**: Pact documentation recommends a multi-step migration pattern for breaking changes:
1. Provider adds new field/endpoint alongside old one; deploy
2. Consumers update to use new field/endpoint and update pacts; deploy consumers
3. Provider removes old field/endpoint; all pact contracts now verify against new structure; deploy

This pattern ensures each deployment step is safe because contracts verify at each phase.

**gRPC/Protobuf support**: Pact's Plugin Framework extends contract testing to gRPC, using the protobuf binary format for contract recording and verification. This enables behavioral contract testing for gRPC services that complements Buf's structural analysis.

**Key distinction from static analysis**: Pact catches seven categories of breakage that static schema analysis cannot: protocol-level mismatches revealed only during message parsing, semantic changes (field repurposing without type change), type mismatches that emerge from actual message construction, dependency version coordination issues, and loss of visibility into which specific consumer features depend on which provider fields.

### 4.9 Migration Patterns

#### 4.9.1 Expand-Contract

The expand-contract (or expand-and-contract) pattern is the canonical zero-downtime approach for breaking schema changes. It decomposes a breaking change into three backward-compatible phases:

**Phase 1 (Expand)**: Add the new structure alongside the old. Producers write both old and new fields. New consumers can read either. No consumer is broken.

**Phase 2 (Migrate)**: All producers switch to writing only the new structure. Consumers that still read the old structure receive data from the new structure (or use dual-read logic). Old consumers not yet migrated still function because producers may dual-write.

**Phase 3 (Contract)**: Remove the old structure. All consumers have been updated. The migration is complete.

The essential property: each phase can be deployed independently. No coordinated multi-service deployment is required. Each deploy is safe to roll back.

#### 4.9.2 Dual-Write

Dual-write is a technique used during Phase 1 and Phase 2 of expand-contract. Producers write to both old and new fields/topics simultaneously. This can be implemented at the application layer (write both fields in the message) or the infrastructure layer (database triggers, stream processing jobs that copy data between topics).

#### 4.9.3 URL and Package Versioning

For breaking changes that cannot be avoided, versioned package namespaces (protobuf: `foo.v2`; REST: `/v2/endpoint`) allow both versions to coexist. The Microsoft gRPC versioning guidance recommends incrementing the package version for breaking changes while maintaining the v1 service for existing clients. Once clients migrate, the old version can be decommissioned.

This approach's cost is schema duplication: v2 typically duplicates v1 with modifications. Moving shared business logic to a common implementation layer (not the gRPC layer) reduces duplication.

---

## 5. Comparative Synthesis

### 5.1 Tool Comparison Matrix

| Tool | Schema Type | Detection Method | Rule Count | CI Integration | Traffic Analysis | Registry Integration | License |
|---|---|---|---|---|---|---|---|
| buf breaking | Protobuf | Static structural | 70+ rules | Native GitHub Action | No | BSR | Apache 2.0 |
| oasdiff | OpenAPI 3.x | Static structural | 300+ rules | GitHub Action | No | None | MIT |
| Optic | OpenAPI 3.x | Static + traffic capture | Not published | GitHub Action | Partial (capture) | None | MIT (OSS) |
| graphql-inspector | GraphQL | Static structural | ~50 change types | GitHub Action | Via `considerUsage` | None | MIT |
| Apollo schema checks | GraphQL | Static + traffic-based | ~30 check types | GraphOS CI | Yes (7-day window) | Apollo Studio | Commercial |
| Confluent Schema Registry | Avro, Protobuf, JSON Schema | Registry-enforced | Per Avro spec + custom | Kafka client-side | No | Self-contained | Confluent Community/Commercial |
| Apicurio Registry | Avro, Protobuf, JSON Schema, OpenAPI, AsyncAPI, GraphQL | Registry-enforced | Per format spec | Kafka client-side | No | Self-contained | Apache 2.0 |
| Pact | HTTP, gRPC, message | Consumer-driven behavioral | N/A (behavioral) | Pact Broker / PactFlow | No | Pact Broker | MIT |
| Buf Schema Registry | Protobuf | Registry-enforced | 70+ Buf rules | buf-action | No | Self-contained | Commercial |

### 5.2 Coverage Trade-offs

**Breadth vs. depth**: Buf provides the deepest analysis for protobuf -- covering wire, JSON, code generation, language-specific options, and semantic dimensions -- but covers only protobuf. oasdiff provides comparable depth for OpenAPI. No tool provides comprehensive coverage across multiple schema formats from a single tool.

**Structural vs. behavioral**: All static analysis tools are blind to semantic changes: a field that changes meaning without changing type or name (e.g., a `status` field that adds new undocumented values, or a `price` field that changes units from cents to dollars) is invisible to schema diffing. Pact's behavioral contracts catch these changes, but require explicit consumer test maintenance.

**False positives vs. false negatives**: Stricter tools (Buf FILE category, Confluent FULL_TRANSITIVE) produce fewer false negatives (missed breaking changes) but more false positives (flagging safe changes as breaking). Apollo's traffic analysis is unique in reducing false positives by filtering for changes that affect real operations, at the cost of infrastructure requirements.

**Ecosystem coupling**: Buf requires adoption of the Buf toolchain and BSR workflow. Confluent Schema Registry is tightly coupled to Kafka. Apollo schema checks require Apollo Studio. oasdiff and graphql-inspector are standalone tools with minimal ecosystem coupling.

### 5.3 Compatibility Model Comparison

| Format | Field Identity | Rename Safety | Addition Safety | Deletion Safety | Type Change |
|---|---|---|---|---|---|
| Protobuf (binary) | Tag number | Safe (binary only) | Safe (unknown skipped) | Safe if reserved | Limited (compatible types only) |
| Protobuf (JSON) | Field name | Unsafe | Safe | Unsafe (parse error) | Unsafe |
| Avro | Name + position | Unsafe (without alias) | Safe (if has default) | Safe (if had default) | Promotion lattice only |
| OpenAPI/JSON Schema | Property name | Unsafe | Safe (if optional) | Unsafe (if was required) | Unsafe |
| GraphQL | Type + field name | Unsafe | Safe | Unsafe | Unsafe |
| Thrift | Tag number | Safe | Safe (if optional) | Safe if tag unused | Unsafe (by convention) |

### 5.4 Versioning Strategy Comparison

| Strategy | Description | Breaking Change Handling | Operational Cost |
|---|---|---|---|
| Never break (extend-only) | Only additive changes; deprecated fields preserved indefinitely | No explicit versioning needed | Accumulates technical debt; schema grows without bound |
| Package/URL versioning | New namespace per breaking version (v1, v2, ...) | Both versions run simultaneously | Infrastructure duplication; migration coordination |
| Date versioning (Stripe model) | Date-pinned versions with transformation layers | Transformation applied per request | High implementation cost; elegant consumer experience |
| Expand-contract | Sequential deployment phases | Zero-downtime migration | Requires phased deployment discipline |
| Feature flags + migration | Old and new behavior coexist behind flags | Controlled rollout | Operational complexity; flag lifecycle management |

---

## 6. Open Problems and Gaps

### 6.1 Semantic/Behavioral Compatibility

The most significant gap in automated breaking change detection is semantic compatibility. Every tool surveyed analyzes schema structure -- types, field names, cardinalities -- but none can detect:

- A `price` field changing units from cents to dollars (same type, same name, different meaning)
- A `status` enum adding undocumented values that consumer switch statements do not handle
- A request field that was previously ignored but is now validated and required for successful processing
- A response field that was always non-null in practice but was typed as nullable, now actually returning null

Pact's behavioral contracts partially address this by testing actual provider behavior against consumer expectations, but require explicit test maintenance and consumer participation. The field of "semantic API compatibility" remains largely an open research problem.

### 6.2 Cross-Format Migration

Modern systems often combine multiple schema formats (protobuf internally, OpenAPI externally, Avro for event streaming). No tool provides unified breaking change analysis across format boundaries. Organizations must maintain separate tool chains and rules for each format, with no mechanism to ensure cross-format consistency (e.g., an internal protobuf change that causes a breaking change in the OpenAPI representation).

### 6.3 Automated Migration Generation

Current tools detect breaking changes but do not generate migration code. When a breaking change is approved (intentional version bump, expand-contract migration), the developer must manually implement the migration. Research in programming languages (bidirectional transformations, lens theory) has produced theoretical frameworks for schema migration generation, but no production tool applies these to the protobuf/OpenAPI/Avro domain.

### 6.4 Schema Evolution for AI/ML Pipelines

The rise of ML model serving via schema-driven APIs (TensorFlow Serving, Triton, Hugging Face Inference API) introduces schema evolution challenges that existing tools do not address: changes to tensor shapes, model input/output format changes, and the distinction between model version (weights) and API version (interface). Existing protobuf tooling does not capture the semantic constraints of tensor APIs.

### 6.5 JSON Schema Tooling Maturity

JSON Schema has the weakest tooling ecosystem for breaking change detection. Existing tools (`json-schema-diff`, `json-schema-diff-validator`, `rusty-schema-diff`) have incomplete keyword coverage, do not support complex JSON Schema features (allOf/anyOf/oneOf composition, `$ref` resolution, conditional schemas), and lack standard compatibility mode definitions analogous to Confluent's BACKWARD/FORWARD/FULL. The JSON Schema community has recognized this gap -- GSoC 2026 proposals include both a semantic diff tool and a compatibility checker -- but production-grade tooling does not yet exist.

### 6.6 Performance Compatibility Automation

No tool detects performance breaking changes: added latency, reduced throughput, increased memory requirements, new infrastructure dependencies. These changes break implicit SLA contracts as reliably as structural breaking changes but are invisible to schema analysis. Observability and SLO monitoring provide detection, but not prevention.

### 6.7 Thrift Ecosystem

Thrift lacks a schema registry and automated breaking change detection tool. Organizations using Thrift at scale (Twitter, Facebook historically) have developed internal tooling that has not been open-sourced. The gap leaves Thrift users dependent on code review and convention for compatibility management.

---

## 7. Conclusion

Schema evolution is a structural challenge inherent to any system where producers and consumers evolve independently. The core insight driving all automated breaking change detection is that schemas are formal contracts, and contracts can be mechanically verified. The question is which dimension of compatibility a given tool verifies.

Buf has made the most systematic progress on protobuf compatibility, defining 70+ named rules across four categories that encode three compatibility dimensions (wire, JSON, code generation) and integrating them from local development through CI to registry enforcement. Its rule taxonomy is the clearest public articulation of what "breaking" means in a schema-driven system.

The OpenAPI ecosystem has achieved comparable rule depth through oasdiff (300+ rules), with Optic adding the important dimension of spec-implementation accuracy. GraphQL has uniquely advanced the state of the art through Apollo's traffic-based analysis, which reduces false positives by grounding breaking change detection in actual consumer behavior rather than theoretical compatibility.

Avro's embedded schema resolution rules represent a different design philosophy: compatibility is a first-class concern of the serialization format itself, not an external tooling concern. This elegance comes at the cost of name-based field identity and mandatory schema distribution infrastructure.

Consumer-driven contract testing via Pact sits orthogonally to all static analysis tools, catching semantic and behavioral changes that structural analysis cannot reach. The two approaches are complementary rather than competitive.

The most significant open problem is semantic compatibility -- changes that preserve schema structure while altering meaning. This is a fundamental limitation of static analysis and may require a combination of behavioral testing, runtime monitoring, and semantic versioning disciplines to address systematically.

For teams building schema-driven APIs today, the clearest recommendation from the landscape is: adopt static schema analysis (Buf, oasdiff, graphql-inspector) as a non-negotiable CI gate, pair it with consumer-driven contract testing (Pact) for behavioral coverage, enforce it at the registry level (BSR, Confluent, Apicurio) for centralized governance, and design migration workflows around the expand-contract pattern for changes that must break the current contract.

---

## References

1. **Buf Breaking Change Detection Overview** — https://buf.build/docs/breaking/
2. **Buf Breaking Change Rules and Categories** — https://buf.build/docs/breaking/rules/
3. **Buf Breaking Change Usage Guide** — https://buf.build/docs/breaking/usage/
4. **Buf Schema Registry — Breaking Change Policy** — https://buf.build/docs/bsr/policy-checks/breaking/overview/
5. **Buf — Governance and Breaking Change Policy Enforcement** — https://buf.build/blog/breaking-change-governance
6. **Buf — Protobuf Editions Are Here** — https://buf.build/blog/protobuf-editions-are-here
7. **Buf — Fixing Oneofs with Protovalidate** — https://buf.build/blog/fixing-oneofs
8. **Buf — Tip of the Week #1: Field Names Are Forever** — https://buf.build/blog/totw-1-field-names
9. **Buf GitHub Action** — https://github.com/bufbuild/buf-action
10. **Protocol Buffers Language Guide (proto3)** — https://protobuf.dev/programming-guides/proto3/
11. **Protocol Buffers Language Guide (Editions)** — https://protobuf.dev/programming-guides/editions/
12. **Protocol Buffers Enum Behavior** — https://protobuf.dev/programming-guides/enum/
13. **Protocol Buffers ProtoJSON Format** — https://protobuf.dev/programming-guides/json/
14. **Protocol Buffers Editions Overview** — https://protobuf.dev/editions/overview/
15. **Confluent Schema Registry — Schema Evolution and Compatibility** — https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html
16. **Confluent Schema Registry API Reference** — https://docs.confluent.io/platform/current/schema-registry/develop/api.html
17. **Kleppmann, Martin — Schema Evolution in Avro, Protocol Buffers and Thrift** (2012) — https://martin.kleppmann.com/2012/12/05/schema-evolution-in-avro-protocol-buffers-thrift.html
18. **Yokota, Robert — Understanding Protobuf Compatibility** (2021) — https://yokota.blog/2021/08/26/understanding-protobuf-compatibility/
19. **oasdiff — OpenAPI Breaking Change Detection** — https://www.oasdiff.com/
20. **oasdiff — Breaking Changes Documentation** — https://www.oasdiff.com/docs/breaking-changes
21. **oasdiff — GitHub Repository** — https://github.com/oasdiff/oasdiff
22. **Nordic APIs — Using oasdiff to Detect Breaking Changes** — https://nordicapis.com/using-oasdiff-to-detect-breaking-changes-in-apis/
23. **Optic — OpenAPI Linting, Diffing and Testing** — https://github.com/opticdev/optic
24. **GraphQL-Inspector — Diff and Validate GraphQL Schemas** — https://the-guild.dev/graphql/inspector/docs/commands/diff
25. **Apollo GraphQL — Schema Checks Reference** — https://www.apollographql.com/docs/graphos/platform/schema-management/checks/reference
26. **Apollo GraphQL — Run Schema Checks** — https://www.apollographql.com/docs/graphos/platform/schema-management/checks/run
27. **Pact — Consumer-Driven Contract Testing** — https://docs.pact.io/
28. **PactFlow — Consumer-Driven Contract Testing Definition** — https://pactflow.io/what-is-consumer-driven-contract-testing/
29. **PactFlow — gRPC Contract Testing** — https://pactflow.io/blog/contract-testing-for-grpc-and-protobufs/
30. **Microsoft Learn — Versioning gRPC Services** — https://learn.microsoft.com/en-us/aspnet/core/grpc/versioning
31. **AutoMQ — Kafka Schema Registry Comparison 2025** — https://www.automq.com/blog/kafka-schema-registry-confluent-aws-glue-redpanda-apicurio-2025
32. **Apicurio Registry Documentation** — https://www.apicur.io/registry/
33. **Stripe — APIs as Infrastructure: Future-Proofing Stripe with Versioning** — https://stripe.com/blog/api-versioning
34. **Notion — How Notion Catches Breaking Schema Changes** — https://www.notion.com/blog/how-notion-catches-breaking-schema-changes
35. **Hodgson, Pete — Expand/Contract: Making a Breaking Change Without a Big Bang** (2023) — https://blog.thepete.net/blog/2023/12/05/expand/contract-making-a-breaking-change-without-a-big-bang/
36. **InfoQ — Beyond API Compatibility: Understanding the Full Impact of Breaking Changes** — https://www.infoq.com/articles/breaking-changes-are-broken-semver/
37. **Earthly Blog — Protocol Buffers Best Practices for Backward and Forward Compatibility** — https://earthly.dev/blog/backward-and-forward-compatibility/
38. **SoftwareMill — Good Practices for Schema Evolution with Protobuf** — https://softwaremill.com/schema-evolution-protobuf-scalapb-fs2grpc/
39. **Semantic Versioning 2.0.0** — https://semver.org/
40. **GitHub — bkayser/thrift-versioning-doc** — https://github.com/bkayser/thrift-versioning-doc
41. **GitHub — getsentry/json-schema-diff** — https://github.com/getsentry/json-schema-diff
42. **GitHub — GSoC 2026: JSON Schema Compatibility Checker** — https://github.com/json-schema-org/community/issues/984

---

## Practitioner Resources

### Getting Started with Buf

```yaml
# buf.yaml — minimal breaking change detection configuration
version: v2
breaking:
  use:
    - FILE              # strictest: protects wire, JSON, and generated code
  ignore_unstable_packages: true   # allow alpha/beta packages to break freely
```

```bash
# Compare against main branch (local CI)
buf breaking --against '.git#branch=main'

# Compare against BSR-published version
buf breaking --against buf.build/myorg/myapi

# GitHub Actions workflow (buf-action covers lint + breaking + push)
# See: https://github.com/bufbuild/buf-action
```

### oasdiff CI Integration

```bash
# Install
brew install oasdiff

# Check for breaking changes between two OpenAPI specs
oasdiff breaking old-spec.yaml new-spec.yaml

# Output for GitHub Actions annotation format
oasdiff breaking old-spec.yaml new-spec.yaml --format github-actions

# Run as GitHub Action (oasdiff-action)
# See: https://github.com/oasdiff/oasdiff-action
```

### Confluent Schema Registry Compatibility Selection

| Scenario | Recommended Mode |
|---|---|
| Event streaming, consumer-upgrade first | BACKWARD |
| Long-lived consumers, historical replay | BACKWARD_TRANSITIVE |
| Protobuf schemas in Confluent | BACKWARD_TRANSITIVE (adding new message types is not forward-compatible) |
| Avro with maximum flexibility | FULL_TRANSITIVE |
| Internal microservices, controlled rollout | BACKWARD |
| Kafka Streams | BACKWARD (only supported mode) |

### Field Deletion Checklist (Protobuf)

Before deleting any field:
1. Verify no active consumer reads this field (traffic analysis, code search)
2. Mark the field `[deprecated = true]` in the schema and communicate via changelog
3. Wait one or more release cycles to allow consumers to stop reading
4. Delete the field definition from the `.proto` file
5. Add the field number to `reserved` in the message
6. Add the field name to `reserved` in the message (for JSON and TextProto safety)
7. Run `buf breaking --against .git#branch=main` to verify the reservations pass WIRE/WIRE_JSON checks

### Expand-Contract Migration Checklist

- [ ] Phase 1: Add new field/endpoint alongside old. Verify both work. Deploy.
- [ ] Phase 2: Update all producers to write new field. Verify old consumers still function (they read old field). Deploy.
- [ ] Phase 3: Verify all consumers have been updated to read new field. Deploy.
- [ ] Phase 4: Remove old field. Reserve its number. Run buf breaking. Deploy.
- [ ] Phase 5: After stabilization period, archive old schema version.

### GraphQL Schema Deprecation Workflow

```graphql
type Query {
  # Deprecated: use userV2 instead. Will be removed 2026-07-01.
  user(id: ID!): User @deprecated(reason: "Use userV2 which returns UserV2 type with expanded profile fields")
  userV2(id: ID!): UserV2
}
```

Apollo schema checks will flag removal of `user` if it still appears in real operations within the 7-day traffic window. The `@deprecated` directive is the signal to consumers that migration is expected; schema checks prevent removal until consumers have migrated (traffic window clears).
