# Codex adapter

Build the checkout with `npm ci` and `npm run build`. Repository skills live under `.agents/skills/`; Codex scans that location from the working directory through the repository root. Invoke `$powercanvas` explicitly, or ask a clear PowerCanvas task for implicit routing. If discovery has not refreshed, start a fresh session. The layout is documented in [official skill guidance](https://learn.chatgpt.com/docs/build-skills).

`agents/openai.yaml` supplies UI descriptions and implicit invocation. It does not grant tenant authorization. The generated `.codex-plugin/plugin.json` is validated separately; choose repository discovery or plugin installation to avoid duplicate names. No personal marketplace, app settings or global installation is changed by the repository packaging command. The optional specialist Markdown briefs are portable role descriptions; Codex V1 packaging does not automatically register them as host subagents.

Use the installed Microsoft Canvas skills/MCP only when native authoring is requested and configured. They are not required to inspect or compile offline.
