import type { Command } from 'commander';
import { ProfileStore } from '../auth/profiles.js';
import { addProfile, MicrosoftSession, removeProfile } from '../auth/msal.js';
import { discoverEnvironments, EnvironmentStore, verifyTarget } from '../auth/environments.js';
import { environmentIdSchema, targetSchema } from '../state/models.js';
import { PowerCanvasError } from '../core/errors.js';
import { emit } from './output.js';

export interface CliContext { json: boolean; project: string; nonInteractive?: boolean }
export function registerIdentityCommands(program: Command, global: () => CliContext): void {
  const profiles = new ProfileStore();
  const auth = program.command('auth').description('Tenant-bound interactive Microsoft sign-in with OS-protected cache');
  auth.command('add <alias>').requiredOption('--tenant <uuid>').requiredOption('--client-id <uuid>').option('--url <origin>', 'Also sign in for this Dataverse origin; omit for discovery-only sign-in')
    .description('Sign in through your browser; no passwords or tokens are accepted as flags')
    .action(async (alias: string, options: { tenant: string; clientId: string; url?: string }) => {
      if (global().nonInteractive) throw new PowerCanvasError('PF-AUTH-008', 'Interactive sign-in cannot run with --non-interactive.', 'Run auth add in an interactive terminal. Federated CI authentication is not implemented yet.');
      const profile = await addProfile(profiles, { alias, tenantId: options.tenant, clientId: options.clientId, ...(options.url ? { url: options.url } : {}) });
      emit({ ok: true, profile }, `Authenticated ${profile.alias} in tenant ${profile.tenantId}.`, global().json);
    });
  auth.command('list').action(async () => { const result = await profiles.list(); emit({ ok: true, profiles: result }, result.map(item => `${item.alias}  ${item.tenantId}  ${item.mode}`).join('\n') || 'No authentication profiles. Use auth add.', global().json); });
  auth.command('show <alias>').action(async (alias: string) => { const profile = await profiles.get(alias); emit({ ok: true, profile }, JSON.stringify(profile, null, 2), global().json); });
  auth.command('remove <alias>').description('Remove this profile and its isolated encrypted cache; does not revoke Microsoft consent')
    .action(async (alias: string) => { await removeProfile(profiles, alias); emit({ ok: true, removed: alias }, `Removed local profile ${alias} and its protected cache.`, global().json); });
  const env = program.command('env').description('Discover and bind immutable Dataverse environment identities');
  env.command('list').requiredOption('--auth <alias>').action(async (options: { auth: string }) => {
    const profile = await profiles.get(options.auth); const session = await MicrosoftSession.create(profiles, profile);
    const environments = await discoverEnvironments(profile, session);
    emit({ ok: true, environments }, environments.map(item => `${item.environmentId}  ${item.displayName}  ${item.dataverseUrl}`).join('\n') || 'No accessible enabled environments were discovered.', global().json);
  });
  env.command('use <alias>').requiredOption('--auth <alias>').requiredOption('--id <environment-id>')
    .action(async (alias: string, options: { auth: string; id: string }) => {
      const id = environmentIdSchema.parse(options.id);
      const profile = await profiles.get(options.auth); const session = await MicrosoftSession.create(profiles, profile);
      const environment = (await discoverEnvironments(profile, session)).find(item => item.environmentId === id);
      if (!environment) throw new PowerCanvasError('PF-ENV-004', 'Environment ID was not discovered for this authenticated tenant.', 'Use env list and select an accessible enabled environment.');
      const target = targetSchema.parse({ tenantId: environment.tenantId, environmentId: id, organizationId: environment.organizationId, dataverseUrl: environment.dataverseUrl });
      const binding = { alias, authProfile: profile.alias, target };
      const updated = { ...profile, allowedEnvironmentIds: [...new Set([...profile.allowedEnvironmentIds, id])] };
      const verified = await verifyTarget(updated, binding, session);
      await profiles.save(updated); await new EnvironmentStore(global().project).use(binding);
      emit({ ok: true, binding, organizationType: verified.environment.organizationType }, `Selected ${alias}\nTenant: ${target.tenantId}\nEnvironment: ${id}\nOrganization: ${target.organizationId}\nDataverse: ${target.dataverseUrl}`, global().json);
    });
  env.command('show [alias]').action(async (alias?: string) => { const binding = await new EnvironmentStore(global().project).get(alias); emit({ ok: true, binding, liveVerified: false }, JSON.stringify(binding, null, 2), global().json); });
}

export async function connect(directory: string, alias?: string) {
  const profiles = new ProfileStore(); const binding = await new EnvironmentStore(directory).get(alias);
  const profile = await profiles.get(binding.authProfile); const session = await MicrosoftSession.create(profiles, profile);
  return { binding, profile, session, ...await verifyTarget(profile, binding, session) };
}
