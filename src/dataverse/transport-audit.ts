import {appendFile,readFile,writeFile,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {assertAuthEvidenceSafe} from '../auth/safe-evidence.js';
import type {RequestAudit} from './transport.js';

/** One ordered durable sink shared by all concurrent discovery clients in a cycle. */
export class TransportAuditLog<T extends object=RequestAudit> {
 readonly entries:T[]=[];
 private pending:Promise<void>=Promise.resolve();
 private sealed=false;
 private constructor(readonly path:string,private readonly observer?:((entry:T)=>void|Promise<void>)){}
 static async create<T extends object=RequestAudit>(path:string,observer?:((entry:T)=>void|Promise<void>)){
  await writeFile(path,'',{flag:'wx'});return new TransportAuditLog<T>(path,observer);
 }
 async record(value:T):Promise<void>{
  if(this.sealed)throw Error('Audit log is finalized');
  assertAuthEvidenceSafe(value);const entry=structuredClone(value);this.entries.push(entry);
  this.pending=this.pending.then(async()=>{await appendFile(this.path,JSON.stringify(entry)+'\n');await this.observer?.(entry);});
  await this.pending;
 }
 async sha256(){this.sealed=true;await this.pending;const handle=await open(this.path,'r+');try{await handle.sync();}finally{await handle.close();}return createHash('sha256').update(await readFile(this.path)).digest('hex');}
}
