import { evaluateAppValidation } from '../model-driven/validation.js';
import { appPublicationId } from '../model-driven/lifecycle.js';
import { resolveObservedPrivileges, roleRequirements } from '../model-driven/table-privileges.js';
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
import { modelResources, MODEL_KINDS, MODEL_VERSION } from '../model-driven/desired.js';
import type {CertificationManifest} from '../state/models.js';
import {evaluateCertification,finalizeCertification} from './certification.js';

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
  const only=(keys:string[])=>[...changes].every(k=>keys.includes(k));
  const retained=(key:string)=>Array.isArray(before[key])&&Array.isArray(after[key])&&(before[key] as JsonValue[]).every(v=>(after[key] as JsonValue[]).some(a=>canonicalJson(a)===canonicalJson(v)));
  if(kind==='choice'||kind==='column'&&after.type==='choice'){
    const key=kind==='choice'?'options':'choices';const old=before[key] as {value:number;label:string}[],next=after[key] as {value:number;label:string}[];
    return only(['displayName',key])&&Array.isArray(old)&&Array.isArray(next)&&old.every(o=>next.some(n=>n.value===o.value))&&old.every(o=>!next.some(n=>n.label===o.label&&n.value!==o.value));
  }
  if(kind==='view')return before.solutionMember===true&&only(['displayName','columns','orderBy','filters','activeOnly']);
  if(kind==='sitemap')return before.solutionMember===true&&only(['navigation']);
  if(kind==='role')return before.solutionMember===true&&only(['displayName']);
  if(kind==='appComponents')return only(['components'])&&retained('components');
  if(kind==='appAccess')return only(['roles'])&&retained('roles');
  if(kind==='rolePermissions'){
    const depths=['Basic','Local','Deep','Global'];const old=before.grants as {privilegeName:string;depth:string}[],next=after.grants as typeof old;
    return only(['grants'])&&old.every(o=>next.some(n=>n.privilegeName===o.privilegeName&&depths.indexOf(n.depth)>=depths.indexOf(o.depth)));
  }
  // Forward-only conversion of an already-owned app; never alter tenant-wide settings.
  if (kind === 'app') return before.solutionMember===true&&(only(['displayName'])||changes.size === 1 && changes.has('clientType') && before.clientType === 2 && after.clientType === 4);
  if (kind === 'command') return before.solutionMember === true && changes.size === 1 && ((changes.has('sequence') && typeof after.contextTable === 'string') || (changes.has('hidden') && before.hidden === false && after.hidden === true));
  if (kind === 'form') {
    if(!before.reveal&&!after.reveal&&before.solutionMember===true&&(only(['displayName'])||before.layout!=null&&after.layout!=null&&only(['displayName','fields','layout'])))return true;
    const fields = after.fields;
    return [...changes].every(key => ['fields', 'reveal'].includes(key)) && before.reveal == null && after.reveal != null && before.solutionMember === true && Array.isArray(before.fields) && Array.isArray(fields) && before.fields.every((field, index) => fields[index] === field);
  }
  if(kind==='column'&&only(['displayName','maxLength'])&&typeof before.maxLength==='number'&&typeof after.maxLength==='number')return after.maxLength>=before.maxLength;
  const allowed = kind === 'table' ? ['displayName', 'pluralName','description','auditing'] : kind === 'column' || kind === 'solution' ? ['displayName'] : [];
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
export function createPlan(project: Project, observation: Observation, ownership: Ownership | undefined, scope: 'all' | 'dataverse' = 'all', now = new Date(), policy?: Plan['executionPolicy'], certificationManifest?:CertificationManifest): Plan {
  if (observation.projectId !== project.project.id || (ownership && (ownership.projectId !== project.project.id || hashJson(ownership.target) !== hashJson(observation.target)))) {
    throw new PowerCanvasError('PF-PLAN-002', 'Desired, observed and ownership bindings disagree.', 'Use the same project and verified target for all planning inputs.');
  }
  const includeModel = scope === 'all' && policy?.modelDriven === true;
  const resources = [...desiredResources(project), ...(includeModel ? modelResources(project) : [])]; const operations: PlannedOperation[] = []; const blockers: Plan['blockers'] = []; const deferred: NonNullable<Plan['deferred']> = [];
  const certification=certificationManifest?evaluateCertification(project,observation,ownership,certificationManifest):undefined;
  if(certification&&(scope!=='all'||!includeModel||policy?.mode!=='defaultExperiment'||policy.environmentType!=='Default'||policy.publishModel||!policy.unified))throw new PowerCanvasError('PF-CERT-001','Certification requires its exact Default unified planning policy.','Regenerate the certification plan; no policy substitution.');
  const existingDependencies=new Set(certification?.closure.requiredExistingDependencies??[]);
  const block = (code: string, message: string, classification: NonNullable<Plan['blockers'][number]['classification']>, resourceId?: string) => {
    blockers.push({ code, message, classification, ...(resourceId ? { resourceId } : {}) });
  };
  if (policy?.environmentType === 'Default') {
    if (policy.mode !== 'defaultExperiment' || !policy.nonDisposable) block('PF-SAFETY-005', 'Default environment requires explicit non-disposable experiment isolation.', 'manualPrerequisite');
    try { experimentIsolation(project, includeModel); } catch (error) { block('PF-SAFETY-005', error instanceof Error ? error.message : 'Experiment isolation failed.', 'manualPrerequisite'); }
  }
  if (policy?.environmentType === 'Other') block('PF-SAFETY-002', 'This environment type is outside the allowed direct schema-write scope.', 'unsupported');
  for (const kind of ['publisher', 'solution', 'table', 'column', 'relationship', ...new Set(resources.filter(r=>['choice','key'].includes(r.kind)).map(r=>r.kind)), ...(includeModel ? MODEL_KINDS : [])]) {
    if (!observation.coverage.some(item => item.kind === kind && item.status === 'complete')) block('PF-PLAN-003', `Discovery coverage is incomplete for ${kind}.`, 'unsupported');
  }
  if (scope === 'all' && !includeModel && (Object.keys(project.apps).length || Object.keys(project.security.roles).length)) block('PF-CAPABILITY-001', 'Model-driven execution requires the explicit --model-driven-experiment flag and recorded Experiment 1 evidence. Use --scope dataverse for schema-only work.', 'unsupported');
  if (scope === 'all' && !policy?.unified && Object.keys(project.canvasApps ?? {}).length) block('PF-CAPABILITY-004', 'Canvas semantic intent requires the separate live-authoring workflow; this Dataverse executor cannot apply Canvas apps. Use --scope dataverse only for explicitly reviewed schema work.', 'unsupported');
  if (scope === 'all' && !policy?.unified && project.resources && (Object.keys(project.resources.flows).length || Object.keys(project.resources.workflowRecipes??{}).length || Object.keys(project.resources.connectionReferences).length || Object.keys(project.resources.environmentVariables).length)) block('PF-CAPABILITY-004', 'Flow resources require the separate flows plan/apply lifecycle; this executor cannot silently skip them.', 'unsupported');
  if (includeModel && !certification && (!policy?.unified||policy.environmentType==='Default') && ownership?.experiment1Evidence?.schemaHash !== publicationHash(project)) block('PF-CAPABILITY-003', 'Verified Experiment 1 evidence for this project, target and current schema is required.', 'manualPrerequisite');
  if (includeModel) for (const app of Object.values(project.apps)) {
    const prefix = `${project.solution.publisher.prefix}_`;
    if (!app.uniqueName.startsWith(prefix) || app.uniqueName.length > 40 || !/^[A-Za-z][A-Za-z0-9]*$/.test(app.uniqueName.slice(prefix.length))) block('PF-MDA-011', 'App unique names require the publisher prefix, an alphanumeric local name and at most 40 characters.', 'unsupported');
  }
  const createAction: Record<string, PlannedOperation['action']> = { publisher: 'createPublisher', solution: 'createSolution', table: 'createTable', column: 'createColumn', relationship: 'createRelationship', choice:'createChoice',key:'createKey',
    command: 'createCommand', webResource: 'createWebResource', form: 'createForm', view: 'createView', sitemap: 'createSitemap', role: 'createRole', rolePermissions: 'grantRolePrivileges', app: 'createApp', appComponents: 'addAppComponents', appAccess: 'setAppAccess' };
  const desiredIds = new Set(resources.map(resource => resource.resourceId));
  for (const owned of ownership?.resources ?? []) {
    if(certification&&!certification.closure.resources.includes(owned.resourceId))continue;
    if (scope === 'dataverse' && owned.provider !== 'dataverse') continue;
    if (!desiredIds.has(owned.resourceId)) block('PF-SAFETY-001', 'Removing or implicitly renaming an owned resource is blocked; the remote resource is retained.', 'destructiveBlock', owned.resourceId);
  }
  const operationFor = (desired: DesiredResource, action: PlannedOperation['action'], before: Record<string, JsonValue> | null) => {
    let privilegeBinding: { property: string; expected: JsonValue }[] = [];
    if (action === 'grantRolePrivileges') {
      const requirements = roleRequirements(project, desired.resourceId);
      // A new table can be planned, but its grant cannot execute until independently
      // discovered metadata is bound by a fresh plan. Never resolve IDs during a write.
      if (requirements.every(r => observation.resources.some(t => t.resourceId === r.tableResourceId && t.properties.securityPrivilegeMetadata))) {
        try { privilegeBinding = [{ property: 'resolvedTablePrivileges', expected: resolveObservedPrivileges(project, desired.resourceId, observation) }]; }
        catch (error) { block('PF-MDA-009', error instanceof Error ? error.message : 'PRIVILEGE_UNRESOLVED', 'manualPrerequisite', desired.resourceId); return; }
      }
    }
    operations.push({ id: `op-${hashJson({ resource: desired.resourceId, action, before, after: desired.properties }).slice(0, 24)}`,
      resourceId: desired.resourceId, provider: desired.provider ?? 'dataverse', action, dependsOn: [], capability: desired.provider === 'model-driven' ? (desired.kind.startsWith('role') ? 'dataverse.security' : 'modelDriven.app') : 'dataverse.schema',
      risk: ['rolePermissions','appAccess',...(certification?['role']:[])].includes(desired.kind)?'securityWrite':before ? 'mutable' : 'additive', classification: before ? 'safeUpdate' : 'create', verificationStrategy: 'reobserveOwnedProperties', support: 'supported',
      requiredIdentity: { audience: 'dataverse', privileges: ['customizationPrivileges'] }, before, after: desired.properties,
      preconditions: [{ property: 'ownedProjection', expected: before }, ...privilegeBinding], postconditions: [{ property: 'ownedProjection', expected: desired.properties }] });
  };
  for (const desired of resources) {
    if(existingDependencies.has(desired.resourceId))continue; // Verified read-only dependency, never a mutable desired container.
    const current = observation.resources.find(resource => resource.resourceId === desired.resourceId);
    const owned = ownership?.resources.find(resource => resource.resourceId === desired.resourceId);
    if (!current) {
      if (desired.kind === 'command' && !desired.properties.contextTable) block('PF-MDA-016', 'Legacy unbound commands can only be retained, never newly created.', 'manualPrerequisite', desired.resourceId);
      else if (owned) block('PF-PLAN-004', 'An owned remote resource is missing. Automatic recreation could conceal data loss.', 'manualPrerequisite', desired.resourceId);
      else operationFor(desired, createAction[desired.kind]!, null);
      continue;
    }
    // Key managed-property values are informational. This permits strict owned NO_OP,
    // not key updates (safeUpdate still rejects those), adoption or managed keys.
    if ((desired.kind === 'key' ? current.properties.isManaged !== false : current.properties.isManaged === true || current.properties.customizable === false)) { block('PF-SAFETY-003', 'Managed or noncustomizable resources cannot be changed through this development adapter.', 'destructiveBlock', desired.resourceId); continue; }
    if (!owned) { block('PF-PLAN-005', 'A matching unowned resource already exists. Implicit adoption is not allowed.', 'manualPrerequisite', desired.resourceId); continue; }
    if (owned.remoteId !== current.remoteId) { block('PF-PLAN-006', 'The observed remote identity differs from the owned identity.', 'manualPrerequisite', desired.resourceId); continue; }
    if (hashJson(projection(current, owned.baseline)) !== hashJson(owned.baseline)) { block('PF-PLAN-007', 'Observed owned properties changed outside the last verified baseline. Resolve drift explicitly.', 'manualPrerequisite', desired.resourceId); continue; }
    const before = projection(current, desired.properties);
    if (hashJson(before) === hashJson(desired.properties)) continue;
    if(certification){block('PF-CERT-002','Certification is additive-only; existing resource updates require a separate reviewed task.','destructiveBlock',desired.resourceId);continue;}
    if (!safeUpdate(desired.kind, before, desired.properties)) { block('PF-SAFETY-001', 'BLOCKED_DESTRUCTIVE_CHANGE: type, identity, required level, truncation, choice removal, privilege reduction or another non-allowlisted change requires a reviewed migration.', 'destructiveBlock', desired.resourceId); continue; }
    const defaultException=desired.kind==='command'||desired.kind==='app'&&before.clientType===2&&desired.properties.clientType===4&&hashJson({...before,clientType:4})===hashJson(desired.properties)||desired.kind==='form'&&before.reveal==null&&desired.properties.reveal!=null;
    if (policy?.environmentType === 'Default' && !defaultException) { block('PF-SAFETY-005', 'Default experiment allows additive changes, owned app client conversion and additive form reveal only; other metadata updates are blocked.', 'destructiveBlock', desired.resourceId); continue; }
    operationFor(desired, ({rolePermissions:'grantRolePrivileges',appAccess:'setAppAccess',appComponents:'addAppComponents'} as Record<string,PlannedOperation['action']>)[desired.kind]??'updateOwnedProperties', before);
  }
  for (const operation of operations) {
    const desired = resources.find(item => item.resourceId === operation.resourceId)!;
    operation.dependsOn = [...new Set(desired.dependencies.flatMap(id => operations.filter(item => item.resourceId === id).map(item => item.id)))];
  }
  if (!certification && (operations.some(operation => operation.provider === 'dataverse') || ownership?.publicationHash !== publicationHash(project))) {
    const tables = Object.values(project.dataverse.tables).map(table => table.schemaName.toLowerCase()).sort();
    operations.push({ id: `publish-${hashJson(tables).slice(0, 24)}`, resourceId: `pf:${project.project.id}:dataverse:publish:solution`, provider: 'dataverse',
      action: 'publish', dependsOn: operations.filter(o=>o.action!=='setAppAccess').map(operation => operation.id), capability: 'dataverse.schema', risk: 'mutable', classification: 'safeUpdate',
      support: 'supported', verificationStrategy: 'publishAndReobserve', requiredIdentity: { audience: 'dataverse', privileges: ['prvPublishCustomization'] },
      before: null, after: { tables,...(Object.keys(project.dataverse.choices??{}).length?{choices:Object.values(project.dataverse.choices!).map(c=>c.schemaName).sort()}:{}) }, preconditions: [{ property: 'allMetadataVerified', expected: true }], postconditions: [{ property: 'publishedAndReobserved', expected: true }] });
  }
  // Publication is a distinct visibility change, ordered before access and scoped to one app.
  if (includeModel) for (const [key, app] of Object.entries(project.apps)) {
    const desiredApp = resources.find(r => r.kind === 'app' && r.resourceId.endsWith(':app:' + key))!;
    const current = observation.resources.find(r => r.resourceId === desiredApp.resourceId);
    const access = operations.filter(o => o.action === 'setAppAccess' && o.after?.app === desiredApp.resourceId);
    const draft = current?.properties.lifecycle !== 'PUBLISHED';
    const appChanges = operations.filter(o => o.resourceId === desiredApp.resourceId || o.after?.app === desiredApp.resourceId && o.action !== 'setAppAccess');
    if (!draft && !appChanges.length) continue;
    const dependency = appPublicationId(desiredApp.resourceId);
    if (app.publishPolicy !== 'afterValidation' || certification) {
      if (draft) for (const operation of access) {
        deferred.push({resourceId:operation.resourceId, state:'DEFERRED_REQUIRES_PUBLICATION', dependency, app:desiredApp.resourceId, reason:'APP_ACCESS_REQUIRES_PUBLICATION: source publication is manual; desired access is retained, not executable.'});
        operations.splice(operations.indexOf(operation), 1);
      }
      const accessSpec = resources.find(r=>r.kind==='appAccess'&&r.properties.app===desiredApp.resourceId);
      if(draft && accessSpec && (accessSpec.properties.roles as string[]).length && !deferred.some(d=>d.resourceId===accessSpec.resourceId) && !blockers.some(b=>b.resourceId===accessSpec.resourceId)) deferred.push({resourceId:accessSpec.resourceId,state:'DEFERRED_REQUIRES_PUBLICATION',dependency,app:desiredApp.resourceId,reason:'APP_ACCESS_REQUIRES_PUBLICATION: intersect evidence cannot substitute for published app access.'});
      continue;
    }
    const id = `publish-app-${hashJson(desiredApp.resourceId).slice(0,24)}`;
    operations.push({id,resourceId:dependency,provider:'model-driven',action:'publishModelApp',dependsOn:operations.filter(o=>o.action!=='setAppAccess' && o.action!=='publishModelApp').map(o=>o.id),capability:'modelDriven.app',risk:'mutable',classification:'safeUpdate',support:'supported',verificationStrategy:'publishAndReobserve',requiredIdentity:{audience:'dataverse',privileges:['prvPublishCustomization']},before:null,after:{app:desiredApp.resourceId,visibilityEffect:'USER_VISIBILITY_CHANGE',scope:'EXACT_APP_ONLY'},preconditions:[{property:'appValidationSuccess',expected:true}],postconditions:[{property:'publishedAppIdentity',expected:desiredApp.resourceId}]});
    for (const operation of access) operation.dependsOn.push(id);
  }
  // A removed deferred operation must never remain an executable dependency.
  for (const operation of operations) operation.dependsOn = operation.dependsOn.filter(id => operations.some(o => o.id === id));
  const warnings: NonNullable<Plan['warnings']> = [];
  for (const app of observation.resources.filter(r=>r.kind==='app'&&r.properties.validationResponse)) {
    const validation=evaluateAppValidation(app.properties.validationResponse);
    for(const warning of validation.warnings) warnings.push({resourceId:app.resourceId,code:'APP_VALIDATION_WARNING',message:String(warning.Message)});
    if(!validation.passed && operations.some(o=>o.action==='publishModelApp'&&o.after?.app===app.resourceId)) block('PF-MDA-008',validation.status,'manualPrerequisite',app.resourceId);
  }
  const body = { schemaVersion: 1 as const, projectId: project.project.id, target: observation.target, planId: randomUUID(), scope,
    ...(policy ? { executionPolicy: policy } : {}),
    createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 3600000).toISOString(), powercanvasVersion: VERSION,
    providerVersions: { dataverse: DATAVERSE_VERSION, ...(includeModel ? { 'model-driven': MODEL_VERSION } : {}) }, sourceHash: hashJson(project), observationHash: fingerprint(observation),
    ownershipRevision: ownership?.revision ?? 0, operations: topological(operations), blockers,...(warnings.length?{warnings}:{}),...(deferred.length?{deferred}:{}),...(certification?{certification:finalizeCertification(certification,resources,operations)}:{}) };
  return planSchema.parse({ ...body, contentHash: hashJson(body) });
}

export function validateSavedPlan(plan: Plan, project: Project, observed: Observation, ownership?: Ownership, now = new Date()): void {
  if(plan.certification)throw new PowerCanvasError('PF-CERT-003','Provider certification plan requires a separately authorized execution boundary.','V2.1a provides read-only planning only; no existing apply command authorizes this manifest.');
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
  if (rebuilt.blockers.length || hashJson(rebuilt.operations) !== hashJson(plan.operations) || hashJson(rebuilt.deferred??[]) !== hashJson(plan.deferred??[]) || hashJson(rebuilt.warnings??[]) !== hashJson(plan.warnings??[])) throw new PowerCanvasError('PF-PLAN-009', 'Saved operations differ from the deterministic planner output.', 'Regenerate the plan; arbitrary API operations cannot be added to a saved plan.');
}
