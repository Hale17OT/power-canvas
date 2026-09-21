import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { parseConfigData } from '../src/config/load.js';
import { compileConnector, connectorSchema, checkConnectorDeployment } from '../src/connectors/compile.js';
import { runConnectorOperation } from '../src/connectors/client.js';

const spec = connectorSchema.parse(parseConfigData(readFileSync('examples/connectors/complaint-catalog.yaml', 'utf8')));
const response = (data: unknown, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
it('compiles a deterministic Swagger 2 artifact with secure connection input, bounded queries and errors', () => {
  const result = compileConnector(spec); expect(result).toEqual(compileConnector(spec));
  expect(result.openapi.swagger).toBe('2.0'); expect(result.openapi.securityDefinitions).toHaveProperty('api_key');
  expect(result.apiProperties.properties.connectionParameters).toHaveProperty('api_key.type', 'securestring');
  expect(result.openapi.paths['/categories']!.get.responses).toHaveProperty('429');
  expect(result.manifest.remoteCreated).toBe(false);
  expect(() => connectorSchema.parse({ ...spec, secret: 'never-allowed' })).toThrow();
  expect(() => connectorSchema.parse({ ...spec, baseUrl: 'https://user:password@host.example' })).toThrow();
  expect(() => connectorSchema.parse({ ...spec, operations: [...spec.operations, ...spec.operations] })).toThrow();
  expect(() => connectorSchema.parse({ ...spec, operations: [{ ...spec.operations[0], parameters: [] }] })).toThrow();
});
it('blocks collisions and fixture deployment before any remote call', () => {
  const context = { prefix: 'pfx', existingNames: [], approvedHosts: [], solutionUniqueName: 'pfx_PowerForgeExperiment', nonDisposable: true };
  expect(() => checkConnectorDeployment(spec, context)).toThrow('fixture');
  expect(() => checkConnectorDeployment(spec, { ...context, existingNames: [spec.name.toUpperCase()] })).toThrow('collision');
  const real = { ...spec, baseUrl: 'https://api.example.com/v1' };
  expect(checkConnectorDeployment(real, { ...context, approvedHosts: ['api.example.com'] }).executable).toBe(false);
});
it('exercises a two-page fixture, empty state and bounds without automatic paging or retries', async () => {
  const transport = vi.fn<typeof fetch>(async input => {
    const url = new URL(String(input)); return response(url.searchParams.has('cursor') ? { items: [] } : { items: [{ id: 'synthetic-1', name: 'Delivery', active: true }], nextCursor: 'page2' });
  });
  expect(await runConnectorOperation(spec, 'ListCategories', { limit: 1 }, { transport })).toMatchObject({ state: 'loaded', data: { nextCursor: 'page2' } });
  expect(await runConnectorOperation(spec, 'ListCategories', { cursor: 'page2' }, { transport })).toMatchObject({ state: 'empty' });
  expect(await runConnectorOperation(spec, 'ListCategories', { limit: 101 }, { transport })).toEqual({ state: 'invalidRequest', attempts: 0 });
  expect(transport).toHaveBeenCalledTimes(2);
});
it.each([[401, 'unauthorized'], [403, 'forbidden'], [429, 'throttled'], [503, 'unavailable']] as const)('reports HTTP %i without retrying or exposing response bodies', async (status, state) => {
  const transport = vi.fn<typeof fetch>(async () => response({ message: 'sensitive upstream details' }, status, { 'Retry-After': '3' }));
  expect(await runConnectorOperation(spec, 'ListCategories', {}, { transport })).toEqual({ state, attempts: 1, retryAfterSeconds: 3 });
  expect(transport).toHaveBeenCalledTimes(1);
});
it('handles schema errors, oversized results and cancellation', async () => {
  for (const value of [{ items: [{ id: 12 }] }, { items: Array(101).fill({ id: 'a', name: 'b', active: true }) }]) {
    expect(await runConnectorOperation(spec, 'ListCategories', {}, { transport: async () => response(value) })).toMatchObject({ state: 'invalidResponse' });
  }
  const transport: typeof fetch = async (_input, options) => new Promise((_resolve, reject) => options!.signal!.addEventListener('abort', () => reject(new Error('aborted'))));
  expect(await runConnectorOperation(spec, 'ListCategories', {}, { transport, timeoutMs: 5 })).toMatchObject({ state: 'timeout' });
});
