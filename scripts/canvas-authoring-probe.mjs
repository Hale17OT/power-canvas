// Read-only initialization and tool discovery for the pinned official Microsoft server.
import { spawn } from 'node:child_process';
import process from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { mkdir, writeFile } from 'node:fs/promises';
const directory = resolve('.powercanvas/tooling');
const child = spawn(resolve(directory, 'dotnet/dotnet.exe'), ['exec', resolve(directory, 'dotnet/sdk/10.0.401/dotnet.dll'), 'dnx', 'Microsoft.PowerApps.CanvasAuthoring.McpServer@1.1.5', '--yes'], {
  windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, DOTNET_ROOT: resolve(directory, 'dotnet'), DOTNET_CLI_HOME: resolve(directory, 'cli-home'), NUGET_PACKAGES: resolve(directory, 'packages'), DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1', DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1' },
});
let next = 1; const pending = new Map();
createInterface({ input: child.stdout }).on('line', line => { try { const message = JSON.parse(line); if (message.id && pending.has(message.id)) { const { resolve, reject } = pending.get(message.id); pending.delete(message.id); if (message.error) reject(new Error('MCP protocol error')); else resolve(message.result); } } catch { /* Non-protocol setup output is deliberately not logged. */ } });
child.stderr.on('data', () => { /* No raw auth or service diagnostics in evidence. */ });
const send = message => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
const request = (method, params) => new Promise((resolve, reject) => { const id = next++; pending.set(id, { resolve, reject }); send({ id, method, params }); });
const timeout = setTimeout(() => { console.error('Canvas MCP initialization timed out; no authoring calls sent.'); child.kill(); process.exitCode = 1; }, 120_000);
try {
  const initialized = await request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'powercanvas-prerequisite-probe', version: '0.1.0' } });
  send({ method: 'notifications/initialized', params: {} });
  const result = await request('tools/list', {});
  await mkdir('experiments/canvas-authoring/evidence', { recursive: true });
  await writeFile('experiments/canvas-authoring/evidence/mcp-tools.json', JSON.stringify({ observedAt: new Date().toISOString(), package: 'Microsoft.PowerApps.CanvasAuthoring.McpServer@1.1.5', serverInfo: initialized.serverInfo, remoteAuthoringCalls: 0, tools: result.tools }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ ok: true, serverInfo: initialized.serverInfo, tools: result.tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) }));
} finally { clearTimeout(timeout); child.kill(); }
