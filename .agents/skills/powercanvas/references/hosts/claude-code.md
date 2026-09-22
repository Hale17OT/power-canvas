# Claude Code and other hosts

The same SKILL.md frontmatter and content follow the [Agent Skills format](https://agentskills.io/specification). The plugin includes a minimal `.claude-plugin/plugin.json` and standard `skills/` and `agents/` directories; no fork of the core instructions is needed. Test locally with `claude --plugin-dir ./plugins/powercanvas`, then use `/powercanvas:powercanvas`. See [Claude plugin reference](https://code.claude.com/docs/en/plugins-reference).

Alternatively, an operator can place the same five skill folders in `.claude/skills/`, preserving sibling paths. Do not install both routes simultaneously. Repository development keeps `.agents/skills/` authoritative and generates plugin copies; do not manually edit the mirror. `agents/openai.yaml` is Codex UI metadata, not a dependency on Codex execution.

CLI execution requires Node and the built PowerCanvas checkout or compatible installed CLI. Pass its absolute entry path to the discovery script. ChatGPT and other Agent Skills hosts need filesystem/process access for execution; loading prose alone does not grant those capabilities. Hosts without local tools can reason over supplied plans but must report execution unavailable. Installation/discovery and live authoring are separate support levels; local tests do not certify every host runtime.
