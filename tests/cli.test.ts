import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import { VERSION } from '../src/core/version.js';
import { clean, root, temporary } from './helpers.js';

const run = promisify(execFile);
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(clean)); });
async function cli(args: string[]) {
  try { return { ...(await run(process.execPath, [join(root, 'dist/cli/index.js'), ...args], { timeout: 12000 })), code: 0 }; }
  catch (error) {
    const result = error as { stdout: string; stderr: string; code: number };
    return { stdout: result.stdout, stderr: result.stderr, code: result.code };
  }
}

it('ships a version matching package.json and advertises only working commands', async () => {
  const result = await cli(['--version']);
  expect(result.stdout.trim()).toBe(VERSION);
  const pkg: { version: string } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  expect(VERSION).toBe(pkg.version);
  const help = await cli(['--help']);
  expect(help.code).toBe(0);
  expect(help.stdout).toContain('validate');
  expect(help.stdout).toContain('apply [');
  expect(help.stdout).not.toContain('deploy [');
  expect(help.stdout).not.toContain('build [');
});

it('runs init → validate → doctor through the compiled CLI with clean JSON stdout', async () => {
  const dir = await temporary(); dirs.push(dir);
  const initialized = await cli(['init', dir, '--json', '--non-interactive']);
  expect(initialized.code).toBe(0);
  expect(JSON.parse(initialized.stdout).ok).toBe(true);
  const validated = await cli(['validate', '--project', dir, '--json', '--offline']);
  expect(validated.stderr).toBe('');
  expect(validated.code).toBe(0);
  expect(JSON.parse(validated.stdout)).toMatchObject({ ok: true, executable: false, inventory: { tables: 2, columns: 4, relationships: 1, apps: 1, roles: 1 } });
  const diagnosed = await cli(['doctor', '--project', dir, '--json']);
  expect(diagnosed.code).toBe(0);
  expect(JSON.parse(diagnosed.stdout)).toMatchObject({ scope: 'local', readyForRemote: false });
  const blocked = await cli(['validate', '--project', dir, '--json', '--require-executable']);
  expect(blocked.code).toBe(1);
  expect(JSON.parse(blocked.stdout).error.code).toBe('PF-CAPABILITY-001');
});

it('returns stable machine errors for invalid commands and missing configuration', async () => {
  const unknown = await cli(['apply', '--json', '--password', 'never-print-this']);
  expect(unknown.code).toBe(1);
  expect(JSON.parse(unknown.stdout).error.code).toBe('PF-CLI-001');
  expect(unknown.stdout + unknown.stderr).not.toContain('never-print-this');
  const dir = await temporary(); dirs.push(dir);
  const missing = await cli(['validate', '--project', dir, '--json']);
  expect(missing.code).toBe(1);
  expect(JSON.parse(missing.stdout).error.code).toBe('PF-CONFIG-001');
});

it('compiles Canvas and connector artifacts through the real CLI and refuses artifact overwrite', async () => {
  const directory = await temporary(); dirs.push(directory); const out = join(directory, 'canvas');
  const args = ['--json', '--project', join(root, 'examples/canvas-complaints'), 'canvas', 'compile', '--app', 'complaintPortal', '--out', out];
  const result = await cli(args); expect(result.code).toBe(0); expect(JSON.parse(result.stdout)).toMatchObject({ scope: 'semantic-canvas-ir', nativeAppCreated: false });
  const original = await readFile(join(out, 'canvas-ir.json'), 'utf8');
  const repeated = await cli(args); expect(repeated.code).toBe(1); expect(JSON.parse(repeated.stdout).error.code).toBe('PF-CONFIG-004'); expect(await readFile(join(out, 'canvas-ir.json'), 'utf8')).toBe(original);
  const connector = await cli(['--json', 'connector-compile', '--spec', join(root, 'examples/connectors/complaint-catalog.yaml'), '--out', join(directory, 'connector')]);
  expect(connector.code).toBe(0); expect(JSON.parse(connector.stdout).remoteCreated).toBe(false);
  expect(JSON.parse(await readFile(join(directory, 'connector/apiDefinition.swagger.json'), 'utf8')).swagger).toBe('2.0');
});
