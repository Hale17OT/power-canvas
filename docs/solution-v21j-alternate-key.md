# Alternate-key contract correction and read-only continuation

V2.1i sent `SchemaName` and `KeyAttributes` without `DisplayName`. Dataverse rejected that request with HTTP 400 / `0x80040203`; independent discovery found no key. This remains `CREATE_REJECTED`, not an unknown outcome or a surviving create. Its execution, authorization, journals and receipts remain immutable. No key ownership recovery is appropriate.

## Authoring and compatibility

New source should explicitly declare its user-facing label:

```yaml
dataverse:
  keys:
    externalIdentity:
      schemaName: pfx_ExternalIdentity
      displayName: External identity
      table: requests
      columns: [externalId]
      reason: External integration identifies requests by its stable key.
```

The existing `powercanvas.dev/v1alpha1` contract remains readable: an omitted label falls back deterministically to the exact SchemaName, without casing transformations. This is a legacy compatibility path, not the recommended authoring UX. Empty or whitespace-only explicit labels are invalid. No new API version or automatic source migration is introduced. Existing owned keys lacking the new defining properties require explicit review; this change does not silently rewrite their receipts or allow updates.

The certification fixture explicitly uses `PowerCanvas Experiment Certification External Code`. The old unlabeled fixture is preserved as a test-only source fixture for historical execution-gate regressions. The old execution allowlist remains unchanged and rejects the new source hash; V2.1j grants no live execution authorization.

## Typed provider contract

`keyResourceSchema` → desired key IR → `keyPayload` → `entityKeyCreateSchema` → existing `mutateSchema` provider.

The existing `nativeLabel` serializer emits:

```json
{
  "SchemaName": "pfx_ExperimentCertificationExternalCodeKey",
  "DisplayName": {
    "LocalizedLabels": [
      {"Label": "PowerCanvas Experiment Certification External Code", "LanguageCode": 1033}
    ]
  },
  "KeyAttributes": ["pfx_experimentcertificationexternalcode"]
}
```

This is a bounded local subset of [Microsoft EntityKeyMetadata](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/entitykeymetadata?view=dataverse-latest), not full Microsoft schema validation. Parent table identity is validated separately and remains in the request path. Missing labels, localization, schema identity, parent identity or attributes fail locally before transport. Key attributes must be distinct logical names. The provider resolves them from observed columns and refuses a mismatch with the planned identity. Primary-name attributes resolve from the observed parent metadata.

Discovery retains exact `SchemaName`, `DisplayName`, `KeyAttributes`, `EntityLogicalName`, stable MetadataId, index status and solution membership; managed/customizable guards remain in force. Additional observed logical-name evidence does not change desired table/column definitions or ownership baselines. Global-choice Name canonicalization is not used for key SchemaName. The existing allowed column types, 900-byte budget, maximum 16 attributes and destructive-change guards are unchanged. Field-security authoring is not supported by the strict current column schema; no new security capability is implied.

## Index lifecycle and receipts

Microsoft's wire states are `Pending`, `InProgress`, `Active`, and `Failed` ([enum contract](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/entitykeyindexstatus?view=dataverse-latest)). The existing bounded readback loop is retained. Normal ownership is written only after all defining postconditions match, including `Active` and solution membership.

An exhausted Pending/InProgress wait reports `CREATED_PENDING_INDEX` with the surviving metadata ID. Failed reports `CREATED_INDEX_FAILED` and stops immediately. An Active key with another failed postcondition remains `CREATED_UNVERIFIED`. These are failed apply results with no verified key receipt; they require reconciliation, never another automatic CREATE or compensating DELETE. The successful POST remains recorded in the durable journal. An HTTP 400 without a surviving key is a different failure boundary.

## V2.1j boundary

V2.1j performs offline validation and fresh GET-only certification planning. It creates no execution authorization, acquires no mutation writer lock, and performs no metadata/security/business-data writes, publication, export, Checker upload, Canvas/Flow changes, authentication changes, binding changes, ownership changes or capability promotion. Eleven satisfied roots must remain NO_OP; the absent key and nine later roots remain planned mutations only. V2.1k requires fresh discovery, plan, manifest, exact reviewed authorization and attestation.
