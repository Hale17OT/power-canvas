import { z } from 'zod';
import type { Target } from '../state/models.js';
import { environmentIdSchema } from '../state/models.js';

export const authProfileSchema = z.strictObject({
  alias: z.string().regex(/^[a-z][a-z0-9-]*$/), tenantId: z.uuid(), clientId: z.uuid(),
  cloud: z.literal('public'), mode: z.enum(['interactive', 'workloadIdentity']),
  allowedEnvironmentIds: z.array(environmentIdSchema),
});
export type AuthProfile = z.infer<typeof authProfileSchema>;
export type Audience = { service: 'dataverse'; origin: string } | { service: 'powerPlatform'; origin: string };

/** Ephemeral only: this type is deliberately absent from all persisted schemas. */
export interface AccessToken {
  readonly value: string;
  readonly expiresAt: Date;
  readonly tenantId: string;
  readonly subjectId: string;
  readonly audience: Audience;
}
export interface CredentialBroker {
  acquire(request: { profile: AuthProfile; target: Target; audience: Audience; scopes: readonly string[]; signal: AbortSignal }): Promise<AccessToken>;
}

export interface VerifiedTarget {
  readonly target: Target;
  readonly verifiedAt: string;
  readonly subjectId: string;
  readonly evidence: { whoAmIRequestId: string; environmentDiscoveryRequestId: string };
}
