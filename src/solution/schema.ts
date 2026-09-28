import {pcfSchema} from '../pcf/schema.js';
import {z} from 'zod';
import {sharepointSchema,sharepointEvidenceSchema} from '../sharepoint/schema.js';
import {projectSchema, keySchema,appSchema,globalChoiceSchema,roleSchema} from '../ir/schema.js';
import {flowResourcesSchema, deploymentSchema} from '../flows/schema.js';
import {productSchema} from '../canvas/taste/memory.js';
import {designHostSchema} from '../canvas/taste/generation.js';
import {targetSchema, observationSchema, ownershipSchema, planSchema} from '../state/models.js';

export const solutionVersion='powercanvas.solution/v1';
const id=z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.:-]*$/).max(120);
const ids=z.array(id).max(200);
export const sharedTypes=['string','multiline','integer','decimal','currency','percentage','boolean','choice','multiChoice','lookup','person','date','datetime','guid','email','file','fileReference'] as const;
export const referenceSchema=z.strictObject({resource:id,column:z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/).max(64).optional(),expectedType:z.enum(sharedTypes).optional()});
const requirement=z.strictObject({id,statement:z.string().min(5).max(2000),concerns:z.array(z.enum(['data','ui','automation','security','configuration','external'])).min(1),resources:ids.default([])});
const external=z.strictObject({id,kind:z.enum(['sharePointSite','sharePointList','sharePointLibrary','documentTemplate','mailbox','api','connection','table','other']),identity:z.string().min(1).optional(),requiredBy:ids,provisioningMode:z.enum(['existing','manual','unsupported']),resolutionState:z.enum(['unresolved','declared','verified']).default('unresolved'),evidence:z.string().min(10).optional()}).superRefine((v,c)=>{if(v.resolutionState==='verified'&&(!v.identity||!v.evidence))c.addIssue({code:'custom',message:'Verified external identity requires evidence.'});});
const security=z.strictObject({id,requiredBy:ids,principals:z.array(z.string().min(1)).min(1),resources:ids,access:z.enum(['read','write','invoke','approve','admin']),connectionOwnership:z.string().min(1).optional(),status:z.enum(['planned','manual','verified']).default('planned'),evidence:z.string().min(10).optional()}).superRefine((v,c)=>{if(v.status==='verified'&&!v.evidence)c.addIssue({code:'custom',message:'Security verification requires persona evidence.'});});
const need=z.strictObject({id,requiredBy:ids,capability:z.string().min(1),reason:z.string().min(5)});
const field=z.strictObject({type:z.enum(sharedTypes),label:z.string().min(1),required:z.boolean().default(false),choices:z.array(z.string().min(1)).optional(),globalChoice:keySchema.optional(),target:keySchema.optional()});
const entity=z.strictObject({label:z.string().min(1),plural:z.string().min(1),requiredBy:ids,ownership:z.enum(['userOrTeam','organization']),auditing:z.boolean().default(false),fields:z.record(keySchema,field),storage:z.enum(['dataverse','sharepoint']).default('dataverse'),site:keySchema.optional(),rationale:z.string().min(5),keys:z.array(z.array(keySchema).min(1)).default([])});
const experience=z.strictObject({requiredBy:ids,product:productSchema,source:keySchema,fields:z.array(keySchema).min(1).max(8),host:designHostSchema.optional(),jobBoundary:z.string().min(20).optional(),delivery:z.enum(['auto','canvas','modelDriven']).optional(),workload:z.enum(['administration','selfService','mobile']).optional(),model:appSchema.optional()});
export const personaSchema=z.strictObject({id,requiredBy:ids,roles:z.array(keySchema).min(1),apps:ids,tableAccess:roleSchema.shape.tables,flowAccess:ids.default([]),evidence:z.string().min(10).optional()});
const common={pcf:pcfSchema.optional(),sharepoint:sharepointSchema.optional(),personas:z.array(personaSchema).optional(),apiVersion:z.literal(solutionVersion),requirements:z.array(requirement).min(1).max(200),externalDependencies:z.array(external).max(200).default([]),security:z.array(security).max(100).default([]),unsupportedNeeds:z.array(need).default([]),references:z.array(z.strictObject({from:id,to:referenceSchema})).default([]),profile:z.enum(['experimental','production']).default('experimental')};
export const solutionSpecSchema=z.discriminatedUnion('mode',[
 z.strictObject({...common,mode:z.literal('explicit'),project:projectSchema,products:z.record(keySchema,productSchema).default({})}),
 z.strictObject({...common,mode:z.literal('intent'),identity:projectSchema.pick({apiVersion:true,project:true,solution:true}),choices:z.record(keySchema,globalChoiceSchema).optional(),securityModel:projectSchema.shape.security.optional(),entities:z.record(keySchema,entity),experiences:z.record(keySchema,experience),processes:z.array(z.strictObject({id,requiredBy:ids,job:z.enum(['singleRowUpdate','uiValidation','externalIntegration','documentGeneration','notification','approval','scheduledWork','backgroundSync','multiSystemProcess']),implementation:keySchema.optional()})).default([]),automation:flowResourcesSchema.default({flows:{},connectionReferences:{},environmentVariables:{},canvasBindings:[]}),automationRequirements:z.record(keySchema,ids).default({})}),
]);
export type SolutionSpec=z.infer<typeof solutionSpecSchema>;
export type SharedType=typeof sharedTypes[number];
export const states=['CREATE','UPDATE','DEFERRED_REQUIRES_PUBLICATION','NO_OP','BLOCKED','CONFLICT','EXTERNAL','ORPHANED','UNSUPPORTED'] as const;
export const stages=['DATA','CONFIGURATION','AUTOMATION','MODEL_APP','APPLICATION','BINDINGS','VALIDATION','ACTIVATION'] as const;
export type Stage=typeof stages[number];
export type OwnershipState='POWERCANVAS_OWNED'|'ADOPTED'|'EXTERNAL'|'UNKNOWN';
export type CapabilityState='SUPPORTED'|'SUPPORTED_WITH_LIMITS'|'COMPILE_ONLY'|'EXTERNAL_BLOCKED'|'BLOCKED'|'PLANNED';
export interface CapabilityResolution {status:CapabilityState;schema:boolean;compile:boolean;deploy:boolean;runtime:boolean;production:boolean;limitations:string[]}
export interface ResourceIR {id:string;kind:string;subsystem:'dataverse'|'model-driven'|'canvas'|'flows'|'configuration'|'external'|'security'|'unsupported'|'sharepoint'|'pcf';stage:Stage;physicalName:string|null;requiredBy:string[];dependencies:string[];definition:unknown;definitionHash:string;ownership:OwnershipState;state:typeof states[number];reason:string;capability:CapabilityResolution;nativeId?:string;existingId?:string}
export interface Issue {code:string;severity:'error'|'warning';resource?:string;message:string}
// Dataverse proofs retain the existing native schema/ownership/plan formats. Never reinterpret a display name as ownership.
export const evidenceSchema=z.strictObject({sharepoint:sharepointEvidenceSchema.optional(),executionOutcomes:z.strictObject({unknown:z.array(z.string()),journalHashes:z.array(z.string().regex(/^[a-f0-9]{64}$/))}).optional(),deploymentChecks:z.strictObject({configurationResolved:z.boolean(),checksComplete:z.boolean()}).optional(),target:targetSchema.optional(),observedAt:z.iso.datetime().optional(),dataverse:z.strictObject({observation:observationSchema,ownership:ownershipSchema.optional(),plan:planSchema}).optional(),readOnlyBindings:z.array(z.strictObject({resource:id,remoteId:z.guid(),definitionHash:z.string().regex(/^[a-f0-9]{64}$/),ownership:z.enum(['POWERCANVAS_OWNED','ADOPTED','EXTERNAL']),evidence:z.string().min(10)})).default([]),authoring:z.enum(['UNKNOWN','AUTHORING_UNAVAILABLE','DEGRADED_READ_ONLY','HEALTHY']).default('UNKNOWN')});
export type SolutionEvidence=z.infer<typeof evidenceSchema>;
// Flow evidence is loaded by its existing planner; no second operation schema or payload generator.
export const flowEvidenceSchema=z.strictObject({plan:z.json(),snapshot:z.json(),ownership:z.json(),deployment:deploymentSchema});
