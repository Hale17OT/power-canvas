# IR v1alpha1

`src/ir/schema.ts` is the structural authority. `npm run schema` produces `schemas/powercanvas.v1alpha1.schema.json` for editor completion. `src/ir/validate.ts` adds references, identities, prefixes, primary-name and choice constraints that JSON Schema alone cannot express. Unknown properties are errors at every object level.

## Project and solution

`apiVersion` is exactly `powercanvas.dev/v1alpha1`. `project.id` is an immutable UUID generated once by init and retained across clones; `project.name` is a kebab-case human alias. Solution unique name, publisher unique name/prefix/option-value prefix, display name and four-part version are explicit. Renaming a display label does not change identity.

Tables, columns, relationships, apps, forms, views and roles have stable dictionary keys. A resource key is `pf:<project UUID>:<provider>:<kind>:<stable path>`. Schema/logical names and target GUIDs are separate. Moving/renaming a dictionary key is not a resource rename: the future planner must require an explicit migration/adoption decision. `constructor`, `prototype`, and `__proto__` are rejected as keys.

## Dataverse

Tables declare schema/display/plural names, `userOrTeam` or `organization` ownership, a primary-name column reference, auditing, and columns. Column variants: `text`, `multilineText`, `integer`, `decimal`, `boolean`, `dateTime`, and `choice`. All have explicit schema/display names and requiredness (`none` or `application`, default `none`). Text lengths, decimal precision/ranges and date-time behavior are represented explicitly. Primary names reference a text column no longer than 850 characters.

Choices carry stable, explicit numeric values within the publisher's allocated option range; duplicates and defaults outside the option set fail. Reordering labels or choices never changes their numeric identities. No option allocator runs during validation.

Relationships are bounded one-to-many definitions: `fromTable` is the referencing table, `toTable` the referenced table; the relationship owns its lookup's stable key/schema/display name. Only restrictive delete and noncascading behavior is modeled initially. Ordinary columns cannot collide with a relationship lookup. Circular table relationships are valid; table creation precedes relationship creation.

## Model-driven and security intent

Optional `apps` describe model-driven unique/display names, included table keys, forms, views and navigation. References can use declared columns, relationship lookup keys, and a small explicit set of system columns in views. Main forms reference editable declared fields. Views can filter active rows and declare ordered columns/sorts. Arrays retain meaningful UI order.

Optional `security.roles` declare table privileges at user/business-unit/parent-child/organization depth. App access maps app keys to role keys. Assignments to tenant identities are intentionally absent. The schema does not claim a role is sufficient for app use: cumulative privilege, Append/AppendTo, underlying base privileges and effective access require live tests.

All managed resources have `lifecycle.deletionPolicy: retain` as the only initial policy. Deletion, implicit rename/replacement, calculated/formula/rollup expressions, currency, alternate keys, flows, Canvas, SharePoint and raw JSON/XML escape hatches are unavailable.

## Parsing and migration

UTF-8 input is capped at 1 MiB. One YAML document, duplicate-key rejection, no custom tags, no alias expansion, and a bounded tree depth protect the local parser. Diagnostics contain paths and safe messages, not raw input values/snippets. Unsupported versions return an actionable error; a version-dispatch boundary exists, but no invented alpha2 migrator rewrites a project.

`validate` is offline and read-only. It reports specification validity plus unavailable provider warnings. `validate --require-executable` fails while requested adapters are missing. Validation does not establish authentication, licensing, platform acceptance, current tenant state or deployment readiness.
