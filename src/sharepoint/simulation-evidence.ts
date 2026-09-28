import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';

const proofSchema=z.object({mode:z.literal('SHAREPOINT_SIMULATION'),status:z.literal('SIMULATED_CONTRACT_CERTIFIED'),liveRead:z.literal(false),liveWrite:z.literal(false),sourceHashes:z.array(z.object({file:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/)})).min(5),capabilities:z.array(z.object({id:z.string(),dimensions:z.array(z.enum(['SIMULATED_READ_VERIFIED','SIMULATED_WRITE_VERIFIED','SIMULATED_NOOP_VERIFIED','SIMULATED_BINDING_RESOLUTION_VERIFIED'])),contract:z.string()}))});
/** Simulation evidence cannot set live maturity. Modified source invalidates its dimensions. */
export function simulationEvidence(){
 try{
  const root=fileURLToPath(new URL('../../',import.meta.url)),proof=proofSchema.parse(JSON.parse(readFileSync(resolve(root,'tests/sharepoint-simulation/certification.json'),'utf8')));
  for(const entry of proof.sourceHashes){
   if(entry.file.includes('..')||!(/^(src\/sharepoint\/|tests\/sharepoint-simulation\/|scripts\/sharepoint-simulate\.mjs$)/.test(entry.file)))return [];
   if(createHash('sha256').update(readFileSync(resolve(root,entry.file))).digest('hex')!==entry.sha256)return [];
  }
  return proof.capabilities;
 }catch{return [];}
}
