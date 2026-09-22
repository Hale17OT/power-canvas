import {hashJson, type JsonInput} from '../core/json.js';
import {VERSION} from '../core/version.js';
import {desiredResources} from '../dataverse/desired.js';
import {modelResources} from '../model-driven/desired.js';
import {createPlan} from '../planner/dataverse.js';
import {compileFlows} from '../flows/compile.js';
import {dependencyGraph,flattenActions} from '../flows/safety.js';
import {actionRegistry, responsibility} from '../flows/registry.js';
import {recipeRegistry} from '../flows/recipes.js';
import {providers} from '../flows/providers.js';
import {compileCanvas} from '../canvas/compile.js';
import {planDesign} from '../canvas/taste/decisions.js';
import {createCompositionIR, validateCompositionIR} from '../canvas/composition-ir.js';
import {compileDesignCandidate} from '../canvas/taste/generation.js';
import {patternCatalog} from '../canvas/patterns.js';
import {componentEvidence} from '../canvas/taste/catalog.js';
import {capabilities} from '../providers/capabilities.js';
import {conceptualType, resolveSolution, storageDecision} from './resolve.js';
import {evidenceSchema, sharedTypes, stages, type CapabilityResolution, type Issue, type ResourceIR, type SolutionEvidence, type Stage} from './schema.js';
import {sharedTypeRegistry} from './types.js';

