# PowerCanvas

PowerCanvas is a TypeScript CLI and compiler toolkit for validating, planning, and safely delivering Power Platform projects. It turns declarative project files into explainable plans while preserving strict schema checks, ownership boundaries, collision protection, and explicit deployment gates.

The current implementation includes:

- strict project schemas and canonical `powercanvas.yaml` configuration;
- Canvas design-system and native-control validation;
- typed Power Automate connector primitives and workflow recipes;
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

## Repository layout

- `src/` — compiler, CLI, connectors, recipes, Canvas, and safety code.
- `schemas/` — generated JSON Schemas for the canonical API.
- `examples/` — source fixtures and safe, non-live examples.
- `tests/` — unit and integration tests; browser snapshots are fixtures.
- `docs/` — architecture, workflow, Canvas, and ALM documentation.
- `scripts/` — deterministic local checks and report generation.

Runtime output, authentication material, local experiment state, generated reports, and other machine-local artifacts are ignored by Git. No tenant mutation is required for the local quality gates.

## License

This repository currently has no `LICENSE` file. Add an explicit license before publishing or distributing it.
