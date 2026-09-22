# PowerCanvas plugin V1

Five skills provide an agent interface over PowerCanvas's existing deterministic compiler: `powercanvas`, `powercanvas-canvas`, `powercanvas-taste`, `powercanvas-flows`, `powercanvas-debug`.

The authoritative content is `.agents/skills/` in the source repository. Run `node scripts/package-agent-plugin.mjs` to regenerate this plugin's skill mirror, or pass `--check` to detect drift. Both host manifests reference the same content. The optional `agents/` briefs bound planner, Canvas, flow and reviewer roles; Claude discovers these, while Codex may use them as manual role instructions.

Require a built PowerCanvas CLI with agent contract 1.0 and Node >=22.18.0. The package does not bundle the CLI, .NET, PAC or Microsoft's MCP binary. Native editing conditionally requires the separately configured Microsoft Canvas plugin/server; offline planning does not. See `skills/powercanvas/references/hosts/` for host-specific loading instructions.

For this repository, use Codex's `.agents/skills/` discovery and `$powercanvas`; installing this same plugin as well may show duplicate skill names. For Claude local development, use `claude --plugin-dir ./plugins/powercanvas`. No global marketplace or installation is performed by packaging. Cross-host runtime execution still needs host validation.

Example requests: redesign an existing Canvas App for mobile/desktop without changing behavior; explore three operations-app design directions; plan manager approval after a status transition; diagnose an authoring blocker using existing evidence.

The repository has no license grant yet. This scaffold is for local development; settle licensing before public redistribution. Unified solution compilation and a PowerCanvas MCP server remain future capabilities.
