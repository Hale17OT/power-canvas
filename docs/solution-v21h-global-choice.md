# Global choice identity and confirmed-create recovery

Microsoft's global `OptionSetMetadata` exposes `Name` and `MetadataId`. It does
not expose a table-style `LogicalName` / `SchemaName` pair. Microsoft documents
retrieval through either `GlobalOptionSetDefinitions(Name='...')` or
`GlobalOptionSetDefinitions(<MetadataId>)`:

- [Metadata identity keys](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/retrieve-metadata-name-metadataid)
- [OptionSetMetadata properties](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/optionsetmetadata?view=dataverse-latest)

V2.1h measured the surviving certification choice using all three lookup forms.
The GUID and lowercase Name returned the same GUID and lowercase Name; the
mixed-case authoring Name returned HTTP 404. This is bounded live evidence for
this global-choice provider contract, not a statement that all metadata names
are case-insensitive.

## Provider boundary

The public `schemaName` source field and outer desired-resource identity remain
compatible. `canonicalGlobalChoiceName` validates the existing ASCII identifier
grammar and maps only ASCII A–Z to a–z. Internal choice `properties.schemaName`
represents the canonical platform Name. Future CREATE payloads intentionally
send this canonical Name. Labels and numeric option identities remain unchanged.

Discovery and pre-create collision attestation use the canonical Name. Owned
discovery uses the receipt's MetadataId and does not fall back to a name if that
ID is missing. Only supported metadata-not-found responses establish unowned
absence; other errors stop discovery. An equivalent unowned choice remains a
collision, never an implicit adoption.

Choice postconditions compare exact canonical Name, label, sorted option values
and labels, `Picklist` type, global status and solution membership. Existing
managed/customizable guards and the executor's acknowledged-MetadataId check
remain in force. Future global-choice columns bind by the independently observed
MetadataId after dependency verification; standalone payload compilation uses
canonical Name when no stable ID is available.

Table SchemaName, relationship SchemaName, sitemap and AppModule identities
retain their existing rules. Historical source files and receipts are not mass
rewritten. An older receipt with incompatible provider properties must stop for
explicit provenance review, not be silently migrated.

## Local recovery, not adoption

`reviewConfirmedCreateRecovery` is a closed certification recovery policy.
`recoverConfirmedCreate` writes through the existing `LocalStateStore` lock and
revision system. It accepts an acquisition callback that must obtain current
read-only evidence inside the lock; it has no tenant mutation adapter.

The policy requires the reviewed source and fixture hashes; a self-consistent
original plan, manifest and authorization; the exact ownership baseline; and
the durable journal's successful logical and provider CREATE followed by
PF-DV-007 verification failure. Both sequences must carry the same stable ID.
Saved-byte journal and reconciliation hashes bind the evidence. Missing or
unknown write outcomes cannot use this policy.

Independent reconciliation and fresh complete readback must confirm the exact
ID, environment, owned solution and publisher, labels, option values, canonical
Name, supported type, membership and unmanaged/customizable state. The only
accepted difference from the original desired operation is the reviewed Name
normalization (plus explicit type/global postconditions already sent by the old
payload compiler). Conflicting ownership or stale observations block recovery.

The new receipt records `origin: CREATE_RECOVERY` and
`POSTCONDITION_PLATFORM_NORMALIZATION`, with source/fixture hashes, original
execution/operation/plan identities, saved evidence hashes, dependency IDs and
readback provenance. The ownership revision advances once. Previous receipts,
the failed journal, stopped authorization and PARTIALLY_APPLIED report remain
unchanged. Expired historical authorization is provenance only: it never grants
new execution permission.

Agent interpretation of a successful create, verification failure and matching
independent stable ID is `CONFIRMED_SURVIVING_CREATE`, routed to provider
normalization and source-bound recovery analysis. This hint authorizes neither
recovery nor retry; the deterministic recovery policy remains authoritative.

## Continuation boundary

After recovery, perform a separate full discovery and certification plan. The
choice must have no mutation or blocker; the other certification roots remain
planned and unexecuted. The expected fixture leaves 20 operations, including
three security writes, with empty publication scope. Counts come from the plan.

V2.1h performs no tenant mutations, exports or Checker uploads and promotes no
capability maturity. Complete provider certification is still pending. V2.1i
requires a new full observation, exact remaining-operation authorization and
scope-bound attestation. The stopped V2.1g receipt cannot be resumed. The existing
21-operation execution gate is deliberately not widened by this recovery work.

Local live evidence belongs under ignored `output/solution-v21h/`. Tests use
synthetic identities, exercise strict negative recovery gates and prove owned
NO_OP versus unowned collision behavior. Tenant IDs, raw metadata exports,
authentication evidence and ownership receipts must not be committed.
