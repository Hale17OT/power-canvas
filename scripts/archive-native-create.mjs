import { connect } from '../dist/cli/remote.js';
import { writeFile } from 'node:fs/promises';
const { http } = await connect('examples/default-environment-experiment', 'experiment-default');
const rows = await http.all("pfx_experimentcomplaints?$select=pfx_experimentcomplaintid,pfx_experimenttitle,pfx_experimentdescription,pfx_experimentpriority&$filter=pfx_experimenttitle eq 'PowerCanvas native Canvas create test 2026-09-18'");
if (rows.length !== 1 || rows[0].pfx_experimentdescription !== 'Synthetic record created through the native generated Canvas form. No customer data.') throw new Error('Native create readback failed');
await writeFile('experiments/native-canvas-20260918/create-readback.json', JSON.stringify({ observedAt: new Date().toISOString(), rows, provenance: 'Independent Dataverse GET after native Canvas SubmitForm', remoteMutations: 0 }, null, 2), { flag: 'wx' }); console.log(JSON.stringify({ verified: true, recordId: rows[0].pfx_experimentcomplaintid }));
