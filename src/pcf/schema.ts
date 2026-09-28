import {z} from 'zod';
import {fieldBindingIntentSchema} from './field-binding.js';
import {datasetBindingIntentSchema} from './dataset-binding.js';

const name=z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/).max(80);
export const propertyTypes={string:'SingleLine.Text',multiline:'Multiple',integer:'Whole.None',decimal:'Decimal',currency:'Currency',boolean:'TwoOptions',date:'DateAndTime.DateOnly',datetime:'DateAndTime.DateAndTime',choice:'OptionSet',lookup:'Lookup.Simple'} as const;
export const pcfPropertySchema=z.strictObject({type:z.enum(Object.keys(propertyTypes) as [keyof typeof propertyTypes,...(keyof typeof propertyTypes)[]]),usage:z.enum(['bound','input','output']),required:z.boolean().default(false)});
const path=z.string().regex(/^(?!.*\.\.)(?![/\\])[A-Za-z0-9_./-]+$/);
export const pcfComponentSchema=z.strictObject({
 namespace:z.string().regex(/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*$/),constructor:name,version:z.string().regex(/^\d+\.\d+\.\d+$/),kind:z.enum(['field','dataset']),implementation:z.enum(['standard','react']).default('standard'),
 properties:z.record(name,pcfPropertySchema).default({}),datasets:z.record(name,z.strictObject({columns:z.record(name,pcfPropertySchema.omit({usage:true})).refine(v=>Object.keys(v).length>0),capabilities:z.strictObject({selection:z.boolean(),sorting:z.boolean(),filtering:z.boolean(),paging:z.boolean(),resize:z.boolean()})})).default({}),
 resources:z.array(z.strictObject({kind:z.enum(['code','css','resx']),path})).min(1),features:z.array(z.strictObject({name:z.enum(['WebAPI','Utility','Device.captureAudio','Device.captureImage','Device.captureVideo','Device.getBarcodeValue','Device.getCurrentPosition','Device.pickFile']),required:z.boolean()})).default([]),
 targets:z.strictObject({canvas:z.boolean(),modelDriven:z.boolean()}),designRole:z.string().min(5),requirement:z.enum(['status','button','textInput','form','card','styling','layout','resizableDataset','calendarNavigation','colorContrast']),
 implementationSource:z.discriminatedUnion('kind',[z.strictObject({kind:z.literal('generated'),template:z.enum(['ColorContrastField','AdvancedDataGrid','CalendarDataset'])}),z.strictObject({kind:z.literal('external'),directory:path})]),
 externalDomains:z.array(z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/)).default([]),
}).superRefine((v,c)=>{
 const fail=(message:string)=>c.addIssue({code:'custom',message});
 if(v.kind==='field'&&Object.keys(v.datasets).length||v.kind==='dataset'&&Object.keys(v.datasets).length!==1)fail('Field requires no datasets; bounded dataset path requires exactly one dataset.');
 if(v.kind==='field'&&!Object.values(v.properties).some(p=>p.usage==='bound'))fail('Field requires a bound property.');
 if(v.resources.filter(r=>r.kind==='code').length!==1)fail('Exactly one code resource is required.');
 if(new Set(v.resources.map(r=>r.path)).size!==v.resources.length)fail('Duplicate resource path.');
 if(new Set(v.features.map(f=>f.name)).size!==v.features.length)fail('Duplicate feature.');
 if(v.targets.canvas&&[...Object.values(v.properties),...Object.values(v.datasets).flatMap(d=>Object.values(d.columns))].some(p=>p.type==='lookup'))fail('Lookup.Simple is model-driven only.');
 if(v.kind==='dataset'&&Object.values(v.properties).some(p=>p.type==='lookup'))fail('Dataset lookup must be a dataset column.');
 if(v.targets.canvas&&v.features.some(f=>f.name==='WebAPI'))fail('WebAPI is not supported in Canvas.');
 if(Object.values(v.properties).some(p=>p.usage==='output'&&p.required))fail('Output-only properties cannot require an input binding.');
 if(!v.targets.canvas&&!v.targets.modelDriven)fail('At least one target is required.');
 if(v.implementation==='react')fail('React/platform-library compilation is not implemented in V1.');
 if(v.externalDomains.length)fail('External networking requires a separately reviewed provider; V1 generated controls are offline.');
});
export const pcfBindingSchema=z.strictObject({component:name,target:z.enum(['canvas','modelDriven']),surface:z.enum(['field','subgrid','composition']),consumer:z.string().regex(/^(canvas|form):[A-Za-z][\w.]*$/),properties:z.record(name,z.strictObject({resource:z.string().min(1),column:name,type:z.enum(Object.keys(propertyTypes) as [keyof typeof propertyTypes,...(keyof typeof propertyTypes)[]])})).default({}),dataset:z.strictObject({resource:z.string().min(1),columns:z.record(name,name)}).optional(),slot:z.enum(['data.view','form.fields']).optional(),modelDrivenHost:z.discriminatedUnion('kind',[fieldBindingIntentSchema.extend({kind:z.literal('field')}),datasetBindingIntentSchema.extend({kind:z.literal('dataset')})]).optional()});
export const pcfSchema=z.strictObject({components:z.record(name,pcfComponentSchema),bindings:z.record(name,pcfBindingSchema).default({})}).superRefine((v,c)=>{const seen=new Set<string>();for(const component of Object.values(v.components)){const id=component.namespace+'.'+component.constructor;if(seen.has(id.toLowerCase()))c.addIssue({code:'custom',message:'Duplicate namespace/constructor: '+id});seen.add(id.toLowerCase());}});
export type PCFComponentIR=z.infer<typeof pcfComponentSchema>;
export type PCFSource=z.infer<typeof pcfSchema>;
export const pcfIdentity=(c:Pick<PCFComponentIR,'namespace'|'constructor'>)=>c.namespace+'.'+c.constructor;
