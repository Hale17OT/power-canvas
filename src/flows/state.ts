import { z } from 'zod';
import { mkdir, open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readJson, editJson } from '../core/files.js';
import { hashJson } from '../core/json.js';
import { targetSchema } from '../state/models.js';
import type { Target } from '../state/models.js';
import type { FlowOwnership } from './plan.js';
import { fail } from './expressions.js';
const stateSchema=z.strictObject({projectId:z.uuid(),target:targetSchema,entries:z.record(z.string(),z.strictObject({kind:z.enum(['flow','connection','environment','environmentValue']),id:z.guid(),hash:z.string().regex(/^[a-f0-9]{64}$/),solutionId:z.guid(),logicalName:z.string(),owner:z.guid().nullable()})),pending:z.strictObject({key:z.string(),id:z.guid(),operation:z.string()}).optional()});
export class FlowStore {
  readonly path:string;
  constructor(directory:string,readonly projectId:string,readonly target:Target){this.path=resolve(directory,'.powercanvas',`flows-${hashJson({projectId,target})}.json`);}
  async read():Promise<FlowOwnership>{const s=await readJson(this.path,stateSchema)??{projectId:this.projectId,target:this.target,entries:{}};if(s.projectId!==this.projectId||hashJson(s.target)!==hashJson(this.target))fail('Flow ownership target mismatch.');return s as FlowOwnership;}
  async save(s:FlowOwnership){await editJson(this.path,stateSchema,()=>s);}
  async locked<T>(work:()=>Promise<T>):Promise<T>{await mkdir(resolve(this.path,'..'),{recursive:true});const lock=await open(this.path+'.execution.lock','wx').catch(()=>fail('Another flow operation is running or a stale execution lock needs inspection.'));try{return await work();}finally{await lock.close();await unlink(this.path+'.execution.lock');}}
}
