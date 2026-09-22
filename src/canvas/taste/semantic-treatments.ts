import { pattern } from '../patterns.js';
import type { NativeFiles } from '../native-types.js';
import { controls } from './audit.js';

export type TreatmentRole='lead-metric'|'detail-title'|'navigation'|'filter'|'quiet-action'|'quiet-status';
/** Generic treatments consume adapter/factory metadata; control spelling is irrelevant. */
export function applySemanticTreatments(files:NativeFiles,focus:string,roles:Record<string,TreatmentRole>,operational:boolean){
  const changes:string[]=[];
  for(const n of controls(files)){
    const role=roles[n.name],p=n.node.Properties;
    const set=(props:Record<string,string>)=>{for(const [k,v]of Object.entries(props))if(p[k]!==v){p[k]=v;changes.push(`${n.name}.${k}`);}};
    if(focus==='typeset'){
      if(operational&&role==='lead-metric')set({Size:'=PF_typeLead',Height:'=56'});
      if(role==='detail-title')set({Size:'=PF_typeTitle',Height:'=112',AutoHeight:'=true'});
    }
    if(focus==='color'&&operational){
      if(role==='navigation'){const selected=/Primary|Secondary/.test(p.Appearance??'');set({Appearance:selected?"='ButtonCanvas.Appearance'.Secondary":"='ButtonCanvas.Appearance'.Subtle",FontColor:selected?'=PF_accentText':'=PF_text',BasePaletteColor:'=PF_brand'});}
      if(role==='filter')set({Appearance:(p.Appearance??'').replace("'ButtonCanvas.Appearance'.Primary","'ButtonCanvas.Appearance'.Secondary"),FontColor:'=PF_text'});
      if(role==='quiet-action')set({Appearance:"='ButtonCanvas.Appearance'.Subtle",FontColor:'=PF_text'});
    }
    if(focus==='polish'&&operational&&role==='quiet-status'&&n.node.Control==='Badge'){
      const label=p.Content!;n.node.Control='ModernText';n.node.Properties=Object.values(pattern(n.name,'StatusBadge',{label:label.slice(1),treatment:'quiet'},[],p.Visible?{Visible:p.Visible}:{}))[0]!.Properties;
      changes.push(`${n.name}: quiet text priority (label retained)`);
    }
  }return changes;
}
