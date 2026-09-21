// Opt-in, read-only tenant acceptance check. Never included in normal credential-free CI.
import { parseArgs } from 'node:util';
import process from 'node:process';
import { resolve } from 'node:path';
import { loadProject } from '../dist/config/load.js';
import { connect } from '../dist/cli/remote.js';
import { DataverseDiscovery } from '../dist/dataverse/discovery.js';
import { LocalStateStore } from '../dist/state/local.js';
import { createPlan } from '../dist/planner/dataverse.js';
import { executionPolicy } from '../dist/dataverse/isolation.js';
import { publicError } from '../dist/core/errors.js';
import { observeModel } from '../dist/model-driven/discovery.js';

try {
  const { values } = parseArgs({ options: { project: { type: 'string' }, env: { type: 'string' }, 'default-experiment': { type: 'boolean', default: false }, 'model-driven-experiment': { type: 'boolean', default: false } } });
  if (!values.project || !values.env) throw new Error('Explicit project and environment aliases are required.');
  const directory = resolve(values.project);
  const { project } = await loadProject(directory);
  const connected = await connect(directory, values.env);
  const store = new LocalStateStore(directory, project.project.id, connected.binding.target);
  const ownership = await store.readOwnership();
  const base = await new DataverseDiscovery(connected.http).observe(project, connected.binding.target, ownership);
  const model = values['model-driven-experiment'];
  const observed = model ? await observeModel(project, base, connected.http, ownership) : base;
  const plan = createPlan(project, observed, ownership, model ? 'all' : 'dataverse', new Date(), executionPolicy(connected.environment.organizationType, values['default-experiment'], model));
  const ok = plan.operations.length === 0 && plan.blockers.length === 0;
  console.log(JSON.stringify({ ok, provenance: 'live Microsoft tenant; read-only', observedAt: observed.observedAt,
    environmentType: plan.executionPolicy.environmentType, nonDisposable: plan.executionPolicy.nonDisposable,
    semanticNoOp: ok, resourceCount: observed.resources.length, operations: plan.operations.length,
    blockers: plan.blockers, observationHash: plan.observationHash, remoteMutations: 0 }, null, 2));
  if (!ok) process.exitCode = 1;
} catch (error) {
  const safe = publicError(error);
  console.log(JSON.stringify({ ok: false, error: { code: safe.code, message: safe.message, remediation: safe.remediation } }, null, 2));
  process.exitCode = 1;
}
