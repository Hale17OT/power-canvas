import { create } from 'xmlbuilder2';
import { z } from 'zod';
import type { Project } from '../ir/schema.js';
import type { Observation, PlannedOperation } from '../state/models.js';
import type { DataverseHttp } from '../dataverse/http.js';
import type { Mutation } from '../dataverse/mutations.js';
import { metadataPath } from '../dataverse/discovery.js';
import { guidValue, rawObject, textValue } from '../dataverse/normalize.js';
import { modelResources } from './desired.js';
import { formXml, sitemapXml, viewXml } from './xml.js';
import { componentTypes, observeModel } from './discovery.js';
import { PowerCanvasError } from '../core/errors.js';
import { hashJson } from '../core/json.js';
import { projection } from '../planner/dataverse.js';
import { publisherLocalName } from './names.js';
import { addRevealToForm, revealSchema, revealScript } from './reveal.js';
export { publisherLocalName } from './names.js';

// Microsoft's documented built-in app icon is a read-only dependency, never adopted or modified.
export const DEFAULT_APP_ICON_ID = '953b9fac-1e5e-e611-80d6-00155ded156f';
export async function mutateModel(project: Project, operation: PlannedOperation, observed: Observation, http: DataverseHttp, mutate: Mutation): Promise<void> {
  const headers = { 'MSCRM.SolutionUniqueName': project.solution.uniqueName };
  const properties = operation.after;
  if (!properties) throw new PowerCanvasError('PF-MDA-006', 'Model-driven operation has no desired properties.', 'Regenerate the plan.');
  const resolve = (id: string) => {
    const resource = observed.resources.find(item => item.resourceId === id);
    if (!resource) throw new PowerCanvasError('PF-MDA-007', 'A verified component dependency is missing.', 'Stop and reobserve the partial execution.');
    return resource;
  };
  if (operation.action === 'publish') {
    const apps = z.array(z.string()).parse(properties.apps).map(id => resolve(id));
    for (const app of apps) {
      const response = rawObject((await http.request(`ValidateApp(AppModuleId=${guidValue(app.remoteId)})`)).data);
      const validation = rawObject(response.AppValidationResponse);
      if (validation.ValidationSuccess !== true || !Array.isArray(validation.ValidationIssueList) || validation.ValidationIssueList.length) throw new PowerCanvasError('PF-MDA-008', 'App validation reported missing components or issues.', 'Inspect ValidateApp results before publishing; no designer repair is implied.');
    }
    const root = create().ele('importexportxml'); const entities = root.ele('entities');
    for (const table of z.array(z.string()).parse(properties.tables)) entities.ele('entity').txt(table);
    const maps = root.ele('sitemaps'); for (const id of z.array(z.string()).parse(properties.sitemaps)) maps.ele('sitemap').txt(guidValue(resolve(id).remoteId));
    const modules = root.ele('appmodules'); for (const app of apps) modules.ele('appmodule').txt(guidValue(app.remoteId));
    const libraries = root.ele('webresources'); for (const id of z.array(z.string()).default([]).parse(properties.webResources)) libraries.ele('webresource').txt(guidValue(resolve(id).remoteId));
    await mutate('publish', 'PublishXml', 'POST', { ParameterXml: root.end({ headless: true }) });
    const published = await observeModel(project, { ...observed, resources: observed.resources.filter(item => item.provider !== 'model-driven') }, http, undefined, true, new Set(apps.map(app => app.remoteId)));
    for (const spec of modelResources(project)) {
      const current = published.resources.find(item => item.resourceId === spec.resourceId);
      if (!current || hashJson(projection(current, spec.properties)) !== hashJson(spec.properties)) throw new PowerCanvasError('PF-DV-007', 'Published model-driven metadata does not match the reviewed intent.', 'Inspect published and unpublished observations before another scoped publication.');
    }
    return;
  }
  const spec = modelResources(project).find(item => item.resourceId === operation.resourceId);
  if (!spec) throw new PowerCanvasError('PF-MDA-006', 'Unknown model-driven resource.', 'Regenerate the plan from supported IR.');
  switch (operation.action) {
    case 'createCommand': {
      const app = resolve(textValue(properties.app)); const library = resolve(textValue(properties.library)); const table = resolve(textValue(properties.contextTable));
      await mutate('create', 'appactions', 'POST', { name: properties.uniqueName, uniquename: properties.uniqueName, buttonlabeltext: properties.displayName, buttontooltiptitle: properties.tooltip, buttonaccessibilitytext: properties.tooltip, sequence: properties.sequence, context: 1, contextvalue: properties.table, location: 0, type: 0, origin: 0, visibilitytype: 0, hidden: properties.hidden, isdisabled: false, onclickeventtype: 2, onclickeventjavascriptfunctionname: properties.functionName, onclickeventjavascriptparameters: '[{"type":5}]', 'ContextEntity@odata.bind': `/entities(${guidValue(table.remoteId)})`, 'AppModuleId@odata.bind': `/appmodules(${guidValue(app.remoteId)})`, 'OnClickEventJavaScriptWebResourceId@odata.bind': `/webresourceset(${guidValue(library.remoteId)})` }, headers); return;
    }
    case 'updateOwnedProperties': {
      const app = resolve(operation.resourceId);
      if (app.kind === 'command') {
        const raw = rawObject((await http.request(`appactions(${guidValue(app.remoteId)})?$select=sequence,hidden`)).data);
        if (raw.sequence !== operation.before?.sequence || raw.hidden !== operation.before?.hidden) throw new Error('Command changed after planning.');
        await mutate('command-order', `appactions(${guidValue(app.remoteId)})`, 'PATCH', { sequence: properties.sequence, hidden: properties.hidden }, { ...headers, 'If-Match': textValue(raw['@odata.etag']) }); return;
      }
      if (app.kind === 'form') {
        const rows = await http.all(`systemforms/Microsoft.Dynamics.CRM.RetrieveUnpublishedMultiple()?$select=formid,formxml&$filter=formid eq ${guidValue(app.remoteId)}`);
        const raw = rows[0] ?? rawObject((await http.request(`systemforms(${guidValue(app.remoteId)})?$select=formid,formxml`)).data);
        const attributes = await http.all(`${metadataPath(textValue(properties.tableSchemaName))}/Attributes?$select=LogicalName,AttributeType,DisplayName`);
        const formxml = addRevealToForm(textValue(raw.formxml), spec, attributes);
        await mutate('form-reveal', `systemforms(${guidValue(app.remoteId)})`, 'PATCH', { formxml }, { ...headers, 'If-Match': textValue(raw['@odata.etag']) }); return;
      }
      if (app.kind !== 'app' || app.properties.clientType !== 2 || properties.clientType !== 4 || app.properties.solutionMember !== true) throw new PowerCanvasError('PF-MDA-006', 'Only the planned owned-app Web to Unified Interface conversion is supported.', 'Regenerate a reviewed plan.');
      await mutate('client-conversion', `appmodules(${guidValue(app.remoteId)})`, 'PATCH', { clienttype: 4 }, headers); return;
    }
    case 'createWebResource': {
      const form = modelResources(project).find(item => item.kind === 'form' && item.dependencies.includes(spec.resourceId));
      const content = revealScript(revealSchema.parse(form?.properties.reveal));
      if (hashJson(content) !== properties.contentHash) throw new PowerCanvasError('PF-MDA-013', 'Generated script hash differs from the reviewed plan.', 'Regenerate the plan.');
      await mutate('create', 'webresourceset', 'POST', { name: properties.uniqueName, displayname: properties.displayName, webresourcetype: 3, content: Buffer.from(content, 'utf8').toString('base64') }, headers); return;
    }
    case 'createForm': {
      const table = textValue(properties.tableSchemaName);
      const definition = rawObject((await http.request(`${metadataPath(table)}?$select=CanCreateForms`)).data);
      if (rawObject(definition.CanCreateForms).Value !== true) throw new PowerCanvasError('PF-MDA-002', 'This table does not permit form creation.', 'Use supported standard custom tables.');
      const attributes = await http.all(`${metadataPath(table)}/Attributes?$select=LogicalName,AttributeType,DisplayName`);
      const initial = formXml(spec, attributes);
      await mutate('create', 'systemforms', 'POST', { name: properties.displayName, objecttypecode: table.toLowerCase(), type: 2, formactivationstate: 1, formxml: properties.reveal ? addRevealToForm(initial, spec, attributes) : initial }, headers); return;
    }
    case 'createView': {
      const table = textValue(properties.tableSchemaName);
      const definition = rawObject((await http.request(`${metadataPath(table)}?$select=LogicalName,PrimaryIdAttribute,PrimaryNameAttribute,ObjectTypeCode,CanCreateViews`)).data);
      if (rawObject(definition.CanCreateViews).Value !== true) throw new PowerCanvasError('PF-MDA-002', 'This table does not permit view creation.', 'Use supported standard custom tables.');
      await mutate('create', 'savedqueries', 'POST', { name: properties.displayName, returnedtypecode: table.toLowerCase(), querytype: 0, isdefault: false, ...viewXml(spec, definition) }, headers); return;
    }
    case 'createSitemap': await mutate('create', 'sitemaps', 'POST', { sitemapname: properties.uniqueName, sitemapnameunique: publisherLocalName(project, properties.uniqueName), sitemapxml: sitemapXml(spec), isappaware: true }, headers); return;
    case 'createRole': {
      const units = await http.all('businessunits?$select=businessunitid&$filter=_parentbusinessunitid_value eq null');
      if (units.length !== 1) throw new PowerCanvasError('PF-MDA-003', 'Root business unit is ambiguous.', 'Complete target discovery.');
      await mutate('create', 'roles', 'POST', { name: properties.displayName, 'businessunitid@odata.bind': `/businessunits(${guidValue(units[0]!.businessunitid)})` }, headers); return;
    }
    case 'grantRolePrivileges': {
      const role = resolve(textValue(properties.role)); const definitions = await http.all('privileges?$select=privilegeid,name');
      const Privileges = z.array(z.object({ privilegeName: z.string(), depth: z.enum(['Basic', 'Local', 'Deep', 'Global']) })).parse(properties.grants).map(grant => {
        const privilege = definitions.find(item => typeof item.name === 'string' && item.name.toLowerCase() === grant.privilegeName.toLowerCase());
        if (!privilege) throw new PowerCanvasError('PF-MDA-009', 'A required custom-table privilege is unavailable.', 'Verify the published schema; no broad substitute privileges will be granted.');
        return { PrivilegeId: guidValue(privilege.privilegeid), Depth: grant.depth };
      });
      await mutate('grant', `roles(${guidValue(role.remoteId)})/Microsoft.Dynamics.CRM.AddPrivilegesRole`, 'POST', { Privileges }); return;
    }
    case 'createApp': {
      const publisher = observed.resources.find(item => item.kind === 'publisher' && item.properties.uniqueName === project.solution.publisher.uniqueName);
      if (!publisher) throw new PowerCanvasError('PF-MDA-007', 'The experiment publisher has not been verified.', 'Reobserve the dedicated solution and publisher.');
      await http.request(`webresourceset(${DEFAULT_APP_ICON_ID})?$select=webresourceid`);
      await mutate('create', 'appmodules', 'POST', { name: properties.displayName, uniquename: publisherLocalName(project, properties.uniqueName), clienttype: 4, webresourceid: DEFAULT_APP_ICON_ID,
        'publisher_appmodule_appmodule@odata.bind': `/publishers(${guidValue(publisher.remoteId)})` }, headers); return;
    }
    case 'addAppComponents': {
      const app = resolve(textValue(properties.app));
      const names: Record<string, { type: string; key: string }> = { form: { type: 'systemform', key: 'formid' }, view: { type: 'savedquery', key: 'savedqueryid' }, sitemap: { type: 'sitemap', key: 'sitemapid' } };
      const Components = await Promise.all(z.array(z.string()).parse(properties.components).map(async id => {
        const resource = resolve(id); const shape = names[resource.kind];
        if (resource.kind === 'table') {
          // The OData type identifies the table. Using CRM.entity attaches the
          // platform Entity table, even when entityid contains our metadata ID.
          const definition = rawObject((await http.request(`${metadataPath(resource.schemaName)}?$select=LogicalName,PrimaryIdAttribute,MetadataId`)).data);
          if (guidValue(definition.MetadataId) !== resource.remoteId || definition.LogicalName !== resource.schemaName.toLowerCase()) throw new PowerCanvasError('PF-MDA-007', 'App table metadata differs from the verified dependency.', 'Stop and rediscover before adding app components.');
          return { '@odata.type': `Microsoft.Dynamics.CRM.${textValue(definition.LogicalName)}`, [textValue(definition.PrimaryIdAttribute)]: guidValue(resource.remoteId) };
        }
        if (!shape) throw new PowerCanvasError('PF-MDA-006', 'Unsupported app component type.', 'Use only tables, forms, views and sitemap.');
        return { '@odata.type': `Microsoft.Dynamics.CRM.${shape.type}`, [shape.key]: guidValue(resource.remoteId) };
      }));
      await mutate('components', 'AddAppComponents', 'POST', { AppId: guidValue(app.remoteId), Components }); return;
    }
    case 'setAppAccess': {
      const app = resolve(textValue(properties.app));
      for (const [index, id] of z.array(z.string()).parse(properties.roles).entries()) {
        const role = resolve(id);
        await mutate(`associate-${index}`, `appmodules(${guidValue(app.remoteId)})/appmoduleroles_association/$ref`, 'POST', { '@odata.id': `${http.base}roles(${guidValue(role.remoteId)})` });
      }
      return;
    }
    default: throw new PowerCanvasError('PF-MDA-006', 'Unsupported model-driven action.', 'This adapter creates bounded new components only.');
  }
}
export async function modelMembership(project: Project, operation: PlannedOperation, observed: Observation, mutate: Mutation): Promise<void> {
  const resource = observed.resources.find(item => item.resourceId === operation.resourceId);
  if (!resource || resource.properties.solutionMember !== false) return;
  const type = componentTypes[resource.kind];
  if (type === undefined) throw new PowerCanvasError('PF-MDA-006', 'Unknown solution component type.', 'Do not guess a component type.');
  await mutate('membership', 'AddSolutionComponent', 'POST', { ComponentId: guidValue(resource.remoteId), ComponentType: type, SolutionUniqueName: project.solution.uniqueName,
    AddRequiredComponents: false, DoNotIncludeSubcomponents: true });
}
