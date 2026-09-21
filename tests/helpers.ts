import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { parseProject } from '../src/config/load.js';
import type { Project } from '../src/ir/schema.js';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const fixtureSource = await readFile(join(root, 'templates/complaint-management/powercanvas.yaml'), 'utf8');
export const fixture = (): Project => parseProject(fixtureSource);
export const asYaml = (value: unknown): string => stringify(value, { aliasDuplicateObjects: false });
export async function temporary(): Promise<string> { return mkdtemp(join(tmpdir(), 'powercanvas-test-')); }
export async function clean(path: string): Promise<void> {
  const absolute = resolve(path);
  if (dirname(absolute) !== resolve(tmpdir()) || !basename(absolute).startsWith('powercanvas-test-')) throw new Error('Refusing unsafe test cleanup');
  await rm(absolute, { recursive: true, force: true });
}
