import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { fixture } from './helpers.js';
import { matchingState } from './planner-fixtures.js';
import { createPlan, publicationHash, validateSavedPlan, safeUpdate } from '../src/planner/dataverse.js';
import { modelResources, MODEL_KINDS, MODEL_VERSION, modelPublicationHash, sitemapName } from '../src/model-driven/desired.js';
import { elements, formXml, sitemapXml, viewXml } from '../src/model-driven/xml.js';
import { hashJson } from '../src/core/json.js';
import { executionPolicy } from '../src/dataverse/isolation.js';
import { DataverseHttp } from '../src/dataverse/http.js';
import { observeModel } from '../src/model-driven/discovery.js';
import { normalizeGrants, PLATFORM_ROLE_DEFAULTS } from '../src/model-driven/privileges.js';
import { mutateModel, publisherLocalName } from '../src/model-driven/mutations.js';
import { appIdentity, sitemapIdentity } from '../src/model-driven/names.js';
import { PLATFORM_APP_ROLE_TEMPLATES, readAppRoleIds, splitAppRoles } from '../src/model-driven/access.js';

const policy = executionPolicy(5, false, true);
it('permits only the forward owned-app client conversion and does not permit adjacent mutations', () => {
  const before = { clientType: 2, solutionMember: true, displayName: 'Owned app' };
  expect(safeUpdate('app', before, { ...before, clientType: 4 })).toBe(true);
  for (const after of [{ ...before, clientType: 1 }, { ...before, clientType: 4, displayName: 'Renamed' }, { ...before, clientType: 4, solutionMember: false }]) expect(safeUpdate('app', before, after)).toBe(false);
  expect(safeUpdate('app', { ...before, clientType: 4 }, before)).toBe(false);
  expect(safeUpdate('app', { ...before, solutionMember: false }, { ...before, clientType: 4 })).toBe(false);
});
it('plans migration of an owned app from the older baseline without adopting a colliding app', () => {
  const { project, observation, ownership } = modelState();
  for (const spec of modelResources(project)) {
    const remoteId = randomUUID(); const baseline = { ...spec.properties };
    if (spec.kind === 'app') delete baseline.clientType;
    observation.resources.push({ ...spec, provider: 'model-driven', remoteId, properties: { ...spec.properties, ...(spec.kind === 'app' ? { clientType: 2 } : {}) } });
    ownership.resources.push({ resourceId: spec.resourceId, provider: 'model-driven', remoteId, ownedPaths: Object.keys(baseline), baseline, lastVerifiedHash: hashJson(baseline) });
  }
  const plan = createPlan(project, observation, ownership, 'all', new Date(), policy);
  expect(plan.blockers).toEqual([]);
  expect(plan.operations.map(item => item.action)).toEqual(['updateOwnedProperties']);
  validateSavedPlan(plan, project, observation, ownership);
  const app = observation.resources.find(item => item.kind === 'app')!;
  ownership.resources = ownership.resources.filter(item => item.resourceId !== app.resourceId);
  expect(createPlan(project, observation, ownership, 'all', new Date(), policy).blockers.some(item => item.code === 'PF-PLAN-005')).toBe(true);
});
it('uses each custom table OData type rather than the platform Entity table when assembling an app', async () => {
  const { project, observation, ownership } = modelState();
  const plan = createPlan(project, observation, ownership, 'all', new Date(), policy);
  const op = plan.operations.find(item => item.action === 'addAppComponents')!;
  for (const spec of modelResources(project).filter(item => ['app', 'form', 'view', 'sitemap'].includes(item.kind))) observation.resources.push({ ...spec, provider: 'model-driven', remoteId: randomUUID() });
  const tables = observation.resources.filter(item => item.kind === 'table'); let writes = 0;
  const http = new DataverseHttp('https://synthetic.crm.dynamics.com', { token: async () => 'synthetic' }, async (url, init) => {
    expect(init?.method).toBe('GET');
    const table = tables.find(item => decodeURIComponent(String(url)).includes(item.schemaName.toLowerCase()))!;
    return new Response(JSON.stringify({ MetadataId: table.remoteId, LogicalName: table.schemaName.toLowerCase(), PrimaryIdAttribute: `${table.schemaName.toLowerCase()}id` }));
  });
  await mutateModel(project, op, observation, http, async (_step, path, method, body) => {
    writes++; expect(path).toBe('AddAppComponents'); expect(method).toBe('POST');
    const components = (body as { Components: Record<string, string>[] }).Components;
    for (const table of tables) expect(components).toContainEqual({ '@odata.type': `Microsoft.Dynamics.CRM.${table.schemaName.toLowerCase()}`, [`${table.schemaName.toLowerCase()}id`]: table.remoteId });
    expect(components.some(item => item['@odata.type'] === 'Microsoft.Dynamics.CRM.entity')).toBe(false);
  });
  expect(writes).toBe(1);
});
it('qualifies local app identity only through the verified dedicated publisher and retains actual metadata', () => {
  const project = fixture(); const publisherId = randomUUID(); const layerId = randomUUID();
  const raw = { uniquename: 'ComplaintDesk', _publisherid_value: publisherId, appmoduleidunique: layerId };
  expect(appIdentity(project, raw, publisherId)).toEqual({ uniqueName: 'pf_ComplaintDesk', serviceUniqueName: 'ComplaintDesk', solutionPublisherUniqueName: project.solution.publisher.uniqueName, servicePublisherId: publisherId, publisherSource: 'dedicated', componentLayerId: layerId });
  expect(appIdentity(project, { ...raw, uniquename: 'pf_ComplaintDesk' }, publisherId).serviceUniqueName).toBe('pf_ComplaintDesk');
  expect(() => appIdentity(project, raw, randomUUID())).toThrow('publisher differs');
  expect(() => appIdentity(project, { ...raw, uniquename: 'other_ComplaintDesk' }, publisherId)).toThrow('alphanumeric');
});
it('accepts a published Active-layer publisher only for a known app still in the dedicated solution', () => {
  const project = fixture(); const publisherId = randomUUID(); const appId = randomUUID();
  const active = { solutionid: randomUUID(), publisherId: randomUUID(), uniqueName: 'Active', isManaged: false };
  const raw = { appmoduleid: appId, uniquename: 'ComplaintDesk', appmoduleidunique: randomUUID(), _publisherid_value: active.publisherId,
    solutionid: active.solutionid, ismanaged: false, componentstate: 0 };
  const context = { knownAppId: appId, solutionMember: true, active };
  expect(appIdentity(project, raw, publisherId, context)).toMatchObject({ servicePublisherId: active.publisherId, publisherSource: 'unmanagedActiveLayer', solutionPublisherUniqueName: project.solution.publisher.uniqueName });
  expect(appIdentity(project, { ...raw, componentstate: 1 }, publisherId, { ...context, publishedIdentityVerified: true }).publisherSource).toBe('unmanagedActiveLayer');
  for (const unsafe of [{ ...context, knownAppId: undefined }, { ...context, knownAppId: randomUUID() }, { ...context, solutionMember: false },
    { ...context, active: { ...active, isManaged: true } }, { ...context, active: { ...active, uniqueName: 'Other' } },
    { ...context, active: { ...active, publisherId: randomUUID() } }, { ...context, active: { ...active, solutionid: randomUUID() } }]) {
    expect(() => appIdentity(project, raw, publisherId, unsafe)).toThrow('publisher differs');
  }
  for (const change of [{ ismanaged: true }, { componentstate: 1 }, { _publisherid_value: randomUUID() }, { solutionid: randomUUID() }]) {
    expect(() => appIdentity(project, { ...raw, ...change }, publisherId, context)).toThrow('publisher differs');
  }
});
it('preserves exact platform app-role defaults while exposing every additional association', async () => {
  const defaults = PLATFORM_APP_ROLE_TEMPLATES.map(templateId => ({ templateId, remoteId: randomUUID() }));
  const desiredRoleId = randomUUID(); const unexpected = randomUUID(); const ids = defaults.map(item => item.remoteId);
  expect(splitAppRoles([...ids, desiredRoleId], defaults).roles).toEqual([desiredRoleId]);
  expect(splitAppRoles([...ids, desiredRoleId, unexpected], defaults).roles).toContain(unexpected);
  expect(() => splitAppRoles([ids[0]!], defaults)).toThrow('defaults');
  expect(() => splitAppRoles([...ids, ids[0]!], defaults)).toThrow('defaults');
  const appId = randomUUID();
  const http = new DataverseHttp('https://synthetic.crm.dynamics.com', { token: async () => 'synthetic' }, async (url, init) => {
    expect(init?.method).toBe('GET'); const parsed = new URL(String(url));
    expect(parsed.pathname).toBe('/appmodulerolescollection');
    const xml = parsed.searchParams.get('fetchXml')!;
    expect(elements(xml, 'condition')[0]!.getAttribute('value')).toBe(appId);
    return new Response(JSON.stringify({ value: [{ _roleid_value: desiredRoleId }] }));
  });
  expect(await readAppRoleIds(http, appId)).toEqual([desiredRoleId]);
});
it('verifies both actual sitemap names and app-specific scope without inventing a service prefix', () => {
  const project = fixture();
  const raw = { sitemapname: 'pf_ComplaintDeskNav', sitemapnameunique: 'ComplaintDeskNav', isappaware: true };
  expect(sitemapIdentity(project, raw)).toEqual({ uniqueName: 'pf_ComplaintDeskNav', displayName: 'pf_ComplaintDeskNav', serviceUniqueName: 'ComplaintDeskNav', isAppAware: true });
  expect(() => sitemapIdentity(project, { ...raw, sitemapnameunique: 'OtherNav' })).toThrow('identity');
  expect(() => sitemapIdentity(project, { ...raw, isappaware: false })).toThrow('identity');
  expect(() => sitemapIdentity(project, { ...raw, sitemapname: 'Unqualified' })).toThrow('publisher prefix');
});
it('binds a new app to the verified dedicated publisher and solution', async () => {
  const { project, observation, ownership } = modelState();
  const op = createPlan(project, observation, ownership, 'all', new Date(), policy).operations.find(item => item.action === 'createApp')!;
  const publisher = observation.resources.find(item => item.kind === 'publisher')!;
  const http = new DataverseHttp('https://synthetic.crm.dynamics.com', { token: async () => 'synthetic' }, async (url, init) => {
    expect(init?.method).toBe('GET'); expect(String(url)).toContain('/webresourceset('); return new Response('{}');
  });
  await mutateModel(project, op, observation, http, async (_step, path, method, body, headers) => {
    expect(path).toBe('appmodules'); expect(method).toBe('POST');
    expect(body).toMatchObject({ clienttype: 4, uniquename: publisherLocalName(project, op.after!.uniqueName), 'publisher_appmodule_appmodule@odata.bind': `/publishers(${publisher.remoteId})` });
    expect(headers).toEqual({ 'MSCRM.SolutionUniqueName': project.solution.uniqueName });
  });
});
it('uses the sitemap unique-name property in its creation payload', async () => {
  const { project, observation, ownership } = modelState();
  const op = createPlan(project, observation, ownership, 'all', new Date(), policy).operations.find(item => item.action === 'createSitemap')!;
  const http = new DataverseHttp('https://synthetic.crm.dynamics.com/api/data/v9.2/', { token: async () => 'synthetic' });
  await mutateModel(project, op, observation, http, async (_step, path, method, body) => {
    expect(path).toBe('sitemaps'); expect(method).toBe('POST');
    expect(body).toMatchObject({ sitemapname: op.after!.uniqueName, sitemapnameunique: publisherLocalName(project, op.after!.uniqueName), isappaware: true });
  });
});
it('bounds service-local names while retaining stable publisher-qualified desired identity', () => {
  const { project, observation, ownership } = modelState();
  expect(publisherLocalName(project, 'pf_ComplaintDesk')).toBe('ComplaintDesk');
  expect(sitemapName('pfx_ExperimentComplaintManagement')).toBe('pfx_ExperimentComplaintManagementNav');
  expect(sitemapName('pf_' + 'A'.repeat(37)).length).toBeLessThanOrEqual(40);
  project.apps.complaintDesk!.uniqueName = 'pf_' + 'A'.repeat(40);
  expect(createPlan(project, observation, ownership, 'all', new Date(), policy).blockers.some(item => item.code === 'PF-MDA-011')).toBe(true);
});
it.each([true, false])('checks managed form/view eligibility before any write (allowed=%s)', async allowed => {
  const { project, observation, ownership } = modelState();
  const plan = createPlan(project, observation, ownership, 'all', new Date(), policy);
  for (const action of ['createForm', 'createView']) {
    const operation = plan.operations.find(item => item.action === action)!; let writes = 0;
    const http = new DataverseHttp('https://synthetic.crm.dynamics.com/api/data/v9.2/', { token: async () => 'synthetic' }, async input => {
      const url = String(input);
      const data = url.includes('/Attributes?') ? { value: (operation.after!.fields as string[]).map(LogicalName => ({ LogicalName, AttributeType: 'String', DisplayName: { LocalizedLabels: [{ LanguageCode: 1033, Label: 'Name' }] } })) } :
        { CanCreateForms: { Value: allowed }, CanCreateViews: { Value: allowed }, LogicalName: 'pf_complaint', PrimaryNameAttribute: 'pf_title', PrimaryIdAttribute: 'pf_complaintid', ObjectTypeCode: 10001 };
      return new Response(JSON.stringify(data));
    });
    const result = mutateModel(project, operation, observation, http, async () => { writes++; });
    if (allowed) await result; else await expect(result).rejects.toMatchObject({ code: 'PF-MDA-002' });
    expect(writes).toBe(allowed ? 1 : 0);
  }
});
it('accounts for exact platform defaults and casing without concealing extra role grants', () => {
  const defaults = PLATFORM_ROLE_DEFAULTS.map(privilegeName => ({ privilegeName, depth: 'Global' }));
  const requested = [{ privilegeName: 'prvReadpf_complaint', depth: 'Basic' }];
  const actual = [...defaults, { privilegeName: 'prvReadpf_Complaint', depth: 'Basic' }];
  expect(normalizeGrants(actual, requested)).toEqual({ grants: requested, platformDefaultGrants: defaults });
  expect(normalizeGrants([...actual, { privilegeName: 'prvDeleteAccount', depth: 'Global' }], requested).grants).toHaveLength(2);
  expect(() => normalizeGrants(actual.slice(1), requested)).toThrow('defaults differ');
  expect(() => normalizeGrants(actual.map(item => ({ ...item, depth: 'Basic' })), requested)).toThrow('defaults differ');
});
function modelState() {
  const project = fixture(); const state = matchingState(project);
  state.observation.providerVersions['model-driven'] = MODEL_VERSION;
  state.observation.coverage.push(...MODEL_KINDS.map(kind => ({ kind, status: 'complete' as const })));
  state.ownership.experiment1Evidence = { schemaHash: publicationHash(project), firstNoOpHash: 'a'.repeat(64), secondNoOpHash: 'b'.repeat(64), destructiveCheckHash: 'c'.repeat(64), completedAt: new Date().toISOString() };
  return { project, ...state };
}
it('gates model generation on the current verified schema and orders app/security dependencies', () => {
  const { project, observation, ownership } = modelState();
  const plan = createPlan(project, observation, ownership, 'all', new Date(), policy);
  expect(plan.blockers).toEqual([]);
  expect(plan.operations.filter(item => item.action === 'publish')).toHaveLength(0);expect(plan.deferred).toHaveLength(1);
  const completed = new Set<string>();
  for (const operation of plan.operations) { expect(operation.dependsOn.every(id => completed.has(id))).toBe(true); completed.add(operation.id); }
  expect(plan.operations.some(item=>item.action==='setAppAccess')).toBe(false);expect(plan.deferred?.[0]?.dependency).toContain(':appPublication:');
  delete ownership.experiment1Evidence;
  const blocked = createPlan(project, observation, ownership, 'all', new Date(), policy);
  expect(blocked.blockers.some(item => item.code === 'PF-CAPABILITY-003')).toBe(true);
  expect(() => validateSavedPlan(blocked, project, observation, ownership)).toThrow('blockers');
});
it('includes app components in three-way no-op, collision and drift checks', () => {
  const { project, observation, ownership } = modelState();
  for (const spec of modelResources(project)) {
    const remoteId = randomUUID();
    observation.resources.push({ ...spec, provider: 'model-driven', remoteId, properties: { ...spec.properties, isManaged: false, customizable: true } });
    ownership.resources.push({ resourceId: spec.resourceId, provider: 'model-driven', remoteId, ownedPaths: Object.keys(spec.properties), baseline: spec.properties, lastVerifiedHash: hashJson(spec.properties) });
  }
  ownership.modelDrivenPublicationHash = modelPublicationHash(project);
  const plan = createPlan(project, observation, ownership, 'all', new Date(), policy);
  expect(plan.operations).toEqual([]); expect(plan.blockers).toEqual([]);
  const role = ownership.resources.find(item => item.resourceId.includes(':role:'))!;
  ownership.resources = ownership.resources.filter(item => item !== role);
  expect(createPlan(project, observation, ownership, 'all', new Date(), policy).blockers.some(item => item.code === 'PF-PLAN-005')).toBe(true);
  ownership.resources.push(role);
  observation.resources.find(item => item.kind === 'appAccess')!.properties.roles = ['unowned:admin'];
  expect(createPlan(project, observation, ownership, 'all', new Date(), policy).blockers.some(item => item.code === 'PF-PLAN-007')).toBe(true);
});
it('generates escaped standard form, view and sitemap XML with stable identities', () => {
  const project = fixture(); const specs = modelResources(project);
  const form = specs.find(item => item.kind === 'form')!;
  const fields = form.properties.fields as string[];
  const attributes = fields.map(LogicalName => ({ LogicalName, AttributeType: 'String', DisplayName: { LocalizedLabels: [{ LanguageCode: 1033, Label: 'A < B & C' }] } }));
  const xml = formXml(form, attributes);
  expect(xml).toBe(formXml(form, attributes)); expect(xml).toContain('A &lt; B &amp; C');
  expect(elements(xml, 'control').map(item => item.getAttribute('datafieldname'))).toEqual(fields);
  expect(() => formXml(form, [])).toThrow('standard-control');
  expect(() => elements('<!DOCTYPE x><form/>', 'form')).toThrow('Unsupported XML');
  const view = specs.find(item => item.kind === 'view' && item.properties.activeOnly)!;
  const generated = viewXml(view, { LogicalName: 'pf_complaint', PrimaryIdAttribute: 'pf_complaintid', PrimaryNameAttribute: 'pf_title', ObjectTypeCode: 10001 });
  expect(elements(generated.fetchxml, 'condition')[0]!.getAttribute('attribute')).toBe('statecode');
  expect(elements(generated.layoutxml, 'cell').map(item => item.getAttribute('name'))).toEqual(view.properties.columns);
  expect(elements(sitemapXml(specs.find(item => item.kind === 'sitemap')!), 'SubArea')).toHaveLength(2);
});
it('normalizes empty published/unpublished metadata without adoption or remote writes', async () => {
  const input = fixture(); const { observation, ownership } = matchingState(input); let reads = 0; const urls: string[] = [];
  const http = new DataverseHttp('https://synthetic.crm.dynamics.com', { token: async () => 'synthetic' }, async (_url, init) => {
    expect(init?.method).toBe('GET'); reads++;
    urls.push(decodeURIComponent(String(_url)));
    if (String(_url).includes('sitemaps')) expect(decodeURIComponent(String(_url))).not.toContain(' or ');
    return new Response(JSON.stringify({ value: String(_url).includes('businessunits?') ? [{ businessunitid: randomUUID() }] : [] }), { status: 200 });
  });
  const result = await observeModel(input, observation, http, ownership);
  expect(result.resources).toHaveLength(observation.resources.length);
  expect(result.coverage.filter(item => MODEL_KINDS.includes(item.kind))).toHaveLength(MODEL_KINDS.length);
  expect(reads).toBeGreaterThan(10);
  const sitemap = modelResources(input).find(item => item.kind === 'sitemap')!;
  expect(urls.some(url => url.includes(`sitemapnameunique eq '${publisherLocalName(input, sitemap.properties.uniqueName)}'`))).toBe(true);
  expect(urls.some(url => url.includes(`sitemapname eq '${sitemap.properties.uniqueName}'`))).toBe(true);
});
it('blocks a service-local sitemap name collision even if its display name differs', async () => {
  const input = fixture(); const { observation, ownership } = matchingState(input);
  const sitemap = modelResources(input).find(item => item.kind === 'sitemap')!; const collisionId = randomUUID();
  const http = new DataverseHttp('https://synthetic.crm.dynamics.com', { token: async () => 'synthetic' }, async (_url, init) => {
    expect(init?.method).toBe('GET'); const url = decodeURIComponent(String(_url));
    const value = url.includes('businessunits?') ? [{ businessunitid: randomUUID() }] :
      url.includes(`sitemapnameunique eq '${publisherLocalName(input, sitemap.properties.uniqueName)}'`) ? [{ sitemapid: collisionId, sitemapname: 'ExistingNav', sitemapnameunique: publisherLocalName(input, sitemap.properties.uniqueName), isappaware: true, sitemapxml: '<SiteMap/>' }] : [];
    return new Response(JSON.stringify({ value }));
  });
  await expect(observeModel(input, observation, http, ownership)).rejects.toMatchObject({ code: 'PF-MDA-011' });
});
