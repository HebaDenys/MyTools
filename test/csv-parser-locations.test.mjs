// SPDX-License-Identifier: LicenseRef-MyTools-Personal-1.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LIMITS, parseCSV, parseData, validationDiagnostic } from '../projects/trueflow/core.mjs';

function failure(fn) {
  try { fn(); } catch (error) { return error; }
  assert.fail('Expected a parser failure');
}
const diagnostic = (text, format = 'csv', delimiter = ',', source = 'input') =>
  validationDiagnostic(failure(() => parseData(text, format, delimiter, source)), true);
const cases = [
  ['unclosed quoted field', 'PRIVATE_HEADER\n"PRIVATE_CELL\nstill', 'CSV_UNCLOSED_QUOTE', 2, 2, 1, null, null],
  ['quote in unquoted field', 'id,v\n001,abc"PRIVATE_CELL', 'CSV_UNEXPECTED_QUOTE', 2, 2, 8, null, null],
  ['text after closing quote', 'id,v\n001,"abc"PRIVATE_CELL', 'CSV_AFTER_QUOTE', 2, 2, 10, null, null],
  ['short record after multiline field', 'id,v\n1,"first\nsecond"\n2\n3,x,y', 'CSV_WIDTH', 3, 4, 1, 2, 1],
  ['wide record', 'id,v\n1,x,PRIVATE_CELL', 'CSV_WIDTH', 2, 2, 1, 2, 3],
  ['unclosed header', '"PRIVATE_HEADER\n', 'CSV_UNCLOSED_QUOTE', 1, 1, 1, null, null],
  ['escaped quotes before error', 'id\n"a""b"x', 'CSV_AFTER_QUOTE', 2, 2, 7, null, null],
];
for (const [name, text, code, record, line, column, expectedColumns, actualColumns] of cases) {
  test(`CSV parser diagnostic: ${name}`, () => {
    const error = failure(() => parseCSV(text, ',', 'b'));
    assert.equal(error.message, code === 'CSV_UNCLOSED_QUOTE' ? code : `${code}: record ${record}`);
    assert.equal(validationDiagnostic(error), null, 'parser metadata is opt-in, not a v0.5 validation error');
    assert.deepEqual(validationDiagnostic(error, true), {
      format: 'mytools.trueflow.parse', version: 1, source: 'b', dataFormat: 'csv',
      record, line, column, expectedColumns, actualColumns, code,
    });
    assert.doesNotMatch(JSON.stringify(validationDiagnostic(error, true)), /PRIVATE_|first|second/);
  });
}

