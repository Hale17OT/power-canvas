import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import type { IPublicClientApplication } from '@azure/msal-node';
import { MicrosoftSession, DISCOVERY_ORIGIN } from '../src/auth/msal.js';
import { ProfileStore } from '../src/auth/profiles.js';
import type { StoredProfile } from '../src/auth/profiles.js';
import { EnvironmentStore } from '../src/auth/environments.js';
import { environmentIdSchema, targetSchema, observationSchema } from '../src/state/models.js';
import { guidValue } from '../src/dataverse/normalize.js';
import { clean, fixture, temporary } from './helpers.js';
import { emptyObservation, target } from './planner-fixtures.js';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(clean)); });
const profile = (): StoredProfile => ({ alias: 'synthetic', tenantId: target.tenantId, clientId: randomUUID(), cloud: 'public', mode: 'interactive',
  allowedEnvironmentIds: [target.environmentId], homeAccountId: 'synthetic-account', cacheId: randomUUID() });

it('accepts Default environment identifiers and Dataverse sequential GUIDs without relaxing local project UUIDs', () => {
  const id = 'ab123456-7890-ed11-a809-0022489e1234';
  expect(guidValue(id)).toBe(id);
  expect(environmentIdSchema.parse(`Default-${target.tenantId}`)).toBe(`default-${target.tenantId}`);
  expect(targetSchema.parse({ ...target, organizationId: id }).organizationId).toBe(id);
  expect(environmentIdSchema.safeParse('Default-not-an-id').success).toBe(false);
  expect(observationSchema.safeParse({ ...emptyObservation(fixture()), projectId: id }).success).toBe(false);
});

it('keeps tenant and environment bindings immutable and local profiles free of credential fields', async () => {
  const dir = await temporary(); dirs.push(dir);
  const profiles = new ProfileStore(dir); const value = profile(); await profiles.save(value);
  expect(await profiles.get(value.alias)).toEqual(value);
  await expect(profiles.save({ ...value, tenantId: randomUUID() })).rejects.toMatchObject({ code: 'PF-AUTH-002' });
  expect(() => profiles.path('../escape')).toThrow();
  const environments = new EnvironmentStore(dir); const binding = { alias: 'dev', authProfile: value.alias, target };
  await environments.use(binding);
  await expect(environments.use({ ...binding, target: { ...target, organizationId: randomUUID() } })).rejects.toMatchObject({ code: 'PF-ENV-005' });
  expect(await environments.get()).toEqual(binding);
});

it('requests the selected audience and rejects a silently returned account or tenant mismatch', async () => {
  const value = profile();
  const result = { tenantId: value.tenantId, account: { homeAccountId: value.homeAccountId }, expiresOn: new Date(Date.now() + 60000), accessToken: 'synthetic-secret' };
  const client = { getTokenCache: () => ({ getAccountByHomeId: async () => result.account }), acquireTokenSilent: async (request: { scopes: string[] }) => {
    expect(request.scopes).toEqual([`${DISCOVERY_ORIGIN}/.default`]); return result;
  } } as unknown as IPublicClientApplication;
  const session = new MicrosoftSession(value, client);
  expect(await session.token(DISCOVERY_ORIGIN)).toBe('synthetic-secret');
  result.tenantId = randomUUID();
  await expect(session.token(DISCOVERY_ORIGIN)).rejects.toMatchObject({ code: 'PF-AUTH-005' });
  await expect(session.token('https://untrusted.example')).rejects.toThrow();
});

it('prints only allowlisted MSAL and AADSTS codes from a failed token exchange', async () => {
  const error = Object.assign(new Error('AADSTS7000218: raw-token-secret-and-callback-code'), { errorCode: 'invalid_client' });
  const client = { acquireTokenInteractive: async () => { throw error; } } as unknown as IPublicClientApplication;
  const session = new MicrosoftSession(profile(), client);
  try { await session.acquire(DISCOVERY_ORIGIN, true); throw new Error('Expected auth failure'); }
  catch (failure) {
    expect(failure).toMatchObject({ code: 'PF-AUTH-006', message: expect.stringContaining('AADSTS7000218') });
    expect(String(failure)).not.toContain('raw-token-secret');
  }
});
