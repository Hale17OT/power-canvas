import { homedir } from 'node:os';
import { join } from 'node:path';
import { readdir, unlink } from 'node:fs/promises';
import {statSync} from 'node:fs';
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
function storeExists(path:string){try{statSync(path);return true;}catch(error){if(hasCode(error,'ENOENT'))return false;throw error;}}
export function profileStoreLocation(home:string,exists:(path:string)=>boolean=storeExists){
  const canonical=join(home,'.powercanvas','auth'),legacy=join(home,'.powerforge','auth');
  // Rebrand compatibility for the same named store. Never merge stores or fall back per alias.
  const legacyCompatibility=!exists(canonical)&&exists(legacy);
  return {root:legacyCompatibility?legacy:canonical,canonicalRoot:canonical,legacyRoot:legacy,legacyCompatibility};
}
export class ProfileStore {
  readonly root:string;
  readonly legacyCompatibility:boolean;
  constructor(root?:string){const location=root?{root,legacyCompatibility:false}:profileStoreLocation(homedir());this.root=location.root;this.legacyCompatibility=location.legacyCompatibility;}
  path(alias: string): string { return join(this.root, `${aliasSchema.parse(alias)}.json`); }
  async get(alias: string): Promise<StoredProfile> {
    const profile = await readJson(this.path(alias), storedProfileSchema);
    if (!profile) throw new PowerCanvasError('PF-AUTH-001', 'Authentication profile was not found.', 'Run powercanvas auth add <alias> --tenant <id> --client-id <id> --url <Dataverse URL>.');
    if(profile.alias!==alias)throw new PowerCanvasError('PF-AUTH-009','Profile filename and alias disagree.','Inspect the profile store; no alternate identity will be selected.');
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
