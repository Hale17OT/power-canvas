# State and journal

Four separate records are mandatory:

1. Desired IR in `powercanvas.yaml` (source controlled).
2. Observation: target binding, timestamp, provider/API versions, coverage and normalized managed-property projections with real remote IDs. Unknown properties/resources are not implicitly deleted.
3. Ownership state: project/target binding, revision, resource identity → remote ID, owned property paths, last-applied property baseline and evidence hash.
4. Saved plan and append-only execution journal: intended operations versus actual events.

Local records live in `.powercanvas/<target fingerprint>/`; the fingerprint hashes project ID, tenant ID, environment ID, organization ID and canonical Dataverse origin. Observations, ownership, plans and journal have separate paths/schemas. No global mutable target is consulted during a write. `init` adds `.powercanvas/` to the generated project's ignore file.

The local store validates each record, rejects mismatched targets/projects, writes temporary files with exclusive creation then syncs and renames, and uses an exclusive lock file to reject concurrent writers. Each journal event is written and synced before returning. Readers reject corrupt/truncated JSON or JSONL; they never reset damaged state to empty. File names come from validated UUIDs, not arbitrary resource names. A crashed lock is not automatically stolen: inspect it and reconcile the remote target before an operator removes it. Local locks are not a distributed backend and network filesystems are out of scope.

State uses nonsecret metadata only and rejects credential-shaped fields. Provider normalization must whitelist safe managed properties before storage. Redaction is a secondary log defense, not permission to persist credentials. POSIX mode requests are restrictive; Windows inherits workspace ACLs. This prototype does not claim encrypted local state or change Windows ACLs. Keep the workspace access controlled.

Every mutation within a writer lease is serialized; the first write failure stops later writes and propagates when the lease closes. Callers must await their operations. File contents are flushed before rename, but the prototype does not promise survival of every OS/filesystem power-loss scenario or distributed filesystem atomicity.

## Journal events

Each event has a unique event ID, stable execution/plan ID, stable operation ID, timestamp, provider and resource identity. Event types: started, remoteSucceeded, verified, failed, outcomeUnknown. Optional evidence includes remote ID, service operation ID and a stable error code. Raw request/response bodies and credentials are excluded.

The executor records intent before writes, then remote outcome, then verification. A timeout becomes outcomeUnknown; rediscovery must establish whether a create succeeded before retry. Ownership advances only after verification. Milestone 4 implements transition enforcement, verified checkpoints and linked read-only create recovery. Unknown outcomes require explicit creation-provenance confirmation; acknowledged creates that failed verification can be reverified without reissuing writes. Original terminal events are retained.

Milestone 5 preserves the same store and records the actual provider on each event. Create receipts retain the same-origin `OData-EntityId` GUID and must agree with the observed resource before ownership advances. The role-grant recovery case additionally requires an already-owned exact parent role and the original acknowledged `grant` substep; unknown grant outcomes are not recoverable through this path. Separate schema/model publication hashes prevent a partial app run from reporting a false no-op. The Experiment 1 gate records artifact hashes and the verified schema hash; it is local evidence, not a signed attestation or a substitute for current target checks.
