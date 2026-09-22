# Public repository hygiene

Commit source, tests, synthetic visual baselines, schemas, reusable examples and documentation. Keep account configuration, signed-in browser captures, authentication caches, downloaded app/solution source and execution evidence local.

`.gitignore` excludes local state (`.powercanvas/`, legacy `.powerforge/`), generated output, environment files, private keys, authentication state, HAR captures, native tenant screenshots and historical tenant-specific probe/recovery scripts. Adding an ignore rule does not remove a file already tracked by Git; the publication cleanup removes those private artifacts from the index while retaining them on disk.

## Public examples and live helpers

The native complaint and performance example bindings use synthetic app, environment and workflow IDs. They are compile/test fixtures, not deployable identities. Public historical reports redact account and resource identities; referenced private evidence is intentionally absent from a public clone. Historical evidence claims do not imply that those tests can be repeated without configuration and authorization.

For live work, keep a separately configured project and bindings under ignored local storage. Do not overwrite the public fixtures with tenant identities. The reusable authoring helpers read `.powercanvas/authoring.local.json`:

```json
{
  "bindings": ".powercanvas/native-bindings.local.json",
  "loginHint": "operator@example.com",
  "dataverseUrl": "https://your-org.crm4.dynamics.com",
  "appName": "your_owned_app_unique_name"
}
```

The referenced bindings must satisfy the existing native binding schema. Build the CLI first with `npm run build`. Authentication remains in the existing protected sign-in/cache mechanisms; this configuration must not contain passwords, tokens or client secrets. Existing plan, source-hash, ownership and preview gates still apply.

The publication cleanup preserved private originals under `.powercanvas/publication-backup-*/`, with a file manifest. On the original workstation, the local authoring configuration points at the preserved original bindings. Neither that backup nor its identities belongs in Git.

## Review before publication

Inspect staged files with `git diff --cached --stat` and `git diff --cached`. Confirm `git ls-files -ci --exclude-standard` is empty. Review new fixtures and binaries explicitly; ignore rules cannot detect sensitive contents inside an otherwise valid source file. Do not force-add ignored evidence or credentials.

On 22 September 2026, the original baseline was replaced with sanitized root commit `e315e21` and `origin/main` was updated using an exact force-with-lease. The removed tenant captures and identifiers are absent from that branch's reachable history. Newer implementation work remains uncommitted. The original history and index are retained only in ignored `.powercanvas/history-cleanup-*/` recovery files and local Git recovery data; do not publish these backups.

The rewritten baseline passes its portable quality gates without private experiment files. Seven historical flow evidence assertions require `POWERCANVAS_PRIVATE_EVIDENCE=1` and the original local artifacts; see [local experiment evidence](../experiments/README.md).

Rewriting a branch does not erase previously downloaded copies or guarantee removal of host-side cached/dangling commits. Collaborators with the old history should use a fresh clone instead of merging the old baseline back into the cleaned branch.
