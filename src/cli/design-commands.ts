import type { Command } from 'commander';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { loadProject, readConfigSource, parseConfigData } from '../config/load.js';
import { compileConnector } from '../connectors/compile.js';
import { compileCanvas } from '../canvas/compile.js';
import { compileNativeCanvas, nativeBindingsSchema } from '../canvas/native.js';
import { componentCatalog } from '../canvas/registry.js';
import { patternCatalog, patternRequestSchema, pattern, designFormulas } from '../canvas/patterns.js';
import { stringify } from 'yaml';
import { renderShowcase } from '../canvas/showcase.js';
import { PowerCanvasError, hasCode } from '../core/errors.js';
import { emit } from './output.js';
import { resolveRecipe } from '../canvas/taste/registry.js';
import { planApplicationOperation } from '../canvas/application-boundary.js';

async function artifact(directory: string, name: string, content: unknown) {
  await mkdir(directory, { recursive: true }); const path = join(directory, name);
  // Never silently overwrite a manual artifact. Use a fresh output directory for each run.
  try { await writeFile(path, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`, { flag: 'wx' }); }
  catch (error) { if (hasCode(error, 'EEXIST')) throw new PowerCanvasError('PF-CONFIG-004', 'Artifact already exists; overwrite blocked.', 'Use a fresh --out directory.'); throw error; }
  return path;
}
export function registerDesignCommands(program: Command, globalOptions: () => { project: string; json: boolean }) {
  program.command('connector-compile').description('Compile a bounded connector specification into local Swagger 2 artifacts; no remote mutation')
    .requiredOption('--spec <file>', 'Connector YAML file').requiredOption('--out <directory>', 'New artifact directory')
    .action(async (options: { spec: string; out: string }) => {
      const path = resolve(options.spec);
      const result = compileConnector(parseConfigData(await readConfigSource(path))); const out = resolve(options.out);
      const files = [];
      for (const [name, content] of Object.entries({ 'apiDefinition.swagger.json': result.openapi, 'apiProperties.json': result.apiProperties, 'manifest.json': result.manifest, 'prerequisites.json': result.prerequisites })) files.push(await artifact(out, name, content));
      emit({ ok: true, scope: 'local-artifacts', files, remoteCreated: false }, `Created connector artifacts in ${out}. No connector was deployed.`, globalOptions().json);
    });
  const canvas = program.command('canvas').description('PFDS semantic and native compilation; remote apply requires a reviewed live plan');
  canvas.command('application-plan').requiredOption('--app <key>').option('--operation <operation>', 'update-existing or create-new', 'update-existing').option('--purpose <purpose>', 'Application-level intent or device/design work', 'application').description('Guard app identity and explicit creation intent; never provisions or publishes an app')
    .action(async (o: {app:string;operation:string;purpose:string}) => {
      const {project}=await loadProject(globalOptions().project);const app=project.canvasApps?.[o.app];if(!app)throw new Error('Unknown Canvas app');
      const plan=planApplicationOperation(app.application,{operation:o.operation,purpose:o.purpose});emit(plan,JSON.stringify(plan,null,2),globalOptions().json);
    });
  canvas.command('patterns').description('Print PFDS 0.2 reusable native pattern contracts').action(() => {
    emit({ ok: true, version: '0.2.0', patterns: patternCatalog() }, JSON.stringify(patternCatalog(), null, 2), globalOptions().json);
  });
  canvas.command('component').requiredOption('--spec <file>').requiredOption('--out <directory>')
    .description('Instantiate a standardized PFDS 0.2 native pattern; no remote write')
    .action(async (options: { spec: string; out: string }) => {
      const request = patternRequestSchema.parse(parseConfigData(await readConfigSource(resolve(options.spec))));
      const resolution = resolveRecipe({ name: request.component });
      const node = pattern(request.key, request.component, request.props as Parameters<typeof pattern>[2]);
      const out = resolve(options.out);
      await artifact(out, 'component.pa.yaml', stringify([node], { lineWidth: 0 }));
      await artifact(out, 'pattern-manifest.json', { ...request, resolution, tokens: designFormulas({}), scope: 'native-composition', remoteWrites: 0 });
      emit({ ok: true, component: request.component, version: request.version, out, remoteWrites: 0 }, `Generated ${request.component}@${request.version} in ${out}.`, globalOptions().json);
    });
  canvas.command('native').requiredOption('--app <key>', 'Canvas app key').requiredOption('--bindings <file>', 'Reviewed live-discovery bindings').requiredOption('--out <directory>', 'Fresh native source directory')
    .action(async (options: { app: string; bindings: string; out: string }) => {
      const { project } = await loadProject(globalOptions().project);
      const bindings = nativeBindingsSchema.parse(parseConfigData(await readConfigSource(resolve(options.bindings))));
      const result = compileNativeCanvas(project, options.app, bindings); const out = resolve(options.out);
      for (const [name, content] of Object.entries(result.yaml)) await artifact(out, name, content);
      await artifact(out, 'native-manifest.json', result.manifest);
        await artifact(out, 'device-composition.json', { decisions: result.deviceDecisions, preservation: result.devicePreservation });
      await artifact(out, 'pattern-catalog.json', patternCatalog());
      if (result.taste) await artifact(out, 'taste-report.json', result.taste);
      emit({ ok: true, scope: 'native-source', ...result.manifest, remoteWrites: 0 }, `Generated native Canvas source in ${out}. Synchronization remains a separate reviewed operation.`, globalOptions().json);
    });
  canvas.command('catalog').description('Print machine-readable PFDS component contracts').action(() => {
    emit({ ok: true, nativePatterns: patternCatalog(), semanticComponents: componentCatalog() }, JSON.stringify({ nativePatterns: patternCatalog(), semanticComponents: componentCatalog() }, null, 2), globalOptions().json);
  });
  canvas.command('compile').requiredOption('--app <key>', 'Canvas app key').requiredOption('--out <directory>', 'New artifact directory')
    .description('Validate and generate deterministic semantic IR, component catalog and an HTML approximation')
    .action(async (options: { app: string; out: string }) => {
      const global = globalOptions(); const { project } = await loadProject(global.project); const compiled = compileCanvas(project, options.app); const out = resolve(options.out);
      const files = [await artifact(out, 'canvas-ir.json', compiled), await artifact(out, 'component-catalog.json', componentCatalog()), await artifact(out, 'showcase.html', renderShowcase(compiled))];
      emit({ ok: true, scope: compiled.scope, sourceHash: compiled.sourceHash, files, nativeAppCreated: false, diagnostics: compiled.diagnostics }, `Compiled PFDS intent to ${out}. HTML is a local approximation; no native Canvas app was created.`, global.json);
    });
}
