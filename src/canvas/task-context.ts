import { z } from 'zod';
import { button, stack, text, fxText } from './patterns.js';
const fx=z.string().min(1).max(20000);
export const taskContextSchema=z.strictObject({originScreen:fx,originRecord:fx,originNavigationState:fx,dirty:fx,returnAction:fx,discardAction:fx});
export const documentPreviewSchema=z.strictObject({kind:z.literal('external-link'),title:fx,url:fx,description:fx});
export function taskContextActions(raw:unknown){
  const c=taskContextSchema.parse(raw);
  return {enter:`Set(pc_originScreen, ${c.originScreen}); Set(pc_originRecord, ${c.originRecord}); Set(pc_originNavigationState, ${c.originNavigationState}); Set(pc_discardTask, false); Set(pc_step, 1); Set(pc_reviewing, false); Set(pc_validationAttempted, false); Navigate(pc_taskScreen, ScreenTransition.None)`,
    exit:`If(${c.dirty}, Set(pc_discardTask, true), ${c.returnAction})`,discard:`${c.discardAction}; Set(pc_discardTask, false); ${c.returnAction}`,cancel:'Set(pc_discardTask, false)',
    contract:{originScreen:c.originScreen,originRecord:c.originRecord,originNavigationState:c.originNavigationState,returnAction:c.returnAction,unsaved:c.dirty}};
}
/** External open is deliberately not described as an embedded PDF/Word viewer. */
export function compileDocumentPreview(name:string,raw:unknown){
  const p=documentPreviewSchema.parse(raw);
  return stack(name,[text(name+'_title',p.title,{Height:'=64',Size:'=PF_typeTitle'}),text(name+'_description',p.description,{Height:'=120',Color:'=PF_muted'}),text(name+'_notice',fxText('Document opens in its external viewer.'),{Height:'=48'}),button(name+'_open',fxText('Open document'),`If(!IsBlank(${p.url}), Launch(${p.url}))`,{Height:'=44',Width:'=200',DisplayMode:`=If(IsBlank(${p.url}), DisplayMode.Disabled, DisplayMode.Edit)`})],{Width:'=Parent.Width',Height:'=360'});
}
