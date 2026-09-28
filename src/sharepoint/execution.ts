import {resolveSolution} from '../solution/resolve.js';
import {validateSolutionPlan,type SolutionPlan} from '../solution/plan.js';
import {evidenceSchema,type SolutionEvidence} from '../solution/schema.js';
import {compileSharePoint,spHash,type ResolveIdentity} from './compile.js';
import {identityResolver,projectProperties} from './plan.js';
import {createRequest,updateRequest,viewConfiguration,type SPRequest} from './provider.js';
import {SharePointRequestError} from './http.js';
import type {SPObserved,SPReceipt} from './schema.js';

/** The CLI deliberately does not supply these write ports in V1. Offline provider contract tests do. */
export interface SharePointExecutionPorts {
 mode?:'SHAREPOINT_SIMULATION';
 lock<T>(work:()=>Promise<T>):Promise<T>;
 discover():Promise<SolutionEvidence>;
 journal(event:unknown):Promise<void>;
 seal():Promise<void>;
 dispatch(request:SPRequest):Promise<unknown>;
 readback(resource:string,id:string,resolve:ResolveIdentity):Promise<SPObserved>;
 saveReceipt(receipt:SPReceipt):Promise<void>;
}
export interface SharePointExecutionAuthorization {purpose:'SHAREPOINT_METADATA';planHash:string;targetHash:string;resources:string[];expiresAt:string}
export async function executeSharePoint(plan:SolutionPlan,currentSpec:unknown,ports:SharePointExecutionPorts,authorization:SharePointExecutionAuthorization){
 return ports.lock(async()=>{
  const evidence=evidenceSchema.parse(await ports.discover());
  const observation=evidence.sharepoint?.observation;
  if(!observation?.complete||Date.parse(observation.observedAt)<Date.now()-3600000||Date.parse(observation.observedAt)>Date.now()+60000)throw Error('Fresh complete SharePoint observation required');
  // A newly fetched observation necessarily has a new timestamp. Preserve every semantic
  // fact (including ETags, coverage, auth, target and ownership) in exact-plan attestation.
  const attested=structuredClone(evidence);
  if(attested.sharepoint?.observation&&plan.evidence.sharepoint?.observation)attested.sharepoint.observation.observedAt=plan.evidence.sharepoint.observation.observedAt;
  const checked=validateSolutionPlan(plan,currentSpec,attested,new Date(),plan.flowEvidence);
  if(evidence.sharepoint?.configuration.mode==='SHAREPOINT_SIMULATION'&&ports.mode!=='SHAREPOINT_SIMULATION')throw Error('Synthetic evidence cannot enter production execution');
  const source=resolveSolution(checked.spec).sharepoint;if(!source)throw Error('SharePoint source missing');
  const sp=checked.ir.sharepoint;if(!sp?.fresh||!evidence.sharepoint?.observation?.complete)throw Error('Fresh complete SharePoint observation required');
  const selected=checked.ir.resources.filter(r=>r.subsystem==='sharepoint');
  const changes=selected.filter(r=>r.state==='CREATE'||r.state==='UPDATE').map(r=>r.id).sort();
  if(authorization.purpose!=='SHAREPOINT_METADATA'||authorization.planHash!==checked.contentHash||authorization.targetHash!==spHash(evidence.sharepoint.configuration)||spHash([...authorization.resources].sort())!==spHash(changes)||!Number.isFinite(Date.parse(authorization.expiresAt))||Date.parse(authorization.expiresAt)<=Date.now()||Date.parse(authorization.expiresAt)>Date.parse(checked.expiresAt))throw Error('Exact unexpired SharePoint execution authorization required');
  if(selected.some(r=>['BLOCKED','CONFLICT','UNSUPPORTED','ORPHANED'].includes(r.state)||r.capability.status==='EXTERNAL_BLOCKED')||checked.ir.validation.issues.some(i=>i.severity==='error'&&(!i.resource||i.resource.startsWith('sharepoint.'))))throw Error('SharePoint plan is blocked');
  const resolved:Record<string,{id:string;driveId?:string;webUrl?:string}>={},resolve=identityResolver(source,evidence.sharepoint,resolved);
  const completed:string[]=[];let revision=evidence.sharepoint.ownership?.revision??0;
  for(const key of checked.ir.deploymentOrder){
   const resource=selected.find(r=>r.id===key);if(!resource||!['CREATE','UPDATE'].includes(resource.state))continue;
   const d=compileSharePoint(source,resolve).resources.find(r=>r.id===key)!;
   const operationId='sp-'+spHash({plan:checked.contentHash,resource:key,definition:resource.definitionHash}).slice(0,24);
   const observed=evidence.sharepoint.observation.resources.find(r=>r.id===resource.existingId);
   const request=resource.state==='CREATE'?createRequest(d,source,resolve):updateRequest(d,source,resolve,resource.existingId!,observed?.etag??'');
   await ports.journal({operationId,planHash:checked.contentHash,resource:key,risk:d.risk,method:request.method,surface:request.surface,status:'STARTED',mutationState:'UNKNOWN'});
   let remoteId=resource.existingId;let responseConfirmed=false;
   try{
    const response=await ports.dispatch(request) as {id?:string;Id?:string}|null;
    responseConfirmed=true;remoteId??=response?.id??response?.Id;if(!remoteId)throw Error('Mutation response lacks stable identity; reconcile before retry');
    await ports.journal({operationId,resource:key,status:'REMOTE_SUCCEEDED',remoteId});
    if(d.kind==='view'&&resource.state==='CREATE'){
     await ports.journal({operationId,resource:key,status:'VIEW_CONFIGURATION_STARTED',remoteId});await ports.dispatch(viewConfiguration(d,source,resolve,remoteId));
    }
    const readback=await ports.readback(key,remoteId,resolve);
    if(readback.id!==remoteId||readback.siteId!==resolve('sharepoint.site:'+d.site).id||readback.parentId!==resolve(d.parent).id||spHash(projectProperties(readback.properties,d.properties))!==spHash(d.properties))throw Error('Independent provider readback mismatch');
    if(d.kind==='library'&&(!readback.driveId||readback.driveListId!==readback.id))throw Error('Library dual identity missing');
    const receipt:SPReceipt={resource:key,id:remoteId,siteId:readback.siteId,parentId:readback.parentId,sourceHash:resource.definitionHash,operationId,revision:++revision,baseline:readback.properties,readbackHash:spHash(readback),...(readback.etag?{etag:readback.etag}:{})};
    await ports.saveReceipt(receipt);resolved[key]={id:remoteId,...(readback.driveId?{driveId:readback.driveId}:{}),...(readback.webUrl?{webUrl:readback.webUrl}:{})};
    completed.push(key);await ports.journal({operationId,resource:key,status:'VERIFIED',receiptHash:spHash(receipt)});
   }catch(error){
    const unknown=!!remoteId||!(error instanceof SharePointRequestError)||error.uncertain;
    await ports.journal({operationId,resource:key,status:unknown?'UNKNOWN_OUTCOME':'CONFIRMED_FAILURE',remoteId:remoteId??null,retry:false});await ports.seal();
    const reconciliation=await ports.discover().then(value=>({status:'OBSERVED',hash:spHash(value)}),()=>({status:'INCOMPLETE',hash:null}));
    return {status:completed.length||unknown?'PARTIALLY_APPLIED':'BLOCKED',completed,stopped:key,unknownOutcome:unknown,outcome:responseConfirmed&&remoteId?'CREATED_UNVERIFIED':unknown?'UNKNOWN_OUTCOME':'CREATE_REJECTED',reconciliation,retry:false,rollback:false};
   }
  }
  await ports.seal();return {status:completed.length?'APPLIED_REQUIRES_FRESH_NO_OP':'NO_OP',completed,retry:false,rollback:false};
 });
}
