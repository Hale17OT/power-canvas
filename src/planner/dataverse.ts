import { randomUUID } from 'node:crypto';
import { hashJson, canonicalJson } from '../core/json.js';
import type { JsonValue } from '../core/json.js';
import { VERSION } from '../core/version.js';
import { PowerCanvasError } from '../core/errors.js';
import type { Project } from '../ir/schema.js';
import { DATAVERSE_VERSION, desiredResources } from '../dataverse/desired.js';
import type { DesiredResource, Resource } from '../dataverse/desired.js';
import { planSchema } from '../state/models.js';
import type { Observation, Ownership, Plan, PlannedOperation } from '../state/models.js';
import { experimentIsolation } from '../dataverse/isolation.js';
import { modelResources, modelPublicationHash, MODEL_KINDS, MODEL_VERSION } from '../model-driven/desired.js';

export function fingerprint(observation: Observation): string {
  return hashJson({ projectId: observation.projectId, target: observation.target, providerVersions: observation.providerVersions,
    coverage: [...observation.coverage].sort((a, b) => a.kind.localeCompare(b.kind)),
    resources: [...observation.resources].sort((a, b) => a.resourceId.localeCompare(b.resourceId)) });
}
export function publicationHash(project: Project): string {
  return hashJson(desiredResources(project).map(resource => ({ resourceId: resource.resourceId, properties: resource.properties })));
}
export function projection(resource: Resource, desired: Record<string, JsonValue>): Record<string, JsonValue> {
  return Object.fromEntries(Object.keys(desired).map(key => [key, resource.properties[key] ?? null]));
}
export function safeUpdate(kind: string, before: Record<string, JsonValue>, after: Record<string, JsonValue>): boolean {
  const changes = new Set([...Object.keys(before), ...Object.keys(after)].filter(key => canonicalJson(before[key] ?? null) !== canonicalJson(after[key] ?? null)));
  // Forward-only conversion of an already-owned app; never alter tenant-wide settings.
  if (kind === 'app') return changes.size === 1 && changes.has('clientType') && before.clientType === 2 && after.clientType === 4 && before.solutionMember === true;
  if (kind === 'command') return before.solutionMember === true && changes.size === 1 && ((changes.has('sequence') && typeof after.contextTable === 'string') || (changes.has('hidden') && before.hidden === false && after.hidden === true));
  if (kind === 'form') {
    const fields = after.fields;
    return [...changes].every(key => ['fields', 'reveal'].includes(key)) && before.reveal == null && after.reveal != null && before.solutionMember === true && Array.isArray(before.fields) && Array.isArray(fields) && before.fields.every((field, index) => fields[index] === field);
  }
  const allowed = kind === 'table' ? ['displayName', 'pluralName'] : kind === 'column' || kind === 'solution' ? ['displayName'] : [];
  return [...changes].every(key => allowed.includes(key));
}
export function topological(operations: readonly PlannedOperation[]): PlannedOperation[] {
  const result: PlannedOperation[] = []; const seen = new Set<string>();
  while (result.length < operations.length) {
    const next = operations.find(operation => !seen.has(operation.id) && operation.dependsOn.every(id => seen.has(id)));
    if (!next) throw new PowerCanvasError('PF-PLAN-001', 'Plan contains cyclic or unresolved dependencies.', 'Regenerate the plan with a compatible provider.');
    result.push(next); seen.add(next.id);
  }
  return result;
}
export function createPlan(project: Project, observation: Observation, ownership: Ownership | undefined, scope: 'all' | 'dataverse' = 'all', now = new Date(), policy?: Plan['executionPolicy']): Plan {
  if (observation.projectId !== project.project.id || (ownership && (ownership.projectId !== project.project.id || hashJson(ownership.target) !== hashJson(observation.target)))) {
    throw new PowerCanvasError('PF-PLAN-002', 'Desired, observed and ownership bindings disagree.', 'Use the same project and verified target for all planning inputs.');
  }
  const includeModel = scope === 'all' && policy?.modelDriven === true;
  const resources = [...desiredResources(project), ...(includeModel ? modelResources(project) : [])]; const operations: PlannedOperation[] = []; const blockers: Plan['blockers'] = [];
  const block = (code: string, message: string, classification: NonNullable<Plan['blockers'][number]['classification']>, resourceId?: string) => {
    blockers.push({ code, message, classification, ...(resourceId ? { resourceId } : {}) });
  };
  if (policy?.environmentType === 'Default') {
    if (policy.mode !== 'defaultExperiment' || !policy.nonDisposable) block('PF-SAFETY-005', 'Default environment requires explicit non-disposable experiment isolation.', 'manualPrerequisite');
    try { experimentIsolation(project, includeModel); } catch (error) { block('PF-SAFETY-005', error instanceof Error ? error.message : 'Experiment isolation failed.', 'manualPrerequisite'); }
  }
  if (policy?.environmentType === 'Other') block('PF-SAFETY-002', 'This environment type is outside the allowed direct schema-write scope.', 'unsupported');
  for (const kind of ['publisher', 'solution', 'table', 'column', 'relationship', ...(includeModel ? MODEL_KINDS : [])]) {
    if (!observation.coverage.some(item => item.kind === kind && item.status === 'complete')) block('PF-PLAN-003', `Discovery coverage is incomplete for ${kind}.`, 'unsupported');
  }
  if (scope === 'all' && !includeModel && (Object.keys(project.apps).length || Object.keys(project.security.roles).length)) block('PF-CAPABILITY-001', 'Model-driven execution requires the explicit --model-driven-experiment flag and recorded Experiment 1 evidence. Use --scope dataverse for schema-only work.', 'unsupported');
  if (scope === 'all' && Object.keys(project.canvasApps ?? {}).length) block('PF-CAPABILITY-004', 'Canvas semantic intent requires the separate live-authoring workflow; this Dataverse executor cannot apply Canvas apps. Use --scope dataverse only for explicitly reviewed schema work.', 'unsupported');
  if (scope === 'all' && project.resources && (Object.keys(project.resources.flows).length || Object.keys(project.resources.workflowRecipes??{}).length || Object.keys(project.resources.connectionReferences).length || Object.keys(project.resources.environmentVariables).length)) block('PF-CAPABILITY-004', 'Flow resources require the separate flows plan/apply lifecycle; this executor cannot silently skip them.', 'unsupported');
  if (includeModel && ownership?.experiment1Evidence?.schemaHash !== publicationHash(project)) block('PF-CAPABILITY-003', 'Verified Experiment 1 evidence for this project, target and current schema is required.', 'manualPrerequisite');
  if (includeModel) for (const app of Object.values(project.apps)) {
    const prefix = `${project.solution.publisher.prefix}_`;
    if (!app.uniqueName.startsWith(prefix) || app.uniqueName.length > 40 || !/^[A-Za-z][A-Za-z0-9]*$/.test(app.uniqueName.slice(prefix.length))) block('PF-MDA-011', 'App unique names require the publisher prefix, an alphanumeric local name and at most 40 characters.', 'unsupported');
  }
  const createAction: Record<string, PlannedOperation['action']> = { publisher: 'createPublisher', solution: 'createSolution', table: 'createTable', column: 'createColumn', relationship: 'createRelationship',
    command: 'createCommand', webResource: 'createWebResource', form: 'createForm', view: 'createView', sitemap: 'createSitemap', role: 'createRole', rolePermissions: 'grantRolePrivileges', app: 'createApp', appComponents: 'addAppComponents', appAccess: 'setAppAccess' };
  const desiredIds = new Set(resources.map(resource => resource.resourceId));
  for (const owned of ownership?.resources ?? []) {
    if (scope === 'dataverse' && owned.provider !== 'dataverse') continue;
    if (!desiredIds.has(owned.resourceId)) block('PF-SAFETY-001', 'Removing or implicitly renaming an owned resource is blocked; the remote resource is retained.', 'destructiveBlock', owned.resourceId);
  }
  const operationFor = (desired: DesiredResource, action: PlannedOperation['action'], before: Record<string, JsonValue> | null) => {
    operations.push({ id: `op-${hashJson({ resource: desired.resourceId, action, before, after: desired.properties }).slice(0, 24)}`,
      resourceId: desired.resourceId, provider: desired.provider ?? 'dataverse', action, dependsOn: [], capability: desired.provider === 'model-driven' ? (desired.kind.startsWith('role') ? 'dataverse.security' : 'modelDriven.app') : 'dataverse.schema',
      risk: before ? 'mutable' : 'additive', classification: before ? 'safeUpdate' : 'create', verificationStrategy: 'reobserveOwnedProperties', support: 'supported',
      requiredIdentity: { audience: 'dataverse', privileges: ['customizationPrivileges'] }, before, after: desired.properties,
      preconditions: [{ property: 'ownedProjection', expected: before }], postconditions: [{ property: 'ownedProjection', expected: desired.properties }] });
  };
  for (const desired of resources) {
    const current = observation.resources.find(resource => resource.resourceId === desired.resourceId);
    const owned = ownership?.resources.find(resource => resource.resourceId === desired.resourceId);
    if (!current) {
      if (desired.kind === 'command' && !desired.properties.contextTable) block('PF-MDA-016', 'Legacy unbound commands can only be retained, never newly created.', 'manualPrerequisite', desired.resourceId);
      else if (owned) block('PF-PLAN-004', 'An owned remote resource is missing. Automatic recreation could conceal data loss.', 'manualPrerequisite', desired.resourceId);
      else operationFor(desired, createAction[desired.kind]!, null);
      continue;
    }
    if (current.properties.isManaged === true || current.properties.customizable === false) { block('PF-SAFETY-003', 'Managed or noncustomizable resources cannot be changed through this development adapter.', 'destructiveBlock', desired.resourceId); continue; }
    if (!owned) { block('PF-PLAN-005', 'A matching unowned resource already exists. Implicit adoption is not allowed.', 'manualPrerequisite', desired.resourceId); continue; }
    if (owned.remoteId !== current.remoteId) { block('PF-PLAN-006', 'The observed remote identity differs from the owned identity.', 'manualPrerequisite', desired.resourceId); continue; }
    if (hashJson(projection(current, owned.baseline)) !== hashJson(owned.baseline)) { block('PF-PLAN-007', 'Observed owned properties changed outside the last verified baseline. Resolve drift explicitly.', 'manualPrerequisite', desired.resourceId); continue; }
    const before = projection(current, desired.properties);
    if (hashJson(before) === hashJson(desired.properties)) continue;
    if (!safeUpdate(desired.kind, before, desired.properties)) { block('PF-SAFETY-001', 'Requested type, schema, ownership, lookup, choice-value or other non-allowlisted property change requires a reviewed migration.', 'destructiveBlock', desired.resourceId); continue; }
    if (policy?.environmentType === 'Default' && !['app', 'form', 'command'].includes(desired.kind)) { block('PF-SAFETY-005', 'Default experiment allows additive changes, owned app client conversion and additive form reveal only; other metadata updates are blocked.', 'destructiveBlock', desired.resourceId); continue; }
    operationFor(desired, 'updateOwnedProperties', before);
  }
  for (const operation of operations) {
    const desired = resources.find(item => item.resourceId === operation.resourceId)!;
    operation.dependsOn = [...new Set(desired.dependencies.flatMap(id => operations.filter(item => item.resourceId === id).map(item => item.id)))];
  }
  if (operations.some(operation => operation.provider === 'dataverse') || ownership?.publicationHash !== publicationHash(project)) {
    const tables = Object.values(project.dataverse.tables).map(table => table.schemaName.toLowerCase()).sort();
    operations.push({ id: `publish-${hashJson(tables).slice(0, 24)}`, resourceId: `pf:${project.project.id}:dataverse:publish:solution`, provider: 'dataverse',
      action: 'publish', dependsOn: operations.map(operation => operation.id), capability: 'dataverse.schema', risk: 'mutable', classification: 'safeUpdate',
      support: 'supported', verificationStrategy: 'publishAndReobserve', requiredIdentity: { audience: 'dataverse', privileges: ['prvPublishCustomization'] },
      before: null, after: { tables }, preconditions: [{ property: 'allMetadataVerified', expected: true }], postconditions: [{ property: 'publishedAndReobserved', expected: true }] });
  }
  if (includeModel && (operations.some(operation => operation.provider === 'model-driven') || ownership?.modelDrivenPublicationHash !== modelPublicationHash(project))) {
    const properties = { apps: resources.filter(item => item.kind === 'app').map(item => item.resourceId), sitemaps: resources.filter(item => item.kind === 'sitemap').map(item => item.resourceId),
      tables: Object.values(project.dataverse.tables).map(table => table.schemaName.toLowerCase()).sort(), webResources: resources.filter(item => item.kind === 'webResource').map(item => item.resourceId) };
    operations.push({ id: `publish-model-${hashJson(properties).slice(0, 24)}`, resourceId: `pf:${project.project.id}:model-driven:publish:apps`, provider: 'model-driven', action: 'publish',
      dependsOn: operations.map(operation => operation.id), capability: 'modelDriven.app', risk: 'mutable', classification: 'safeUpdate', support: 'supported', verificationStrategy: 'publishAndReobserve',
      requiredIdentity: { audience: 'dataverse', privileges: ['prvPublishCustomization'] }, before: null, after: properties,
      preconditions: [{ property: 'appValidationSuccess', expected: true }], postconditions: [{ property: 'publishedAndReobserved', expected: true }] });
  }
  const body = { schemaVersion: 1 as const, projectId: project.project.id, target: observation.target, planId: randomUUID(), scope,
    ...(policy ? { executionPolicy: policy } : {}),
    createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 3600000).toISOString(), powercanvasVersion: VERSION,
    providerVersions: { dataverse: DATAVERSE_VERSION, ...(includeModel ? { 'model-driven': MODEL_VERSION } : {}) }, sourceHash: hashJson(project), observationHash: fingerprint(observation),
    ownershipRevision: ownership?.revision ?? 0, operations: topological(operations), blockers };
  return planSchema.parse({ ...body, contentHash: hashJson(body) });
}

