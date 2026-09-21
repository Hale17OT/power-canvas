import { mkdir, readFile, copyFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';
const root = 'experiments/canvas-authoring/evidence'; await mkdir(root, { recursive: true });
const files = ['.powercanvas/continuation-canvas-name-check.json', 'output/canvas/ds1-release/canvas-ir.json', 'output/canvas/ds1-release/component-catalog.json', 'output/canvas/ds1-release/showcase.html', 'examples/canvas-complaints/powercanvas.yaml', 'output/playwright/canvas-native-responsive.yml', 'output/playwright/canvas-native-coauthoring.yml', 'output/playwright/canvas-native-source-added.yml', 'output/playwright/canvas-release-dashboard.png'];
for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) files.push(`output/playwright/canvas-release-${width}-${theme}.png`);
const artifacts = [];
for (const source of files) { const content = await readFile(source); const path = basename(source); await copyFile(source, join(root, path), 1); artifacts.push({ path, source, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') }); }
for (const path of ['mcp-tools.json', 'app-created.json', 'data-source-identity.json']) { const content = await readFile(join(root, path)); artifacts.push({ path, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') }); }
await writeFile(join(root, 'manifest.json'), JSON.stringify({ archivedAt: new Date().toISOString(), environmentType: 'Default', nonDisposable: true, authoring: { packageInitialization: 'passed', toolDiscovery: 'passed', connect: 'timed-out-before-result', timeoutMs: 180000, compileCalls: 0, syncCalls: 0, userSignInQuestionPending: true }, localBrowserChecks: { widths: [390, 768, 1440], themes: ['light', 'dark'], prefixSearch: 'passed', pageOverflow: 'none', retry: 'passed', keyboardNavigation: 'passed', compactControlMinHeight: 36 }, artifacts }, null, 2), { flag: 'wx' });
console.log(`Archived ${artifacts.length} Canvas evidence artifacts.`);
