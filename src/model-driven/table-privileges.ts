import { z } from 'zod';
import { PowerCanvasError } from '../core/errors.js';
import type { Project } from '../ir/schema.js';
import { resourceId } from '../ir/identity.js';
import type { Observation, PlannedOperation } from '../state/models.js';
import type { DataverseHttp } from '../dataverse/http.js';
import { guidValue } from '../dataverse/normalize.js';
import { modelId } from './desired.js';
import { normalizeGrants, PLATFORM_ROLE_DEFAULTS, type Grant } from './privileges.js';

const depthSchema = z.enum(['Basic', 'Local', 'Deep', 'Global']);
const metadataSchema = z.object({ MetadataId: z.guid(), LogicalName: z.string(), SchemaName: z.string(), Privileges: z.array(z.object({
  PrivilegeId: z.guid(), PrivilegeType: z.string(), Name: z.string(),
  CanBeBasic: z.boolean(), CanBeLocal: z.boolean(), CanBeDeep: z.boolean(), CanBeGlobal: z.boolean(),
})) });
export const resolvedPrivilegeSchema = z.strictObject({ tableResourceId: z.string(), tableId: z.guid(), logicalName: z.string(), schemaName: z.string(),
  privilegeType: z.string(), depth: depthSchema, privilegeId: z.guid(), name: z.string(),
  canBeBasic: z.boolean(), canBeLocal: z.boolean(), canBeDeep: z.boolean(), canBeGlobal: z.boolean(), legacyProjectionName: z.string() });
export type ResolvedPrivilege = z.infer<typeof resolvedPrivilegeSchema>;
export type PrivilegeRequirement = { tableResourceId: string; logicalName: string; privilegeType: string; depth: z.infer<typeof depthSchema>; legacyProjectionName: string };
export function privilegeError(reason: string): never {
  throw new PowerCanvasError('PF-MDA-009', reason, 'Refresh exact table privilege metadata and regenerate the target-bound plan. No grant or widening is authorized.',
    [{ code: 'PF-MDA-009', severity: 'error', message: reason }]);
}
/** Source intent, not a parsed or guessed platform privilege name. The legacy label
 * is retained only for existing source/receipt projections; it never resolves an ID. */
