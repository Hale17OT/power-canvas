# ADR 0003: Four models and local target isolation

Status: accepted, 17 September 2026.

## Context

Observed metadata cannot establish ownership. Desired files cannot prove deployment success. Cross-tenant mistakes and interrupted writes are primary product risks.

## Decision

Separate desired IR, observed snapshots, ownership baselines, and plan/journal records. Namespace local state by project plus immutable target. Require an exclusive local lock for every mutation; serialize calls within the lease. Validate records and hashes, fail on corruption and mismatched bindings, journal remote intent/outcome/verification separately. Never auto-steal a stale lock.

## Alternatives

Git-only state provides weak locking and exposes sensitive metadata. A database or cloud backend is premature. Rebuilding observations is valid; rebuilding ownership from naming conventions is not.

## Consequences

Local state works for a single-host prototype and needs protected filesystem access. It is not encrypted and is not a multiwriter backend. Runtime tokens never belong in these records. Remote recovery still requires an implemented executor and live verification; journal files alone do not supply it.
