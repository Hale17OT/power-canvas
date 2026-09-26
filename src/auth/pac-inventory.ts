import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {assertAuthEvidenceSafe} from './safe-evidence.js';

export type PacProfile={index:number;active:boolean;kind:string;name:string;friendlyName:string;environmentUrl:string;user:string;cloud:string;type:string};
export type PacInventory={status:'READY'|'PAC_UNAVAILABLE'|'PAC_RUNTIME_UNAVAILABLE'|'PROFILE_ENUMERATION_FAILED';executable:string;profiles:PacProfile[];current:Record<string,string>;note:string};
export type PacRunner=(executable:string,args:string[],dotnetRoot?:string)=>Promise<string>;
const run:PacRunner=async(executable,args,dotnetRoot)=>(await promisify(execFile)(executable,args,{windowsHide:true,timeout:45000,maxBuffer:1024*1024,env:{...process.env,...(dotnetRoot?{DOTNET_ROOT:resolve(dotnetRoot),DOTNET_ROOT_X64:resolve(dotnetRoot)}:{})}})).stdout;
/** Parse only the documented inventory table; never persist raw stdout or PAC's token cache. */
export function parsePacProfiles(text:string):PacProfile[]{
 const lines=text.split(/\r?\n/),header=lines.find(l=>/^Index\s+Active\s+Kind\s+Name\s+User\s+Cloud\s+Type\s+Environment\s+Environment Url/.test(l));
 if(!header){if(/no (?:authentication |auth )?profiles/i.test(text))return [];throw Error('PAC inventory format not recognized');}
 const titles=['Index','Active','Kind','Name','User','Cloud','Type','Environment','Environment Url','ERP URL'];const offsets=titles.map(t=>header.indexOf(t));
 const rows=lines.filter(l=>/^\[\d+\]/.test(l));
 return rows.map(line=>{const fields=titles.map((_,i)=>offsets[i]!<0?'':line.slice(offsets[i],offsets[i+1]!>=0?offsets[i+1]:undefined).trim());const row={index:Number(fields[0]!.slice(1,-1)),active:fields[1]==='*',kind:fields[2]!,name:fields[3]!,user:fields[4]!,cloud:fields[5]!,type:fields[6]!,friendlyName:fields[7]!,environmentUrl:fields[8]!};if(!Number.isInteger(row.index)||row.environmentUrl&&!/^https:\/\/[^\s]+$/.test(row.environmentUrl))throw Error('Invalid PAC inventory row');assertAuthEvidenceSafe(row);return row;});
}
export function parsePacWho(text:string){const allow:Record<string,string>={'Name':'name','Type':'type','Cloud':'cloud','Tenant Id':'tenantId','User':'user','Entra ID Object Id':'entraObjectId','Environment Id':'environmentId','Environment Type':'environmentType','Organization Id':'organizationId','Organization Unique Name':'organizationUniqueName','Organization Friendly Name':'friendlyName'};const current:Record<string,string>={};for(const line of text.split(/\r?\n/)){const match=line.match(/^([^:]+):\s*(.*)$/);if(match&&allow[match[1]!.trim()])current[allow[match[1]!.trim()]!]=match[2]!.trim();}assertAuthEvidenceSafe(current);return current;}
export async function pacInventory(executable='pac',dotnetRoot?:string,runner:PacRunner=run):Promise<PacInventory>{
 const base={executable,profiles:[] as PacProfile[],current:{},note:'PAC inventory is informational; PowerCanvas uses its explicitly named MSAL profile, never the active PAC profile.'};
 try{const profiles=parsePacProfiles(await runner(executable,['auth','list'],dotnetRoot));const current=profiles.some(p=>p.active)?parsePacWho(await runner(executable,['auth','who'],dotnetRoot)):{};return {...base,status:'READY',profiles,current};}
 catch(error){const e=error as {code?:unknown;stderr?:unknown};return {...base,status:e.code==='ENOENT'?'PAC_UNAVAILABLE':typeof e.stderr==='string'&&/\.NET|framework/i.test(e.stderr)?'PAC_RUNTIME_UNAVAILABLE':'PROFILE_ENUMERATION_FAILED'};}
}
