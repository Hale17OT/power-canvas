import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {nativeBindingsSchema} from '../dist/canvas/native-types.js';

/** Local identity configuration is deliberately excluded from Git. No account hint or tenant is embedded in tooling. */
export async function loadLocalAuthoringConfig(){
 const path=resolve('.powercanvas/authoring.local.json');
 let config;
 try{config=JSON.parse(await readFile(path,'utf8'));}catch(error){throw new Error('Configure .powercanvas/authoring.local.json before running live authoring helpers. See docs/public-repository.md.',{cause:error});}
 if(!config||typeof config.bindings!=='string'||typeof config.loginHint!=='string'||!config.loginHint.trim()||typeof config.appName!=='string'||!config.appName.trim()||typeof config.dataverseUrl!=='string'||!/^https:\/\/[a-z0-9-]+\.(?:api\.)?crm[0-9]*\.dynamics\.com$/.test(config.dataverseUrl))throw new Error('Local authoring configuration requires bindings, loginHint, appName and a Dataverse HTTPS URL.');
 const binding=nativeBindingsSchema.parse(JSON.parse(await readFile(resolve(config.bindings),'utf8')));
 return {...config,binding};
}