test('physical line counting treats LF, CR and CRLF as one newline, including quoted fields', () => {
  for (const newline of ['\n', '\r', '\r\n']) {
    const text = ['id,v', '1,"first', 'second"', '2'].join(newline);
    const d = diagnostic(text);
    assert.deepEqual([d.record, d.line, d.column], [3, 4, 1]);
    const afterQuote = diagnostic('id,v' + newline + '1,"first' + newline + 'second"x');
    assert.deepEqual([afterQuote.record, afterQuote.line, afterQuote.column], [2, 3, 8]);
  }
});
test('Unicode columns count code points, not UTF-16 units or displayed graphemes', () => {
  for (const [text, code, expected] of [
    ['id\n🙂"PRIVATE_CELL', 'CSV_UNEXPECTED_QUOTE', 2],
    ['id\n"🙂"x', 'CSV_AFTER_QUOTE', 4],
    ['id,v\n🙂,"PRIVATE_CELL', 'CSV_UNCLOSED_QUOTE', 3],
    ['id\ne\u0301"PRIVATE_CELL', 'CSV_UNEXPECTED_QUOTE', 3],
    ['id\n\ud800"PRIVATE_CELL', 'CSV_UNEXPECTED_QUOTE', 2],
  ]) {
    const d = diagnostic(text);
    assert.equal(d.code, code); assert.equal(d.column, expected);
    assert.equal(d.line, 2); assert.equal(d.record, 2);
  }
});
test('leading BOM is ignored and TSV/semicolon preserve source and physical positions', () => {
  assert.equal(diagnostic('\uFEFF🙂"x').column, 2);
  const tsv = diagnostic('id\tv\r\n1\t🙂"PRIVATE_CELL', 'tsv', ',', 'a');
  assert.deepEqual([tsv.dataFormat, tsv.source, tsv.column, tsv.line], ['tsv', 'a', 4, 2]);
  const semi = diagnostic('id;v\n1;"PRIVATE_CELL', 'csv', ';', 'b');
  assert.deepEqual([semi.source, semi.column], ['b', 3]);
  assert.equal(diagnostic('id\n"x').source, 'input');
});
test('source and data-format metadata cannot contain user-controlled strings or objects', () => {
  for (const source of ['PRIVATE_SOURCE', null, {}, []]) {
    const error = failure(() => parseCSV('id\n"PRIVATE_CELL', ',', source));
    assert.equal(error.message, 'INVALID_SOURCE'); assert.equal(validationDiagnostic(error, true), null);
  }
  for (const format of ['PRIVATE_FORMAT', null, {}, [], 'json']) {
    const error = failure(() => parseCSV('id\n"PRIVATE_CELL', ',', 'input', format));
    assert.equal(error.message, 'INVALID_FORMAT'); assert.equal(validationDiagnostic(error, true), null);
  }
});
test('diagnostics are isolated copies from core errors; arbitrary properties are never serialized', () => {
  const error = failure(() => parseCSV('PRIVATE_HEADER\n"PRIVATE_CELL'));
  const first = validationDiagnostic(error, true);
  first.source = 'PRIVATE_SOURCE'; first.line = 99;
  error.diagnostic = { path: 'PRIVATE_PATH' }; error.message = 'PRIVATE_ERROR';
  const next = validationDiagnostic(error, true);
  assert.equal(next.source, 'input'); assert.equal(next.line, 2);
  assert.doesNotMatch(JSON.stringify(next), /PRIVATE_/);
  for (const forged of [null, 1, {}, new Error('CSV_UNCLOSED_QUOTE'), { diagnostic: next }]) {
    assert.equal(validationDiagnostic(forged, true), null);
  }
  for (const optIn of [undefined, false, 1, 'true']) assert.equal(validationDiagnostic(error, optIn), null);
});
test('header/JSON/size failures are not misreported as located CSV syntax errors', () => {
  for (const [text, format] of [['id,id\nx,y', 'csv'], ['', 'csv'], ['PRIVATE_INVALID', 'json'], ['id\n\0', 'csv'], ['id\n' + 'x'.repeat(LIMITS.bytes), 'csv']]) {
    assert.equal(validationDiagnostic(failure(() => parseData(text, format)), true), null);
  }
});
test('valid quoted Unicode and mixed line endings retain exact cell text and record numbering', () => {
  const table = parseData('id\tv\r\n1\t"🙂\r\nfirst\rsecond\nlast"\r2\t"x""y"\n', 'tsv');
  assert.deepEqual(table.rows, [['1', '🙂\r\nfirst\rsecond\nlast'], ['2', 'x"y']]);
  assert.deepEqual(table.sourceRows, [2, 3]);
});
test('CLI retains stable parser errors, omits opt-in browser metadata and creates no failure outputs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trueflow-parser-'));
  const cli = fileURLToPath(new URL('../projects/trueflow/cli.mjs', import.meta.url));
  try {
    const input = join(dir, 'PRIVATE_PATH.csv'), output = join(dir, 'output.json'), report = join(dir, 'report.json');
    for (const [, text, code, record] of cases.slice(0, 5)) {
      await writeFile(input, text);
      const expected = code === 'CSV_UNCLOSED_QUOTE' ? code : `${code}: record ${record}`;
      const args = [cli, input, '--output', output, '--report', report];
      for (const json of [false, true]) {
        const result = spawnSync(process.execPath, [...args, ...(json ? ['--diagnostics-json'] : [])], { encoding: 'utf8', timeout: 10000 });
        assert.equal(result.status, 1); assert.equal(result.stderr, `TrueFlow: ${expected}\n`);
        assert.equal(result.stdout, json ? JSON.stringify({ error: expected }) + '\n' : '');
        assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_|mytools.trueflow.parse/);
        await assert.rejects(access(output)); await assert.rejects(access(report));
      }
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
