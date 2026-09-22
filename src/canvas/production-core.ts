import { z } from 'zod';
import { productionVariant, restrictCertifiedSelection, type CertifiedSelection } from './certified-selection.js';
import { fieldTypes } from './fields.js';

const variant=z.string().regex(/^[A-Za-z]+\.[a-z][a-z-]*$/);
export const productionCoreRequestSchema=z.strictObject({
  version:z.literal('canvas-production-core-v1'),
  groups:z.strictObject({navigation:z.array(variant),data:z.array(variant),forms:z.array(variant),overlays:z.array(variant),commands:z.array(variant),feedback:z.array(variant),hierarchy:z.array(variant)}),
  dependencies:z.record(variant,z.array(variant)),
});
export type ProductionCoreRequest=z.infer<typeof productionCoreRequestSchema>;

/** These are declared structural requirements, not claims of live product certification. */
export const productionStyles={
  'desktop-operations':['CompactSidebar.standard','DataTable.standard','TaskForm.sectioned','SideSheet.standard','CommandBar.standard','SearchBox.standard','FilterBar.standard','PageHeader.standard','ErrorState.standard'],
  'desktop-read-oriented':['TopNavigation.standard','RichList.compact','GroupedList.compact','DetailPanel.standard','PageHeader.standard','EmptyState.standard'],
  'mobile-task':['BottomNavigation.standard','RichList.compact','TaskForm.single-column','FullScreenTask.standard','CommandBar.standard','PageHeader.standard','ErrorState.standard'],
} as const;

/** Critical embedded pattern dependencies. Primitive controls are already bound by
 * each certificate's factory/capability hashes; no duplicate primitive certificates. */
export const embeddedDependencies:Record<string,string[]>={'DataTable.standard':['StatusBadge.standard']};

export function validateDependencyClosure(roots:readonly string[],edges:Record<string,readonly string[]>,accepted:ReadonlySet<string>){
  const visited=new Set<string>(),active=new Set<string>(),failures=new Set<string>();
  const visit=(id:string)=>{if(active.has(id)){failures.add('Cycle: '+id);return;}if(visited.has(id))return;
    if(!accepted.has(id))failures.add('Uncertified dependency: '+id);
    active.add(id);for(const child of edges[id]??[])visit(child);active.delete(id);visited.add(id);
  };
  roots.forEach(visit);return {passed:failures.size===0,dependencies:[...visited].sort(),failures:[...failures].sort()};
}

