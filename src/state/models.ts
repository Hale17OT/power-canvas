import { z } from 'zod';

const uuid = z.uuid().toLowerCase();
const guid = z.guid().toLowerCase();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.iso.datetime();
const identifier = z.string().regex(/^[a-zA-Z][a-zA-Z0-9._:/-]*$/).max(300);
const versions = z.record(identifier, z.string().min(1).max(80));
const properties = z.record(identifier, z.json());

export const environmentIdSchema = z.string().refine(value => z.guid().safeParse(value.replace(/^default-/i, '')).success, 'Expected a GUID or Default-GUID environment identifier').transform(value => value.toLowerCase());
export const targetSchema = z.strictObject({
  tenantId: uuid, environmentId: environmentIdSchema, organizationId: guid,
  dataverseUrl: z.string().regex(/^https:\/\/[a-z0-9-]+\.(?:api\.)?crm[0-9]*\.dynamics\.com$/),
});
const binding = { projectId: uuid, target: targetSchema };
const observedResource = z.strictObject({
  resourceId: identifier, remoteId: guid, provider: identifier, kind: identifier,
  schemaName: identifier, properties, version: z.string().optional(),
});

export const observationSchema = z.strictObject({
  schemaVersion: z.literal(1), ...binding, snapshotId: uuid, observedAt: timestamp,
  providerVersions: versions,
  coverage: z.array(z.strictObject({ kind: identifier, status: z.enum(['complete', 'partial', 'unknown']) })).min(1),
  resources: z.array(observedResource),
}).superRefine((record, context) => {
  if (new Set(record.resources.map(resource => resource.resourceId)).size !== record.resources.length) {
    context.addIssue({ code: 'custom', path: ['resources'], message: 'Duplicate observed resource identity.' });
  }
  if (new Set(record.coverage.map(item => item.kind)).size !== record.coverage.length) {
    context.addIssue({ code: 'custom', path: ['coverage'], message: 'Duplicate coverage kind.' });
  }
});

export const ownershipSchema = z.strictObject({
  schemaVersion: z.literal(1), ...binding, revision: z.int().nonnegative(), updatedAt: timestamp,
  publicationHash: hash.optional(),
  modelDrivenPublicationHash: hash.optional(),
  experiment1Evidence: z.strictObject({ schemaHash: hash, firstNoOpHash: hash, secondNoOpHash: hash, destructiveCheckHash: hash, completedAt: timestamp }).optional(),
  resources: z.array(z.strictObject({
    resourceId: identifier, remoteId: guid, provider: identifier, ownedPaths: z.array(identifier).min(1),
    baseline: properties, lastVerifiedHash: hash,
  })),
}).superRefine((record, context) => {
  if (new Set(record.resources.map(resource => resource.resourceId)).size !== record.resources.length) {
    context.addIssue({ code: 'custom', path: ['resources'], message: 'Duplicate owned resource identity.' });
  }
  for (const resource of record.resources) {
    if (new Set(resource.ownedPaths).size !== resource.ownedPaths.length ||
        resource.ownedPaths.some(path => !Object.hasOwn(resource.baseline, path)) ||
        Object.keys(resource.baseline).some(path => !resource.ownedPaths.includes(path))) {
      context.addIssue({ code: 'custom', path: ['resources'], message: 'Owned paths and baseline property projection must match exactly.' });
    }
  }
});

