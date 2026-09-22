# Capability negotiation

V1 skills require `version --json` to return `name: PowerCanvas`, `agentContractVersion: 1.0` and skill compatibility major 1. CLI version alone does not prove agent-contract compatibility. `scripts/discover.mjs` under the root skill validates this contract and returns structured version/capability/command data; pass explicit CLI and project paths.

`capabilities --json` reads executable registries, action providers and recipe declarations. Native certificates are **NOT_CHECKED** unless `--certifications <selection-manifest>` is supplied and existing evidence validation passes. `--authoring-evidence <diagnostic-directory>` reads existing artifacts only; expired/incomplete artifacts cannot prove a healthy current session. No live connections occur during capability discovery.

Use `agent commands --json` for actual command names, arguments, options and conservative maximum risk. Resolve option-dependent behavior from the command notes/help: source sync may use MCP or PAC, and doctor may be local or live. Unknown commands fail discovery until classified. Never manufacture commands such as `canvas apply` or `flows apply --force`.

Use `components variants <name>`, `patterns info <name>` and evidence-backed `canvas production-core` for detailed maturity. Registries describe implementation; certificates describe verified variants under explicit capability/evidence assumptions. All five provider health states are meaningful: HEALTHY, DEGRADED_READ_ONLY, SESSION_REJECTED, AUTHORING_UNAVAILABLE, RECOVERY_REQUIRED. Discovery does not grant write authorization even when artifacts are fresh.

If an older CLI lacks negotiation, use `--version`/`--help` to diagnose compatibility, report the missing contract and continue only with commands whose availability/risk can be verified. Do not silently run planned commands against an older installation.
