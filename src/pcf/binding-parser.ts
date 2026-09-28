import {create} from 'xmlbuilder2';
import {hashJson} from '../core/json.js';

interface Attr {name:string;value:string;namespaceURI:string|null}
interface Node {nodeType:number;nodeName:string;namespaceURI:string|null;nodeValue:string|null;attributes?:ArrayLike<Attr>;childNodes:ArrayLike<Node>;getAttribute?(name:string):string|null;getElementsByTagName?(name:string):ArrayLike<Node>}
export interface ParameterNode {name:string;namespace:string|null;attributes:{name:string;namespace:string|null;value:string}[];content:(string|ParameterNode)[]}
export interface ObservedBinding {forControl:string;attributes:Record<string,string>;controls:{attributes:Record<string,string>;parameters:ParameterNode|null;classification:'FIRST_PARTY_OR_LEGACY'|'UNCLASSIFIED';semantics:'UNVERIFIED'}[]}
const attributes=(n:Node)=>Object.fromEntries(Array.from(n.attributes??[]).map(a=>[a.name,a.value]).sort(([a],[b])=>a!.localeCompare(b!)));
function parameter(n:Node,depth=0):ParameterNode {
 if(depth>64)throw Error('Parameter nesting exceeds observation limit');
 const children=Array.from(n.childNodes);if(children.some(c=>![1,3,4,8].includes(c.nodeType)))throw Error('Unsupported parameter node');
 const text=children.filter(c=>c.nodeType===3||c.nodeType===4);const indentation=children.some(c=>c.nodeType===1)&&text.every(c=>!c.nodeValue?.trim());
 return {name:n.nodeName,namespace:n.namespaceURI??null,attributes:Array.from(n.attributes??[]).filter(a=>a.name!=='xmlns'&&!a.name.startsWith('xmlns:')).map(a=>({name:a.name,namespace:a.namespaceURI??null,value:a.value})).sort((a,b)=>a.name.localeCompare(b.name)),content:children.filter(c=>c.nodeType!==8&&(!indentation||c.nodeType===1)).map(c=>c.nodeType===1?parameter(c,depth+1):c.nodeValue??'')};
}
function childElements(n:Node,name?:string){return Array.from(n.childNodes).filter(c=>c.nodeType===1&&(!name||c.nodeName===name));}
/** Neutral observation parser. An XML tree is not a verified property-binding grammar. */
export function parseControlDescriptions(xml:string):ObservedBinding[]{
 if(Buffer.byteLength(xml)>4_000_000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('Unsupported FormXML size/DTD/entity declaration');
 const doc=create(xml).node as unknown as Node;const roots=Array.from(doc.getElementsByTagName!('controlDescriptions'));
 if(roots.length>1)throw Error('Ambiguous controlDescriptions roots');if(!roots.length)return [];
 return childElements(roots[0]!).map(n=>{
  if(n.nodeName!=='controlDescription')throw Error('Unknown controlDescriptions child');const attrs=attributes(n);if(!attrs.forControl)throw Error('Missing forControl');
  return {forControl:attrs.forControl,attributes:attrs,controls:childElements(n).map(c=>{
   if(c.nodeName!=='customControl')throw Error('Unknown controlDescription child');const a=attributes(c);
   if(a.formFactor!==undefined&&!/^-?\d+$/.test(a.formFactor))throw Error('Noninteger formFactor');
   const children=childElements(c);if(children.some(p=>p.nodeName!=='parameters')||children.length>1)throw Error('Unknown customControl child or duplicate parameters');
   return {attributes:a,parameters:children[0]?parameter(children[0]):null,classification:!a.name||a.name.startsWith('MscrmControls.')?'FIRST_PARTY_OR_LEGACY' as const:'UNCLASSIFIED' as const,semantics:'UNVERIFIED' as const};
  })};
 });
}
export function serializeObservedBindings(bindings:ObservedBinding[]):string {
 const root=create().ele('controlDescriptions');
 const emit=(parent:typeof root,p:ParameterNode)=>{const attrs:Record<string,string>=Object.fromEntries(p.attributes.map(a=>[a.name,a.value]));if(p.namespace){attrs[p.name.includes(':')?'xmlns:'+p.name.split(':')[0]:'xmlns']=p.namespace;}for(const a of p.attributes)if(a.namespace&&a.name.includes(':'))attrs['xmlns:'+a.name.split(':')[0]]=a.namespace;const element=parent.ele(p.name,attrs);for(const c of p.content)if(typeof c==='string')element.txt(c);else emit(element,c);};
 for(const b of bindings){if(b.attributes.forControl!==b.forControl)throw Error('Conflicting forControl');const description=root.ele('controlDescription',b.attributes);for(const c of b.controls){const control=description.ele('customControl',c.attributes);if(c.parameters)emit(control,c.parameters);}}
 return root.end({headless:true,prettyPrint:false});
}
export const bindingSemanticHash=(bindings:ObservedBinding[])=>hashJson(bindings as never);
export function inspectBindingXML(xml:string){const bindings=parseControlDescriptions(xml);const roundtrip=parseControlDescriptions(serializeObservedBindings(bindings));return {bindings,semanticHash:bindingSemanticHash(bindings),roundtripEqual:bindingSemanticHash(bindings)===bindingSemanticHash(roundtrip),grammar:'NEUTRAL_XML_TREE_V1',semanticBindingVerified:false,provenance:'UNCLASSIFIED_INPUT',tenantMutations:0};}
