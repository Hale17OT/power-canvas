import { connectorOperations, providers } from './providers.js';
const coreRegistry = [
  ['control.terminate','Terminate',['value'],[],'message','failed run'],
  ['workflow.correlation','Compose',['fields'],[],'correlation contract','typed context'],
  ['data.object','Compose',['fields'],[],'typed fields','object'],
  ['control.scope','Scope',['actions'],[],'none','none'],
  ['control.delay','Wait',['seconds'],[],'bounded seconds','none'],
  ['flows.invoke','Workflow',['flow','arguments'],[],'child contract','child outputs'],
  ['flows.respond','Response',['fields'],[],'child outputs','response'],
  ['approvals.responses','Select',['from'],[],'connector responses','normalized responders/comments'],
  ['approvals.result','Compose',['from','approvalId'],[],'completed approval','normalized approval result'],
  ['data.compose','Compose',['value'],[], 'value','value'],
  ['data.parseJson','ParseJson',['value','shape'],[],'string','declared schema'],
  ['data.select','Select',['from','fields'],[],'array','array of projected object'],
  ['data.filterArray','Query',['from','condition'],[],'array + boolean','same array'],
  ['control.condition','If',['condition','actions'],['otherwise'],'boolean','none'],
  ['control.applyToEach','Foreach',['from','maxItems','actions'],[],'bounded array','none'],
  ['variables.initialize','InitializeVariable',['variable','shape','value'],[],'declared value','none'],
  ['variables.set','SetVariable',['variable','value'],[],'same variable type','none'],
  ['variables.append','AppendToArrayVariable',['variable','value'],[],'array element','none'],
  ['powerApps.respond','Response',['fields'],[],'declared outputs','Power Apps response'],
].map(([name,operation,requiredParameters,optionalParameters,inputTypes,outputTypes])=>({name:name as string,operation:operation as string,requiredParameters:requiredParameters as string[],optionalParameters:optionalParameters as string[],inputTypes,outputTypes,connector:String(name).startsWith('dataverse.')?'shared_commondataserviceforapps':null,connectionRequirement:String(name).startsWith('dataverse.'),environmentDependencies:'explicit flow references',risk:'READ' as const,compiler:'typed-v1',validator:'strict-action-schema + scoped type checker'}));
export const actionRegistry = [...coreRegistry.filter(a=>!a.connector), ...Object.entries(connectorOperations).map(([name,o])=>({name,operation:o.operation,requiredParameters:['connection',...o.required],optionalParameters:[...(['dataverse.getRow','dataverse.listRows'].includes(name)?['shape','metadata']:[]),'retry','idempotency'],inputTypes:'provider typed',outputTypes:o.output,connector:providers[o.provider].connector,connectionRequirement:true,environmentDependencies:'explicit flow references and target metadata',risk:o.risk,compiler:'typed-v2',validator:'provider metadata + scoped expressions'}))];
export function actionRecipe(name:string){const r=actionRegistry.find(a=>a.name===name);if(!r)throw new Error('Unsupported flow action');return r;}
export function responsibility(job:'singleRowUpdate'|'uiValidation'|'externalIntegration'|'documentGeneration'|'notification'|'approval'|'scheduledWork'|'backgroundSync'|'multiSystemProcess') {
  return ['singleRowUpdate','uiValidation'].includes(job)?{provider:'PowerFx',reason:'Keep synchronous UI validation and a single data operation in the existing app.'}:{provider:'PowerAutomate',recipe:({documentGeneration:'documentGeneration',notification:'notification',approval:'approval',scheduledWork:'reminder',multiSystemProcess:'childWorkflow',backgroundSync:'postSaveAutomation'} as Record<string,string>)[job]??null,reason:'Use a typed workflow recipe when business lifecycle is required; existing primitives remain available.',remoteWrites:0};
}
