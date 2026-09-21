import type { Diagnostic } from '../core/errors.js';
import type { Project } from '../ir/schema.js';

export interface Capability {
  id: string;
  provider: string;
  support: 'supported' | 'preview' | 'constrained' | 'semi-supported' | 'unsupported';
  provenance: 'microsoft' | 'community' | 'powercanvas';
  implementation: 'implemented' | 'planned' | 'experimental' | 'unavailable';
  requirements: readonly string[];
  evidence: string;
}

export const capabilities: readonly Capability[] = [
  { id: 'flows.compile', provider: 'flows', support: 'constrained', provenance: 'powercanvas', implementation: 'implemented', requirements: ['Strict typed V1 action registry'], evidence: 'docs/flows.md' },
  { id: 'flows.deploy', provider: 'flows', support: 'constrained', provenance: 'microsoft', implementation: 'experimental', requirements: ['Owned unmanaged solution', 'Explicit saved plan and activation', 'Resolved environment-specific dependencies'], evidence: 'docs/flows.md' },
  { id: 'core.validate', provider: 'core', support: 'supported', provenance: 'powercanvas', implementation: 'implemented', requirements: [], evidence: 'docs/ir.md' },
  { id: 'dataverse.schema', provider: 'dataverse', support: 'supported', provenance: 'microsoft', implementation: 'experimental',
    requirements: ['Verified developer/sandbox or isolated non-disposable Default experiment target', 'Metadata privileges', 'Saved plan', 'Experiment 1 evidence for the bounded slice'],
    evidence: 'https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-entity-definitions-using-web-api' },
  { id: 'modelDriven.app', provider: 'model-driven', support: 'supported', provenance: 'microsoft', implementation: 'experimental',
    requirements: ['Recorded Experiment 1 evidence', 'Explicit experimental planning policy', 'Bounded standard forms/views and app-specific sitemap; qualified/local name collision checks', 'Dedicated solution publisher; Active layers accepted only for an already verified app with exact solution membership and independently verified published counterpart for drafts', 'Exact platform-created administrator/customizer app associations', 'Unified Interface clienttype 4; verified conversion requires a fresh runtime tab to bypass cached legacy app state', 'Experiment 2 runtime checks; effective restricted/denied access requires separate personas'],
    evidence: 'https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/create-manage-model-driven-apps-using-code' },
  { id: 'dataverse.security', provider: 'model-driven', support: 'supported', provenance: 'microsoft', implementation: 'experimental',
    requirements: ['Privilege metadata', 'Exact nine platform-created role defaults; only explicit custom-table grants added', 'Effective access tests'], evidence: 'https://learn.microsoft.com/en-us/power-apps/developer/data-platform/security-roles' },
  { id: 'solution.alm', provider: 'solutions', support: 'supported', provenance: 'microsoft', implementation: 'planned',
    requirements: ['Tested PAC version', 'Clean UAT target', 'Experiments 1 and 2 passed'], evidence: 'https://learn.microsoft.com/en-us/power-platform/developer/cli/reference/solution' },
  { id: 'modelDriven.reveal', provider: 'model-driven', support: 'constrained', provenance: 'powercanvas', implementation: 'experimental', requirements: ['Owned form with additive optional fields', 'Dedicated JavaScript web resource', 'YAML-generated app-scoped JavaScript command with table context bound at creation'], evidence: 'experiments/model-driven-behavior/report-2026-09-18.md' },
  { id: 'connector.compile', provider: 'connectors', support: 'constrained', provenance: 'powercanvas', implementation: 'implemented', requirements: ['Bounded GET Swagger 2 contract', 'Live deployment and connection still required'], evidence: 'docs/connectors.md' },
  { id: 'canvas.semantic', provider: 'canvas', support: 'constrained', provenance: 'powercanvas', implementation: 'implemented', requirements: ['PFDS experimental component policy'], evidence: 'docs/canvas/overview.md' },
  { id: 'canvas.liveAuthoring', provider: 'canvas', support: 'constrained', provenance: 'microsoft', implementation: 'experimental',
    requirements: ['Saved app', 'Open coauthoring Studio session', 'Prepared data sources', '.NET SDK 10+', 'Microsoft Canvas authoring MCP'], evidence: 'https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/create-canvas-external-tools' },
  { id: 'canvas.offlineCompile', provider: 'canvas', support: 'unsupported', provenance: 'microsoft', implementation: 'unavailable',
    requirements: [], evidence: 'https://learn.microsoft.com/en-us/power-platform/developer/cli/reference/canvas' },
];

export function validateCapabilities(project: Project, requireExecutable = false): Diagnostic[] {
  const requested = ['dataverse.schema'];
  if (Object.keys(project.apps).length) requested.push('modelDriven.app');
  if (Object.keys(project.security.roles).length) requested.push('dataverse.security');
  if (Object.keys(project.canvasApps ?? {}).length) requested.push('canvas.semantic', 'canvas.liveAuthoring');
  if (Object.keys(project.resources?.flows ?? {}).length) requested.push('flows.compile', 'flows.deploy');
  return requested.flatMap(id => {
    const capability = capabilities.find(item => item.id === id);
    if (capability?.implementation === 'implemented') return [];
    return [{ code: 'PF-CAPABILITY-001', severity: requireExecutable ? 'error' : 'warning', path: id,
      message: capability?.implementation === 'experimental' ? `${id} has an experimental adapter; local validation does not establish tenant readiness.` : `${id} has no executable PowerCanvas adapter in this milestone.`,
      remediation: capability?.implementation === 'experimental' ? 'Use live doctor, review a target-bound plan, and check the experiment evidence before apply.' : 'Complete the prerequisite experiment gates before executing this provider.',
    } satisfies Diagnostic];
  });
}
