# Architecture and execution ownership

PowerCanvas already has Canvas generation/Taste, composition and business-binding IR, source comparison/migration, component certification, typed flow primitives/recipes, dependency/portability planning and bounded Dataverse/model-driven delivery. Query the CLI for exact current availability.

Plan broad requests with the core Unified Solution Compiler. Describe stable requirements in a `powercanvas.solution/v1` document, using `mode: intent` for structured entities/experiences/typed recipes or `mode: explicit` for existing projects. Intent resolves into the same existing project schema. V2 Dataverse/model-driven and persona support is described in [native solution delivery](solution-v2.md). Unstructured prose needs explicit reviewable decomposition; do not pretend the CLI parses arbitrary prose.

Run `solution plan --spec <file> --out <project-relative-output.json>`, then `solution inspect`, `solution graph`, `solution audit` and `solution critique`, each with `--plan <file>`. See `docs/solution-v1.md` for the contract. Audit is a deterministic gate; critique is architecture guidance. Inspect requirements, shared types, resource states, traceability, dependencies, ownership and external prerequisites before subsystem work.

`solution apply --plan <file> --spec <file> --evidence <file> --env <alias> --out <directory>` delegates to existing Dataverse/Flow executors after hash and fresh target preflight. Flow stages also require `--flow-evidence`. There is no unified Canvas write, automatic activation, deletion, adoption or import adapter. Offline plans do not authorize writes. Unknown outcomes stop without automatic retry.

External assets, security personas and import readiness remain explicit and unproven. The Canvas transport blocker affects native apply/certification, not offline architecture. Do not add product automations merely to demonstrate compiler capabilities.

Resolve project intent in `powercanvas.yaml`, PRODUCT.md and DESIGN.md. Determine the existing app binding and the relevant connection/environment configuration from the selected project, never from example tenant IDs. Separate product requirements from compiler capability development.

The root orchestrates bounded specialist work. When a host supports delegation, use the optional briefs in the plugin's `agents/` directory; otherwise perform those roles sequentially. Planning/review may run offline in parallel. Only one worker may operate a given live Studio session, and all workers inherit the same authorization limits.

For detailed implementation, resolve repository-relative paths from the PowerCanvas checkout: `src/canvas/`, `src/flows/`, `docs/canvas/`, `docs/flows.md`, `docs/flows-v2.md` and `docs/flows-v3.md`. These are existing documentation/code, not copies embedded in every skill.
