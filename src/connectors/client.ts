import { z } from 'zod';
import { connectorSchema } from './compile.js';
import type { ConnectorSpec, ResponseField } from './compile.js';
import { PowerCanvasError } from '../core/errors.js';

export type ConnectorResult = { state: 'loaded' | 'empty'; data: unknown; attempts: number } | { state: 'unauthorized' | 'forbidden' | 'throttled' | 'unavailable' | 'timeout' | 'invalidResponse' | 'invalidRequest'; attempts: number; retryAfterSeconds?: number };
/** GET-only operation harness. Credentials belong to the injected transport, never to project YAML/artifacts. */
export async function runConnectorOperation(input: ConnectorSpec, operationId: string, parameters: Record<string, string | number>, options: {
  transport: typeof fetch; timeoutMs?: number;
}): Promise<ConnectorResult> {
  const spec = connectorSchema.parse(input); const operation = spec.operations.find(op => op.id === operationId);
  if (!operation) throw new PowerCanvasError('PF-CONNECTOR-003', 'Unknown operation.', 'Use a declared GET operation.');
  if (Object.keys(parameters).some(key => !operation.parameters.some(p => p.name === key))) return { state: 'invalidRequest', attempts: 0 };
  const url = new URL(spec.baseUrl.replace(/\/$/, '') + operation.path);
  for (const p of operation.parameters) {
    const value = parameters[p.name];
    if (value === undefined) { if (p.required) return { state: 'invalidRequest', attempts: 0 }; continue; }
    if (p.type === 'integer' ? !Number.isSafeInteger(value) || (p.maximum !== undefined && (Number(value) < 1 || Number(value) > p.maximum)) : typeof value !== 'string' || value.length > 512) return { state: 'invalidRequest', attempts: 0 };
    url.searchParams.set(p.name, String(value));
  }
  const abort = new AbortController(); const timer = setTimeout(() => abort.abort(), options.timeoutMs ?? 10_000);
  try {
    const response = await options.transport(url, { method: 'GET', redirect: 'error', signal: abort.signal, headers: { Accept: 'application/json' } });
    if (response.status !== 200) {
      const state = ({ 400: 'invalidRequest', 401: 'unauthorized', 403: 'forbidden', 429: 'throttled' } as const)[response.status as 400 | 401 | 403 | 429] ?? 'unavailable';
      const raw = response.headers.get('Retry-After'); const retry = raw && /^\d+$/.test(raw) ? Number(raw) : NaN;
      return { state, attempts: 1, ...(Number.isSafeInteger(retry) && retry <= 3600 ? { retryAfterSeconds: retry } : {}) };
    }
    if (!response.headers.get('content-type')?.includes('application/json')) return { state: 'invalidResponse', attempts: 1 };
    // Bound response memory; never log error bodies or credentials.
    const reader = response.body?.getReader(); if (!reader) return { state: 'invalidResponse', attempts: 1 };
    const chunks: Uint8Array[] = []; let bytes = 0;
    try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.length; if (bytes > 1024 * 1024) { await reader.cancel(); return { state: 'invalidResponse', attempts: 1 }; } chunks.push(chunk.value); } }
    finally { reader.releaseLock(); }
    const rowSchema = (fields: ResponseField[]): z.ZodType => z.object(Object.fromEntries(fields.map(f => { let type: z.ZodType = f.type === 'object' ? rowSchema(f.fields!) : f.type === 'integer' ? z.int() : f.type === 'number' ? z.number().finite() : f.type === 'boolean' ? z.boolean() : z.string(); if (f.nullable) type = type.nullable(); return [f.name, f.required ? type : type.optional()]; })));
    const row = rowSchema(operation.response.fields);
    const schema = operation.response.collection ? operation.response.collectionFormat === 'array' ? z.array(row).max(100) : z.object({ items: z.array(row).max(100), ...(operation.response.pagination === 'cursor' ? { nextCursor: z.string().max(512).optional() } : {}) }) : row;
    const parsed = schema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (!parsed.success) return { state: 'invalidResponse', attempts: 1 };
    const rows = operation.response.collectionFormat === 'array' ? parsed.data as unknown[] : (parsed.data as { items: unknown[] }).items;
    return { state: operation.response.collection && rows.length === 0 ? 'empty' : 'loaded', data: parsed.data, attempts: 1 };
  } catch { return { state: abort.signal.aborted ? 'timeout' : 'invalidResponse', attempts: 1 }; }
  finally { clearTimeout(timer); }
}