export const plannedOperationSchema = z.strictObject({
  id: identifier, provider: identifier, resourceId: identifier,
  action: z.enum(['createTable', 'createColumn', 'createRelationship', 'updateOwnedProperties', 'createPublisher',
    'createSolution', 'addSolutionComponent', 'publish', 'verify', 'createForm', 'createView', 'createApp', 'setAppAccess', 'createSitemap', 'createRole', 'grantRolePrivileges', 'addAppComponents', 'createWebResource', 'createCommand']),
  dependsOn: z.array(identifier), capability: identifier,
  risk: z.enum(['additive', 'mutable', 'destructive']),
  classification: z.enum(['create', 'safeUpdate']).optional(),
  verificationStrategy: z.enum(['reobserveOwnedProperties', 'publishAndReobserve']).optional(),
  support: z.enum(['supported', 'preview', 'constrained', 'semi-supported', 'unsupported']),
  requiredIdentity: z.strictObject({ audience: z.literal('dataverse'), privileges: z.array(identifier) }),
  before: properties.nullable(), after: properties.nullable(),
  preconditions: z.array(z.strictObject({ property: identifier, expected: z.json() })).min(1),
  postconditions: z.array(z.strictObject({ property: identifier, expected: z.json() })).min(1),
});

export const planSchema = z.strictObject({
  schemaVersion: z.literal(1), ...binding, planId: uuid, createdAt: timestamp, expiresAt: timestamp,
  scope: z.enum(['dataverse', 'all']).optional(),
  executionPolicy: z.strictObject({ environmentType: z.enum(['Developer', 'Sandbox', 'Default', 'Other']),
    mode: z.enum(['schemaDevelopment', 'defaultExperiment']), nonDisposable: z.boolean(), modelDriven: z.boolean().optional() }).optional(),
  powercanvasVersion: z.string().min(1), providerVersions: versions, sourceHash: hash, observationHash: hash,
  ownershipRevision: z.int().nonnegative(), operations: z.array(plannedOperationSchema),
  blockers: z.array(z.strictObject({ code: identifier, resourceId: identifier.optional(), message: z.string(),
    classification: z.enum(['manualPrerequisite', 'unsupported', 'destructiveBlock']).optional() })),
  contentHash: hash,
}).superRefine((plan, context) => {
  if (Date.parse(plan.expiresAt) <= Date.parse(plan.createdAt)) context.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Plan expiry must follow creation.' });
  const ids = new Set(plan.operations.map(operation => operation.id));
  if (ids.size !== plan.operations.length) context.addIssue({ code: 'custom', path: ['operations'], message: 'Duplicate operation IDs.' });
  for (const operation of plan.operations) {
    if (operation.dependsOn.some(id => !ids.has(id) || id === operation.id)) {
      context.addIssue({ code: 'custom', path: ['operations'], message: 'Invalid operation dependency.' });
    }
  }
  // Kahn's algorithm also rejects indirect cycles without recursion on untrusted plans.
  const resolved = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const operation of plan.operations) {
      if (!resolved.has(operation.id) && operation.dependsOn.every(id => resolved.has(id))) {
        resolved.add(operation.id); changed = true;
      }
    }
  }
  if (resolved.size !== plan.operations.length) context.addIssue({ code: 'custom', path: ['operations'], message: 'Operation dependencies contain a cycle or missing dependency.' });
});

export const journalEventSchema = z.strictObject({
  schemaVersion: z.literal(1), ...binding, eventId: uuid, executionId: uuid, planId: uuid, operationId: identifier,
  timestamp, provider: identifier, resourceId: identifier,
  status: z.enum(['started', 'remoteSucceeded', 'verified', 'failed', 'outcomeUnknown']),
  remoteId: guid.optional(), serviceOperationId: z.string().regex(/^[a-zA-Z0-9._:-]+$/).max(200).optional(),
  errorCode: z.string().regex(/^PF-[A-Z]+-[0-9]{3}$/).optional(),
  remediation: z.string().max(1000).optional(),
  verificationResult: z.enum(['passed', 'failed', 'notRun']).optional(),
  requestId: uuid.optional(),
  recoveryOfExecutionId: uuid.optional(),
});

export type Target = z.infer<typeof targetSchema>;
export type Observation = z.infer<typeof observationSchema>;
export type Ownership = z.infer<typeof ownershipSchema>;
export type Plan = z.infer<typeof planSchema>;
export type PlannedOperation = z.infer<typeof plannedOperationSchema>;
export type JournalEvent = z.infer<typeof journalEventSchema>;
