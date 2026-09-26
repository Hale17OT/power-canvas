import { create } from 'xmlbuilder2';
import { guidValue } from '../dataverse/normalize.js';
import type { Resource } from '../dataverse/desired.js';
import { PowerCanvasError } from '../core/errors.js';

export function appPublicationId(appResourceId: string) { return appResourceId.replace(':app:', ':appPublication:'); }

/** Caller supplies independently identity-verified published/unpublished observations. */
export function appLifecycle(published: boolean, unpublished: boolean) {
  return published ? 'PUBLISHED' : unpublished ? 'DRAFT_UNPUBLISHED' : 'UNKNOWN';
}

export function publishedAssociationFailure(status: number, requestedAppId: string, verifiedApp: Resource) {
  return status === 404 && guidValue(requestedAppId) === guidValue(verifiedApp.remoteId) && verifiedApp.properties.lifecycle === 'DRAFT_UNPUBLISHED'
    ? 'APP_NOT_PUBLISHED' : 'READ_FAILED';
}

export function requirePublishedApp(app: Resource) {
  if (app.properties.lifecycle !== 'PUBLISHED') throw new PowerCanvasError('PF-MDA-018', 'APP_ACCESS_REQUIRES_PUBLICATION', 'Retain app access as deferred. Review scoped app publication separately; do not recreate the app or repair authentication.');
}

export function appPublishXml(appId: string): string {
  return create().ele('importexportxml').ele('appmodules').ele('appmodule').txt(guidValue(appId)).doc().end({ headless: true });
}
