import { createHash } from 'node:crypto';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
// Optional object properties are omitted exactly as JSON serialization omits them.
export type JsonInput = null | boolean | number | string | JsonInput[] | { [key: string]: JsonInput | undefined };
export const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);

/** Sort object keys only. Array order can carry UI or operation semantics. */
export function canonicalJson(value: JsonInput): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('Non-finite JSON number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`).join(',')}}`;
}

export function hashJson(value: JsonInput): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
