import { join } from 'node:path';
import { z } from 'zod';
import { environmentIdSchema, targetSchema } from '../state/models.js';
import type { Target } from '../state/models.js';
import { DataverseHttp } from '../dataverse/http.js';
import { DISCOVERY_ORIGIN } from './msal.js';
import type { TokenSource } from './msal.js';
import type { StoredProfile } from './profiles.js';
import { aliasSchema } from './profiles.js';
import { editJson, readJson } from '../core/files.js';
import { PowerCanvasError } from '../core/errors.js';
import { hashJson } from '../core/json.js';

const instanceSchema = z.object({ TenantId: z.uuid(), EnvironmentId: environmentIdSchema, Id: z.guid(), ApiUrl: z.url(),
  Url: z.url(), FriendlyName: z.string(), OrganizationType: z.int(), State: z.int() });
export interface Environment extends Target { displayName: string; organizationType: number; applicationUrl: string }
export const environmentBindingSchema = z.strictObject({ alias: aliasSchema, authProfile: aliasSchema, target: targetSchema });
export type EnvironmentBinding = z.infer<typeof environmentBindingSchema>;
const configSchema = z.strictObject({ schemaVersion: z.literal(1), selected: aliasSchema, environments: z.array(environmentBindingSchema) });

export async function discoverEnvironments(profile: StoredProfile, credentials: TokenSource): Promise<Environment[]> {
  const http = new DataverseHttp(`${DISCOVERY_ORIGIN}/api/discovery/v2.0/`, credentials);
  const rows = await http.all('Instances?$select=TenantId,EnvironmentId,Id,ApiUrl,Url,FriendlyName,OrganizationType,State');
  const result: Environment[] = [];
  for (const row of rows) {
    const candidate = instanceSchema.parse(row);
    if (candidate.TenantId.toLowerCase() !== profile.tenantId || candidate.State !== 0) continue;
    const target = targetSchema.parse({ tenantId: candidate.TenantId.toLowerCase(), environmentId: candidate.EnvironmentId.toLowerCase(),
      organizationId: candidate.Id.toLowerCase(), dataverseUrl: new URL(candidate.ApiUrl).origin });
    result.push({ ...target, applicationUrl: new URL(candidate.Url).origin, displayName: candidate.FriendlyName, organizationType: candidate.OrganizationType });
  }
  return result;
}

export async function verifyTarget(profile: StoredProfile, binding: EnvironmentBinding, credentials: TokenSource) {
  if (profile.tenantId !== binding.target.tenantId || !profile.allowedEnvironmentIds.includes(binding.target.environmentId)) {
    throw new PowerCanvasError('PF-ENV-002', 'Profile is not authorized for this tenant/environment binding.', 'Use env use to explicitly bind the intended discovered environment.');
  }
  const discovered = (await discoverEnvironments(profile, credentials)).find(item => item.environmentId === binding.target.environmentId);
  if (!discovered || discovered.organizationId !== binding.target.organizationId || discovered.dataverseUrl !== binding.target.dataverseUrl || discovered.tenantId !== binding.target.tenantId) {
    throw new PowerCanvasError('PF-ENV-003', 'Live discovery does not match the selected immutable target.', 'Resolve the mismatch before planning or applying.');
  }
  const http = new DataverseHttp(`${binding.target.dataverseUrl}/api/data/v9.2/`, credentials);
  const response = await http.request('WhoAmI');
  const identity = z.object({ OrganizationId: z.guid(), UserId: z.guid(), BusinessUnitId: z.guid() }).parse(response.data);
  if (identity.OrganizationId.toLowerCase() !== binding.target.organizationId) throw new PowerCanvasError('PF-ENV-003', 'WhoAmI organization differs from discovery.', 'Stop and correct the environment binding.');
  return { http, environment: discovered, identity, requestId: response.requestId };
}

export class EnvironmentStore {
  readonly path: string;
  constructor(directory: string) { this.path = join(directory, '.powercanvas', 'environments.json'); }
  async get(alias?: string): Promise<EnvironmentBinding> {
    const config = await readJson(this.path, configSchema);
    const found = config?.environments.find(item => item.alias === (alias ?? config.selected));
    if (!found) throw new PowerCanvasError('PF-ENV-004', 'No matching environment has been selected.', 'Run powercanvas env list --auth <profile>, then env use dev --auth <profile> --id <discovered environment ID>.');
    return found;
  }
  async use(binding: EnvironmentBinding): Promise<void> {
    await editJson(this.path, configSchema, old => {
      const previous = old?.environments.find(item => item.alias === binding.alias);
      if (previous && hashJson(previous) !== hashJson(binding)) throw new PowerCanvasError('PF-ENV-005', 'Environment alias is already bound to another target/profile.', 'Use a new alias; existing bindings are immutable.');
      return { schemaVersion: 1 as const, selected: binding.alias, environments: [...(old?.environments.filter(item => item.alias !== binding.alias) ?? []), binding] };
    });
  }
}
