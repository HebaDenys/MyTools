// SPDX-License-Identifier: LicenseRef-MyTools-Personal-1.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseCSV, parseJSON, emptyMapping, validateMapping, readMapping, planSchemaMapping, applySchemaMapping, runRecipe, emptyRecipe, reconcile, exportJSON } from '../projects/trueflow/core.mjs';
const mapping = (...columns) => ({ ...emptyMapping(), columns });
const pair = (before, after) => ({ before, after });
const a = parseCSV('id,name,status\n001, A ,active\n002,B,pending');
const b = parseCSV('label,status,customer_id\nA,active,001\nC,active,003');
const map = mapping(pair('id', 'customer_id'), pair('name', 'label'));
test('mapping plans explicit pairs and exact remaining names in canonical A order', () => {
  assert.deepEqual(planSchemaMapping(a, b, map), { pairs: [pair('id', 'customer_id'), pair('name', 'label'), pair('status', 'status')], unmatchedBefore: [], unmatchedAfter: [] });
});
test('mapping preserves original tables, cell bytes and record positions', () => {
  const before = structuredClone(a), after = structuredClone(b), config = structuredClone(map);
  const aligned = applySchemaMapping(a, b, map);
  assert.deepEqual(aligned.columns, a.columns); assert.deepEqual(aligned.rows[0], ['001', 'A', 'active']);
  assert.deepEqual(aligned.sourceRows, b.sourceRows); assert.deepEqual(a, before); assert.deepEqual(b, after); assert.deepEqual(map, config);
  aligned.rows[0][0] = 'not-original'; aligned.columns[0] = 'not-original'; aligned.sourceRows[0] = 999;
  assert.deepEqual(b, after); assert.deepEqual(a, before);
});
test('map then recipe then comparison and real JSON export complete a workflow', () => {
  const recipe = { ...emptyRecipe(), steps: [{ type: 'trim', columns: ['name'] }] };
  const left = runRecipe(a, recipe), right = runRecipe(applySchemaMapping(a, b, map), recipe);
  assert.deepEqual(reconcile(left.data, right.data, ['id']).summary, { added: 1, removed: 1, changed: 0, unchanged: 1 });
  assert.deepEqual(JSON.parse(exportJSON(right.data)), [{ id: '001', name: 'A', status: 'active' }, { id: '003', name: 'C', status: 'active' }]);
});
test('partial mapping reports unmatched names but never example cell values', () => {
  const plan = planSchemaMapping(a, b, mapping(pair('id', 'customer_id')));
  assert.deepEqual(plan.unmatchedBefore, ['name']); assert.deepEqual(plan.unmatchedAfter, ['label']);
  assert.ok(!JSON.stringify(plan).includes('001'));
  assert.throws(() => applySchemaMapping(a, b, mapping(pair('id', 'customer_id'))), /SCHEMA_UNMAPPED/);
});
test('unmapped extra B columns are not silently dropped', () => {
  const extra = parseCSV('id,name,status,unexpected\n001,A,active,private');
  assert.deepEqual(planSchemaMapping(a, extra).unmatchedAfter, ['unexpected']);
  assert.throws(() => applySchemaMapping(a, extra, emptyMapping()), /SCHEMA_UNMAPPED/);
});
test('matching is exact, case-sensitive, and never guesses renamed headers', () => {
  const plan = planSchemaMapping(parseCSV('id\n1'), parseCSV('ID\n1'));
  assert.deepEqual(plan.pairs, []); assert.deepEqual(plan.unmatchedBefore, ['id']);
  assert.deepEqual(plan.unmatchedAfter, ['ID']);
});
test('explicit swaps apply simultaneously instead of overwriting intermediate names', () => {
  const left = parseCSV('id,value\n001,x'), right = parseCSV('id,value\nx,001');
  const aligned = applySchemaMapping(left, right, mapping(pair('id', 'value'), pair('value', 'id')));
  assert.deepEqual(aligned.rows, left.rows); assert.equal(reconcile(left, aligned, ['id']).summary.unchanged, 1);
});
test('exact names work without overrides and legacy reconcile stays strict', () => {
  assert.deepEqual(applySchemaMapping(a, a, emptyMapping()), a);
  assert.throws(() => reconcile(a, b, ['id']), /SCHEMA_MISMATCH/);
});
test('prototype-looking header names and HTML strings remain plain data', () => {
  const left = parseJSON('[{"__proto__":"001","constructor":"x"}]');
  const right = parseJSON('[{"key":"001","<img>":"x"}]');
  assert.deepEqual(applySchemaMapping(left, right, mapping(pair('__proto__', 'key'), pair('constructor', '<img>'))).rows, left.rows);
  assert.equal({}.polluted, undefined);
});
test('mapping does not weaken duplicate keys, composite keys or source-record reporting', () => {
  const right = parseCSV('customer_id,label,status\n001,A,active\n001,B,pending');
  const aligned = applySchemaMapping(a, right, map);
  assert.throws(() => reconcile(a, aligned, ['id']), /DUPLICATE_KEY: record 3/);
  assert.equal(reconcile(a, aligned, ['id', 'status']).summary.changed, 1);
});
test('header-only input can be aligned and exported without records', () => {
  const aligned = applySchemaMapping(parseCSV('id\n'), parseCSV('key\n'), mapping(pair('id', 'key')));
  assert.deepEqual(aligned.rows, []); assert.equal(exportJSON(aligned), '[]');
});
for (const [label, value, error] of [
  ['null', null, 'INVALID_SCHEMA_MAPPING'], ['array', [], 'INVALID_SCHEMA_MAPPING'],
  ['wrong version', { ...map, version: 2 }, 'INVALID_SCHEMA_MAPPING'],
  ['unknown field', { ...map, path: '/private-path' }, 'INVALID_SCHEMA_MAPPING'],
  ['wrong format', { ...map, format: 'another' }, 'INVALID_SCHEMA_MAPPING'],
  ['missing fields', {}, 'INVALID_SCHEMA_MAPPING'],
  ['extra pair field', mapping({ before: 'id', after: 'key', eval: 'not-code' }), 'INVALID_SCHEMA_MAPPING'],
  ['empty header', mapping(pair('', 'key')), 'INVALID_SCHEMA_MAPPING'],
  ['whitespace header', mapping(pair('id', ' ')), 'INVALID_SCHEMA_MAPPING'],
  ['nonstring header', mapping(pair('id', 42)), 'INVALID_SCHEMA_MAPPING'],
  ['too long', mapping(pair('id', 'x'.repeat(201))), 'INVALID_SCHEMA_MAPPING'],
  ['duplicate A', mapping(pair('id', 'x'), pair('id', 'y')), 'AMBIGUOUS_SCHEMA_MAPPING'],
  ['duplicate B', mapping(pair('id', 'x'), pair('name', 'x')), 'AMBIGUOUS_SCHEMA_MAPPING'],
  ['too many pairs', mapping(...Array.from({ length: 101 }, (_, i) => pair(`a${i}`, `b${i}`))), 'INVALID_SCHEMA_MAPPING'],
]) test(`mapping rejects ${label}`, () => assert.throws(() => validateMapping(value), new RegExp(error)));
test('unknown mapping names produce safe codes, not private input values or names', () => {
  for (const config of [mapping(pair('SENSITIVE_HEADER', 'customer_id')), mapping(pair('id', 'SENSITIVE_HEADER'))]) {
    assert.throws(() => planSchemaMapping(a, b, config), e => e.message === 'UNKNOWN_MAPPING_COLUMN');
  }
});
test('versioned mapping JSON round trips and respects byte/shape limits', () => {
  assert.deepEqual(readMapping(JSON.stringify(map)), map);
  const copy = validateMapping(map); copy.columns[0].after = 'changed'; assert.equal(map.columns[0].after, 'customer_id');
  for (const value of ['{private', ' '.repeat(65537), '"' + '🙂'.repeat(20000) + '"']) assert.throws(() => readMapping(value), /INVALID_SCHEMA_MAPPING/);
});
test('CLI accepts mapping file before recipe and exports diagnostics without cell values', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mytools-map-'));
  const cli = fileURLToPath(new URL('../projects/trueflow/cli.mjs', import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 10000 });
  try {
    const before = join(dir, 'a.csv'), after = join(dir, 'b.csv'), config = join(dir, 'mapping.json'), recipePath = join(dir, 'recipe.json'), output = join(dir, 'report.json');
    await writeFile(before, 'id,name\n001, A \n002,B'); await writeFile(after, 'key,label\n001,A\n003,C');
    await writeFile(config, JSON.stringify(mapping(pair('id', 'key'), pair('name', 'label'))));
    await writeFile(recipePath, JSON.stringify({ ...emptyRecipe(), steps: [{ type: 'trim', columns: ['name'] }] }));
    const args = [before, '--compare', after, '--mapping', config, '--recipe', recipePath, '--key', 'id'];
    const result = run(...args, '--report', output); assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(await readFile(output, 'utf8'));
    assert.deepEqual(report.comparison.summary, { added: 1, removed: 1, changed: 0, unchanged: 1 });
    assert.equal(report.schemaMapping.pairs[0].after, 'key'); assert.ok(!JSON.stringify(report).includes('001'));
    assert.match(run(...args, '--report', output).stderr, /OUTPUT_ALREADY_EXISTS/);
    assert.match(run(before, '--mapping', config).stderr, /COMPARE_INPUT_REQUIRED/);
    await writeFile(config, JSON.stringify(mapping(pair('id', 'PRIVATE_HEADER'))));
    const failure = run(...args); assert.equal(failure.status, 1); assert.equal(failure.stdout, '');
    assert.match(failure.stderr, /UNKNOWN_MAPPING_COLUMN/); assert.ok(!failure.stderr.includes('PRIVATE_HEADER') && !failure.stderr.includes(dir));
    assert.equal(await readFile(before, 'utf8'), 'id,name\n001, A \n002,B');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
