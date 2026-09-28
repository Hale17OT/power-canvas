import {z} from 'zod';

const key=z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/).max(64);
export const spRef=z.string().regex(/^sharepoint\.(site|list|library|column|contentTypeBase|contentType|contentTypeColumn|contentTypeBinding|view|folder|permissionBoundary):[A-Za-z][A-Za-z0-9_.]*$/);
const container=z.string().regex(/^sharepoint\.(list|library):[A-Za-z][A-Za-z0-9_]*$/);
const parent=z.string().regex(/^sharepoint\.(site|list|library):[A-Za-z][A-Za-z0-9_]*$/);
const label=z.string().min(1).max(255);
const commonColumn={parent,internalName:key,displayName:label,description:z.string().max(2000).optional(),required:z.boolean().optional(),hidden:z.boolean().optional(),indexed:z.boolean().optional(),unique:z.boolean().optional()};
export const spColumnSchema=z.discriminatedUnion('type',[
 z.strictObject({...commonColumn,type:z.literal('text'),maxLength:z.number().int().min(1).max(255).default(255)}),
 z.strictObject({...commonColumn,type:z.literal('multiline'),lines:z.number().int().min(1).max(100).default(6)}),
 z.strictObject({...commonColumn,type:z.literal('number'),decimals:z.enum(['automatic','none','one','two','three','four','five']).default('automatic'),minimum:z.number().optional(),maximum:z.number().optional()}),
 z.strictObject({...commonColumn,type:z.literal('currency'),locale:z.string().regex(/^[a-z]{2}-[A-Z]{2}$/)}),
 z.strictObject({...commonColumn,type:z.literal('boolean')}),
 z.strictObject({...commonColumn,type:z.enum(['date','datetime'])}),
 z.strictObject({...commonColumn,type:z.enum(['choice','multiChoice']),choices:z.array(label).min(1).max(200),allowTextEntry:z.boolean().default(false),displayAs:z.enum(['dropDownMenu','radioButtons']).optional()}),
 z.strictObject({...commonColumn,type:z.literal('lookup'),source:z.strictObject({list:container,column:key}),multiple:z.boolean().default(false)}),
 z.strictObject({...commonColumn,type:z.enum(['person','multiPerson']),selection:z.enum(['peopleOnly','peopleAndGroups']).default('peopleOnly')}),
 z.strictObject({...commonColumn,type:z.literal('hyperlink')}),
]);
const list={site:key,displayName:label,description:z.string().max(2000).optional(),binding:key.optional(),title:z.strictObject({mode:z.enum(['used','displayAdjusted','optional','hidden']),displayName:label.optional()}).default({mode:'used'})};
const filter=z.strictObject({field:key,operator:z.enum(['eq','neq','lt','le','gt','ge','isNull','isNotNull']),value:z.union([z.string(),z.number(),z.boolean()]).optional()});
export const sharepointSchema=z.strictObject({
 sites:z.record(key,z.strictObject({binding:key,mode:z.literal('existing').default('existing')})).default({}),
 lists:z.record(key,z.strictObject({...list,template:z.literal('genericList').default('genericList')})).default({}),
 libraries:z.record(key,z.strictObject(list)).default({}),
 columns:z.record(key,spColumnSchema).default({}),
 contentTypes:z.record(key,z.strictObject({site:key,name:label,description:z.string().max(2000).optional(),group:label.default('PowerCanvas'),parent:z.string().regex(/^(Item|Document|[A-Za-z][A-Za-z0-9_]*)$/),columns:z.array(key).default([])})).default({}),
 contentTypeBindings:z.record(key,z.strictObject({target:container,contentType:key})).default({}),
 views:z.record(key,z.strictObject({target:container,title:label,fields:z.array(key).min(1).max(50),filters:z.array(filter).max(20).default([]),sorting:z.array(z.strictObject({field:key,direction:z.enum(['asc','desc'])})).max(5).default([]),rowLimit:z.number().int().min(1).max(5000).default(100),default:z.boolean().optional()})).default({}),
 folders:z.record(key,z.strictObject({library:key,path:z.string().min(1).max(400).refine(v=>v.split('/').every(s=>s.length>0&&!['.','..'].includes(s)&&!/[\\:#%?*"<>|]/.test(s)&&![...s].some(c=>c.charCodeAt(0)<32)&&s.trim()===s),'Safe relative folder path required')})).default({}),
 permissions:z.record(key,z.strictObject({target:container,inheritance:z.enum(['inherit','unique']),copyParentAssignments:z.boolean().optional(),assignments:z.array(z.strictObject({principalBinding:key,roleDefinitionId:z.number().int().positive()})).default([])})).default({}),
 bindings:z.strictObject({canvas:z.array(z.strictObject({app:key,alias:key,resource:container})).default([]),flows:z.array(z.strictObject({flow:key,action:key,resource:container})).default([])}).default({canvas:[],flows:[]}),
});
export type SharePointSpec=z.infer<typeof sharepointSchema>;
export type SPColumn=z.infer<typeof spColumnSchema>;
export const siteUrl=z.url().refine(v=>{const u=new URL(v);return u.protocol==='https:'&&/^[a-z0-9-]+\.sharepoint\.com$/.test(u.hostname)&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&!/%2f|%5c|%2e/i.test(v);},'Explicit commercial SharePoint site URL required');
const stable=z.string().min(1).max(500);
export const spTargetSchema=z.strictObject({mode:z.literal('SHAREPOINT_SIMULATION').optional(),tenantId:z.guid(),environment:label,sites:z.record(key,z.strictObject({url:siteUrl,expectedSiteId:stable.optional()})),resources:z.record(key,z.strictObject({site:key,id:stable})).default({})}).superRefine((v,c)=>{if(Object.values(v.sites).some(s=>new URL(s.url).hostname==='powercanvas-simulation.sharepoint.com')&&v.mode!=='SHAREPOINT_SIMULATION')c.addIssue({code:'custom',message:'Simulation identity requires SHAREPOINT_SIMULATION mode'});});
export const spSiteIdentitySchema=z.strictObject({id:stable,hostname:label,path:z.string(),siteCollectionId:z.guid(),webId:z.guid(),webUrl:siteUrl,name:z.string().optional(),displayName:z.string()});
export const spObservedSchema=z.strictObject({resource:spRef.optional(),kind:z.enum(['site','list','library','column','contentTypeBase','contentType','contentTypeColumn','contentTypeBinding','view','folder','permissionBoundary']),id:stable,siteId:stable,parentId:stable,properties:z.record(z.string(),z.json()),etag:z.string().optional(),driveId:stable.optional(),driveListId:stable.optional(),webUrl:z.url().optional(),internalName:z.string().optional()});
export const spReceiptSchema=z.strictObject({resource:spRef,id:stable,siteId:stable,parentId:stable,sourceHash:z.string().regex(/^[a-f0-9]{64}$/),operationId:stable,revision:z.number().int().positive(),baseline:z.record(z.string(),z.json()),readbackHash:z.string().regex(/^[a-f0-9]{64}$/),etag:z.string().optional()});
export const sharepointEvidenceSchema=z.strictObject({configuration:spTargetSchema,observation:z.strictObject({targetHash:z.string().regex(/^[a-f0-9]{64}$/),observedAt:z.iso.datetime(),complete:z.boolean(),details:z.record(z.string(),z.json()).optional(),sites:z.record(key,spSiteIdentitySchema),coverage:z.array(spRef),resources:z.array(spObservedSchema),auth:z.strictObject({graph:z.enum(['HEALTHY','MISSING','FAILED']),rest:z.enum(['HEALTHY','MISSING','FAILED'])})}).optional(),ownership:z.strictObject({projectId:z.guid(),targetHash:z.string().regex(/^[a-f0-9]{64}$/),revision:z.number().int().nonnegative(),receipts:z.array(spReceiptSchema)}).optional()});
export type SPEvidence=z.infer<typeof sharepointEvidenceSchema>;
export type SPObserved=z.infer<typeof spObservedSchema>;
export type SPReceipt=z.infer<typeof spReceiptSchema>;
