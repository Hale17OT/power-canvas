# PowerCanvas

PowerCanvas is a TypeScript CLI and compiler toolkit for validating, planning, and safely delivering Power Platform projects. It turns declarative project files into explainable plans while preserving strict schema checks, ownership boundaries, collision protection, and explicit deployment gates.

The current implementation includes:

- strict project schemas and canonical `powercanvas.yaml` configuration;
- Canvas design-system and native-control validation;
- typed Power Automate connector primitives and workflow recipes;
- a [Unified Solution Compiler](docs/solution-v2.md) for requirement traceability, Dataverse/model-driven resources, persona security, dependency graphs and gated subsystem orchestration;
- plan/apply separation, risk classification, ownership, collision checks, and solution export verification;
- deterministic tests for schema, compiler, Canvas, flow, recipe, and safety behavior.

Some integrations remain intentionally bounded. Tenant deployment requires explicit environment and connection configuration. Approval, document, PDF, persona, and live external-side-effect evidence is reported separately from compile-time support and is never implied by a passing local test.

## Quick start

```powershell
npm ci
npm run check
npm run schema
node dist/cli/index.js --help
```

Use `powercanvas` as the canonical executable and `powercanvas.yaml` as the canonical project file. The legacy `powerforge` executable remains a compatibility alias and emits a deprecation warning. A legacy `powerforge.yaml` file is accepted only as a migration fallback and also emits a warning; new projects should use the canonical name.

For a local recipe plan, use an example project:

```powershell
node dist/cli/index.js validate --project examples/flows-v3 --json --non-interactive
```

## Agent usage

After `npm ci` and `npm run build`, verify `node dist/cli/index.js version --json` and `node dist/cli/index.js capabilities --json`. Codex discovers the five repository skills in `.agents/skills/`. Start with `$powercanvas`, or ask naturally:

- “Use PowerCanvas to redesign this existing Canvas App for mobile and desktop while preserving behavior.”
- “Use PowerCanvas Taste to explore three design directions for this operations app.”
- “Use PowerCanvas to plan a manager approval flow after this Dataverse status change.”
- “Use PowerCanvas to diagnose why Canvas authoring is unavailable using existing evidence.”

The skill routes work; the CLI still enforces schemas, maturity, ownership and plan/apply safety. Offline inspection, planning and compilation work without Canvas MCP. Native authoring needs Microsoft's separately configured provider. Unified solution V2 supports bounded Dataverse-native delivery through the existing providers; live validation and production readiness remain separate.

`npm run agent:package` generates the local [plugin](plugins/powercanvas/README.md) from the same skills; `npm run agent:eval` runs deterministic routing/safety evaluations. Claude can load that plugin with `claude --plugin-dir ./plugins/powercanvas`. No tenant changes or global plugin installation are part of packaging. See [agent architecture and resume guide](docs/agent-v1.md).

## Repository layout

- `src/` — compiler, CLI, connectors, recipes, Canvas, and safety code.
- `schemas/` — generated JSON Schemas for the canonical API.
- `examples/` — source fixtures and safe, non-live examples.
- `tests/` — unit and integration tests; browser snapshots are fixtures.
- `docs/` — architecture, workflow, Canvas, and ALM documentation.
- `scripts/` — deterministic local checks and report generation.

Runtime output, authentication material, local experiment state, generated reports, and other machine-local artifacts are ignored by Git. No tenant mutation is required for the local quality gates.

Public examples use synthetic tenant/app identities. See [public repository hygiene](docs/public-repository.md) for local authoring configuration, excluded evidence and history-cleanup notes.

## License

This repository currently has no `LICENSE` file. Add an explicit license before publishing or distributing it.
