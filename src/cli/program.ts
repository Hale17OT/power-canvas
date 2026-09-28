import {registerPCFCommands} from './pcf-commands.js';
import { Command } from 'commander';
import { resolve } from 'node:path';
import { initProject } from '../config/init.js';
import { loadProject } from '../config/load.js';
import { PowerCanvasError } from '../core/errors.js';
import { Logger } from '../core/logging.js';
import { VERSION } from '../core/version.js';
import { validateCapabilities } from '../providers/capabilities.js';
import { doctor } from './doctor.js';
import { emit, formatDiagnostics } from './output.js';
import { registerIdentityCommands } from './remote.js';
import { registerSchemaCommands } from './schema-commands.js';
import { registerDesignCommands } from './design-commands.js';
import { registerTasteCommands } from './taste-commands.js';
import { registerFlowCommands } from './flow-commands.js';
import {registerAgentCommands} from './agent-commands.js';
import {registerSolutionCommands} from './solution-commands.js';

export function createProgram(){
const program = new Command();
program.name('powercanvas').description('PowerCanvas: typed application intent and experimental, target-bound Dataverse planning and apply.')
  .version(VERSION).option('--json', 'Output one structured JSON result').option('--non-interactive', 'Never start interactive sign-in; fail when authentication needs interaction')
  .option('--no-color', 'Disable color (current output is plain text)').option('--project <directory>', 'Project directory', '.')
  .showHelpAfterError().exitOverride().configureOutput({ writeErr: () => { /* Errors are rendered through the safe result boundary. */ } });

if (process.argv[1]?.toLowerCase().endsWith('powerforge')) {
  process.stderr.write('Warning: the `powerforge` command is deprecated; use `powercanvas`.\n');
}

const globalOptions = (): { json: boolean; project: string; nonInteractive: boolean } => {
  const opts = program.opts<{ json?: boolean; project: string; nonInteractive?: boolean }>();
  return { json: opts.json ?? false, project: resolve(opts.project), nonInteractive: opts.nonInteractive ?? false };
};
const logger = new Logger(line => process.stderr.write(line));
registerPCFCommands(program,globalOptions);
registerTasteCommands(program, globalOptions);
registerFlowCommands(program, globalOptions);
registerSolutionCommands(program, globalOptions);

program.command('init [directory]').description('Create the complaint-management specification without overwriting existing config')
  .option('--template <name>', 'Template name', 'complaint-management').option('--name <name>', 'Project name in kebab-case')
  .action(async (directory: string | undefined, options: { template: string; name?: string }) => {
    const global = globalOptions();
    const result = await initProject(directory ? resolve(directory) : global.project, options);
    emit({ ok: true, scope: 'local', ...result }, `Created ${result.path}\nNext: powercanvas validate --project "${resolve(directory ?? global.project)}"\nSchema execution is experimental. App and role generation remain gated by the tenant experiments.`, global.json);
  });

program.command('validate').description('Validate IR structure, references, identities and capability availability; no network access')
  .option('--offline', 'Validate locally (the current default and only mode)').option('--require-executable', 'Fail when requested providers are not implemented')
  .action(async (options: { requireExecutable?: boolean }) => {
    const global = globalOptions();
    if (!global.json) logger.log({ level: 'info', code: 'PF-VALIDATION-START', message: 'Validating project locally.' });
    const loaded = await loadProject(global.project);
    const diagnostics = validateCapabilities(loaded.project, options.requireExecutable);
    if (diagnostics.some(item => item.severity === 'error')) throw new PowerCanvasError('PF-CAPABILITY-001', 'The specification requires experimental or unavailable execution providers.', 'Review capability diagnostics; local validation alone cannot certify remote readiness.', diagnostics);
    const project = loaded.project;
    const inventory = { tables: Object.keys(project.dataverse.tables).length,
      columns: Object.values(project.dataverse.tables).reduce((count, table) => count + Object.keys(table.columns).length, 0),
      relationships: Object.keys(project.dataverse.relationships).length, apps: Object.keys(project.apps).length, canvasApps: Object.keys(project.canvasApps ?? {}).length, roles: Object.keys(project.security.roles).length };
    emit({ ok: true, scope: 'offline-specification', executable: false, project: project.project, sourceHash: loaded.sourceHash, inventory, diagnostics },
      `Valid specification: ${project.project.name}\n${inventory.tables} tables, ${inventory.columns} ordinary columns (including primary names), ${inventory.relationships} relationship-owned lookups, ${inventory.apps} model-driven apps, ${inventory.canvasApps} Canvas apps, ${inventory.roles} roles.\n${formatDiagnostics(diagnostics)}\nNo tenant or deployment checks were run.`, global.json);
  });

registerIdentityCommands(program, globalOptions);
registerSchemaCommands(program, globalOptions);
registerDesignCommands(program, globalOptions);

program.command('doctor').description('Check local prerequisites and, when requested, live target identity and permissions')
  .option('--env <alias>', 'Perform live read-only diagnostics for the selected environment alias')
  .option('--live', 'Perform live diagnostics for the current environment binding')
  .option('--default-experiment', 'Check the isolated Default experiment policy')
  .option('--model-driven-experiment', 'Include bounded model-driven discovery')
  .action(async (options: { env?: string; live?: boolean; defaultExperiment?: boolean; modelDrivenExperiment?: boolean }) => {
    const global = globalOptions();
    const result = await doctor(global.project, options.env, options.live, options.defaultExperiment, options.modelDrivenExperiment);
    emit(result, `PowerCanvas ${result.scope} diagnostics\n${result.checks.map(check => `${check.status.toUpperCase().padEnd(7)} ${check.name}: ${check.detail}`).join('\n')}\nSchema preflight ready: ${result.readyForRemote}`, global.json);
    if (!result.ok) process.exitCode = 1;
  });

registerAgentCommands(program,globalOptions);
return program;
}
