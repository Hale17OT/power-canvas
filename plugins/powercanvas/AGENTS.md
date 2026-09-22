# Plugin maintenance

Edit skills in the repository's `.agents/skills/`, then run `node scripts/package-agent-plugin.mjs` from the repository root. Generated skill copies must match their digest manifest. Do not embed app/tenant identities, credentials or Microsoft binaries. The CLI/core is required; native Canvas MCP is conditional on authoring work. No plugin instruction bypasses existing plan/apply or authorization gates.
