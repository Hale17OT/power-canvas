# Design Engine V4.3 support matrix

Recorded 22 September 2026. **41 families / 65 variants / 6 native validated / 6 preview validated / 0 production benchmarked.** Evidence is exact-variant and instance-scoped. A dash means no complete accepted native evidence, not unsupported or failed compilation. All entries are implemented locally.

| Component.variant | Native compile | Runtime | Mobile | Dark | A11y | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| TopNavigation.standard | — | — | — | — | — | IMPLEMENTED |
| TopNavigation.underlined | — | — | — | — | — | IMPLEMENTED |
| BottomNavigation.standard | — | — | — | — | — | IMPLEMENTED |
| BottomNavigation.compact | — | — | — | — | — | IMPLEMENTED |
| NavigationDrawer.standard | — | — | — | — | — | IMPLEMENTED |
| NavigationDrawer.compact | — | — | — | — | — | IMPLEMENTED |
| CompactSidebar.standard | — | — | — | — | — | IMPLEMENTED |
| CompactSidebar.grouped | — | — | — | — | — | IMPLEMENTED |
| SideSheet.standard | — | — | — | — | — | IMPLEMENTED |
| SideSheet.compact | — | — | — | — | — | IMPLEMENTED |
| BottomSheet.standard | — | — | — | — | — | IMPLEMENTED |
| BottomSheet.compact | — | — | — | — | — | IMPLEMENTED |
| FullScreenTask.standard | — | — | — | — | — | IMPLEMENTED |
| FullScreenTask.compact | — | — | — | — | — | IMPLEMENTED |
| ContextPanel.standard | — | — | — | — | — | IMPLEMENTED |
| ContextPanel.compact | — | — | — | — | — | IMPLEMENTED |
| OverflowMenu.standard | — | — | — | — | — | IMPLEMENTED |
| BulkActionBar.standard | — | — | — | — | — | IMPLEMENTED |
| FilterChips.standard | — | — | — | — | — | IMPLEMENTED |
| FilterPanel.inline | — | — | — | — | — | IMPLEMENTED |
| FilterPanel.panel | — | — | — | — | — | IMPLEMENTED |
| RichList.compact | — | — | — | — | — | IMPLEMENTED |
| RichList.comfortable | — | — | — | — | — | IMPLEMENTED |
| RichList.cards | — | — | — | — | — | IMPLEMENTED |
| GroupedList.compact | — | — | — | — | — | IMPLEMENTED |
| GroupedList.comfortable | — | — | — | — | — | IMPLEMENTED |
| GroupedList.cards | — | — | — | — | — | IMPLEMENTED |
| RecordHeader.compact | — | — | — | — | — | IMPLEMENTED |
| RecordHeader.standard | PASS | PASS | PASS | PASS | Scoped PASS | NATIVE_VALIDATED |
| RecordHeader.editorial | — | — | — | — | — | IMPLEMENTED |
| RecordHeader.mobile | — | — | — | — | — | IMPLEMENTED |
| SectionHeader.compact | — | — | — | — | — | IMPLEMENTED |
| SectionHeader.standard | PASS | PASS | PASS | PASS | Scoped PASS | NATIVE_VALIDATED |
| SectionHeader.numbered | — | — | — | — | — | IMPLEMENTED |
| Skeleton.content | — | — | — | — | — | IMPLEMENTED |
| Skeleton.table | — | — | — | — | — | IMPLEMENTED |
| Snackbar.inline | — | — | — | — | — | IMPLEMENTED |
| Snackbar.floating | — | — | — | — | — | IMPLEMENTED |
| TaskForm.single-column | — | — | — | — | — | IMPLEMENTED |
| TaskForm.two-column | — | — | — | — | — | IMPLEMENTED |
| TaskForm.sectioned | — | — | — | — | — | IMPLEMENTED |
| TaskForm.wizard | — | — | — | — | — | IMPLEMENTED |
| PageHeader.standard | PASS | PASS | PASS | PASS | Scoped PASS | NATIVE_VALIDATED |
| KpiCard.standard | — | — | — | — | — | IMPLEMENTED |
| Sidebar.standard | — | — | — | — | — | IMPLEMENTED |
| CommandBar.standard | — | — | — | — | — | IMPLEMENTED |
| FilterBar.standard | — | — | — | — | — | IMPLEMENTED |
| SearchBox.standard | — | — | — | — | — | IMPLEMENTED |
| StatusBadge.standard | — | — | — | — | — | IMPLEMENTED |
| StatusBadge.quiet | — | — | — | — | — | IMPLEMENTED |
| UserAvatar.standard | — | — | — | — | — | IMPLEMENTED |
| DataTable.standard | — | — | — | — | — | IMPLEMENTED |
| ActivityTimeline.standard | — | — | — | — | — | IMPLEMENTED |
| ConfirmationDialog.standard | — | — | — | — | — | IMPLEMENTED |
| MobileBottomActions.standard | — | — | — | — | — | IMPLEMENTED |
| MobileTaskForm.standard | — | — | — | — | — | IMPLEMENTED |
| EditDialog.standard | — | — | — | — | — | IMPLEMENTED |
| FormSection.standard | — | — | — | — | — | IMPLEMENTED |
| EmptyState.standard | PASS | PASS | PASS | PASS | Scoped PASS | NATIVE_VALIDATED |
| LoadingState.standard | PASS | PASS | PASS | PASS | Scoped PASS | NATIVE_VALIDATED |
| ErrorState.standard | — | — | — | — | — | IMPLEMENTED |
| Tabs.standard | — | — | — | — | — | IMPLEMENTED |
| Stepper.standard | — | — | — | — | — | IMPLEMENTED |
| ChartCard.standard | — | — | — | — | — | IMPLEMENTED |
| DetailPanel.standard | PASS | PASS | PASS | PASS | Scoped PASS | NATIVE_VALIDATED |

Scoped PASS means the component screen had no finding. One pre-existing Screen1 readable-name suggestion remains on the protected business screen. No certification covers full assistive-technology use. LoadingState covers its visual state, not backend latency; DetailPanel covers the tested static text child only. Known control versions were not exposed by official discovery; certificates explicitly retain that limitation.

All 59 remaining variants are excluded from production selection. The entire app cannot yet be generated from this certified subset. Navigation, data, overlay, wizard and command/filter factories still need their applicable source-bound runtime suites. Existing Complaint Desk use is not current-factory lineage proof.

See [execution report](design-v43-report.md) for the 16-field matrix, lifecycle states, tests and actual blockers.
