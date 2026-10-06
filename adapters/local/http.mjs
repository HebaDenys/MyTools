// SPDX-License-Identifier: LicenseRef-MyTools-Personal-1.0
// Opt-in machine API, NOT a public service or a Streamable HTTP MCP endpoint.
import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { listTools, callTool, openApi, LICENSE_NOTICE, MESSAGE_LIMIT } from './registry.mjs';
const digest = value => createHash('sha256').update(value).digest();
export function createLocalApi({ token } = {}) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(token)) throw new Error('API_TOKEN_REQUIRED');
  const authorization = digest(`Bearer ${token}`);
  const server = createServer({ maxHeaderSize: 8192, requestTimeout: 10000, headersTimeout: 5000 }, async (req, res) => {
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Connection': 'close' }); res.end(JSON.stringify(body)); };
    const port = server.address().port;
    if (!['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || ![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host) || Object.hasOwn(req.headers, 'origin') || Object.keys(req.headers).some(k => k === 'forwarded' || k.startsWith('x-forwarded-'))) { send(403, { error: 'LOCAL_CLIENT_REQUIRED' }); return; }
    if (!timingSafeEqual(digest(req.headers.authorization ?? ''), authorization)) { send(401, { error: 'UNAUTHORIZED' }); return; }
    if (req.method === 'GET' && req.url === '/v1/tools') { send(200, { tools: listTools(), license: LICENSE_NOTICE }); return; }
    if (req.method === 'GET' && req.url === '/openapi.json') { send(200, openApi()); return; }
    const match = /^\/v1\/tools\/([a-z0-9_]+)$/.exec(req.url);
    if (!match) { send(404, { error: 'NOT_FOUND' }); return; }
    if (req.method !== 'POST') { send(405, { error: 'METHOD_NOT_ALLOWED' }); return; }
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] ?? '') || req.headers['content-encoding']) { send(415, { error: 'JSON_UTF8_REQUIRED' }); return; }
    if (Number(req.headers['content-length'] ?? 0) > MESSAGE_LIMIT) { send(413, { error: 'REQUEST_TOO_LARGE' }); return; }
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > MESSAGE_LIMIT) { send(413, { error: 'REQUEST_TOO_LARGE' }); return; } chunks.push(chunk); }
      let args;
      try { args = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size))); }
      catch { send(400, { error: 'INVALID_JSON' }); return; }
      try { send(200, { result: await callTool(match[1], args) }); }
      catch (e) { send(e.code === 'UNKNOWN_TOOL' ? 404 : e.code === 'INVALID_ARGUMENTS' ? 400 : 422, { error: e.code ?? 'OPERATION_FAILED' }); }
    } catch { if (!res.headersSent && !res.destroyed) send(400, { error: 'REQUEST_ABORTED' }); }
  });
  server.maxConnections = 16; server.maxHeadersCount = 32; server.setTimeout(10000, socket => socket.destroy());
  return server;
}
export async function startLocalApi({ token, port = 4174 } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('INVALID_PORT');
  const server = createLocalApi({ token });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const port = process.env.MYTOOLS_API_PORT === undefined ? 4174 : Number(process.env.MYTOOLS_API_PORT);
    const server = await startLocalApi({ token: process.env.MYTOOLS_API_TOKEN, port });
    delete process.env.MYTOOLS_API_TOKEN;
    console.error(`MyTools API: http://127.0.0.1:${server.address().port} (authenticated loopback only)`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { server.close(); server.closeAllConnections(); });
  } catch { console.error('MyTools API not started. Set a 32–256 character random MYTOOLS_API_TOKEN and a valid MYTOOLS_API_PORT.'); process.exitCode = 1; }
}