export const digest=(v:unknown)=>hashJson(v as JsonInput);
export function capabilityFingerprint(){return digest({version:VERSION,solutionContract:1,sharedTypes,sharedTypeRegistry,capabilities,actions:actionRegistry,recipes:recipeRegistry,providers,components:patternCatalog().map(p=>({name:p.name,evidence:componentEvidence(p.name)}))});}
export function orderResources(resources:Pick<ResourceIR,'id'|'dependencies'>[]){
 const remaining=new Map(resources.map(r=>[r.id,r]));if(remaining.size!==resources.length)throw new Error('Duplicate resource identity');
 const result:string[]=[];
 for(const r of resources)for(const dep of r.dependencies)if(!remaining.has(dep))throw new Error(`Missing dependency ${dep} required by ${r.id}`);
 while(remaining.size){const ready=[...remaining.values()].filter(r=>r.dependencies.every(d=>result.includes(d))).sort((a,b)=>a.id.localeCompare(b.id));if(!ready.length)throw new Error('Cyclic solution resource graph: '+[...remaining.keys()].join(', '));for(const r of ready){result.push(r.id);remaining.delete(r.id);}}
 return result;
}
function capability(subsystem:ResourceIR['subsystem']):CapabilityResolution {
 const compile=!['security','unsupported'].includes(subsystem);return {status:subsystem==='unsupported'?'PLANNED':subsystem==='external'?'EXTERNAL_BLOCKED':'COMPILE_ONLY',schema:true,compile,deploy:false,runtime:false,production:false,limitations:subsystem==='canvas'?['Native apply requires current authoring session, pinned application, source preservation and certification.']:subsystem==='security'?['Run-only/persona authorization unproven; connector authorization is not business authorization.']:['Offline compilation is not target deployment or runtime proof.']};
}
export function compileSolution(raw:unknown,rawEvidence:unknown={},now=new Date()){
 const resolved=resolveSolution(raw);const {spec,project,requirements,products}=resolved;const evidence=evidenceSchema.parse(rawEvidence);
 const issues:Issue[]=[...resolved.issues];const resources:ResourceIR[]=[];
 const add=(id:string,kind:string,subsystem:ResourceIR['subsystem'],stage:Stage,definition:unknown,dependencies:string[]=[],physicalName:string|null=null,nativeId?:string)=>{
  const r:ResourceIR={id,kind,subsystem,stage,definition,definitionHash:digest(definition),physicalName,dependencies:[...new Set(dependencies)].sort(),requiredBy:requirements.filter(r=>r.resources.includes(id)).map(r=>r.id),ownership:'UNKNOWN',state:subsystem==='external'?'EXTERNAL':subsystem==='unsupported'?'UNSUPPORTED':'BLOCKED',reason:'Fresh target-bound subsystem discovery/plan required.',capability:capability(subsystem),...(nativeId?{nativeId}:{})};resources.push(r);return r;
 };
 const desired=[...desiredResources(project),...modelResources(project)];
 const ids=new Map(desired.map(d=>[d.resourceId,d.kind+':'+d.resourceId.split(':').at(-1)!.replaceAll('/', '.')]));
 for(const d of desired)add(ids.get(d.resourceId)!,d.kind,d.provider==='model-driven'?'security':'dataverse','DATA',d.properties,d.dependencies.map(v=>ids.get(v)??v),d.schemaName,d.resourceId);
 // Column resources inherit the table's requirement; dependencies themselves propagate in the opposite direction below.
 for(const r of resources.filter(r=>r.kind==='column'))r.requiredBy=[...(resources.find(t=>t.id===r.dependencies[0])?.requiredBy??[])];
 for(const [key,p]of Object.entries(products))if(!project.canvasApps?.[key])issues.push({code:'PRODUCT_WITHOUT_APP',severity:'error',resource:'canvas:'+key,message:'Product context has no declared Canvas app: '+p.name});
 const canvasPlans:Record<string,unknown>={};
 for(const [key,app]of Object.entries(project.canvasApps??{})){
  const sources=[...new Set(Object.values(app.screens).flatMap(s=>'source'in s?['table:'+s.source]:[]))];
  if(spec.mode==='intent'&&spec.experiences[key])sources.push('table:'+spec.experiences[key].source);
  const r=add('canvas:'+key,'canvas','canvas','APPLICATION',app,['solution:solution',...sources],app.uniqueName);
  if(app.application?.existingAppId)r.existingId=app.application.existingAppId;
  try{
   const product=products[key]??app.nativeDesign?.product;
   if(product){const decisions=planDesign(product);const composition=createCompositionIR(decisions,spec.profile);const validated=validateCompositionIR(composition,decisions);const candidate=app.nativeDesign?compileDesignCandidate(decisions,app.nativeDesign.host,app.theme.mode,composition):undefined;canvasPlans[key]={decisions,composition,resolutions:validated.resolved,sameAppDevices:product.devices,...(candidate?{candidate}:{}),sourceGeneration:'Existing taste generate / compileNativeCanvas with an explicit host and live bindings'};if(candidate?.host.fixture)r.capability.limitations.push('Fixture host: source preview only. Business save/bindings are not implemented by this fixture.');}
   if(!app.nativeDesign)compileCanvas(project,key);
  }catch(error){r.capability.compile=false;r.capability.status='BLOCKED';issues.push({code:'CANVAS_VALIDATION',severity:'error',resource:r.id,message:error instanceof Error?error.message:'Canvas validation failed'});}
 }
 let compiled:ReturnType<typeof compileFlows>|undefined;
 try{compiled=compileFlows(project);}catch(error){issues.push({code:'FLOW_COMPILE',severity:'error',message:error instanceof Error?error.message:'Flow compilation failed'});}
 const flowResources=compiled?.resources??project.resources;
 if(flowResources){
  for(const [key,value]of Object.entries(flowResources.connectionReferences))add('connection:'+key,'connection','configuration','CONFIGURATION',value,['solution:solution'],value.logicalName);
  for(const [key,value]of Object.entries(flowResources.environmentVariables))add('environment:'+key,'environmentVariable','configuration','CONFIGURATION',value,['solution:solution'],value.logicalName);
  for(const [key,value]of Object.entries(flowResources.flows)){
   const r=add('flow:'+key,'flow','flows','AUTOMATION',value,['solution:solution'],value.logicalName);
   r.capability.compile=!!compiled?.flows[key];if(!r.capability.compile)r.capability.status='BLOCKED';
  }
  // Recipe compiler errors must not erase the requested business resources.
  for(const [key,value]of Object.entries(project.resources?.workflowRecipes??{}))if(!resources.some(r=>r.id==='flow:'+key)){const r=add('flow:'+key,'recipe','flows','AUTOMATION',value,['solution:solution'],value.flow.logicalName);r.capability.compile=false;r.capability.status='BLOCKED';}
  for(const [key,value]of Object.entries(flowResources.documentTemplates??{}))add('template:'+key,'documentTemplate','external','CONFIGURATION',value);
  for(const [key,value]of Object.entries(flowResources.flowDataSources??{})){
   const table=Object.entries(project.dataverse.tables).find(([k,t])=>k===value.table||t.schemaName.toLowerCase()===(value.logicalName??value.table).toLowerCase());
   add('metadata:'+key,'flowMetadata',table?'configuration':'external','CONFIGURATION',value,table?['table:'+table[0]]:[]);
   if(table)for(const [col,shape]of Object.entries(value.columns)){const field=Object.values(table[1].columns).find(c=>c.schemaName.toLowerCase()===col);if(field){const t=conceptualType(field);if(shape.shape.type!==t&&!(t==='decimal'&&shape.shape.type==='number')&&!(t==='choice'&&shape.shape.type==='integer'))issues.push({code:'CROSS_TYPE_MISMATCH',severity:'error',resource:'metadata:'+key,message:`${col}: Dataverse ${t} differs from flow ${shape.shape.type}`});}}
  }
  const g=dependencyGraph(flowResources);
  const mapId=(id:string)=>{if(id.startsWith('table:')){const key=id.slice(6);const pair=Object.entries(project.dataverse.tables).find(([k,t])=>k===key||t.schemaName.toLowerCase()===key.toLowerCase());if(pair)return 'table:'+pair[0];}return id;};
  for(const node of g.nodes){const id=mapId(node.id);if(!resources.some(r=>r.id===id)&&node.kind==='table')add(id,'externalTable','external','DATA',{logicalName:node.id.slice(6)});}
  for(const edge of g.edges){const r=resources.find(r=>r.id===mapId(edge.from));if(r&&!r.dependencies.includes(mapId(edge.to)))r.dependencies.push(mapId(edge.to));}
  for(const [key,flow]of Object.entries(flowResources.flows)){const r=resources.find(r=>r.id==='flow:'+key)!;const metadata=[...flattenActions(flow.actions).flatMap(a=>a.metadata?['metadata:'+a.metadata]:[]),...(flow.trigger.type==='dataverse'?['metadata:'+flow.trigger.metadata]:[])];for(const m of metadata)if(!r.dependencies.includes(m))r.dependencies.push(m);}
  for(const b of flowResources.canvasBindings)add('binding:'+b.app+'.'+b.alias,'canvasFlowBinding','configuration','BINDINGS',b,['canvas:'+b.app,'flow:'+b.flow]);
 }
 for(const e of spec.externalDependencies){const r=add('external:'+e.id,e.kind,'external','CONFIGURATION',e);r.requiredBy=e.requiredBy;r.ownership='EXTERNAL';r.reason=e.resolutionState==='verified'?'Explicit external identity/evidence; not solution-contained.':'External identity/provisioning unresolved.';if(e.resolutionState==='verified')r.capability.status='SUPPORTED_WITH_LIMITS';}
 for(const external of resources.filter(r=>r.id.startsWith('external:')))for(const consumer of resources.filter(r=>['flows','canvas'].includes(r.subsystem)&&r.requiredBy.some(id=>external.requiredBy.includes(id))))consumer.dependencies.push(external.id);
 for(const s of spec.security){const r=add('security:'+s.id,'security','security','VALIDATION',s,s.resources);r.requiredBy=s.requiredBy;r.reason='Security is a manual prerequisite; no unified grants executor.';}
 for(const n of spec.unsupportedNeeds){const r=add('need:'+n.id,n.capability,'unsupported','VALIDATION',n);r.requiredBy=n.requiredBy;r.reason=n.reason;issues.push({code:'UNSUPPORTED_NEED',severity:'error',resource:r.id,message:n.reason});}
 for(const i of issues.filter(i=>i.code==='EXTERNAL_PROVISIONING'))if(i.resource&&!resources.some(r=>r.id===i.resource))add(i.resource,'externalList','external','DATA',{reason:i.message});
 const references=spec.references.map(ref=>{
  const target=resources.find(r=>r.id===ref.to.resource);const from=resources.find(r=>r.id===ref.from);
  if(!target||!from)issues.push({code:'UNRESOLVED_REFERENCE',severity:'error',resource:ref.from,message:'Unknown logical resource '+ref.to.resource});
  if(from&&!from.dependencies.includes(ref.to.resource))from.dependencies.push(ref.to.resource);
  const table=ref.to.resource.startsWith('table:')?project.dataverse.tables[ref.to.resource.slice(6)]:undefined;
  const column=ref.to.column?table?.columns[ref.to.column]:undefined;
  const relationship=ref.to.column?Object.values(project.dataverse.relationships).find(v=>v.fromTable===ref.to.resource.slice(6)&&v.lookup.key===ref.to.column):undefined;
  const declared=spec.mode==='intent'&&ref.to.column?spec.entities[ref.to.resource.slice(6)]?.fields[ref.to.column]?.type:undefined;
  const actualType=column?(declared??conceptualType(column)):relationship?'lookup':null;
  if(ref.to.column&&(!actualType||ref.to.expectedType&&actualType!==ref.to.expectedType))issues.push({code:'REFERENCE_TYPE',severity:'error',resource:ref.from,message:'Missing column or incompatible shared type: '+ref.to.resource+'.'+ref.to.column});
  return {...ref,physicalResource:target?.physicalName??null,physicalColumn:column?.schemaName.toLowerCase()??relationship?.lookup.schemaName.toLowerCase()??null,actualType};
 });
 // Trace dependency reasons to a fixed point, including solution/publisher and shared configuration.
 for(let pass=0;pass<resources.length;pass++){let changed=false;for(const r of resources)for(const dep of r.dependencies){const target=resources.find(x=>x.id===dep);if(target)for(const req of r.requiredBy)if(!target.requiredBy.includes(req)){target.requiredBy.push(req);changed=true;}}if(!changed)break;}
 for(const r of requirements)for(const id of r.resources)if(!resources.some(v=>v.id===id))issues.push({code:'REQUIREMENT_UNRESOLVED',severity:'error',message:r.id+' requests missing '+id});
 for(const r of resources){for(const req of r.requiredBy)if(!requirements.some(v=>v.id===req))issues.push({code:'UNKNOWN_REQUIREMENT',severity:'error',resource:r.id,message:req});if(!r.requiredBy.length)issues.push({code:'UNUSED_RESOURCE',severity:'warning',resource:r.id,message:'No requirement or dependent requirement explains this resource.'});r.requiredBy.sort();r.dependencies.sort();}
 for(const r of requirements)if(!resources.some(v=>v.requiredBy.includes(r.id)))issues.push({code:'REQUIREMENT_UNRESOLVED',severity:'error',message:r.id+' has no implementing resource.'});
 let deploymentOrder:string[]=[];try{deploymentOrder=orderResources(resources);}catch(error){issues.push({code:'DEPENDENCY_GRAPH',severity:'error',message:String(error)});}
 applyEvidence(resources,evidence,project,issues,now);
 for(const r of resources)if(issues.some(i=>i.severity==='error'&&i.resource===r.id)){r.state='BLOCKED';r.capability.status='BLOCKED';r.reason=issues.filter(i=>i.resource===r.id).map(i=>i.message).join('; ');}
 const architecture=architectureAudit(resources,project,spec);
 issues.push(...architecture);
 try{deploymentOrder=orderResources(resources);}catch{/* Already reported by dependency validation above. */}
 const deployment=stages.map(stage=>({stage,resources:deploymentOrder.filter(id=>resources.find(r=>r.id===id)?.stage===stage),executor:stage==='DATA'?'existing apply':stage==='AUTOMATION'||stage==='CONFIGURATION'?'existing flows apply (atomic subsystem ordering)':stage==='APPLICATION'?'existing guarded Canvas authoring lifecycle; no unified write adapter':stage==='ACTIVATION'?'manual; separate existing activation guards':'validation/manual prerequisite'}));
 const blockers=[...issues.filter(i=>i.severity==='error'),...resources.filter(r=>['BLOCKED','CONFLICT','UNSUPPORTED','ORPHANED'].includes(r.state)||r.capability.status==='EXTERNAL_BLOCKED').map(r=>({code:r.state,resource:r.id,message:r.reason,severity:'error' as const}))];
 const implementable=resources.filter(r=>r.capability.compile&&r.subsystem!=='external').length;
 const status=issues.some(i=>['DEPENDENCY_GRAPH','REFERENCE_TYPE','UNRESOLVED_REFERENCE'].includes(i.code))?'BLOCKED':blockers.length?implementable?'PARTIALLY_IMPLEMENTABLE':'PLAN_ONLY':'FULLY_IMPLEMENTABLE';
 return {version:1 as const,identity:project.project,solution:project.solution,sharedTypes:sharedTypeRegistry,processes:spec.mode==='intent'?spec.processes.map(p=>({...p,...responsibility(p.job)})):[],requirements:requirements.map(r=>({...r,resources:resources.filter(v=>v.requiredBy.includes(r.id)).map(v=>v.id)})),resources,references,dependencies:resources.flatMap(r=>r.dependencies.map(to=>({from:r.id,to}))),capabilities:resources.map(r=>({resource:r.id,...r.capability})),ownership:resources.map(r=>({resource:r.id,state:r.ownership})),deployment,deploymentOrder,validation:{issues,blockers,productionReady:false,checks:['strict solution/project schemas','existing Dataverse planner','existing Flow compiler/recipe expansion','existing Canvas semantic compiler','existing Taste decisions/composition/maturity','logical references/shared types','ownership and dependency closure'],pending:['fresh target discovery','security/persona verification','Solution Checker','unmanaged export membership','cross-environment import proof']},status,canvasPlans,workflowPlans:compiled?.recipes??{},workflowRisks:compiled?Object.fromEntries(Object.entries(compiled.flows).map(([k,f])=>[k,f.safety])):{},externalManifest:compiled?.manifest??{},storage:storageDecision(spec),responsibility:{validation:responsibility('uiValidation'),singleRecordSave:responsibility('singleRowUpdate')},project,sourceHash:digest(spec),projectHash:digest(project),capabilityHash:capabilityFingerprint(),environmentHash:digest(evidence.target??null),discoveryHash:digest(evidence),resourceHash:digest(resources.map(r=>({id:r.id,definitionHash:r.definitionHash}))),expectedMutations:mutationCounts(resources),remoteCalls:0,remoteMutations:0};
}

