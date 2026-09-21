import { create } from 'xmlbuilder2';
import { z } from 'zod';
import { hashJson } from '../core/json.js';
import { PowerCanvasError } from '../core/errors.js';
import { elements, formXml } from './xml.js';
import type { DesiredResource } from '../dataverse/desired.js';
import type { Raw } from '../dataverse/normalize.js';

export const revealSchema = z.strictObject({ fields: z.array(z.string().regex(/^[a-z][a-z0-9_]+$/)).min(1), libraryName: z.string(), namespace: z.string().regex(/^PowerCanvasReveal_[a-f0-9]{12}$/) });
export type Reveal = z.infer<typeof revealSchema>;
export function revealIdentity(prefix: string, app: string, form: string, fields: string[]): Reveal {
  return { fields, libraryName: `${prefix}_PowerCanvas/${app}/${form}.js`, namespace: `PowerCanvasReveal_${hashJson([prefix, app, form]).slice(0, 12)}` };
}
// Uses only the supported formContext API. No DOM inspection, HTTP or data mutation.
export function revealScript(input: Reveal): string {
  const { fields, namespace } = revealSchema.parse(input);
  return `/* PowerCanvas reveal v1; visibility is not authorization. */
var ${namespace} = (function () {
  "use strict";
  var fields = ${JSON.stringify(fields)};
  function controls(form) {
    if (!form || !form.getAttribute) return [];
    var result = [];
    fields.forEach(function (name) {
      var attribute = form.getAttribute(name);
      if (attribute && attribute.controls) attribute.controls.forEach(function (control) { result.push(control); });
    });
    return result;
  }
  function onLoad(context) {
    var form = context && context.getFormContext ? context.getFormContext() : null;
    controls(form).forEach(function (control) { control.setVisible(false); });
  }
  function toggle(primaryControl) {
    var list = controls(primaryControl);
    if (!list.length) return;
    var show = !list.every(function (control) { return control.getVisible(); });
    list.forEach(function (control) { control.setVisible(show); });
    if (show && list[0].setFocus) list[0].setFocus();
  }
  return { onLoad: onLoad, toggle: toggle };
}());
`;
}
const fail = () => { throw new PowerCanvasError('PF-MDA-013', 'Form reveal binding conflicts with existing XML.', 'Inspect the existing form; PowerCanvas never overwrites unknown handlers or libraries.'); };
/** Add only missing field rows and one new library/handler, preserving unrelated XML. */
export function addRevealToForm(xml: string, spec: DesiredResource, attributes: Raw[]): string {
  const reveal = revealSchema.parse(spec.properties.reveal);
  const existingFields = elements(xml, 'control').map(item => item.getAttribute('datafieldname')).filter(Boolean);
  const fields = z.array(z.string()).parse(spec.properties.fields);
  if (existingFields.some(field => !fields.includes(field!))) fail();
  if (elements(xml, 'Library').some(item => item.getAttribute('name') === reveal.libraryName) || elements(xml, 'Handler').some(item => item.getAttribute('functionName')?.startsWith(reveal.namespace))) fail();
  // Do not create duplicate events or enable an unknown, deliberately disabled handler group.
  if (elements(xml, 'event').some(item => item.getAttribute('name') === 'onload' && item.getAttribute('application') !== 'true')) fail();
  const doc = create(xml); const root = doc.root();
  const sections = elements(xml, 'section').filter(item => item.getAttribute('name') === 'PowerCanvasFields');
  if (sections.length !== 1) fail();
  const section = root.find(node => node.node.nodeName === 'section' && (node.node as unknown as { getAttribute(n: string): string }).getAttribute('name') === 'PowerCanvasFields', false, true)!;
  const rows = section.find(node => node.node.nodeName === 'rows')!;
  for (const field of fields.filter(field => !existingFields.includes(field))) {
    const generated = create(formXml({ ...spec, properties: { ...spec.properties, fields: [field] } }, attributes));
    const row = generated.find(node => node.node.nodeName === 'row', false, true)!;
    rows.import(row);
  }
  for (const control of root.filter(node => node.node.nodeName === 'control', false, true)) {
    const field = (control.node as unknown as { getAttribute(n: string): string }).getAttribute('datafieldname');
    if (reveal.fields.includes(field)) control.up().att('visible', 'false');
  }
  const libraries = root.find(node => node.node.nodeName === 'formLibraries') ?? root.ele('formLibraries');
  libraries.ele('Library', { name: reveal.libraryName, libraryUniqueId: stableGuid(reveal.libraryName) });
  const events = root.find(node => node.node.nodeName === 'events') ?? root.ele('events');
  // A distinct non-application event avoids touching platform/internal handlers.
  const event = events.ele('event', { name: 'onload', application: 'false', active: 'true' });
  event.ele('Handlers').ele('Handler', { functionName: `${reveal.namespace}.onLoad`, libraryName: reveal.libraryName, handlerUniqueId: stableGuid(reveal.namespace), enabled: 'true', parameters: '', passExecutionContext: 'true' });
  return root.end({ headless: true });
}
function stableGuid(text: string): string { const h = hashJson(text); return `{${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}}`; }
export function observeReveal(xml: string, input: unknown): Reveal | null {
  const desired = revealSchema.parse(input);
  const libraries = elements(xml, 'Library').filter(item => item.getAttribute('name') === desired.libraryName);
  const handlers = elements(xml, 'Handler').filter(item => item.getAttribute('functionName') === `${desired.namespace}.onLoad`);
  if (!libraries.length && !handlers.length) return null;
  if (libraries.length !== 1 || handlers.length !== 1 || handlers[0]!.getAttribute('libraryName') !== desired.libraryName || handlers[0]!.getAttribute('enabled') !== 'true' || handlers[0]!.getAttribute('passExecutionContext') !== 'true' || handlers[0]!.parentElement?.parentElement?.getAttribute('name') !== 'onload' || handlers[0]!.parentElement?.parentElement?.getAttribute('active') !== 'true') fail();
  const hidden = elements(xml, 'control').filter(item => desired.fields.includes(item.getAttribute('datafieldname') ?? '') && item.parentElement?.getAttribute('visible') === 'false');
  if (hidden.length !== desired.fields.length) fail();
  return desired;
}
