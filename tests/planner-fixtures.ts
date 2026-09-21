import { randomUUID } from 'node:crypto';
import type { Observation, Ownership, Target } from '../src/state/models.js';
import type { Project } from '../src/ir/schema.js';
import { DATAVERSE_VERSION, desiredResources } from '../src/dataverse/desired.js';
import { hashJson } from '../src/core/json.js';
import { publicationHash } from '../src/planner/dataverse.js';

export const target: Target = { tenantId: 'ebaf65c1-ff98-47d4-a82c-8f90f907bd5a', environmentId: 'dd5845b7-ea22-415a-91c3-a656783532f6',
  organizationId: 'ef8b44b6-7507-40ea-b4f9-de6c6b780b6f', dataverseUrl: 'https://synthetic.crm.dynamics.com' };
export function emptyObservation(project: Project): Observation {
  return { schemaVersion: 1, projectId: project.project.id, target, snapshotId: randomUUID(), observedAt: new Date().toISOString(), providerVersions: { dataverse: DATAVERSE_VERSION },
    coverage: ['publisher', 'solution', 'table', 'column', 'relationship'].map(kind => ({ kind, status: 'complete' })), resources: [] };
}
export function matchingState(project: Project): { observation: Observation; ownership: Ownership } {
  const observation = emptyObservation(project); const desired = desiredResources(project);
  observation.resources = desired.map(resource => ({ resourceId: resource.resourceId, provider: 'dataverse', remoteId: randomUUID(), kind: resource.kind, schemaName: resource.schemaName,
    properties: { ...resource.properties, isManaged: false, customizable: true } }));
  const ownership: Ownership = { schemaVersion: 1, projectId: project.project.id, target, revision: 0, updatedAt: new Date().toISOString(), publicationHash: publicationHash(project),
    resources: desired.map(resource => ({ resourceId: resource.resourceId, remoteId: observation.resources.find(item => item.resourceId === resource.resourceId)!.remoteId, provider: 'dataverse',
      ownedPaths: Object.keys(resource.properties), baseline: resource.properties, lastVerifiedHash: hashJson(resource.properties) })) };
  return { observation, ownership };
}
