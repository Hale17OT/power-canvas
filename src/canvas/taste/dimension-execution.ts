import { dimensionNames } from './decision-schema.js';
const effects:Record<string,{tokens:string;structure:string}>={
  density:{tokens:'PF_rowHeight, PF_spaceLg',structure:'RichList compact/comfortable variant'},
  warmth:{tokens:'PF_canvas neutral/warm light background',structure:'None'},
  surfaceDepth:{tokens:'PF_elevation',structure:'None'},
  radiusCharacter:{tokens:'PF_radius when explicitly configured',structure:'None'},
  typographyExpression:{tokens:'PF_text_display; explicitly configured values bind record-header title',structure:'Header title height when explicitly configured'},
  navigationPresence:{tokens:'None',structure:'CompactSidebar candidate weighting'},
  dataEmphasis:{tokens:'None',structure:'DataTable candidate weighting'},
  decorativeIntensity:{tokens:'PF_borderWidth, subject to border:none override',structure:'None'},
};
export const dimensionExecution=dimensionNames.map(d=>({dimension:d,stored:true,status:effects[d]?'EXECUTABLE':'INTENT_ONLY',tokens:effects[d]?.tokens??'None',structure:effects[d]?.structure??'None',nativeVisible:false,limitation:effects[d]?'Generated source effect; current-source native certification pending':'Stored intent; no output behavior is claimed'}));
