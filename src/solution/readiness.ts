import type { Project } from '../ir/schema.js';
import type { ResourceIR, SolutionEvidence } from './schema.js';
import { appPublicationId } from '../model-driven/lifecycle.js';
import { evaluateAppValidation } from '../model-driven/validation.js';

/** Acceptance only: this never filters operations, suppresses blockers or authorizes apply. */
export function solutionReadiness(project: Project, resources: ResourceIR[], evidence: SolutionEvidence, blockers: readonly unknown[], now = new Date()) {
  const native = evidence.dataverse;
  const roots = resources.filter(r => r.nativeId && r.kind !== 'publication' && r.kind !== 'appPublication' &&
    (!native?.plan.certification || native.plan.certification.manifest.roots.some(root => root.resourceId === r.nativeId)));
  const fresh = !!native && Date.parse(native.plan.expiresAt) > now.getTime() && Date.parse(native.observation.observedAt) > now.getTime() - 3600000 &&
    Date.parse(native.observation.observedAt) <= now.getTime() + 60000 && native.observation.coverage.every(c => c.status === 'complete');
  const deferred = roots.filter(r => r.state === 'DEFERRED_REQUIRES_PUBLICATION');
  const acceptedDeferrals = deferred.filter(r => {
    if (r.kind !== 'appAccess' || r.capability.status !== 'SUPPORTED_WITH_LIMITS') return false;
    const key = r.id.slice('appAccess:'.length), app = resources.find(a => a.id === 'app:' + key);
    const d = native?.plan.deferred?.find(d => d.resourceId === r.nativeId);
    const observed = native?.observation.resources.find(a => a.resourceId === app?.nativeId);
    return project.apps[key]?.publishPolicy === 'manual' && app?.state === 'NO_OP' && app.ownership === 'POWERCANVAS_OWNED' &&
      observed?.properties.lifecycle === 'DRAFT_UNPUBLISHED' && d !== undefined && d.app === app.nativeId && d.dependency === appPublicationId(app.nativeId!) &&
      r.dependencies.includes('appPublication:' + key) && r.dependencies.every(id => id === 'appPublication:' + key || resources.some(dep => dep.id === id && dep.state === 'NO_OP'));
  });
  const unknownOutcomes = evidence.executionOutcomes?.unknown ?? [];
  const conflicts = roots.filter(r => r.state === 'CONFLICT').map(r => r.id);
  const apps = roots.filter(r => r.kind === 'app');
  const validation = apps.map(app => ({ resource: app.id, ...evaluateAppValidation(native?.observation.resources.find(r => r.resourceId === app.nativeId)?.properties.validationResponse??null) }));
  const nativeBlockers = native?.plan.blockers ?? [];
  const nativeIssue = blockers.some(b => !b || typeof b !== 'object' || !('resource' in b) || !b.resource || roots.some(r => r.id === b.resource));
  const converged = fresh && evidence.executionOutcomes !== undefined && roots.length > 0 && !native!.plan.operations.length && !nativeBlockers.length && !nativeIssue && !conflicts.length && !unknownOutcomes.length &&
    validation.every(v => v.passed) && (native!.plan.deferred?.length??0) === acceptedDeferrals.length && roots.every(r => r.state === 'NO_OP' && r.ownership === 'POWERCANVAS_OWNED' || acceptedDeferrals.includes(r));
  const published = apps.every(app => native?.observation.resources.find(r => r.resourceId === app.nativeId)?.properties.lifecycle === 'PUBLISHED');
  const deployment = converged && !deferred.length && published && evidence.deploymentChecks?.configurationResolved === true && evidence.deploymentChecks.checksComplete;
  return {
    provider: { status: converged ? deferred.length ? 'PROVIDER_CONVERGED_WITH_DEFERRED_PUBLICATION' : 'PROVIDER_CONVERGED' : 'PROVIDER_NOT_CONVERGED', converged,
      scope: 'Dataverse / model-driven / security roots only', fresh, roots: roots.length, noOp: roots.filter(r => r.state === 'NO_OP').length,
      acceptedDeferrals: acceptedDeferrals.map(r => r.id), rejectedDeferrals: deferred.filter(r => !acceptedDeferrals.includes(r)).map(r => r.id),
      executableOperations: native?.plan.operations.length ?? null, blockers: nativeBlockers, conflicts, unknownOutcomes, outcomeEvidence:evidence.executionOutcomes?'INSPECTED':'NOT_INSPECTED', validation },
    deployment: { status: deployment ? 'DEPLOYMENT_CONVERGED' : 'DEPLOYMENT_NOT_CONVERGED', converged: deployment, publishedApps: published,
      pending: [...deferred.map(r => ({ resource: r.id, prerequisite: 'Publish model-driven app under separate source/operator intent' })), ...(!evidence.deploymentChecks?.configurationResolved || !evidence.deploymentChecks?.checksComplete ? [{ resource: 'deployment', prerequisite: 'Resolve deployment configuration and complete deployment checks' }] : [])] },
    production: { status: 'UNPROVEN', ready: false, pending: ['human/team assignment', 'effective persona authorization', 'licensing', 'published app runtime', 'managed import', 'cross-environment ALM', 'Canvas native authoring where required'] },
    otherProviders: resources.filter(r => !['dataverse', 'model-driven'].includes(r.subsystem)).map(r => ({ resource: r.id, subsystem: r.subsystem, state: r.state, capability: r.capability.status })),
    packaging: { export: apps.some(app => native?.observation.resources.find(r => r.resourceId === app.nativeId)?.properties.lifecycle === 'DRAFT_UNPUBLISHED') ? 'DEFERRED_WITH_PUBLICATION_ALM' : 'UNPROVEN', checker: 'DEFERRED_WITH_PUBLICATION_ALM', reason: 'Unmanaged exports contain published components; draft convergence is not package-membership evidence.' },
  };
}
