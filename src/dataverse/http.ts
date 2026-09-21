import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { TokenSource } from '../auth/msal.js';
import { PowerCanvasError } from '../core/errors.js';
import { redactText } from '../core/logging.js';

export class ApiError extends PowerCanvasError {
  constructor(readonly status: number, readonly requestId: string, readonly uncertain: boolean, diagnostic?: { code: string; message: string }) {
    super('PF-DV-001', `Microsoft API request failed (${status || 'transport failure'}). Correlation: ${requestId}.${diagnostic ? ` Service ${diagnostic.code}: ${redactText(diagnostic.message).slice(0, 600)}` : ''}`,
      status === 401 ? 'Renew the selected authentication profile.' : status === 403 ? 'Check the selected identity permissions; no automatic privilege grants are made.' :
        uncertain ? 'The write outcome is unknown. Inspect the journal and rediscover before retrying.' : 'Inspect target readiness and retry after resolving the service error.');
  }
}
export class DataverseHttp {
  constructor(readonly base: string, private readonly credentials: TokenSource, private readonly transport: typeof fetch = fetch) {}
  async request(path: string, method = 'GET', body?: unknown, extra: Record<string, string> = {}): Promise<{ data: unknown; requestId: string; remoteId?: string }> {
    const url = new URL(path, this.base);
    const base = new URL(this.base);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || url.username || url.password || url.hash) {
      throw new PowerCanvasError('PF-ENV-001', 'API URL escaped the verified service boundary.', 'Use only same-origin documented service paths.');
    }
    const requestId = randomUUID();
    for (let attempt = 0; ; attempt++) {
      const token = await this.credentials.token(base.origin);
      let response: Response;
      try {
        response = await this.transport(url, { method, redirect: 'manual', signal: AbortSignal.timeout(method === 'GET' ? 30000 : 180000),
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json',
            'OData-Version': '4.0', 'OData-MaxVersion': '4.0', 'x-ms-client-request-id': requestId, ...extra },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      } catch { throw new ApiError(0, requestId, method !== 'GET'); }
      if (method === 'GET' && [429, 503].includes(response.status) && attempt < 2) {
        const hint = response.headers.get('retry-after');
        const delay = hint ? (/^\d+$/.test(hint) ? Number(hint) * 1000 : Date.parse(hint) - Date.now()) : 250 * 2 ** attempt;
        if (Number.isFinite(delay) && delay >= 0 && delay <= 5000) { await new Promise(resolve => setTimeout(resolve, delay)); continue; }
      }
      if (!response.ok) {
        // Only the bounded OData code/message is exposed; never headers, inner errors or raw bodies.
        let diagnostic: { code: string; message: string } | undefined;
        try {
          const parsed = z.object({ error: z.object({ code: z.string().regex(/^0x[a-f0-9]{8}$/i), message: z.string() }) }).safeParse(await response.json());
          if (parsed.success) diagnostic = parsed.data.error;
        } catch { /* Non-JSON failures retain the safe status/correlation diagnostic. */ }
        throw new ApiError(response.status, requestId, method !== 'GET' && response.status >= 500, diagnostic);
      }
      const entityId = response.headers.get('odata-entityid');
      let guid: string | undefined;
      try { if (entityId && new URL(entityId, base).origin === base.origin) guid = entityId.match(/\(([a-f0-9-]{36})\)\/?$/i)?.[1]; } catch { /* Malformed optional receipt cannot turn a successful write into a retry. */ }
      const receipt = guid && z.guid().safeParse(guid).success ? { remoteId: guid.toLowerCase() } : {};
      if (response.status === 204 || response.headers.get('content-length') === '0') return { data: null, requestId, ...receipt };
      try { return { data: await response.json() as unknown, requestId, ...receipt }; }
      catch { throw new ApiError(response.status, requestId, method !== 'GET'); }
    }
  }
  async all(path: string): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = []; const visited = new Set<string>();
    let next: string | undefined = path;
    while (next) {
      if (visited.has(next) || visited.size >= 1000) throw new PowerCanvasError('PF-DV-002', 'Metadata pagination did not terminate.', 'Do not treat partial discovery as absence.');
      visited.add(next);
      const result = z.object({ value: z.array(z.record(z.string(), z.unknown())), '@odata.nextLink': z.string().optional() }).parse((await this.request(next)).data);
      rows.push(...result.value); next = result['@odata.nextLink'];
    }
    return rows;
  }
}
