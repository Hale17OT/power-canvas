import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import {beforeAll,expect,it} from 'vitest';
const run=promisify(execFile);
let results:{cases:{name:string;pass:boolean}[];mode:string};
beforeAll(async()=>{const {stdout}=await run(process.execPath,['scripts/sharepoint-simulate.mjs','--unit'],{maxBuffer:4*1024*1024});results=JSON.parse(stdout);},20000);
const cases=[
  "library-flow-reference",
  "document-pdf-blocker-preserved",
  "edge-three-cycles",
  "synthetic-evidence-production-blocked",
  "canvas-binding",
  "flow-binding",
  "person-single",
  "lookup-identity",
  "inherited-permissions",
  "team-request-tracker-platform-fields",
  "team-request-tracker-pagination",
  "team-request-tracker-three-cycles",
  "document-approval-platform-fields",
  "document-approval-pagination",
  "document-approval-three-cycles",
  "library-dual-identity",
  "content-type-links",
  "content-type-attachment",
  "internal-display-name",
  "contract-library-platform-fields",
  "contract-library-pagination",
  "contract-library-three-cycles",
  "system-list-classification",
  "person-multiple-groups",
  "ordered-multichoice",
  "distinct-permissions-private",
  "duplicate-name-conflict",
  "permission-writes-blocked",
  "caml-equivalence-and-drift",
  "wrong-site",
  "wrong-drive",
  "missing-lookup",
  "missing-attachment",
  "wrong-attachment",
  "missing-binding",
  "page-failure",
  "GET-403",
  "GET-404",
  "GET-429",
  "GET-500",
  "GET-502",
  "GET-503",
  "GET-504",
  "GET-socket-drop",
  "create-readback-noop",
  "etag-attestation-blocks",
  "accepted-drop",
  "reject-400",
  "postcondition",
  "unmocked-blocked",
  "delete-never-dispatched",
  "patch-no-retry",
  "business-content-blocked",
  "simulation-config-isolated",
  "simulation-transport-isolated",
  "GET-connect-timeout",
  "retry-after-wall-clock",
  "no-live-traffic"
];
it.each(cases)('real HTTP simulation: %s',name=>{expect(results.mode).toBe('SHAREPOINT_SIMULATION');expect(results.cases.find(c=>c.name===name)?.pass).toBe(true);});
it.each(['team-request-tracker','document-approval','contract-library'])('Dev Proxy isolation contract: %s',async name=>{
 const path='tests/sharepoint-simulation/scenarios/'+name+'/';const config=JSON.parse(await readFile(path+'devproxyrc.json','utf8'));
 expect(config.asSystemProxy).toBe(false);expect(config.installCert).toBe(false);expect(config.graphMocks.blockUnmockedRequests).toBe(true);expect(config.restMocks.blockUnmockedRequests).toBe(true);
 expect(config.plugins.map((p:{name:string})=>p.name)).toEqual(['GraphMockResponsePlugin','MockResponsePlugin']);
 const graph=JSON.parse(await readFile(path+'graph-mocks.json','utf8'));const rest=JSON.parse(await readFile(path+'sharepoint-rest-mocks.json','utf8'));
 expect(graph.mocks.length).toBeGreaterThan(2);expect(rest.mocks.length).toBeGreaterThan(0);
 expect(graph.mocks.every((m:{request:{method:string;url:string}})=>m.request.method==='GET'&&m.request.url.startsWith('https://graph.microsoft.com/v1.0/'))).toBe(true);
 expect(rest.mocks.every((m:{request:{url:string}})=>m.request.url.startsWith('https://powercanvas-simulation.sharepoint.com/sites/PowerCanvasProviderLab/_api/'))).toBe(true);
});
