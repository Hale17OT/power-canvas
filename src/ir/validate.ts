import type { Diagnostic } from '../core/errors.js';
import type { Project } from './schema.js';
import { canvasDiagnostics } from '../canvas/compile.js';
import { compileFlows } from '../flows/compile.js';

export const SYSTEM_VIEW_COLUMNS = new Set(['createdon', 'modifiedon', 'ownerid', 'statecode', 'statuscode']);

export function validateSemantics(project: Project): Diagnostic[] {
  const diagnostics: Diagnostic[] = canvasDiagnostics(project);
  if(project.resources)try{compileFlows(project);}catch(error){diagnostics.push({code:'PF-FLOW-001',severity:'error',path:'resources',message:error instanceof Error?error.message:'Invalid flow resources.'});}
  const fail = (path: string, message: string): void => {
    diagnostics.push({ code: 'PF-VALIDATION-002', severity: 'error', path, message });
  };
  const { tables, relationships } = project.dataverse;
  const prefix = `${project.solution.publisher.prefix}_`;
  const qualified = (name: string, path: string): void => {
    if (!name.startsWith(prefix)) fail(path, `Schema name must start with publisher prefix ${prefix}.`);
  };
  const unique = (values: readonly string[], path: string): void => {
    if (new Set(values.map(value => value.toLowerCase())).size !== values.length) fail(path, 'Duplicate identities or references are not allowed (case insensitive).');
  };
  qualified(project.solution.uniqueName, 'solution.uniqueName');
  if (project.solution.publisher.prefix.startsWith('mscrm')) fail('solution.publisher.prefix', 'The mscrm prefix is reserved.');
  if (project.solution.version.split('.').some(part => Number(part) > 65535)) fail('solution.version', 'Version components must not exceed 65535.');
  if (Object.keys(tables).length === 0 && !Object.keys(project.resources?.flows??{}).length && !Object.keys(project.resources?.workflowRecipes??{}).length) fail('dataverse.tables', 'Declare at least one table or flow.');
  unique(Object.keys(tables), 'dataverse.tables');
  unique(Object.values(tables).map(table => table.schemaName), 'dataverse.tables');
  unique(Object.keys(relationships), 'dataverse.relationships');
  unique(Object.values(relationships).map(rel => rel.schemaName), 'dataverse.relationships');

  for (const [tableKey, table] of Object.entries(tables)) {
    const path = `dataverse.tables.${tableKey}`;
    qualified(table.schemaName, `${path}.schemaName`);
    unique(Object.keys(table.columns), `${path}.columns`);
    const lookups = Object.values(relationships).filter(rel => rel.fromTable === tableKey).map(rel => rel.lookup);
    unique([...Object.values(table.columns), ...lookups].map(column => column.schemaName), `${path}.columns`);
    unique([...Object.keys(table.columns), ...lookups.map(lookup => lookup.key)], `${path}.columns`);
    const primary = table.columns[table.primaryName];
    if (!primary || primary.type !== 'text' || primary.maxLength > 850) {
      fail(`${path}.primaryName`, 'Primary name must reference a text column of at most 850 characters.');
    }
    for (const [columnKey, column] of Object.entries(table.columns)) {
      const columnPath = `${path}.columns.${columnKey}`;
      qualified(column.schemaName, `${columnPath}.schemaName`);
      if ((column.type === 'integer' || column.type === 'decimal') && column.min > column.max) fail(columnPath, 'Minimum cannot exceed maximum.');
      if (column.type === 'decimal' && (column.min < -100000000000 || column.max > 100000000000)) fail(columnPath, 'Decimal range exceeds the bounded Dataverse range.');
      if (column.type === 'choice') {
        const values = column.choices.map(choice => choice.value);
        if (new Set(values).size !== values.length) fail(`${columnPath}.choices`, 'Choice values must be unique.');
        const first = project.solution.publisher.optionValuePrefix * 10000;
        if (values.some(value => value < first || value > first + 9999)) fail(`${columnPath}.choices`, 'Choice values must use the declared publisher option-value range.');
        if (column.default !== undefined && !values.includes(column.default)) fail(`${columnPath}.default`, 'Choice default must reference a declared numeric value.');
      }
    }
  }
  for (const [key, rel] of Object.entries(relationships)) {
    const path = `dataverse.relationships.${key}`;
    qualified(rel.schemaName, `${path}.schemaName`);
    qualified(rel.lookup.schemaName, `${path}.lookup.schemaName`);
    if (!tables[rel.fromTable]) fail(`${path}.fromTable`, 'Referencing table does not exist.');
    if (!tables[rel.toTable]) fail(`${path}.toTable`, 'Referenced table does not exist.');
  }

  const hasField = (table: string, field: string, system: boolean): boolean =>
    Boolean(tables[table]?.columns[field]) ||
    Object.values(relationships).some(rel => rel.fromTable === table && rel.lookup.key === field) ||
    (system && SYSTEM_VIEW_COLUMNS.has(field));
  unique(Object.keys(project.apps), 'apps');
  unique(Object.values(project.apps).map(app => app.uniqueName), 'apps');
  for (const [key, app] of Object.entries(project.apps)) {
    const path = `apps.${key}`;
    qualified(app.uniqueName, `${path}.uniqueName`);
    unique(app.tables, `${path}.tables`);
    for (const table of app.tables) if (!tables[table]) fail(`${path}.tables`, 'Included table does not exist.');
    const checkFields = (table: string, fields: string[], itemPath: string, system: boolean): void => {
      if (!app.tables.includes(table)) fail(itemPath, 'Component table must be included in the application.');
      unique(fields, itemPath);
      if (fields.some(field => !hasField(table, field, system))) fail(itemPath, 'Component references a missing or unsupported column.');
    };
    unique(Object.keys(app.forms), `${path}.forms`);
    unique(Object.keys(app.views), `${path}.views`);
    unique(Object.keys(app.commands ?? {}), `${path}.commands`);
    for (const [commandKey, command] of Object.entries(app.commands ?? {})) if (!app.forms[command.form]?.reveal) fail(`${path}.commands.${commandKey}.form`, 'toggleDetails requires a form with declared reveal fields.');
    for (const [formKey, form] of Object.entries(app.forms)) {
      checkFields(form.table, form.fields, `${path}.forms.${formKey}`, false);
      if (form.reveal) {
        unique(form.reveal.fields, `${path}.forms.${formKey}.reveal.fields`);
        for (const field of form.reveal.fields) if (!form.fields.includes(field) || !tables[form.table]?.columns[field] || tables[form.table]!.columns[field]!.required !== 'none') fail(`${path}.forms.${formKey}.reveal.fields`, 'Reveal fields must be optional owned columns included on this form. Visibility is not security.');
      }
    }
    for (const [viewKey, view] of Object.entries(app.views)) {
      checkFields(view.table, view.columns, `${path}.views.${viewKey}`, true);
      checkFields(view.table, view.orderBy.map(sort => sort.column), `${path}.views.${viewKey}.orderBy`, true);
    }
    for (const nav of app.navigation) if (!app.tables.includes(nav.table)) fail(`${path}.navigation`, 'Navigation table must be included in the application.');
  }
  unique(Object.keys(project.security.roles), 'security.roles');
  for (const [roleKey, role] of Object.entries(project.security.roles)) {
    const path = `security.roles.${roleKey}`;
    if (Object.keys(role.tables).length === 0) fail(path, 'Role must declare at least one table privilege.');
    for (const [table, privileges] of Object.entries(role.tables)) {
      if (!tables[table]) fail(`${path}.tables.${table}`, 'Role table does not exist.');
      if (Object.keys(privileges).length === 0) fail(`${path}.tables.${table}`, 'Declare at least one privilege.');
      if (tables[table]?.ownership === 'organization' && Object.values(privileges).some(depth => depth !== 'organization')) {
        fail(`${path}.tables.${table}`, 'Organization-owned tables require organization privilege depth.');
      }
    }
  }
  for (const [app, roles] of Object.entries(project.security.appAccess)) {
    const path = `security.appAccess.${app}`;
    if (!project.apps[app]) fail(path, 'Application does not exist.');
    unique(roles, path);
    if (roles.some(role => !project.security.roles[role])) fail(path, 'Access role does not exist.');
  }
  for (const app of Object.keys(project.apps)) {
    if (!project.security.appAccess[app]?.length) fail(`security.appAccess.${app}`, 'Each app requires explicit role access intent.');
  }
  return diagnostics;
}
