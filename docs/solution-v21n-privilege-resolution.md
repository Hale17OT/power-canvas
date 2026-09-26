# Stable table privilege resolution

V2.1n corrects security identity resolution. It does not authorize or execute security writes, change ownership receipts, or promote a capability.

The V2.1m pre-write check constructed `prvRead` plus a lower-case table logical name, then required a case-sensitive Name match. Dataverse returned a differently cased Name for the correct table privilege. The check stopped before AddPrivilegesRole. The V2.1m report and partial-application evidence remain unchanged.

## Supported Microsoft contract

[SecurityPrivilegeMetadata](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/securityprivilegemetadata?view=dataverse-latest) is exposed through EntityMetadata.Privileges. It supplies PrivilegeId, PrivilegeType, Name and per-depth capability flags. The compiler resolves the requested type from this collection, not from a constructed Name.

[AddPrivilegesRole](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/addprivilegesrole?view=dataverse-latest) accepts a collection of [RolePrivilege](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/roleprivilege?view=dataverse-latest) values. The existing provider sends PrivilegeId and Depth. [RetrieveRolePrivilegesRole](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrieveroleprivilegesrole?view=dataverse-latest) supplies stable privilege IDs and typed depths for a specified role ID; no additional depth-mask conversion is needed on this supported readback path.

## Source, target binding and compatibility

Portable security source remains a role's table reference and typed permission/depth, such as `read: user`. The mapping remains user → Basic, businessUnit → Local, parentChildBusinessUnit → Deep, organization → Global. Certification permits only the reviewed Basic reads.

`roleRequirements` derives table resource ID, logical name, privilege type and depth from source. `resolveTablePrivilege` verifies the actual table MetadataId and logical identity, requires exactly one requested PrivilegeType, and checks its requested depth flag. It returns the stable PrivilegeId and observed Name, capabilities and table provenance.

No target privilege GUID is written into portable source. Discovery retains table security metadata as target evidence. A native grant operation carries `resolvedTablePrivileges` in its hashed preconditions; source properties, operation identities and historical receipt projections remain compatible. Legacy `privilegeName` labels remain in those projections for compatibility only. They are never used to look up or select a privilege. A table that does not exist yet cannot supply a stable binding: its grant must wait for discovery and a fresh bound plan. An unbound plan cannot execute through the grant provider.

The same source resolves independently in another environment. Default-environment privilege GUIDs are not portable deployment inputs.

## Execution and readback

The existing certification attestation checks owned role/table dependencies and reads each exact table MetadataId immediately before a grant. The shared resolver must return the same PrivilegeId, type, logical identity and requested depth as the plan. A changed Name alone does not alter identity. ID drift, a wrong table or unsupported capability blocks before mutation. The certification grant is also blocked if any nondefault grant already exists.

The existing AddPrivilegesRole provider repeats this read-only binding check and builds its payload from the resolved IDs. It introduces no new writer and no write retry. The nine previously verified platform defaults retain their separate, strict normalization contract.

Role readback maps actual IDs to source projections only after matching them against exact table metadata. Unknown IDs remain explicit even if their names resemble expected privileges. Requested depth is preserved for comparison; it is never widened. A matching but unowned aggregate remains a collision, and a partial grant is not adopted. Bound grant postconditions additionally verify the role ID and exact PrivilegeId/depth pairs from fresh role readback. Subsequent dependency attestation rechecks the same stable bindings.

Resolution failures use PF-MDA-009 with precise reasons: PRIVILEGE_UNRESOLVED, PRIVILEGE_AMBIGUOUS, PRIVILEGE_DEPTH_UNSUPPORTED or PRIVILEGE_CHANGED. Certification attestation classifies these as DEPENDENCY_CHANGED and propagates its safe reason through PF-CERT-003, rather than losing it in PF-INTERNAL-001.

## Evidence boundaries

The V2.1n run saves fresh observation, native/unified plans, privilege resolution, a local payload preview, authentication/read health, request audits and saved-byte hashes under ignored `output/solution-v21n/`. It issues no execution receipt, changes no ownership, and performs no grant. Successful resolver and read-only planning evidence is not live security certification. Continuation still requires a separately reviewed execution boundary for the remaining operations.
