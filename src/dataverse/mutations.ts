import {canonicalGlobalChoiceName} from './global-choice.js';
import { z } from 'zod';
import type { Project } from '../ir/schema.js';
import type { Observation, PlannedOperation } from '../state/models.js';
import type { DataverseHttp } from './http.js';
import { metadataPath } from './discovery.js';
import { columnPayload, nativeLabel, publishXml, relationshipPayload, tablePayload,choicePayload,keyPayload } from './payloads.js';
import { attributeCasts, guidValue, rawObject, textValue } from './normalize.js';
import { PowerCanvasError } from '../core/errors.js';

export type Mutation = (step: string, path: string, method: string, body: unknown, headers?: Record<string, string>) => Promise<void>;
export async function mutateSchema(project: Project, operation: PlannedOperation, observed: Observation, http: DataverseHttp, mutate: Mutation): Promise<void> {
  const properties = operation.after;
  if (!properties) throw new PowerCanvasError('PF-PLAN-009', 'Operation has no desired metadata.', 'Regenerate the saved plan.');
  const headers = { 'MSCRM.SolutionUniqueName': project.solution.uniqueName };
  const kind = operation.resourceId.split(':')[3];
  const schemaName = properties.schemaName;
  switch (operation.action) {
    case 'createPublisher': await mutate('create', 'publishers', 'POST', { uniquename: properties.uniqueName, friendlyname: properties.uniqueName,
      customizationprefix: properties.prefix, customizationoptionvalueprefix: properties.optionValuePrefix }); return;
    case 'createSolution': {
      const publisher = observed.resources.find(resource => resource.kind === 'publisher' && resource.schemaName === project.solution.publisher.uniqueName);
      if (!publisher) throw new PowerCanvasError('PF-PLAN-010', 'Verified publisher dependency is missing.', 'Reobserve before applying.');
      await mutate('create', 'solutions', 'POST', { uniquename: properties.uniqueName, friendlyname: properties.displayName, version: properties.version,
        'publisherid@odata.bind': `/publishers(${guidValue(publisher.remoteId)})` }); return;
    }
    case 'createTable': await mutate('create', 'EntityDefinitions', 'POST', tablePayload(properties), headers); return;
    case 'createChoice':await mutate('create','GlobalOptionSetDefinitions','POST',choicePayload(properties),headers);return;
    case 'createKey':{
      const payload=keyPayload(properties); // Validate locally before reads or writes.
      const table=observed.resources.find(r=>r.kind==='table'&&r.properties.schemaName===properties.tableSchemaName);
      if(!table)throw new PowerCanvasError('PF-PLAN-010','Verified key parent is missing.','Reobserve the owned parent before apply.');
      payload.KeyAttributes=payload.KeyAttributes.map(logical=>{
        const column=observed.resources.find(r=>r.kind==='column'&&r.properties.tableSchemaName===properties.tableSchemaName&&String(r.properties.schemaName).toLowerCase()===logical);
        const primary=rawObject(table.properties.primaryColumn);
        const actual=column?.properties.logicalName??(String(primary.schemaName).toLowerCase()===logical?table.properties.primaryNameAttribute:undefined);
        if(actual!==logical)throw new PowerCanvasError('PF-DV-007','Key attribute logical identity is missing or differs from the reviewed plan.','Run fresh discovery; do not infer or change key identities at runtime.');
        return textValue(actual);
      });
      await mutate('create',`${metadataPath(textValue(properties.tableSchemaName))}/Keys`,'POST',payload,headers);return;
    }
    case 'createColumn': {
      const payload=columnPayload(properties);
      if(properties.globalOptionSetName){
        const candidates=observed.resources.filter(r=>r.kind==='choice'&&r.provider==='dataverse'&&r.properties.schemaName===canonicalGlobalChoiceName(properties.globalOptionSetName));
        if(candidates.length!==1||candidates[0]!.properties.solutionMember!==true)throw new PowerCanvasError('PF-PLAN-010','Verified global choice dependency is missing or ambiguous.','Reobserve the owned global choice before applying.');
        payload['GlobalOptionSet@odata.bind']=`/GlobalOptionSetDefinitions(${guidValue(candidates[0]!.remoteId)})`;
      }
      await mutate('create', `${metadataPath(textValue(properties.tableSchemaName))}/Attributes`, 'POST', payload, headers); return;
    }
    case 'createRelationship': {
      for (const [action, property] of [['CanBeReferencing', 'fromTableSchemaName'], ['CanBeReferenced', 'toTableSchemaName']] as const) {
        // These documented POST actions are read-only eligibility checks, not mutations.
        const response = rawObject((await http.request(action, 'POST', { EntityName: textValue(properties[property]).toLowerCase() })).data);
        if (response[action] !== true) throw new PowerCanvasError('PF-DV-006', 'Relationship eligibility check failed.', 'Use supported tables and inspect relationship restrictions.');
      }
      await mutate('create', 'RelationshipDefinitions', 'POST', relationshipPayload(properties), headers); return;
    }
    case 'updateOwnedProperties': {
      const current = observed.resources.find(resource => resource.resourceId === operation.resourceId);
      if (!current) throw new PowerCanvasError('PF-PLAN-010', 'Update target is missing.', 'Create and review a fresh plan.');
      if (kind === 'solution') {
        await mutate('update', `solutions(${guidValue(current.remoteId)})`, 'PATCH', { friendlyname: properties.displayName }); return;
      }
      if(kind==='choice'||kind==='column'&&properties.type==='choice'){
        const after=z.array(z.object({value:z.int(),label:z.string()})).parse(properties.options??properties.choices),before=z.array(z.object({value:z.int(),label:z.string()})).parse(operation.before?.options??operation.before?.choices);
        const context=kind==='choice'?{OptionSetName:canonicalGlobalChoiceName(properties.schemaName)}:{EntityLogicalName:textValue(properties.tableSchemaName).toLowerCase(),AttributeLogicalName:textValue(properties.schemaName).toLowerCase()};
        for(const o of after){const old=before.find(v=>v.value===o.value);if(!old||old.label!==o.label)await mutate('option-'+o.value,old?'UpdateOptionValue':'InsertOptionValue','POST',{...context,Value:o.value,Label:nativeLabel(o.label),...(old?{MergeLabels:true}:{}),SolutionUniqueName:project.solution.uniqueName},headers);}
        if(kind==='choice'){if(operation.before?.displayName!==properties.displayName){const native=rawObject((await http.request(`GlobalOptionSetDefinitions(${guidValue(current.remoteId)})`)).data);delete native.Options;delete native['@odata.context'];native.DisplayName=nativeLabel(textValue(properties.displayName));await mutate('label',`GlobalOptionSetDefinitions(${guidValue(current.remoteId)})`,'PUT',native,{...headers,'MSCRM.MergeLabels':'true'});}return;}
      }
      const path = kind === 'table' ? metadataPath(textValue(schemaName)) : `${metadataPath(textValue(properties.tableSchemaName))}/Attributes(${guidValue(current.remoteId)})`;
      // Dataverse metadata updates use PUT of the retrieved definition, preserving unknown fields and labels.
      let native = rawObject((await http.request(path)).data);
      if (kind === 'column') {
        const cast = attributeCasts[textValue(native.AttributeType)];
        if (!cast) throw new PowerCanvasError('PF-CAPABILITY-001', 'Cannot preserve this column type for update.', 'Use a supported ordinary column type.');
        native = rawObject((await http.request(`${path}/Microsoft.Dynamics.CRM.${cast}${['Picklist', 'Boolean'].includes(textValue(native.AttributeType)) ? '?$expand=OptionSet' : ''}`)).data);
      }
      delete native['@odata.context']; delete native['@odata.etag'];
      native.DisplayName = nativeLabel(textValue(properties.displayName));
      if (kind === 'table') native.DisplayCollectionName = nativeLabel(textValue(properties.pluralName));
      if(kind==='table'){native.IsAuditEnabled={Value:properties.auditing};if(properties.description!==undefined)native.Description=nativeLabel(textValue(properties.description));}
      if(kind==='column'&&properties.maxLength!==undefined)native.MaxLength=properties.maxLength;
      await mutate('update', path, 'PUT', native, { ...headers, 'MSCRM.MergeLabels': 'true' }); return;
    }
    case 'publish': await mutate('publish', 'PublishXml', 'POST', { ParameterXml: publishXml(z.array(z.string()).parse(properties.tables),z.array(z.string()).parse(properties.choices??[])) }); return;
    default: throw new PowerCanvasError('PF-CAPABILITY-001', 'The reviewed action is unavailable in the Dataverse executor.', 'Use only the implemented schema operation set.');
  }
}