export function roleRequirements(project: Project, aggregateId: string): PrivilegeRequirement[] {
  const entry = Object.entries(project.security.roles).find(([key]) => modelId(project, 'rolePermissions', key) === aggregateId);
  if (!entry) return [];
  const depths = { user: 'Basic', businessUnit: 'Local', parentChildBusinessUnit: 'Deep', organization: 'Global' } as const;
  return Object.entries(entry[1].tables).flatMap(([key, privileges]) => Object.entries(privileges).filter(([, depth]) => depth !== 'none').map(([type, depth]) => {
    const logicalName = project.dataverse.tables[key]!.schemaName.toLowerCase(), privilegeType = type[0]!.toUpperCase() + type.slice(1);
    return { tableResourceId: resourceId(project.project.id, 'dataverse', 'table', [key]), logicalName, privilegeType,
      depth: depthSchema.parse(depths[depth as keyof typeof depths]), legacyProjectionName: `prv${privilegeType}${logicalName}` };
  })).sort((a, b) => a.legacyProjectionName.localeCompare(b.legacyProjectionName));
}
export function resolveTablePrivilege(requirement: PrivilegeRequirement, tableId: string, raw: unknown): ResolvedPrivilege {
  const parsed = metadataSchema.safeParse(raw);
  if (!parsed.success) return privilegeError('PRIVILEGE_UNRESOLVED: incomplete table privilege metadata');
  const table = parsed.data;
  if (guidValue(table.MetadataId) !== guidValue(tableId) || table.LogicalName !== requirement.logicalName || table.SchemaName.toLowerCase() !== requirement.logicalName)
    return privilegeError('PRIVILEGE_CHANGED: table identity does not match the required table');
  const matches = table.Privileges.filter(p => p.PrivilegeType === requirement.privilegeType);
  if (!matches.length) return privilegeError('PRIVILEGE_UNRESOLVED: requested PrivilegeType is absent');
  if (matches.length !== 1) return privilegeError('PRIVILEGE_AMBIGUOUS: multiple entries for requested PrivilegeType');
  const p = matches[0]!;
  if (!p[`CanBe${requirement.depth}`]) return privilegeError('PRIVILEGE_DEPTH_UNSUPPORTED: requested depth is not supported');
  return { ...requirement, tableId: guidValue(tableId), schemaName: table.SchemaName, privilegeId: guidValue(p.PrivilegeId), name: p.Name,
    canBeBasic: p.CanBeBasic, canBeLocal: p.CanBeLocal, canBeDeep: p.CanBeDeep, canBeGlobal: p.CanBeGlobal };
}
export function resolveObservedPrivileges(project: Project, aggregateId: string, observation: Observation): ResolvedPrivilege[] {
  return roleRequirements(project, aggregateId).map(requirement => {
    const table = observation.resources.find(r => r.kind === 'table' && r.resourceId === requirement.tableResourceId);
    if (!table) return privilegeError('PRIVILEGE_UNRESOLVED: table must exist before binding security execution');
    return resolveTablePrivilege(requirement, table.remoteId, table.properties.securityPrivilegeMetadata);
  });
}
export function plannedPrivileges(operation: PlannedOperation): ResolvedPrivilege[] {
  const parsed = z.array(resolvedPrivilegeSchema).min(1).safeParse(operation.preconditions.find(p => p.property === 'resolvedTablePrivileges')?.expected);
  if (!parsed.success) return privilegeError('PRIVILEGE_UNRESOLVED: target-bound privilege plan is required');
  return parsed.data;
}
export async function reattestPrivileges(project: Project, operation: PlannedOperation, observation: Observation, http: DataverseHttp): Promise<ResolvedPrivilege[]> {
  const expected = plannedPrivileges(operation), requirements = roleRequirements(project, operation.resourceId);
  if (expected.length !== requirements.length) return privilegeError('PRIVILEGE_CHANGED: requirement set changed');
  const result: ResolvedPrivilege[] = [];
  for (const requirement of requirements) {
    const matches = expected.filter(p => p.tableResourceId === requirement.tableResourceId && p.privilegeType === requirement.privilegeType);
    if (matches.length !== 1) return privilegeError('PRIVILEGE_CHANGED: requirement binding is missing or ambiguous');
    const previous = matches[0]!, table = observation.resources.find(r => r.resourceId === requirement.tableResourceId && r.kind === 'table');
    if (!table || table.remoteId !== previous.tableId || previous.logicalName !== requirement.logicalName || previous.depth !== requirement.depth)
      return privilegeError('PRIVILEGE_CHANGED: table or depth binding changed');
    const raw = (await http.request(`EntityDefinitions(${guidValue(previous.tableId)})?$select=MetadataId,LogicalName,SchemaName,Privileges`)).data;
    const current = resolveTablePrivilege(requirement, previous.tableId, raw);
    if (current.privilegeId !== previous.privilegeId) return privilegeError('PRIVILEGE_CHANGED: stable PrivilegeId changed since planning');
    result.push(current);
  }
  return result;
}
export function rolePrivilegePayload(resolved: ResolvedPrivilege[]) {
  const checked = z.array(resolvedPrivilegeSchema).min(1).parse(resolved);
  if (new Set(checked.map(p => p.privilegeId)).size !== checked.length) return privilegeError('PRIVILEGE_AMBIGUOUS: duplicate grant identity');
  if (checked.some(p => !p[({ Basic: 'canBeBasic', Local: 'canBeLocal', Deep: 'canBeDeep', Global: 'canBeGlobal' } as const)[p.depth]])) return privilegeError('PRIVILEGE_DEPTH_UNSUPPORTED: payload depth is not supported');
  return { Privileges: checked.map(p => ({ PrivilegeId: p.privilegeId, Depth: p.depth })) };
}
/** Readback matches stable IDs and exact depth before projecting legacy receipt labels.
 * Unknown IDs remain visible, even if their display name resembles a desired grant. */
export function normalizeRolePrivilegeIds(actual: { PrivilegeId: string; Depth: string }[], definitions: Map<string, string>, resolved: ResolvedPrivilege[]) {
  const grants: Grant[] = actual.map(p => {
    const id = guidValue(p.PrivilegeId), match = resolved.find(r => r.privilegeId === id);
    return { privilegeName: match?.legacyProjectionName ?? `unknown:${id}`, depth: p.Depth };
  });
  // Only the separately verified nine platform defaults may use observed names.
  for (let i = 0; i < actual.length; i++) {
    const id = guidValue(actual[i]!.PrivilegeId), name = definitions.get(id);
    if (!resolved.some(r => r.privilegeId === id) && name && PLATFORM_DEFAULTS.has(name)) grants[i]!.privilegeName = name;
  }
  return normalizeGrants(grants, []);
}
const PLATFORM_DEFAULTS = new Set(PLATFORM_ROLE_DEFAULTS);
