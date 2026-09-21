import type { Command } from 'commander';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parse, stringify } from 'yaml';
import { z } from 'zod';
import { loadProject } from '../config/load.js';
import { compileNativeCanvas, nativeBindingsSchema } from '../canvas/native.js';
import type { NativeFiles } from '../canvas/native-types.js';
import { resolveTaste, tasteSchema, personalityNames } from '../canvas/taste/config.js';
import { recipes, resolveRecipe } from '../canvas/taste/registry.js';
import { compositions, composeScreen } from '../canvas/taste/compositions.js';
import { auditNative, preflight } from '../canvas/taste/audit.js';
import { emit } from './output.js';
import { companion, parseMemory, productSchema, referenceSchema, sha256, designSchema } from '../canvas/taste/memory.js';
import { generateDesign, referenceDirections, strategies, selectDirection } from '../canvas/taste/strategies.js';
import { critique, critiqueInputSchema, auditDesign } from '../canvas/taste/judgment.js';
import { hashJson } from '../core/json.js';
import { visualFixtureVariant } from '../canvas/taste/fixtures.js';
import { devices, type Device } from '../canvas/taste/devices.js';
import { planApplicationOperation } from '../canvas/application-boundary.js';
import { refinementPasses, refineNative } from '../canvas/taste/refine.js';