export function buildProductionCore(raw:unknown,selection:CertifiedSelection){
  const request=productionCoreRequestSchema.parse(raw),ids=[...new Set(Object.values(request.groups).flat())];
  const families:Record<keyof ProductionCoreRequest['groups'],string[]>={navigation:['CompactSidebar','TopNavigation','BottomNavigation','Sidebar','Tabs'],data:['DataTable','RichList','GroupedList','ActivityTimeline'],forms:['TaskForm','FormSection'],overlays:['ConfirmationDialog','SideSheet','BottomSheet','FullScreenTask','ContextPanel'],commands:['CommandBar','SearchBox','FilterBar','FilterChips','OverflowMenu'],feedback:['EmptyState','LoadingState','ErrorState','Snackbar','Skeleton'],hierarchy:['PageHeader','RecordHeader','SectionHeader','DetailPanel']};
  for(const [group,members] of Object.entries(request.groups)){
    if(new Set(members).size!==members.length)throw new Error('Duplicate production group member: '+group);
    if(members.some(id=>!families[group as keyof typeof families].includes(id.split('.')[0]!)))throw new Error('Variant does not implement capability group: '+group);
  }
  const accepted=new Set(ids.filter(id=>{const i=id.lastIndexOf('.');return !!productionVariant(selection,id.slice(0,i),id.slice(i+1));}));
  const edges:Record<string,string[]>={};
  for(const id of new Set([...ids,...Object.keys(request.dependencies),...Object.keys(embeddedDependencies)]))edges[id]=[...new Set([...(embeddedDependencies[id]??[]),...(request.dependencies[id]??[])])];
  const graph=validateDependencyClosure(ids,edges,accepted);
  if(!graph.passed)throw new Error(graph.failures.join('; '));
  const core=restrictCertifiedSelection(selection,ids);
  const styles=Object.entries(productionStyles).map(([name,requirements])=>({name,requirements:[...requirements],missing:requirements.filter(id=>!accepted.has(id)),supported:requirements.every(id=>accepted.has(id))}));
  const breadth={navigation:request.groups.navigation.length>=2,data:request.groups.data.length>=2,forms:request.groups.forms.length>=2,overlays:request.groups.overlays.length>=2,
    commands:['CommandBar.standard','SearchBox.standard','FilterBar.standard'].every(id=>accepted.has(id)),
    feedback:['EmptyState.standard','LoadingState.standard','ErrorState.standard'].every(id=>accepted.has(id)),
    hierarchy:['PageHeader.standard','RecordHeader.standard','SectionHeader.standard'].every(id=>accepted.has(id))};
  // V4.4 has no accepted field certificate format/runtime Form.Updates evidence yet.
  // Keep these gates closed instead of accepting caller-supplied nativeValidated flags.
  const typedFields=fieldTypes.map(type=>({type,status:'IMPLEMENTED',productionSupported:false,reason:type==='singleChoice'?'Native Form.Updates proof pending':'Complete native read-only/theme/validation certification pending'}));
  const ready=Object.values(breadth).every(Boolean)&&styles.every(s=>s.supported)&&typedFields.filter(f=>['text','multiline','number','percentage','boolean','toggle','date','singleChoice'].includes(f.type)).every(f=>f.productionSupported);
  return {selection:core,manifest:{...request,status:ready?'ACCEPTED':'INCOMPLETE',confidencePolicy:'NATIVE_VALIDATED; publication not required; production benchmark remains separate',
    variants:ids.map(id=>{const i=id.lastIndexOf('.'),c=productionVariant(core,id.slice(0,i),id.slice(i+1))!;return {id,maturity:c.maturity,sourceHash:c.sourceHash,factoryHash:c.factoryHash,capabilityHash:c.capabilityHash,evidenceHash:c.evidenceHash,dependencies:edges[id]??[]};}),
    dependencyClosure:graph,breadth,typedFields,styles,
    responsiveContracts:{status:'EXISTING_EVIDENCE_RETAINED_NOT_GENERALIZED',reason:'V4.3 app-specific 12-boundary proof is not a certificate for untested component layouts'},
    readiness:{generalBusiness:ready?'READY':'NOT READY',mobileTask:ready?'READY':'NOT READY',analyticsHeavy:'LIMITED',documentWorkspaces:'LIMITED',advancedInteractions:'NOT READY'},
    capabilityQueries:{responsiveMasterDetail:ready?'SUPPORTED':'NOT PRODUCTION SUPPORTED',dragDropKanban:'NOT PRODUCTION SUPPORTED; PCF_CANDIDATE'},
    remoteWrites:0}};
}

export function selectCoreVariant(selection:CertifiedSelection,preferred:string,fallbacks:readonly {variant:string;reason:string}[]=[]){
  const valid=(id:string)=>{const i=id.lastIndexOf('.');return productionVariant(selection,id.slice(0,i),id.slice(i+1));};
  if(valid(preferred))return {selected:preferred,fallback:false,reason:'Certified preferred variant'};
  // A fallback chain is deployable only when every declared target is certified.
  for(const f of fallbacks)if(!f.reason.trim()||!valid(f.variant))throw new Error('Uncertified or unjustified fallback: '+f.variant);
  if(fallbacks[0])return {selected:fallbacks[0].variant,fallback:true,reason:fallbacks[0].reason};
  throw new Error('NOT PRODUCTION SUPPORTED: '+preferred);
}
