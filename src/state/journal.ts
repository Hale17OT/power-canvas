import type { JournalEvent } from './models.js';
import { PowerCanvasError } from '../core/errors.js';

export function assertJournalTransition(previous: JournalEvent | undefined, next: JournalEvent): void {
  const allowed: Record<JournalEvent['status'], JournalEvent['status'][]> = {
    started: ['remoteSucceeded', 'failed', 'outcomeUnknown'], remoteSucceeded: ['verified', 'failed', 'outcomeUnknown'],
    verified: [], failed: [], outcomeUnknown: [],
  };
  if ((!previous && next.status !== 'started') || (previous && !allowed[previous.status].includes(next.status))) {
    throw new PowerCanvasError('PF-STATE-003', 'Invalid operation journal transition.', 'Preserve the journal and inspect execution before attempting recovery.');
  }
}
