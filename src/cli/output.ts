import { redact } from '../core/logging.js';
import type { Diagnostic, PowerCanvasError } from '../core/errors.js';

export function emit(data: object, text: string, json: boolean): void {
  process.stdout.write(json ? `${JSON.stringify(redact(data), null, 2)}\n` : `${String(redact(text))}\n`);
}

export function formatDiagnostics(diagnostics: readonly Diagnostic[]): string {
  return diagnostics.map(item => `${item.severity === 'error' ? 'Error' : 'Warning'} ${item.code}${item.path ? ` [${item.path}]` : ''}: ${item.message}`).join('\n');
}

export function emitError(error: PowerCanvasError, json: boolean): void {
  const data = { ok: false, error: { code: error.code, message: error.message, remediation: error.remediation, diagnostics: error.diagnostics } };
  if (json) emit(data, '', true);
  else process.stderr.write(`${String(redact(`${error.code}: ${error.message}\n${formatDiagnostics(error.diagnostics)}\n${error.remediation}`))}\n`);
}
