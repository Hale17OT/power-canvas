/* global fetch, URL, AbortSignal */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parseConfigData } from '../dist/config/load.js';
import { connectorSchema } from '../dist/connectors/compile.js';
import { runConnectorOperation } from '../dist/connectors/client.js';
const spec = connectorSchema.parse(parseConfigData(await readFile('examples/connectors/tvmaze.yaml', 'utf8')));
const result = await runConnectorOperation(spec, 'SearchShows', { q: 'girls' }, { transport: fetch });
if (result.state !== 'loaded') throw new Error(`TVmaze test: ${result.state}`);
const rows = result.data; const poster = rows.find(r => r.show.image?.medium);
if (!poster || new URL(poster.show.image.medium).hostname !== 'static.tvmaze.com') throw new Error('Expected TVmaze poster URL');
const image = await fetch(poster.show.image.medium, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(10000) });
const evidence = { observedAt: new Date().toISOString(), endpoint: 'https://api.tvmaze.com/search/shows?q=girls', authentication: 'none', customerDataSent: false, resultCount: rows.length, first: poster.show, image: { status: image.status, contentType: image.headers.get('content-type') }, attribution: 'TVmaze — https://www.tvmaze.com/api; API data CC BY-SA' };
await mkdir('experiments/tvmaze-20260918', { recursive: true });
await writeFile('experiments/tvmaze-20260918/live-response.json', JSON.stringify(evidence, null, 2), { flag: 'wx' });
console.log(JSON.stringify(evidence));
