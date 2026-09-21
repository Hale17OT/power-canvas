import { isDeepStrictEqual as equal } from 'node:util';
import type { JsonInput } from '../core/json.js';
import { hashJson } from '../core/json.js';
import type { NativeFiles } from './native.js';

type Tree = { [key: string]: JsonInput | undefined };
const object = (v: JsonInput | undefined): v is Tree => Boolean(v && typeof v === 'object' && !Array.isArray(v));
// Name sequences become keyed objects so inserted controls do not shift every identity.
function keyed(value: JsonInput): JsonInput {
  if (Array.isArray(value)) return value.map(keyed);
  if (!object(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => {
    if (k === 'Children' && Array.isArray(v)) {
      const rows = v as Tree[]; const names = rows.map(row => Object.keys(row)[0]!);
      if (new Set(names).size !== names.length) throw new Error('Duplicate native control name.');
      return [k, { $order: names, ...Object.fromEntries(rows.map((row, i) => [names[i]!, keyed(row[names[i]!]!)])) }];
    }
    return [k, v === undefined ? undefined : keyed(v)];
  }));
}
function unkeyed(value: JsonInput): JsonInput {
  if (Array.isArray(value)) return value.map(unkeyed);
  if (!object(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => {
    if (k === 'Children' && object(v) && Array.isArray(v.$order)) return [k, v.$order.map(n => ({ [String(n)]: unkeyed(v[String(n)]!) }))];
    return [k, v === undefined ? undefined : unkeyed(v)];
  }));
}
/** Store both generated intent and normalized server receipt: Studio may omit default properties. */
export function planNativeSync(lastGenerated: NativeFiles, lastObserved: NativeFiles, desired: NativeFiles, current: NativeFiles) {
  const changes: string[] = []; const conflicts: string[] = []; const preserved: string[] = [];
  function missingOwned(receipt: JsonInput, live: JsonInput | undefined, path: string) {
    if (!object(receipt)) return;
    if ((path.endsWith('.pa.yaml') || 'Control' in receipt) && !object(live)) { conflicts.push(`${path}: owned screen or control is missing`); return; }
    for (const [key, value] of Object.entries(receipt)) if (value !== undefined) missingOwned(value, object(live) ? live[key] : undefined, `${path}/${key}`);
  }
  missingOwned(keyed(lastObserved), keyed(current), '');
  function merge(base: JsonInput | undefined, receipt: JsonInput | undefined, next: JsonInput | undefined, live: JsonInput | undefined, path: string): JsonInput | undefined {
    if (equal(base, next)) { if (!equal(receipt, live)) preserved.push(path); return live; }
    if (next === undefined) { conflicts.push(`${path}: generated removal is blocked`); return live; }
    if (base === undefined && live !== undefined && object(next) && ('Control' in next || path.endsWith('.pa.yaml'))) { conflicts.push(`${path}: unowned name collision`); return live; }
    if (object(next) && (object(base) || base === undefined) && (object(live) || live === undefined)) {
      const result = structuredClone(live ?? {}) as Tree;
      for (const key of new Set([...Object.keys(base ?? {}), ...Object.keys(next)])) {
        const value = merge(object(base) ? base[key] : undefined, object(receipt) ? receipt[key] : undefined, next[key], object(live) ? live[key] : undefined, `${path}/${key}`);
        if (value !== undefined) result[key] = value;
      }
      return result;
    }
    if (!equal(receipt, live) && !equal(next, live)) { conflicts.push(`${path}: manual and generated changes conflict`); return live; }
    changes.push(path); return next;
  }
  const files = unkeyed(merge(keyed(lastGenerated), keyed(lastObserved), keyed(desired), keyed(current), '')!) as NativeFiles;
  return { executable: conflicts.length === 0, changes, conflicts, preserved, files, expectedRemoteHash: hashJson(current), nativeHash: hashJson(files), noOp: conflicts.length === 0 && changes.length === 0 };
}
