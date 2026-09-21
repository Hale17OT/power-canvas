import { z } from 'zod';
import type { Project } from '../ir/schema.js';
import type { Observation, PlannedOperation } from '../state/models.js';
import type { DataverseHttp } from './http.js';
import { metadataPath } from './discovery.js';
import { columnPayload, nativeLabel, publishXml, relationshipPayload, tablePayload } from './payloads.js';
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
    case 'createColumn': await mutate('create', `${metadataPath(textValue(properties.tableSchemaName))}/Attributes`, 'POST', columnPayload(properties), headers); return;
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
      await mutate('update', path, 'PUT', native, { ...headers, 'MSCRM.MergeLabels': 'true' }); return;
    }
    case 'publish': await mutate('publish', 'PublishXml', 'POST', { ParameterXml: publishXml(z.array(z.string()).parse(properties.tables)) }); return;
    default: throw new PowerCanvasError('PF-CAPABILITY-001', 'The reviewed action is unavailable in the Dataverse executor.', 'Use only the implemented schema operation set.');
  }
}

/** Explicit membership is part of the reviewed create operation's solutionMember postcondition. */
export async function ensureMembership(project: Project, operation: PlannedOperation, observed: Observation, http: DataverseHttp, mutate: Mutation): Promise<void> {
  const resource = observed.resources.find(item => item.resourceId === operation.resourceId);
  if (!resource || resource.properties.solutionMember === undefined || resource.properties.solutionMember === true) return;
  const types: Record<string, number> = { table: 1, column: 2, relationship: 10 };
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
