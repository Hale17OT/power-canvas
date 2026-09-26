import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { fixture } from './helpers.js';
import { matchingState } from './planner-fixtures.js';
import { MODEL_KINDS, MODEL_VERSION, modelResources } from '../src/model-driven/desired.js';
import { roleRequirements, resolveTablePrivilege, resolveObservedPrivileges, reattestPrivileges, rolePrivilegePayload, normalizeRolePrivilegeIds, plannedPrivileges } from '../src/model-driven/table-privileges.js';
import { PLATFORM_ROLE_DEFAULTS } from '../src/model-driven/privileges.js';
import { createPlan, validateSavedPlan, publicationHash } from '../src/planner/dataverse.js';
import { executionPolicy } from '../src/dataverse/isolation.js';
import { DataverseHttp } from '../src/dataverse/http.js';
import { mutateModel } from '../src/model-driven/mutations.js';
import { verifyPostcondition } from '../src/execution/apply.js';
import { publicError } from '../src/core/errors.js';

function setup() {
  const project = fixture();
  for (const role of Object.values(project.security.roles)) for (const permissions of Object.values(role.tables)) for (const key of Object.keys(permissions)) if (permissions[key as keyof typeof permissions] !== 'none') permissions[key as keyof typeof permissions] = 'user';
  const { observation, ownership } = matchingState(project);
  ownership.experiment1Evidence = { schemaHash: publicationHash(project), firstNoOpHash: 'a'.repeat(64), secondNoOpHash: 'b'.repeat(64), destructiveCheckHash: 'c'.repeat(64), completedAt: new Date().toISOString() };
  const spec = modelResources(project).find(r => r.kind === 'rolePermissions')!;
  const requirements = roleRequirements(project, spec.resourceId);
  for (const table of observation.resources.filter(r => r.kind === 'table')) {
    table.properties.securityPrivilegeMetadata = { MetadataId: table.remoteId, LogicalName: table.schemaName.toLowerCase(), SchemaName: table.schemaName,
      Privileges: requirements.filter(r => r.tableResourceId === table.resourceId).map(r => ({ PrivilegeId: randomUUID(), PrivilegeType: r.privilegeType,
        Name: `Unpredictable${r.privilegeType}PlatformSpelling`, CanBeBasic: true, CanBeLocal: true, CanBeDeep: true, CanBeGlobal: true })) };
  }
  observation.providerVersions['model-driven'] = MODEL_VERSION;
  observation.coverage.push(...MODEL_KINDS.map(kind => ({ kind, status: 'complete' as const })));
  const policy = executionPolicy(5, false, true), plan = createPlan(project, observation, ownership, 'all', new Date(), policy);
  const operation = plan.operations.find(o => o.resourceId === spec.resourceId)!;
  const resolved = resolveObservedPrivileges(project, spec.resourceId, observation), requirement = requirements.find(r => r.privilegeType === 'Read')!;
  const table = observation.resources.find(t => t.resourceId === requirement.tableResourceId)!;
  const raw = structuredClone(table.properties.securityPrivilegeMetadata) as { MetadataId: string; LogicalName: string; SchemaName: string; Privileges: { PrivilegeId: string; PrivilegeType: string; Name: string; CanBeBasic: boolean; CanBeLocal: boolean; CanBeDeep: boolean; CanBeGlobal: boolean }[] };
  return { project, observation, ownership, spec, plan, operation, resolved, requirement, table, raw };
}
function backend(x: ReturnType<typeof setup>, change?: (raw: Record<string, unknown>) => unknown) {
  return new DataverseHttp('https://synthetic.crm.dynamics.com', { token: async () => 'synthetic' }, async (url, init) => {
    expect(init?.method).toBe('GET');
    const table = x.observation.resources.find(t => String(url).includes(t.remoteId));
    const raw = table?.properties.securityPrivilegeMetadata as Record<string, unknown>;
    return new Response(JSON.stringify(change ? change(structuredClone(raw)) : raw));
  }, { readOnly: true });
}
describe('table metadata privilege identity', () => {
  it('resolves Read by type and exact table identity, irrespective of the platform Name', () => {
    const x = setup(), result = resolveTablePrivilege(x.requirement, x.table.remoteId, x.raw);
    expect(result.privilegeId).toBe(x.raw.Privileges.find(p => p.PrivilegeType === 'Read')!.PrivilegeId);
    expect(result).toMatchObject({ tableId: x.table.remoteId, logicalName: x.table.schemaName.toLowerCase(), privilegeType: 'Read', depth: 'Basic', canBeBasic: true });
    expect(result.name).not.toBe(result.legacyProjectionName);
  });
  it.each(['prvReadpfx_ExperimentCertificationProbe', 'PRVREADPFX_EXPERIMENTCERTIFICATIONPROBE', 'entirely different name'])('name %s does not determine the ID', name => {
    const x = setup(), before = resolveTablePrivilege(x.requirement, x.table.remoteId, x.raw);
    x.raw.Privileges.find(p => p.PrivilegeType === 'Read')!.Name = name;
    expect(resolveTablePrivilege(x.requirement, x.table.remoteId, x.raw).privilegeId).toBe(before.privilegeId);
  });
  it.each(['MetadataId', 'LogicalName', 'SchemaName'])('rejects wrong table %s despite a similar privilege name', key => {
    const x = setup(); x.raw[key as 'MetadataId'] = key === 'MetadataId' ? randomUUID() : 'another_table';
    expect(() => resolveTablePrivilege(x.requirement, x.table.remoteId, x.raw)).toThrow('PRIVILEGE_CHANGED');
  });
  it('does not match a Name prefix when PrivilegeType differs', () => {
    const x = setup(); x.raw.Privileges = x.raw.Privileges.filter(p => p.PrivilegeType !== 'Read');
    x.raw.Privileges[0]!.Name = x.requirement.legacyProjectionName;
    expect(() => resolveTablePrivilege(x.requirement, x.table.remoteId, x.raw)).toThrow('PRIVILEGE_UNRESOLVED');
  });
  it('rejects ambiguous Read entries, even if one has unsupported depth', () => {
    const x = setup(), read = x.raw.Privileges.find(p => p.PrivilegeType === 'Read')!;
    x.raw.Privileges.push({ ...read, PrivilegeId: randomUUID(), CanBeBasic: false });
    expect(() => resolveTablePrivilege(x.requirement, x.table.remoteId, x.raw)).toThrow('PRIVILEGE_AMBIGUOUS');
  });
  it('blocks Basic=false without widening the request', () => {
    const x = setup(); x.raw.Privileges.find(p => p.PrivilegeType === 'Read')!.CanBeBasic = false;
    expect(() => resolveTablePrivilege(x.requirement, x.table.remoteId, x.raw)).toThrow('PRIVILEGE_DEPTH_UNSUPPORTED');
  });
  it('binds GUIDs in the native plan and preserves GUID-free portable security source', () => {
    const x = setup(); expect(plannedPrivileges(x.operation)).toEqual(x.resolved);
    for (const p of x.resolved) { expect(JSON.stringify(x.project.security)).not.toContain(p.privilegeId); expect(JSON.stringify(x.plan)).toContain(p.privilegeId); }
    validateSavedPlan(x.plan, x.project, x.observation, x.ownership);
    x.operation.preconditions.find(p => p.property === 'resolvedTablePrivileges')!.expected = [];
    expect(() => validateSavedPlan(x.plan, x.project, x.observation, x.ownership)).toThrow();
  });
  it('resolves the same portable requirement independently for a second target', () => {
    const x = setup(), a = resolveTablePrivilege(x.requirement, x.table.remoteId, x.raw), newTableId = randomUUID();
    x.raw.MetadataId = newTableId; x.raw.Privileges.find(p => p.PrivilegeType === 'Read')!.PrivilegeId = randomUUID();
    const b = resolveTablePrivilege(x.requirement, newTableId, x.raw);
    expect(a.privilegeId).not.toBe(b.privilegeId); expect(a.tableResourceId).toBe(b.tableResourceId);
  });
  it('produces a precise planner blocker for incompatible metadata', () => {
    const x = setup(); x.raw.Privileges = []; x.table.properties.securityPrivilegeMetadata = x.raw;
    const plan = createPlan(x.project, x.observation, x.ownership, 'all', new Date(), executionPolicy(5, false, true));
    expect(plan.blockers).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PF-MDA-009', message: expect.stringContaining('PRIVILEGE_UNRESOLVED') })]));
    expect(plan.operations.some(o => o.resourceId === x.spec.resourceId)).toBe(false);
  });
  it('reattests IDs by exact table MetadataId and tolerates Name casing changes', async () => {
    const x = setup(), http = backend(x, raw => ({ ...raw, Privileges: (raw.Privileges as { Name: string }[]).map(p => ({ ...p, Name: p.Name.toUpperCase() })) }));
    expect((await reattestPrivileges(x.project, x.operation, x.observation, http)).map(p => p.privilegeId)).toEqual(x.resolved.map(p => p.privilegeId));
  });
  it.each(['id', 'table', 'depth', 'missing', 'ambiguous'])('stops existing grant provider before mutation on %s drift', async kind => {
    const x = setup(), role = modelResources(x.project).find(r => r.resourceId === x.spec.properties.role)!;
    x.observation.resources.push({ ...role, provider: 'model-driven', remoteId: randomUUID() });
    const http = backend(x, raw => {
      const privileges = raw.Privileges as { PrivilegeId: string; CanBeBasic: boolean }[];
      if (kind === 'id') privileges[0]!.PrivilegeId = randomUUID();
      if (kind === 'table') raw.MetadataId = randomUUID();
      if (kind === 'depth') privileges[0]!.CanBeBasic = false;
      if (kind === 'missing') raw.Privileges = [];
      if (kind === 'ambiguous') privileges.push({ ...privileges[0]! });
      return raw;
    });
    const mutate = vi.fn(); await expect(mutateModel(x.project, x.operation, x.observation, http, mutate)).rejects.toMatchObject({ code: 'PF-MDA-009' }); expect(mutate).not.toHaveBeenCalled();
  });
  it('uses only stable IDs and exact depths in the existing AddPrivilegesRole payload', async () => {
    const x = setup(), role = modelResources(x.project).find(r => r.resourceId === x.spec.properties.role)!, roleId = randomUUID();
    x.observation.resources.push({ ...role, provider: 'model-driven', remoteId: roleId });
    const mutate = vi.fn(); await mutateModel(x.project, x.operation, x.observation, backend(x), mutate);
    expect(mutate).toHaveBeenCalledExactlyOnceWith('grant', `roles(${roleId})/Microsoft.Dynamics.CRM.AddPrivilegesRole`, 'POST', rolePrivilegePayload(x.resolved));
    expect(rolePrivilegePayload(x.resolved).Privileges).toEqual(x.resolved.map(p => ({ PrivilegeId: p.privilegeId, Depth: p.depth })));
  });
  it('rejects missing target bindings before provider writes', async () => {
    const x = setup(); x.operation.preconditions = [];
    await expect(reattestPrivileges(x.project, x.operation, x.observation, backend(x))).rejects.toThrow('target-bound privilege plan');
  });
  it('preserves unexpected grants as collisions and partial desired state rather than adoption', () => {
    const x = setup(), defaults = PLATFORM_ROLE_DEFAULTS.map(name => ({ name, id: randomUUID() })), definitions = new Map(defaults.map(p => [p.id, p.name]));
    const actual = defaults.map(p => ({ PrivilegeId: p.id, Depth: 'Global' }));
    const expected = x.resolved[0]!, wrongId = randomUUID(); definitions.set(wrongId, expected.legacyProjectionName);
    expect(normalizeRolePrivilegeIds([...actual, { PrivilegeId: wrongId, Depth: expected.depth }], definitions, x.resolved).grants).toEqual([{ privilegeName: `unknown:${wrongId}`, depth: expected.depth }]);
    const partial = normalizeRolePrivilegeIds([...actual, { PrivilegeId: expected.privilegeId, Depth: expected.depth }], definitions, x.resolved);
    x.observation.resources.push({ ...x.spec, provider: 'model-driven', remoteId: randomUUID(), properties: { ...x.spec.properties, ...partial } });
    expect(createPlan(x.project, x.observation, x.ownership, 'all', new Date(), executionPolicy(5, false, true)).blockers).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PF-PLAN-005', resourceId: x.spec.resourceId })]));
  });
  it.each(['id', 'depth', 'role', 'valid'])('postcondition uses stable role/privilege/depth: %s', kind => {
    const x = setup(), role = modelResources(x.project).find(r => r.resourceId === x.spec.properties.role)!, roleId = randomUUID();
    x.observation.resources.push({ ...role, provider: 'model-driven', remoteId: roleId });
    const privileges = x.resolved.map(p => ({ privilegeId: p.privilegeId, depth: p.depth as string }));
    if (kind === 'id') privileges[0]!.privilegeId = randomUUID(); if (kind === 'depth') privileges[0]!.depth = 'Global';
    x.observation.resources.push({ ...x.spec, provider: 'model-driven', remoteId: roleId, properties: { ...x.spec.properties, rolePrivilegeReadback: { roleId: kind === 'role' ? randomUUID() : roleId, privileges } } });
    expect(verifyPostcondition(x.operation, x.observation)).toBe(kind === 'valid');
  });
  it('retains precise safe resolution errors through the public CLI error wrapper', () => {
    const x = setup(); x.raw.Privileges = [];
    try { resolveTablePrivilege(x.requirement, x.table.remoteId, x.raw); throw Error('expected failure'); }
    catch (error) { expect(publicError(error)).toMatchObject({ code: 'PF-MDA-009', message: expect.stringContaining('PRIVILEGE_UNRESOLVED') }); }
  });
});
