// SPDX-License-Identifier: LicenseRef-MyTools-Personal-1.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Readable, Writable } from 'node:stream';
import { request } from 'node:http';
import { createHash } from 'node:crypto';
import { listTools, callTool, openApi, MESSAGE_LIMIT } from '../adapters/local/registry.mjs';
import { session, serveStdio } from '../adapters/local/mcp.mjs';
import { startLocalApi, createLocalApi } from '../adapters/local/http.mjs';
const source = { text: 'id,name\n001, A \n002,B', format: 'csv' };
const recipe = { format: 'mytools.trueflow.recipe', version: 1, steps: [{ type: 'trim', columns: ['name'] }] };
const mappedArgs = { before: source, after: { text: 'customer_id,label\n001,A\n003,C' }, keys: ['id'], recipe, mapping: { format: 'mytools.trueflow.mapping', version: 1, columns: [{ before: 'id', after: 'customer_id' }, { before: 'name', after: 'label' }] } };
const cases = [
  ['trueflow_compare', mappedArgs, r => r.summary.added === 1 && r.summary.removed === 1 && r.summary.unchanged === 1],
  ['truescrub', { text: 'Authorization: Basic dXNlcjpwYXNz\nemail: synthetic@example.invalid' }, r => r.text === 'Authorization: Basic [SECRET]\nemail: [EMAIL]'],
  ['json_format', { text: '{"id":90071992547409930001}', pretty: false }, r => r.text === '{"id":90071992547409930001}'],
  ['base64', { text: 'café', operation: 'encode' }, r => r.text === 'Y2Fmw6k='],
  ['base64', { text: 'Y2Fmw6k=', operation: 'decode' }, r => r.text === 'café'],
  ['clean_link', { text: 'https://example.invalid/x?a=1&utm_source=demo' }, r => r.text === 'https://example.invalid/x?a=1'],
  ['text', { text: 'a\na\nb', operation: 'dedupe' }, r => r.text === 'a\nb'],
  ['text', { text: 'café', operation: 'count' }, r => r.graphemes === 4 && r.utf8Bytes === 5],
  ['password', { length: 24 }, r => r.password.length === 24],
  ['sha256', { text: 'abc' }, r => r.sha256 === createHash('sha256').update('abc').digest('hex')],
  ['sha256', { base64Bytes: 'AP8=' }, r => r.sha256 === createHash('sha256').update(Buffer.from([0, 255])).digest('hex')],
  ['trueflow_profile', { source }, r => r.rowCount === 2 && r.columns[1].whitespace === 1],
  ['trueflow_run', { source, recipe }, r => JSON.parse(r.text)[0].name === 'A' && r.journal[0].changedCells === 1],
  ['trueflow_run', { source: { text: 'id,name\n001,=1+1' }, outputFormat: 'csv' }, r => r.protectedCells === 1 && r.text.includes("'=1+1")],
  ['trueflow_compare', { before: source, after: { text: 'id,name\n001,A\n003,C' }, keys: ['id'], recipe }, r => r.summary.added === 1 && r.summary.removed === 1 && r.summary.unchanged === 1],
];
for (const [name, args, check] of cases) test(`registry ${name} ${JSON.stringify(args).slice(0, 40)}`, async () => { const copy = structuredClone(args); assert.ok(check(await callTool(name, args))); assert.deepEqual(args, copy); });
test('ten discoverable tools and isolated schema copies', () => {
  assert.equal(listTools().length, 10); const tools = listTools(); tools[0].inputSchema.required.push('invented'); assert.ok(!listTools()[0].inputSchema.required.includes('invented'));
  for (const t of tools) assert.equal(t.annotations.readOnlyHint, true);
  assert.equal(tools.find(t => t.name === 'password').annotations.idempotentHint, false);
});
for (const [name, args] of [
  ['__proto__', {}], ['constructor', {}], ['text', null], ['text', []], ['text', { text: 'x', operation: 'eval' }],
  ['sha256', { path: '/etc/passwd' }], ['sha256', { text: 'x', base64Bytes: '' }], ['sha256', { base64Bytes: 'Zh==' }],
  ['truescrub', { text: 'x', categories: ['UNKNOWN'] }], ['truescrub', { text: '\ud800' }],
  ['truescrub', { text: '🙂'.repeat(70000) }], ['password', { length: 8 }],
  ['trueflow_run', { source, recipe: { ...recipe, steps: [{ type: 'eval', code: 'secret' }] } }],
  ['trueflow_run', { source: { ...source, path: 'secret-path' } }],
]) test(`invalid adapter input ${name} ${JSON.stringify(args).slice(0, 50)}`, async () => assert.rejects(callTool(name, args), /^(?:Error: )?(?:UNKNOWN_TOOL|INVALID_ARGUMENTS)/));
test('data errors omit private text, while preserving safe conflict record numbers', async () => {
  await assert.rejects(callTool('json_format', { text: 'PRIVATE_MALFORMED' }), e => !e.message.includes('PRIVATE_MALFORMED') && e.code === 'INVALID_DATA');
  await assert.rejects(callTool('trueflow_compare', { before: { text: 'id\nPRIVATE_KEY\nPRIVATE_KEY' }, after: { text: 'id\nPRIVATE_KEY' }, keys: ['id'] }), /DUPLICATE_KEY: A records 2,3/);
});
test('oversized output is refused rather than returned partially', async () => {
  await assert.rejects(callTool('json_format', { text: '['.repeat(100) + Array(10000).fill('1').join(',') + ']'.repeat(100) }), /RESULT_TOO_LARGE/);
});
test('OpenAPI exposes exactly the registry contracts and bearer requirement', () => {
  const doc = openApi(); assert.equal(doc.openapi, '3.1.0'); assert.deepEqual(doc.security, [{ bearerAuth: [] }]);
  for (const t of listTools()) assert.deepEqual(doc.paths[`/v1/tools/${t.name}`].post.requestBody.content['application/json'].schema, t.inputSchema);
});
const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'synthetic-tests', version: '1.0.0' } } };
const initialized = { jsonrpc: '2.0', method: 'notifications/initialized' };
const rpc = (id, method, params) => ({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
test('MCP initialization, version negotiation, readiness and errors', async () => {
  const dispatch = session();
  assert.equal((await dispatch(rpc(0, 'tools/list'))).error.code, -32000);
  assert.equal((await dispatch(rpc(0, 'ping'))).result.constructor, Object);
  const init = await dispatch({ ...initialize, params: { ...initialize.params, protocolVersion: '2099-01-01' } });
  assert.equal(init.result.protocolVersion, '2025-11-25'); assert.deepEqual(Object.keys(init.result.capabilities), ['tools']);
  assert.equal((await dispatch(initialize)).error.code, -32600);
  assert.equal((await dispatch(rpc(2, 'tools/list'))).error.code, -32000);
  assert.equal(await dispatch(initialized), null);
  assert.equal((await dispatch(rpc(3, 'tools/list'))).result.tools.length, 10);
  assert.equal((await dispatch(rpc(4, 'tools/list', { cursor: 'unknown' }))).error.code, -32602);
  assert.equal((await dispatch(rpc(5, 'shell/execute'))).error.code, -32601);
  assert.equal((await dispatch(rpc(6, 'tools/call', { name: 'unknown' }))).error.code, -32602);
  const bad = await dispatch(rpc(7, 'tools/call', { name: 'json_format', arguments: { text: 'SENSITIVE_FRAGMENT' } }));
  assert.equal(bad.result.isError, true); assert.ok(!JSON.stringify(bad).includes('SENSITIVE_FRAGMENT'));
  assert.equal(await dispatch({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'password' } }), null);
});
for (const value of [null, [], {}, { jsonrpc: '1.0', id: 1, method: 'ping' }, rpc(null, 'ping'), rpc(1.2, 'ping')]) test(`MCP rejects malformed request ${JSON.stringify(value)}`, async () => assert.equal((await session()(value)).error.code, -32600));
test('MCP state is not shared between client sessions', async () => {
  const a = session(), b = session(); await a(initialize); await a(initialized); assert.equal((await b(rpc(1, 'tools/list'))).error.code, -32000);
});
const mcp = fileURLToPath(new URL('../adapters/local/mcp.mjs', import.meta.url));
test('real stdio child runs all tools and returns matching text/structuredContent without extra logs', () => {
  const input = [initialize, initialized, rpc(2, 'tools/list'), ...cases.map(([name, args], i) => rpc(i + 3, 'tools/call', { name, arguments: args }))].map(x => JSON.stringify(x) + '\n').join('');
  const result = spawnSync(process.execPath, [mcp], { input, encoding: 'utf8', timeout: 10000, maxBuffer: 4 * MESSAGE_LIMIT });
  assert.equal(result.status, 0, result.stderr); assert.equal(result.stderr, '');
  const messages = result.stdout.trim().split('\n').map(x => JSON.parse(x)); assert.equal(messages.length, 2 + cases.length);
  cases.forEach(([, , check], i) => { assert.ok(check(messages[i + 2].result.structuredContent)); assert.deepEqual(JSON.parse(messages[i + 2].result.content[0].text), messages[i + 2].result.structuredContent); });
});
test('stdio handles fragmented multibyte UTF-8, CRLF and write backpressure', async () => {
  const buffer = Buffer.from([initialize, initialized, rpc(2, 'base64'), rpc(3, 'tools/call', { name: 'base64', arguments: { text: 'café🙂', operation: 'encode' } })].map(x => JSON.stringify(x) + '\r\n').join(''));
  const chunks = []; for (let i = 0; i < buffer.length; i += 3) chunks.push(buffer.subarray(i, i + 3));
  let output = ''; const sink = new Writable({ highWaterMark: 1, write(chunk, encoding, next) { output += chunk; setImmediate(next); } });
  assert.equal(await serveStdio(Readable.from(chunks), sink), true);
  assert.equal(JSON.parse(output.trim().split('\n').at(-1)).result.structuredContent.text, Buffer.from('café🙂').toString('base64'));
});
for (const [name, input, code] of [['invalid UTF-8', Buffer.from([255, 10]), -32700], ['bad JSON', '{PRIVATE_DATA}\n', -32700], ['batch', '[]\n', -32600], ['oversized line', 'x'.repeat(MESSAGE_LIMIT + 1) + '\n', -32600], ['truncated', '{', -32700]]) test(`stdio safely rejects ${name}`, () => {
  const r = spawnSync(process.execPath, [mcp], { input, encoding: 'utf8', timeout: 10000 }); const reply = JSON.parse(r.stdout.trim());
  assert.equal(reply.error.code, code); assert.equal(r.stderr, ''); assert.ok(!r.stdout.includes('PRIVATE_DATA'));
});
// Synthetic token, only for an ephemeral loopback test server. Never a production credential.
const token = 'synthetic_test_only_'.repeat(3);
async function local(t) { const server = await startLocalApi({ token, port: 0 }); t.after(() => { server.closeAllConnections(); server.close(); }); return { server, port: server.address().port }; }
function http(port, path, { method = 'POST', headers = {}, body = '{}' } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers } }, res => { let text = ''; res.on('data', c => { text += c; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(text) })); });
    req.on('error', reject); req.end(body);
  });
}
test('actual HTTP loopback service discovers all tools and executes all fixtures', async t => {
  const { server, port } = await local(t); assert.equal(server.address().address, '127.0.0.1');
  const tools = await http(port, '/v1/tools', { method: 'GET', body: '' }); assert.equal(tools.body.tools.length, 10);
  assert.equal((await http(port, '/openapi.json', { method: 'GET', body: '' })).body.openapi, '3.1.0');
  for (const [name, args, check] of cases) { const r = await http(port, `/v1/tools/${name}`, { body: JSON.stringify(args) }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.ok(check(r.body.result)); assert.equal(r.headers['cache-control'], 'no-store'); assert.ok(!r.headers['access-control-allow-origin']); }
});
for (const [name, options, status] of [
  ['no token', { headers: { Authorization: '' } }, 401], ['wrong token', { headers: { Authorization: 'Bearer incorrect' } }, 401],
  ['untrusted Host', { headers: { Host: 'attacker.invalid' } }, 403], ['remote Origin', { headers: { Origin: 'https://attacker.invalid' } }, 403], ['null Origin', { headers: { Origin: 'null' } }, 403],
  ['forwarded proxy', { headers: { 'X-Forwarded-For': '127.0.0.1' } }, 403], ['wrong type', { headers: { 'Content-Type': 'text/plain' } }, 415],
  ['compressed body', { headers: { 'Content-Encoding': 'gzip' } }, 415], ['malformed JSON', { body: '{PRIVATE_DATA' }, 400],
  ['invalid UTF-8', { body: Buffer.from([255]) }, 400], ['GET tool', { method: 'GET', body: '' }, 405],
  ['oversized declared body', { headers: { 'Content-Length': String(MESSAGE_LIMIT + 1) } }, 413], ['oversized streamed body', { body: ' '.repeat(MESSAGE_LIMIT + 1) }, 413],
]) test(`HTTP rejects ${name}`, async t => { const { port } = await local(t); const r = await http(port, '/v1/tools/truescrub', options); assert.equal(r.status, status); assert.ok(!JSON.stringify(r.body).includes('PRIVATE_DATA')); });
test('HTTP no filesystem/network routes, unknown tool, schema and data errors', async t => {
  const { port } = await local(t);
  for (const path of ['/etc/passwd', '/v1/tools/sha256?path=secret', '/mcp', '/v1/tools/__proto__']) assert.equal((await http(port, path)).status, 404);
  assert.equal((await http(port, '/v1/tools/sha256', { body: '{"path":"/etc/passwd"}' })).status, 400);
  const r = await http(port, '/v1/tools/json_format', { body: '{"text":"PRIVATE_DATA"}' }); assert.equal(r.status, 422); assert.ok(!JSON.stringify(r.body).includes('PRIVATE_DATA'));
});
test('MCP and HTTP comparison errors expose side and conflicting records, never key values', async t => {
  const args = { before: { text: 'id,name\nPRIVATE_KEY,A\nPRIVATE_KEY,B' }, after: { text: 'id,name\nPRIVATE_KEY,A' }, keys: ['id'] };
  const dispatch = session(); await dispatch(initialize); await dispatch(initialized);
  const mcpReply = await dispatch(rpc(20, 'tools/call', { name: 'trueflow_compare', arguments: args }));
  assert.equal(mcpReply.result.isError, true); assert.ok(JSON.stringify(mcpReply).includes('DUPLICATE_KEY: A records 2,3')); assert.ok(!JSON.stringify(mcpReply).includes('PRIVATE_KEY'));
  const { port } = await local(t), apiReply = await http(port, '/v1/tools/trueflow_compare', { body: JSON.stringify(args) });
  assert.equal(apiReply.status, 422); assert.ok(JSON.stringify(apiReply.body).includes('DUPLICATE_KEY: A records 2,3')); assert.ok(!JSON.stringify(apiReply.body).includes('PRIVATE_KEY'));
});
test('HTTP startup fails closed without valid token or port', async () => {
  for (const token of [undefined, '', 'short', 'x'.repeat(257), ' '.repeat(32)]) assert.throws(() => createLocalApi({ token }), /API_TOKEN_REQUIRED/);
  for (const port of [-1, 65536, NaN, 1.5]) await assert.rejects(startLocalApi({ token, port }), /INVALID_PORT/);
});

for (const [label, columns, error] of [
  ['unmapped', [{ before: 'id', after: 'customer_id' }], 'SCHEMA_UNMAPPED'],
  ['ambiguous', [{ before: 'id', after: 'customer_id' }, { before: 'name', after: 'customer_id' }], 'AMBIGUOUS_SCHEMA_MAPPING'],
  ['unknown', [{ before: 'id', after: 'PRIVATE_HEADER' }], 'UNKNOWN_MAPPING_COLUMN'],
]) test(`both transports reject ${label} mapping without sensitive values`, async t => {
  const args = { ...mappedArgs, mapping: { ...mappedArgs.mapping, columns } };
  const dispatch = session(); await dispatch(initialize); await dispatch(initialized);
  const m = await dispatch(rpc(2, 'tools/call', { name: 'trueflow_compare', arguments: args }));
  assert.equal(m.result.isError, true); assert.ok(JSON.stringify(m).includes(error)); assert.ok(!JSON.stringify(m).includes('PRIVATE_HEADER'));
  const { port } = await local(t), h = await http(port, '/v1/tools/trueflow_compare', { body: JSON.stringify(args) });
  assert.equal(h.status, 422); assert.ok(JSON.stringify(h.body).includes(error)); assert.ok(!JSON.stringify(h.body).includes('PRIVATE_HEADER'));
});
test('mapping schema is closed in discovery and actual invocation', async () => {
  const schema = listTools().find(t => t.name === 'trueflow_compare').inputSchema.properties.mapping;
  assert.equal(schema.additionalProperties, false); assert.equal(schema.properties.columns.items.additionalProperties, false);
  await assert.rejects(callTool('trueflow_compare', { ...mappedArgs, mapping: { ...mappedArgs.mapping, path: '/private' } }), /INVALID_ARGUMENTS/);
});
