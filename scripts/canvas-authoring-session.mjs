import {loadLocalAuthoringConfig} from './local-authoring-config.mjs';
const local=await loadLocalAuthoringConfig();
// Scoped official MCP session. Compile requires a hash-bound plan and a fresh remote preflight.
import { spawn } from 'node:child_process';
import process from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { readFile, writeFile } from 'node:fs/promises';
import { appendFile } from 'node:fs/promises';
import { hashJson } from '../dist/core/json.js';
import { compileSucceeded } from '../dist/canvas/authoring-result.js';
import { readNativeSource } from '../dist/canvas/source-provider.js';
import { planCanvasMigration } from '../dist/canvas/migration.js';
const appId = process.argv[2]; if(appId!==local.binding.appId)throw new Error('Explicit app differs from local binding'); if (!/^[a-f0-9-]{36}$/.test(appId ?? '')) throw new Error('Explicit owned app ID required');
const evidence = JSON.parse(await readFile(process.argv[3] ?? 'experiments/canvas-authoring/evidence/app-created.json', 'utf8'));
if (evidence.solution !== 'pfx_PowerForgeExperiment' || evidence.environmentType !== 'Default' || evidence.nonDisposable !== true || !evidence.apps?.some(app => app.canvasappid === appId && app.ismanaged === false && /^(pfx_PowerCanvas|pfx_PowerForge)/.test(app.displayname)) || evidence.playerAppId !== appId || !evidence.members.some(member => member.objectid === appId && member.componenttype === 300)) throw new Error('App ID does not match the recorded experiment creation and solution membership.');
const allowed = new Set(['list_apis', 'describe_api', 'list_controls', 'describe_control', 'list_data_sources', 'get_data_source_schema', 'get_accessibility_errors', 'get_appchecker_errors', 'sync_canvas', 'compile_canvas']);
const runId = new Date().toISOString().replaceAll(/[:.]/g, '-');
const directory = resolve('.powercanvas/tooling');
const child = spawn(resolve(directory, 'dotnet/dotnet.exe'), ['exec', resolve(directory, 'dotnet/sdk/10.0.401/dotnet.dll'), 'dnx', 'Microsoft.PowerApps.CanvasAuthoring.McpServer@1.1.5', '--yes'], {
  windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, DOTNET_ROOT: resolve(directory, 'dotnet'), DOTNET_CLI_HOME: resolve(directory, 'cli-home'), NUGET_PACKAGES: resolve(directory, 'packages'), DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' },
});
let next = 1; const pending = new Map();
const send = message => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
createInterface({ input: child.stdout }).on('line', line => { try { const message = JSON.parse(line); if (message.id && pending.has(message.id)) { const { resolve, reject } = pending.get(message.id); pending.delete(message.id); if (message.error) reject(new Error('MCP protocol error')); else resolve(message.result); } else if (message.method && message.id) { send({ id: message.id, error: { code: -32601, message: 'Interactive elicitation requires a configured host UI.' } }); } } catch { /* No non-protocol/auth output is exported. */ } });
// Export only known diagnostic codes, never authorization URLs or token-bearing logs.
child.stderr.on('data', chunk => { for (const code of String(chunk).match(/AADSTS\d+|interaction_required|authentication_canceled/g) ?? []) console.log(JSON.stringify({ diagnosticCode: code })); });
child.on('exit', code => { for (const call of pending.values()) call.reject(new Error(`Authoring server exited (${code})`)); pending.clear(); });
const request = (method, params) => new Promise((resolve, reject) => { const id = next++; pending.set(id, { resolve, reject }); send({ id, method, params }); });
// This process is specific to the experiment and may request Microsoft authentication.
const timeout = setTimeout(() => { console.log(JSON.stringify({ ok: false, reason: 'Authoring sign-in/session timed out', authoringWrites: 0 })); child.kill(); process.exitCode = 1; }, 300_000);
try {
  await request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'powercanvas-authoring-experiment', version: '0.1.0' } });
  send({ method: 'notifications/initialized', params: {} });
  const catalog = await request('tools/list', {});
  await writeFile(`.powercanvas/canvas-tool-catalog-${runId}.json`, JSON.stringify(catalog, null, 2), {flag:'wx'});
  console.log(JSON.stringify({ stage: 'Official server initialized; connecting to owned Canvas app', appId }));
  const result = await request('tools/call', { name: 'connect', arguments: { environment_id: local.binding.environmentId, app_id: appId, environment_category: 'prod', login_hint: local.loginHint } });
  clearTimeout(timeout);
  // Official tool result is kept local. The public report is reviewed/redacted before archiving.
  const connectFile = `.powercanvas/canvas-connect-${runId}.json`;
  await writeFile(connectFile, JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ connected: !result.isError, resultFile: connectFile }));
  if (result.isError) { child.kill(); process.exitCode = 1; }
  else {
    const commands = createInterface({ input: process.stdin });
    for await (const line of commands) {
      const command = JSON.parse(line); if (command.name === 'exit') break;
      if (!allowed.has(command.name)) { console.log('Unsupported/read-only session action'); continue; }
      if (command.name === 'compile_canvas') {
        const root = resolve('output/canvas/native'); const destination = resolve(command.arguments.directoryPath);
        if (!destination.startsWith(root + '\\')) throw new Error('Native source must be under the reviewed output folder.');
        const files = readNativeSource;
        const manifest = JSON.parse(await readFile(resolve(destination, 'native-manifest.json'), 'utf8'));
        if (manifest.appId !== appId || manifest.solution !== 'pfx_PowerForgeExperiment' || manifest.environmentId !== local.binding.environmentId || !manifest.expectedRemoteHash) throw new Error('Reviewed native plan binding is incomplete.');
        if (hashJson(await files(destination)) !== manifest.nativeHash) throw new Error('Native source changed after review.');
        const fresh = resolve(root, `preflight-${runId}-${next}`);
        const check = await request('tools/call', { name: 'sync_canvas', arguments: { directoryPath: fresh } });
        await writeFile(`.powercanvas/canvas-preflight-${runId}-${next}.json`, JSON.stringify(check, null, 2), {flag: 'wx'});
        if (check.isError) throw new Error('Native source preflight request failed; no compile attempted. Inspect the preflight result.');
        if (hashJson(await files(fresh)) !== manifest.expectedRemoteHash) throw new Error('Studio changed after planning. Reconcile the fresh source before applying.');
        // V4.2 cannot bypass business preservation by attaching a legacy native manifest.
        const migration=planCanvasMigration(await files(fresh),await files(destination),[],manifest.approvedBehaviorChanges??[]);
        if(!migration.safe)throw new Error('Native apply blocked: unresolved business binding or mutation path');
        if(manifest.designSystem?.startsWith('PFDS/4')){
          if(!manifest.sourceAgreement||manifest.sourceAgreement.status!=='MATCH'||manifest.sourceAgreement.authoring.sourceHash!==manifest.expectedRemoteHash)throw new Error('V4 source agreement required');
          if(Date.now()-Date.parse(manifest.sourceAgreement.pac.acquiredAt)>15*60_000)throw new Error('Independent source expired; reacquire before apply');
          if(manifest.previewOnly!==true||manifest.reviewedCandidateHash!==manifest.nativeHash)throw new Error('Reviewed preview-only candidate required');
        }
        await appendFile('.powercanvas/canvas-authoring-journal.jsonl', JSON.stringify({ at: new Date().toISOString(), status: 'started', appId, nativeHash: manifest.nativeHash, expectedRemoteHash: manifest.expectedRemoteHash, environmentType: 'Default', nonDisposable: true }) + '\n');
      }
      if (command.name === 'sync_canvas') {
        const destination = resolve(command.arguments.directoryPath); const root = resolve('output/canvas/native');
        if (!destination.startsWith(root + '\\') && !destination.startsWith(root + '/')) throw new Error('Sync destination outside native evidence folder');
        // The caller supplies a fresh directory; existing local YAML is never overwritten silently.
        const { readdir } = await import('node:fs/promises');
        try { if ((await readdir(destination)).length) throw new Error('Sync directory must be empty'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      const response = await request('tools/call', command);
      const filename = `.powercanvas/canvas-${command.name}-${runId}-${next}.json`; await writeFile(filename, JSON.stringify(response, null, 2), { flag: 'wx' });
      if(command.name==='sync_canvas'){
        try{if(response.isError)throw new Error('Official sync returned an error');await readNativeSource(command.arguments.directoryPath);}
        catch(error){console.log(JSON.stringify({tool:command.name,ok:false,resultFile:filename,reason:'No verified App and screen source written: '+String(error)}));process.exitCode=1;continue;}
      }
      if (command.name === 'compile_canvas') {
        await appendFile('.powercanvas/canvas-authoring-journal.jsonl', JSON.stringify({ at: new Date().toISOString(), status: compileSucceeded(response) ? 'validated-awaiting-readback' : 'validation-failed', appId, resultFile: filename, environmentType: 'Default', nonDisposable: true }) + '\n');
        if (!compileSucceeded(response)) { console.log(JSON.stringify({ tool: command.name, ok: false, resultFile: filename, remediation: 'Inspect validation and fresh source before another compile.' })); continue; }
      }
      console.log(JSON.stringify({ tool: command.name, isError: response.isError ?? false, resultFile: filename }));
    }
  }
} finally { clearTimeout(timeout); child.kill(); }
