import { z } from 'zod';
import { hashJson } from '../core/json.js';
import { PowerCanvasError } from '../core/errors.js';

const key = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/).max(80);
const label = z.string().min(1).max(200);
const https = z.url().refine(value => { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash; }, 'Expected an HTTPS URL without credentials, query or fragment');
export type ResponseField = { name: string; type: 'string' | 'integer' | 'number' | 'boolean' | 'object'; required: boolean; nullable: boolean; fields?: ResponseField[] | undefined };
const field: z.ZodType<ResponseField> = z.lazy(() => z.strictObject({ name: key, type: z.enum(['string', 'integer', 'number', 'boolean', 'object']), required: z.boolean().default(true), nullable: z.boolean().default(false), fields: z.array(field).min(1).max(30).optional() }));
export function responseObject(fields: ResponseField[]): Record<string, unknown> { return { type: 'object', properties: Object.fromEntries(fields.map(f => [f.name, { ...(f.type === 'object' ? responseObject(f.fields!) : { type: f.type }), ...(f.nullable ? { 'x-nullable': true } : {}) }])), required: fields.filter(f => f.required).map(f => f.name) }; }
export const connectorSchema = z.strictObject({
  apiVersion: z.literal('powercanvas.connectors/v1alpha1'), name: z.string().regex(/^[a-z][a-z0-9]{1,7}_PowerCanvas[A-Za-z0-9]+$/), title: label,
  baseUrl: https, auth: z.discriminatedUnion('type', [z.strictObject({ type: z.literal('none') }), z.strictObject({ type: z.literal('apiKey'), header: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/) }),
    z.strictObject({ type: z.literal('oauth2'), authorizationUrl: https, tokenUrl: https, scopes: z.record(key, label) })]),
  operations: z.array(z.strictObject({ id: key, summary: label, method: z.literal('GET'), path: z.string().regex(/^\/[a-zA-Z0-9/_-]*$/),
    parameters: z.array(z.strictObject({ name: key, type: z.enum(['string', 'integer']), required: z.boolean().default(false), maximum: z.int().positive().max(100).optional() })).default([]),
    response: z.strictObject({ collection: z.boolean(), fields: z.array(field).min(1), collectionFormat: z.enum(['items', 'array']).default('items'), pagination: z.enum(['none', 'cursor']).default('none') }) })).min(1).max(20),
}).superRefine((spec, ctx) => {
  for (const values of [spec.operations.map(o => o.id), spec.operations.map(o => o.path), ...spec.operations.flatMap(o => [o.parameters.map(p => p.name), o.response.fields.map(f => f.name)])]) {
    if (new Set(values.map(v => v.toLowerCase())).size !== values.length) ctx.addIssue({ code: 'custom', message: 'Duplicate operation, route, parameter or response-field identity.' });
  }
  for (const op of spec.operations) if (op.parameters.some(p => p.maximum !== undefined && p.type !== 'integer')) ctx.addIssue({ code: 'custom', message: 'Maximum only applies to integer parameters.' });
  function check(fields: ResponseField[], depth: number) { if (depth > 4) { ctx.addIssue({ code: 'custom', message: 'Response nesting exceeds four levels.' }); return; } if (new Set(fields.map(f => f.name.toLowerCase())).size !== fields.length) ctx.addIssue({ code: 'custom', message: 'Duplicate nested fields.' }); for (const f of fields) { if ((f.type === 'object') !== Boolean(f.fields)) ctx.addIssue({ code: 'custom', message: 'Only object fields require nested fields.' }); if (f.fields) check(f.fields, depth + 1); } }
  for (const op of spec.operations) { check(op.response.fields, 1); if (op.response.collectionFormat === 'array' && op.response.pagination !== 'none') ctx.addIssue({ code: 'custom', message: 'Cursor envelope cannot use root arrays.' }); }
  for (const op of spec.operations) if (op.response.pagination === 'cursor' && (!op.response.collection || !op.parameters.some(p => p.name === 'cursor' && p.type === 'string' && !p.required))) ctx.addIssue({ code: 'custom', message: 'Cursor pagination requires a collection and an optional string cursor parameter.' });
});
export type ConnectorSpec = z.infer<typeof connectorSchema>;

