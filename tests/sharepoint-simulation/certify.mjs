import {setTimeout as wait} from 'node:timers/promises';
import {URL} from 'node:url';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createLab,guid,siteUrl,siteId,tenantId} from './service.mjs';
import {SharePointHttp} from '../../dist/sharepoint/http.js';
import {discoverSharePoint} from '../../dist/sharepoint/discovery.js';
import {compileSharePoint,spHash,canonicalQuery} from '../../dist/sharepoint/compile.js';
import {readback} from '../../dist/sharepoint/provider.js';
import {executeSharePoint} from '../../dist/sharepoint/execution.js';
import {sharepointSchema,spTargetSchema} from '../../dist/sharepoint/schema.js';
import {planSharePoint} from '../../dist/sharepoint/plan.js';
import {sharePointBindingContracts,hydrateSharePointFlows,canvasSharePointSources} from '../../dist/sharepoint/bindings.js';
import {resolveSolution} from '../../dist/solution/resolve.js';
import {solutionPlan} from '../../dist/solution/plan.js';
import {compileFlows} from '../../dist/flows/compile.js';

const benchmark=name=>readFile(new URL('../../examples/solutions/sharepoint-v1/'+name+'.json',import.meta.url),'utf8').then(JSON.parse);
const semantics=o=>spHash({...o,observedAt:'VOLATILE'});
export function transport(lab,readOnly=true,realDelay=false){
 const delays=[],credentials=[];
 const source={acquire:async request=>{credentials.push({audience:request.audience,scopes:request.scopes});return {value:'SIMULATION_ONLY_NOT_A_REAL_TOKEN',tenantId,audience:request.audience,scopes:request.scopes,expiresAt:new Date(Date.now()+3600000)};}};
 const make=(surface,ids=[],drives=[])=>new SharePointHttp(surface,siteUrl,tenantId,source,lab.fetcher,{simulation:true,readOnly,siteIds:ids,driveIds:drives,sleep:async ms=>{delays.push(ms);if(realDelay)await wait(ms);}});
 return {delays,credentials,make,ports:{graph:(_url,id,drives)=>make('Graph',id?[id]:[],drives),rest:()=>make('SharePoint REST')}};
}
function target(){return spTargetSchema.parse({mode:'SHAREPOINT_SIMULATION',tenantId,environment:'SHAREPOINT_SIMULATION',sites:{OperationsSite:{url:siteUrl,expectedSiteId:siteId}},resources:{}});}
function bound(raw,lab){
 const r=resolveSolution(raw),spec={apiVersion:'powercanvas.solution/v1',mode:'explicit',project:r.project,requirements:r.requirements,sharepoint:r.sharepoint,unsupportedNeeds:r.spec.unsupportedNeeds};const config=target();
 for(const [kind,record]of [['list',spec.sharepoint.lists],['library',spec.sharepoint.libraries]])for(const [key,value]of Object.entries(record)){
  const row=lab.state.lists.find(l=>l.displayName===value.displayName);assert(row,'Fixture missing '+value.displayName);value.binding=kind+'_'+key;config.resources[value.binding]={site:value.site,id:row.id};
 }
 return {spec,config,s:sharepointSchema.parse(spec.sharepoint)};
}
export async function certify(){
 const cases=[],endpoints=[],bundles={},allTraces=[];const record=(name,detail={})=>{cases.push({name,pass:true,...detail});};
 const capture=lab=>{allTraces.push(...lab.trace);endpoints.push(...lab.trace.map(({method,url,status,blocked})=>({method,url,status,blocked})));lab.assertIsolated();};
 for(const [name,profile]of [['team-request-tracker','team'],['document-approval','documents'],['contract-library','documents']]){
  const lab=await createLab(profile);try{
   const x=bound(await benchmark(name),lab);if(name==='team-request-tracker')x.s.permissions={boundary:{target:'sharepoint.list:requests',inheritance:'inherit',assignments:[]}};
   x.spec.sharepoint=x.s;const cycles=[];
   for(let cycle=0;cycle<3;cycle++){
    const t=transport(lab),observation=await discoverSharePoint(x.s,x.config,t.ports,undefined,{inspect:true});const evidence={sharepoint:{configuration:x.config,observation}};const plan=solutionPlan(x.spec,evidence);
    assert(observation.complete);assert.equal(observation.auth.graph,'HEALTHY');assert.equal(observation.auth.rest,'HEALTHY');assert(observation.details.siteCorrelation.every(v=>v.status==='MATCH'));
    assert(t.credentials.some(c=>c.audience==='https://graph.microsoft.com'));assert(t.credentials.some(c=>c.audience===new URL(siteUrl).origin));
    cycles.push({cycle:cycle+1,observation,semanticHash:semantics(observation),planSemanticHash:spHash(plan.ir.resources.map(r=>({id:r.id,state:r.state,dependencies:r.dependencies,definitionHash:r.definitionHash}))),plan});
   }
   assert.equal(new Set(cycles.map(c=>c.semanticHash)).size,1);assert.equal(new Set(cycles.map(c=>c.planSemanticHash)).size,1);
   const last=cycles.at(-1),contracts=sharePointBindingContracts(x.s,{configuration:x.config,observation:last.observation});assert(Object.values(contracts).every(c=>c.resolved));
   if(name==='team-request-tracker'){
    const canvas=canvasSharePointSources(x.s,{configuration:x.config,observation:last.observation});assert.equal(canvas.requests.requests.columns.status.name,'status');
    const flow=hydrateSharePointFlows(resolveSolution(x.spec).project,x.s,{configuration:x.config,observation:last.observation});const compiled=compileFlows(flow.project);assert(compiled.flows.notify);bundles['canvas-binding']=canvas;bundles['flow-binding']={contract:contracts,compiled:compiled.flows.notify};record('canvas-binding');record('flow-binding');
    if(name==='document-approval'){assert(last.plan.ir.validation.blockers.some(b=>b.resource==='need:generatedPdf'));record('document-pdf-blocker-preserved');}
   assert(last.observation.details.columns.some(c=>c.name==='requester'&&c.personOrGroup.chooseFromType==='peopleOnly'));record('person-single');
    if(name==='document-approval'){assert(last.plan.ir.validation.blockers.some(b=>b.resource==='need:generatedPdf'));record('document-pdf-blocker-preserved');}
   assert(last.observation.details.columns.some(c=>c.lookup?.listId===guid(10)));record('lookup-identity');
    assert(last.observation.details.permissions[0].inherits);record('inherited-permissions');
   }
   if(name==='contract-library'){
    assert(last.observation.resources.some(r=>r.kind==='library'&&r.driveListId===r.id&&r.driveId));record('library-dual-identity');
    assert(last.observation.resources.some(r=>r.kind==='contentTypeColumn'));record('content-type-links');
    assert(last.observation.resources.some(r=>r.kind==='contentTypeBinding'));record('content-type-attachment');
    if(name==='document-approval'){assert(last.plan.ir.validation.blockers.some(b=>b.resource==='need:generatedPdf'));record('document-pdf-blocker-preserved');}
   assert(last.observation.details.columns.some(c=>c.name==='ContractNumber'&&c.displayName==='Contract number'));record('internal-display-name');
    const project=resolveSolution(await benchmark('team-request-tracker')).project;
    const action=project.resources.flows.notify.actions[0];action.metadata='Contracts';action.site={op:'sharepointResource',name:'sharepoint.library:Contracts',path:['siteUrl']};action.list={op:'sharepointResource',name:'sharepoint.library:Contracts',path:['listId']};
    project.resources.flows.notify.actions=[action,project.resources.flows.notify.actions[1],{name:'LibraryIdentity',use:'data.object',fields:{drive:{op:'sharepointResource',name:'sharepoint.library:Contracts',path:['driveId']}}}];
    const libraryFlow=hydrateSharePointFlows(project,x.s,{configuration:x.config,observation:last.observation});const compiled=compileFlows(libraryFlow.project);assert(compiled.flows.notify);
    assert.equal(libraryFlow.project.resources.flows.notify.actions[2].fields.drive.value,contracts['sharepoint.library:Contracts'].driveId);
    bundles['library-flow-contract']={contracts,compiled:compiled.flows.notify};record('library-flow-reference');
   }
   if(name==='document-approval'){assert(last.plan.ir.validation.blockers.some(b=>b.resource==='need:generatedPdf'));record('document-pdf-blocker-preserved');}
   assert(last.observation.details.columns.some(c=>c.name==='Title'&&c.classification==='PLATFORM_DEFAULT'));record(name+'-platform-fields');
   assert(lab.trace.some(t=>t.url.includes('$skiptoken=page2')));record(name+'-pagination');record(name+'-three-cycles',{cycles:3});
   bundles[name]={cycles,contracts,contractTrace:lab.trace};capture(lab);
  }finally{await lab.close();}
 }
 // Edge profile: explicit stable binding selects one of duplicate names, not a display-name match.
 {
  const lab=await createLab('edge');try{
   const config=target();config.resources.Request={site:'operations',id:guid(70)};
   const s=sharepointSchema.parse({sites:{operations:{binding:'OperationsSite'}},lists:{Requests:{site:'operations',displayName:'Requests',binding:'Request'}},columns:{Tags:{parent:'sharepoint.list:Requests',internalName:'Tags',displayName:'Tags',type:'multiChoice',choices:['Red','Blue']},Reviewers:{parent:'sharepoint.list:Requests',internalName:'Reviewers',displayName:'Reviewers',type:'multiPerson',selection:'peopleAndGroups'}},permissions:{access:{target:'sharepoint.list:Requests',inheritance:'unique',assignments:[]}}});
   const observation=await discoverSharePoint(s,config,transport(lab).ports,undefined,{inspect:true});const edgeCycles=[observation];for(let cycle=1;cycle<3;cycle++)edgeCycles.push(await discoverSharePoint(s,config,transport(lab).ports,undefined,{inspect:true}));assert.equal(new Set(edgeCycles.map(semantics)).size,1);record('edge-three-cycles',{cycles:3});assert(observation.details.lists.some(l=>l.classification==='SYSTEM'));record('system-list-classification');
   assert(observation.details.columns.some(c=>c.personOrGroup?.allowMultipleSelection&&c.personOrGroup.chooseFromType==='peopleAndGroups'));record('person-multiple-groups');
   assert.deepEqual(observation.resources.find(r=>r.resource==='sharepoint.column:Tags').properties.choice.choices,['Red','Blue']);record('ordered-multichoice');
   const permission=observation.details.permissions[0];assert.equal(permission.inherits,false);assert.deepEqual(permission.classic[0].roleDefinitionIds,[1073741826]);assert(!JSON.stringify(permission).includes('@'));assert(permission.graph[0].identityKinds.includes('application'));record('distinct-permissions-private');
   delete s.lists.Requests.binding;await assert.rejects(discoverSharePoint(s,config,transport(lab).ports),/CONFLICT/);record('duplicate-name-conflict');
   const p=planSharePoint(s,guid(99),{configuration:config,observation});assert(p.resources.some(r=>r.kind==='sharepoint.permissionBoundary'&&r.state==='UNSUPPORTED'));record('permission-writes-blocked');
   bundles.edge={observation,cycles:edgeCycles};capture(lab);
  }finally{await lab.close();}
 }
 // Semantic XML equivalence includes attribute order, formatting and whitespace, not changed values.
 const q='<OrderBy><FieldRef Name="Expiry" Ascending="TRUE"/></OrderBy>';
 assert.deepEqual(canonicalQuery(q),canonicalQuery('<OrderBy>\n <FieldRef Ascending="TRUE" Name="Expiry" />\n</OrderBy>'));assert.notDeepEqual(canonicalQuery(q),canonicalQuery(q.replace('TRUE','FALSE')));record('caml-equivalence-and-drift');
 for(const scenario of ['wrong-site','wrong-drive','missing-lookup','missing-attachment','wrong-attachment','missing-binding','page-failure']){
  const lab=await createLab(scenario==='missing-lookup'?'team':'documents',{wrongWeb:scenario==='wrong-site'});try{
   const x=bound(await benchmark(scenario==='missing-lookup'?'team-request-tracker':'contract-library'),lab);
   if(scenario==='wrong-drive')lab.state.lists.find(l=>l.displayName==='Contracts').drive.sharepointIds.listId=guid(999);
   if(scenario==='missing-lookup')lab.state.lists.find(l=>l.displayName==='Requests').columns.find(c=>c.lookup).lookup.listId=guid(999);
   if(scenario==='missing-binding')x.config.resources.library_Contracts.id=guid(999);
   if(scenario==='missing-attachment')lab.state.lists.find(l=>l.displayName==='Contracts').contentTypes=[];
   if(scenario==='wrong-attachment')lab.state.lists.find(l=>l.displayName==='Contracts').contentTypes[0].inheritedFrom.id='0x010100FFFF';
   if(scenario==='page-failure')lab.faults.push({matches:u=>u.searchParams.has('$skiptoken'),status:503,remaining:99});
   if(scenario==='missing-attachment'){const o=await discoverSharePoint(x.s,x.config,transport(lab).ports,undefined,{inspect:true});assert(!o.resources.some(r=>r.kind==='contentTypeBinding'));}
   else await assert.rejects(discoverSharePoint(x.s,x.config,transport(lab).ports,undefined,{inspect:true}),scenario==='wrong-attachment'?/CONTENT_TYPE_SOURCE_MISMATCH/:scenario==='wrong-site'?/SITE_TARGET_MISMATCH/:scenario==='wrong-drive'?/LIBRARY_IDENTITY_MISMATCH/:scenario==='missing-lookup'?/BLOCKED/:scenario==='missing-binding'?/BOUND_RESOURCE_MISSING/:/503/);
   record(scenario,{outcome:scenario==='page-failure'?'PARTIAL_OBSERVATION':scenario==='missing-attachment'?'MISSING_SOURCE_IDENTITY':'BLOCKED'});capture(lab);
  }finally{await lab.close();}
 }
 for(const status of [403,404,429,500,502,503,504,'socket-drop']){
  const lab=await createLab();try{lab.faults.push({matches:()=>true,status,remaining:1});const t=transport(lab),h=t.make('Graph');const path='/sites/powercanvas-simulation.sharepoint.com:/sites/PowerCanvasProviderLab';
   if(status===403||status===404){await assert.rejects(h.request(path));assert.equal(lab.trace.length,1);}else{assert.equal((await h.request(path)).id,siteId);assert.equal(lab.trace.length,2);assert.deepEqual(t.delays,[status===429?2000:1000]);}
   record('GET-'+status,{attempts:lab.trace.length,scheduledDelays:t.delays,transportFault:status==='socket-drop'?'SOCKET_RESET_FROM_LOCAL_SERVER':null});capture(lab);
  }finally{await lab.close();}
 }
 for(const mode of ['success','accepted-drop','reject-400','postcondition']){
  const lab=await createLab('empty',{writeFailure:mode});try{
   const original=await benchmark('contract-library');const spec={apiVersion:original.apiVersion,mode:'explicit',project:original.project,requirements:[{id:'REQ-cert',statement:'Synthetic provider certification',concerns:['data'],resources:['sharepoint.list:Certification']}],sharepoint:{sites:{operations:{binding:'OperationsSite'}},lists:{Certification:{site:'operations',displayName:'PowerCanvas Certification'}},columns:{Summary:{parent:'sharepoint.list:Certification',internalName:'Summary',displayName:'Summary',type:'text'},Status:{parent:'sharepoint.list:Certification',internalName:'Status',displayName:'Status',type:'choice',choices:['Draft','Active']},Due:{parent:'sharepoint.list:Certification',internalName:'Due',displayName:'Due',type:'date'}}}};
   const s=sharepointSchema.parse(spec.sharepoint),configuration=target(),ownership={projectId:original.project.project.id,targetHash:spHash(configuration),revision:0,receipts:[]},events=[];
   const observe=async()=>({sharepoint:{configuration,ownership:globalThis.structuredClone(ownership),observation:await discoverSharePoint(s,configuration,transport(lab).ports,ownership,{inspect:true})}});
   const before=await observe();const plan=solutionPlan(spec,before);const writer=transport(lab,false);
   const ports={mode:'SHAREPOINT_SIMULATION',lock:async work=>work(),discover:observe,journal:async e=>events.push(e),seal:async()=>events.push({sealed:true}),dispatch:req=>writer.make(req.surface,[siteId]).request(req.path,req.method,req.body,req.headers),readback:async(key,id,resolve)=>{
    const d=compileSharePoint(s,resolve).resources.find(r=>r.id===key),path='/sites/'+encodeURIComponent(siteId)+'/lists/'+(d.kind==='list'?id:encodeURIComponent(resolve(d.parent).id)+'/columns/'+id);return readback(d,await transport(lab).make('Graph',[siteId]).request(path),resolve);
   },saveReceipt:async r=>{ownership.receipts.push(r);ownership.revision=r.revision;}};
   const auth={purpose:'SHAREPOINT_METADATA',planHash:plan.contentHash,targetHash:spHash(configuration),resources:plan.ir.resources.filter(r=>r.subsystem==='sharepoint'&&r.state==='CREATE').map(r=>r.id),expiresAt:plan.expiresAt};
   if(mode==='success'){await assert.rejects(executeSharePoint(plan,spec,{...ports,mode:undefined},auth),/Synthetic evidence/);record('synthetic-evidence-production-blocked');}
   if(mode==='etag-changed'){
    const originalDiscover=ports.discover;ports.discover=async()=>{const e=await originalDiscover();e.sharepoint.observation.details.lists.push({id:guid(998),eTag:'"B"'});return e;};await assert.rejects(executeSharePoint(plan,spec,ports,auth),/STALE|DEPENDENCY_CHANGED/);assert.equal(lab.effects.lists,0);record('execution-attestation-changed');
   }else{
    const result=await executeSharePoint(plan,spec,ports,auth);const after=await observe(),final=solutionPlan(spec,after);
    if(mode==='success'){assert.equal(result.status,'APPLIED_REQUIRES_FRESH_NO_OP');assert.equal(ownership.receipts.length,4);assert.equal(final.ir.resources.filter(r=>r.state==='NO_OP').length,4);assert.equal(lab.effects.lists,1);assert.equal(lab.effects.columns,3);record('create-readback-noop');bundles['simulated-final-plan']=final;
     const changed=globalThis.structuredClone(spec);changed.sharepoint.lists.Certification.displayName='PowerCanvas Certification revised';const updatePlan=solutionPlan(changed,after);assert.equal(updatePlan.ir.resources.filter(r=>r.state==='UPDATE').length,1);
     const writeCount=lab.trace.filter(t=>t.method!=='GET').length;lab.state.lists[0].eTag='"2"';
     await assert.rejects(executeSharePoint(updatePlan,changed,ports,{...auth,planHash:updatePlan.contentHash,resources:['sharepoint.list:Certification'],expiresAt:updatePlan.expiresAt}),/STALE/);assert.equal(lab.trace.filter(t=>t.method!=='GET').length,writeCount);record('etag-attestation-blocks',{outcome:'DEPENDENCY_CHANGED'});}
    else{assert.equal(ownership.receipts.length,0);assert.equal(lab.effects.columns,0);assert.equal(lab.trace.filter(t=>t.method==='POST').length,1);if(mode==='accepted-drop'){assert.equal(lab.effects.lists,1);assert.equal(result.reconciliation.status,'OBSERVED');assert.equal(final.ir.resources.find(r=>r.id==='sharepoint.list:Certification').state,'CONFLICT');}assert.equal(result.outcome,mode==='accepted-drop'?'UNKNOWN_OUTCOME':mode==='reject-400'?'CREATE_REJECTED':'CREATED_UNVERIFIED');record(mode,{outcome:result.outcome});}
    bundles['execution-'+mode]={result,events,receipts:ownership.receipts,effects:lab.effects,after};
   }capture(lab);
  }finally{await lab.close();}
 }
 {
  const lab=await createLab('empty');try{const t=transport(lab,false),h=t.make('Graph',[siteId]);
   await assert.rejects(h.request('/sites/'+siteId+'/not-modeled'));assert.equal(lab.trace.filter(t=>t.blocked).length,3);record('unmocked-blocked');
   const count=lab.trace.length;await assert.rejects(h.request('/sites/'+siteId+'/lists/id','DELETE'));assert.equal(lab.trace.length,count);record('delete-never-dispatched');
   await assert.rejects(h.request('/sites/'+siteId+'/lists/id','PATCH',{}, {'If-Match':'"1"'}));assert.equal(lab.trace.length,count+1);record('patch-no-retry');
   await assert.rejects(h.request('/sites/'+siteId+'/lists/id/items'));assert.equal(lab.trace.length,count+1);record('business-content-blocked');capture(lab);
  }finally{await lab.close();}
 }
 assert.throws(()=>spTargetSchema.parse({...target(),mode:undefined}),/Simulation/);record('simulation-config-isolated');
 assert.throws(()=>new SharePointHttp('Graph',siteUrl,tenantId,{}),/isolated/);record('simulation-transport-isolated');
 {
  const lab=await createLab();try{const original=lab.fetcher;let calls=0;lab.fetcher=async(...args)=>{if(calls++===0)throw Object.assign(Error('simulated connect timeout'),{code:'UND_ERR_CONNECT_TIMEOUT'});return original(...args);};const t=transport(lab);await t.make('Graph').request('/sites/powercanvas-simulation.sharepoint.com:/sites/PowerCanvasProviderLab');assert.equal(calls,2);assert.deepEqual(t.delays,[1000]);record('GET-connect-timeout',{attempts:calls,scheduledDelays:t.delays});capture(lab);}finally{await lab.close();}
 }
 {
  const lab=await createLab();try{lab.faults.push({matches:()=>true,status:429,remaining:1});const t=transport(lab,true,true);await t.make('Graph').request('/sites/powercanvas-simulation.sharepoint.com:/sites/PowerCanvasProviderLab');assert(lab.trace[1].at-lab.trace[0].at>=1950);record('retry-after-wall-clock',{scheduledMs:2000,elapsedMs:lab.trace[1].at-lab.trace[0].at});capture(lab);}finally{await lab.close();}
 }
 record('no-live-traffic',{realSharePointCalls:0,realSharePointWrites:0,realBusinessData:0});
 return {mode:'SHAREPOINT_SIMULATION',cases,bundles,endpoints,traces:allTraces,liveRead:'EXTERNAL_ACCOUNT_BLOCKED',liveWrite:'EXTERNAL_ACCOUNT_BLOCKED'};
}

export async function certifyProxy(fetcher,name){
 const lab=await createLab(name==='team-request-tracker'?'team':'documents');try{
  lab.fetcher=fetcher;const x=bound(await benchmark(name),lab),cycles=[];
  for(let i=0;i<3;i++){const t=transport(lab),o=await discoverSharePoint(x.s,x.config,t.ports,undefined,{inspect:true});const p=solutionPlan(x.spec,{sharepoint:{configuration:x.config,observation:o}});cycles.push({observationHash:semantics(o),planHash:spHash(p.ir.resources),resources:o.resources.length});}
  assert.equal(new Set(cycles.map(c=>c.observationHash)).size,1);assert.equal(new Set(cycles.map(c=>c.planHash)).size,1);
  await assert.rejects(transport(lab).make('Graph',[siteId]).request('/sites/'+siteId+'/unmocked'),/502/);
  await assert.rejects(transport(lab).make('SharePoint REST').request('/web/unmocked'),/502/);
  return {profile:name,cycles,unmockedGraph:'BLOCKED',unmockedRest:'BLOCKED',Graph:'SIMULATED_HEALTHY',SharePointRest:'SIMULATED_HEALTHY'};
 }finally{await lab.close();}
}
