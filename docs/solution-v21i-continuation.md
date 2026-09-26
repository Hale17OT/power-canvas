# Certification continuation after global-choice recovery

The execution gate retains the original 21-root fixture and adds one bounded
continuation state: the global choice is already owned through a valid
`CREATE_RECOVERY` receipt, and the other 20 roots remain creates. This is not a
generic partial-apply resume mechanism. More satisfied roots, modified source,
choice mutations, publication, updates and unrelated resources remain blocked.

Fresh full discovery and the deterministic planner remain authoritative. The
execution manifest explicitly lists the choice under `ownedPrerequisites` with
`OWNED_EXPECTED_STATE`, its stable MetadataId, receipt hash and definition hash.
It is excluded from authorized operation IDs. The new authorization also binds
the prerequisite digest, ownership revision and exact remaining plan hash.
Historical manifests/authorizations remain readable and are never reused.

Under the normal writer lock, scope-bound attestation reads the recovered choice
by MetadataId and verifies the exact canonical Name, type, global status, labels,
numeric options, unmanaged/customizable state and exact solution membership.
This prerequisite is checked at both initial and operation-local boundaries.
An absent owned choice is a failure, never permission to recreate it. All
remaining creates retain their existing exact absence checks and dependency
verification. No broad pre-write discovery fallback is introduced.

Incremental certification readback additionally records explicit table and
primary-name metadata identities, including LogicalName, SchemaName,
EntitySetName, OwnershipType and PrimaryNameAttribute. EntitySetName is a
platform-generated identity: its valid exact value is recorded and must remain
stable across independent witnesses, rather than inventing a pluralization rule.
The global-choice column must bind to the independently observed choice GUID.
All existing defining-property and solution-membership checks still apply before
an ownership receipt is saved. No new metadata normalization is introduced.

The current CLI remains `solution certification-execute` with
`--execute-reviewed-fixture`, an explicit reviewed evidence directory, bound
environment and expected principal. It performs a new preflight and produces a
new manifest, authorization and journal. The old stopped receipt is evidence
only. Any failed strict readback stops subsequent operations and preserves
surviving resources for read-only reconciliation; no compensating deletion or
automatic mutation retry occurs.

Final complete independent discovery, all-root NO_OP, key Active status and
ValidateApp remain necessary before downstream dependency/export/Checker proof.
Checker still requires explicit upload authorization. Manual app publication,
zero PublishXml, no human/team assignment and no business/Canvas/Flow changes
remain the certification boundaries. Live outcomes belong in ignored
`output/solution-v21i/`, not in source-controlled maturity claims.

## Observed alternate-key blocker

The live continuation verified both tables and all eight additional columns,
then received HTTP 400 / `0x80040203` on the alternate-key CREATE. The existing
provider sends SchemaName and KeyAttributes but omits the native DisplayName
label. The service explicitly rejected that omission; complete reconciliation
found no key. This is a provider payload defect, not a casing normalization or
an unknown write outcome. The key was attempted once and subsequent operations
were not attempted. No runtime provider correction was made during this run.

[Microsoft EntityKeyMetadata](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/entitykeymetadata?view=dataverse-latest)
defines DisplayName as a Label property. A subsequent task must review how the
typed source/compiler supplies that label, fix the bounded create contract and
obtain fresh authorization from the now-partially-provisioned state. The present
continuation gate intentionally rejects attempts to reuse its old 20-operation
authorization after the ten new receipts exist. The regression test preserves
the ten completed roots, verifies the deterministic key rejection without retry,
and ensures no receipt or later mutation follows it.
