// SPDX-License-Identifier: LicenseRef-MyTools-Personal-1.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { createHash } from 'node:crypto';
import { LIMITS, parseCSV, parseJSON, parseData, profile, emptyRecipe, readRecipe, validateRecipe, runRecipe, reconcile, exportCSV, exportJSON } from '../projects/trueflow/core.mjs';
import { COPY } from '../projects/trueflow/i18n.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const recipe = (...steps) => ({ ...emptyRecipe(), steps });
const run = (csv, ...steps) => runRecipe(parseCSV(csv), recipe(...steps));
for (const [name, csv, delimiter, rows] of [
  ['comma and leading zero identifiers', 'id,value\n001,02', ',', [['001', '02']]],
  ['CRLF and final terminator', 'a,b\r\n1,2\r\n', ',', [['1', '2']]],
  ['quoted delimiter and escaped quotes', 'a,b\n"x,y","a""b"', ',', [['x,y', 'a"b']]],
  ['quoted multiline field', 'a,b\n"one\r\ntwo",x\n', ',', [['one\r\ntwo', 'x']]],
  ['UTF8 BOM and Unicode', '\uFEFFa,b\ncafé,漢字', ',', [['café', '漢字']]],
  ['semicolon and decimal comma', 'a;b\n001;1,23', ';', [['001', '1,23']]],
  ['tab-separated input', 'a\tb\nx\ty', '\t', [['x', 'y']]],
  ['empty final field', 'a,b\nx,', ',', [['x', '']]],
  ['empty quoted cell', 'a\n""', ',', [['']]],
  ['blank one-column record retained', 'a\n\n', ',', [['']]],
  ['spaces are not silently stripped', 'a,b\n x , y ', ',', [[' x ', ' y ']]],
]) test(`CSV: ${name}`, () => assert.deepEqual(parseCSV(csv, delimiter).rows, rows));
for (const [name, csv, error] of [
  ['empty input', '', /EMPTY_INPUT/], ['unclosed quote', 'a\n"x', /CSV_UNCLOSED_QUOTE/],
  ['quote in bare field', 'a\nx"y', /CSV_UNEXPECTED_QUOTE/], ['characters after quote', 'a\n"x"y', /CSV_AFTER_QUOTE/],
  ['ragged row', 'a,b\nx', /CSV_WIDTH: record 2/], ['duplicate headers', 'a,a\nx,y', /DUPLICATE_COLUMN_NAME/],
  ['empty header', 'a,\nx,y', /INVALID_COLUMN_NAME/], ['NUL', 'a\nx\0', /NUL_NOT_SUPPORTED/],
]) test(`CSV rejects ${name}`, () => assert.throws(() => parseCSV(csv), error));
test('table and byte limits reject oversized inputs', () => {
  assert.throws(() => parseCSV('a\n' + 'x'.repeat(LIMITS.bytes)), /INPUT_TOO_LARGE/);
  assert.throws(() => parseCSV('a\n' + '🙂'.repeat(LIMITS.bytes / 4)), /INPUT_TOO_LARGE/);
  assert.throws(() => parseCSV('a\n' + 'x\n'.repeat(LIMITS.rows + 1)), /TABLE_LIMIT/);
  assert.throws(() => parseCSV(Array.from({ length: 101 }, (_, i) => `c${i}`).join(',')), /TABLE_LIMIT/);
});
test('format dispatch is explicit', () => {
  assert.deepEqual(parseData('a\tb\nx\ty', 'tsv').columns, ['a', 'b']);
  assert.throws(() => parseData('a', 'xml'), /INVALID_FORMAT/);
  assert.throws(() => parseCSV('a', '|'), /INVALID_DELIMITER/);
});
test('JSON keeps long integers, decimal precision, exponent and negative zero as exact text', () => {
  assert.deepEqual(parseJSON('[{"id":900719925474099312345,"decimal":1.234567890123456789,"exp":1e999,"zero":-0}]').rows[0], ['900719925474099312345', '1.234567890123456789', '1e999', '-0']);
});
test('JSON scalar semantics and column union are explicit', () => {
  const data = parseJSON('[{"id":"001","ok":true,"missing":null},{"id":"002","next":false}]');
  assert.deepEqual(data.columns, ['id', 'ok', 'missing', 'next']);
  assert.deepEqual(data.rows, [['001', 'true', '', ''], ['002', '', '', 'false']]);
  assert.deepEqual(data.sourceRows, [1, 2]);
});
for (const [name, input, error] of [
  ['malformed input', '[secret-data', /INVALID_JSON/], ['empty array', '[]', /JSON_RECORDS_REQUIRED/],
  ['object root', '{}', /JSON_RECORDS_REQUIRED/], ['primitive record', '[1]', /JSON_RECORDS_REQUIRED/],
  ['nested object', '[{"a":{"b":1}}]', /FLAT_JSON_REQUIRED/], ['nested array', '[{"a":[1]}]', /FLAT_JSON_REQUIRED/],
  ['duplicate key', '[{"a":1,"a":2}]', /DUPLICATE_JSON_KEY/], ['escaped duplicate key', '[{"a":1,"\\u0061":2}]', /DUPLICATE_JSON_KEY/],
]) test(`JSON rejects ${name}`, () => assert.throws(() => parseJSON(input), error));
test('prototype-looking keys are ordinary data; export is not prototype mutation', () => {
  const data = parseJSON('[{"__proto__":"x","constructor":"y"}]');
  const output = JSON.parse(exportJSON(data));
  assert.equal(Object.hasOwn(output[0], '__proto__'), true); assert.equal(output[0].__proto__, 'x'); assert.equal({}.polluted, undefined);
});
test('JSON preserves quoted numeric strings and escaped punctuation', () => {
  const records = [{ a: '123', b: 'literal : { [ " \\ ', c: '1e999' }];
  assert.deepEqual(parseJSON(JSON.stringify(records)).rows, [Object.values(records[0])]);
});
test('profile exposes counts, not example cell values', () => {
  const data = parseCSV('id,value\n01, UNIQUE_PRIVATE_VALUE \n02,\n02,');
  const result = profile(data);
  assert.equal(result.duplicateRows, 1); assert.equal(result.columns[1].missing, 2); assert.equal(result.columns[1].whitespace, 1);
  assert.ok(!JSON.stringify(result).includes('UNIQUE_PRIVATE_VALUE'));
});
test('recipe transforms are reproducible and do not mutate the original', () => {
  const original = parseCSV('id,name\n001, A \n001, A \n002,B'), snapshot = structuredClone(original);
  const pipeline = recipe({ type: 'trim', columns: ['name'] }, { type: 'dedupe', columns: ['id'] });
  const result = runRecipe(original, pipeline);
  assert.deepEqual(original, snapshot); assert.deepEqual(runRecipe(original, pipeline), result);
  assert.deepEqual(result.data.rows, [['001', 'A'], ['002', 'B']]); assert.deepEqual(result.data.sourceRows, [2, 4]);
  assert.equal(result.journal[0].changedCells, 2); assert.equal(result.journal[1].removedRows, 1);
});
for (const [type, value, expected] of [['trim', ' x ', 'x'], ['normalize', 'e\u0301', 'é'], ['lower', 'ABC', 'abc'], ['upper', 'Straße', 'STRASSE'], ['redact', 'secret', '[REDACTED]']]) {
  test(`operation ${type}`, () => assert.equal(run(`a\n${value}`, { type, columns: ['a'] }).data.rows[0][0], expected));
}
test('redaction preserves empty cells and touches only selected columns', () => {
  assert.deepEqual(run('id,email\n001,\n002,test@example.invalid', { type: 'redact', columns: ['email'] }).data.rows, [['001', ''], ['002', '[REDACTED]']]);
});
test('dropEmpty applies only to chosen columns', () => assert.deepEqual(run('id,a,b\n1,,\n2,x,\n3,,y', { type: 'dropEmpty', columns: ['a', 'b'] }).data.sourceRows, [3, 4]));
test('select reorders, rename changes schema without changing values', () => {
  const data = run('a,b,c\nx,y,z', { type: 'select', columns: ['c', 'a'] }, { type: 'rename', from: 'c', to: 'renamed' }).data;
  assert.deepEqual(data.columns, ['renamed', 'a']); assert.deepEqual(data.rows, [['z', 'x']]);
});
test('select and rename reject unknown or colliding columns', () => {
  assert.throws(() => run('a,b\nx,y', { type: 'rename', from: 'a', to: 'b' }), /DUPLICATE_COLUMN_NAME/);
  assert.throws(() => run('a\nx', { type: 'select', columns: ['absent'] }), /UNKNOWN_COLUMN/);
});
for (const [operator, value, count] of [['eq', 'alpha', 1], ['neq', 'alpha', 2], ['contains', 'alp', 2]]) test(`literal filter ${operator}`, () => {
  assert.equal(run('a\nalpha\nalpine\nbeta', { type: 'filter', column: 'a', operator, value }).data.rows.length, count);
});
test('filters never evaluate code or regex', () => {
  const value = '.*'; assert.equal(run('a\n.*\nsecret', { type: 'filter', column: 'a', operator: 'contains', value }).data.rows.length, 1);
});
test('required values and unique keys are validation gates', () => {
  assert.throws(() => run('a,b\n1,', { type: 'require', columns: ['b'] }), /REQUIRED_VALUE: record 2/);
  assert.throws(() => run('a\nx\nx', { type: 'unique', columns: ['a'] }), /DUPLICATE_KEY/);
  assert.throws(() => run('a\n""', { type: 'unique', columns: ['a'] }), /EMPTY_KEY/);
  assert.equal(run('a\nx\ny', { type: 'unique', columns: ['a'] }).data.rows.length, 2);
});
test('tuple keys cannot collide through delimiters', () => {
  const data = parseCSV('a,b\n"x,y",z\nx,"y,z"');
  assert.equal(runRecipe(data, recipe({ type: 'dedupe', columns: ['a', 'b'] })).data.rows.length, 2);
});
for (const [name, value] of [
  ['unknown operation', recipe({ type: 'eval', code: 'alert(1)' })],
  ['prototype operation', recipe({ type: '__proto__', columns: ['a'] })],
  ['extra property', { ...emptyRecipe(), code: 'x' }],
  ['unknown version', { ...emptyRecipe(), version: 2 }],
  ['extra step property', recipe({ type: 'trim', columns: ['a'], secret: true })],
  ['duplicate columns', recipe({ type: 'trim', columns: ['a', 'a'] })],
  ['too many steps', recipe(...Array.from({ length: 31 }, () => ({ type: 'trim', columns: ['a'] })))],
]) test(`recipe rejects ${name}`, () => assert.throws(() => validateRecipe(value)));
test('recipe serialization round-trip and bounds', () => {
  const value = recipe({ type: 'trim', columns: ['a'] }); assert.deepEqual(readRecipe(JSON.stringify(value)), value);
  assert.throws(() => readRecipe('x'.repeat(65537)), /INVALID_RECIPE/);
  assert.throws(() => readRecipe('{secret'), /INVALID_RECIPE/);
});
test('reconciliation classifies additions, removals, edits and unchanged rows irrespective of order', () => {
  const a = parseCSV('id,value\n1,a\n2,b\n3,c'); const b = parseCSV('value,id\nc,3\nPRIVATE_CHANGED_CELL,2\nd,4');
  const result = reconcile(a, b, ['id']);
  assert.deepEqual(result.summary, { added: 1, removed: 1, changed: 1, unchanged: 1 });
  assert.deepEqual(result.changes[1], { status: 'changed', beforeRecord: 3, afterRecord: 3, columns: ['value'] });
  assert.ok(!JSON.stringify(result).includes('PRIVATE_CHANGED_CELL'));
});
test('reconciliation supports composite keys', () => {
  const data = parseCSV('id,region,v\n1,a,x\n1,b,y'); assert.equal(reconcile(data, data, ['id', 'region']).summary.unchanged, 2);
});
for (const [name, before, after, error] of [
  ['duplicate left key', 'id,v\n1,x\n1,y', 'id,v\n1,x', /DUPLICATE_KEY/],
  ['duplicate right key', 'id,v\n1,x', 'id,v\n1,x\n1,y', /DUPLICATE_KEY/],
  ['empty key', 'id,v\n,x', 'id,v\n1,x', /EMPTY_KEY/],
  ['schema mismatch', 'id,v\n1,x', 'id,z\n1,x', /SCHEMA_MISMATCH/],
]) test(`comparison refuses ${name}`, () => assert.throws(() => reconcile(parseCSV(before), parseCSV(after), ['id']), error));
test('empty datasets and header-only CSV are valid', () => {
  const empty = parseCSV('id,v\n'); assert.equal(empty.rows.length, 0);
  assert.deepEqual(reconcile(empty, empty, ['id']).summary, { added: 0, removed: 0, changed: 0, unchanged: 0 });
});
for (const value of ['=1+1', '+1', '-2', '@SUM(A1)', '\ttext', '\rtext', '\ntext', '   =cmd', '\u0001=cmd', '＝1', '\u00a0=1', '\u200b=1', ' \ttext']) test(`CSV guard handles ${JSON.stringify(value)}`, () => {
  const data = parseJSON(JSON.stringify([{ value }])); const output = exportCSV(data);
  assert.equal(output.protectedCells, 1); assert.equal(parseCSV(output.text).rows[0][0], "'" + value);
});
test('CSV guard protects headers and escaping cannot create new cells', () => {
  const data = parseJSON(JSON.stringify([{ '=header': '=1,";evil' }])); const output = exportCSV(data);
  assert.equal(output.protectedCells, 2); assert.equal(parseCSV(output.text).columns.length, 1);
});
test('JSON export preserves exact cell text, but does not reconstruct numeric types', () => {
  const data = parseCSV('id,number\n001,-1.234567890123456789'); const output = JSON.parse(exportJSON(data));
  assert.deepEqual(output, [{ id: '001', number: '-1.234567890123456789' }]);
});
test('CSV quote round-trip across a deterministic corpus', () => {
  const cells = ['', 'plain', 'a,b', 'a"b', 'one\ntwo', 'café', '🙂', '001', ' spaced '];
  for (const a of cells) for (const b of cells) {
    const data = parseJSON(JSON.stringify([{ a, b }])); assert.deepEqual(parseCSV(exportCSV(data).text).rows, data.rows);
  }
});
test('built project has exact CSP hashes, no imports, no network/storage/code execution APIs', async () => {
  const html = await readFile(join(root, 'dist/TrueFlow.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1], css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.doesNotThrow(() => new Script(script)); assert.doesNotMatch(script, /^import /m);
  for (const part of [script, css]) assert.ok(html.includes(`'sha256-${createHash('sha256').update(part).digest('base64')}'`));
  assert.ok(html.includes("connect-src 'none'")); assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|__CSP__|__STYLE__|__SCRIPT__|__LICENSE__/);
  assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|Math\.random|\beval\s*\(|\.innerHTML/);
  assert.ok(html.includes('BUSINESS AND PROFESSIONAL USE REQUIRES A PAID LICENSE'));
});
test('TrueFlow translation keys and all UI copy match across languages', async () => {
  for (const lang of ['it', 'es']) assert.deepEqual(Object.keys(COPY[lang]).sort(), Object.keys(COPY.en).sort());
  const html = await readFile(join(root, 'projects/trueflow/index.html'), 'utf8');
  for (const match of html.matchAll(/data-i18n="([^"]+)"/g)) assert.ok(COPY.en[match[1]], match[1]);
});
test('CLI pipeline, reconciliation, exclusive outputs and sensitive-path-safe errors', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trueflow-'));
  const cli = (...args) => spawnSync(process.execPath, [join(root, 'projects/trueflow/cli.mjs'), ...args], { encoding: 'utf8' });
  try {
    const input = join(dir, 'input.csv'), second = join(dir, 'after.csv'), output = join(dir, 'output.json'), recipePath = join(dir, 'recipe.json');
    await writeFile(input, 'id,v\n001, a \n002,b'); await writeFile(second, 'id,v\n001,a\n003,c');
    await writeFile(recipePath, JSON.stringify(recipe({ type: 'trim', columns: ['v'] })));
    let result = cli(input, '--recipe', recipePath, '--compare', second, '--key', 'id', '--output', output);
    assert.equal(result.status, 0, result.stderr); assert.deepEqual(JSON.parse(result.stdout).comparison.summary, { added: 1, removed: 1, changed: 0, unchanged: 1 });
    assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), [{ id: '001', v: 'a' }, { id: '002', v: 'b' }]);
    result = cli(input, '--output', output); assert.equal(result.status, 1); assert.match(result.stderr, /OUTPUT_ALREADY_EXISTS/); assert.ok(!result.stderr.includes(dir));
    result = cli(input, '--output', input); assert.equal(result.status, 1); assert.equal(await readFile(input, 'utf8'), 'id,v\n001, a \n002,b');
    assert.equal(cli(input, '--compare', second).status, 1); assert.equal(cli(input, '--unknown').status, 1);
    result = cli(join(dir, 'sensitive-missing.csv')); assert.equal(result.status, 1); assert.ok(!result.stderr.includes('sensitive-missing'));
    await writeFile(join(dir, 'invalid.csv'), Buffer.from([0xff, 0xfe, 0xff])); assert.match(cli(join(dir, 'invalid.csv')).stderr, /UTF8_REQUIRED/);
    assert.equal(cli('--help').status, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('CSV guard refuses header-name collisions introduced by protection', () => {
  const data = parseJSON(JSON.stringify([{ '=id': 'a', "'=id": 'b' }]));
  assert.throws(() => exportCSV(data), /CSV_HEADER_COLLISION/);
});
