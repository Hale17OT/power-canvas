import {normalizeKey} from './key.js';
import {readGlobalChoice} from './global-choice.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Project } from '../ir/schema.js';
import { nameSchema } from '../ir/schema.js';
import type { Observation, Ownership, Target } from '../state/models.js';
import { DATAVERSE_VERSION, discoveryScope } from './desired.js';
import type { DesiredResource, Resource } from './desired.js';
import { attributeCasts, guidValue, normalizeColumn, normalizeRelationship, normalizeTable, rawObject, textValue,label } from './normalize.js';
import type { Raw } from './normalize.js';
import { DataverseHttp } from './http.js';
import { PowerCanvasError } from '../core/errors.js';

export const metadataPath = (schemaName: string): string => `EntityDefinitions(LogicalName='${nameSchema.parse(schemaName).toLowerCase()}')`;
export class DataverseDiscovery {
  constructor(readonly http: DataverseHttp) {}
  async attribute(table: string, raw: Raw): Promise<Raw> {
    if(raw.AttributeType==='Virtual'&&rawObject(raw.AttributeTypeName??{}).Value!=='MultiSelectPicklistType')return raw;
    const cast = attributeCasts[textValue(raw.AttributeType)];
    if (!cast) return raw;
    const expanded = ['Picklist', 'Boolean','Virtual'].includes(textValue(raw.AttributeType)) ? '?$expand=OptionSet' : '';
    return rawObject((await this.http.request(`${metadataPath(table)}/Attributes(${guidValue(raw.MetadataId)})/Microsoft.Dynamics.CRM.${cast}${expanded}`)).data);
  }
  async observe(project: Project, target: Target, ownership?: Ownership): Promise<Observation> {
    const scope = discoveryScope(project, ownership); const resources: Resource[] = [];
    // Read all table identities once. Attributes are limited to desired/owned table scope.
    const tables = await this.http.all('EntityDefinitions?$select=SchemaName,LogicalName,MetadataId');
    const tableCache = new Map<string, { raw: Raw; attributes: Raw[] }>();
    const readTable = async (schema: string) => {
      const key = schema.toLowerCase(); if (tableCache.has(key)) return tableCache.get(key);
      if (!tables.some(table => textValue(table.SchemaName).toLowerCase() === key)) return undefined;
      const raw = rawObject((await this.http.request(metadataPath(schema))).data);
      const attributes = await this.http.all(`${metadataPath(schema)}/Attributes?$select=SchemaName,LogicalName,MetadataId,AttributeType,AttributeTypeName,DisplayName,RequiredLevel,IsManaged,IsCustomizable`);
      const value = { raw, attributes }; tableCache.set(key, value); return value;
    };
    const publisherName = nameSchema.parse(project.solution.publisher.uniqueName);
    const publisherPrefix = nameSchema.parse(project.solution.publisher.prefix);
    const publishers = await this.http.all(`publishers?$select=publisherid,uniquename,customizationprefix,customizationoptionvalueprefix&$filter=uniquename eq '${publisherName}' or customizationprefix eq '${publisherPrefix}'`);
    if (publishers.some(item => textValue(item.uniquename).toLowerCase() !== publisherName.toLowerCase())) throw new PowerCanvasError('PF-DV-004', 'The requested publisher prefix is already in use by another publisher.', 'Choose an unused experiment namespace; existing publishers cannot be adopted.');
    const solutions = await this.http.all(`solutions?$select=solutionid,uniquename,friendlyname,version,ismanaged,_publisherid_value&$filter=uniquename eq '${nameSchema.parse(project.solution.uniqueName)}'`);
    if (publishers.length > 1 || solutions.length > 1) throw new PowerCanvasError('PF-DV-004', 'Ambiguous publisher or solution identity.', 'Resolve collisions before planning.');
    const solution = solutions[0];
    const members = solution ? await this.http.all(`solutioncomponents?$select=objectid,componenttype,rootcomponentbehavior&$filter=_solutionid_value eq ${guidValue(solution.solutionid)}`) : [];
    const member = (id: string, type: number): boolean => members.some(item => guidValue(item.objectid) === id && item.componenttype === type);
    const includesAttributes = (tableId: string): boolean => members.some(item => guidValue(item.objectid) === tableId && item.componenttype === 1 && item.rootcomponentbehavior === 0);
    const add = (spec: DesiredResource, raw: Raw, id: string, properties: Resource['properties']) => {
      resources.push({ resourceId: spec.resourceId, remoteId: id, provider: 'dataverse', kind: spec.kind, schemaName: spec.schemaName,
        properties: { ...properties, isManaged: raw.IsManaged === true || raw.ismanaged === true,
          customizable: raw.IsCustomizable === undefined ? true : z.boolean().parse(rawObject(raw.IsCustomizable).Value) } });
    };
    for (const spec of scope) {
      if (spec.kind === 'publisher') {
        const raw = publishers.find(item => textValue(item.uniquename).toLowerCase() === spec.schemaName.toLowerCase()); if (!raw) continue;
        add(spec, raw, guidValue(raw.publisherid), { uniqueName: textValue(raw.uniquename), prefix: textValue(raw.customizationprefix), optionValuePrefix: z.int().parse(raw.customizationoptionvalueprefix) });
      } else if (spec.kind === 'solution') {
        if (!solution || textValue(solution.uniquename).toLowerCase() !== spec.schemaName.toLowerCase()) continue;
        add(spec, solution, guidValue(solution.solutionid), { uniqueName: textValue(solution.uniquename), displayName: textValue(solution.friendlyname), version: textValue(solution.version),
          publisherUniqueName: publishers.find(item => guidValue(item.publisherid) === guidValue(solution._publisherid_value)) ? project.solution.publisher.uniqueName : 'unknown-publisher' });
      } else if(spec.kind==='choice'){
        const raw=await readGlobalChoice(this.http,spec.schemaName,ownership?.resources.find(r=>r.resourceId===spec.resourceId)?.remoteId);if(!raw)continue;const id=guidValue(raw.MetadataId);
        add(spec,raw,id,{schemaName:textValue(raw.Name),optionSetType:textValue(raw.OptionSetType),isGlobal:z.boolean().parse(raw.IsGlobal),displayName:label(raw.DisplayName),options:z.array(z.record(z.string(),z.unknown())).parse(raw.Options).map(o=>({value:z.int().parse(o.Value),label:label(o.Label)})).sort((a,b)=>a.value-b.value),solutionMember:member(id,9)});
      } else if(spec.kind==='key'){
        const tableName=textValue(spec.properties.tableSchemaName),table=await readTable(tableName);if(!table)continue;
        const keys=await this.http.all(`${metadataPath(tableName)}/Keys`),matches=keys.filter(k=>textValue(k.SchemaName).toLowerCase()===spec.schemaName.toLowerCase());if(matches.length>1)throw new Error('Ambiguous alternate key identity');if(!matches.length)continue;
        const raw=matches[0]!,id=guidValue(raw.MetadataId);add(spec,raw,id,normalizeKey(raw,table.raw,tableName,member(id,14)||includesAttributes(guidValue(table.raw.MetadataId))));
      } else if (spec.kind === 'table') {
        const table = await readTable(spec.schemaName); if (!table) continue;
        const primary = table.attributes.find(item => item.LogicalName === table.raw.PrimaryNameAttribute);
        if (!primary) throw new PowerCanvasError('PF-DV-005', 'Primary-name metadata is incomplete.', 'Do not plan from incomplete metadata.');
        const id = guidValue(table.raw.MetadataId);
        add(spec, table.raw, id, { ...normalizeTable(table.raw, await this.attribute(spec.schemaName, primary)), ...(table.raw.Privileges ? { securityPrivilegeMetadata: { MetadataId: id, LogicalName: textValue(table.raw.LogicalName), SchemaName: textValue(table.raw.SchemaName), Privileges: table.raw.Privileges as import('../core/json.js').JsonValue } } : {}), primaryMetadataId:guidValue(primary.MetadataId), entitySetName:textValue(table.raw.EntitySetName), primaryNameAttribute:textValue(table.raw.PrimaryNameAttribute), solutionMember: member(id, 1) && (member(guidValue(primary.MetadataId), 2) || includesAttributes(id)) });
      } else if (spec.kind === 'column') {
        const tableName = textValue(spec.properties.tableSchemaName); const table = await readTable(tableName); if (!table) continue;
        const raw = table.attributes.find(item => textValue(item.SchemaName).toLowerCase() === spec.schemaName.toLowerCase()); if (!raw) continue;
        const id = guidValue(raw.MetadataId);
        add(spec, raw, id, { ...normalizeColumn(await this.attribute(tableName, raw)), logicalName:textValue(raw.LogicalName), tableSchemaName: tableName, solutionMember: member(id, 2) || includesAttributes(guidValue(table.raw.MetadataId)) });
      } else if (spec.kind === 'relationship') {
        const identities = await this.http.all(`RelationshipDefinitions?$select=SchemaName,MetadataId,RelationshipType&$filter=SchemaName eq '${nameSchema.parse(spec.schemaName)}'`);
        if (identities.some(item => item.RelationshipType !== 'OneToManyRelationship')) throw new PowerCanvasError('PF-DV-004', 'The relationship schema name is occupied by another relationship type.', 'Choose an unused name; existing relationships cannot be adopted.');
        const rows = await this.http.all(`RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata?$filter=SchemaName eq '${nameSchema.parse(spec.schemaName)}'`);
        if (rows.length > 1) throw new PowerCanvasError('PF-DV-004', 'Ambiguous relationship identity.', 'Resolve collisions before planning.');
        const raw = rows[0];
        if (!raw) {
          const fromTable = await readTable(textValue(spec.properties.fromTableSchemaName));
          const lookupName = textValue(rawObject(spec.properties.lookup).schemaName).toLowerCase();
          if (fromTable?.attributes.some(item => textValue(item.SchemaName).toLowerCase() === lookupName || textValue(item.LogicalName).toLowerCase() === lookupName)) throw new PowerCanvasError('PF-DV-004', 'The requested lookup name is already occupied without the intended relationship.', 'Choose an unused name; existing lookup columns cannot be adopted.');
          if (identities.length) throw new PowerCanvasError('PF-DV-005', 'Relationship metadata is incomplete.', 'Repeat complete discovery before planning.');
          continue;
        }
        const from = tables.find(table => table.LogicalName === raw.ReferencingEntity);
        const to = tables.find(table => table.LogicalName === raw.ReferencedEntity);
        if (!from || !to) throw new PowerCanvasError('PF-DV-005', 'Relationship tables are missing from observation.', 'Complete metadata discovery before planning.');
        const fromName = textValue(from.SchemaName); const table = await readTable(fromName);
        const lookup = table?.attributes.find(item => item.LogicalName === raw.ReferencingAttribute);
        if (!lookup) throw new PowerCanvasError('PF-DV-005', 'Lookup metadata is missing.', 'Complete metadata discovery before planning.');
        const id = guidValue(raw.MetadataId);
        const fromId = guidValue(table!.raw.MetadataId); const toId = guidValue(to.MetadataId);
        const relationshipIncluded = member(id, 10) || (includesAttributes(fromId) && includesAttributes(toId));
        add(spec, raw, id, { ...normalizeRelationship(raw, lookup, fromName, textValue(to.SchemaName)), solutionMember: relationshipIncluded && (member(guidValue(lookup.MetadataId), 2) || includesAttributes(fromId)) });
      }
    }
    return { schemaVersion: 1, projectId: project.project.id, target, snapshotId: randomUUID(), observedAt: new Date().toISOString(),
      providerVersions: { dataverse: DATAVERSE_VERSION }, coverage: ['publisher', 'solution', 'table', 'column', 'relationship',...new Set(scope.filter(s=>['choice','key'].includes(s.kind)).map(s=>s.kind))].map(kind => ({ kind, status: 'complete' })), resources };
  }
}