export async function readNativeDirectory(directory: string): Promise<NativeFiles> {
  const root = resolve(directory);
  const names = (await readdir(root)).filter(f => f.endsWith('.pa.yaml') && f !== '_EditorState.pa.yaml');
  if (!names.length) throw new Error('No native .pa.yaml files found.');
  return Object.fromEntries(await Promise.all(names.map(async name => [name, parse(await readFile(join(root, name), 'utf8'))])));
}
async function save(directory: string, name: string, data: unknown) {
  await mkdir(resolve(directory), { recursive: true });
  await writeFile(join(resolve(directory), name), typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
}
export function registerTasteCommands(program: Command, globals: () => { project: string; json: boolean }) {
  const taste = program.command('taste').description('Design intent, recipe resolution, native audits and completion gates');
  const reference = taste.command('reference').description('Abstract reference intelligence; no brand styles');
  reference.command('list').action(() => emit(referenceDirections, JSON.stringify(referenceDirections, null, 2), globals().json));
  reference.command('inspect <id>').action((id: string) => { const found = referenceDirections.find(r => r.id === id); if (!found) throw new Error('Unknown abstract reference direction'); emit(found, JSON.stringify(found, null, 2), globals().json); });
  reference.command('normalize <file>').requiredOption('--out <directory>').action(async (file: string, o: { out: string }) => { const source = await readFile(resolve(file), 'utf8'); const profile = parseMemory(source, 'reference', referenceSchema); await save(o.out, 'reference.json', { profile, sourceHash: sha256(source), method: 'Explicit reviewed extraction from prose; supported/translated/unsupported distinctions are required' }); });
  const design = taste.command('design');
  design.command('generate').requiredOption('--product <file>').requiredOption('--out <directory>').action(async (o: { product: string; out: string }) => {
    const source = await readFile(resolve(o.product), 'utf8'); const product = parseMemory(source, 'product', productSchema); const memory = generateDesign(product);
    const markdown = `# ${product.name} design contract\n\n${memory.primary.visualCharacter.join('. ')}.\n\nThis contract is authoritative. The JSON companion is generated; edit this file, then synchronize.\n\n## Native visual rules\n\n${memory.primary.dos.map(v => '- ' + v).join('\n')}\n\n## Avoid\n\n${memory.primary.donts.map(v => '- ' + v).join('\n')}\n\n## Validated contract\n\n\`\`\`powercanvas-design\n${stringify(memory)}\`\`\`\n`;
    await save(o.out, 'DESIGN.md', markdown); await save(o.out, 'design.json', companion(source, markdown)); await save(o.out, 'design-decisions.json', selectDirection(product));
  });
  design.command('sync').requiredOption('--product <file>').requiredOption('--design <file>').requiredOption('--out <directory>').action(async (o: { product: string; design: string; out: string }) => {
    const generated = companion(await readFile(resolve(o.product), 'utf8'), await readFile(resolve(o.design), 'utf8'));
    await mkdir(resolve(o.out), { recursive: true }); await writeFile(join(resolve(o.out), 'design.json'), JSON.stringify(generated, null, 2) + '\n');
  });
  taste.command('fixtures <directory>').requiredOption('--bindings <file>').requiredOption('--source <key>').requiredOption('--count <count>').requiredOption('--out <directory>').action(async (directory: string, o: {bindings:string;source:string;count:string;out:string}) => {
    const count=z.union([z.literal(0),z.literal(1),z.literal(4),z.literal(24)]).parse(Number(o.count));
    const bindings=nativeBindingsSchema.parse(JSON.parse(await readFile(resolve(o.bindings),'utf8')));
    const binding=bindings.sources[o.source];if(!binding)throw new Error('Unknown fixture source');
      const manifest=JSON.parse(await readFile(resolve(directory,'native-manifest.json'),'utf8'));
      if(manifest.appId!==bindings.appId)throw new Error('Fixture app identity mismatch');
      const original=await readNativeDirectory(directory);const result=visualFixtureVariant(original,binding,count);
      for(const [name,file] of Object.entries(result.files))await save(o.out,name,stringify(file,{lineWidth:0}));
    await save(o.out,'native-manifest.json',{...manifest,nativeHash:hashJson(result.files),fixture:result.evidence,originalNativeHash:hashJson(original)});
    await save(o.out,'fixture-evidence.json',result.evidence);
    emit(result.evidence,JSON.stringify(result.evidence,null,2),globals().json);
  });
  taste.command('strategies').action(() => emit(strategies, JSON.stringify(strategies, null, 2), globals().json));
  taste.command('critique <directory>').option('--device <device>').requiredOption('--review <file>').requiredOption('--out <directory>').action(async (directory: string, o: { review: string; out: string; device?: string }) => {
    const review = critiqueInputSchema.parse({...JSON.parse(await readFile(resolve(o.review), 'utf8')), ...(o.device ? {device:z.enum(devices).parse(o.device)} : {})});
    const images = Object.fromEntries(await Promise.all(review.screenshots.map(async shot => [shot.path, sha256(await readFile(resolve(shot.path)))])));
    const result = critique(await readNativeDirectory(directory), review, images); await save(o.out, 'taste-critique.json', result); emit(result, JSON.stringify(result, null, 2), globals().json);
  });
  taste.command('refine <directory>').requiredOption('--design <file>').requiredOption('--focus <pass>').requiredOption('--out <directory>').action(async (directory: string, o: { design: string; focus: string; out: string }) => {
    const focus = z.enum(refinementPasses).parse(o.focus); const memory = parseMemory(await readFile(resolve(o.design), 'utf8'), 'design', designSchema);
    const before = await readNativeDirectory(directory); const result = refineNative(before, memory, focus); const gate = preflight(result.files, before);
    await save(o.out, 'refinement.json', { focus, changes: result.changes, outcome: result.outcome, gate });
    if (!gate.staticPassed) throw new Error('Refinement blocked by native preflight');
    for (const [name, value] of Object.entries(result.files)) await save(o.out, name, stringify(value, { lineWidth: 0 }));
  });
  taste.command('personalities').action(() => emit(personalityNames, JSON.stringify(personalityNames), globals().json));
  taste.command('compositions').action(() => emit(compositions(), JSON.stringify(compositions(), null, 2), globals().json));
  taste.command('plan').requiredOption('--app <key>').option('--device <device>', 'desktop, tablet or mobile', 'desktop').action(async (o: { app: string; device: string }) => {
    const { project } = await loadProject(globals().project); const app = project.canvasApps?.[o.app];
    if (!app?.taste) throw new Error('Add a reasoned taste intent to the Canvas app first.');
    const device = z.enum(devices).parse(o.device); const result = { applicationBoundary: planApplicationOperation(app.application, {purpose: device}), ...resolveTaste(app.taste), device, deviceStrategy: app.taste.design?.devices?.[device], screens: Object.entries(app.screens).map(([key, screen]) => ({ key, pattern: screen.pattern, mode: app.taste!.design?.modes[key] ?? app.taste!.design?.modes.default })) }; emit(result, JSON.stringify(result, null, 2), globals().json);
  });
  taste.command('audit <directory>').option('--design <file>').requiredOption('--out <directory>').action(async (directory: string, o: { out: string; design?: string }) => {
    const files = await readNativeDirectory(directory); const report = o.design ? auditDesign(files, parseMemory(await readFile(resolve(o.design), 'utf8'), 'design', designSchema)) : auditNative(files); await save(o.out, 'taste-audit.json', report);
    emit(report, JSON.stringify({ metrics: report.metrics, findings: report.findings }, null, 2), globals().json);
  });
  taste.command('preflight <directory>').option('--before <directory>').option('--evidence <file>').requiredOption('--out <directory>').action(async (directory: string, o: { before?: string; evidence?: string; out: string }) => {
    const evidenceSchema = z.strictObject({ sourceHash: z.string().regex(/^[a-f0-9]{64}$/), desktop: z.boolean(), tablet: z.boolean(), narrow: z.boolean(), accessibility: z.boolean(), behavior: z.boolean(), visualReview: z.boolean() });
    const report = preflight(await readNativeDirectory(directory), o.before ? await readNativeDirectory(o.before) : undefined, o.evidence ? evidenceSchema.parse(JSON.parse(await readFile(resolve(o.evidence), 'utf8'))) : undefined);
    await save(o.out, 'taste-preflight.json', report); emit(report, JSON.stringify(report, null, 2), globals().json);
    if (!report.complete) process.exitCode = 1;
  });
  taste.command('redesign <directory>').requiredOption('--app <key>').requiredOption('--bindings <file>').requiredOption('--out <directory>').description('Audit first, generate a local candidate, reject functional regressions; no remote write').action(async (directory: string, o: { app: string; bindings: string; out: string }) => {
    const before = await readNativeDirectory(directory); const audit = auditNative(before); await save(o.out, 'before-audit.json', audit);
    const { project } = await loadProject(globals().project);
    if (!project.canvasApps?.[o.app]?.taste) throw new Error('Redesign requires explicit Taste intent.');
    const bindings = nativeBindingsSchema.parse(JSON.parse(await readFile(resolve(o.bindings), 'utf8')));
    const result = compileNativeCanvas(project, o.app, bindings); const gate = preflight(result.files, before);
    await save(o.out, 'taste-report.json', result.taste); await save(o.out, 'taste-preflight.json', gate);
    if (!gate.staticPassed) throw new Error('Redesign blocked: functional or static failures. Review the saved audit.');
    for (const [name, yaml] of Object.entries(result.yaml)) await save(o.out, name, yaml);
    await save(o.out, 'native-manifest.json', result.manifest);
    emit({ ok: true, candidateGenerated: true, complete: false, pending: gate.pending, remoteWrites: 0 }, `Taste candidate generated in ${resolve(o.out)}; runtime gates remain pending.`, globals().json);
  });
  taste.command('compose').option('--device <device>').requiredOption('--spec <file>').requiredOption('--out <directory>').action(async (o: { spec: string; out: string; device?: Device }) => {
    const spec = parse(await readFile(resolve(o.spec), 'utf8'));
    const result = composeScreen({ ...spec, ...(o.device ? {device: z.enum(devices).parse(o.device)} : {}) }); await save(o.out, 'composition.pa.yaml', stringify([result], { lineWidth: 0 }));
    emit({ ok: true, remoteWrites: 0, hostBindingsRequired: true }, 'Native composition generated; validate host data and actions before apply.', globals().json);
  });
  taste.command('schema').action(() => emit(z.toJSONSchema(tasteSchema, { io: 'input' }), JSON.stringify(z.toJSONSchema(tasteSchema, { io: 'input' }), null, 2), globals().json));
  const components = program.command('components').description('Taste recipe registry; planned entries are explicitly non-executable');
  components.command('list').action(() => emit(recipes(), JSON.stringify(recipes(), null, 2), globals().json));
  components.command('info <name>').action((name: string) => { const result = recipes().find(r => r.name === name); if (!result) throw new Error('Unknown recipe.'); emit(result, JSON.stringify(result, null, 2), globals().json); });
  components.command('resolve').requiredOption('--spec <file>').action(async (o: { spec: string }) => {
    const request = z.strictObject({ name: z.string(), requiredCapabilities: z.array(z.string()).optional(), modernCapabilities: z.array(z.string()).optional(), compositionCapabilities: z.array(z.string()).optional(), allowPCF: z.boolean().optional(), pcfJustification: z.string().optional(), variant: z.string().optional(), designContext: z.strictObject({ mode: z.string(), personality: z.string(), traits: z.array(z.string()), density: z.number().min(0).max(10), device: z.enum(['desktop', 'tablet', 'mobile']) }).optional() }).parse(parse(await readFile(resolve(o.spec), 'utf8')));
    const result = resolveRecipe(request); emit(result, JSON.stringify(result, null, 2), globals().json);
  });
}
