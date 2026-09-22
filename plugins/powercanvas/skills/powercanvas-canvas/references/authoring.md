# Microsoft owns the native transport

Use Microsoft's installed `canvas-app`, `configure-canvas-mcp` and `add-data-source` skills when their corresponding work is needed. Native transport is its `canvas-authoring` MCP. PowerCanvas adds source/plan/identity/preservation/certification checks around it, not another protocol.

If not configured, route to the official [configure-canvas-mcp skill](https://github.com/microsoft/power-platform-skills/tree/main/plugins/canvas-apps/skills/configure-canvas-mcp) and [external authoring documentation](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/create-canvas-external-tools). Follow the currently installed official workflow using the complete current Studio URL. Do not recreate setup, bundle Microsoft binaries, infer hidden cluster endpoints, or delete global credentials.

Canvas MCP and its .NET runtime are conditional dependencies only for native authoring; PAC is optional for independent saved-source acquisition. Offline design/flow compilation remains available without them. The V1 plugin deliberately does not auto-start or auto-install a server. Codex dependency metadata has no optional-tool flag in the validated local schema, so conditional dependencies are documented rather than represented as mandatory install-time tools.

Current health should come from PowerCanvas diagnostic artifacts, not historical report prose. Confirm editor/coauthoring state, identity, source, checkers and required reconnect stability before native mutation. If unavailable, hand off to Debug and preserve source. A previous successful connection is not current authority.
