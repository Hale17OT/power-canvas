import { connect } from '../dist/cli/remote.js';
import { writeFile } from 'node:fs/promises';
const { http } = await connect('examples/default-environment-experiment', 'experiment-default');
const rows = await http.all("pfx_experimentcomplaints?$select=pfx_experimentcomplaintid,pfx_experimenttitle,pfx_experimentpriority&$filter=pfx_experimenttitle eq 'PowerCanvas native Canvas choice regression 2026-09-18'");
if(rows.length!==1 || rows[0].pfx_experimentpriority!==731420001) throw new Error('Choice regression readback failed');
await writeFile('experiments/native-canvas-20260918/choice-readback.json',JSON.stringify({observedAt:new Date().toISOString(),rows,provenance:'Independent Dataverse GET after native SubmitForm with declared Normal default',remoteMutations:0},null,2),{flag:'wx'});
console.log(JSON.stringify({verified:true,recordId:rows[0].pfx_experimentcomplaintid,priority:rows[0].pfx_experimentpriority}));
