import { create } from 'xmlbuilder2';
import { z } from 'zod';
import { hashJson } from '../core/json.js';
import { PowerCanvasError } from '../core/errors.js';
import { rawObject, textValue } from '../dataverse/normalize.js';
import type { Raw } from '../dataverse/normalize.js';
import type { DesiredResource } from '../dataverse/desired.js';

interface XmlElement { getAttribute(name: string): string | null; getElementsByTagName(name: string): { length: number; item(index: number): XmlElement }; parentElement: XmlElement | null }
interface XmlDocument { getElementsByTagName(name: string): { length: number; item(index: number): XmlElement } }
export function elements(xml: string, name: string): XmlElement[] {
  if (xml.length > 2000000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new PowerCanvasError('PF-MDA-001', 'Unsupported XML structure.', 'Use bounded standard customization XML without DTDs or external entities.');
  const document = create(xml).node as unknown as XmlDocument;
  const list = document.getElementsByTagName(name); return Array.from({ length: list.length }, (_, index) => list.item(index));
}
const stableGuid = (value: string) => { const h = hashJson(value); return `{${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}}`; };
const classes: Record<string, string> = { String: '{4273EDBD-AC1D-40D3-9FB2-095C621B552D}', Memo: '{E0DECE4B-6FC8-4A8F-A065-082708572369}',
  Picklist: '{3EF39988-22BB-4F0B-BBBE-64B5A3748AEE}', Lookup: '{270BD3DB-D9AF-4782-9025-509E298DEC0A}' };
export function formXml(spec: DesiredResource, attributes: Raw[]): string {
  if(spec.properties.layout)return structuredFormXml(spec,attributes);
  const root = create().ele('form'); const tab = root.ele('tabs').ele('tab', { name: 'PowerCanvasGeneral', id: stableGuid(`${spec.resourceId}/tab`), expanded: 'true' });
  tab.ele('labels').ele('label', { description: 'General', languagecode: '1033' });
  const section = tab.ele('columns').ele('column', { width: '100%' }).ele('sections').ele('section', { name: 'PowerCanvasFields', id: stableGuid(`${spec.resourceId}/section`), columns: '1', showlabel: 'false', showbar: 'false' });
  section.ele('labels').ele('label', { description: 'Details', languagecode: '1033' }); const rows = section.ele('rows');
  for (const field of z.array(z.string()).parse(spec.properties.fields)) {
    const attribute = attributes.find(item => item.LogicalName === field); const type = attribute ? textValue(attribute.AttributeType) : '';
    const classid = classes[type];
    if (!attribute || !classid) throw new PowerCanvasError('PF-MDA-002', 'This form field type is outside the initial standard-control scope.', 'Use text, multiline text, choice and lookup controls for this experiment.');
    const labels = z.array(z.object({ LanguageCode: z.number(), Label: z.string() })).parse(rawObject(attribute.DisplayName).LocalizedLabels);
    const label = labels.find(item => item.LanguageCode === 1033)?.Label;
    if (!label) throw new PowerCanvasError('PF-MDA-002', 'Form field label is missing.', 'Complete English metadata discovery.');
    const cell = rows.ele('row').ele('cell', { id: stableGuid(`${spec.resourceId}/${field}`), showlabel: 'true' });
    cell.ele('labels').ele('label', { description: label, languagecode: '1033' });
    cell.ele('control', { id: field, datafieldname: field, classid, disabled: 'false' });
  }
  return root.end({ headless: true });
}
export function viewXml(spec: DesiredResource, table: Raw): { fetchxml: string; layoutxml: string } {
  const columns = z.array(z.string()).parse(spec.properties.columns);
  const entity = create().ele('fetch', { version: '1.0', mapping: 'logical', distinct: 'false' }).ele('entity', { name: textValue(table.LogicalName) });
  for (const column of [...new Set([textValue(table.PrimaryIdAttribute), ...columns])]) entity.ele('attribute', { name: column });
  for (const order of z.array(z.object({ column: z.string(), direction: z.string() })).parse(spec.properties.orderBy)) entity.ele('order', { attribute: order.column, descending: String(order.direction === 'descending') });
  const filters=z.array(z.object({field:z.string(),operator:z.string(),values:z.array(z.union([z.string(),z.number(),z.boolean()]))})).parse(spec.properties.filters??[]);
  if (spec.properties.activeOnly||filters.length){const filter=entity.ele('filter',{type:'and'});if(spec.properties.activeOnly)filter.ele('condition',{attribute:'statecode',operator:'eq',value:'0'});for(const f of filters){const c=filter.ele('condition',{attribute:f.field,operator:f.operator,...(f.values.length===1&&!['in','not-in'].includes(f.operator)?{value:typeof f.values[0]==='boolean'?String(Number(f.values[0])):String(f.values[0])}:{})});if(['in','not-in'].includes(f.operator))for(const v of f.values)c.ele('value').txt(String(v));}}
  const grid = create().ele('grid', { name: 'resultset', object: z.int().parse(table.ObjectTypeCode), jump: textValue(table.PrimaryNameAttribute), select: '1', icon: '1', preview: '1' });
  const row = grid.ele('row', { name: 'result', id: textValue(table.PrimaryIdAttribute) });
  for (const column of columns) row.ele('cell', { name: column, width: '180' });
  return { fetchxml: entity.doc().end({ headless: true }), layoutxml: grid.end({ headless: true }) };
}
export function sitemapXml(spec: DesiredResource): string {
  if((spec.properties.navigation as {area?:string}[]).some(n=>n.area))return areaSitemap(spec);
  const root = create().ele('SiteMap'); const area = root.ele('Area', { Id: 'PowerCanvasWork', ShowGroups: 'true' });
  area.ele('Titles').ele('Title', { LCID: '1033', Title: 'Work' });
  const navigation = z.array(z.object({ group: z.string(), table: z.string(), title: z.string() })).parse(spec.properties.navigation);
  for (const groupName of [...new Set(navigation.map(item => item.group))]) {
    const group = area.ele('Group', { Id: `group_${hashJson(groupName).slice(0, 12)}` }); group.ele('Titles').ele('Title', { LCID: '1033', Title: groupName });
    for (const item of navigation.filter(item => item.group === groupName)) group.ele('SubArea', { Id: `nav_${item.table}`, Entity: item.table }).ele('Titles').ele('Title', { LCID: '1033', Title: item.title });
  }
  return root.end({ headless: true });
}


const nativeLayout=z.array(z.object({name:z.string(),label:z.string(),sections:z.array(z.object({name:z.string(),label:z.string(),columns:z.number(),fields:z.array(z.object({field:z.string(),column:z.number(),readOnly:z.boolean(),visible:z.boolean()}))}))}));
function structuredFormXml(spec:DesiredResource,attributes:Raw[]){
 const root=create().ele('form'),tabs=root.ele('tabs');
 for(const t of nativeLayout.parse(spec.properties.layout)){
  const tab=tabs.ele('tab',{name:t.name,id:stableGuid(spec.resourceId+'/'+t.name),expanded:'true'});tab.ele('labels').ele('label',{description:t.label,languagecode:'1033'});
  const sections=tab.ele('columns').ele('column',{width:'100%'}).ele('sections');
  for(const s of t.sections){const section=sections.ele('section',{name:s.name,id:stableGuid(spec.resourceId+'/'+t.name+'/'+s.name),columns:String(s.columns),showlabel:'true',showbar:'false'});section.ele('labels').ele('label',{description:s.label,languagecode:'1033'});const rows=section.ele('rows');
   for(const f of s.fields){const attribute=attributes.find(a=>a.LogicalName===f.field);if(!attribute||!classes[String(attribute.AttributeType)])throw Error('Unsupported native form control type for '+f.field);const row=rows.ele('row');for(let i=1;i<f.column;i++)row.ele('cell',{id:stableGuid(spec.resourceId+'/'+f.field+'/spacer'+i)});const cell=row.ele('cell',{id:stableGuid(spec.resourceId+'/'+f.field),showlabel:'true',visible:String(f.visible)});cell.ele('labels').ele('label',{description:labelFor(attribute),languagecode:'1033'});cell.ele('control',{id:f.field,datafieldname:f.field,classid:classes[String(attribute.AttributeType)]!,disabled:String(f.readOnly)});}
  }
 }
 return root.end({headless:true});
}
function labelFor(attribute:Raw){const labels=z.array(z.object({LanguageCode:z.number(),Label:z.string()})).parse(rawObject(attribute.DisplayName).LocalizedLabels);const label=labels.find(l=>l.LanguageCode===1033)?.Label;if(!label)throw Error('Missing English field label');return label;}
function descendants(element:XmlElement,name:string){const list=element.getElementsByTagName(name);return Array.from({length:list.length},(_,i)=>list.item(i));}
export function readFormLayout(xml:string){return elements(xml,'tab').map(t=>({name:t.getAttribute('name')??'',label:t.getElementsByTagName('label').item(0)?.getAttribute('description')??'',sections:descendants(t,'section').map(s=>({name:s.getAttribute('name')??'',label:s.getElementsByTagName('label').item(0)?.getAttribute('description')??'',columns:Number(s.getAttribute('columns')),fields:descendants(s,'control').map(c=>{const cell=c.parentElement!,row=cell.parentElement!;return {field:c.getAttribute('datafieldname')??'',column:descendants(row,'cell').indexOf(cell)+1,readOnly:c.getAttribute('disabled')==='true',visible:cell.getAttribute('visible')!=='false'};})}))}));}
function areaSitemap(spec:DesiredResource){const navigation=z.array(z.object({area:z.string().optional(),group:z.string(),table:z.string(),title:z.string()})).parse(spec.properties.navigation),root=create().ele('SiteMap');for(const areaName of [...new Set(navigation.map(n=>n.area??'Work'))]){const area=root.ele('Area',{Id:'area_'+hashJson(areaName).slice(0,12),ShowGroups:'true'});area.ele('Titles').ele('Title',{LCID:'1033',Title:areaName});for(const groupName of [...new Set(navigation.filter(n=>(n.area??'Work')===areaName).map(n=>n.group))]){const group=area.ele('Group',{Id:'group_'+hashJson([areaName,groupName]).slice(0,12)});group.ele('Titles').ele('Title',{LCID:'1033',Title:groupName});for(const n of navigation.filter(n=>(n.area??'Work')===areaName&&n.group===groupName))group.ele('SubArea',{Id:'nav_'+hashJson([areaName,groupName,n.table]).slice(0,12),Entity:n.table}).ele('Titles').ele('Title',{LCID:'1033',Title:n.title});}}return root.end({headless:true});}
export function readViewFilters(xml:string,expected:unknown){
 const declared=z.array(z.object({field:z.string(),operator:z.string(),values:z.array(z.union([z.string(),z.number(),z.boolean()]))})).parse(expected);
 if(elements(xml,'link-entity').length||elements(xml,'filter').some(f=>f.getAttribute('type')!=='and'))throw Error('Unsupported view query shape');
 return elements(xml,'condition').filter(c=>!(c.getAttribute('attribute')==='statecode'&&c.getAttribute('operator')==='eq'&&c.getAttribute('value')==='0')).map(c=>{
  const field=c.getAttribute('attribute')??'',operator=c.getAttribute('operator')??'',sample=declared.find(f=>f.field===field&&f.operator===operator)?.values[0];
  const nodes=c.getElementsByTagName('value');const strings=nodes.length?Array.from({length:nodes.length},(_,i)=>(nodes.item(i) as unknown as {textContent:string}).textContent):c.getAttribute('value')===null?[]:[c.getAttribute('value')!];
  return {field,operator,values:strings.map(v=>typeof sample==='number'?Number(v):typeof sample==='boolean'?(v==='true'||v==='1'?true:v==='false'||v==='0'?false:v):v)};
 });
}
