import { PowerCanvasError } from '../core/errors.js';

/** Preserve the platform response; severity, not issue count, determines readiness. */
export function evaluateAppValidation(response: unknown) {
  const data = response as { AppValidationResponse?: { ValidationSuccess?: unknown; ValidationIssueList?: unknown } } | null;
  const validation = data?.AppValidationResponse;
  const issues = Array.isArray(validation?.ValidationIssueList) ? validation.ValidationIssueList : [];
  const errors = issues.filter(i => i?.ErrorType === 'Error');
  const warnings = issues.filter(i => i?.ErrorType === 'Warning');
  const unknown = issues.filter(i => !i || !['Error', 'Warning'].includes(i.ErrorType) || typeof i.Message !== 'string');
  const recognized = typeof validation?.ValidationSuccess === 'boolean' && Array.isArray(validation.ValidationIssueList) && !unknown.length;
  const status = !recognized ? 'VALIDATION_UNRECOGNIZED' : validation.ValidationSuccess === false || errors.length ? 'APP_VALIDATION_ERROR' : warnings.length ? 'PASS_WITH_WARNINGS' : 'PASS';
  return { status, passed: status === 'PASS' || status === 'PASS_WITH_WARNINGS', validationSuccess: validation?.ValidationSuccess === true, errors, warnings, issues, response };
}

export function requireAppValidation(response: unknown) {
  const result = evaluateAppValidation(response);
  if (!result.passed) throw new PowerCanvasError('PF-MDA-008', result.status, 'Inspect the retained ValidateApp response before publication or access.');
  return result;
}