/** Explicit membership is part of the reviewed create operation's solutionMember postcondition. */
export async function ensureMembership(project: Project, operation: PlannedOperation, observed: Observation, http: DataverseHttp, mutate: Mutation): Promise<void> {
  const resource = observed.resources.find(item => item.resourceId === operation.resourceId);
  if (!resource || resource.properties.solutionMember === undefined || resource.properties.solutionMember === true) return;
  const types: Record<string, number> = { table: 1, column: 2, relationship: 10,choice:9,key:14 };
  const add = async (step: string, id: string, type: number) => mutate(step, 'AddSolutionComponent', 'POST', {
    ComponentId: guidValue(id), ComponentType: type, SolutionUniqueName: project.solution.uniqueName, AddRequiredComponents: false, DoNotIncludeSubcomponents: true,
  });
  await add('membership', resource.remoteId, types[resource.kind]!);
  if (resource.kind === 'table') {
    const primary = rawObject(resource.properties.primaryColumn);
    const rows = await http.all(`${metadataPath(resource.schemaName)}/Attributes?$select=MetadataId,SchemaName`);
    const attribute = rows.find(row => row.SchemaName === primary.schemaName);
    if (!attribute) throw new PowerCanvasError('PF-DV-005', 'Primary name attribute is missing for membership.', 'Inspect the partial creation.');
    await add('primary-membership', guidValue(attribute.MetadataId), 2);
  }
  if (resource.kind === 'relationship') {
    const lookup = rawObject(resource.properties.lookup);
    const rows = await http.all(`${metadataPath(textValue(resource.properties.fromTableSchemaName))}/Attributes?$select=MetadataId,SchemaName`);
    const attribute = rows.find(row => row.SchemaName === lookup.schemaName);
    if (!attribute) throw new PowerCanvasError('PF-DV-005', 'Created lookup is not visible for solution membership.', 'Reobserve the partial operation before retry.');
    await add('lookup-membership', guidValue(attribute.MetadataId), 2);
  }
}
