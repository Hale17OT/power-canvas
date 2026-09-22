import { z } from 'zod';
import { hashJson } from '../core/json.js';
import { sourceSnapshotSchema } from './source-provider.js';

export const certificationTiers={
  A:['CompactSidebar','TopNavigation','BottomNavigation','CommandBar','SearchBox','FilterBar','FilterChips','DataTable','RichList','RecordHeader','SectionHeader','TaskForm','FormSection','SideSheet','FullScreenTask','ConfirmationDialog','Snackbar','EmptyState','ErrorState','LoadingState','Skeleton'],
  B:['NavigationDrawer','BottomSheet','ContextPanel','GroupedList','BulkActionBar','OverflowMenu','ActivityTimeline','Tabs','Stepper','ChartCard'],
} as const;
export function variantChecks(component:string,variant:string){
  const checks=['authoring-validation','source-readback','native-render','responsive-geometry','theme','accessible-name'];
  const notApplicable:Record<string,string>={};
  if(['Skeleton','LoadingState','SectionHeader','FormSection'].includes(component))notApplicable.interaction='Static/non-actionable instance; no activation handler';else checks.push('interaction');
  if(['SideSheet','FullScreenTask','ConfirmationDialog','NavigationDrawer','BottomSheet'].includes(component))checks.push('focus-return','background-blocking','cancel');
  if(['TaskForm','SideSheet','FullScreenTask'].includes(component))checks.push('draft-preservation','validation','disabled-state');
  if(component==='TaskForm'&&variant==='wizard')checks.push('step-navigation','review');else notApplicable['step-navigation']='Not a wizard variant';
  if(['DataTable','RichList','GroupedList','ActivityTimeline','ChartCard'].includes(component))checks.push('empty-data','representative-data','long-text','missing-values');
  if(['SearchBox','FilterBar','FilterChips'].includes(component))checks.push('filter-selection','clear-filter');
  return {component,variant,tier:(certificationTiers.A as readonly string[]).includes(component)?'A':(certificationTiers.B as readonly string[]).includes(component)?'B':'C',checks,notApplicable};
}
const digest=z.string().regex(/^[a-f0-9]{64}$/);
export const nativeEvidenceBindingSchema=z.strictObject({
  version:z.literal('4.2'),source:sourceSnapshotSchema,designPlanHash:digest,registryHash:digest,
  component:z.string().min(1),variant:z.string().min(1),sessionId:z.string().min(1),
  viewport:z.strictObject({requestedWidth:z.number().positive(),browserWidth:z.number().positive(),browserHeight:z.number().positive(),cssWidth:z.number().positive(),cssHeight:z.number().positive(),logicalWidth:z.number().positive(),logicalHeight:z.number().positive(),devicePixelRatio:z.number().positive(),stableSamples:z.number().int().min(1)}),
  theme:z.enum(['light','dark']),
});
export function validateEvidenceBinding(raw:unknown,expected:{sourceHash:string;designPlanHash:string;registryHash:string;appId:string;environmentId:string;sessionId:string}){
  const e=nativeEvidenceBindingSchema.parse(raw),failures:string[]=[];
  if(e.source.sourceHash!==expected.sourceHash||e.designPlanHash!==expected.designPlanHash||e.registryHash!==expected.registryHash)failures.push('Source/design/registry hash mismatch');
  if(e.source.identity.appId!==expected.appId||e.source.identity.environmentId!==expected.environmentId||e.sessionId!==expected.sessionId||e.source.identity.sessionId!==e.sessionId)failures.push('App/session mismatch');
  if(e.viewport.stableSamples<3)failures.push('Geometry has not settled');
  if(Math.abs(e.viewport.logicalWidth-e.viewport.requestedWidth)>2)failures.push('Logical viewport differs from requested breakpoint');
  return {passed:!failures.length,failures,bindingHash:hashJson(e)};
}
export type EvidenceStage='UNVERIFIED'|'SOURCE_ACQUIRED'|'SOURCE_AGREED'|'PLANNED'|'NATIVE_VALIDATED'|'PREVIEWED'|'CERTIFIED';
export function transitionEvidence(stage:EvidenceStage,event:'acquire'|'agree'|'plan'|'compile'|'preview'|'certify'|'sourceChanged',gates:Record<string,boolean>):EvidenceStage{
  if(event==='sourceChanged')return 'UNVERIFIED';
  const transitions:Record<string,{from:EvidenceStage;to:EvidenceStage;requirements:string[]}>= {
    acquire:{from:'UNVERIFIED',to:'SOURCE_ACQUIRED',requirements:['freshSource','identity']},
    agree:{from:'SOURCE_ACQUIRED',to:'SOURCE_AGREED',requirements:['independentAgreement']},
    plan:{from:'SOURCE_AGREED',to:'PLANNED',requirements:['zeroBehaviorChanges','zeroUnresolved','immutableMutationPaths','reviewedCandidate']},
    compile:{from:'PLANNED',to:'NATIVE_VALIDATED',requirements:['officialValidation','sameAppReadback']},
    preview:{from:'NATIVE_VALIDATED',to:'PREVIEWED',requirements:['boundRuntime','stableGeometry','functionalPreservation']},
    certify:{from:'PREVIEWED',to:'CERTIFIED',requirements:['appCheckerClean','accessibilityClean','applicableVariantChecks','sourceDesignRegistryBinding']},
  };
  const t=transitions[event]!;if(t.from!==stage||t.requirements.some(k=>gates[k]!==true))throw new Error('Evidence transition blocked: '+event);return t.to;
}
