import { z } from 'zod';
import { PowerCanvasError } from '../core/errors.js';

/** Device and design intent never authorizes an application-level operation. */
export const applicationPolicySchema = z.strictObject({
  requiresNewApplication: z.boolean().default(false),
  existingAppId: z.uuid().optional(),
  requirement: z.strictObject({ kind: z.literal('explicit-application'), statement: z.string().trim().min(20) }).optional(),
}).superRefine((value, ctx) => {
  if (value.requiresNewApplication && (!value.requirement || value.existingAppId)) ctx.addIssue({ code: 'custom', message: 'A new application requires an explicit application-level requirement and cannot replace a pinned existing app.' });
  if (!value.requiresNewApplication && value.requirement) ctx.addIssue({ code: 'custom', message: 'New-application requirements must explicitly set requiresNewApplication.' });
});
export const applicationPurposes = ['application', 'desktop', 'tablet', 'mobile', 'responsive', 'alternate-layout', 'benchmark', 'critique', 'screenshot', 'taste'] as const;
export const applicationOperationSchema = z.strictObject({
  operation: z.enum(['update-existing', 'create-new']).default('update-existing'),
  purpose: z.enum(applicationPurposes).default('application'),
  targetAppId: z.uuid().optional(),
});
export function planApplicationOperation(rawPolicy: unknown = {}, rawOperation: unknown = {}) {
  const policy = applicationPolicySchema.parse(rawPolicy);
  const request = applicationOperationSchema.parse(rawOperation);
  if (request.operation === 'create-new' && (request.purpose !== 'application' || !policy.requiresNewApplication || !policy.requirement)) throw new PowerCanvasError('PF-CANVAS-006', 'New Canvas App blocked: device/layout, critique and benchmark work must stay in the same app.', 'An explicit application-level requirement is required.');
  if (request.operation === 'create-new' && request.targetAppId) throw new Error('A creation plan cannot retarget an existing application.');
  if (policy.existingAppId && request.targetAppId && policy.existingAppId !== request.targetAppId) throw new Error('Application identity mismatch: composition cannot retarget the pinned existing Canvas App.');
  const appId = policy.existingAppId ?? request.targetAppId;
  return { applicationCount: 1 as const, operation: request.operation, requiresNewApplication: request.operation === 'create-new', applicationCreates: request.operation === 'create-new' ? 1 : 0, ...(appId ? {appId} : {}), compositionScope: 'within-application' as const, shared: ['data model', 'selected record', 'form', 'validation', 'mutation logic'], remoteWrites: 0 as const, ...(request.operation === 'create-new' ? {requirement: policy.requirement} : {}) };
}
