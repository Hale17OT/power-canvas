# ADR 0005: Semantic PFDS before native Canvas authoring

Status: accepted, 18 September 2026.

Extend the existing TypeScript package, strict configuration loader, Zod schemas, diagnostics, CLI, capability registry and tests. Canvas intent lives under optional `canvasApps` in the same project; `apps` retains its existing model-driven meaning. This avoids changing existing normalized project hashes or passing Canvas screens into the model-driven provider. A future versioned migration can unify the discriminated app collection.

The pipeline is project intent → dashboard/list/custom pattern expansion → versioned PFDS tree → normalized props, stable identities, theme, responsive variants and typed Power Fx templates → replaceable live-authoring adapter. The semantic IR is neither a Canvas package nor native authoring YAML. Native control versions and actual data-source identifiers must come from live discovery.

All 17 DS1 contracts are experimental. Registry entries expose schemas, child policy, events, states, control requirements, introduced version and capability flags. `stableOnly` fails closed until native runtime evidence warrants graduation. Arbitrary formulas, free coordinates and unknown properties are excluded. Unsupported patterns are errors, not silently approximated.

Component identity derives from project UUID, app key and semantic key path, not position, text or theme. Sibling keys are unique ignoring case. Reordering preserves IDs; moving across a parent changes identity and requires a reviewed migration. Three-way property plans preserve unrelated manual changes and block conflicting edits, deletions, missing owned controls and unowned collisions. These merge semantics are tested locally; they are not yet a remotely executable native synchronization engine.

Reference libraries inform categories only. PFDS code and styling are original. PowerLibs redistribution/tooling restrictions prohibit incorporating its components. PowerApps UI code reuse would require per-component license checks and attribution. See [research](../canvas/research.md).
