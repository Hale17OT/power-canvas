// Record completed live evidence locally. This never mutates Dataverse.
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadProject } from '../dist/config/load.js';
import { connect } from '../dist/cli/remote.js';
import { DataverseDiscovery } from '../dist/dataverse/discovery.js';
import { LocalStateStore } from '../dist/state/local.js';
import { planSchema } from '../dist/state/models.js';
import { createPlan, publicationHash } from '../dist/planner/dataverse.js';
import { executionPolicy } from '../dist/dataverse/isolation.js';
import { hashJson } from '../dist/core/json.js';

const { values } = parseArgs({ options: Object.fromEntries(['project', 'env', 'first-noop', 'second-noop', 'safety'].map(key => [key, { type: 'string' }])) });
if (Object.values(values).length !== 5) throw new Error('Provide project, env, first-noop, second-noop and safety evidence paths.');
const read = async path => JSON.parse((await readFile(resolve(path), 'utf8')).replace(/^\uFEFF/, ''));
const first = planSchema.parse(await read(values['first-noop']));
const second = planSchema.parse(await read(values['second-noop']));
const safety = await read(values.safety);
const { project } = await loadProject(resolve(values.project));
const connected = await connect(resolve(values.project), values.env);
for (const plan of [first, second]) {
  const { contentHash, ...body } = plan;
  if (contentHash !== hashJson(body) || plan.operations.length || plan.blockers.length || plan.projectId !== project.project.id || hashJson(plan.target) !== hashJson(connected.binding.target)) throw new Error('No-op evidence is invalid or belongs to another target.');
}
if (second.sourceHash !== hashJson(project) || safety.ok !== true || safety.remoteMutations !== 0 || safety.forbiddenMutationAttempts !== 0 || safety.metadataUnchanged !== true ||
    safety.beforeFingerprint !== safety.afterFingerprint || safety.afterFingerprint !== second.observationHash || safety.enforcementCode !== 'PF-SAFETY-004' || !safety.blockers.some(item => item.code === 'PF-SAFETY-001')) throw new Error('Safety evidence or current schema does not agree with the successful Experiment 1 run.');
const store = new LocalStateStore(resolve(values.project), project.project.id, connected.binding.target);
await store.withLock(async writer => {
  const ownership = await store.readOwnership();
  if (!ownership) throw new Error('Verified ownership is required.');
  const observation = await new DataverseDiscovery(connected.http).observe(project, connected.binding.target, ownership);
  const current = createPlan(project, observation, ownership, 'dataverse', new Date(), executionPolicy(connected.environment.organizationType, true));
  if (current.operations.length || current.blockers.length) throw new Error('Current live schema is not a semantic no-op.');
  const experiment1Evidence = { schemaHash: publicationHash(project), firstNoOpHash: first.contentHash, secondNoOpHash: second.contentHash, destructiveCheckHash: hashJson(safety), completedAt: new Date().toISOString() };
  await writer.saveOwnership({ ...ownership, revision: ownership.revision + 1, updatedAt: new Date().toISOString(), experiment1Evidence });
  console.log(JSON.stringify({ ok: true, experiment1Evidence, remoteMutations: 0 }, null, 2));
});
