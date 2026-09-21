# ADR 0004: Public Web API for schema, PAC for ALM

Status: accepted as implementation strategy, 17 September 2026; tenant validation pending.

## Context

The research identifies documented Dataverse metadata and model-driven APIs, and established PAC packaging/deployment commands. Internal maker endpoints and legacy Canvas packers do not offer the required support contract.

## Decision

Implement versioned Dataverse Web API adapters for the bounded ordinary schema and supported model-driven operations. Embed primary names in table creation; create lookups through relationship metadata. Use Microsoft identity libraries for API tokens. Wrap PAC in one versioned process adapter for supported solution export/import/checking. Defer .NET until a proven operation benefits from a supported SDK.

## Alternatives

Reflecting into PAC assemblies, replaying maker traffic, editing arbitrary solution XML, or writing specialized expressions through undocumented payloads is excluded. An all-SDK worker is viable but adds runtime complexity before it is needed.

## Consequences

Exact payloads, discovery coverage, solution membership, publish propagation, no-op semantics, throttling and privileges need Experiment 1. Model-driven generation waits for that gate. Downstream schema promotion uses managed solutions, avoiding competing direct metadata writes in production.
