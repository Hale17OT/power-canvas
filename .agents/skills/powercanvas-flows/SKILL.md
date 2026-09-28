---
name: powercanvas-flows
description: Plan, compile and validate Power Automate primitives and business workflow recipes through PowerCanvas. Use for approvals, notifications, documents, reminders, SharePoint/Dataverse operations, child flows and deployment planning. Do not use for Canvas-only layout changes or handwritten raw flow JSON.
metadata:
  version: "1.0.0"
  agent-contract: "1.0"
---

# Flow workflow

Read root capability/risk discovery, then the selected project's typed flow resources. Understand the requirement → advise → choose primitive or recipe → validate connector/template/child dependencies → compile → plan → explain effects → apply/activate only through current gates. [Flow commands](references/flows.md) maps these steps.

Use existing typed AST, action registry and recipe expansion. Never handwrite Power Automate clientdata outside the compiler. Recipes compose validated actions and must expose their primitive graph. Create approval, wait, and start-and-wait remain distinct; long-running and unknown-outcome semantics matter.

An automation capability does not authorize adding product behavior. Require an actual business requirement and explicit destinations/approvers/templates. External Word files and deployment connection values are not automatically solution-contained. Respect controlledWrite, ownership, collision, source, environment and activation checks.

Preserve the Canvas primary save path when adding post-save automation; use typed bindings. No real approval/email/document/business write is needed to validate a skill. Compile-only or disabled deploy/readback evidence must stay labeled as such. Report schema/compile/deploy/live support separately; never claim exactly-once execution or persona authorization without proof.

For SharePoint-backed solutions, load [SharePoint infrastructure](../powercanvas/references/sharepoint-v1.md). Use the unified symbolic identity and field contract; unresolved IDs, native registration and live access remain explicit prerequisites. Do not provision infrastructure through business-row/file actions.
