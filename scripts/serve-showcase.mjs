// Only serves generated public showcase artifacts; never the repository or auth/state directories.
import { createServer } from 'node:http';
import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const file = resolve(process.argv[2] ?? 'output/canvas/ds1-release/showcase.html');
if (!file.startsWith(resolve('output/canvas') + '\\') && !file.startsWith(resolve('output/canvas') + '/')) throw new Error('Showcase must be inside output/canvas');
const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/favicon.ico') { response.writeHead(204).end(); return; }
  if (request.method !== 'GET' || !['/', '/showcase.html'].includes(request.url)) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(await readFile(file));
});
server.listen(4178, '127.0.0.1', () => console.log('PFDS showcase: http://127.0.0.1:4178'));
