import { compileWorkflowConnector } from './workflow-providers.js';
import type { DataSource, Expr, FlowAction, FlowResources, FlowSpec, ValueShape } from './schema.js';
import { compatible, expression, fail } from './expressions.js';
import type { ExpressionContext } from './expressions.js';

export type Risk = 'READ' | 'WRITE_INTERNAL' | 'WRITE_EXTERNAL' | 'DESTRUCTIVE';
export const providers = {
  approvals:{connector:'shared_approvals',metadata:'Bounded Basic / BasicAwaitAll contract',documentation:'https://learn.microsoft.com/en-us/connectors/approvals/'},
  word:{connector:'shared_wordonlinebusiness',metadata:'External Word plain-text content-control contract',documentation:'https://learn.microsoft.com/en-us/connectors/wordonlinebusiness/'},
  dataverse: { connector: 'shared_commondataserviceforapps', metadata: 'Dataverse EntityDefinitions/Attributes', documentation: 'https://learn.microsoft.com/en-us/connectors/commondataserviceforapps/' },
  sharepoint: { connector: 'shared_sharepointonline', metadata: 'SharePoint REST list Fields (internal names)', documentation: 'https://learn.microsoft.com/en-us/connectors/sharepoint/' },
  outlook: { connector: 'shared_office365', metadata: 'Static SendEmailV2 contract; authenticated mailbox connection', documentation: 'https://learn.microsoft.com/en-us/connectors/office365/' },
} as const;
export const connectorOperations: Record<string, { provider:keyof typeof providers; operation:string; risk:Risk; required:string[]; output:string }> = {
  'approvals.create':{provider:'approvals',operation:'CreateAnApproval',risk:'WRITE_EXTERNAL',required:['approvalType','assignedTo','title','enableNotifications'],output:'name only; no completed decision'},
  'approvals.wait':{provider:'approvals',operation:'WaitForAnApproval',risk:'READ',required:['approvalId','timeoutHours'],output:'outcome and responses after successful completion'},
  'approvals.startAndWait':{provider:'approvals',operation:'StartAndWaitForAnApproval',risk:'WRITE_EXTERNAL',required:['approvalType','assignedTo','title','enableNotifications','timeoutHours'],output:'name, outcome and responses after successful completion'},
  'word.populateTemplate':{provider:'word',operation:'CreateFileItem',risk:'READ',required:['template','fields'],output:'DOCX binary; not a saved file'},
  'word.convertToPdf':{provider:'word',operation:'GetFilePDF',risk:'READ',required:['source','drive','file'],output:'PDF binary; not a saved file'},
  'dataverse.getRow': {provider:'dataverse',operation:'GetItem',risk:'READ',required:['table','id','select'],output:'selected record; shape or metadata required'},
  'dataverse.listRows': {provider:'dataverse',operation:'ListRecords',risk:'READ',required:['table','select','top'],output:'value array; shape or metadata required'},
  'dataverse.addRow': {provider:'dataverse',operation:'CreateRecord',risk:'WRITE_INTERNAL',required:['table','metadata','fields'],output:'metadata record'},
  'dataverse.updateRow': {provider:'dataverse',operation:'UpdateOnlyRecord',risk:'WRITE_INTERNAL',required:['table','metadata','id','fields'],output:'metadata record'},
  'sharepoint.getItems': {provider:'sharepoint',operation:'GetItems',risk:'READ',required:['site','list','metadata','top'],output:'value array'},
  'sharepoint.getFileMetadata': {provider:'sharepoint',operation:'GetFileMetadata',risk:'READ',required:['site','id'],output:'file metadata'},
  'sharepoint.getFileContent': {provider:'sharepoint',operation:'GetFileContent',risk:'READ',required:['site','id'],output:'binary'},
  'sharepoint.createItem': {provider:'sharepoint',operation:'PostItem',risk:'WRITE_INTERNAL',required:['site','list','metadata','fields'],output:'metadata record'},
  'sharepoint.updateItem': {provider:'sharepoint',operation:'PatchItem',risk:'WRITE_INTERNAL',required:['site','list','metadata','id','fields'],output:'metadata record'},
  'sharepoint.createFile': {provider:'sharepoint',operation:'CreateFile',risk:'WRITE_INTERNAL',required:['site','folder','fileName','content'],output:'file metadata'},
  'sharepoint.updateFileProperties': {provider:'sharepoint',operation:'PatchFileItem',risk:'WRITE_INTERNAL',required:['site','list','metadata','id','fields'],output:'metadata record'},
  'outlook.sendEmail': {provider:'outlook',operation:'SendEmailV2',risk:'WRITE_EXTERNAL',required:['to','subject','body'],output:'none (delivery is not certified)'},
};
export function dataSource(resources:FlowResources,key:string|undefined,connector:string):DataSource {
  const source=key&&resources.flowDataSources?.[key];
  if(!source||source.connector!==connector)fail('Missing or wrong-provider metadata contract. Discover target metadata before compilation.');
  return source;
}
export function rowShape(source:DataSource):ValueShape {return {type:'object',fields:Object.fromEntries(Object.entries(source.columns).filter(([,c])=>c.readable&&!['recordRef','object','array','binary'].includes(c.shape.type)).map(([k,c])=>[k,c.shape]))};}
export function typedFields(a:FlowAction,source:DataSource,c:ExpressionContext) {
  const create=['dataverse.addRow','sharepoint.createItem'].includes(a.use);
  if(create)for(const [key,column]of Object.entries(source.columns))if(column.required&&column.create&&!a.fields?.[key])fail(`Required field ${key} is missing.`);
  return Object.fromEntries(Object.entries(a.fields??{}).map(([key,e])=>{
    const column=source.columns[key];
    if(!column||!column[create?'create':'update'])fail(`Unknown or non-writable internal column ${key}.`);
    // Complex connector encodings need their own verified adapters, not string coercion.
    if(['object','array','recordRef','binary'].includes(column.shape.type))fail(`Complex lookup/person/multichoice/file column ${key} is not implemented.`);
    const value=expression(e,c);if(!compatible(value.shape,column.shape))fail(`Column ${key} type mismatch.`);
    if(column.choices&&(e.op!=='literal'||!column.choices.includes(e.value as string|number)))fail(`Choice ${key} requires a valid discovered literal value.`);
    return ['item/'+key,'@'+value.code];
  }));
}
export function filterCode(filter:NonNullable<FlowAction['filter']>,source:DataSource,c:ExpressionContext):string {
  const column=source.columns[filter.column];const v=expression(filter.value,c);
  if(!column?.readable||!compatible(v.shape,column.shape)||!['string','integer','number','boolean','guid'].includes(v.shape.type))fail('Filter column or scalar value is invalid.');
  if(filter.value.op!=='literal')fail('V2 filters require typed literals; dynamic OData escaping is not implemented.');
  const raw=filter.value.value;
  return `${filter.column} ${filter.operator} ${typeof raw==='string'?"'"+raw.replaceAll("'","''")+"'":String(raw)}`;
}
const blob:ValueShape={type:'object',fields:{ItemId:{type:'integer'},Id:{type:'string'},Name:{type:'string'},Path:{type:'string'},Size:{type:'integer'},IsFolder:{type:'boolean'}}};
export function compileConnector(a:FlowAction,resources:FlowResources,c:ExpressionContext) {
  const op=connectorOperations[a.use];if(!op)fail('Unsupported connector action.');
  const provider=providers[op.provider],ref=resources.connectionReferences[a.connection!];
  if(ref?.connector!==provider.connector)fail('Action connection reference belongs to the wrong connector.');
  if(op.provider==='approvals'||op.provider==='word')return compileWorkflowConnector(a,resources,c,provider.connector,op.operation,op.risk);
  const ex=(e:Expr|undefined,type:ValueShape['type'])=>{if(!e)fail('Required connector parameter missing.');const v=expression(e,c);if(!compatible(v.shape,{type}))fail(`Invalid ${a.use} parameter type; expected ${type}.`);return '@'+v.code;};
  let parameters:Record<string,unknown>={},output:ValueShape|undefined;
  const source=a.metadata?dataSource(resources,a.metadata,provider.connector):undefined;
  if(op.provider==='dataverse'){
    parameters.entityName=a.table;
    if(a.id)parameters.recordId=ex(a.id,'guid');
    if(a.select){
      const inferred=source?{type:'object' as const,fields:Object.fromEntries(a.select.map(k=>{const col=source.columns[k];if(!col?.readable||col.shape.type==='recordRef')fail('Selected metadata field is unreadable or unsupported.');return [k,col.shape];}))}:undefined;
      const shape=a.shape??inferred;
      if(shape?.type!=='object'||a.select.some(k=>!shape.fields?.[k])||Object.keys(shape.fields!).some(k=>!a.select!.includes(k))||(inferred&&a.shape&&!compatible(a.shape,inferred)))fail('Dataverse read shape must match selected columns exactly.');parameters.$select=a.select.join(',');output=shape;
    }
    if(a.top)parameters.$top=a.top;
    if(source){if(source.table!==a.table||source.kind!=='table')fail('Dataverse metadata table identity mismatch.');if(a.fields){Object.assign(parameters,typedFields(a,source,c));output=rowShape(source);}}
    if(a.use==='dataverse.listRows')output={type:'object',fields:{value:{type:'array',items:output!}}};
  } else if(op.provider==='sharepoint'){
    parameters.dataset=ex(a.site,'string');
    if(a.list)parameters.table=ex(a.list,'string');
    if(source){
      if(source.kind==='table'||(a.use==='sharepoint.updateFileProperties'&&source.kind!=='library')||(['sharepoint.createItem','sharepoint.updateItem'].includes(a.use)&&source.kind!=='list'))fail('SharePoint item/file metadata kind mismatch.');
      output=rowShape(source);
      if(a.fields)Object.assign(parameters,typedFields(a,source,c));
    }
    if(a.id){const item=!!a.list;parameters.id=ex(a.id,item?'integer':'string');if(a.id.op==='literal'&&(item?Number(a.id.value)<1:!String(a.id.value).trim()))fail('SharePoint identity must be a positive item ID or nonempty file identifier.');}
    if(a.use==='sharepoint.getItems'){parameters.$top=a.top;if(a.filter)parameters.$filter=filterCode(a.filter,source!,c);output={type:'object',fields:{value:{type:'array',items:output!}}};}
    if(a.use==='sharepoint.createFile'){
      // File paths are constrained constants/configuration, never composed from untrusted user input.
      for(const e of [a.folder!,a.fileName!])if(!['literal','environment'].includes(e.op))fail('File path/name must be a literal or environment configuration.');
      if(a.folder!.op==='literal')validateFilePath(String(a.folder!.value));
      if(a.fileName!.op==='literal')validateFileName(String(a.fileName!.value));
      parameters={...parameters,folderPath:ex(a.folder,'string'),name:a.conflict==='uniqueSuffix'?uniqueFileName(ex(a.fileName,'string').slice(1)):ex(a.fileName,'string'),body:ex(a.content,'binary')};output=blob;
    }
    if(a.use==='sharepoint.getFileMetadata')output=blob;
    if(a.use==='sharepoint.getFileContent')output={type:'binary'};
  } else {
    const recipients=(values:Expr[])=>{if(!values.length)fail('Recipient list cannot be empty.');return `@join(createArray(${values.map(e=>ex(e,'email').slice(1)).join(',')}),';')`;};
    parameters={'emailMessage/To':recipients(a.to!),'emailMessage/Subject':ex(a.subject,'string'),'emailMessage/Body':ex(a.body,'string'),'emailMessage/Importance':a.importance??'Normal'};
    if(a.cc?.length)parameters['emailMessage/Cc']=recipients(a.cc);
    if(a.bcc?.length)parameters['emailMessage/Bcc']=recipients(a.bcc);
  }
  const inputs={host:{apiId:'/providers/Microsoft.PowerApps/apis/'+provider.connector,connectionName:a.connection,operationId:op.operation},parameters};
  // Authentication and retry policy belong inside inputs per the documented connector definition.
  const body={type:'OpenApiConnection',inputs:{...inputs,authentication:"@parameters('$authentication')",...(a.retry?.policy==='default'?{}:{retryPolicy:{type:'none'}})}};
  return {body,output,risk:op.risk};
}
function uniqueFileName(code:string){return `@if(contains(${code},'.'),concat(substring(${code},0,lastIndexOf(${code},'.')),'_',guid(),substring(${code},lastIndexOf(${code},'.'))),concat(${code},'_',guid()))`;}
export function validateFilePath(value:string){if(!value.startsWith('/')||/[\\?#%]/.test(value)||value.split('/').some(p=>p==='.'||p==='..')||value.length<2)fail('File folder must be an absolute library path without traversal/query/encoding.');}
export function validateFileName(value:string){if(!value.trim()||/[\\/:*?"<>|#%]/.test(value)||value==='.'||value==='..'||value.length>128)fail('Invalid bounded file name.');}
export const triggerRegistry={name:'dataverse',operation:'SubscribeWebhookTrigger',connector:providers.dataverse.connector,changes:{rowAdded:1,rowModified:3,rowDeleted:2,rowAddedOrModified:4},scopes:{user:1,businessUnit:2,parentChildBusinessUnit:3,organization:4},parameterPrefix:'subscriptionRequest/'} as const;
export function compileDataverseTrigger(t:Extract<FlowSpec['trigger'],{type:'dataverse'}>,resources:FlowResources,c:ExpressionContext) {
  if(resources.connectionReferences[t.connection]?.connector!==providers.dataverse.connector)fail('Trigger requires a declared Dataverse connection.');
  const source=dataSource(resources,t.metadata,providers.dataverse.connector);
  if(source.kind!=='table'||source.table!==t.table||!source.logicalName)fail('Trigger needs verified entity set and logical table names.');
  for(const key of t.selectColumns??[])if(!source.columns[key]?.readable)fail('Trigger select column does not exist or is unreadable.');
  if(t.selectColumns&&['rowAdded','rowDeleted'].includes(t.changeType))fail('Select columns applies only to modification triggers.');
  const parameters:Record<string,unknown>={'subscriptionRequest/message':triggerRegistry.changes[t.changeType],'subscriptionRequest/entityname':source.logicalName,'subscriptionRequest/scope':triggerRegistry.scopes[t.scope]};
  if(t.selectColumns)parameters['subscriptionRequest/filteringattributes']=t.selectColumns.join(',');
  if(t.filter)parameters['subscriptionRequest/filterexpression']=filterCode(t.filter,source,c);
  c.trigger=rowShape(source);
  return {type:'OpenApiConnectionWebhook',inputs:{host:{apiId:'/providers/Microsoft.PowerApps/apis/'+providers.dataverse.connector,connectionName:t.connection,operationId:triggerRegistry.operation},parameters,authentication:"@parameters('$authentication')"}};
}
