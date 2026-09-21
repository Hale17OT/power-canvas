// Experiment 1 only: a rejected in-memory specification and GET-only tenant observations.
import { parseArgs } from 'node:util';
import process from 'node:process';
import { resolve } from 'node:path';
import { loadProject } from '../dist/config/load.js';
import { connect } from '../dist/cli/remote.js';
import { DataverseHttp } from '../dist/dataverse/http.js';
import { DataverseDiscovery } from '../dist/dataverse/discovery.js';
import { LocalStateStore } from '../dist/state/local.js';
import { createPlan, fingerprint, validateSavedPlan } from '../dist/planner/dataverse.js';
import { executionPolicy } from '../dist/dataverse/isolation.js';
import { projectSchema } from '../dist/ir/schema.js';
import { publicError } from '../dist/core/errors.js';

try {
  const { values } = parseArgs({ options: { project: { type: 'string' }, env: { type: 'string' }, 'default-experiment': { type: 'boolean', default: false } } });
  if (!values.project || !values.env) throw new Error('Explicit project and environment aliases are required.');
  const directory = resolve(values.project); const { project } = await loadProject(directory);
  const connected = await connect(directory, values.env);
  const store = new LocalStateStore(directory, project.project.id, connected.binding.target);
  const ownership = await store.readOwnership();
  let forbiddenMutationAttempts = 0; let reads = 0;
  const http = new DataverseHttp(`${connected.binding.target.dataverseUrl}/api/data/v9.2/`, connected.session, async (input, options) => {
    if (options?.method !== 'GET') { forbiddenMutationAttempts++; throw new Error('Mutation prohibited in safety-only experiment.'); }
    reads++; return globalThis.fetch(input, options);
  });
  const discovery = new DataverseDiscovery(http);
  const before = await discovery.observe(project, connected.binding.target, ownership);
  const candidate = globalThis.structuredClone(project); const priority = candidate.dataverse.tables.complaint?.columns.priority;
  if (!priority || priority.type !== 'choice') throw new Error('The experiment requires the existing Complaint Priority choice.');
  candidate.dataverse.tables.complaint.columns.priority = { schemaName: priority.schemaName, displayName: priority.displayName,
    required: priority.required, lifecycle: priority.lifecycle, type: 'text', maxLength: 100 };
  const desired = projectSchema.parse(candidate);
  const plan = createPlan(desired, before, ownership, 'dataverse', new Date(), executionPolicy(connected.environment.organizationType, values['default-experiment']));
  let enforcementCode;
  try { validateSavedPlan(plan, desired, before, ownership); }
  catch (error) { enforcementCode = publicError(error).code; }
  const after = await discovery.observe(project, connected.binding.target, ownership);
  const remotePriority = after.resources.find(resource => resource.kind === 'column' && resource.schemaName === priority.schemaName);
  const unchanged = fingerprint(before) === fingerprint(after);
  const ok = plan.blockers.some(item => item.code === 'PF-SAFETY-001' && item.classification === 'destructiveBlock') && enforcementCode === 'PF-SAFETY-004' &&
    unchanged && remotePriority?.properties.type === 'choice' && forbiddenMutationAttempts === 0;
  console.log(JSON.stringify({ ok, provenance: 'live tenant observations; planner/safety-layer-only destructive test', observedAt: after.observedAt,
    environmentType: plan.executionPolicy.environmentType, nonDisposable: plan.executionPolicy.nonDisposable,
    requestedChange: 'Priority: choice to text (in memory only)', blockers: plan.blockers, enforcementCode,
    remotePriority, metadataUnchanged: unchanged, beforeFingerprint: fingerprint(before), afterFingerprint: fingerprint(after),
    reads, forbiddenMutationAttempts, remoteMutations: 0, configurationWritten: false }, null, 2));
  if (!ok) process.exitCode = 1;
} catch (error) {
  const safe = publicError(error);
  console.log(JSON.stringify({ ok: false, error: { code: safe.code, message: safe.message, remediation: safe.remediation } }, null, 2));
  process.exitCode = 1;
}
