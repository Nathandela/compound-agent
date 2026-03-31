# ADR-003: Zod for schema validation

**Status**: Accepted

**Date**: 2026-01-30

## Context

Lessons have a defined structure (quick vs full types) with required fields. The system needs runtime validation since lessons come from user input and file reads. TypeScript types alone do not provide runtime safety.

## Decision

Use Zod for runtime schema validation with TypeScript type inference.

- Define lesson schemas with Zod
- Derive TypeScript types from schemas using `z.infer`
- Validate all lessons on read and write
- Fail fast on invalid data

## Consequences

### Positive

- Single source of truth for types and validation
- Clear error messages for invalid lessons
- No type drift between runtime and compile time
- Parse, don't validate (Zod returns typed data)

### Negative

- Additional dependency
- Slight overhead on every read/write
- Learning curve for Zod syntax

## Alternatives Considered

### TypeScript Types Only

No runtime validation. Invalid JSON from file corruption or manual editing would cause silent bugs. Rejected for lack of safety.

### io-ts / Yup / Ajv

All valid options but Zod has better TypeScript integration and simpler API. Zod is also more actively maintained and popular in the TypeScript ecosystem.
