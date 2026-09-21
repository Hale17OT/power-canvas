import type { Project } from '../ir/schema.js';
import { guidValue, textValue } from '../dataverse/normalize.js';
import { PowerCanvasError } from '../core/errors.js';

export function publisherLocalName(project: Project, value: unknown): string {
  const name = textValue(value); const prefix = `${project.solution.publisher.prefix}_`;
  if (!name.startsWith(prefix) || !/^[A-Za-z][A-Za-z0-9]*$/.test(name.slice(prefix.length)) || name.length > 40) throw new PowerCanvasError('PF-MDA-011', 'App/navigation names require the publisher prefix, an alphanumeric local name and at most 40 characters.', 'Choose a supported namespaced unique name before creating components.');
  return name.slice(prefix.length);
}

// Sitemap does NOT auto-prefix its service unique name. PowerCanvas's qualified
// identity is its namespaced display name plus the exact service-local name.
// Keep both actual values visible and fail closed if their relationship changes.
export function sitemapIdentity(project: Project, raw: Record<string, unknown>) {
  const displayName = textValue(raw.sitemapname); const serviceUniqueName = textValue(raw.sitemapnameunique);
  if (serviceUniqueName !== publisherLocalName(project, displayName) || raw.isappaware !== true) throw new PowerCanvasError('PF-MDA-012', 'Sitemap identity or app-specific scope differs from the supported contract.', 'Stop and inspect both actual sitemap names and isappaware; do not adopt or rename the component.');
  return { uniqueName: displayName, displayName, serviceUniqueName, isAppAware: true };
}

export interface AppLayerContext {
  knownAppId?: string | undefined;
  solutionMember: boolean;
  publishedIdentityVerified?: boolean;
  active?: { solutionid: string; publisherId: string; uniqueName: string; isManaged: boolean } | undefined;
}
export function appIdentity(project: Project, raw: Record<string, unknown>, publisherId: string, context?: AppLayerContext) {
  const serviceUniqueName = textValue(raw.uniquename); const prefix = `${project.solution.publisher.prefix}_`;
  const uniqueName = serviceUniqueName.startsWith(prefix) ? serviceUniqueName : `${prefix}${serviceUniqueName}`;
  publisherLocalName(project, uniqueName);
  const servicePublisherId = guidValue(raw._publisherid_value);
  const dedicated = servicePublisherId === guidValue(publisherId);
  // Publishing can expose the shared unmanaged Active layer's publisher. Only
  // an already verified app in our solution may use this observed layer identity.
  const active = context?.active;
  const verifiedActiveLayer = context && typeof context.knownAppId === 'string' && context.knownAppId === raw.appmoduleid && context.solutionMember && raw.ismanaged === false && (raw.componentstate === 0 || (raw.componentstate === 1 && context.publishedIdentityVerified === true)) &&
    active?.uniqueName === 'Active' && active.isManaged === false && raw.solutionid === active.solutionid && servicePublisherId === active.publisherId;
  if (!dedicated && !verifiedActiveLayer) throw new PowerCanvasError('PF-MDA-012', 'App publisher differs from the verified experiment publisher.', 'Stop; only an already-owned app with exact solution membership and verified published Active-layer identity can use the platform layer publisher.');
  return { uniqueName, serviceUniqueName, solutionPublisherUniqueName: project.solution.publisher.uniqueName, servicePublisherId,
    publisherSource: dedicated ? 'dedicated' : 'unmanagedActiveLayer', componentLayerId: guidValue(raw.appmoduleidunique) };
}