function applyEvidence(resources:ResourceIR[],evidence:SolutionEvidence,project:ReturnType<typeof resolveSolution>['project'],issues:Issue[],now:Date){
 const native=evidence.dataverse;
 if(native){
  if(digest(native.plan.target)!==digest(evidence.target)||digest(native.observation.target)!==digest(evidence.target))throw new Error('Evidence target mismatch');
  const plan=createPlan(project,native.observation,native.ownership,native.plan.scope,new Date(native.plan.createdAt),native.plan.executionPolicy);
  const {contentHash,...body}=native.plan;
  if(contentHash!==digest(body)||digest(plan.operations)!==digest(native.plan.operations)||digest(plan.blockers)!==digest(native.plan.blockers)||native.plan.sourceHash!==digest(project))throw new Error('Native plan does not match the existing deterministic Dataverse planner');
  const fresh=Date.parse(native.plan.expiresAt)>now.getTime()&&Date.parse(native.observation.observedAt)>now.getTime()-3600000&&Date.parse(native.observation.observedAt)<=now.getTime()+60000;
  for(const r of resources.filter(r=>r.nativeId)){
   if(r.subsystem==='security'&&(!native.plan.executionPolicy?.modelDriven||native.plan.scope==='dataverse'))continue;
   const owned=native.ownership?.resources.find(v=>v.resourceId===r.nativeId);const observed=native.observation.resources.find(v=>v.resourceId===r.nativeId);
   r.ownership=owned?'POWERCANVAS_OWNED':'UNKNOWN';if(observed)r.existingId=observed.remoteId;
   const op=plan.operations.find(v=>v.resourceId===r.nativeId);const blocks=plan.blockers.filter(b=>!b.resourceId||b.resourceId===r.nativeId);
   if(blocks.length){r.state=blocks.some(b=>['PF-PLAN-005','PF-PLAN-006','PF-PLAN-007'].includes(b.code))?'CONFLICT':'BLOCKED';r.reason=blocks.map(b=>b.message).join('; ');}
   else if(!observed&&!op){r.state='BLOCKED';r.reason='Resource not covered by this subsystem plan.';}
   else {r.state=op?op.classification==='create'?'CREATE':'UPDATE':'NO_OP';r.reason=fresh?'Existing Dataverse planner, scoped observation and ownership agree.':'Historical observation only; refresh before apply.';r.capability.deploy=fresh;r.capability.status=fresh?'SUPPORTED_WITH_LIMITS':'COMPILE_ONLY';}
  }
  for(const owned of native.ownership?.resources??[])if((native.plan.scope!=='dataverse'||owned.provider==='dataverse')&&!resources.some(r=>r.nativeId===owned.resourceId)){resources.push({id:'orphan:'+owned.resourceId,kind:'orphan',subsystem:'dataverse',stage:'DATA',physicalName:null,requiredBy:[],dependencies:[],definition:owned.baseline,definitionHash:digest(owned.baseline),nativeId:owned.resourceId,existingId:owned.remoteId,ownership:'POWERCANVAS_OWNED',state:'ORPHANED',reason:'Retained. Automatic deletion is forbidden.',capability:capability('dataverse')});}
  for(const op of plan.operations.filter(o=>o.action==='publish')){
   const deps=op.dependsOn.map(id=>plan.operations.find(o=>o.id===id)?.resourceId).flatMap(id=>resources.filter(r=>r.nativeId===id).map(r=>r.id));
   resources.push({id:'publish:'+op.provider,kind:'publication',subsystem:'dataverse',stage:'DATA',physicalName:null,requiredBy:[...new Set(resources.flatMap(r=>r.requiredBy))],dependencies:deps,definition:op.after,definitionHash:digest(op.after),nativeId:op.resourceId,ownership:'POWERCANVAS_OWNED',state:plan.blockers.length?'BLOCKED':'UPDATE',reason:'Existing planner requires scoped publication and readback.',capability:{...capability('dataverse'),deploy:fresh&&!plan.blockers.length,status:fresh&&!plan.blockers.length?'SUPPORTED_WITH_LIMITS':'COMPILE_ONLY'}});
  }
  if(!fresh)issues.push({code:'HISTORICAL_EVIDENCE',severity:'warning',message:'Native observation/plan is historical. States are explanatory, not current deployment authorization.'});
 }
 for(const binding of evidence.readOnlyBindings){
  const r=resources.find(v=>v.id===binding.resource);if(!r)throw new Error('Binding refers to an undeclared resource');
  if(r.nativeId)throw new Error('Native Dataverse resources require the native ownership/discovery planner, not read-only bindings');
  r.ownership=binding.ownership;r.existingId=binding.remoteId;
  if(binding.definitionHash!==r.definitionHash){r.state='CONFLICT';r.reason='Bound resource definition differs; no implicit adoption/update.';}
  else {r.state='NO_OP';r.reason='Explicit read-only binding and definition evidence; current remote state not independently verified.';r.capability.deploy=false;}
 }
}
function architectureAudit(resources:ResourceIR[],project:ReturnType<typeof resolveSolution>['project'],spec:ReturnType<typeof resolveSolution>['spec']):Issue[]{
 const issues:Issue[]=[];const warn=(code:string,message:string,resource?:string)=>issues.push({code,severity:'warning',message,...(resource?{resource}:{})});
 const groups=new Map<string,ResourceIR[]>();for(const r of resources){const key=r.kind+':'+digest(r.definition);groups.set(key,[...(groups.get(key)??[]),r]);}for(const group of groups.values())if(group.length>1)warn('DUPLICATE_CONCEPT','Identical definitions: '+group.map(r=>r.id).join(', '));
 const names=new Map<string,string>();for(const r of resources)if(r.physicalName){const key=r.physicalName.toLowerCase();if(names.has(key))issues.push({code:'PHYSICAL_COLLISION',severity:'error',resource:r.id,message:'Physical identity also used by '+names.get(key)});names.set(key,r.id);}
 const apps=Object.entries(project.canvasApps??{});for(let i=0;i<apps.length;i++)for(const [key,app]of apps.slice(i+1)){const other=apps[i]![1];if(digest(app.screens)===digest(other.screens))warn('DUPLICATE_APP','Same screens/jobs should be one adaptive app; device differences do not justify another application.','canvas:'+key);}
 if(spec.mode==='intent'){const experiences=Object.entries(spec.experiences);for(let i=0;i<experiences.length;i++)for(const [key,e]of experiences.slice(i+1)){const other=experiences[i]![1];if(digest(e.product.users)===digest(other.product.users)&&digest(e.product.jobs)===digest(other.product.jobs)&&e.source===other.source)issues.push({code:'DUPLICATE_APP_BOUNDARY',severity:'error',resource:'canvas:'+key,message:'Identical jobs, users and source require one adaptive application, not device-specific app declarations.'});}}
 for(const [key,f]of Object.entries(project.resources?.flows??{}))if(f.actions.every(a=>['dataverse.updateRow','powerApps.respond','data.compose'].includes(a.use)))warn('UNNECESSARY_FLOW','Single-record save/validation belongs in Power Fx unless background semantics are explicitly required.','flow:'+key);
 for(const [key,table]of Object.entries(project.dataverse.tables)){
  for(const [field,c]of Object.entries(table.columns))if(c.type==='multilineText'&&/json|ids|relations/i.test(field))warn('SERIALIZED_RELATIONSHIP','Consider a relationship instead of serialized record identities.','table:'+key);
  const lookups=Object.values(project.dataverse.relationships).filter(r=>r.fromTable===key);if(lookups.length>3)warn('LOOKUP_COMPLEXITY','Review delegation and navigation cost across '+lookups.length+' lookups.','table:'+key);
 }
 const choices=new Map<string,string>();for(const [key,t]of Object.entries(project.dataverse.tables))for(const [field,c]of Object.entries(t.columns))if(c.type==='choice'){const signature=digest(c.choices.map(v=>v.label.toLowerCase()).sort());if(choices.has(signature))warn('DUPLICATE_CHOICE','Review reuse of choice concept '+choices.get(signature),'table:'+key);choices.set(signature,key+'.'+field);}
 const configs=resources.filter(r=>r.kind==='environmentVariable');const defaults=new Map<string,string>();for(const c of configs){const v=c.definition as {default?:unknown};if(v.default!==undefined){const key=digest(v.default);if(defaults.has(key))warn('DUPLICATE_CONFIGURATION','Shared configuration may duplicate '+defaults.get(key),c.id);defaults.set(key,c.id);if(typeof v.default==='string'&&/https?:\/\/|@/.test(v.default))warn('HARDCODED_ENVIRONMENT','Portable source contains a target-specific default; use deployment configuration.',c.id);}}
 if(!spec.security.length)warn('SECURITY_UNSPECIFIED','Explicit app access, record scope, connection ownership and run-only requirements are still needed.');
 return issues;
}
export function mutationCounts(resources:ResourceIR[]){const counts:Record<string,number>={};for(const r of resources.filter(r=>r.state==='CREATE'||r.state==='UPDATE')){const key=r.kind+(r.state==='CREATE'?'Created':'Updated');counts[key]=(counts[key]??0)+1;}return {planned:counts,authorized:0,deleted:0,activated:0,businessDataWrites:0,note:'Potential native-plan changes only; not an execution report.'};}
export type SolutionIR=ReturnType<typeof compileSolution>;
