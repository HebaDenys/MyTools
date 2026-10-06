// SPDX-License-Identifier: LicenseRef-MyTools-Personal-1.0
// Copyright 2026 Denys Heba. Original data is never mutated.
export const LIMITS = Object.freeze({ bytes: 5 * 1024 * 1024, rows: 50000, columns: 100, cells: 500000, steps: 30 });
const encoder = new TextEncoder();
const fail = (code, detail = '') => { throw new Error(`${code}${detail ? `: ${detail}` : ''}`); };
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
function csvRecords(text, delimiter) {
  if (![',', ';', '\t'].includes(delimiter)) fail('INVALID_DELIMITER');
  const records = []; let row = [], field = '', quoted = false, closed = false, started = false, cells = 0;
  const cell = () => {
    row.push(field); field = ''; closed = false;
    if (row.length > LIMITS.columns || ++cells > LIMITS.cells + LIMITS.columns) fail('TABLE_LIMIT');
  };
  const record = () => {
    cell(); records.push(row); row = []; started = false;
    if (records.length > LIMITS.rows + 1) fail('TABLE_LIMIT');
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else field += c;
      continue;
    }
    if (c === delimiter) { cell(); started = true; }
    else if (c === '\n' || c === '\r') { record(); if (c === '\r' && text[i + 1] === '\n') i++; }
    else if (closed) fail('CSV_AFTER_QUOTE', `record ${records.length + 1}`);
    else if (c === '"') {
      if (field.length) fail('CSV_UNEXPECTED_QUOTE', `record ${records.length + 1}`);
      quoted = true; started = true;
    } else { field += c; started = true; }
  }
  if (quoted) fail('CSV_UNCLOSED_QUOTE');
  if (started || row.length || closed) record();
  return records;
}
/** Strict quoted CSV; delimiters are explicit rather than guessed. All cells stay text. */
export function parseCSV(input, delimiter = ',') {
  const records = csvRecords(boundedText(input), delimiter);
  if (!records.length) fail('EMPTY_INPUT');
  const [columns, ...rows] = records;
  validColumns(columns);
  const bad = rows.findIndex(row => row.length !== columns.length);
  if (bad !== -1) fail('CSV_WIDTH', `record ${bad + 2}`);
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
export function parseData(text, format = 'csv', delimiter = ',') {
  if (format === 'json') return parseJSON(text);
  if (format === 'tsv') return parseCSV(text, '\t');
  if (format === 'csv') return parseCSV(text, delimiter);
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
    if (step.columns) validColumns(step.columns);
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
function ensureKeys(data, ids) {
  const seen = new Set();
  for (let i = 0; i < data.rows.length; i++) {
    if (ids.some(j => blank(data.rows[i][j]))) fail('EMPTY_KEY', `record ${data.sourceRows[i]}`);
    const key = keyFor(data.rows[i], ids);
    if (seen.has(key)) fail('DUPLICATE_KEY', `record ${data.sourceRows[i]}`);
    seen.add(key);
  }
}
/** Every run starts from a copy of the original. Recipes are data, never executable code. */
export function runRecipe(original, recipe) {
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
      const bad = data.rows.findIndex(row => ids.some(i => blank(row[i])));
      if (bad !== -1) fail('REQUIRED_VALUE', `record ${data.sourceRows[bad]}`);
    } else if (step.type === 'unique') ensureKeys(data, ids);
    journal.push({ step: index + 1, operation: step.type, rowsBefore: before, rowsAfter: data.rows.length, removedRows: before - data.rows.length, changedCells });
  }
  return { data, journal };
}
/** Compare by explicit unique keys, not row order. Refuse ambiguous/missing keys. */
export function reconcile(before, after, keys) {
  table(before.columns, before.rows, before.sourceRows); table(after.columns, after.rows, after.sourceRows);
  if (before.columns.length !== after.columns.length || before.columns.some(c => !after.columns.includes(c))) fail('SCHEMA_MISMATCH');
  const leftIds = indices(before, keys), rightIds = indices(after, keys);
  ensureKeys(before, leftIds); ensureKeys(after, rightIds);
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
