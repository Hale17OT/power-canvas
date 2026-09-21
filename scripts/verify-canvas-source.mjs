import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { connect } from '../dist/cli/remote.js';
const { http } = await connect(resolve('examples/default-environment-experiment'), 'experiment-default');
const tables = await http.all('EntityDefinitions?$select=LogicalName,DisplayCollectionName');
const matches = tables.filter(table => table.DisplayCollectionName?.LocalizedLabels?.some(label => label.Label === 'Complaints')).map(table => table.LogicalName);
if (matches.length !== 1 || matches[0] !== 'pfx_experimentcomplaint') throw new Error('Canvas table display name is ambiguous; do not add it through the picker.');
await writeFile('experiments/canvas-authoring/evidence/data-source-identity.json', JSON.stringify({ observedAt: new Date().toISOString(), remoteMutations: 0, displayCollectionName: 'Complaints', matches }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ displayCollectionName: 'Complaints', matches }));
