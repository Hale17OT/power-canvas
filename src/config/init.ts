import { randomUUID } from 'node:crypto';
import { appendFile, lstat, mkdir, open, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { hasCode, PowerCanvasError } from '../core/errors.js';
import { parseProject } from './load.js';

export const templatePath = fileURLToPath(new URL('../../templates/complaint-management/powercanvas.yaml', import.meta.url));

export async function initProject(directory: string, options: { template: string; name?: string }): Promise<{ path: string; projectId: string }> {
  if (options.template !== 'complaint-management') throw new PowerCanvasError('PF-CONFIG-004', 'Requested template is unavailable.', 'Use --template complaint-management.');
  const project = parseProject(await readFile(templatePath, 'utf8'));
  project.project.id = randomUUID();
  if (options.name !== undefined) project.project.name = options.name;
  const source = stringify(project, { lineWidth: 100 });
  parseProject(source); // Validate all overrides before writing any project file.
  const target = resolve(directory);
  const path = resolve(target, 'powercanvas.yaml');
  const ignorePath = resolve(target, '.gitignore');
  let ignore = '';
  try {
    const stat = await lstat(ignorePath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new PowerCanvasError('PF-CONFIG-006', '.gitignore must be a regular file, not a link or directory.', 'Use a project directory with a regular .gitignore.');
    ignore = await readFile(ignorePath, 'utf8');
  } catch (error) {
    if (error instanceof PowerCanvasError) throw error;
    if (!hasCode(error, 'ENOENT')) throw new PowerCanvasError('PF-CONFIG-006', '.gitignore could not be read.', 'Check project file permissions before initialization.');
  }
  await mkdir(target, { recursive: true });
  let file;
  try { file = await open(path, 'wx', 0o600); }
  catch (error) {
    if (hasCode(error, 'EEXIST')) throw new PowerCanvasError('PF-CONFIG-005', 'powercanvas.yaml already exists; initialization did not overwrite it.', 'Select a new directory or edit the existing project.');
    throw new PowerCanvasError('PF-CONFIG-006', 'Cannot create the project configuration.', 'Check directory permissions.');
  }
  try { await file.writeFile(source, 'utf8'); await file.sync(); }
  finally { await file.close(); }
  // Keep these last so a pre-existing negation cannot accidentally expose local state.
  const entries = ['.powercanvas/', '.env', '.env.*', 'playwright/.auth/'];
  try { await appendFile(ignorePath, `${ignore.endsWith('\n') || !ignore ? '' : '\n'}${entries.join('\n')}\n`, 'utf8'); }
  catch { throw new PowerCanvasError('PF-CONFIG-006', 'Project created, but .gitignore could not be updated.', 'Add .powercanvas/, .env, .env.* and playwright/.auth/ to .gitignore before committing.'); }
  return { path, projectId: project.project.id };
}
