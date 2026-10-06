// SPDX-License-Identifier: LicenseRef-MyTools-Personal-1.0
// Copyright 2026 Denys Heba. Shared contracts for MCP and the loopback API.
import { scrub, CATEGORIES } from '../../packages/truescrub/index.mjs';
import { formatJson, encodeBase64, decodeBase64, cleanLink, deduplicateLines, textStats, generatePassword, sha256 } from '../../packages/essentials/index.mjs';
import { parseData, profile, emptyRecipe, runRecipe, reconcile, exportCSV, exportJSON, applySchemaMapping, validationDiagnostic } from '../../projects/trueflow/core.mjs';
export const MESSAGE_LIMIT = 2 * 1024 * 1024;
export const RESULT_LIMIT = 512 * 1024;
export const LICENSE_NOTICE = 'Private personal use is free. Business/professional use requires a paid license from Denys Heba. See LICENSE and COMMERCIAL.md.';
const toolDiagnostics = new WeakMap();
export class ToolError extends Error { constructor(code, diagnostic = null) { super(code); this.code = code; if (diagnostic) toolDiagnostics.set(this, structuredClone(diagnostic)); } }
const fail = code => { throw new ToolError(code); };
const str = maxLength => ({ type: 'string', maxLength });
const choice = (...values) => ({ type: 'string', enum: values });
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const array = (items, maxItems, minItems = 0) => ({ type: 'array', items, maxItems, minItems });
const columns = array({ ...str(200), minLength: 1 }, 100, 1);
const text = { ...str(262144), description: 'Literal UTF-8 text, at most 256 KiB. Never a file path or a URL to fetch.' };
const dataset = obj({ text: { ...str(524288), description: 'Dataset contents, max 512 KiB UTF-8; NOT a path.' }, format: choice('csv', 'tsv', 'json'), delimiter: choice(',', ';', '\t') }, ['text']);
const steps = ['trim', 'normalize', 'lower', 'upper', 'redact', 'dropEmpty', 'dedupe', 'select', 'require', 'unique'].map(type => obj({ type: { const: type }, columns }));
steps.push(obj({ type: { const: 'rename' }, from: str(200), to: str(200) }), obj({ type: { const: 'filter' }, column: str(200), operator: choice('eq', 'neq', 'contains'), value: str(1000) }));
const recipe = obj({ format: { const: 'mytools.trueflow.recipe' }, version: { const: 1 }, steps: array({ oneOf: steps }, 30) });
const mapping = obj({ format: { const: 'mytools.trueflow.mapping' }, version: { const: 1 }, columns: array(obj({ before: { ...str(200), minLength: 1 }, after: { ...str(200), minLength: 1 } }), 100) });
const parse = source => parseData(source.text, source.format ?? 'csv', source.delimiter ?? ',');
const pipeline = (source, r) => runRecipe(parse(source), r ?? emptyRecipe());
const entries = [
  ['truescrub', 'Redact sensitive text. Best effort; human review required. Unmatched private data may remain.', obj({ text, mode: choice('mask', 'pseudonym'), categories: array(choice(...CATEGORIES), 8), customTerms: array({ ...str(512), minLength: 1 }, 200) }, ['text']), a => { const { text, ...options } = a; return scrub(text, options); }],
  ['json_format', 'Validate/format JSON, preserving number tokens. Not schema validation.', obj({ text, pretty: { type: 'boolean' } }, ['text']), a => ({ text: formatJson(a.text, a.pretty ?? true) })],
  ['base64', 'Encode/decode UTF-8 text. Base64 is not encryption.', obj({ text, operation: choice('encode', 'decode') }), a => ({ text: a.operation === 'encode' ? encodeBase64(a.text) : decodeBase64(a.text) })],
  ['clean_link', 'Remove common tracking parameters without visiting the URL. May invalidate signed links.', obj({ text }), a => ({ text: cleanLink(a.text) })],
  ['text', 'Count Unicode text or keep the first occurrence of each exact line.', obj({ text, operation: choice('count', 'dedupe') }), a => a.operation === 'count' ? textStats(a.text) : { text: deduplicateLines(a.text) }],
  ['password', 'Generate a random password. The client receives it and may log/send it to its model; prefer the offline UI for real passwords.', obj({ length: { type: 'integer', minimum: 12, maximum: 128 } }, []), a => ({ password: generatePassword(a.length ?? 24) })],
  ['sha256', 'Hash literal UTF-8 text or canonical Base64 bytes supplied by the client. No filesystem access. A checksum does not establish safety.', { type: 'object', oneOf: [obj({ text }), obj({ base64Bytes: str(262144) })] }, async a => {
    let input = a.text;
    if (a.base64Bytes !== undefined) { input = Buffer.from(a.base64Bytes, 'base64'); if (input.toString('base64') !== a.base64Bytes) fail('INVALID_ARGUMENTS'); }
    return { sha256: await sha256(input) };
  }],
  ['trueflow_profile', 'Count dataset quality issues without returning example cell values. Column names remain visible.', obj({ source: dataset }), a => profile(parse(a.source))],
  ['trueflow_run', 'Run a typed recipe from original input and return the actual CSV/JSON output. Review before saving; no files are written.', obj({ source: dataset, recipe, outputFormat: choice('csv', 'json') }, ['source']), a => {
    const { data, journal } = pipeline(a.source, a.recipe), format = a.outputFormat ?? 'json';
    const output = format === 'csv' ? exportCSV(data) : { text: exportJSON(data), protectedCells: 0 };
    return { format, ...output, profile: profile(data), journal, warnings: ['REVIEW_REQUIRED', ...(format === 'csv' ? ['CSV_GUARD_CHANGES_VALUES', 'SPREADSHEETS_MAY_REINTERPRET_VALUES'] : ['ALL_CELLS_ARE_TEXT'])] };
  }],
  ['trueflow_compare', 'Optionally map original B headers to A before the same recipe and unique-key comparison. All columns must match one-to-one; no fuzzy matching. Return counts/locations, not cell values.', obj({ before: dataset, after: dataset, keys: columns, recipe, mapping }, ['before', 'after', 'keys']), a => {
    const before = parse(a.before), after = parse(a.after);
    const aligned = a.mapping === undefined ? after : applySchemaMapping(before, after, a.mapping);
    return reconcile(runRecipe(before, a.recipe ?? emptyRecipe(), 'a').data, runRecipe(aligned, a.recipe ?? emptyRecipe(), 'b').data, a.keys);
  }],
];
const registry = new Map(entries.map(([name, description, inputSchema, run]) => [name, { name, description, inputSchema, run }]));
/** Validator for precisely the closed schema subset authored above, not arbitrary schemas. */
export function matches(value, schema, depth = 0) {
  if (depth > 12) return false;
  if (schema.oneOf) return schema.oneOf.filter(s => matches(value, s, depth + 1)).length === 1;
  if (Object.hasOwn(schema, 'const')) return value === schema.const;
  if (schema.enum) return schema.enum.includes(value);
  if (schema.type === 'string') return typeof value === 'string' && value.length <= schema.maxLength && value.isWellFormed() && Buffer.byteLength(value) <= schema.maxLength && value.length >= (schema.minLength ?? 0);
  if (schema.type === 'integer') return Number.isSafeInteger(value) && value >= schema.minimum && value <= schema.maximum;
  if (schema.type === 'boolean') return typeof value === 'boolean';
  if (schema.type === 'array') return Array.isArray(value) && value.length >= schema.minItems && value.length <= schema.maxItems && value.every(v => matches(v, schema.items, depth + 1));
  if (schema.type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value) && schema.required.every(k => Object.hasOwn(value, k)) && Object.keys(value).every(k => Object.hasOwn(schema.properties, k) && matches(value[k], schema.properties[k], depth + 1));
  return false;
}
export function listTools() {
  return structuredClone([...registry.values()].map(({ run, ...tool }) => ({ ...tool, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: tool.name !== 'password', openWorldHint: false } })));
}
export async function callTool(name, args = {}) {
  const tool = registry.get(name);
  if (!tool) fail('UNKNOWN_TOOL');
  if (!matches(args, tool.inputSchema)) fail('INVALID_ARGUMENTS');
  try {
    const result = await tool.run(args);
    if (Buffer.byteLength(JSON.stringify(result)) > RESULT_LIMIT) fail('RESULT_TOO_LARGE');
    return result;
  } catch (error) {
    if (error instanceof ToolError) throw error;
    const diagnostic = validationDiagnostic(error);
    if (diagnostic) throw new ToolError(error.message, diagnostic);
    // Never return parser exception text: it may contain source data.
    const safe = /^(?:CSV_WIDTH|CSV_UNCLOSED_QUOTE|CSV_UNEXPECTED_QUOTE|CSV_AFTER_QUOTE|DUPLICATE_KEY|EMPTY_KEY|SCHEMA_MISMATCH|SCHEMA_UNMAPPED|INVALID_SCHEMA_MAPPING|AMBIGUOUS_SCHEMA_MAPPING|UNKNOWN_MAPPING_COLUMN|REQUIRED_VALUE|UNKNOWN_COLUMN|DUPLICATE_COLUMN_NAME|INVALID_JSON|DUPLICATE_JSON_KEY|FLAT_JSON_REQUIRED|TABLE_LIMIT|INPUT_TOO_LARGE|CSV_HEADER_COLLISION)(?:: record \d+)?$/;
    fail(safe.test(error.message) ? error.message : 'INVALID_DATA');
  }
}
export function toolFailure(error) {
  if (!(error instanceof ToolError)) return { error: 'OPERATION_FAILED' };
  const diagnostic = toolDiagnostics.get(error);
  return { error: error.code, ...(diagnostic ? { diagnostic: structuredClone(diagnostic) } : {}) };
}
const recordNumber = { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const nullableRecord = { oneOf: [{ const: null }, recordNumber] };
const validationSchema = obj({
  format: { const: 'mytools.trueflow.validation' }, version: { const: 1 }, source: choice('input', 'a', 'b'), check: choice('unique', 'require'),
  step: { oneOf: [{ const: null }, { type: 'integer', minimum: 1, maximum: 30 }] },
  totalIssues: { type: 'integer', minimum: 1, maximum: 50000 }, truncated: { type: 'boolean' },
  issues: array(obj({ code: choice('EMPTY_KEY', 'DUPLICATE_KEY', 'REQUIRED_VALUE'), record: recordNumber, firstRecord: nullableRecord, columns: array({ type: 'integer', minimum: 1, maximum: 100 }, 100, 1) }), 100, 1),
});
export function openApi() {
  const paths = {
    '/v1/tools': { get: { operationId: 'listTools', responses: { 200: { description: 'Tool catalog with input schemas' } } } },
    '/openapi.json': { get: { operationId: 'openApi', responses: { 200: { description: 'This OpenAPI contract' } } } },
  };
  for (const tool of listTools()) paths[`/v1/tools/${tool.name}`] = { post: { operationId: tool.name, description: tool.description, requestBody: { required: true, content: { 'application/json': { schema: tool.inputSchema } } }, responses: { 200: { description: 'JSON tool result in result; no automatic persistence' }, 400: { description: 'Invalid arguments/JSON' }, 401: { description: 'Missing or invalid bearer token' }, 403: { description: 'Origin/Host rejected' }, 413: { description: 'Request too large' }, 422: { description: 'Data/output rejected without source values; selected TrueFlow gates include bounded diagnostic locations', content: { 'application/json': { schema: { type: 'object', required: ['error'], additionalProperties: false, properties: { error: { type: 'string' }, diagnostic: { $ref: '#/components/schemas/TrueFlowValidation' } } } } } } } } };
  return { openapi: '3.1.0', info: { title: 'MyTools local API', version: '1.0.0', description: LICENSE_NOTICE }, servers: [{ url: 'http://127.0.0.1:4174' }], security: [{ bearerAuth: [] }], components: { schemas: { TrueFlowValidation: validationSchema }, securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } }, paths };
}
