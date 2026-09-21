export type ErrorCode = `PF-${'FLOW' | 'AUTH' | 'ENV' | 'DV' | 'MDA' | 'CANVAS' | 'CONNECTOR' | 'SOLUTION' | 'PLAN' | 'STATE' | 'SAFETY' | 'VALIDATION' | 'CONFIG' | 'CAPABILITY' | 'CLI' | 'INTERNAL'}-${string}`;

export interface Diagnostic {
  code: ErrorCode;
  severity: 'error' | 'warning';
  message: string;
  path?: string;
  remediation?: string;
}

export class PowerCanvasError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly remediation: string,
    readonly diagnostics: readonly Diagnostic[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PowerCanvasError';
  }
}

export function publicError(error: unknown): PowerCanvasError {
  return error instanceof PowerCanvasError ? error : new PowerCanvasError(
    'PF-INTERNAL-001', 'An unexpected local failure occurred.',
    'Check file access and rerun. Report the command and PowerCanvas version without credentials.',
  );
}

export function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
