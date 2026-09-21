import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { hasCode, PowerCanvasError } from './errors.js';

export async function readJson<T>(path: string, schema: z.ZodType<T>): Promise<T | undefined> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) throw new Error('Unsafe file');
    return schema.parse(JSON.parse(await readFile(path, 'utf8')) as unknown);
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return undefined;
    throw new PowerCanvasError('PF-CONFIG-007', 'Local JSON configuration is unreadable or invalid.', 'Inspect the selected configuration file. Do not replace corrupt ownership state.');
  }
}

/** Nonsecret configuration only. Atomic replacement under an exclusive sibling lock. */
export async function editJson<T>(path: string, schema: z.ZodType<T>, edit: (value: T | undefined) => T): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const lock = await open(`${path}.lock`, 'wx', 0o600).catch(() => {
    throw new PowerCanvasError('PF-STATE-002', 'Configuration is locked or inaccessible.', 'Wait for the other PowerCanvas process or inspect a crashed lock.');
  });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const value = schema.parse(edit(await readJson(path, schema)));
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(`${JSON.stringify(value, null, 2)}\n`); await file.sync(); } finally { await file.close(); }
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(error => { if (!hasCode(error, 'ENOENT')) throw error; });
    await lock.close(); await unlink(`${path}.lock`);
  }
}
