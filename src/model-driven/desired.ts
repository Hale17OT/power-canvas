import type { Project } from '../ir/schema.js';
import { resourceId } from '../ir/identity.js';
import type { DesiredResource } from '../dataverse/desired.js';
import { hashJson } from '../core/json.js';
import { revealIdentity, revealScript } from './reveal.js';

export const MODEL_VERSION = '0.2.0-experimental.1';
export const MODEL_KINDS = ['webResource', 'form', 'view', 'sitemap', 'role', 'rolePermissions', 'app', 'command', 'appComponents', 'appAccess'];
export const modelId = (project: Project, kind: string, ...path: string[]) => resourceId(project.project.id, 'model-driven', kind, path);
export const sitemapName = (appUniqueName: string): string => `${appUniqueName.length <= 37 ? appUniqueName : appUniqueName.slice(0, 25) + hashJson(appUniqueName).slice(0, 8)}Nav`;
export function fieldName(project: Project, tableKey: string, field: string): string {
  return project.dataverse.tables[tableKey]?.columns[field]?.schemaName.toLowerCase() ??
    Object.values(project.dataverse.relationships).find(item => item.fromTable === tableKey && item.lookup.key === field)?.lookup.schemaName.toLowerCase() ?? field;
}
export function modelResources(project: Project): DesiredResource[] {
  const result: DesiredResource[] = [];
  const solution = resourceId(project.project.id, 'dataverse', 'solution', ['solution']);
  const tableId = (key: string) => resourceId(project.project.id, 'dataverse', 'table', [key]);
  const columnIds=(table:string,fields:string[])=>[...new Set(fields)].filter(f=>project.dataverse.tables[table]?.columns[f]&&f!==project.dataverse.tables[table]?.primaryName).map(f=>resourceId(project.project.id,'dataverse','column',[table,f]));
  const add = (kind: string, path: string[], schemaName: string, properties: DesiredResource['properties'], dependencies: string[]) =>
    result.push({ resourceId: modelId(project, kind, ...path), provider: 'model-driven', kind, schemaName, properties, dependencies });
  const depths: Record<string, string> = { user: 'Basic', businessUnit: 'Local', parentChildBusinessUnit: 'Deep', organization: 'Global' };
  for (const [roleKey, role] of Object.entries(project.security.roles).sort()) {
    add('role', [roleKey], `${project.solution.publisher.prefix}_Role_${roleKey}`, { displayName: role.displayName, businessUnit: 'root', solutionMember: true }, [solution]);
    const grants = Object.entries(role.tables).flatMap(([key, privileges]) => Object.entries(privileges).filter(([,depth])=>depth!=='none').map(([privilege, depth]) => ({
      privilegeName: `prv${privilege[0]!.toUpperCase()}${privilege.slice(1)}${project.dataverse.tables[key]!.schemaName.toLowerCase()}`, depth: depths[depth ?? '']! }))).sort((a, b) => a.privilegeName.localeCompare(b.privilegeName));
    add('rolePermissions', [roleKey], `${project.solution.publisher.prefix}_RolePermissions_${roleKey}`, { role: modelId(project, 'role', roleKey), grants },
      [modelId(project, 'role', roleKey), ...Object.keys(role.tables).map(tableId)]);
  }
  for (const [appKey, app] of Object.entries(project.apps).sort()) {
    const components: string[] = app.tables.map(tableId);
    for (const [key, form] of Object.entries(app.forms).sort()) {
      const formId = modelId(project, 'form', appKey, key); components.push(formId);
      const reveal = form.reveal ? revealIdentity(project.solution.publisher.prefix, appKey, key, form.reveal.fields.map(field => fieldName(project, form.table, field))) : undefined;
      if (reveal) add('webResource', [appKey, key], reveal.libraryName, { uniqueName: reveal.libraryName, displayName: `PowerCanvas ${key} reveal`, contentHash: hashJson(revealScript(reveal)), webResourceType: 3, solutionMember: true }, [solution]);
      add('form', [appKey, key], `${app.uniqueName}_${key}`, { displayName: form.displayName, tableSchemaName: project.dataverse.tables[form.table]!.schemaName,
        fields: (form.layout?.flatMap(t=>t.sections.flatMap(s=>s.fields.map(f=>f.field)))??form.fields).map(field => fieldName(project, form.table, field)),...(form.layout?{layout:form.layout.map(t=>({...t,sections:t.sections.map(s=>({...s,fields:s.fields.map(f=>({...f,field:fieldName(project,form.table,f.field)}))}))}))}:{}), ...(reveal ? { reveal } : {}), solutionMember: true },
      [tableId(form.table), ...columnIds(form.table,form.fields), ...(reveal ? [modelId(project, 'webResource', appKey, key)] : []), ...Object.entries(project.dataverse.relationships).filter(([, rel]) => rel.fromTable === form.table && form.fields.includes(rel.lookup.key)).map(([key]) => resourceId(project.project.id, 'dataverse', 'relationship', [key]))]);
    }
    for (const [key, view] of Object.entries(app.views).sort()) {
      components.push(modelId(project, 'view', appKey, key));
      add('view', [appKey, key], `${app.uniqueName}_${key}`, { displayName: view.displayName, tableSchemaName: project.dataverse.tables[view.table]!.schemaName,
        columns: view.columns.map(field => fieldName(project, view.table, field)), activeOnly: view.activeOnly,
        orderBy: view.orderBy.map(order => ({ column: fieldName(project, view.table, order.column), direction: order.direction })),...(view.filters?{filters:view.filters.map(f=>({...f,field:fieldName(project,view.table,f.field)}))}:{}), solutionMember: true }, [tableId(view.table),...columnIds(view.table,[...view.columns,...view.orderBy.map(o=>o.column),...(view.filters??[]).map(f=>f.field)]),...Object.entries(project.dataverse.relationships).filter(([,r])=>r.fromTable===view.table&&[...view.columns,...view.orderBy.map(s=>s.column),...(view.filters??[]).map(f=>f.field)].includes(r.lookup.key)).map(([k])=>resourceId(project.project.id,'dataverse','relationship',[k]))]);
    }
    components.push(modelId(project, 'sitemap', appKey));
    add('sitemap', [appKey], sitemapName(app.uniqueName), { uniqueName: sitemapName(app.uniqueName),
      navigation: app.navigation.map(item => ({...(app.navigation.some(n=>n.area)?{area:item.area??'Work'}:{}), group: item.group, table: project.dataverse.tables[item.table]!.schemaName.toLowerCase(), title: project.dataverse.tables[item.table]!.pluralName })), solutionMember: true }, [solution, ...app.tables.map(tableId)]);
    add('app', [appKey], app.uniqueName, { uniqueName: app.uniqueName, displayName: app.displayName, clientType: 4, solutionMember: true }, [solution]);
    for (const [key, command] of Object.entries(app.commands ?? {}).sort()) {
      const form = app.forms[command.form];
      if (!form?.reveal) throw new Error(`Command ${key} must target a form with declared reveal fields.`);
      const reveal = revealIdentity(project.solution.publisher.prefix, appKey, command.form, form.reveal.fields.map(field => fieldName(project, form.table, field)));
      const uniqueName = `${project.solution.publisher.prefix}_PowerCanvasCommand_${hashJson([project.project.id, appKey, key]).slice(0, 24)}`;
      add('command', [appKey, key], uniqueName, { uniqueName, displayName: command.label, tooltip: command.tooltip, sequence: command.sequence, hidden: !command.visible, app: modelId(project, 'app', appKey), table: project.dataverse.tables[form.table]!.schemaName.toLowerCase(), library: modelId(project, 'webResource', appKey, command.form), functionName: `${reveal.namespace}.toggle`, parameters: 'PrimaryControl', ...(command.bindingVersion === 2 ? { contextTable: tableId(form.table) } : {}), location: 0, solutionMember: true }, [solution, modelId(project, 'app', appKey), modelId(project, 'form', appKey, command.form), modelId(project, 'webResource', appKey, command.form)]);
    }
    add('appComponents', [appKey], `${app.uniqueName}_Components`, { app: modelId(project, 'app', appKey), components: components.sort() }, [modelId(project, 'app', appKey), ...components]);
    const roles = (project.security.appAccess[appKey]??[]).map(key => modelId(project, 'role', key)).sort();
    add('appAccess', [appKey], `${app.uniqueName}_Access`, { app: modelId(project, 'app', appKey), roles },
      [modelId(project, 'app', appKey), ...roles, ...(project.security.appAccess[appKey]??[]).map(key => modelId(project, 'rolePermissions', key))]);
  }
  return result;
}
export const modelPublicationHash = (project: Project): string => hashJson(modelResources(project).map(resource => ({ resourceId: resource.resourceId, properties: resource.properties })));

