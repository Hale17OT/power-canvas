import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { JournalEvent, Ownership } from '../state/models.js';
import { journalEventSchema } from '../state/models.js';
import { hashJson } from '../core/json.js';

export function unresolvedProviderOutcomes(events: JournalEvent[], ownership: Ownership, roots: ReadonlySet<string>) {
  const latest = new Map<string, JournalEvent>();
  for (const event of events) if (roots.has(event.resourceId)) {
    if (hashJson(event.target) !== hashJson(ownership.target) || event.projectId !== ownership.projectId) throw Error('Journal target/project differs from ownership');
    latest.set(event.executionId + '/' + event.operationId, event);
  }
  return [...latest.values()].filter(e => ['started', 'remoteSucceeded', 'outcomeUnknown'].includes(e.status) && !ownership.resources.some(r =>
    r.resourceId === e.resourceId && r.recoveryEvidence?.originalExecutionId === e.executionId &&
    (e.operationId === r.recoveryEvidence.originalOperationId || e.operationId.startsWith(r.recoveryEvidence.originalOperationId + '/'))))
    .map(e => e.executionId + '/' + e.operationId).sort();
}

/** Read local immutable journal bytes; no profile, ownership or tenant writes. */
export async function readProviderOutcomes(directory: string, ownership: Ownership, roots: ReadonlySet<string>) {
  const events: JournalEvent[] = [], journals: { file: string; sha256: string }[] = [];
  for (const file of (await readdir(directory)).filter(f => /^journal-.+\.jsonl$/.test(f)).sort()) {
    const bytes = await readFile(join(directory, file));
    const entries = bytes.toString('utf8').trim().split(/\r?\n/).filter(Boolean).map(line => journalEventSchema.parse(JSON.parse(line)));
    if (!entries.some(e => roots.has(e.resourceId))) continue;
    events.push(...entries);journals.push({ file, sha256: createHash('sha256').update(bytes).digest('hex') });
    if (!bytes.equals(await readFile(join(directory, file)))) throw Error('Journal changed during read-only closure');
  }
  return { unknown: unresolvedProviderOutcomes(events, ownership, roots), journalHashes: journals.map(j => j.sha256), journals };
}
