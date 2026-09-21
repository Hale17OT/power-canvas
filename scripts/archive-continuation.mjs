import { mkdir, readdir, readFile, copyFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const root = 'experiments/model-driven-behavior/evidence'; await mkdir(root, { recursive: true });
const sources = (await readdir('.powercanvas')).filter(name => /^experiment3-.*\.json$/.test(name)).map(name => join('.powercanvas', name));
sources.push('.powercanvas/continuation-readback.json', 'examples/default-environment-experiment/powercanvas.yaml');
const browser = ['experiment3-modern-client.png', 'experiment3-details-hidden.png', 'experiment3-details-saved.png', 'experiment3-details-reopened.png', 'experiment3-details-reopened.yml', 'experiment3-command-config.yml'];
sources.push(...browser.map(name => join('output/playwright', name)));
const artifacts = [];
for (const source of sources) {
  const content = await readFile(source); const name = source.split(/[\\/]/).at(-1); const destination = join(root, name);
  await copyFile(source, destination, 1); artifacts.push({ path: name, source, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') });
}
await writeFile(join(root, 'manifest.json'), JSON.stringify({ archivedAt: new Date().toISOString(), environmentType: 'Default', nonDisposable: true, artifacts }, null, 2), { flag: 'wx' });
console.log(`Archived ${artifacts.length} nonsecret behavior artifacts.`);
