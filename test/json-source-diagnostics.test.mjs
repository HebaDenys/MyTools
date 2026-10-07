// SPDX-License-Identifier: LicenseRef-MyTools-Personal-1.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseData, parseJSON, validationDiagnostic } from '../projects/trueflow/core.mjs';

function failure(fn) {
  try { fn(); } catch (error) { return error; }
  assert.fail('Expected JSON failure');
}
function diagnostic(text, source = 'input') {
  const error = failure(() => parseData(text, 'json', ',', source));
  assert.equal(validationDiagnostic(error), null);
  return [error, validationDiagnostic(error, true)];
}
function codePointColumn(text, index) {
  const lineStart = Math.max(text.lastIndexOf('\n', index - 1), text.lastIndexOf('\r', index - 1)) + 1;
  return Array.from(text.slice(lineStart, index)).length + 1;
}

test('malformed JSON identifies the dataset without copying parser text or input markers', () => {
  const [error, d] = diagnostic('[{"label":"LEAK_MARKER_7"', 'b');
  assert.equal(error.message, 'INVALID_JSON');
  assert.deepEqual(d, {
    format: 'mytools.trueflow.parse', version: 1, source: 'b', dataFormat: 'json',
    record: null, line: null, column: null, expectedColumns: null, actualColumns: null, code: 'INVALID_JSON',
  });
  assert.doesNotMatch(JSON.stringify(d), /LEAK_MARKER_7|label|Unexpected|position/i);
});

test('JSON root and record shape failures provide safe source and record guidance', () => {
  let [error, d] = diagnostic('{"label":"LEAK_MARKER_7"}', 'a');
  assert.equal(error.message, 'JSON_RECORDS_REQUIRED');
  assert.equal(d.source, 'a'); assert.equal(d.record, null); assert.equal(d.line, null);
  [error, d] = diagnostic('[1,{"x":"LEAK_MARKER_7"}]', 'b');
  assert.equal(error.message, 'JSON_RECORDS_REQUIRED');
  assert.equal(d.record, 1); assert.equal(d.source, 'b');
  assert.doesNotMatch(JSON.stringify(d), /LEAK_MARKER_7|"x"/);
});

test('nested JSON points to the offending token using code-point coordinates', () => {
  const text = '[\n{"🙂":"LEAK_MARKER_7","nested":{"x":1}}\n]';
  const index = text.indexOf('{"x"');
  const [error, d] = diagnostic(text, 'a');
  assert.equal(error.message, 'FLAT_JSON_REQUIRED');
  assert.deepEqual([d.source, d.record, d.line, d.column], ['a', 1, 2, codePointColumn(text, index)]);
  assert.doesNotMatch(JSON.stringify(d), /LEAK_MARKER_7|nested|"x"|🙂/);
});

test('duplicate JSON keys identify the logical record without disclosing key or values', () => {
  const text = '[\n{"id":"ok"},\n{"id":"LEAK_MARKER_7","id":"LEAK_MARKER_8"}\n]';
  const duplicateIndex = text.lastIndexOf('"id"');
  const [error, d] = diagnostic(text, 'b');
  assert.equal(error.message, 'DUPLICATE_JSON_KEY');
  assert.deepEqual([d.record, d.line, d.column], [2, 3, codePointColumn(text, duplicateIndex)]);
  assert.doesNotMatch(JSON.stringify(d), /LEAK_MARKER_7|LEAK_MARKER_8|"id"/);
});

test('JSON source labels are closed and forged errors cannot mint diagnostics', () => {
  for (const source of ['UNLISTED_SOURCE', null, {}, []]) {
    const error = failure(() => parseJSON('[{"a":1}]', source));
    assert.equal(error.message, 'INVALID_SOURCE');
    assert.equal(validationDiagnostic(error, true), null);
  }
  assert.equal(validationDiagnostic(new Error('INVALID_JSON'), true), null);
});
