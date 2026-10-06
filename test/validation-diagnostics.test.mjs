// SPDX-License-Identifier: LicenseRef-MyTools-Personal-1.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, parseJSON, runRecipe, emptyRecipe, reconcile, validationDiagnostic, VALIDATION_ISSUE_LIMIT, applySchemaMapping } from '../projects/trueflow/core.mjs';
import { callTool, matches, openApi, toolFailure } from '../adapters/local/registry.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, writeFile, readFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const recipe = (...steps) => ({ ...emptyRecipe(), steps });
function failure(fn) { try { fn(); } catch (e) { return e; } assert.fail('Expected a validation failure'); }
const unique = { type: 'unique', columns: ['id'] };

test('key diagnostics enumerate all bad rows and their first conflicting records, not keys or headers', () => {
  const data = parseCSV('PRIVATE_HEADER,other\nPRIVATE_KEY,a\nPRIVATE_KEY,b\n,c\nother,d\nPRIVATE_KEY,e');
  const error = failure(() => reconcile(data, data, ['PRIVATE_HEADER']));
  assert.equal(error.message, 'DUPLICATE_KEY: record 3');
  const diagnostic = validationDiagnostic(error);
  assert.deepEqual(diagnostic, { format: 'mytools.trueflow.validation', version: 1, source: 'a', check: 'unique', step: null, totalIssues: 3, issues: [
    { code: 'DUPLICATE_KEY', record: 3, firstRecord: 2, columns: [1] },
    { code: 'EMPTY_KEY', record: 4, firstRecord: null, columns: [1] },
    { code: 'DUPLICATE_KEY', record: 6, firstRecord: 2, columns: [1] },
  ], truncated: false });
  assert.doesNotMatch(JSON.stringify(diagnostic), /PRIVATE_|other/);
  assert.equal(error.diagnostic, undefined); // no arbitrary property is trusted by the serializer
  diagnostic.issues[0].record = 99;
  assert.equal(validationDiagnostic(error).issues[0].record, 3);
});
test('valid A and failing B identifies B; empty keys are not grouped as duplicates', () => {
  const error = failure(() => reconcile(parseCSV('id\nx'), parseCSV('id\nx\n""\n""\nx'), ['id']));
  const d = validationDiagnostic(error);
  assert.equal(d.source, 'b'); assert.equal(d.totalIssues, 3);
  assert.deepEqual(d.issues.map(i => i.code), ['EMPTY_KEY', 'EMPTY_KEY', 'DUPLICATE_KEY']);
});
test('required-value gate counts affected rows, retaining all missing column positions', () => {
  const input = parseCSV('id,secret,private\n1,,\n2,a,\n3,a,b');
  const error = failure(() => runRecipe(input, recipe({ type: 'require', columns: ['secret', 'private'] }), 'b'));
  const d = validationDiagnostic(error);
  assert.equal(error.message, 'REQUIRED_VALUE: record 2'); assert.equal(d.source, 'b'); assert.equal(d.step, 1); assert.equal(d.check, 'require');
  assert.deepEqual(d.issues.map(i => i.columns), [[2, 3], [3]]); assert.equal(d.totalIssues, 2);
});
test('record positions survive filtering, schema reordering and normalization before validation', () => {
  const input = parseCSV('id,enabled\n x ,no\n a ,yes\na,yes'), snapshot = structuredClone(input);
  const error = failure(() => runRecipe(input, recipe(
    { type: 'filter', column: 'enabled', operator: 'eq', value: 'yes' },
    { type: 'select', columns: ['enabled', 'id'] }, { type: 'trim', columns: ['id'] }, unique)));
  const d = validationDiagnostic(error);
  assert.equal(d.step, 4); assert.deepEqual(d.issues, [{ code: 'DUPLICATE_KEY', record: 4, firstRecord: 3, columns: [2] }]);
  assert.deepEqual(input, snapshot);
});
test('CSV multiline records and JSON retain their distinct logical numbering', () => {
  for (const [data, expected] of [[parseCSV('id,v\nx,"one\ntwo"\nx,z'), [3, 2]], [parseJSON('[{"id":"x"},{"id":"x"}]'), [2, 1]]]) {
    const d = validationDiagnostic(failure(() => runRecipe(data, recipe(unique))));
    assert.deepEqual([d.issues[0].record, d.issues[0].firstRecord], expected);
  }
});
test('composite keys are compared as exact tuples, without delimiter collisions or trimming', () => {
  const data = parseCSV('id,region\n"x,y",z\nx,"y,z"\n x,z\nx,z');
  assert.equal(runRecipe(data, recipe({ ...unique, columns: ['id', 'region'] })).data.rows.length, 4);
  const bad = parseCSV('id,region\nx,\nx,a\nx,a');
  const d = validationDiagnostic(failure(() => runRecipe(bad, recipe({ ...unique, columns: ['id', 'region'] }))));
  assert.deepEqual(d.issues.map(i => i.columns), [[2], [1, 2]]);
});
test('diagnostics keep first 100 locations but scan and count the entire bounded input', () => {
  const data = parseCSV('id\n' + 'PRIVATE_KEY\n'.repeat(50000));
  const d = validationDiagnostic(failure(() => runRecipe(data, recipe(unique))));
  assert.equal(d.totalIssues, 49999); assert.equal(d.issues.length, VALIDATION_ISSUE_LIMIT); assert.equal(d.truncated, true);
  assert.equal(d.issues.at(-1).record, 102); assert.ok(JSON.stringify(d).length < 20000);
});
test('exactly 100 issues is not marked truncated and later recipe gates do not run', () => {
  const d = validationDiagnostic(failure(() => runRecipe(parseCSV('id\n' + 'x\n'.repeat(101)), recipe(unique, { type: 'select', columns: ['absent'] }))));
  assert.equal(d.totalIssues, 100); assert.equal(d.truncated, false); assert.equal(d.step, 1);
});
test('malformed recipes with falsy columns fail rather than silently skipping validation', () => {
  for (const columns of [null, false, 0, '']) for (const type of ['trim', 'require', 'unique']) {
    assert.throws(() => runRecipe(parseCSV('id\nx'), recipe({ type, columns })), /COLUMN_LIMIT/);
  }
  assert.throws(() => runRecipe(parseCSV('id\nx'), recipe(unique), 'private-label'), /INVALID_SOURCE/);
});
test('arbitrary and forged errors never create a diagnostic or leak unknown metadata', () => {
  assert.equal(validationDiagnostic(new Error('PRIVATE_VALUE')), null);
  assert.equal(validationDiagnostic({ diagnostic: { text: 'PRIVATE_VALUE' } }), null);
  assert.equal(validationDiagnostic(null), null);
  assert.deepEqual(toolFailure({ code: 'PRIVATE', diagnostic: { text: 'PRIVATE_VALUE' } }), { error: 'OPERATION_FAILED' });
});
test('registry preserves safe comparison/recipe metadata and the OpenAPI schema is closed', async () => {
  let error;
  try { await callTool('trueflow_run', { source: { text: 'id\nx\nx' }, recipe: recipe(unique) }); } catch (e) { error = e; }
  const body = toolFailure(error); assert.equal(body.error, 'DUPLICATE_KEY: record 3'); assert.equal(body.diagnostic.source, 'input');
  assert.equal(error.diagnostic, undefined); body.diagnostic.issues[0].record = 99; assert.equal(toolFailure(error).diagnostic.issues[0].record, 3);
  const schema = openApi().components.schemas.TrueFlowValidation;
  assert.ok(matches(body.diagnostic, schema)); assert.equal(schema.additionalProperties, false);
  assert.equal(matches({ ...body.diagnostic, private: 'x' }, schema), false);
  const altered = structuredClone(body.diagnostic); altered.issues[0].columns = [0]; assert.equal(matches(altered, schema), false);
  await assert.rejects(callTool('trueflow_profile', { source: { text: 'PRIVATE_INVALID' , format: 'json' } }), e => !('diagnostic' in e) && e.code === 'INVALID_JSON');
});
test('CLI optionally emits safe JSON failures without writing output/report files and can recover', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trueflow-conflicts-'));
  const cli = (...args) => spawnSync(process.execPath, [join(root, 'projects/trueflow/cli.mjs'), ...args], { encoding: 'utf8' });
  try {
    const file = join(dir, 'private-file.csv'), rec = join(dir, 'recipe.json'), out = join(dir, 'result.json'), report = join(dir, 'report.json');
    await writeFile(file, 'id\nPRIVATE_KEY\nPRIVATE_KEY'); await writeFile(rec, JSON.stringify(recipe(unique)));
    const args = [file, '--recipe', rec, '--output', out, '--report', report];
    let result = cli(...args);
    assert.equal(result.status, 1); assert.equal(result.stdout, ''); assert.match(result.stderr, /DUPLICATE_KEY: record 3/);
    result = cli(...args, '--diagnostics-json'); assert.equal(result.status, 1);
    const body = JSON.parse(result.stdout); assert.equal(body.diagnostic.issues[0].firstRecord, 2); assert.equal(body.diagnostic.source, 'a');
    assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_KEY|private-file|trueflow-conflicts/);
    await assert.rejects(access(out)); await assert.rejects(access(report));
    await writeFile(file, 'id\n001\n002'); result = cli(...args, '--diagnostics-json'); assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(await readFile(out, 'utf8')), [{ id: '001' }, { id: '002' }]);
    assert.equal(JSON.parse(await readFile(report, 'utf8')).a.profile.rowCount, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// Reconcile the parallel first-pair proposal without changing released error text.
test('first-pair diagnostics preserve both sides and v0.4.0 machine messages', () => {
  const duplicate = parseCSV('PRIVATE_HEADER,v\nPRIVATE_KEY,x\nPRIVATE_KEY,y'), valid = parseCSV('PRIVATE_HEADER,v\nPRIVATE_KEY,x');
  const snapshot = structuredClone(duplicate);
  for (const [a, b, source] of [[duplicate, valid, 'a'], [valid, duplicate, 'b']]) {
    const error = failure(() => reconcile(a, b, ['PRIVATE_HEADER'])), d = validationDiagnostic(error);
    assert.equal(error.message, 'DUPLICATE_KEY: record 3');
    assert.equal(d.source, source);
    assert.deepEqual(d.issues, [{ code: 'DUPLICATE_KEY', record: 3, firstRecord: 2, columns: [1] }]);
    assert.doesNotMatch(error.message + JSON.stringify(d), /PRIVATE_/);
  }
  assert.deepEqual(duplicate, snapshot);
});
test('mapped B conflict locations and composite-key recovery share one validator', () => {
  const a = parseCSV('id,status\n001,active'), b = parseCSV('customer_id,status\n001,active\n001,pending');
  const aligned = applySchemaMapping(a, b, { format: 'mytools.trueflow.mapping', version: 1, columns: [{ before: 'id', after: 'customer_id' }] });
  const error = failure(() => reconcile(a, aligned, ['id'])), d = validationDiagnostic(error);
  assert.equal(error.message, 'DUPLICATE_KEY: record 3'); assert.equal(d.source, 'b');
  assert.equal(d.issues[0].firstRecord, 2); assert.equal(d.issues[0].record, 3);
  assert.deepEqual(reconcile(a, aligned, ['id', 'status']).summary, { added: 1, removed: 0, changed: 0, unchanged: 1 });
});
