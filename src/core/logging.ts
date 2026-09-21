const secretKey = /^(?:authorization|proxyAuthorization|accessToken|refreshToken|idToken|token|clientSecret|password|secret|cookie|setCookie|credentials|connectionString)$/i;

export function isSecretKey(key: string): boolean {
  return secretKey.test(key.replace(/[-_ ]/g, ''));
}

export function redactText(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s,;"']+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .replace(/\b(access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|password|cookie|authorization)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=[REDACTED]')
    // eslint-disable-next-line no-control-regex -- Strip untrusted terminal control bytes.
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 32) return '[DEPTH LIMIT]';
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(item => redact(item, depth + 1));
  if (value && typeof value === 'object') {
    if (value instanceof Error) return { name: value.name, message: redactText(value.message) };
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      redactText(key), isSecretKey(key) ? '[REDACTED]' : redact(item, depth + 1),
    ]));
  }
  return value;
}

export interface LogEvent { level: 'info' | 'warn' | 'error'; code: string; message: string }
export class Logger {
  constructor(private readonly sink: (line: string) => void) {}
  log(event: LogEvent): void {
    this.sink(`${JSON.stringify(redact({ timestamp: new Date().toISOString(), ...event }))}\n`);
  }
}
