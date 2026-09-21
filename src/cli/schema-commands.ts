import { resolve } from 'node:path';
import type { Command } from 'commander';
import { loadProject } from '../config/load.js';
import { DataverseDiscovery } from '../dataverse/discovery.js';
import { ensureMembership, mutateSchema } from '../dataverse/mutations.js';
import { assertWritePreflight } from '../dataverse/preflight.js';
import { connect } from './remote.js';
import type { CliContext } from './remote.js';
import { LocalStateStore } from '../state/local.js';
import { planSchema } from '../state/models.js';
import { createPlan } from '../planner/dataverse.js';
import { editJson, readJson } from '../core/files.js';
import { PowerCanvasError } from '../core/errors.js';
import { applyPlan } from '../execution/apply.js';
import { emit } from './output.js';
import { executionPolicy } from '../dataverse/isolation.js';
import { hashJson } from '../core/json.js';
import { recoverCreate } from '../execution/recover.js';
import { observeModel } from '../model-driven/discovery.js';
import { modelMembership, mutateModel } from '../model-driven/mutations.js';

export function registerSchemaCommands(program: Command, global: () => CliContext): void {
  program.command('recover-create').alias('recover-operation').requiredOption('--plan <path>').requiredOption('--execution <uuid>').requiredOption('--operation <id>').requiredOption('--remote-id <guid>')
    .requiredOption('--env <alias>').option('--confirm-created-by-this-run', 'Explicitly attest that this resource was created by the interrupted run, never pre-existing')
    .description('Read-only recovery of one evidenced creation or acknowledged grant on an owned role; retains the original journal')
    .action(async (options: { plan: string; execution: string; operation: string; remoteId: string; env: string; confirmCreatedByThisRun?: boolean }) => {
      const plan = await readJson(resolve(options.plan), planSchema);
      if (!plan) throw new PowerCanvasError('PF-PLAN-011', 'Original saved plan was not found.', 'Supply the actual plan from the interrupted execution.');
      const loaded = await loadProject(global().project); const connected = await connect(global().project, options.env);
      const store = new LocalStateStore(global().project, loaded.project.project.id, connected.binding.target);
      const discovery = new DataverseDiscovery(connected.http);
      const result = await recoverCreate(loaded.project, plan, store, {
        verifyTarget: async () => {
          const fresh = await connect(global().project, options.env);
          if (hashJson(fresh.binding.target) !== hashJson(plan.target) || hashJson(executionPolicy(fresh.environment.organizationType, plan.executionPolicy?.mode === 'defaultExperiment', plan.executionPolicy?.modelDriven === true)) !== hashJson(plan.executionPolicy ?? null)) throw new PowerCanvasError('PF-ENV-003', 'Recovery target or policy differs from the original plan.', 'Use the original verified target.');
        },
        observe: async ownership => {
          const base = await discovery.observe(loaded.project, connected.binding.target, ownership);
          return plan.executionPolicy?.modelDriven ? observeModel(loaded.project, base, connected.http, ownership) : base;
        },
      }, { executionId: options.execution, operationId: options.operation, remoteId: options.remoteId, confirmedCreatedByThisRun: options.confirmCreatedByThisRun === true });
      emit(result, `Verified and recorded operation evidence for ${result.remoteId}. No remote mutations. Original journal retained.\nReview a fresh plan before resuming apply.`, global().json);
    });
  program.command('inspect').option('--env <alias>').option('--model-driven-experiment').description('Read and normalize scoped metadata without remote writes')
    .action(async (options: { env?: string; modelDrivenExperiment?: boolean }) => {
      const loaded = await loadProject(global().project); const connected = await connect(global().project, options.env);
      const store = new LocalStateStore(global().project, loaded.project.project.id, connected.binding.target);
      const ownership = await store.readOwnership();
      const base = await new DataverseDiscovery(connected.http).observe(loaded.project, connected.binding.target, ownership);
      const observation = options.modelDrivenExperiment ? await observeModel(loaded.project, base, connected.http, ownership) : base;
      emit({ ok: true, observation }, `${observation.resources.length} scoped resources observed. No remote writes.`, global().json);
    });
  program.command('plan').option('--env <alias>').option('--scope <scope>', 'all or explicit dataverse-only scope', 'all').option('--out <path>')
    .option('--default-experiment', 'Use the isolated, additive-only non-disposable Default-environment experiment policy')
    .option('--model-driven-experiment', 'Include bounded experimental app generation after verified Experiment 1 evidence')
    .description('Read-only three-way Dataverse plan; saved plans are bound to the exact target and source')
    .action(async (options: { env?: string; scope: string; out?: string; defaultExperiment?: boolean; modelDrivenExperiment?: boolean }) => {
      if (!['all', 'dataverse'].includes(options.scope)) throw new PowerCanvasError('PF-CLI-001', 'Unknown planning scope.', 'Use --scope dataverse for Experiment 1; all remains blocked while app providers are unavailable.');
      const loaded = await loadProject(global().project); const connected = await connect(global().project, options.env);
      const store = new LocalStateStore(global().project, loaded.project.project.id, connected.binding.target);
      const ownership = await store.readOwnership();
      if (options.modelDrivenExperiment && options.scope !== 'all') throw new PowerCanvasError('PF-CLI-001', 'Model-driven planning requires scope all.', 'Omit --scope dataverse when enabling the model-driven experiment.');
      const base = await new DataverseDiscovery(connected.http).observe(loaded.project, connected.binding.target, ownership);
      const observed = options.modelDrivenExperiment ? await observeModel(loaded.project, base, connected.http, ownership) : base;
      const plan = createPlan(loaded.project, observed, ownership, options.scope as 'all' | 'dataverse', new Date(), executionPolicy(connected.environment.organizationType, options.defaultExperiment ?? false, options.modelDrivenExperiment ?? false));
      if (options.out) await editJson(resolve(options.out), planSchema, () => plan);
      const lines = plan.operations.map(operation => `${operation.classification === 'create' ? '+' : '~'} ${operation.action} ${operation.resourceId}`);
      const deferred = plan.scope === 'dataverse' ? [...(Object.keys(loaded.project.apps).length ? ['model-driven app intent'] : []), ...(Object.keys(loaded.project.security.roles).length ? ['security role intent'] : [])] : [];
      emit({ ok: plan.blockers.length === 0, plan, deferred, ...(options.out ? { saved: resolve(options.out) } : {}) },
        `Tenant: ${plan.target.tenantId}\nEnvironment: ${plan.target.environmentId}\nDataverse: ${plan.target.dataverseUrl}\nScope: ${plan.scope}\n${deferred.length ? 'App and role intent explicitly deferred.\n' : ''}${lines.join('\n') || (plan.blockers.length ? 'No executable changes.' : 'No changes.\n0 to create\n0 to update\n0 to delete')}\n${plan.blockers.map(blocker => `${blocker.classification} ${blocker.code}: ${blocker.message}`).join('\n')}${options.out ? `\nSaved ${resolve(options.out)}` : '\nUse --out <path> to save this plan for review and apply.'}`, global().json);
      if (plan.blockers.length) process.exitCode = 1;
    });
  program.command('apply').requiredOption('--plan <path>').option('--env <alias>')
    .description('Apply only a saved, reviewed schema plan after fresh identity, state and policy checks')
    .action(async (options: { plan: string; env?: string }) => {
      const plan = await readJson(resolve(options.plan), planSchema);
      if (!plan) throw new PowerCanvasError('PF-PLAN-011', 'Saved plan was not found.', 'Create and review a plan with plan --out <path>.');
      const loaded = await loadProject(global().project); const connected = await connect(global().project, options.env);
      const store = new LocalStateStore(global().project, loaded.project.project.id, connected.binding.target);
      const discovery = new DataverseDiscovery(connected.http);
      const result = await applyPlan(loaded.project, plan, store, {
        verifyTarget: async () => {
          const fresh = await connect(global().project, options.env);
          if (hashJson(fresh.binding.target) !== hashJson(plan.target)) throw new PowerCanvasError('PF-ENV-003', 'Selected target does not match the saved plan.', 'Select the reviewed target or create another plan.');
          const expectedPolicy = executionPolicy(fresh.environment.organizationType, plan.executionPolicy?.mode === 'defaultExperiment', plan.executionPolicy?.modelDriven === true);
          if (!plan.executionPolicy || hashJson(expectedPolicy) !== hashJson(plan.executionPolicy)) throw new PowerCanvasError('PF-SAFETY-005', 'Live environment type differs from the reviewed policy.', 'Create a fresh plan with the correct environment policy.');
          await assertWritePreflight(fresh.http, fresh.identity.UserId, fresh.environment.organizationType, fresh.binding.target.organizationId, loaded.project, plan.executionPolicy.mode === 'defaultExperiment', plan.executionPolicy.modelDriven === true);
        },
        observe: async ownership => {
          const base = await discovery.observe(loaded.project, connected.binding.target, ownership);
          return plan.executionPolicy?.modelDriven ? observeModel(loaded.project, base, connected.http, ownership) : base;
        },
        apply: (operation, observed, mutate) => operation.provider === 'model-driven' ? mutateModel(loaded.project, operation, observed, connected.http, mutate) : mutateSchema(loaded.project, operation, observed, connected.http, mutate),
        membership: (operation, observed, mutate) => operation.provider === 'model-driven' ? modelMembership(loaded.project, operation, observed, mutate) : ensureMembership(loaded.project, operation, observed, connected.http, mutate),
        request: (path, method, body, headers) => connected.http.request(path, method, body, headers),
      });
      emit(result, result.ok ? `Verified ${result.completed.length} operations. Fresh reconciliation is a semantic no-op.\nExecution: ${result.executionId}` :
        `Apply stopped after ${result.completed.length} verified operations.\nExecution: ${result.executionId}\n${result.error?.code}: ${result.error?.message}\n${result.error?.remediation}`, global().json);
      if (!result.ok) process.exitCode = 1;
    });
}
