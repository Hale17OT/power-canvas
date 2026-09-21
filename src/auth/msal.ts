import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PublicClientApplication } from '@azure/msal-node';
import type { AuthenticationResult, IPublicClientApplication } from '@azure/msal-node';
import { z } from 'zod';
import { PowerCanvasError } from '../core/errors.js';
import { targetSchema } from '../state/models.js';
import { ProfileStore, storedProfileSchema } from './profiles.js';
import type { StoredProfile } from './profiles.js';

export const DISCOVERY_ORIGIN = 'https://globaldisco.crm.dynamics.com';
function validateResourceOrigin(origin:string){
  if(origin===DISCOVERY_ORIGIN||origin==='https://api.powerplatform.com'||origin==='https://graph.microsoft.com'||/^https:\/\/[a-z0-9-]+\.sharepoint\.com$/.test(origin))return;
  targetSchema.shape.dataverseUrl.parse(origin);
}
export interface TokenSource { token(origin: string): Promise<string> }
const execute = promisify(execFile);
export async function openSignIn(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'login.microsoftonline.com') throw new PowerCanvasError('PF-AUTH-003', 'Unexpected sign-in endpoint.', 'Use the supported public-cloud sign-in route.');
  if (process.platform === 'win32') await execute('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: true });
  else await execute(process.platform === 'darwin' ? 'open' : 'xdg-open', [url]);
}

async function persistence(store: ProfileStore, profile: StoredProfile) {
  try {
    const { PersistenceCreator, DataProtectionScope } = await import('@azure/msal-node-extensions');
    await mkdir(store.root, { recursive: true, mode: 0o700 });
    return await PersistenceCreator.createPersistence({
      cachePath: join(store.root, `${profile.cacheId}.cache`), dataProtectionScope: DataProtectionScope.CurrentUser,
      serviceName: 'PowerCanvas', accountName: profile.cacheId, usePlaintextFileOnLinux: false,
    });
  } catch {
    throw new PowerCanvasError('PF-AUTH-004', 'OS-protected credential persistence is unavailable.', 'Enable Windows DPAPI, macOS Keychain or Linux Secret Service. Plaintext fallback is disabled.');
  }
}

export class MicrosoftSession implements TokenSource {
  constructor(readonly profile: StoredProfile, private readonly client: IPublicClientApplication) {}
  static async create(store: ProfileStore, profile: StoredProfile): Promise<MicrosoftSession> {
    const storage = await persistence(store, profile);
    const { PersistenceCachePlugin } = await import('@azure/msal-node-extensions');
    return new MicrosoftSession(profile, new PublicClientApplication({
      auth: { clientId: profile.clientId, authority: `https://login.microsoftonline.com/${profile.tenantId}` },
      cache: { cachePlugin: new PersistenceCachePlugin(storage) },
      system: { loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => undefined } },
    }));
  }
  private check(result: AuthenticationResult, origin: string): string {
    if (result.tenantId.toLowerCase() !== this.profile.tenantId || !result.account ||
        (this.profile.homeAccountId !== 'pending' && result.account.homeAccountId !== this.profile.homeAccountId) ||
        !result.expiresOn || result.expiresOn.getTime() <= Date.now()) {
      throw new PowerCanvasError('PF-AUTH-005', 'Sign-in returned an unexpected tenant/account or an expired token.', 'Sign in again with the intended tenant identity.');
    }
    // The requested resource audience comes from an allowlisted origin, not from unverified JWT claims.
    validateResourceOrigin(origin);
    return result.accessToken;
  }
  async acquire(origin: string, interactive: boolean): Promise<string> {
    validateResourceOrigin(origin);
    try {
      const scopes = [`${origin}/.default`];
      if (interactive) {
        const result = await this.client.acquireTokenInteractive({ scopes, openBrowser: openSignIn, prompt: 'select_account' });
        const token = this.check(result, origin);
        this.profile.homeAccountId = result.account!.homeAccountId;
        return token;
      }
      const account = await this.client.getTokenCache().getAccountByHomeId(this.profile.homeAccountId);
      if (!account) throw new Error('Account missing');
      return this.check(await this.client.acquireTokenSilent({ scopes, account }), origin);
    } catch (error) {
      if (error instanceof PowerCanvasError) throw error;
      const code = typeof error === 'object' && error !== null && 'errorCode' in error && typeof error.errorCode === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(error.errorCode) ? error.errorCode : 'unavailable';
      const description = error instanceof Error ? error.message : '';
      const aadsts = description.match(/\bAADSTS[0-9]{4,10}\b/)?.[0];
      throw new PowerCanvasError('PF-AUTH-006', `Microsoft sign-in or token renewal requires attention (MSAL: ${code}${aadsts ? `; ${aadsts}` : ''}).`, `Run powercanvas auth add ${this.profile.alias} with the same tenant, client ID and URL; complete browser sign-in and any approved consent. Register http://localhost under Mobile and desktop applications in Entra Authentication.`);
    }
  }
  token(origin: string): Promise<string> { return this.acquire(origin, false); }
}

export async function addProfile(store: ProfileStore, input: { alias: string; tenantId: string; clientId: string; url?: string }): Promise<StoredProfile> {
  const existing = (await store.list()).find(item => item.alias === input.alias);
  const candidate = storedProfileSchema.parse({ alias: input.alias, tenantId: z.uuid().parse(input.tenantId).toLowerCase(), clientId: input.clientId,
    ...(input.url ? { preferredDataverseUrl: input.url.replace(/\/$/, '').toLowerCase() } : existing?.preferredDataverseUrl ? { preferredDataverseUrl: existing.preferredDataverseUrl } : {}), cloud: 'public', mode: 'interactive', allowedEnvironmentIds: [],
    homeAccountId: existing?.homeAccountId ?? 'pending', cacheId: existing?.cacheId ?? randomUUID() });
  if (existing && (existing.tenantId !== candidate.tenantId || existing.clientId !== candidate.clientId || (existing.preferredDataverseUrl && existing.preferredDataverseUrl !== candidate.preferredDataverseUrl))) {
    throw new PowerCanvasError('PF-AUTH-002', 'Existing profile is bound to another tenant, client or URL.', 'Use a new alias or explicitly remove the existing profile.');
  }
  candidate.allowedEnvironmentIds = existing?.allowedEnvironmentIds ?? [];
  const session = await MicrosoftSession.create(store, candidate);
  await session.acquire(DISCOVERY_ORIGIN, true);
  if (candidate.preferredDataverseUrl) await session.acquire(candidate.preferredDataverseUrl, true);
  await store.save(candidate);
  return candidate;
}
export async function removeProfile(store: ProfileStore, alias: string): Promise<void> {
  const profile = await store.get(alias);
  const storage = await persistence(store, profile);
  await storage.delete();
  await store.remove(alias);
}
