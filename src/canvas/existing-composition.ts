import { z } from 'zod';
import { hashJson } from '../core/json.js';
import type { NativeFiles, NativeControl } from './native-types.js';
import { lowerBehaviorBindings } from './behavior-ir.js';
import { validateNativeSource } from './source-provider.js';
import { planCanvasMigration } from './migration.js';

const property=z.string().min(1);
const presentationProperties=z.record(property,z.string());
const bindingRefs=z.record(property,z.string().min(1));
const nodeSchema=z.strictObject({name:property,control:property.optional(),variant:property.optional(),layout:property.optional(),presentation:presentationProperties,behavior:bindingRefs,children:z.array(z.string()),hasChildren:z.boolean()});
export const existingCompositionSchema=z.strictObject({version:z.literal('4.2'),mode:z.literal('retained-native'),sourceHash:z.string().length(64),behaviorHash:z.string().length(64),nodes:z.array(nodeSchema),screens:z.array(z.strictObject({file:property,name:property})),app:nodeSchema,hash:z.string().length(64)});
export type ExistingComposition=z.infer<typeof existingCompositionSchema>;
/** Existing source is lowered into explicit presentation nodes and separate immutable behavior references.
 * Retention is a real candidate; it does not claim that legacy controls instantiate a V4 factory variant.
 */
export function lowerExistingComposition(files:NativeFiles) {
  validateNativeSource(files);const behavior=lowerBehaviorBindings(files),bindingIds=new Set(behavior.bindings.map(b=>b.id));
  const nodes:z.infer<typeof nodeSchema>[]=[];
  const lower=(name:string,node:NativeControl):z.infer<typeof nodeSchema>=>{
    for(const key of Object.keys(node))if(!['Control','Variant','Layout','Properties','Children'].includes(key))throw new Error('Unmodeled native attribute requires explicit lowering: '+key);
    const presentation:Record<string,string>={},refs:Record<string,string>={};
    for(const [p,v] of Object.entries(node.Properties??{})){const id=name+'.'+p;if(bindingIds.has(id))refs[p]=id;else presentation[p]=v;}
    const children=(node.Children??[]).flatMap(child=>Object.entries(child).map(([id,n])=>{nodes.push(lower(id,n));return id;}));
    return {name,...(node.Control?{control:node.Control}:{}),...(node.Variant?{variant:node.Variant}:{}),...(node.Layout?{layout:node.Layout}:{}),presentation,behavior:refs,children,hasChildren:Object.hasOwn(node,'Children')};
  };
  const screens:{file:string;name:string}[]=[];let app:z.infer<typeof nodeSchema>|undefined;
  for(const [file,value] of Object.entries(files)){
    const source=value as {App?:NativeControl;Screens?:Record<string,NativeControl>};
    if(source.App)app=lower('App',source.App);
    for(const [name,node] of Object.entries(source.Screens??{})){screens.push({file,name});nodes.push(lower(name,node));}
  }
  if(!app)throw new Error('App missing');
  const body={version:'4.2' as const,mode:'retained-native' as const,sourceHash:hashJson(files),behaviorHash:behavior.hash,nodes,screens,app};
  return {composition:existingCompositionSchema.parse({...body,hash:hashJson(body)}),behavior};
}
export function compileExistingComposition(raw:unknown,behavior:ReturnType<typeof lowerBehaviorBindings>,before:NativeFiles) {
  const ir=existingCompositionSchema.parse(raw),{hash,...body}=ir;
  if(hashJson(body)!==hash||hashJson(before)!==ir.sourceHash||behavior.hash!==ir.behaviorHash||lowerBehaviorBindings(before).hash!==behavior.hash)throw new Error('Existing composition source/behavior hash mismatch');
  const index=new Map(ir.nodes.map(n=>[n.name,n]));if(index.size!==ir.nodes.length)throw new Error('Duplicate composition identity');
  const references=new Map(behavior.bindings.map(b=>[b.id,b]));const visited=new Set<string>(),active=new Set<string>(),usedBindings:string[]=[];
  const emit=(node:z.infer<typeof nodeSchema>):NativeControl=>{
    if(active.has(node.name)||visited.has(node.name))throw new Error('Composition cycle or duplicate placement');active.add(node.name);visited.add(node.name);
    const props={...node.presentation};
    for(const [p,id] of Object.entries(node.behavior)){const binding=references.get(id);if(!binding||binding.property!==p||binding.owner!==node.name||Object.hasOwn(props,p))throw new Error('Invalid or shadowed business binding');props[p]=binding.expression.source;usedBindings.push(id);}
    const result:NativeControl={...(node.control?{Control:node.control}:{}),...(node.variant?{Variant:node.variant}:{}),...(node.layout?{Layout:node.layout}:{}),Properties:props};
    if(node.hasChildren)result.Children=node.children.map(name=>{const child=index.get(name);if(!child)throw new Error('Missing composition child');return {[name]:emit(child)};});
    else if(node.children.length)throw new Error('Hidden composition children');active.delete(node.name);return result;
  };
  const files:NativeFiles={'App.pa.yaml':{App:emit(ir.app)}};
  for(const screen of ir.screens){const n=index.get(screen.name);if(!n)throw new Error('Screen node missing');const existing=files[screen.file] as {Screens:Record<string,NativeControl>}|undefined;if(existing)existing.Screens[screen.name]=emit(n);else files[screen.file]={Screens:{[screen.name]:emit(n)}};}
  if(visited.size!==ir.nodes.length+1||usedBindings.length!==references.size||new Set(usedBindings).size!==usedBindings.length)throw new Error('Unplaced nodes or lost/duplicated behavioral binding');
  const migration=planCanvasMigration(before,files);if(!migration.safe)throw new Error('Composition changes protected business behavior');
  return {files,migration,composition:ir,behavior,legacyGeneratorInvoked:false,componentPromotions:0};
}
