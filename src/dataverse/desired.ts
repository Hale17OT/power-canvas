import type { Project, Column } from '../ir/schema.js';
import { resourceId } from '../ir/identity.js';
import type { JsonValue } from '../core/json.js';
import type { Observation, Ownership } from '../state/models.js';

export const DATAVERSE_VERSION = '0.2.0-experimental.1';
export type Resource = Observation['resources'][number];
export interface DesiredResource { resourceId: string; provider?: string; kind: string; schemaName: string; properties: Record<string, JsonValue>; dependencies: string[] }

export function columnProperties(column: Column): Record<string, JsonValue> {
  if (column.type === 'choice') return { schemaName: column.schemaName, displayName: column.displayName, required: column.required, type: column.type,
    choices: [...column.choices].sort((a, b) => a.value - b.value), default: column.default ?? null };
  const { lifecycle: _lifecycle, ...properties } = column;
  void _lifecycle;
  return properties;
}
export function desiredResources(project: Project): DesiredResource[] {
  const id = (kind: string, ...path: string[]) => resourceId(project.project.id, 'dataverse', kind, path);
  const publisher = id('publisher', 'publisher'); const solution = id('solution', 'solution');
  const result: DesiredResource[] = [
    { resourceId: publisher, kind: 'publisher', schemaName: project.solution.publisher.uniqueName, dependencies: [],
      properties: { uniqueName: project.solution.publisher.uniqueName, prefix: project.solution.publisher.prefix, optionValuePrefix: project.solution.publisher.optionValuePrefix } },
    { resourceId: solution, kind: 'solution', schemaName: project.solution.uniqueName, dependencies: [publisher],
      properties: { uniqueName: project.solution.uniqueName, displayName: project.solution.displayName, version: project.solution.version, publisherUniqueName: project.solution.publisher.uniqueName } },
  ];
  for (const [key, table] of Object.entries(project.dataverse.tables).sort(([a], [b]) => a.localeCompare(b))) {
    const tableId = id('table', key);
    result.push({ resourceId: tableId, kind: 'table', schemaName: table.schemaName, dependencies: [solution],
      properties: { schemaName: table.schemaName, displayName: table.displayName, pluralName: table.pluralName, ownership: table.ownership,
        auditing: table.auditing, primaryColumn: columnProperties(table.columns[table.primaryName]!), solutionMember: true } });
    for (const [columnKey, column] of Object.entries(table.columns).sort(([a], [b]) => a.localeCompare(b))) {
      if (columnKey === table.primaryName) continue;
      result.push({ resourceId: id('column', key, columnKey), kind: 'column', schemaName: column.schemaName, dependencies: [tableId],
        properties: { ...columnProperties(column), tableSchemaName: table.schemaName, solutionMember: true } });
    }
  }
  for (const [key, rel] of Object.entries(project.dataverse.relationships).sort(([a], [b]) => a.localeCompare(b))) {
    result.push({ resourceId: id('relationship', key), kind: 'relationship', schemaName: rel.schemaName,
      dependencies: [id('table', rel.fromTable), id('table', rel.toTable)], properties: {
        schemaName: rel.schemaName, fromTableSchemaName: project.dataverse.tables[rel.fromTable]!.schemaName,
        toTableSchemaName: project.dataverse.tables[rel.toTable]!.schemaName,
        lookup: { schemaName: rel.lookup.schemaName, displayName: rel.lookup.displayName, required: rel.lookup.required },
        cascade: rel.cascade, solutionMember: true,
      } });
  }
  return result;
}

/** Include removed owned resources so deletion and drift cannot disappear from observation. */
export function discoveryScope(project: Project, ownership?: Ownership): DesiredResource[] {
  const desired = desiredResources(project); const ids = new Set(desired.map(item => item.resourceId));
  for (const owned of ownership?.resources ?? []) {
    if (owned.provider !== 'dataverse') continue;
    if (ids.has(owned.resourceId)) continue;
    const kind = owned.resourceId.split(':')[3];
    const name = owned.baseline.schemaName ?? owned.baseline.uniqueName;
    if (typeof name === 'string' && kind) desired.push({ resourceId: owned.resourceId, kind, schemaName: name, properties: owned.baseline, dependencies: [] });
  }
  return desired;
}
