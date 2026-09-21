// GET-only evidence/proposal builder. This file cannot execute a repair.
import { resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { loadProject } from '../dist/config/load.js';
import { connect } from '../dist/cli/remote.js';
import { LocalStateStore } from '../dist/state/local.js';
import { DataverseHttp } from '../dist/dataverse/http.js';
import { DataverseDiscovery, metadataPath } from '../dist/dataverse/discovery.js';
import { observeModel } from '../dist/model-driven/discovery.js';
import { mutateModel } from '../dist/model-driven/mutations.js';
import { createPlan, fingerprint } from '../dist/planner/dataverse.js';
import { hashJson } from '../dist/core/json.js';
import { guidValue, rawObject } from '../dist/dataverse/normalize.js';

const directory = resolve('examples/default-environment-experiment');
const { project } = await loadProject(directory); const connected = await connect(directory, 'experiment-default');
const original = JSON.parse((await readFile('.powercanvas/experiment2-assembly-plan.json', 'utf8')).replace(/^\uFEFF/, ''));
const { contentHash, ...planBody } = original;
if (hashJson(planBody) !== contentHash || original.sourceHash !== hashJson(project) || hashJson(original.target) !== hashJson(connected.binding.target) ||
  original.executionPolicy.environmentType !== 'Default' || !original.executionPolicy.nonDisposable) throw new Error('Original source, plan or target differs.');
const store = new LocalStateStore(directory, project.project.id, connected.binding.target);
const ownership = await store.readOwnership();
const failure = JSON.parse((await readFile('.powercanvas/experiment2-assembly-apply.json', 'utf8')).replace(/^\uFEFF/, ''));
const operation = original.operations.find(item => item.id === failure.failedOperation && item.action === 'addAppComponents');
const journal = await store.readJournal(failure.executionId);
if (failure.ok || failure.error?.code !== 'PF-DV-007' || !operation || journal.at(-1)?.status !== 'failed' ||
  !journal.some(item => item.operationId === `${operation.id}/components` && item.status === 'remoteSucceeded') ||
  journal.some(item => item.status === 'outcomeUnknown')) throw new Error('Original acknowledged failed association evidence is incomplete.');
let reads = 0;
const http = new DataverseHttp(connected.http.base, connected.session, async (input, init) => {
  if (init?.method !== 'GET') throw new Error('Repair preparation forbids every remote mutation.');
  reads++; return globalThis.fetch(input, init);
});
const base = await new DataverseDiscovery(http).observe(project, connected.binding.target, ownership);
const observed = await observeModel(project, base, http, ownership);
const app = observed.resources.find(item => item.resourceId === operation.after.app);
if (!app || !ownership.resources.some(item => item.resourceId === app.resourceId && item.remoteId === app.remoteId) || app.properties.solutionMember !== true ||
  ownership.resources.some(item => item.resourceId === operation.resourceId) || ownership.modelDrivenPublicationHash) throw new Error('The app must be owned, in the experiment solution, and not recorded as published/assembled.');
const published = await http.all(`appmodules?$select=appmoduleid&$filter=appmoduleid eq ${guidValue(app.remoteId)}`);
if (published.length) throw new Error('This proposal requires the new app to remain unpublished.');
const actual = await http.all(`appmodulecomponents?$select=appmodulecomponentid,objectid,componenttype,_appmoduleidunique_value&$filter=_appmoduleidunique_value eq ${guidValue(app.properties.componentLayerId)}`);
const builtin = rawObject((await http.request(`${metadataPath('entity')}?$select=LogicalName,SchemaName,MetadataId`)).data);
if (builtin.LogicalName !== 'entity') throw new Error('Unexpected platform table identity.');
const incorrect = actual.filter(item => item.componenttype === 1 && guidValue(item.objectid) === guidValue(builtin.MetadataId));
if (incorrect.length !== 2 || actual.length !== 7) throw new Error('Association set changed; a new review is required.');
const types = { form: 60, view: 26, sitemap: 62 };
const intended = operation.after.components.map(id => observed.resources.find(item => item.resourceId === id));
if (intended.some(item => !item || !ownership.resources.some(owned => owned.resourceId === item.resourceId && owned.remoteId === item.remoteId))) throw new Error('Every intended component must already be owned.');
const preserved = actual.filter(item => !incorrect.includes(item));
if (preserved.some(item => !intended.some(resource => resource.remoteId === guidValue(item.objectid) && types[resource.kind] === item.componenttype))) throw new Error('Unexpected extra component; stop.');
let correctedPayload;
await mutateModel(project, operation, observed, http, async (_step, path, method, body) => {
  if (path !== 'AddAppComponents' || method !== 'POST') throw new Error('Unexpected proposal action.');
  correctedPayload = body;
}); // Mutation is captured locally, never sent.
const tableTypes = new Set(intended.filter(item => item.kind === 'table').map(item => `Microsoft.Dynamics.CRM.${item.schemaName.toLowerCase()}`));
const addMissing = { ...correctedPayload, Components: correctedPayload.Components.filter(item => tableTypes.has(item['@odata.type'])) };
const currentPlan = createPlan(project, observed, ownership, 'all', new Date(), original.executionPolicy);
if (currentPlan.blockers.length !== 1 || currentPlan.blockers[0].resourceId !== operation.resourceId || currentPlan.blockers[0].code !== 'PF-PLAN-005') throw new Error('Additional planner blockers require a new review.');
const validation = (await http.request(`ValidateApp(AppModuleId=${guidValue(app.remoteId)})`)).data;
const proposal = {
  kind: 'PowerCanvas experiment association repair proposal', executableByCurrentApply: false, approvalRequired: true,
  reason: 'Removing an incorrect app reference is outside the authorized additive-only Default experiment policy.',
  target: connected.binding.target, environmentType: 'Default', nonDisposable: true, createdAt: new Date().toISOString(),
  originalPlanId: original.planId, originalExecutionId: failure.executionId, originalOperationId: operation.id,
  sourceHash: hashJson(project), observationHash: fingerprint(observed), ownershipRevision: ownership.revision,
  app: { resourceId: app.resourceId, remoteId: app.remoteId, serviceUniqueName: app.properties.serviceUniqueName, published: false },
  before: actual, incorrectReferences: incorrect, preserveReferences: preserved,
  proposedRequests: [
    { method: 'POST', path: 'RemoveAppComponents', body: { AppId: app.remoteId, Components: [{ '@odata.type': 'Microsoft.Dynamics.CRM.entity', entityid: guidValue(builtin.MetadataId) }] },
      verifyBeforeContinuing: 'Both incorrect Entity references absent; all five intended form/view/sitemap references unchanged. Stop on any other result.' },
    { method: 'POST', path: 'AddAppComponents', body: addMissing,
      verifyBeforeContinuing: 'Exactly the two owned experiment tables, two owned forms, two owned views and owned sitemap; zero unexpected references.' },
  ],
  preservation: ['No table, column, record, form, view, sitemap, role or app deletion', 'No tenant user/team role changes', 'No changes to the platform Entity table', 'Original failed journal retained'],
  subsequentSteps: ['Journal any explicitly approved repair under the project/target lock with fresh target and before-state checks',
    'Reconcile ownership only after exact full component verification; do not adopt the erroneous reference',
    'Review a fresh plan for experiment-role association and scoped publication; then require no-op and published checks'],
  currentBlockers: currentPlan.blockers, validation, normalizedObservation: observed,
  candidateTablePayloadStatus: 'Locally corrected and tested against the observed OData table identities; live success remains unverified',
  reads, remoteMutations: 0,
};
await writeFile('.powercanvas/experiment2-repair-proposal.json', JSON.stringify({ ...proposal, contentHash: hashJson(proposal) }, null, 2) + '\n');
await writeFile('.powercanvas/experiment2-blocked-plan.json', JSON.stringify(currentPlan, null, 2) + '\n');
console.log(JSON.stringify({ ok: true, proposal: '.powercanvas/experiment2-repair-proposal.json', appPublished: false,
  incorrectReferences: incorrect.length, preservedReferences: preserved.length, reads, remoteMutations: 0 }));
