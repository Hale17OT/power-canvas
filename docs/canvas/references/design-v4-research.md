# V4 reference research — 21 September 2026

These are curated observations made during implementation. Generation does not fetch inspiration on demand. PowerCanvas implements its own bounded native contracts; no external source code, artwork, logos or app-specific copy was incorporated.

## PnP Power Apps Design Toolkit

Reviewed the [repository](https://github.com/pnp/powerapps-designtoolkit), its [MIT license](https://github.com/pnp/powerapps-designtoolkit/blob/main/LICENSE), component documentation and two actual source YAML files. The license identifies Microsoft 365 Community. This is technical reference work rather than source redistribution.

| Reference | Observation | PowerCanvas adaptation and boundary |
| --- | --- | --- |
| [Navigation drawer](https://github.com/pnp/powerapps-designtoolkit/blob/main/materialdesign%20components/docs/NavigationDrawer.md) | Data-driven destinations and controlled expansion | Explicit item/action/selected props; bounded labeled drawer and sidebar. No automatic screen ownership. |
| [Bottom navigation](https://github.com/pnp/powerapps-designtoolkit/blob/main/materialdesign%20components/docs/BottomNavigation.md) | A bounded set of mobile destinations complements larger navigation | Maximum five; frequent mobile switching favors it, larger hierarchies favor the drawer. |
| [Side sheet documentation](https://github.com/pnp/powerapps-designtoolkit/blob/main/materialdesign%20components/docs/SideSheet.md) and [source](https://github.com/pnp/powerapps-designtoolkit/blob/main/materialdesign%20components/sourcecode/Src/Components/cmp_MD_SideSheet.fx.yaml) | Supplementary right-hand context, caller content and close event | Native auto-layout surface, shared tokens and return-focus identity. HTML shadow markup and classic-control styling were not copied. |
| [Snackbar documentation](https://github.com/pnp/powerapps-designtoolkit/blob/main/materialdesign%20components/docs/Snackbar.md) and [source](https://github.com/pnp/powerapps-designtoolkit/blob/main/materialdesign%20components/sourcecode/Src/Components/cmp_MD_Snackbar.fx.yaml) | Message, optional action and dismissal lifecycle | Explicit dismiss action. Automatic timing, source timers and fixed dimensions were not carried over. |
| [Input frame](https://github.com/pnp/powerapps-designtoolkit/blob/main/materialdesign%20components/docs/GenericInputFrame.md) | Separate label, help, validation and value | Host-owned field contracts; validation must not be invented by styling. A complete input-frame factory is still pending. |
| [Dialog](https://github.com/pnp/powerapps-designtoolkit/blob/main/materialdesign%20components/docs/Dialog.md) | Bounded confirmation with deliberate action handling | Preserve the existing ConfirmationDialog; choose it for consequential confirmation rather than every edit. |
| [App bar](https://github.com/pnp/powerapps-designtoolkit/blob/main/materialdesign%20components/docs/AppBarTop.md) | Width-responsive title/action structure | RecordHeader and command regions use semantic slots and parent-relative layout. |

The toolkit supplies useful interaction contracts. Its control versions, fixed sizing and HTML-based visual effects are not proof of compatibility with the current PowerCanvas native dialect. Each translation still needs native validation.

## PowerAppsUI

Reviewed [PowerAppsUI](https://www.powerappsui.com/) and the [accordion-list example](https://www.powerappsui.com/components/accordion-list). The reusable pattern is a coherent hierarchy, token consistency and caller-owned data/events. V4 adopts an explicit grouped-list contract over flat prepared data, rather than silently constructing nested organization-wide galleries. The attempted design-system page was unavailable, so this pass does not claim an exhaustive review of that library. The earlier project reference study remains in this folder.

## Fluent, Radix, shadcn and Material

The [Fluent drawer guidance](https://fluent2.microsoft.design/components/web/react/core/drawer/usage) supports preserving task context when secondary information is shown. [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog) makes dismissal and focus behavior explicit. [shadcn Sheet](https://ui.shadcn.com/docs/components/base/sheet) separates heading, body, footer and side selection. V4 translates those concepts into native containers and explicit host events. Browser portals, focus traps, CSS blur and React components are not imported or claimed as Canvas capabilities.

The [Material navigation-bar reference](https://m3.material.io/components/navigation-bar/overview) was reachable only as a JavaScript shell in the research tool. Detailed Material guidance was therefore not used as verified evidence; PnP's accessible component documentation supported the bounded navigation policy.

## Dribbble and visual inspiration limits

[Power Apps search](https://dribbble.com/search/powerapps) and [document-management search](https://dribbble.com/search/document-management) exposed indexed descriptions, but individual visual inspection was not successfully completed. A direct browser attempt returned an empty document. Operations/mobile searches were also unavailable. No particular shot is claimed as reviewed, cloned or licensed for reuse. Curated visual reference cards from individual shots remain a gap.

Independent design decisions used in the benchmark are explicit: operational work prioritizes row scanning; analytical work promotes a lead measure and evidence; document work gives reading context space; mobile entry separates scrolling fields from reachable commands. The grayscale comparison checks structure rather than stylistic resemblance to a reference site.
