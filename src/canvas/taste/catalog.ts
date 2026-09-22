import { z } from 'zod';
import { patternCatalog } from '../patterns.js';
import { expressiveContracts, expressiveVariants } from '../expressive.js';

export const taxonomy = ['FOUNDATIONS','NAVIGATION','LAYOUT','SURFACES','DATA DISPLAY','FORMS','SELECTION','ACTIONS','SEARCH','FILTERING','OVERLAYS','FEEDBACK','CONTENT','IDENTITY','FILES','COMMUNICATION','WORKFLOW','ANALYTICS','MOBILE','PRODUCTIVITY','ADVANCED INTERACTION'] as const;
export const maturityLevels = ['REFERENCE','PLANNED','PROTOTYPE','IMPLEMENTED','NATIVE_VALIDATED','PRODUCTION_BENCHMARKED'] as const;
let nativeNames: Set<string> | undefined;
export function componentEvidence(name:string) {
  nativeNames ??= new Set(patternCatalog().map(p=>p.name));
  const factory=nativeNames.has(name);const added=Object.hasOwn(expressiveContracts,name);
  return {maturity:factory?'IMPLEMENTED' as const:'PLANNED' as const,implementationTier:factory?2:0,executable:!!factory,
    variants:added?expressiveVariants[name as keyof typeof expressiveContracts]:name==='StatusBadge'?['standard','quiet']:factory?['standard']:[],
    devices:factory?['desktop','tablet','mobile']:[],actualFactory:factory?added?'expressivePattern':'pattern':null,
    nativeValidated:false,productionBenchmarked:false,evidence:factory?['Source factory','Local semantic tests; native runtime validation is a separate gate']:[],
    limitations:added?['Native Studio validation pending','Host owns data and focus entry; no browser focus-trap guarantee']:factory?['Runtime evidence must match current generated source']:['No executable native factory'],
  };
}
export const adapterSchema=z.strictObject({name:z.string(),sourcePattern:z.string(),intent:z.string(),categories:z.array(z.enum(taxonomy)).min(1),feasibility:z.enum(['NATIVE','TRANSLATED','PCF_CANDIDATE','REJECTED']),nativeTranslation:z.array(z.string()),limitations:z.array(z.string()),mobileTranslation:z.string(),accessibility:z.array(z.string()),pcfEscalation:z.string(),complexity:z.enum(['low','medium','high']),performance:z.string(),maintainability:z.string()});
const adapter=(name:string,categories:typeof taxonomy[number][],intent:string,nativeTranslation:string[],mobileTranslation:string,limitations:string[],feasibility:'NATIVE'|'TRANSLATED'|'PCF_CANDIDATE'|'REJECTED'='TRANSLATED')=>adapterSchema.parse({name,sourcePattern:name,intent,categories,feasibility,nativeTranslation,mobileTranslation,limitations,accessibility:['Text labels, 44px actions, logical source order','Restore context after dismissal; native keyboard testing pending'],pcfEscalation:feasibility==='PCF_CANDIDATE'?'Only after measured native capability/performance gap; never auto-install':'Escalate only when required interaction exceeds this bounded translation',complexity:feasibility==='PCF_CANDIDATE'?'high':'medium',performance:'Bound gallery rows; avoid nested galleries; audit generated control count',maintainability:'Host supplies data and event formulas; shared semantic tokens'});
export const adapters=[
  adapter('HoverCard',['OVERLAYS','CONTENT'],'Reveal secondary context',['ContextPanel'],'BottomSheet on tap',['Hover-only activation rejected']),
  adapter('ResizableSidebar',['LAYOUT','NAVIGATION'],'Adjust reading space',['CompactSidebar'],'NavigationDrawer',['Preset widths only; no drag resize']),
  adapter('CommandPalette',['SEARCH','PRODUCTIVITY'],'Find commands without scanning menus',[],'FullScreenTask with search',['REFERENCE; search+command factory not implemented']),
  adapter('BottomSheet',['OVERLAYS','MOBILE'],'Secondary touch task',['BottomSheet'],'Bottom-anchored scrollable panel',['No swipe/drag dismissal']),
  adapter('NavigationDrawer',['NAVIGATION','MOBILE'],'Disclose lower-frequency destinations',['NavigationDrawer'],'Labeled drawer with explicit close',['No swipe gesture; maximum 12 destinations']),
  adapter('GroupedList',['DATA DISPLAY'],'Scan bounded grouped records',['GroupedList'],'Single column',['Host supplies sorted flat rows and group-start boolean; no implied delegation']),
  adapter('GlassSurface',['SURFACES'],'Separate foreground context',['SideSheet'],'Opaque surface',['No backdrop blur; use contrast and border']),
  adapter('DragDropKanban',['WORKFLOW','ADVANCED INTERACTION'],'Reorder work between stages',[],'Explicit stage-change action',['No drag/drop board implemented'],'PCF_CANDIDATE'),
  adapter('AdvancedCalendar',['WORKFLOW','ANALYTICS'],'Inspect time and scheduling',[],'Agenda fallback requires a separate contract',['No calendar interactions implemented'],'PCF_CANDIDATE'),
  adapter('ComplexGrid',['DATA DISPLAY','ADVANCED INTERACTION'],'Spreadsheet-like interaction',[],'Record editor',['No virtualization or spreadsheet editing claim'],'PCF_CANDIDATE'),
  adapter('NativeBackdropBlur',['SURFACES'],'Blur content behind an overlay',[],'Opaque high-contrast surface',['Canvas has no supported backdrop-filter primitive'],'REJECTED'),
];
export function resolveAdapter(name:string,capability:'native'|'drag'='native') {
  const spec=adapters.find(a=>a.name===name);if(!spec)throw new Error('Unknown pattern adapter');
  if(spec.feasibility==='REJECTED')throw new Error(spec.limitations.join('; '));
  const implemented=spec.nativeTranslation.length>0&&spec.nativeTranslation.every(n=>componentEvidence(n).executable);
  const requiresPCF=spec.feasibility==='PCF_CANDIDATE'||capability==='drag';
  return {...spec,implemented:implemented&&!requiresPCF,maturity:implemented&&!requiresPCF?'IMPLEMENTED':'REFERENCE',resolution:requiresPCF?'PCF_CANDIDATE':implemented?'COMPOSED_CANVAS':'DESIGN_PATTERN_ONLY',packageCreated:false};
}
export const inspirationCardSchema=z.strictObject({source:z.url(),category:z.string().min(1),observations:z.array(z.string()).min(1),adaptablePatterns:z.array(z.string()).min(1),notAdaptable:z.array(z.string()),sourceAdapted:z.literal(false),reviewedAt:z.iso.date()});