export function validateSavedPlan(plan: Plan, project: Project, observed: Observation, ownership?: Ownership, now = new Date()): void {
  const { contentHash, ...body } = plan;
  if (contentHash !== hashJson(body) || plan.powercanvasVersion !== VERSION || plan.providerVersions.dataverse !== DATAVERSE_VERSION || (plan.executionPolicy?.modelDriven && plan.providerVersions['model-driven'] !== MODEL_VERSION) ||
      plan.sourceHash !== hashJson(project) || plan.observationHash !== fingerprint(observed) || plan.projectId !== project.project.id ||
      hashJson(plan.target) !== hashJson(observed.target) || plan.ownershipRevision !== (ownership?.revision ?? 0) ||
      Date.parse(plan.expiresAt) <= now.getTime() || Date.parse(plan.createdAt) > now.getTime() + 60000) {
    throw new PowerCanvasError('PF-PLAN-008', 'Saved plan is stale, changed, expired, or bound to another source/target/version.', 'Generate and review a fresh plan. No writes were started.');
  }
  if (plan.blockers.length) throw new PowerCanvasError('PF-SAFETY-004', 'Saved plan contains blockers.', 'Resolve every blocker and review a fresh plan.');
  // A hash is not authorization. Recompile the operation graph to reject arbitrary edited actions/payloads.
  const rebuilt = createPlan(project, observed, ownership, plan.scope ?? 'all', new Date(plan.createdAt), plan.executionPolicy);
  if (rebuilt.blockers.length || hashJson(rebuilt.operations) !== hashJson(plan.operations)) throw new PowerCanvasError('PF-PLAN-009', 'Saved operations differ from the deterministic planner output.', 'Regenerate the plan; arbitrary API operations cannot be added to a saved plan.');
}
