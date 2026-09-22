# Canvas command workflow

Use `--json` and `--help`/command inventory for exact current arguments. Bind to the selected project with `--project`.

| Stage | Existing CLI commands / artifacts |
| --- | --- |
| Intent and identity | `validate`, `canvas application-plan --app <key>`; PRODUCT.md/DESIGN.md and reviewed binding |
| Source | `canvas source sync` with explicit `--provider authoringMcp` or `pacDownload`; distinct fresh outputs |
| Independent agreement | `canvas source compare --authoring <dir> --pac <dir> --out <file>` |
| Retain current behavior | `canvas composition-lower --authoring <dir> --pac <dir> --out <dir>` |
| Generate local candidate | `canvas native --app <key> --bindings <file> --out <dir>` or `canvas component --spec <file> --out <dir>` |
| Validate migration | `taste migration-plan --before <dir> --after <dir> --out <dir>`; `canvas migration-validate --authoring <dir> --pac <dir> --candidate <dir> --out <file>` |
| Static/runtime gate | `taste audit`, `taste preflight`; exact-source checker/runtime evidence is separate |

No general `canvas apply` CLI exists. Native preview uses the existing guarded `AuthoringMcpProvider.preview` or certification transaction via the supported official transport, with source-bound review and independent witness. Do not invent an unguarded wrapper or call compile merely because a local candidate exists. Native write/cleanup mechanisms are documented in repository `docs/canvas/design-v42.md`, `design-v44.md` and `design-v45.md`.

Never replace SubmitForm, patch targets, validation, unsaved handling, flow contracts, typed choice defaults or focus restoration as a cosmetic edit. Intentional behavior changes require the existing exact approved delta contract. A saved baseline that lacks an unsaved approved change is not the new live truth. Reconcile before editing.
