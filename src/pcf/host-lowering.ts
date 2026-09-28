import {type PCFSource,pcfSchema} from './schema.js';
import {lowerModelDrivenFieldPCFBinding,type FieldBindingResolution} from './field-binding.js';
import {lowerModelDrivenDatasetPCFBinding,type DatasetBindingResolution} from './dataset-binding.js';
/** Unified PCF source uses logical identities. Only the planning resolution supplies physical host/view IDs.
 * This emits an offline fragment; it is intentionally not wired to any form-write executor. */
export function lowerResolvedPCFHost(source:PCFSource,key:string,resolution:{kind:'field';value:FieldBindingResolution}|{kind:'dataset';value:DatasetBindingResolution}){
 const parsed=pcfSchema.parse(source),binding=parsed.bindings[key],host=binding?.modelDrivenHost;
 if(!binding||binding.target!=='modelDriven'||!host||host.component!==binding.component||binding.consumer!=='form:'+host.form)throw Error('Missing or inconsistent model-driven host intent');
 const component=parsed.components[binding.component];if(!component||component.implementationSource.kind==='external')throw Error('External component requires explicit adoption outside this lowering path');
 if(host.kind!==resolution.kind||component.kind!==host.kind)throw Error('Host/component kind mismatch');
 if(host.kind==='field'&&resolution.kind==='field'){
  if(binding.surface!=='field'||binding.properties.value?.column!==host.column||binding.properties.value.type!=='string')throw Error('Field property source mismatch');
  const {kind,...intent}=host;void kind;return lowerModelDrivenFieldPCFBinding(intent,{...resolution.value,component});
 }
 if(host.kind==='dataset'&&resolution.kind==='dataset'){
  if(binding.surface!=='subgrid'||binding.dataset?.resource!=='table:'+host.table||Object.entries(host.propertySets).some(([p,col])=>binding.dataset?.columns[p]!==col))throw Error('Dataset property source mismatch');
  const {kind,...intent}=host;void kind;return lowerModelDrivenDatasetPCFBinding(intent,{...resolution.value,component});
 }
 throw Error('Unsupported host contract');
}

