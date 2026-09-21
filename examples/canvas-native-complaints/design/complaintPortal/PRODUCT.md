# Complaint Desk

Agents find and triage complaints throughout the day. Desktop is the primary workplace; tablet and mobile support occasional record review and bounded edits. Managers can inspect the current priority distribution. The app does not claim to provide a complete audit trail or certified large-data aggregation.

The safe task sequence is find, select, inspect, edit, review, provide a change reason, and explicitly save. Cancellation must retain or discard unsaved input without modifying the saved record. Existing test records are sufficient for design validation.

## Product contract

```powercanvas-product
name: Complaint Desk
users:
  - Complaint agents performing daily triage
  - Managers reviewing accessible workload
jobs:
  - Find complaints by title prefix and priority
  - Inspect the selected complaint and record timestamps
  - Edit typed fields, review changes and save with a reason
  - Cancel safely without losing saved data
frequency: daily
purpose: operations
devices: [desktop, tablet, mobile]
criticalInformation: [Complaint title, Priority, Description, Resolution notes, Created and modified dates, Save state]
accessibility:
  - Keyboard reachable named actions and restored focus
  - Mobile targets at least 44 pixels
  - Status text remains available without color
  - Readable text in light and dark themes
constraints:
  - Dataverse bindings and typed choice values are immutable during design refinement
  - Preserve required reason and review before SubmitForm
  - Default environment is non-disposable; only the owned experiment app may be changed
  - No intentional business data creation, update or deletion during visual validation
  - Record timestamps are not a complete audit history
  - Large-data aggregation and separate-user permissions remain separate validation gates
```
