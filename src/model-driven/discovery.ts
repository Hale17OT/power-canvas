import { z } from 'zod';
import type { Project } from '../ir/schema.js';
import type { Observation, Ownership } from '../state/models.js';
import type { DesiredResource, Resource } from '../dataverse/desired.js';
import { DataverseHttp } from '../dataverse/http.js';
import { guidValue, rawObject, textValue } from '../dataverse/normalize.js';
import { modelResources, MODEL_KINDS, MODEL_VERSION } from './desired.js';
import { elements } from './xml.js';
import { PowerCanvasError } from '../core/errors.js';
import { normalizeGrants } from './privileges.js';
import { appIdentity, publisherLocalName, sitemapIdentity } from './names.js';
import { PLATFORM_APP_ROLE_TEMPLATES, readAppRoleIds, splitAppRoles } from './access.js';
import { observeReveal } from './reveal.js';
import { hashJson } from '../core/json.js';

export const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
export const componentTypes: Record<string, number> = { command: 10148, webResource: 61, form: 60, view: 26, sitemap: 62, role: 20, app: 80 };
export async function observeModel(project: Project, base: Observation, http: DataverseHttp, ownership?: Ownership, publishedOnly = false, verifiedAppIds: ReadonlySet<string> = new Set()): Promise<Observation> {
  const scope = modelResources(project); const ids = new Set(scope.map(item => item.resourceId));
  for (const owned of ownership?.resources.filter(item => item.provider === 'model-driven') ?? []) {
    if (!ids.has(owned.resourceId)) scope.push({ resourceId: owned.resourceId, provider: 'model-driven', kind: owned.resourceId.split(':')[3]!,
      schemaName: textValue(owned.baseline.uniqueName ?? owned.baseline.displayName ?? 'RemovedComponent'), properties: owned.baseline, dependencies: [] });
  }
  if (!scope.length) return base;
  const resources = [...base.resources];
  const solution = resources.find(item => item.kind === 'solution');
  const members = solution ? await http.all(`solutioncomponents?$select=objectid,componenttype,rootcomponentbehavior&$filter=_solutionid_value eq ${guidValue(solution.remoteId)}`) : [];
  const member = (remoteId: string, kind: string, table?: Resource) => members.some(item => guidValue(item.objectid) === remoteId && item.componenttype === componentTypes[kind]) ||
    Boolean(['form', 'view'].includes(kind) && table && members.some(item => guidValue(item.objectid) === table.remoteId && item.componenttype === 1 && item.rootcomponentbehavior === 0));
  const rootUnits = await http.all('businessunits?$select=businessunitid&$filter=_parentbusinessunitid_value eq null');
  if (rootUnits.length !== 1) throw new PowerCanvasError('PF-MDA-003', 'Root business unit could not be identified uniquely.', 'Complete read-only discovery before model-driven planning.');
  const rootUnitId = guidValue(rootUnits[0]!.businessunitid);
  let privilegeNames: Map<string, string> | undefined;
  let defaultAppRoles: { remoteId: string; templateId: string }[] | undefined;
  const add = (spec: DesiredResource, raw: Record<string, unknown>, remoteId: string, properties: Resource['properties']) => {
    const custom = raw.iscustomizable;
    resources.push({ resourceId: spec.resourceId, remoteId, provider: 'model-driven', kind: spec.kind, schemaName: spec.schemaName,
      properties: { ...properties, isManaged: raw.ismanaged === true, customizable: custom === undefined ? true : rawObject(custom).Value === true } });
  };
  for (const spec of scope) {
    const owned = ownership?.resources.find(item => item.resourceId === spec.resourceId);
    if (['rolePermissions', 'appComponents', 'appAccess'].includes(spec.kind)) {
      const parent = resources.find(item => item.resourceId === (spec.properties.role ?? spec.properties.app)); if (!parent) continue;
      if (spec.kind === 'rolePermissions') {
        const response = rawObject((await http.request(`RetrieveRolePrivilegesRole(RoleId=${guidValue(parent.remoteId)})`)).data);
        const privileges = z.array(z.object({ PrivilegeId: z.guid(), Depth: z.string() })).parse(response.RolePrivileges);
        if (!owned && privileges.length === 0) continue;
        privilegeNames ??= new Map((await http.all('privileges?$select=privilegeid,name')).map(item => [guidValue(item.privilegeid), textValue(item.name)]));
        const actual = privileges.map(item => ({ privilegeName: privilegeNames!.get(item.PrivilegeId.toLowerCase()) ?? `unknown:${item.PrivilegeId}`, depth: item.Depth }));
        const normalized = normalizeGrants(actual, z.array(z.object({ privilegeName: z.string(), depth: z.string() })).parse(spec.properties.grants));
        if (!owned && normalized.grants.length === 0) continue;
        add(spec, {}, parent.remoteId, { role: parent.resourceId, ...normalized });
      } else if (spec.kind === 'appComponents') {
        const rows = await http.all(`appmodulecomponents?$select=objectid,componenttype&$filter=_appmoduleidunique_value eq ${guidValue(parent.properties.componentLayerId)}`);
        if (!owned && rows.length === 0) continue;
        const components = [...new Set(rows.map(item => resources.find(resource => resource.remoteId === guidValue(item.objectid) &&
          (resource.kind === 'table' ? 1 : componentTypes[resource.kind]) === item.componenttype)?.resourceId ?? `unowned:${z.int().parse(item.componenttype)}:${guidValue(item.objectid)}`))].sort();
        add(spec, {}, parent.remoteId, { app: parent.resourceId, components });
      } else {
        defaultAppRoles ??= (await http.all(`roles?$select=roleid,_roletemplateid_value&$filter=_businessunitid_value eq ${rootUnitId} and (${PLATFORM_APP_ROLE_TEMPLATES.map(id => `_roletemplateid_value eq ${id}`).join(' or ')})`))
          .map(item => ({ remoteId: guidValue(item.roleid), templateId: guidValue(item._roletemplateid_value) }));
        const actualRoleIds = publishedOnly ? (await http.all(`appmodules(${guidValue(parent.remoteId)})/appmoduleroles_association?$select=roleid`)).map(item => guidValue(item.roleid)) : await readAppRoleIds(http, parent.remoteId);
        const normalized = splitAppRoles(actualRoleIds, defaultAppRoles);
        if (!owned && normalized.roles.length === 0) continue;
        const roles = normalized.roles.map(id => resources.find(resource => resource.kind === 'role' && resource.remoteId === id)?.resourceId ?? `unowned:${id}`).sort();
        add(spec, {}, parent.remoteId, { app: parent.resourceId, roles, platformDefaultRoles: normalized.platformDefaultRoles });
      }
      continue;
    }
    const definition: Record<string, { set: string; id: string; name: string; select: string }> = {
      command: { set: 'appactions', id: 'appactionid', name: 'uniquename', select: 'appactionid,name,uniquename,buttonlabeltext,buttontooltiptitle,sequence,_contextentity_value,_appmoduleid_value,contextvalue,location,_onclickeventjavascriptwebresourceid_value,onclickeventjavascriptfunctionname,onclickeventjavascriptparameters,onclickeventtype,context,type,visibilitytype,hidden,isdisabled,ismanaged,iscustomizable,componentstate' },
      webResource: { set: 'webresourceset', id: 'webresourceid', name: 'name', select: 'webresourceid,name,displayname,content,webresourcetype,ismanaged,iscustomizable' },
      form: { set: 'systemforms', id: 'formid', name: 'name', select: 'formid,name,objecttypecode,formxml,type,ismanaged,iscustomizable' },
      view: { set: 'savedqueries', id: 'savedqueryid', name: 'name', select: 'savedqueryid,name,returnedtypecode,fetchxml,layoutxml,querytype,ismanaged,iscustomizable' },
      sitemap: { set: 'sitemaps', id: 'sitemapid', name: 'sitemapnameunique', select: 'sitemapid,sitemapname,sitemapnameunique,sitemapxml,ismanaged,isappaware' },
      role: { set: 'roles', id: 'roleid', name: 'name', select: 'roleid,name,_businessunitid_value,_parentrootroleid_value,ismanaged,iscustomizable' },
      app: { set: 'appmodules', id: 'appmoduleid', name: 'uniquename', select: 'appmoduleid,appmoduleidunique,uniquename,name,clienttype,_publisherid_value,ismanaged,solutionid,componentstate' },
    };
    const route = definition[spec.kind]; if (!route) throw new PowerCanvasError('PF-MDA-004', 'Unsupported model-driven observation kind.', 'Use the bounded app component set.');
    const name = textValue(spec.properties.uniqueName ?? spec.properties.displayName);
    // Sitemap's published endpoint rejects OR identity filters in the live Default tenant.
    // Query each identity separately; a failed read must never be interpreted as absence.
    const identities = [`${route.name} eq ${quote(name)}`, ...(owned ? [`${route.id} eq ${guidValue(owned.remoteId)}`] : [])];
    if (spec.kind === 'sitemap' || spec.kind === 'app') identities.push(`${route.name} eq ${quote(publisherLocalName(project, name))}`,
      `${spec.kind === 'sitemap' ? 'sitemapname' : 'name'} eq ${quote(textValue(spec.properties.displayName ?? name))}`);
    const filters = spec.kind === 'sitemap' ? identities : [identities.join(' or ')];
    const read = async (unpublished: boolean) => (await Promise.all(filters.map(filter => http.all(`${route.set}${unpublished ? '/Microsoft.Dynamics.CRM.RetrieveUnpublishedMultiple()' : ''}?$select=${route.select}&$filter=${filter}`)))).flat();
    const [published, unpublished] = await Promise.all([read(false), ['role', 'command'].includes(spec.kind) || publishedOnly ? Promise.resolve([]) : read(true)]);
    let rows = [...new Map([...published, ...unpublished].map(item => [guidValue(item[route.id]), item])).values()];
    if (spec.kind === 'role') {
      const roots = rows.filter(item => item._parentrootroleid_value === null || item._parentrootroleid_value === undefined);
      if (roots.length === 1 && rows.every(item => item === roots[0] || item._parentrootroleid_value === roots[0]!.roleid)) rows = roots;
    }
    if (rows.length > 1) throw new PowerCanvasError('PF-MDA-005', 'A model-driven component name has multiple matches.', 'Stop and choose a unique name; no component will be adopted.');
    const raw = rows[0]; if (!raw) continue;
    const remoteId = guidValue(raw[route.id]);
    const logical = raw.objecttypecode ?? raw.returnedtypecode;
    const table = resources.find(item => item.kind === 'table' && item.schemaName.toLowerCase() === logical);
    const tableSchemaName = table?.schemaName ?? (typeof logical === 'string' ? logical : 'unknown');
    if (spec.kind === 'command') {
      const app = resources.find(r => r.kind === 'app' && r.remoteId === raw._appmoduleid_value);
      const library = resources.find(r => r.kind === 'webResource' && r.remoteId === raw._onclickeventjavascriptwebresourceid_value);
      const supported = raw.onclickeventtype === 2 && raw.context === 1 && raw.type === 0 && raw.isdisabled === false && raw.visibilitytype === 0 && (!publishedOnly || raw.componentstate === 0);
      let parameters = 'unsupported'; try { if (hashJson(JSON.parse(textValue(raw.onclickeventjavascriptparameters))) === hashJson([{ type: 5 }])) parameters = 'PrimaryControl'; } catch { /* Fail closed on unknown parameter encoding. */ }
      add(spec, raw, remoteId, { uniqueName: textValue(raw.uniquename), displayName: textValue(raw.buttonlabeltext), tooltip: textValue(raw.buttontooltiptitle), sequence: z.number().parse(raw.sequence), hidden: z.boolean().parse(raw.hidden), app: app?.resourceId ?? 'unowned', library: library?.resourceId ?? 'unowned', contextTable: resources.find(r => r.kind === 'table' && r.remoteId === raw._contextentity_value)?.resourceId ?? null, table: textValue(raw.contextvalue), functionName: textValue(raw.onclickeventjavascriptfunctionname), parameters: supported ? parameters : 'unsupported', location: z.number().parse(raw.location), solutionMember: member(remoteId, 'command') });
    } else if (spec.kind === 'webResource') {
      add(spec, raw, remoteId, { uniqueName: textValue(raw.name), displayName: textValue(raw.displayname), contentHash: hashJson(Buffer.from(textValue(raw.content), 'base64').toString('utf8')), webResourceType: z.number().parse(raw.webresourcetype), solutionMember: member(remoteId, 'webResource') });
    } else if (spec.kind === 'form') {
      const fields = elements(textValue(raw.formxml), 'control').map(item => item.getAttribute('datafieldname')).filter((item): item is string => Boolean(item));
      add(spec, raw, remoteId, { displayName: textValue(raw.name), tableSchemaName, fields: raw.type === 2 ? fields : ['unsupported:formType'], ...(spec.properties.reveal ? { reveal: observeReveal(textValue(raw.formxml), spec.properties.reveal) } : {}), solutionMember: member(remoteId, 'form', table) });
    } else if (spec.kind === 'view') {
      const fetchxml = textValue(raw.fetchxml); const layoutxml = textValue(raw.layoutxml);
      const conditions = elements(fetchxml, 'condition');
      const activeOnly = conditions.length === 0 ? false : conditions.length === 1 && conditions[0]!.getAttribute('attribute') === 'statecode' && conditions[0]!.getAttribute('operator') === 'eq' && conditions[0]!.getAttribute('value') === '0' ? true : 'unsupported:filter';
      const columns = elements(layoutxml, 'cell').map(item => item.getAttribute('name') ?? 'unknown');
      const orderBy = elements(fetchxml, 'order').map(item => ({ column: item.getAttribute('attribute') ?? 'unknown', direction: item.getAttribute('descending') === 'true' ? 'descending' : 'ascending' }));
      add(spec, raw, remoteId, { displayName: textValue(raw.name), tableSchemaName, columns, orderBy,
        activeOnly: raw.querytype === 0 && elements(fetchxml, 'link-entity').length === 0 ? activeOnly : 'unsupported:viewShape', solutionMember: member(remoteId, 'view', table) });
    } else if (spec.kind === 'sitemap') {
      const navigation = elements(textValue(raw.sitemapxml), 'SubArea').map(item => ({ table: item.getAttribute('Entity') ?? 'unsupported:url',
        title: item.getElementsByTagName('Title').item(0)?.getAttribute('Title') ?? '', group: item.parentElement?.getElementsByTagName('Title').item(0)?.getAttribute('Title') ?? '' }));
      add(spec, raw, remoteId, { ...sitemapIdentity(project, raw), navigation, solutionMember: member(remoteId, 'sitemap') });
    } else if (spec.kind === 'role') {
      add(spec, raw, remoteId, { displayName: textValue(raw.name), businessUnit: guidValue(raw._businessunitid_value) === rootUnitId ? 'root' : 'other', solutionMember: member(remoteId, 'role') });
    } else {
      const publisher = resources.find(item => item.kind === 'publisher' && item.properties.uniqueName === project.solution.publisher.uniqueName);
      if (!publisher) throw new PowerCanvasError('PF-MDA-012', 'App publisher cannot be verified.', 'Complete publisher discovery before app reconciliation.');
      const solutionMember = member(remoteId, 'app');
      const knownAppId = owned?.remoteId === remoteId || verifiedAppIds.has(remoteId) ? remoteId : undefined;
      let active;
      if (guidValue(raw._publisherid_value) !== publisher.remoteId && knownAppId && solutionMember) {
        const layers = await http.all("solutions?$select=solutionid,uniquename,ismanaged,_publisherid_value&$filter=uniquename eq 'Active'");
        if (layers.length === 1) active = { solutionid: guidValue(layers[0]!.solutionid), publisherId: guidValue(layers[0]!._publisherid_value), uniqueName: textValue(layers[0]!.uniquename), isManaged: layers[0]!.ismanaged !== false };
      }
      const publishedRow = published.find(item => item.appmoduleid === remoteId && item.componentstate === 0);
      const publishedIdentityVerified = raw.componentstate === 1 && publishedRow ? Boolean(appIdentity(project, publishedRow, publisher.remoteId, { knownAppId, solutionMember, active })) : false;
      add(spec, raw, remoteId, { ...appIdentity(project, raw, publisher.remoteId, { knownAppId, solutionMember, active, publishedIdentityVerified }), displayName: textValue(raw.name), clientType: z.number().int().min(1).max(31).parse(raw.clienttype), solutionMember });
    }
  }
  return { ...base, providerVersions: { ...base.providerVersions, 'model-driven': MODEL_VERSION }, coverage: [...base.coverage, ...MODEL_KINDS.map(kind => ({ kind, status: 'complete' as const }))], resources };
}
