import { z } from 'zod';
import type { DataverseHttp } from './http.js';
import { guidValue, rawObject } from './normalize.js';
import { PowerCanvasError } from '../core/errors.js';
import type { Project } from '../ir/schema.js';
import { experimentIsolation } from './isolation.js';

export const SCHEMA_PRIVILEGES = ['prvCreateEntity', 'prvCreateAttribute', 'prvCreateRelationship', 'prvCreatePublisher', 'prvCreateSolution',
  'prvWriteEntity', 'prvWriteAttribute', 'prvWriteSolution', 'prvPublishCustomization'];
export const MODEL_PRIVILEGES = ['prvCreateWebResource', 'prvReadWebResource', 'prvWriteWebResource', 'prvCreateSystemForm', 'prvReadSystemForm', 'prvWriteSystemForm', 'prvCreateAppModule', 'prvReadAppModule', 'prvWriteAppModule',
  'prvAppendAppModule', 'prvAppendToAppModule', 'prvCreateRole', 'prvReadRole', 'prvWriteRole', 'prvAppendRole', 'prvAppendToRole'];
export async function checkPermissions(http: DataverseHttp, userId: string, modelDriven = false): Promise<{ missing: string[]; checked: string[] }> {
  const definitions = await http.all('privileges?$select=privilegeid,name');
  const response = rawObject((await http.request(`systemusers(${guidValue(userId)})/Microsoft.Dynamics.CRM.RetrieveUserPrivileges()`)).data);
  const grants = z.array(z.object({ PrivilegeId: z.guid() })).parse(response.RolePrivileges);
  const ids = new Set(grants.map(grant => grant.PrivilegeId.toLowerCase()));
  const checked = [...SCHEMA_PRIVILEGES, ...(modelDriven ? MODEL_PRIVILEGES : [])];
  const missing = checked.filter(name => !definitions.some(item => item.name === name && ids.has(guidValue(item.privilegeid))));
  return { missing, checked };
}
export async function assertWritePreflight(http: DataverseHttp, userId: string, organizationType: number, organizationId: string, project?: Project, defaultExperiment = false, modelDriven = false): Promise<void> {
  if (organizationType === 12 && defaultExperiment && project) experimentIsolation(project, modelDriven);
  else if (![5, 6, 13].includes(organizationType)) throw new PowerCanvasError('PF-SAFETY-002', 'Direct schema writes require developer/sandbox, or an explicitly isolated Default experiment.', 'Production and trial targets are blocked. Default requires the dedicated experiment project and --default-experiment planning policy.');
  const organization = rawObject((await http.request(`organizations(${guidValue(organizationId)})?$select=languagecode`)).data);
  if (organization.languagecode !== 1033) throw new PowerCanvasError('PF-CAPABILITY-002', 'This adapter currently requires English base-language metadata (1033).', 'Use an English disposable environment for Experiment 1.');
  const permissions = await checkPermissions(http, userId, modelDriven);
  if (permissions.missing.length) throw new PowerCanvasError('PF-AUTH-007', `Schema privilege preflight is missing: ${permissions.missing.join(', ')}.`, 'Have the tenant owner configure the approved customization privileges; PowerCanvas never grants them automatically.');
}
