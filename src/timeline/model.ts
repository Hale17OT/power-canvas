export interface TimelineEvent { id: string; timestamp: string; actor: string; kind: 'created' | 'updated' | 'escalated' | 'resolved'; title: string; description: string; before?: string; after?: string }
/** Host-neutral bounded event contract. Render titles/descriptions as text, never HTML. */
export function parseTimeline(json: string): TimelineEvent[] {
  if (json.length > 100000) throw new Error('Timeline exceeds 100 KB.');
  const values: unknown = JSON.parse(json || '[]');
  if (!Array.isArray(values) || values.length > 200) throw new Error('Timeline must contain at most 200 events.');
  const ids = new Set<string>();
  const events = values.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid event.');
    const event = value as Record<string, unknown>;
    if (Object.keys(event).some(k => !['id', 'timestamp', 'actor', 'kind', 'title', 'description', 'before', 'after'].includes(k))) throw new Error('Unknown event property.');
    for (const key of ['id', 'timestamp', 'actor', 'kind', 'title', 'description']) if (typeof event[key] !== 'string' || (event[key] as string).length > (key === 'description' ? 2000 : 200)) throw new Error('Invalid event text.');
    if (!event.id || !event.title || ids.has(event.id as string)) throw new Error('Event identities and titles must be nonempty; identities unique.');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(event.timestamp as string) || !Number.isFinite(Date.parse(event.timestamp as string))) throw new Error('Timestamp must be UTC ISO.');
    if (!['created', 'updated', 'escalated', 'resolved'].includes(event.kind as string)) throw new Error('Unknown event kind.');
    for (const key of ['before', 'after']) if (event[key] !== undefined && (typeof event[key] !== 'string' || (event[key] as string).length > 2000)) throw new Error('Invalid change value.');
    ids.add(event.id as string); return event as unknown as TimelineEvent;
  });
  return events.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp) || a.id.localeCompare(b.id));
}
