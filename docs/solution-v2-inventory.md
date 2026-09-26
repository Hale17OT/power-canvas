# Unified V2: pre-implementation inventory

Inspected 22 September 2026 before V2 implementation. This records the starting point, not the final support matrix. No live discovery or mutations were performed.

| Resource | Schema / plan | Create | Update | Delete | Readback / ownership / membership | Existing evidence |
|---|---|---|---|---|---|---|
| Tables | Yes | Existing metadata adapter | Labels only | Blocked | Yes | Historical isolated Default experiment; no production proof |
| Columns | Text, memo, integer, decimal, boolean, datetime, local choice | Yes | Label only | Blocked | Yes | Historical bounded schema slice |
| Relationships | Internal many-to-one (inverse one-to-many); restrict/no cascade | Yes | Blocked | Blocked | Yes, including lookup | Historical bounded schema slice |
| Choices | Local numeric values on columns | With column | Blocked | Blocked | Local choices | No global-choice adapter |
| Keys | Intent reports unsupported | No | No | No | No | None |
| Main forms | Flat fields and optional reveal | Yes | Additive reveal only | Blocked | Yes | Historical model experiment |
| Public views | Columns, sort, active-only | Yes | Blocked | Blocked | Yes | Historical model experiment |
| Model apps / sitemap | AppModule, flat grouped navigation | Yes | Client conversion only | Blocked | Identity, membership, components | Historical admin runtime only |
| Security roles | Five explicit table privileges / four depths | Yes | Initial grants only | Blocked | Exact default privileges and owned grants | Restricted personas unproven |
| App-role access | Explicit app/role references | Yes | Removal blocked | Blocked | Default/admin associations distinguished | Restricted personas unproven |

Authoritative implementation: `src/ir`, `src/dataverse`, `src/model-driven`, `src/planner/dataverse.ts`, `src/state`, and existing executor/journals. Unified V1 delegates to these adapters; it does not own a second metadata runtime. V1 incorrectly groups native model resources under security/manual handling and uses an all-or-nothing unified apply gate. Solution Checker currently imports SARIF only; platform dependency comparison currently consumes declared normalized evidence only.
