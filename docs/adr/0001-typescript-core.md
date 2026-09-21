# ADR 0001: Single TypeScript package

Status: accepted, 17 September 2026.

## Context

The product needs a typed CLI, YAML/JSON processing, tests and eventually Playwright. There is no existing implementation and no confirmed need for another runtime.

## Decision

Use Node, strict TypeScript and a single private npm package with domain modules. Commander handles the small command surface. Zod provides types/runtime validation and exports JSON Schema; semantic checks remain explicit. Pin dependencies and a lockfile. TypeScript 5.9 is selected within the installed ESLint tooling's declared peer range rather than using an incompatible latest compiler.

## Alternatives

Many workspace packages add build/versioning overhead before independent consumers exist. An all-.NET implementation offers SDK strengths but is not required for the first local milestone. JSON Schema alone would need a separate TypeScript type-generation pipeline. A .NET worker remains a later option for Power Fx or SDK-heavy work.

## Consequences

Boundaries are enforced through modules and review rather than package publishing. Runtime schema and editor schema share one source, while cross-resource semantics need separate tests. CI covers Windows/Linux and Node 22/24; other combinations are unverified.
