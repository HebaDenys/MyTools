// SPDX-License-Identifier: LicenseRef-MyTools-Personal-1.0
// Copyright 2026 Denys Heba. Original data is never mutated.
export const LIMITS = Object.freeze({ bytes: 5 * 1024 * 1024, rows: 50000, columns: 100, cells: 500000, steps: 30 });
const encoder = new TextEncoder();
const fail = (code, detail = '') => { throw new Error(`${code}${detail ? `: ${detail}` : ''}`); };
const parseErrors = new WeakMap();
function parseFail(code, detail, diagnostic) {
  const error = new Error(`${code}${detail ? `: ${detail}` : ''}`);
  parseErrors.set(error, { format: 'mytools.trueflow.parse', version: 1, ...diagnostic, code });
  throw error;
}
function textLocation(text, index) {
  let line = 1, column = 1;
  for (let i = 0; i < index; i++) {
    const ch = text[i];
    if (ch === '\r') {
      if (text[i + 1] === '\n' && i + 1 < index) i++;
      line++; column = 1;
    } else if (ch === '\n') { line++; column = 1; }
    else {
      if (ch.codePointAt(0) > 0xffff) i++;
      column++;
    }
  }
  return { line, column };
}
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function boundedText(text, limit = LIMITS.bytes) {
  if (typeof text !== 'string') fail('TEXT_REQUIRED');
  if (text.length > limit || encoder.encode(text).length > limit) fail('INPUT_TOO_LARGE');
  if (text.includes('\0')) fail('NUL_NOT_SUPPORTED');
  return text.replace(/^\uFEFF/, '');
}
function validColumns(columns) {
  if (!Array.isArray(columns) || !columns.length || columns.length > LIMITS.columns) fail('COLUMN_LIMIT');
  if (columns.some(c => typeof c !== 'string' || !c.trim() || c.length > 200)) fail('INVALID_COLUMN_NAME');
  if (new Set(columns).size !== columns.length) fail('DUPLICATE_COLUMN_NAME');
}
function table(columns, rows, sourceRows = rows.map((_, i) => i + 2)) {
  validColumns(columns);
  if (!Array.isArray(rows) || rows.length > LIMITS.rows || rows.length * columns.length > LIMITS.cells) fail('TABLE_LIMIT');
  if (rows.some(row => !Array.isArray(row) || row.length !== columns.length || row.some(c => typeof c !== 'string'))) fail('INVALID_ROW');
  if (sourceRows.length !== rows.length || sourceRows.some(n => !Number.isSafeInteger(n) || n < 1)) fail('INVALID_SOURCE_ROWS');
  return { columns, rows, sourceRows };
}
function csvRecords(text, delimiter, source, dataFormat) {
  if (![',', ';', '\t'].includes(delimiter)) fail('INVALID_DELIMITER');
  const records = [], starts = [0]; let row = [], field = '', quoted = false, closed = false, started = false, cells = 0, quoteStart = null;
  const diagnostic = (record, index, expectedColumns = null, actualColumns = null) => {
    const { line, column } = textLocation(text, index);
    return { source, dataFormat, record, line, column, expectedColumns, actualColumns };
  };
  const cell = () => {
    row.push(field); field = ''; closed = false; quoteStart = null;
    if (row.length > LIMITS.columns || ++cells > LIMITS.cells + LIMITS.columns) fail('TABLE_LIMIT');
  };
  const record = () => {
    cell(); records.push(row); row = []; started = false;
    if (records.length > LIMITS.rows + 1) fail('TABLE_LIMIT');
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else field += ch;
      continue;
    }
    if (ch === delimiter) { cell(); started = true; }
    else if (ch === '\n' || ch === '\r') {
      record();
      if (ch === '\r' && text[i + 1] === '\n') i++;
      starts.push(i + 1);
    } else if (closed) {
      const recordNumber = records.length + 1;
      parseFail('CSV_AFTER_QUOTE', `record ${recordNumber}`, diagnostic(recordNumber, i));
    } else if (ch === '"') {
      const recordNumber = records.length + 1;
      if (field.length) parseFail('CSV_UNEXPECTED_QUOTE', `record ${recordNumber}`, diagnostic(recordNumber, i));
      quoted = true; started = true; quoteStart = i;
    } else { field += ch; started = true; }
  }
  if (quoted) {
    const recordNumber = records.length + 1, index = quoteStart ?? Math.max(0, text.length - 1);
    parseFail('CSV_UNCLOSED_QUOTE', '', diagnostic(recordNumber, index));
  }
  if (started || row.length || closed) record();
  return { records, starts };
}
/** Strict quoted CSV; delimiters are explicit rather than guessed. All cells stay text. */
export function parseCSV(input, delimiter = ',', source = 'input', dataFormat = 'csv') {
  if (!['input', 'a', 'b'].includes(source)) fail('INVALID_SOURCE');
  const text = boundedText(input), parsed = csvRecords(text, delimiter, source, dataFormat), records = parsed.records;
  if (!records.length) fail('EMPTY_INPUT');
  const [columns, ...rows] = records;
  validColumns(columns);
  const bad = rows.findIndex(row => row.length !== columns.length);
  if (bad !== -1) {
    const recordNumber = bad + 2, index = parsed.starts[bad + 1] ?? 0, { line, column } = textLocation(text, index);
    parseFail('CSV_WIDTH', `record ${recordNumber}`, { source, dataFormat, record: recordNumber, line, column, expectedColumns: columns.length, actualColumns: rows[bad].length });
  }
  return table(columns, rows);
}
/** Flat JSON records. Number lexemes stay exact text; no numeric round-trip. */
export function parseJSON(input) {
  const text = boundedText(input);
  // Check grammar first. Error messages deliberately never include source values.
  try { JSON.parse(text); } catch { fail('INVALID_JSON'); }
  const tokens = /"(?:\\[\s\S]|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\]]/g;
  const stack = []; let rewritten = '', cursor = 0;
  for (const match of text.matchAll(tokens)) {
    const token = match[0];
    if (token === '{' || token === '[') {
      if (stack.length >= 2) fail('FLAT_JSON_REQUIRED');
      stack.push(token === '{' ? new Set() : null);
    } else if (token === '}' || token === ']') stack.pop();
    else if (token[0] === '"' && /^\s*:/.test(text.slice(match.index + token.length))) {
      const keys = stack.at(-1), key = JSON.parse(token);
      if (keys?.has(key)) fail('DUPLICATE_JSON_KEY');
      keys?.add(key);
    }
    rewritten += text.slice(cursor, match.index) + (/^-?\d/.test(token) ? JSON.stringify(token) : token);
    cursor = match.index + token.length;
  }
  rewritten += text.slice(cursor);
  const records = JSON.parse(rewritten);
  if (!Array.isArray(records) || !records.length || records.some(r => !object(r))) fail('JSON_RECORDS_REQUIRED');
  if (records.length > LIMITS.rows) fail('TABLE_LIMIT');
  const columns = [...new Set(records.flatMap(r => Object.keys(r)))];
  validColumns(columns);
  const rows = records.map(record => columns.map(column => {
    const value = Object.hasOwn(record, column) ? record[column] : null;
    if (value === null) return '';
    if (typeof value === 'string' || typeof value === 'boolean') return String(value);
    fail('FLAT_JSON_REQUIRED');
  }));
  return table(columns, rows, rows.map((_, i) => i + 1));
}
export function parseData(text, format = 'csv', delimiter = ',', source = 'input') {
  if (format === 'json') return parseJSON(text);
  if (format === 'tsv') return parseCSV(text, '\t', source, 'tsv');
  if (format === 'csv') return parseCSV(text, delimiter, source, 'csv');
  fail('INVALID_FORMAT');
}
function indices(data, columns) {
  if (!Array.isArray(columns) || !columns.length || columns.length > LIMITS.columns || new Set(columns).size !== columns.length) fail('SELECT_COLUMNS');
  return columns.map(name => { const i = data.columns.indexOf(name); if (i < 0) fail('UNKNOWN_COLUMN'); return i; });
}
const keyFor = (row, ids) => JSON.stringify(ids.map(i => row[i]));
const blank = value => value.trim() === '';
/** Count-only report: no example cell values, keys or file paths. Column names remain metadata. */
export function profile(data) {
  table(data.columns, data.rows, data.sourceRows);
  return {
    rowCount: data.rows.length, columnCount: data.columns.length,
    duplicateRows: data.rows.length - new Set(data.rows.map(r => JSON.stringify(r))).size,
    columns: data.columns.map((name, i) => {
      const values = data.rows.map(r => r[i]), present = values.filter(v => !blank(v));
      return { name, missing: values.length - present.length, distinct: new Set(present).size,
        whitespace: values.filter(v => v !== v.trim()).length,
        formulaLike: values.filter(formulaLike).length };
    }),
  };
}
const fields = Object.freeze({ trim: ['columns'], normalize: ['columns'], lower: ['columns'], upper: ['columns'], redact: ['columns'], dropEmpty: ['columns'], dedupe: ['columns'], select: ['columns'], rename: ['from', 'to'], filter: ['column', 'operator', 'value'], require: ['columns'], unique: ['columns'] });
function exactKeys(value, keys) {
  if (!object(value) || Object.keys(value).some(k => !keys.includes(k)) || keys.some(k => !Object.hasOwn(value, k))) fail('INVALID_RECIPE');
}
export function validateRecipe(recipe) {
  exactKeys(recipe, ['format', 'version', 'steps']);
  if (recipe.format !== 'mytools.trueflow.recipe' || recipe.version !== 1 || !Array.isArray(recipe.steps) || recipe.steps.length > LIMITS.steps) fail('INVALID_RECIPE');
  for (const step of recipe.steps) {
    if (!object(step) || typeof step.type !== 'string' || !Object.hasOwn(fields, step.type)) fail('UNKNOWN_OPERATION');
    exactKeys(step, ['type', ...fields[step.type]]);
    if (Object.hasOwn(step, 'columns')) validColumns(step.columns);
    for (const key of ['from', 'to', 'column']) if (Object.hasOwn(step, key) && (typeof step[key] !== 'string' || !step[key].trim() || step[key].length > 200)) fail('INVALID_RECIPE');
    if (step.type === 'filter' && (!['eq', 'neq', 'contains'].includes(step.operator) || typeof step.value !== 'string' || step.value.length > 1000)) fail('INVALID_RECIPE');
  }
  return JSON.parse(JSON.stringify(recipe));
}
export function readRecipe(text) {
  let value;
  try { value = JSON.parse(boundedText(text, 65536)); } catch { fail('INVALID_RECIPE'); }
  return validateRecipe(value);
}
export const emptyRecipe = () => ({ format: 'mytools.trueflow.recipe', version: 1, steps: [] });
// Only diagnostics minted here can cross transport/logging boundaries. Never copy
// arbitrary Error properties, parser messages, cell values or header names.
const validationErrors = new WeakMap();
export const VALIDATION_ISSUE_LIMIT = 100;
export function validationDiagnostic(error, includeParser = false) {
  const diagnostic = validationErrors.get(error) ?? (includeParser === true ? parseErrors.get(error) : null);
  return diagnostic ? structuredClone(diagnostic) : null;
}
function assertValidRows(data, ids, check, source = 'input', step = null) {
  const seen = new Map(), issues = []; let totalIssues = 0;
  const recordIssue = (code, row, columns, firstRecord = null) => {
    totalIssues++;
    if (issues.length < VALIDATION_ISSUE_LIMIT) issues.push({ code, record: data.sourceRows[row], firstRecord, columns: columns.map(i => i + 1) });
  };
  for (let row = 0; row < data.rows.length; row++) {
    const missing = ids.filter(i => blank(data.rows[row][i]));
    if (missing.length) { recordIssue(check === 'unique' ? 'EMPTY_KEY' : 'REQUIRED_VALUE', row, missing); continue; }
    if (check === 'unique') {
      const key = keyFor(data.rows[row], ids);
      if (seen.has(key)) recordIssue('DUPLICATE_KEY', row, ids, seen.get(key));
      else seen.set(key, data.sourceRows[row]);
    }
  }
  if (!totalIssues) return;
  const first = issues[0], error = new Error(`${first.code}: record ${first.record}`);
  validationErrors.set(error, { format: 'mytools.trueflow.validation', version: 1,
    source, check, step, totalIssues, issues, truncated: totalIssues > issues.length });
  throw error;
}
/** Every run starts from a copy of the original. Recipes are data, never executable code. */
export function runRecipe(original, recipe, source = 'input') {
  if (!['input', 'a', 'b'].includes(source)) fail('INVALID_SOURCE');
  table(original.columns, original.rows, original.sourceRows);
  const validated = validateRecipe(recipe);
  let data = table([...original.columns], original.rows.map(row => [...row]), [...original.sourceRows]);
  const journal = [];
  for (const [index, step] of validated.steps.entries()) {
    const before = data.rows.length; let changedCells = 0;
    const ids = step.columns ? indices(data, step.columns) : [];
    const retain = predicate => {
      const keep = data.rows.map(predicate), rows = [], sourceRows = [];
      for (let i = 0; i < keep.length; i++) if (keep[i]) { rows.push(data.rows[i]); sourceRows.push(data.sourceRows[i]); }
      data = { ...data, rows, sourceRows };
    };
    if (['trim', 'normalize', 'lower', 'upper', 'redact'].includes(step.type)) {
      for (const row of data.rows) for (const i of ids) {
        const old = row[i];
        const value = step.type === 'trim' ? old.trim() : step.type === 'normalize' ? old.normalize('NFC') : step.type === 'lower' ? old.toLowerCase() : step.type === 'upper' ? old.toUpperCase() : old === '' ? '' : '[REDACTED]';
        if (old !== value) changedCells++;
        row[i] = value;
      }
    } else if (step.type === 'dropEmpty') retain(row => ids.some(i => !blank(row[i])));
    else if (step.type === 'dedupe') {
      const seen = new Set();
      retain(row => { const key = keyFor(row, ids); if (seen.has(key)) return false; seen.add(key); return true; });
    } else if (step.type === 'select') data = { ...data, columns: [...step.columns], rows: data.rows.map(row => ids.map(i => row[i])) };
    else if (step.type === 'rename') {
      const [i] = indices(data, [step.from]);
      if (data.columns.includes(step.to) && step.to !== step.from) fail('DUPLICATE_COLUMN_NAME');
      data.columns[i] = step.to;
    } else if (step.type === 'filter') {
      const [i] = indices(data, [step.column]);
      retain(row => step.operator === 'eq' ? row[i] === step.value : step.operator === 'neq' ? row[i] !== step.value : row[i].includes(step.value));
    } else if (step.type === 'require') {
      assertValidRows(data, ids, 'require', source, index + 1);
    } else if (step.type === 'unique') assertValidRows(data, ids, 'unique', source, index + 1);
    journal.push({ step: index + 1, operation: step.type, rowsBefore: before, rowsAfter: data.rows.length, removedRows: before - data.rows.length, changedCells });
  }
  return { data, journal };
}
/** Versioned, value-free correspondence from original B headers to original A headers. */
export const emptyMapping = () => ({ format: 'mytools.trueflow.mapping', version: 1, columns: [] });
export function validateMapping(mapping) {
  // Do not reuse recipe errors: callers need a stable mapping-specific failure code.
  const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
  if (!exact(mapping, ['format', 'version', 'columns']) || mapping.format !== 'mytools.trueflow.mapping' || mapping.version !== 1 || !Array.isArray(mapping.columns) || mapping.columns.length > LIMITS.columns) fail('INVALID_SCHEMA_MAPPING');
  const left = new Set(), right = new Set();
  for (const pair of mapping.columns) {
    if (!exact(pair, ['before', 'after']) || [pair.before, pair.after].some(v => typeof v !== 'string' || !v.trim() || v.length > 200)) fail('INVALID_SCHEMA_MAPPING');
    if (left.has(pair.before) || right.has(pair.after)) fail('AMBIGUOUS_SCHEMA_MAPPING');
    left.add(pair.before); right.add(pair.after);
  }
  return { format: mapping.format, version: 1, columns: mapping.columns.map(p => ({ ...p })) };
}
export function readMapping(text) {
  let mapping;
  try { mapping = JSON.parse(boundedText(text, 65536)); } catch { fail('INVALID_SCHEMA_MAPPING'); }
  return validateMapping(mapping);
}
/** Explicit pairs take priority; only remaining exactly equal names match automatically. */
export function planSchemaMapping(before, after, mapping = emptyMapping()) {
  table(before.columns, before.rows, before.sourceRows); table(after.columns, after.rows, after.sourceRows);
  const validated = validateMapping(mapping), byBefore = new Map(), usedAfter = new Set();
  for (const pair of validated.columns) {
    if (!before.columns.includes(pair.before) || !after.columns.includes(pair.after)) fail('UNKNOWN_MAPPING_COLUMN');
    byBefore.set(pair.before, pair.after); usedAfter.add(pair.after);
  }
  for (const name of before.columns) if (!byBefore.has(name) && after.columns.includes(name) && !usedAfter.has(name)) {
    byBefore.set(name, name); usedAfter.add(name);
  }
  return {
    pairs: before.columns.filter(name => byBefore.has(name)).map(name => ({ before: name, after: byBefore.get(name) })),
    unmatchedBefore: before.columns.filter(name => !byBefore.has(name)),
    unmatchedAfter: after.columns.filter(name => !usedAfter.has(name)),
  };
}
/** Align B without mutating either source. No dropping unmatched columns or type conversion. */
export function applySchemaMapping(before, after, mapping) {
  const plan = planSchemaMapping(before, after, mapping);
  if (plan.unmatchedBefore.length || plan.unmatchedAfter.length) fail('SCHEMA_UNMAPPED');
  const positions = plan.pairs.map(pair => after.columns.indexOf(pair.after));
  return table([...before.columns], after.rows.map(row => positions.map(i => row[i])), [...after.sourceRows]);
}
/** Compare by explicit unique keys, not row order. Refuse ambiguous/missing keys. */
export function reconcile(before, after, keys) {
  table(before.columns, before.rows, before.sourceRows); table(after.columns, after.rows, after.sourceRows);
  if (before.columns.length !== after.columns.length || before.columns.some(c => !after.columns.includes(c))) fail('SCHEMA_MISMATCH');
  const leftIds = indices(before, keys), rightIds = indices(after, keys);
  assertValidRows(before, leftIds, 'unique', 'a'); assertValidRows(after, rightIds, 'unique', 'b');
  const positions = before.columns.map(c => after.columns.indexOf(c));
  const right = new Map(after.rows.map((row, i) => [keyFor(row, rightIds), i]));
  const summary = { added: 0, removed: 0, changed: 0, unchanged: 0 }, changes = [];
  for (let i = 0; i < before.rows.length; i++) {
    const j = right.get(keyFor(before.rows[i], leftIds));
    if (j === undefined) { summary.removed++; changes.push({ status: 'removed', beforeRecord: before.sourceRows[i], afterRecord: null, columns: [] }); continue; }
    right.delete(keyFor(before.rows[i], leftIds));
    const columns = before.columns.filter((_, c) => before.rows[i][c] !== after.rows[j][positions[c]]);
    if (!columns.length) summary.unchanged++;
    else { summary.changed++; changes.push({ status: 'changed', beforeRecord: before.sourceRows[i], afterRecord: after.sourceRows[j], columns }); }
  }
  for (const j of right.values()) { summary.added++; changes.push({ status: 'added', beforeRecord: null, afterRecord: after.sourceRows[j], columns: [] }); }
  return { summary, changes };
}
export function formulaLike(value) { return /^[\s\u0000-\u0020\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]*[=+\-@＝＋－＠]/u.test(value) || /^[\u0000-\u0020]*[\t\r\n]/.test(value); }
/** Spreadsheet guard modifies risky values. JSON export is preferable for exact text. */
export function exportCSV(data) {
  table(data.columns, data.rows, data.sourceRows);
  let protectedCells = 0;
  const quote = value => {
    if (formulaLike(value)) { value = "'" + value; protectedCells++; }
    return '"' + value.replace(/"/g, '""') + '"';
  };
  const headers = data.columns.map(quote);
  if (new Set(headers).size !== headers.length) fail('CSV_HEADER_COLLISION');
  const text = [headers.join(','), ...data.rows.map(row => row.map(quote).join(','))].join('\r\n') + '\r\n';
  return { text, protectedCells };
}
export function exportJSON(data) {
  table(data.columns, data.rows, data.sourceRows);
  return JSON.stringify(data.rows.map(row => Object.fromEntries(data.columns.map((c, i) => [c, row[i]]))), null, 2);
}
