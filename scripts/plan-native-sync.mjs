import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse, stringify } from 'yaml';
import process from 'node:process';
import { planNativeSync } from '../dist/canvas/sync.js';
const [generated, receipt, desired, observed, output] = process.argv.slice(2).map(p => resolve(p));
async function files(directory) { return Object.fromEntries(await Promise.all((await readdir(directory)).filter(f => f.endsWith('.pa.yaml') && f !== '_EditorState.pa.yaml').map(async f => [f, parse(await readFile(resolve(directory, f), 'utf8'))]))); }
const result = planNativeSync(await files(generated), await files(receipt), await files(desired), await files(observed));
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'sync-plan.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
if (result.executable && !result.noOp) {
  for (const [name, value] of Object.entries(result.files)) await writeFile(resolve(output, name), stringify(value, { lineWidth: 0 }), { flag: 'wx' });
  const manifest = JSON.parse(await readFile(resolve(desired, 'native-manifest.json'), 'utf8'));
  await writeFile(resolve(output, 'native-manifest.json'), JSON.stringify({ ...manifest, nativeHash: result.nativeHash, expectedRemoteHash: result.expectedRemoteHash }, null, 2), { flag: 'wx' });
}
console.log(JSON.stringify({ executable: result.executable, noOp: result.noOp, changes: result.changes, conflicts: result.conflicts, preserved: result.preserved }));
if (!result.executable) process.exitCode = 1;
