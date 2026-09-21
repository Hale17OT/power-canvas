/* global structuredClone */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { planNativeSync } from '../dist/canvas/sync.js';
const root = 'output/canvas/native/';
const files = async dir => Object.fromEntries(await Promise.all((await readdir(root + dir)).filter(f => f.endsWith('.pa.yaml') && !f.startsWith('_')).map(async f => [f, parse(await readFile(`${root}${dir}/${f}`, 'utf8'))])));
const generated = await files('generated-v2'), receipt = await files('observed-v2'), current = await files('observed-manual-fixed');
const desired = structuredClone(generated);
function change(node) { if (!node || typeof node !== 'object') return; if (node.pf_dashboard_subtitle) node.pf_dashboard_subtitle.Properties.Text = '="Conflicting generated copy"'; for (const v of Object.values(node)) change(v); }
change(desired);
const plan = planNativeSync(generated, receipt, desired, current);
if (plan.executable || !plan.conflicts.some(p => p.includes('pf_dashboard_subtitle'))) throw new Error('Expected conflict was not blocked');
await writeFile('experiments/native-canvas-20260918/manual-conflict.json', JSON.stringify({ executable: plan.executable, conflicts: plan.conflicts, compileCalls: 0, remoteMutations: 0, expectedRemoteHash: plan.expectedRemoteHash }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ conflicts: plan.conflicts, remoteMutations: 0 }));
