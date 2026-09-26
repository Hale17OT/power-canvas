import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { normalizeColumn, normalizeRelationship, normalizeTable } from '../src/dataverse/normalize.js';
import { columnPayload, nativeLabel, publishXml, relationshipPayload, tablePayload } from '../src/dataverse/payloads.js';
import { desiredResources } from '../src/dataverse/desired.js';
import { DataverseHttp } from '../src/dataverse/http.js';
import { fixture } from './helpers.js';
import { DataverseDiscovery } from '../src/dataverse/discovery.js';
import { emptyObservation, target } from './planner-fixtures.js';
import { createPlan } from '../src/planner/dataverse.js';
import { mutateSchema } from '../src/dataverse/mutations.js';

const label = (value: string) => ({ LocalizedLabels: [{ Label: 'Andere Sprache', LanguageCode: 1031 }, { Label: value, LanguageCode: 1033 }], UserLocalizedLabel: { Label: 'Ignore user locale' } });
const base = { SchemaName: 'pf_Field', DisplayName: label('Field'), RequiredLevel: { Value: 'None' }, MetadataId: randomUUID() };
describe('Dataverse metadata normalization', () => {
  it('normalizes ordinary types and stable choice values independent of transport order/IDs', () => {
    expect(normalizeColumn({ ...base, AttributeType: 'String', MaxLength: 200 })).toMatchObject({ type: 'text', maxLength: 200, displayName: 'Field', required: 'none' });
    expect(normalizeColumn({ ...base, AttributeType: 'Integer', MinValue: 0, MaxValue: 42 })).toMatchObject({ type: 'integer', min: 0, max: 42 });
    expect(normalizeColumn({ ...base, AttributeType: 'Decimal', MinValue: 0, MaxValue: 42, Precision: 2 })).toMatchObject({ type: 'decimal', precision: 2 });
    expect(normalizeColumn({ ...base, AttributeType: 'DateTime', DateTimeBehavior: { Value: 'DateOnly' } })).toMatchObject({ behavior: 'dateOnly' });
    const raw = { ...base, AttributeType: 'Picklist', DefaultFormValue: 731420001, OptionSet: { IsGlobal: false, Options: [
      { Value: 731420002, Label: label('High'), MetadataId: randomUUID() }, { Value: 731420001, Label: label('Normal') },
    ] } };
    const normalized = normalizeColumn(raw);
    expect(normalized.choices).toEqual([{ value: 731420001, label: 'Normal' }, { value: 731420002, label: 'High' }]);
    expect(JSON.stringify(normalized)).not.toContain('MetadataId');
    expect(normalizeColumn({ ...raw, MetadataId: randomUUID(), OptionSet: { ...raw.OptionSet, Options: [...raw.OptionSet.Options].reverse() } })).toEqual(normalized);
  });
  it('does not guess missing labels or coerce unsupported requiredness/types', () => {
    expect(() => normalizeColumn({ ...base, DisplayName: { LocalizedLabels: [] }, AttributeType: 'String', MaxLength: 4 })).toThrow('1033');
    expect(normalizeColumn({ ...base, AttributeType: 'Image' }).type).toBe('unsupported:Image');
    expect(() => normalizeColumn({ ...base, AttributeType: 'Money' })).toThrow(); // Supported type still requires complete metadata.
    expect(normalizeColumn({ ...base, AttributeType: 'String', MaxLength: 200, RequiredLevel: { Value: 'SystemRequired' } }).required).toBe('unsupported:SystemRequired');
  });
  it('round-trips table primary columns and relationship intent through documented payload shapes', () => {
    const resources = desiredResources(fixture());
    const table = resources.find(item => item.kind === 'table')!;
    const payload = tablePayload(table.properties);
    const primary = (payload.Attributes as Record<string, unknown>[])[0]!;
    const normalized = normalizeTable(payload, { ...primary, AttributeType: 'String' });
    const { solutionMember: _member, ...expected } = table.properties; void _member;
    expect(normalized).toEqual(expected);
    const relationship = resources.find(item => item.kind === 'relationship')!;
    const native = relationshipPayload(relationship.properties);
    const { solutionMember: _relationMember, ...expectedRelationship } = relationship.properties; void _relationMember;
    expect(normalizeRelationship(native, native.Lookup as Record<string, unknown>, 'pf_Complaint', 'pf_Category')).toEqual(expectedRelationship);
  });
  it('uses numeric stable choices, explicit boolean labels and XML escaping', () => {
    const choice = fixture().dataverse.tables.complaint!.columns.priority!;
    const { lifecycle: _lifecycle, ...props } = choice; void _lifecycle;
    expect(columnPayload({ ...props, default: 731420001 }).OptionSet).toMatchObject({ IsGlobal: false, Options: [{ Value: 731420000 }, { Value: 731420001 }, { Value: 731420002 }] });
    expect(nativeLabel('a & b').LocalizedLabels[0]?.Label).toBe('a & b');
    expect(publishXml(['pf_Complaint'])).toContain('<entity>pf_complaint</entity>');
    expect(() => publishXml(['bad<script>'])).toThrow();
  });
  it('recognizes an unset optional table description without relaxing required English labels', () => {
    const table = desiredResources(fixture()).find(item => item.kind === 'table')!;
    const payload = tablePayload(table.properties);
    const primary = { ...(payload.Attributes as Record<string, unknown>[])[0]!, AttributeType: 'String' };
    const empty = { LocalizedLabels: [], UserLocalizedLabel: null };
    expect(normalizeTable({ ...payload, Description: empty }, primary).description).toBe('');
    expect(normalizeTable({ ...payload, Description: label('Explicit description') }, primary).description).toBe('Explicit description');
    expect(() => normalizeTable({ ...payload, Description: { LocalizedLabels: [{ LanguageCode: 1031, Label: 'Beschreibung' }], UserLocalizedLabel: null } }, primary)).toThrow('1033');
    expect(() => normalizeTable({ ...payload, DisplayName: empty, Description: empty }, primary)).toThrow('1033');
    expect(() => normalizeTable({ ...payload, Description: { LocalizedLabels: [], UserLocalizedLabel: { LanguageCode: 1033, Label: 'Ambiguous' } } }, primary)).toThrow('1033');
  });
});

