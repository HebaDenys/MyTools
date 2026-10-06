// SPDX-License-Identifier: LicenseRef-MyTools-Personal-1.0
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const root = new URL('../dist/', import.meta.url);
const files = new Map([['/', ['MyTools.html', 'text/html; charset=utf-8']], ['/MyTools.html', ['MyTools.html', 'text/html; charset=utf-8']], ['/LICENSE', ['LICENSE', 'text/plain; charset=utf-8']]]);
const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
  let route;
  try { route = new URL(request.url, 'http://127.0.0.1').pathname; } catch { response.writeHead(400); response.end(); return; }
  const file = files.get(route);
  if (!file) { response.writeHead(404); response.end(); return; }
  try {
    const content = await readFile(new URL(file[0], root));
    response.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch { response.writeHead(500); response.end('Build the app first.'); }
});
server.on('error', () => { console.error('Unable to start localhost server on port 4173.'); process.exitCode = 1; });
server.listen(4173, '127.0.0.1', () => console.log('MyTools: http://127.0.0.1:4173 (local files only; no API or upload endpoint)'));
