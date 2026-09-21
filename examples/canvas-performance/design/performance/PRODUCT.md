# Service performance briefing

Service leaders periodically decide which priority group merits investigation. This is a read-only briefing and evidence inspection task, using the existing PowerCanvas experiment Complaints source. It deliberately has no operational editing, ticket creation, or made-up SLA/trend calculations. Priority does not mean resolution state.

```powercanvas-product
name: Service performance briefing
users: [Service leaders reviewing the current accessible workload]
jobs:
  - Understand the share of accessible complaints marked High priority
  - Compare priority groups and inspect the records contributing to a measure
  - Read supporting record context and return to the briefing
frequency: occasional
purpose: executive
devices: [desktop, tablet, mobile]
criticalInformation: [Decision question, High priority share and denominator, Priority comparison, Contributing records, Data scope and limitations]
accessibility: [Named drilldown actions, Text equivalents for every bar, Touch targets at least 44 pixels, Logical heading and reading order]
constraints:
  - Existing typed Complaints Dataverse contract; no new business tables
  - Default environment is non-disposable; dedicated unmanaged experiment solution
  - Read-only business data; no approve, edit or save commands
  - Snapshot is not SLA compliance, resolution state or historical trend
  - Large-volume aggregation remains uncertified
  - Visual fixtures are nonpersistent and must be labeled separately from live evidence
```
