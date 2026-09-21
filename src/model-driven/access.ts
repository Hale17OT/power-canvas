import { create } from 'xmlbuilder2';
import type { DataverseHttp } from '../dataverse/http.js';
import { guidValue } from '../dataverse/normalize.js';
import { PowerCanvasError } from '../core/errors.js';

// Standard Microsoft role templates, not names supplied by arbitrary tenant roles.
export const PLATFORM_APP_ROLE_TEMPLATES = ['119f245c-3cc8-4b62-b31c-d1a046ced15d', '627090ff-40a3-4053-8790-584edc5be201'];
export async function readAppRoleIds(http: DataverseHttp, appId: string): Promise<string[]> {
  // These readable lookup attributes are absent from the intersect's OData type.
  // FetchXML also reads associations before the new app has been published.
  const entity = create().ele('fetch').ele('entity', { name: 'appmoduleroles' });
  entity.ele('attribute', { name: 'roleid' });
  entity.ele('filter').ele('condition', { attribute: 'appmoduleid', operator: 'eq', value: guidValue(appId) });
  const rows = await http.all(`appmodulerolescollection?fetchXml=${encodeURIComponent(entity.doc().end({ headless: true }))}`);
  return rows.map(item => guidValue(item._roleid_value));
}
export function splitAppRoles(actualIds: string[], defaults: { remoteId: string; templateId: string }[]) {
  if (defaults.length !== 2 || PLATFORM_APP_ROLE_TEMPLATES.some(template => defaults.filter(item => item.templateId === template).length !== 1) ||
    defaults.some(item => actualIds.filter(id => id === item.remoteId).length !== 1) || new Set(actualIds).size !== actualIds.length) throw new PowerCanvasError('PF-MDA-013', 'Platform-created app role associations differ from the verified defaults.', 'Inspect the app access list; never remove or conceal unexpected roles.');
  const roles = actualIds.filter(id => !defaults.some(item => item.remoteId === id));
  return { roles, platformDefaultRoles: [...defaults].sort((a, b) => a.templateId.localeCompare(b.templateId)) };
}
