import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseProject } from '../src/config/load.js';
import { modelResources } from '../src/model-driven/desired.js';
import { validateSemantics } from '../src/ir/validate.js';
import { hashJson } from '../src/core/json.js';
import { mutateModel } from '../src/model-driven/mutations.js';
import { DataverseHttp } from '../src/dataverse/http.js';
import { matchingState } from './planner-fixtures.js';
import { createPlan, publicationHash, safeUpdate } from '../src/planner/dataverse.js';
import { MODEL_KINDS, MODEL_VERSION } from '../src/model-driven/desired.js';
import { randomUUID } from 'node:crypto';
it('lowers a YAML command into a deterministic app-scoped PrimaryControl action and blocks collisions', async () => {
  const project = parseProject(readFileSync('examples/default-environment-experiment/powercanvas.yaml', 'utf8'));
  project.apps.complaintDesk!.commands = { generatedDetails: { label: 'Generated details', form: 'complaintMain', action: 'toggleDetails', visible: true, bindingVersion: 2, sequence: 101, tooltip: 'Toggle optional complaint details' } };
  const specs = modelResources(project); const command = specs.find(r => r.kind === 'command')!;
  expect(command.properties.functionName).toMatch(/^PowerCanvasReveal_[a-f0-9]+\.toggle$/); expect(command).toEqual(modelResources(project).find(r => r.kind === 'command'));
  const { observation, ownership } = matchingState(project);
  observation.coverage.push(...MODEL_KINDS.map(kind => ({ kind, status: 'complete' as const }))); observation.providerVersions['model-driven'] = MODEL_VERSION;
  ownership.experiment1Evidence = { schemaHash: publicationHash(project), firstNoOpHash: hashJson({}), secondNoOpHash: hashJson({}), destructiveCheckHash: hashJson({}), completedAt: new Date().toISOString() };
  for (const spec of specs.filter(r => r.kind !== 'command')) { const remoteId = randomUUID(); observation.resources.push({ ...spec, provider: 'model-driven', remoteId }); ownership.resources.push({ resourceId: spec.resourceId, provider: 'model-driven', remoteId, baseline: spec.properties, ownedPaths: Object.keys(spec.properties), lastVerifiedHash: hashJson(spec.properties) }); }
  const policy = { environmentType: 'Default' as const, mode: 'defaultExperiment' as const, nonDisposable: true, modelDriven: true };
  const plan = createPlan(project, observation, ownership, 'all', new Date(), policy); expect(plan.blockers).toEqual([]);
  const op = plan.operations.find(o => o.action === 'createCommand')!; const bodies: unknown[] = [];
  await mutateModel(project, op, observation, new DataverseHttp('https://synthetic.crm.dynamics.com', { token: async () => 'synthetic' }), async (_step, path, method, body) => { expect(path).toBe('appactions'); expect(method).toBe('POST'); bodies.push(body); });
  expect(bodies[0]).toMatchObject({ context: 1, location: 0, onclickeventtype: 2, onclickeventjavascriptparameters: '[{"type":5}]' });
  observation.resources.push({ ...command, provider: 'model-driven', remoteId: randomUUID() });
  expect(createPlan(project, observation, ownership, 'all', new Date(), policy).blockers.some(b => b.code === 'PF-PLAN-005')).toBe(true);
  project.apps.complaintDesk!.commands.generatedDetails!.form = 'missing'; expect(validateSemantics(project).some(d => d.message.includes('toggleDetails'))).toBe(true);
});

it('only permits owned command hiding or bound command ordering, not action changes or unhiding', () => {
  const before = { solutionMember: true, hidden: false, sequence: 101, contextTable: null, functionName: 'safe.toggle' };
  expect(safeUpdate('command', before, { ...before, hidden: true })).toBe(true);
  expect(safeUpdate('command', { ...before, solutionMember: false }, { ...before, hidden: true })).toBe(false);
  expect(safeUpdate('command', { ...before, hidden: true }, before)).toBe(false);
  expect(safeUpdate('command', before, { ...before, hidden: true, functionName: 'other.run' })).toBe(false);
  expect(safeUpdate('command', before, { ...before, sequence: 102 })).toBe(false);
  expect(safeUpdate('command', { ...before, contextTable: 'owned' }, { ...before, contextTable: 'owned', sequence: 102 })).toBe(true);
});