export function compileConnector(input: unknown) {
  const spec = connectorSchema.parse(input); const url = new URL(spec.baseUrl);
  const paths = Object.fromEntries(spec.operations.map(op => {
    const row = responseObject(op.response.fields);
    const response = op.response.collection ? op.response.collectionFormat === 'array' ? { type: 'array', items: row } : { type: 'object', properties: { items: { type: 'array', items: row }, ...(op.response.pagination === 'cursor' ? { nextCursor: { type: 'string' } } : {}) }, required: ['items'] } : row;
    return [op.path, { get: { operationId: op.id, summary: op.summary, 'x-ms-summary': op.summary,
      parameters: op.parameters.map(p => ({ name: p.name, in: 'query', type: p.type, required: p.required, ...(p.maximum ? { minimum: 1, maximum: p.maximum } : {}) })),
      responses: { '200': { description: 'Successful response', schema: response }, ...Object.fromEntries([400, 401, 403, 429, 503].map(status => [String(status), { description: ({ 400: 'Invalid request', 401: 'Authentication required', 403: 'Access denied', 429: 'Throttled; honor Retry-After', 503: 'Temporarily unavailable' } as Record<number, string>)[status], schema: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } } }])) } } }];
  }));
  const definition = spec.auth.type === 'apiKey' ? { type: 'apiKey', name: spec.auth.header, in: 'header' } : spec.auth.type === 'oauth2' ? { type: 'oauth2', flow: 'accessCode', authorizationUrl: spec.auth.authorizationUrl, tokenUrl: spec.auth.tokenUrl, scopes: spec.auth.scopes } : undefined;
  return { manifest: { version: 1, name: spec.name, sourceHash: hashJson(spec), scope: 'local-connector-artifact', remoteCreated: false, deployment: 'requires-reviewed-target-and-supported-PAC-or-maker-transport', secretsIncluded: false },
    openapi: { swagger: '2.0', info: { title: spec.title, version: '1.0.0' }, host: url.host, basePath: url.pathname.replace(/\/$/, '') || '/', schemes: ['https'], consumes: ['application/json'], produces: ['application/json'], paths,
      ...(definition ? { securityDefinitions: { [spec.auth.type === 'apiKey' ? 'api_key' : 'oauth2']: definition }, security: [{ [spec.auth.type === 'apiKey' ? 'api_key' : 'oauth2']: spec.auth.type === 'oauth2' ? Object.keys(spec.auth.scopes) : [] }] } : {}) },
    apiProperties: { properties: { connectionParameters: spec.auth.type === 'apiKey' ? { api_key: { type: 'securestring', uiDefinition: { displayName: 'API key', description: 'Enter the key in Power Platform connection setup', tooltip: 'Stored by Power Platform', constraints: { required: 'true' } } } } : {}, iconBrandColor: '#145C4F', capabilities: [], publisher: 'PowerCanvas' } },
    prerequisites: ['Approved reachable HTTPS API', 'Environment DLP and custom-connector permissions', 'Dedicated solution and names checked for collisions', ...(spec.auth.type === 'oauth2' ? ['Configure OAuth client/redirect and secret securely in the platform; no secret-bearing deployment flags'] : []), 'Create a connection in Power Platform and run operation tests; local fixtures do not prove live connectivity'] };
}

export function checkConnectorDeployment(spec: ConnectorSpec, context: { prefix: string; existingNames: string[]; approvedHosts: string[]; solutionUniqueName: string; nonDisposable: boolean }) {
  if (!spec.name.startsWith(`${context.prefix}_`) || !context.solutionUniqueName.startsWith(`${context.prefix}_`) || context.existingNames.some(n => n.toLowerCase() === spec.name.toLowerCase())) throw new PowerCanvasError('PF-CONNECTOR-001', 'Connector namespace or collision check failed.', 'Choose a new owned name; never adopt an existing connector.');
  const host = new URL(spec.baseUrl).hostname;
  if (host.endsWith('.invalid') || !context.approvedHosts.includes(host)) throw new PowerCanvasError('PF-CONNECTOR-002', 'Connector target is a fixture or has not been approved.', 'Provide an actual API target and authentication type.');
  return { action: 'create', destructive: false, solution: context.solutionUniqueName, nonDisposable: context.nonDisposable, executable: false, reason: 'Transport and live policy checks remain required.' };
}
