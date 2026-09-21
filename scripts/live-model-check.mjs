// Opt-in, GET-only checks of published app metadata, explicit role grants and saved queries.
// This does not establish browser behavior or effective restricted/denied-user access.
import { parseArgs } from 'node:util';
import process from 'node:process';
import { resolve } from 'node:path';
import { loadProject } from '../dist/config/load.js';
import { connect } from '../dist/cli/remote.js';
import { DataverseHttp } from '../dist/dataverse/http.js';
import { DataverseDiscovery, metadataPath } from '../dist/dataverse/discovery.js';
import { LocalStateStore } from '../dist/state/local.js';
import { observeModel } from '../dist/model-driven/discovery.js';
import { createPlan } from '../dist/planner/dataverse.js';
import { executionPolicy } from '../dist/dataverse/isolation.js';
import { guidValue, rawObject, textValue } from '../dist/dataverse/normalize.js';
import { publicError } from '../dist/core/errors.js';

try {
  const { values } = parseArgs({ options: { project: { type: 'string' }, env: { type: 'string' }, 'default-experiment': { type: 'boolean', default: false } } });
  if (!values.project || !values.env) throw new Error('Explicit project and environment aliases are required.');
  const directory = resolve(values.project); const { project } = await loadProject(directory);
  const connected = await connect(directory, values.env);
  let reads = 0; let forbiddenMutationAttempts = 0;
  const http = new DataverseHttp(connected.http.base, connected.session, async (input, options) => {
    if (options?.method !== 'GET') { forbiddenMutationAttempts++; throw new Error('This check permits GET only.'); }
    reads++; return globalThis.fetch(input, options);
  });
  const store = new LocalStateStore(directory, project.project.id, connected.binding.target);
  const ownership = await store.readOwnership();
  const base = await new DataverseDiscovery(http).observe(project, connected.binding.target, ownership);
  const published = await observeModel(project, base, http, ownership, true);
  const plan = createPlan(project, published, ownership, 'all', new Date(), executionPolicy(connected.environment.organizationType, values['default-experiment'], true));
  const validations = [];
  for (const app of published.resources.filter(item => item.kind === 'app')) {
    const result = rawObject((await http.request(`ValidateApp(AppModuleId=${guidValue(app.remoteId)})`)).data).AppValidationResponse;
    validations.push({ resourceId: app.resourceId, result });
  }
  const views = [];
  for (const view of published.resources.filter(item => item.kind === 'view')) {
    const definition = rawObject((await http.request(`${metadataPath(textValue(view.properties.tableSchemaName))}?$select=EntitySetName`)).data);
    const rows = await http.all(`${textValue(definition.EntitySetName)}?savedQuery=${guidValue(view.remoteId)}`);
    views.push({ resourceId: view.resourceId, savedQueryExecuted: true, rowCount: rows.length });
  }
  const roles = [];
  for (const role of published.resources.filter(item => item.kind === 'role')) {
    const users = await http.all(`roles(${guidValue(role.remoteId)})/systemuserroles_association?$select=systemuserid`);
    const teams = await http.all(`roles(${guidValue(role.remoteId)})/teamroles_association?$select=teamid`);
    const permissions = published.resources.find(item => item.kind === 'rolePermissions' && item.properties.role === role.resourceId);
    roles.push({ resourceId: role.resourceId, explicitGrants: permissions?.properties.grants, platformDefaultGrants: permissions?.properties.platformDefaultGrants,
      assignedUserCount: users.length, assignedTeamCount: teams.length });
  }
  const ok = plan.operations.length === 0 && plan.blockers.length === 0 && validations.length > 0 && validations.every(item => item.result.ValidationSuccess === true && item.result.ValidationIssueList.length === 0);
  console.log(JSON.stringify({ ok, provenance: 'live tenant; GET-only published metadata and saved-query execution', environmentType: plan.executionPolicy.environmentType,
    nonDisposable: plan.executionPolicy.nonDisposable, observedAt: published.observedAt, semanticNoOp: plan.operations.length === 0 && plan.blockers.length === 0,
    operations: plan.operations.length, blockers: plan.blockers, validations, views, roles, observations: published, reads, forbiddenMutationAttempts, remoteMutations: 0,
    browserRuntime: 'not verified by this script', restrictedAndDeniedPersonas: 'not verified' }, null, 2));
  if (!ok) process.exitCode = 1;
} catch (error) {
  const safe = publicError(error);
  console.log(JSON.stringify({ ok: false, error: { code: safe.code, message: safe.message, remediation: safe.remediation } }, null, 2));
  process.exitCode = 1;
}
