import { isDeepStrictEqual } from 'node:util';
import { PowerCanvasError } from '../core/errors.js';
import type { CompiledCanvas, CompiledNode } from './compile.js';

export interface CanvasSession { appId: string; solution: string; environmentType: string; nonDisposable: boolean; saved: boolean; studioOpen: boolean; coauthoring: boolean; preparedSources: string[]; revision: string; controls: Record<string, string> }
/** Semantic adapter boundary. Microsoft tools supply control versions and validate their current YAML dialect. */
export interface CanvasAuthoringAdapter {
  inspect(): Promise<CanvasSession>;
  validateNative(compiled: CompiledCanvas, session: CanvasSession): Promise<{ valid: boolean; diagnostics: string[]; artifactHash: string }>;
  synchronize(input: { artifactHash: string; expectedRevision: string; ownedAppId: string; solution: string }): Promise<{ revision: string }>;
}
export function authoringPrerequisites(compiled: CompiledCanvas, session: CanvasSession, ownership: { appId: string; solution: string; observedRevision: string }) {
  const blockers: string[] = [];
  if (compiled.applicationBoundary.appId && session.appId !== compiled.applicationBoundary.appId) blockers.push('Canvas session differs from the project-pinned application ID.');
  if (session.appId !== ownership.appId || session.solution !== ownership.solution) blockers.push('App ownership or dedicated solution does not match.');
  if (session.revision !== ownership.observedRevision) blockers.push('Studio changed since discovery; refresh and replan.');
  if (!session.saved || !session.studioOpen || !session.coauthoring) blockers.push('Saved, open, coauthoring Studio session is required.');
  if (session.environmentType === 'Default' && !session.nonDisposable) blockers.push('Default must be recorded as non-disposable.');
  for (const source of new Set(compiled.queries.map(q => q.source))) if (!session.preparedSources.includes(source)) blockers.push(`Data source ${source} must be prepared in Studio.`);
  for (const control of compiled.requiredControls) if (!session.controls[control]) blockers.push(`Live control discovery must resolve ${control}.`);
  return { ready: blockers.length === 0, blockers };
}
export type PropertySnapshot = Record<string, Record<string, unknown>>;
export function propertySnapshot(tree: CompiledNode): PropertySnapshot {
  const result: PropertySnapshot = {};
  function visit(node: CompiledNode, parent: string | null) { result[node.id] = { component: node.component, version: node.version, parent, children: node.children.map(child => child.id), ...node.props }; node.children.forEach(child => visit(child, node.id)); }
  visit(tree, null); return result;
}
/** Three-way property merge. Missing owned controls/properties and any removal are review blockers. */
export function planCanvasMerge(baseline: PropertySnapshot, desired: PropertySnapshot, observed: PropertySnapshot) {
  const changes: { id: string; property: string; value: unknown }[] = []; const conflicts: { id: string; property: string; reason: string }[] = []; const preserved: { id: string; property: string }[] = [];
  for (const id of Object.keys(baseline)) if (!desired[id] || !observed[id]) conflicts.push({ id, property: '*', reason: 'Removal or missing owned control requires review.' });
  for (const [id, next] of Object.entries(desired)) {
    const original = baseline[id]; const current = observed[id];
    if (!original) { if (current) conflicts.push({ id, property: '*', reason: 'New control collides with an existing control; adoption is forbidden.' }); else changes.push({ id, property: '*', value: next }); continue; }
    if (!current) continue;
    for (const key of new Set([...Object.keys(original), ...Object.keys(next), ...Object.keys(current)])) {
      if (!(key in next)) { if (key in original) conflicts.push({ id, property: key, reason: 'Property removal requires review.' }); else preserved.push({ id, property: key }); continue; }
      if (!(key in current) && key in original) { conflicts.push({ id, property: key, reason: 'Owned property was removed manually.' }); continue; }
      const equal = isDeepStrictEqual;
      if (equal(next[key], current[key])) continue;
      if (equal(next[key], original[key])) preserved.push({ id, property: key });
      else if (equal(current[key], original[key])) changes.push({ id, property: key, value: next[key] });
      else conflicts.push({ id, property: key, reason: 'Generated and manual edits changed the same property.' });
    }
  }
  return { executable: conflicts.length === 0, changes, conflicts, preserved };
}
export async function validateAuthoring(adapter: CanvasAuthoringAdapter, compiled: CompiledCanvas, ownership: { appId: string; solution: string; observedRevision: string }) {
  const session = await adapter.inspect(); const prerequisites = authoringPrerequisites(compiled, session, ownership);
  if (!prerequisites.ready) throw new PowerCanvasError('PF-CANVAS-005', 'Canvas authoring prerequisites are incomplete.', prerequisites.blockers.join(' '));
  // Validation only. Synchronization additionally requires native diff, journal and live ownership checks.
  return adapter.validateNative(compiled, session);
}
