import { controls } from '../audit.js';
import type { NativeFiles } from '../../native-types.js';
import type { DesignMemory } from '../memory.js';
import { refineOperational, type OperationalContract, type RefinementFocus } from '../operational-refinement.js';
export { refinementPasses, mergeFormulas } from '../operational-refinement.js';
export type { RefinementFocus } from '../operational-refinement.js';

/** Compatibility adapter: identifies business concepts and copy; owns no visual treatment. */
export function ownsLegacyRefinement(files:NativeFiles){return Object.hasOwn(files,'pf_screen_complaints.pa.yaml')&&controls(files).some(n=>n.name==='pf_ds2_complaints_form');}
export function refineLegacyApplication(input:NativeFiles,memory:DesignMemory,focus:RefinementFocus){
 const contract:OperationalContract={roles:{pf_ds2_dashboard_kpi1_value:'lead-metric',pf_ds2_complaints_detail_title:'detail-title',pf_ds2_dashboard_recent_status:'quiet-status',pf_ds2_complaints_list_status:'quiet-status',pf_ds2_complaints_priority:'quiet-status'},layoutRoles:{},related:{},copy:{"leadLabel":"=\"HIGH PRIORITY\"","leadCaption":"=\"Start with these records\"","secondaryCaption":"=\"Normal priority\"","formHeading":"=\"Complaint and response\"","continuation":"=\"Review priority, read the full complaint, and leave a reason with each update.\"","recentTitle":"=\"Recent changes\"","continuationTitle":"=\"Continue triage\"","navigationSection":"=\"CASEWORK\"","navigationFooter":"=\"Operations workspace\""}};
 for(const prefix of ['pf_ds2_dashboard','pf_ds2_complaints']){
  for(let i=0;i<12;i++)contract.roles[prefix+'_sidebar_item'+i]='navigation';
  for(let i=0;i<8;i++)contract.roles[prefix+'_filters_'+i]='filter';
  for(const action of ['edit','revealButton','sort','refresh'])contract.roles[prefix+'_'+action]='quiet-action';
 }
 const mappings:[RegExp,string][]=[[/_metrics$/,'metrics'],[/_kpi[012]$/,'metric'],[/_kpi1$/,'lead-metric'],[/_kpi1_label$/,'lead-label'],[/_kpi1_caption$/,'lead-caption'],[/_kpi2_caption$/,'secondary-caption'],[/_pageHeader$/,'page-header'],[/_tablePanel$/,'table-panel'],[/_tableHeader$/,'table-header'],[/_detail$/,'detail'],[/_detailFields$/,'detail-fields'],[/_detail_title$/,'detail-title'],[/_editDialog_panel$/,'edit-panel'],[/_editDialog_description$/,'edit-description'],[/_formHeading$/,'form-heading'],[/_recent_identity$/,'row-identity'],[/_recent_select$/,'row-select'],[/_detailTabs$/,'detail-tabs'],[/_selectedTitle$/,'redundant-identity'],[/_detail_subtitle$|_recordLabel$|_selectedTitle$/,'redundant-detail'],[/_nextText$/,'continuation-text'],[/_next_title$/,'continuation-title'],[/_next_subtitle$/,'redundant-continuation'],[/_chart$|_next$/,'content-panel'],[/_sidebar_section$/,'navigation-section'],[/_sidebar_foot$/,'navigation-footer'],[/_timeline_event$/,'timeline-event']];
 for(const n of controls(input)){
  contract.layoutRoles[n.name]=mappings.filter(([pattern])=>pattern.test(n.name)).map(([,role])=>role);
  contract.related[n.name]={redundantIdentity:n.name.replace('_detail_title','_selectedTitle'),detailTitle:n.name.replace('_selectedTitle','_detail_title'),recentRecords:n.name.replace(/_nextText$|_next_title$/,'_recent')};
 }
 return refineOperational(input,memory,focus,contract);
}
