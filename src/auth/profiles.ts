import { homedir } from 'node:os';
import { join } from 'node:path';
import { readdir, unlink } from 'node:fs/promises';
import { z } from 'zod';
import { authProfileSchema } from './contracts.js';
import { targetSchema } from '../state/models.js';
import { editJson, readJson } from '../core/files.js';
import { hasCode, PowerCanvasError } from '../core/errors.js';

export const aliasSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
export const storedProfileSchema = authProfileSchema.extend({
  alias: aliasSchema, tenantId: z.uuid().toLowerCase(), clientId: z.uuid().toLowerCase(),
  homeAccountId: z.string().min(1), cacheId: z.uuid(), preferredDataverseUrl: targetSchema.shape.dataverseUrl.optional(),
});
export type StoredProfile = z.infer<typeof storedProfileSchema>;
export class ProfileStore {
  constructor(readonly root = join(homedir(), '.powercanvas', 'auth')) {}
  path(alias: string): string { return join(this.root, `${aliasSchema.parse(alias)}.json`); }
  async get(alias: string): Promise<StoredProfile> {
    const profile = await readJson(this.path(alias), storedProfileSchema);
    if (!profile) throw new PowerCanvasError('PF-AUTH-001', 'Authentication profile was not found.', 'Run powercanvas auth add <alias> --tenant <id> --client-id <id> --url <Dataverse URL>.');
    return profile;
  }
  async list(): Promise<StoredProfile[]> {
    let names: string[];
    try { names = await readdir(this.root); } catch (error) { if (hasCode(error, 'ENOENT')) return []; throw error; }
    const profiles: StoredProfile[] = [];
    for (const name of names.sort()) if (/^[a-z][a-z0-9-]*\.json$/.test(name)) profiles.push(await this.get(name.slice(0, -5)));
    return profiles;
  }
  async save(profile: StoredProfile): Promise<void> {
    await editJson(this.path(profile.alias), storedProfileSchema, old => {
      if (old && (old.tenantId !== profile.tenantId || old.clientId !== profile.clientId || old.cacheId !== profile.cacheId)) {
        throw new PowerCanvasError('PF-AUTH-002', 'Profile identity cannot be replaced implicitly.', 'Use another alias or explicitly remove the old profile.');
      }
      return profile;
    });
  }
  async remove(alias: string): Promise<void> { await unlink(this.path(alias)); }
}
