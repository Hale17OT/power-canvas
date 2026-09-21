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
  if (spec.properties.activeOnly) entity.ele('filter', { type: 'and' }).ele('condition', { attribute: 'statecode', operator: 'eq', value: '0' });
  const grid = create().ele('grid', { name: 'resultset', object: z.int().parse(table.ObjectTypeCode), jump: textValue(table.PrimaryNameAttribute), select: '1', icon: '1', preview: '1' });
  const row = grid.ele('row', { name: 'result', id: textValue(table.PrimaryIdAttribute) });
  for (const column of columns) row.ele('cell', { name: column, width: '180' });
  return { fetchxml: entity.doc().end({ headless: true }), layoutxml: grid.end({ headless: true }) };
}
export function sitemapXml(spec: DesiredResource): string {
  const root = create().ele('SiteMap'); const area = root.ele('Area', { Id: 'PowerCanvasWork', ShowGroups: 'true' });
  area.ele('Titles').ele('Title', { LCID: '1033', Title: 'Work' });
  const navigation = z.array(z.object({ group: z.string(), table: z.string(), title: z.string() })).parse(spec.properties.navigation);
  for (const groupName of [...new Set(navigation.map(item => item.group))]) {
    const group = area.ele('Group', { Id: `group_${hashJson(groupName).slice(0, 12)}` }); group.ele('Titles').ele('Title', { LCID: '1033', Title: groupName });
    for (const item of navigation.filter(item => item.group === groupName)) group.ele('SubArea', { Id: `nav_${item.table}`, Entity: item.table }).ele('Titles').ele('Title', { LCID: '1033', Title: item.title });
  }
  return root.end({ headless: true });
}

