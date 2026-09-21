import { expect, it } from 'vitest';
import { Logger, redact } from '../src/core/logging.js';
import { publicError } from '../src/core/errors.js';

it('redacts nested credentials, bearer strings, JWTs and terminal control codes', () => {
  const output = JSON.stringify(redact({ headers: { Authorization: 'Bearer aaa', 'Set-Cookie': 'session=private' },
    details: [{ client_secret: 'private', message: 'Bearer sensitive-token clientSecret=private \u001b[31m' }],
    message: 'eyJabc.abc123.signature' }));
  for (const secret of ['sensitive-token', 'private', 'eyJabc', '\u001b']) expect(output).not.toContain(secret);
  expect(output).toContain('REDACTED');
});
it('uses structured logs and omits arbitrary exception bodies from public errors', () => {
  const lines: string[] = [];
  new Logger(line => lines.push(line)).log({ level: 'error', code: 'PF-AUTH-001', message: 'Bearer confidential' });
  expect(JSON.parse(lines[0]!).message).toBe('Bearer [REDACTED]');
  expect(publicError(new Error('raw server clientSecret=private')).message).not.toContain('private');
});
