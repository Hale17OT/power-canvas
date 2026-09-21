import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isAlias, isCollection, isPair, parseDocument } from 'yaml';
import { PowerCanvasError, hasCode } from '../core/errors.js';
import { forbiddenKeys, hashJson } from '../core/json.js';
import { isSecretKey } from '../core/logging.js';
import { API_VERSION, projectSchema } from '../ir/schema.js';
import type { Project } from '../ir/schema.js';
import { validateSemantics } from '../ir/validate.js';
import { companion } from '../canvas/taste/memory.js';

export const MAX_CONFIG_BYTES = 1024 * 1024;

function fail(message: string): never {
  throw new PowerCanvasError('PF-CONFIG-002', message, 'Use one plain YAML document without aliases, custom tags, credentials, or unknown properties.');
}

function validateTree(root: unknown): void {
  const pending: { node: unknown; depth: number }[] = [{ node: root, depth: 0 }];
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (depth > 64) fail('Configuration nesting exceeds 64 levels.');
    if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        if (forbiddenKeys.has(key) || isSecretKey(key)) fail('Configuration contains a prohibited key.');
        pending.push({ node: value, depth: depth + 1 });
      }
    }
  }
}

export function parseConfigData(source: string): unknown {
  if (Buffer.byteLength(source, 'utf8') > MAX_CONFIG_BYTES) fail('Configuration exceeds 1 MiB.');
  const document = parseDocument(source, { uniqueKeys: true, prettyErrors: false, strict: true, version: '1.2', schema: 'core' });
  if (document.errors.length || document.warnings.length) fail('Invalid YAML: duplicate keys, multiple documents, invalid syntax, or unsupported tags.');
  const pending: { node: unknown; depth: number }[] = [{ node: document.contents, depth: 0 }];
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (depth > 64) fail('Configuration nesting exceeds 64 levels.');
    if (isAlias(node)) fail('YAML aliases are not supported.');
    if (isCollection(node)) for (const item of node.items) pending.push({ node: item, depth: depth + 1 });
    if (isPair(node)) pending.push({ node: node.key, depth: depth + 1 }, { node: node.value, depth: depth + 1 });
  }
  const raw: unknown = document.toJS({ maxAliasCount: 0 });
  validateTree(raw);
  return raw;
}

export function parseProject(source: string): Project {
  const raw = parseConfigData(source);
  if (raw && typeof raw === 'object' && 'apiVersion' in raw && raw.apiVersion === 'powerforge.dev/v1alpha1') {
    (raw as Record<string, unknown>).apiVersion = API_VERSION;
  }
  if (!raw || typeof raw !== 'object' || !('apiVersion' in raw) || raw.apiVersion !== API_VERSION) {
    throw new PowerCanvasError('PF-CONFIG-003', 'Missing or unsupported apiVersion.', `Use ${API_VERSION}. No automatic migrations are available yet.`);
  }
  const parsed = projectSchema.safeParse(raw);
  if (!parsed.success) {
    throw new PowerCanvasError('PF-VALIDATION-001', 'Project structure is invalid.', 'Correct the reported paths using the v1alpha1 schema.',
      parsed.error.issues.map(issue => ({ code: 'PF-VALIDATION-001', severity: 'error',
        path: issue.path.map(String).join('.'), message: issue.code === 'unrecognized_keys' ? 'Unknown properties are not allowed.' : issue.message })));
  }
  const diagnostics = validateSemantics(parsed.data);
  if (diagnostics.length) throw new PowerCanvasError('PF-VALIDATION-002', 'Project references or semantics are invalid.', 'Correct the reported paths and validate again.', diagnostics);
  return parsed.data;
}

export async function readConfigSource(path: string): Promise<string> {
    const handle = await open(path, 'r');
    let source: string;
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) fail('Configuration path must be a regular file.');
      const bytes = Buffer.alloc(MAX_CONFIG_BYTES + 1);
      // Repeated reads handle short filesystem reads and cap allocation even if the file changes.
      let offset = 0;
      while (offset < bytes.length) {
        const read = await handle.read(bytes, offset, bytes.length - offset, offset);
        if (!read.bytesRead) break;
        offset += read.bytesRead;
      }
      if (offset > MAX_CONFIG_BYTES) fail('Configuration exceeds 1 MiB.');
      source = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, offset));
    } finally { await handle.close(); }
    return source;
}

export async function loadProject(directory: string): Promise<{ project: Project; path: string; sourceHash: string }> {
  const canonicalPath = resolve(directory, 'powercanvas.yaml');
  const legacyPath = resolve(directory, 'powerforge.yaml');
  let path = canonicalPath;
  try {
    let source: string;
    try { source = await readConfigSource(canonicalPath); }
    catch (error) {
      if (!hasCode(error, 'ENOENT')) throw error;
      path = legacyPath;
      source = await readConfigSource(legacyPath);
      // Legacy files remain readable for migration, but the canonical filename is powercanvas.yaml.
      process.stderr.write('Warning: powerforge.yaml is deprecated; rename it to powercanvas.yaml.\n');
    }
    const project = parseProject(source);
    for (const app of Object.values(project.canvasApps ?? {})) if (app.taste?.memory) {
      if (app.taste.design) throw new Error('Use DESIGN.md or inline design, not two authoritative copies.');
      const memory = companion(await readConfigSource(resolve(directory, app.taste.memory.product)), await readConfigSource(resolve(directory, app.taste.memory.design)));
      if (app.taste.personality && app.taste.personality !== memory.design.personality) throw new Error('Taste personality conflicts with DESIGN.md');
      app.taste.design = memory.design;
    }
    return { project, path, sourceHash: hashJson(project) };
  } catch (error) {
    if (error instanceof PowerCanvasError) throw error;
    throw new PowerCanvasError('PF-CONFIG-001', hasCode(error, 'ENOENT') ? 'No powercanvas.yaml found in the selected project directory.' : 'Cannot read project configuration as UTF-8.',
      'Run powercanvas init in a new directory or select an existing project with --project. Check file permissions.', [], { cause: error });
  }
}
