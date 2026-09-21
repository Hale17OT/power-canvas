# Isolated Default-environment experiment

This schema-only project derives from the complaint-management template with a separate stable project ID. It uses dedicated unmanaged solution `pfx_PowerForgeExperiment`, publisher `PowerForgeExperimentPublisher`, prefix `pfx`, and `pfx_Experiment*` schema names. Stable Priority values are 731420000 (Low), 731420001 (Normal), and 731420002 (High).

The user explicitly authorized this run in a non-disposable Default environment. No pre-existing tenant resources may be modified, adopted or deleted. All target names are checked before apply; collisions block. Destructive tests are planner-only and must make zero remote mutations. No managed upgrade/removal or UAT/production ALM claims are permitted.

Environment bindings, live plans, observations, ownership and journals are local ignored `.powercanvas` data. Do not copy or reset ownership to bypass a blocker. See the [live report](../../experiments/dataverse-generation/report-2026-09-17.md) for outcomes and manual interventions.
