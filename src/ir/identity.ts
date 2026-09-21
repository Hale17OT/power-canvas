import { z } from 'zod';

const part = z.string().regex(/^[a-zA-Z][a-zA-Z0-9.-]*$/);

/** Dictionary paths are stable intent IDs, never labels or generated target GUIDs. */
export function resourceId(projectId: string, provider: string, kind: string, path: readonly string[]): string {
  z.uuid().parse(projectId);
  part.parse(provider);
  part.parse(kind);
  if (!path.length) throw new TypeError('A resource path is required');
  path.forEach(segment => part.parse(segment));
  return `pf:${projectId.toLowerCase()}:${provider}:${kind}:${path.join('/')}`;
}