describe('read-only transport boundary', () => {
  it('redacts bounded OData diagnostics and omits inner errors', async () => {
    const client = new DataverseHttp('https://synthetic.crm.dynamics.com/api/data/v9.2/', { token: async () => 'test' }, async () => new Response(JSON.stringify({ error: { code: '0x80000001', message: 'Invalid input access_token=private-value', innererror: { sensitive: 'never-print-me' } } }), { status: 400 }));
    const error = await client.request('sitemaps', 'POST', {}).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error); expect(String(error)).toContain('access_token=[REDACTED]');
    expect(String(error)).not.toContain('private-value'); expect(String(error)).not.toContain('never-print-me');
  });
  it.each(['https://synthetic.crm.dynamics.com/api/data/v9.2/roles(66666666-6666-4666-8666-666666666666)', 'https://foreign.example/roles(66666666-6666-4666-8666-666666666666)', 'https://[invalid'])('validates the optional create receipt origin and GUID: %s', async entityId => {
    const client = new DataverseHttp('https://synthetic.crm.dynamics.com/api/data/v9.2/', { token: async () => 'test' }, async () => new Response(null, { status: 204, headers: { 'OData-EntityId': entityId } }));
    const result = await client.request('roles', 'POST', {});
    expect(result.remoteId).toBe(entityId.startsWith('https://synthetic.crm.dynamics.com/') ? '66666666-6666-4666-8666-666666666666' : undefined);
  });
  it.each([true, false])('uses documented relationship eligibility response fields before mutation (eligible=%s)', async eligible => {
    const project = fixture(); const observed = emptyObservation(project);
    const operation = createPlan(project, observed, undefined, 'dataverse').operations.find(item => item.action === 'createRelationship')!;
    let writes = 0;
    const http = new DataverseHttp('https://synthetic.crm.dynamics.com/api/data/v9.2/', { token: async () => 'test' }, async input => {
      const action = new URL(String(input)).pathname.split('/').at(-1)!;
      expect(['CanBeReferenced', 'CanBeReferencing']).toContain(action);
      return new Response(JSON.stringify({ [action]: eligible }));
    });
    const result = mutateSchema(project, operation, observed, http, async () => { writes++; });
    if (eligible) await result;
    else await expect(result).rejects.toMatchObject({ code: 'PF-DV-006' });
    expect(writes).toBe(eligible ? 1 : 0);
  });
  it('follows same-service pagination and rejects a foreign nextLink before acquiring another token', async () => {
    let tokens = 0; let calls = 0;
    const client = new DataverseHttp('https://synthetic.crm.dynamics.com/api/data/v9.2/', { token: async () => { tokens++; return 'test-token'; } }, async (_input, options) => {
      calls++; expect(options?.method).toBe('GET'); expect(options?.redirect).toBe('manual');
      return new Response(JSON.stringify({ value: [{ id: 1 }], '@odata.nextLink': 'https://evil.example/collect' }));
    });
    await expect(client.all('EntityDefinitions')).rejects.toThrow('service boundary');
    expect(calls).toBe(1); expect(tokens).toBe(1);
  });
  it('never retries writes and treats network failure as an unknown outcome', async () => {
    let calls = 0;
    const client = new DataverseHttp('https://synthetic.crm.dynamics.com/api/data/v9.2/', { token: async () => 'test' }, async () => { calls++; throw new Error('unsafe raw server secret'); });
    await expect(client.request('EntityDefinitions', 'POST', {})).rejects.toMatchObject({ uncertain: true, code: 'PF-DV-001' });
    expect(calls).toBe(1);
  });
  it('reads a synthetic empty environment with GETs only, preserving complete scoped coverage', async () => {
    const client = new DataverseHttp('https://synthetic.crm.dynamics.com/api/data/v9.2/', { token: async () => 'test' }, async (_url, options) => {
      expect(options?.method).toBe('GET'); return new Response(JSON.stringify({ value: [] }));
    });
    const observed = await new DataverseDiscovery(client).observe(fixture(), target);
    expect(observed.resources).toEqual([]); expect(observed.coverage.every(item => item.status === 'complete')).toBe(true);
  });
  it('rejects an occupied publisher prefix before creating a solution or treating it as absent', async () => {
    const client = new DataverseHttp('https://synthetic.crm.dynamics.com/api/data/v9.2/', { token: async () => 'test' }, async (input, options) => {
      expect(options?.method).toBe('GET');
      return new Response(JSON.stringify({ value: new URL(String(input)).pathname.endsWith('/publishers') ? [{ uniquename: 'SomeoneElse', customizationprefix: 'pf' }] : [] }));
    });
    await expect(new DataverseDiscovery(client).observe(fixture(), target)).rejects.toMatchObject({ code: 'PF-DV-004' });
  });
  it('rejects a relationship name occupied by many-to-many metadata instead of overlooking it', async () => {
    const client = new DataverseHttp('https://synthetic.crm.dynamics.com/api/data/v9.2/', { token: async () => 'test' }, async (input, options) => {
      expect(options?.method).toBe('GET');
      return new Response(JSON.stringify({ value: new URL(String(input)).pathname.endsWith('/RelationshipDefinitions') ? [{ RelationshipType: 'ManyToManyRelationship' }] : [] }));
    });
    await expect(new DataverseDiscovery(client).observe(fixture(), target)).rejects.toMatchObject({ code: 'PF-DV-004' });
  });
  it.each([0, 1, 2])('interprets table subcomponent inclusion mode %s when checking primary-column membership', async mode => {
    const project = fixture(); delete project.dataverse.tables.complaint; project.dataverse.relationships = {};
    const table = desiredResources(project).find(item => item.kind === 'table')!;
    const native = tablePayload(table.properties);
    const tableId = randomUUID(); const columnId = randomUUID(); const publisherId = randomUUID(); const solutionId = randomUUID();
    const primary = { ...(native.Attributes as Record<string, unknown>[])[0], MetadataId: columnId, LogicalName: 'pf_name', AttributeType: 'String', IsManaged: false, IsCustomizable: { Value: true } };
    const client = new DataverseHttp('https://synthetic.crm.dynamics.com/api/data/v9.2/', { token: async () => 'test' }, async input => {
      const path = new URL(String(input)).pathname;
      let data: unknown;
      if (path.endsWith('/publishers')) data = { value: [{ publisherid: publisherId, uniquename: project.solution.publisher.uniqueName, customizationprefix: 'pf', customizationoptionvalueprefix: 73142 }] };
      else if (path.endsWith('/solutions')) data = { value: [{ solutionid: solutionId, uniquename: project.solution.uniqueName, friendlyname: project.solution.displayName, version: project.solution.version, ismanaged: false, _publisherid_value: publisherId }] };
      else if (path.endsWith('/solutioncomponents')) data = { value: [{ objectid: tableId, componenttype: 1, rootcomponentbehavior: mode }] };
      else if (path.endsWith('/EntityDefinitions')) data = { value: [{ MetadataId: tableId, SchemaName: 'pf_Category', LogicalName: 'pf_category' }] };
      else if (path.endsWith('/Attributes')) data = { value: [primary] };
      else if (path.includes('/Attributes(')) data = primary;
      else data = { ...native, MetadataId: tableId, PrimaryNameAttribute: 'pf_name', EntitySetName: 'pf_complaints', IsManaged: false, IsCustomizable: { Value: true } };
      return new Response(JSON.stringify(data));
    });
    const observed = await new DataverseDiscovery(client).observe(project, target);
    expect(observed.resources.find(item => item.kind === 'table')?.properties.solutionMember).toBe(mode === 0);
  });
});
