import {inflateRawSync} from 'node:zlib';
import {create} from 'xmlbuilder2';
import {createHash} from 'node:crypto';
import {fail} from './expressions.js';
import type {FlowResources} from './schema.js';
const limit=10*1024*1024;
/** Read bounded OOXML parts without extraction. ZIP64/encrypted archives are deliberately unsupported. */
export function docxParts(bytes:Buffer){
 if(bytes.length>limit||bytes.length<22)fail('Word template must be a DOCX of at most 10 MB.');
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50&&i+22+bytes.readUInt16LE(i+20)===bytes.length){end=i;break;}
 if(end<0)fail('Invalid DOCX ZIP directory.');
 if(bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6))fail('Multi-disk DOCX is unsupported.');
 const count=bytes.readUInt16LE(end+10);let at=bytes.readUInt32LE(end+16),total=0;
 if(count>2000)fail('DOCX contains too many parts.');const files=new Map<string,Buffer>();
 for(let i=0;i<count;i++){
  if(at+46>end||bytes.readUInt32LE(at)!==0x02014b50)fail('Invalid DOCX entry.');
  const flags=bytes.readUInt16LE(at+8),method=bytes.readUInt16LE(at+10),compressed=bytes.readUInt32LE(at+20),size=bytes.readUInt32LE(at+24),length=bytes.readUInt16LE(at+28),extra=bytes.readUInt16LE(at+30),comment=bytes.readUInt16LE(at+32),offset=bytes.readUInt32LE(at+42);
  const name=bytes.subarray(at+46,at+46+length).toString('utf8');at+=46+length+extra+comment;total+=size;
  if(flags&1||![0,8].includes(method)||size>limit||total>limit*4||offset+30>=end||files.has(name))fail('Unsupported, duplicate or oversized DOCX part.');
  if(bytes.readUInt32LE(offset)!==0x04034b50)fail('Invalid local DOCX entry.');
  const start=offset+30+bytes.readUInt16LE(offset+26)+bytes.readUInt16LE(offset+28);if(start+compressed>end)fail('DOCX part exceeds archive boundary.');
  const raw=bytes.subarray(start,start+compressed),data=method===0?raw:inflateRawSync(raw,{maxOutputLength:limit});if(data.length!==size)fail('DOCX part length mismatch.');files.set(name,data);
 }
 if(!files.has('[Content_Types].xml')||!files.has('word/document.xml'))fail('Missing DOCX structure.');return files;
}
export function inspectWordTemplate(bytes:Buffer){
 const files=docxParts(bytes),fields:Record<string,{controlId:string;type:'string';control:'plainText';required:boolean}>={},ids=new Set<string>();
 const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
 for(const [name,data]of files){if(!/^word\/(document|header[0-9]+|footer[0-9]+)\.xml$/.test(name))continue;
  const xml=data.toString('utf8');if(/<!DOCTYPE|<!ENTITY/i.test(xml))fail('DTD/entity declarations are forbidden in Word templates.');
  const doc=create(xml).node as unknown as {getElementsByTagNameNS(ns:string,name:string):ArrayLike<Element>};
  const nodes=Array.from(doc.getElementsByTagNameNS(ns,'sdtPr'));
  for(const node of nodes){
   const val=(key:string)=>node.getElementsByTagNameNS(ns,key)[0]?.getAttributeNS(ns,'val');
   const title=val('alias'),id=val('id');
   if(!title||!id||!/^[-]?[0-9]+$/.test(id)||!/^[A-Za-z][A-Za-z0-9_]*$/.test(title)||title.length>100||fields[title]||ids.has(id))fail('Template fields need unique valid titles and control IDs.');
   if(node.getElementsByTagNameNS(ns,'text').length!==1)fail('V3 supports plain-text content controls only; unsupported control cannot be ignored.');
   fields[title]={controlId:id,type:'string',control:'plainText',required:true};ids.add(id);
  }
 }
 if(!Object.keys(fields).length)fail('Template has no supported content controls.');
 return {sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,fields};
}
export function validateTemplateContract(template:NonNullable<FlowResources['documentTemplates']>[string],bytes:Buffer){
 const actual=inspectWordTemplate(bytes);
 if(Object.keys(template.fields).length!==Object.keys(actual.fields).length)fail('Template field count mismatch.');
 for(const [name,f]of Object.entries(template.fields)){const live=actual.fields[name];if(!live||live.controlId!==f.controlId||live.type!==f.type||live.control!==f.control)fail('Template field/content-control mismatch.');}
 return actual;
}
export function validateDocumentBinary(bytes:Buffer,kind:'docx'|'pdf'){
 if(kind==='docx'){docxParts(bytes);return {valid:true,kind,bytes:bytes.length};}
 if(bytes.length<20||bytes.subarray(0,5).toString()!=='%PDF-'||!bytes.subarray(-1024).includes(Buffer.from('%%EOF')))fail('Invalid PDF signature/end marker.');
 return {valid:true,kind,bytes:bytes.length,renderingVerified:false};
}
