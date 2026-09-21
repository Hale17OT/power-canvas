import type {Project} from '../ir/schema.js';
import type {NativeBindings,NativeFiles} from '../canvas/native-types.js';
import {controls,compareBehavior} from '../canvas/taste/audit.js';
import {stack,text,button,control,fxText,fill} from '../canvas/patterns.js';
import {compileFlows} from './compile.js';
import {canvasInvocation} from './canvas.js';
import {fail} from './expressions.js';

/** A separate Canvas consumer of typed flow contracts. It cannot create, deploy or activate flows. */
export function composeFlowCommands(project:Project,appKey:string,bindings:NativeBindings,files:NativeFiles){
  const before=structuredClone(files);const receipts=[];
  for(const b of compileFlows(project).resources.canvasBindings.filter(b=>b.app===appKey&&b.command)){
    const c=b.command!,prepared=bindings.flowSources?.[b.alias];
    if(!prepared)fail(`Prepared native flow source is required for ${b.alias}.`);
    const nodes=controls(files),parent=nodes.find(n=>n.name===c.parent);
    if(!parent?.node.Children||parent.node.Control?.split('@')[0]!=='GroupContainer'||parent.node.Variant!=='AutoLayout')fail('Flow command requires an existing auto-layout container.');
    const p='pf_flow_'+c.name,busy=p+'_busy',opened=p+'_open',result=p+'_result',error=p+'_error';
    if(nodes.some(n=>n.name.startsWith(p+'_')||n.name===p))fail('Flow command control collision.');
    const args=structuredClone(c.arguments);
    for(const f of c.fields){if(args[f.input])fail('Duplicate command argument.');args[f.input]={type:'string',formula:p+'_'+f.input+'.Value'};}
    const invocation=canvasInvocation(project,{appId:bindings.appId,workflowId:prepared.workflowId,alias:b.alias,arguments:args,resultVariable:result},prepared);
    if(invocation.outputs.find(o=>o.name===c.messageOutput)?.shape.type!=='string'||invocation.outputs.find(o=>o.name===c.successOutput)?.shape.type!=='boolean')fail('Command status requires declared string and boolean output fields.');
    const write=invocation.risk!=='READ';
    const disabled=`${busy} || (${c.disabled})${write?' || '+p+'_attempted':''}`;
    const captured=invocation.argumentExpressions.map((formula,i)=>({name:`pf_argument_${i}`,formula}));
    const signature=(snapshot:boolean)=>`JSON({${captured.map((a,i)=>`argument_${i}: ${snapshot?a.name:a.formula}`).join(', ')}})`;
    const submit=`With({${captured.map(a=>`${a.name}: ${a.formula}`).join(', ')}}, If(!(${disabled}), Set(${busy}, true); ${write?`Set(${p}_attempted, true); `:''}Set(${error}, ""); Set(${result}, Blank()); Set(${p}_requestKey, ${signature(true)}); IfError(Set(${result}, ${prepared.dataSourceName}.Run(${captured.map(a=>a.name).join(', ')})), Set(${error}, ${fxText(write?"Outcome unknown. Reconcile the operation before retrying.":"Automation check failed. Try again.")})); Set(${busy}, false)))`;
    const fieldControls=c.fields.flatMap(f=>[text(p+'_'+f.input+'_label',fxText(f.label),{Height:'=20',Size:'=PF_typeCaption'}),control(p+'_'+f.input,'TextInput',{...fill,Height:'=PF_controlHeight',AccessibleLabel:'='+fxText(f.label),Value:'=""',MaxLength:'=500',OnChange:`=Set(${result}, Blank()); Set(${error}, "")`,TriggerOutput:"='TextInputCanvas.TriggerOutput'.Keypress",DisplayMode:`=If(${busy}, DisplayMode.Disabled, DisplayMode.Edit)`,FontColor:'=PF_text',Fill:'=PF_surface',BorderColor:'=PF_inputBorder',BorderThickness:'=1',Appearance:"='TextInputCanvas.Appearance'.Outline"})]);
    const touchHeight='=If(PF_mobile, 44, PF_controlHeight)';
    for(const entry of fieldControls){const node=Object.values(entry)[0]!;if(node.Control==='TextInput')node.Properties.Height=touchHeight;}
    const panel=stack(p+'_panel',[text(p+'_description',fxText(c.description),{Height:'=48',Size:'=PF_typeCaption',Color:'=PF_muted'}),...fieldControls,button(p+'_run',`If(${busy}, ${fxText(c.lifecycle?.busyLabel??'Checking…')}, ${fxText(c.lifecycle?.submitLabel??'Check contract')})`,submit,{Height:touchHeight,Width:'=Parent.Width',DisplayMode:`=If(${disabled}, DisplayMode.Disabled, DisplayMode.Edit)`}),text(p+'_response',`If(${p}_requestKey <> ${signature(false)}, ${fxText(write?"No confirmed result for these inputs.":"No check run for these inputs.")}, If(!IsBlank(${error}), ${error}, If(IsBlank(${result}), ${fxText(write?"No confirmed result for these inputs.":"No check run for these inputs.")}, If(${result}.${c.successOutput}, ${fxText(write?'Completed · ':'Accepted · ')}, ${fxText(write?'Not completed · ':'Not accepted · ')}) & ${result}.${c.messageOutput})))`,{Height:'=80',Size:'=PF_typeCaption',Color:`=If(!IsBlank(${error}), PF_danger, PF_text)`})],{Visible:'='+opened,Height:'='+String(200+c.fields.length*80)});
    parent.node.Children.push(stack(p,[button(p+'_toggle',`If(${opened}, "Hide automation check", ${fxText(c.label)})`,`Set(${opened}, !${opened}); Set(${result}, Blank()); Set(${error}, "")`,{Height:touchHeight,Width:'=Parent.Width',DisplayMode:`=If(${disabled}, DisplayMode.Disabled, DisplayMode.Edit)`}),panel],{Height:`=If(${opened}, ${260+c.fields.length*80}, If(PF_mobile, 44, PF_controlHeight) + PF_gap)`,PaddingTop:'=PF_gap'}));
    receipts.push({...invocation,command:c.name,formula:submit});
  }
  if(!compareBehavior(before,files).preserved)fail('Flow command changed existing Canvas behavior.');
  return receipts;
}
