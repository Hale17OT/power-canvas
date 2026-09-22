import { hashJson } from '../core/json.js';
import { controls } from './taste/audit.js';
import { compileField, fieldTypes } from './fields.js';
import { assertFreshSource, requireToolResult, type AuthoringCall, type SourceBundle } from './source-provider.js';

export type ControlCapability = {available:boolean;creationName:string|null;creationKeywords:string;inputProperties:string[];outputProperties:string[];variants:string[];version:string|null;versionStatus:'VERIFIED'|'CONTROL VERSION UNVERIFIED';responseHash:string};
export function parseControlCapability(result:Parameters<typeof requireToolResult>[0]):ControlCapability {
  const text=requireToolResult(result),keywords=text.match(/Control creation keywords:\s*```yaml\s*([\s\S]*?)```/)?.[1]?.trim()??'';
  const creation=keywords.match(/^Control:\s*(\S+)/m)?.[1]??null;
  const version=creation?.split('@')[1]??null;
  const inputs=text.split('Input Properties:')[1]?.split('Output Properties:')[0]??'';
  const outputs=text.split('Output Properties:')[1]??'';
  const props=(s:string)=>[...new Set([...s.matchAll(/^\s*-\s+(\w+):/gm)].map(m=>m[1]!))];
  return {available:!!creation,creationName:creation?.split('@')[0]??null,creationKeywords:keywords,inputProperties:props(inputs),outputProperties:props(outputs),variants:[...keywords.matchAll(/^Variant:\s*(.+)$/gm)].map(m=>m[1]!.trim()),version,versionStatus:version?'VERIFIED':'CONTROL VERSION UNVERIFIED',responseHash:hashJson(result as never)};
}
export function validateFieldCapabilities(capabilities:Record<string,ControlCapability>) {
  return fieldTypes.map(type=>{
    const field=compileField('probe',{type,label:'Value',value:'Blank()',onChange:'Set(probeChanged, true)',items:'Table({Value:"A"})',timeZone:'UTC',currencyCode:'USD'});
    const issues=controls({field:field.control}).flatMap(n=>{
      const kind=n.node.Control!.split('@')[0]!,c=capabilities[kind];if(!c?.available)return [`${kind}: unavailable`];
      return Object.keys(n.node.Properties).filter(p=>!c.inputProperties.includes(p)).map(p=>`${kind}.${p}: undiscovered property`);
    });
    const limits:string[]=[];
    if(['lookup','person','singleChoice','multiChoice'].includes(type))limits.push('Requires correctly typed Items/default records; persona and delegation runtime unproven');
    if(['email','phone','url'].includes(type))limits.push('Text input with formula validation; no native semantic input mode');
    if(type==='datetime')limits.push('Date plus hours/minutes; explicit UTC/Local contract, DST runtime unproven');
    if(type==='currency')limits.push('Explicit currency code; no conversion or multi-currency accounting');
    return {type,status:issues.length?'FALLBACK_REQUIRED':limits.length?'SUPPORTED_WITH_LIMIT':'SUPPORTED',issues,limits,nativeCompile:false,nativeRuntime:false};
  });
}
export async function discoverCapabilities(call:AuthoringCall,bundle:SourceBundle,server:string){
  assertFreshSource(bundle,bundle.snapshot.identity);
  const needed=new Set(controls(bundle.files).map(n=>n.node.Control!.split('@')[0]!));
  for(const type of fieldTypes){const field=compileField('probe',{type,label:'Value',value:'Blank()',onChange:'Set(probeChanged, true)',items:'Table({Value:"A"})',timeZone:'UTC',currencyCode:'USD'});for(const n of controls({field:field.control}))needed.add(n.node.Control!.split('@')[0]!);}
  const result:Record<string,ControlCapability>={};
  for(const name of [...needed].sort())result[name]=parseControlCapability(await call('describe_control',{controlName:name}));
  const body={version:'4.2',identity:bundle.snapshot.identity,sourceHash:bundle.snapshot.sourceHash,acquiredAt:new Date().toISOString(),authoringServer:server,controls:result,fields:validateFieldCapabilities(result)};
  return {...body,hash:hashJson(body)};
}
