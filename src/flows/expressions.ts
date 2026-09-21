import { PowerCanvasError } from '../core/errors.js';
import { hashJson } from '../core/json.js';
import type { Expr, ValueShape } from './schema.js';
export function fail(message:string):never {throw new PowerCanvasError('PF-FLOW-001',message,'Correct the typed flow source or resolve the reported dependency; no automatic fallback is performed.');};
export const compatible=(a:ValueShape,b:ValueShape)=>hashJson(a)===hashJson(b)||(b.type==='number'&&a.type==='integer');
export function validateValue(value:unknown,s:ValueShape):boolean {
  if(s.type==='array')return Array.isArray(value)&&value.every(v=>validateValue(v,s.items!));
  if(s.type==='object')return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===Object.keys(s.fields!).length&&Object.entries(s.fields!).every(([k,t])=>validateValue((value as Record<string,unknown>)[k],t));
  if(s.type==='number'||s.type==='integer')return typeof value==='number'&&Number.isFinite(value)&&(s.type!=='integer'||Number.isInteger(value));
  if(s.type==='boolean')return typeof value==='boolean';
  if(s.type==='binary')return false; // Only connector-produced binary is accepted; no ambiguous string conversion.
  if(typeof value!=='string')return false;
  if(s.type==='guid'||s.type==='recordRef')return /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
  if(s.type==='email')return /^[^\s@;,<>]+@[^\s@;,<>]+\.[^\s@;,<>]+$/.test(value);
  if(s.type==='date')return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
  if(s.type==='datetime')return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&!Number.isNaN(Date.parse(value))&&validateValue(value.slice(0,10),{type:'date'});
  return true;
}
export interface ExpressionContext {inputs:Record<string,{shape:ValueShape;wire:string}>;outputs:Record<string,{shape:ValueShape;body:boolean}>;variables:Record<string,ValueShape>;environment:Record<string,{shape:ValueShape;parameter:string}>;item?:ValueShape;loop?:string;trigger?:ValueShape}
const quote=(s:string)=>`'${s.replaceAll("'","''")}'`;
function literal(v:unknown):string {if(typeof v==='string')return quote(v);if(v&&typeof v==='object')return `json(${quote(JSON.stringify(v))})`;return JSON.stringify(v);}
export function assertNonsecret(v:unknown,endpoints=false):void {
  if(typeof v==='string'&&(/Bearer\s|-----BEGIN .*PRIVATE KEY/i.test(v)||(endpoints&&/https?:\/\//i.test(v))))fail('Credentials are forbidden; use environment variables for endpoints.');
  if(v&&typeof v==='object')for(const [key,value] of Object.entries(v)){if(/^(?:password|client_?secret|access_?token|refresh_?token|api_?key|authorization)$/i.test(key))fail('Credential fields are forbidden in flow configuration.');assertNonsecret(value,endpoints);}
}
export function expression(e:Expr,c:ExpressionContext):{code:string;shape:ValueShape} {
  if(e.op==='newGuid')return {code:'guid()',shape:{type:'guid'}};
  if(e.op==='utcNow')return {code:'utcNow()',shape:{type:'datetime'}};
  if(e.op==='runId')return {code:"workflow()['run']['name']",shape:{type:'string'}};
  if(e.op==='literal'){
    if(!validateValue(e.value,e.shape!))fail('Literal does not match its declared type.');
    assertNonsecret(e.value,!e.intentionalConstant);
    return {code:literal(e.value),shape:e.shape!};
  }
  if(['input','output','trigger','variable','environment','item'].includes(e.op)){
    let shape:ValueShape|undefined,code='';
    if(e.op==='input'){const v=c.inputs[e.name!];shape=v?.shape;code=`triggerBody()?[${quote(v?.wire??'')}]`;}
    if(e.op==='output'){const v=c.outputs[e.name!];shape=v?.shape;code=`${v?.body?'body':'outputs'}(${quote(e.name!)})`;}
    if(e.op==='variable'){shape=c.variables[e.name!];code=`variables(${quote(e.name!)})`;}
    if(e.op==='environment'){const v=c.environment[e.name!];shape=v?.shape;code=`parameters(${quote(v?.parameter??'')})`;}
    if(e.op==='item'){shape=c.item;code=c.loop?`items(${quote(c.loop)})`:'item()';}
    if(e.op==='trigger'){shape=c.trigger;code='triggerBody()';}
    if(!shape)fail(`Unavailable ${e.op} reference ${e.name??'current item'} (undefined, forward or outside scope).`);
    for(const key of e.path??[]){shape=shape!.fields?.[key];if(!shape)fail(`Unknown typed field ${key}.`);code+=`?[${quote(key)}]`;}
    return {code,shape:shape!};
  }
  const args=(e.args??[]).map(a=>expression(a,c));const n=args.length;
  const arity=['not','empty','length','first','last'].includes(e.op)?n===1:e.op==='equals'?n===2:n>=2;
  if(!arity)fail(`Invalid arity for ${e.op}.`);
  let shape:ValueShape={type:'boolean'};
  if(e.op==='concat'){if(args.some(a=>a.shape.type!=='string'))fail('concat requires strings.');shape={type:'string'};}
  if(['not','and','or'].includes(e.op)&&args.some(a=>a.shape.type!=='boolean'))fail(`${e.op} requires booleans.`);
  if(['equals','coalesce'].includes(e.op)&&args.some(a=>!compatible(a.shape,args[0]!.shape)))fail(`${e.op} operands have incompatible types.`);
  if(e.op==='coalesce')shape=args[0]!.shape;
  if(['length','empty'].includes(e.op)&&!['string','array','object'].includes(args[0]!.shape.type))fail(`${e.op} requires a collection or string.`);
  if(e.op==='length')shape={type:'integer'};
  if(e.op==='length'&&args[0]!.shape.type==='object')fail('length requires an array or string.');
  if(['first','last'].includes(e.op)){if(args[0]!.shape.type!=='array')fail(`${e.op} requires an array.`);shape=args[0]!.shape.items!;}
  return {code:`${e.op}(${args.map(a=>a.code).join(',')})`,shape};
}
export function jsonShape(s:ValueShape):Record<string,unknown> {
  if(s.type==='binary')fail('Binary is a connector-produced value, not a JSON/Power Apps scalar schema.');
  if(s.type==='object')return {type:'object',properties:Object.fromEntries(Object.entries(s.fields!).map(([k,v])=>[k,jsonShape(v)])),required:Object.keys(s.fields!),additionalProperties:false};
  if(s.type==='array')return {type:'array',items:jsonShape(s.items!)};
  const format=({guid:'uuid',recordRef:'uuid',email:'email',date:'date',datetime:'date-time'} as Record<string,string>)[s.type];
  return {type:['string','number','integer','boolean'].includes(s.type)?s.type:'string',...(format?{format}:{})};
}
