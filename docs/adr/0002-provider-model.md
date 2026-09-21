# ADR 0002: Domain providers with honest capability reporting

Status: accepted, 17 September 2026.

## Context

Dataverse, model-driven authoring, solutions and future external services have different operations, identities and support restrictions. A generic CRUD abstraction hides these distinctions.

## Decision

Define typed operation unions and a common discovery/validation/planning/apply/observe/verify lifecycle. Separate Microsoft support class, provenance and actual PowerCanvas implementation availability. Register real CLI commands only. Keep auth, locks and journals outside providers.

## Alternatives

A universal resource CRUD interface cannot represent publication, async readiness or connection authority honestly. Direct AI/API execution bypasses reviewed intent. A public plugin ecosystem adds an unnecessary security/distribution surface.

## Consequences

Some capabilities exist only as catalog entries and return unavailable until implemented. A structurally valid specification can still be nonexecutable, which the CLI explicitly reports. New providers require scoped contracts and acceptance evidence.
