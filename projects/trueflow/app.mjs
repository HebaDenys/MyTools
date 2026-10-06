// SPDX-License-Identifier: LicenseRef-MyTools-Personal-1.0
import { LIMITS, parseData, profile, emptyRecipe, readRecipe, validateRecipe, runRecipe, reconcile, exportCSV, exportJSON, emptyMapping, readMapping, planSchemaMapping, applySchemaMapping } from './core.mjs';
import { COPY } from './i18n.mjs';
const $ = id => document.getElementById(id);
let lang = Object.hasOwn(COPY, navigator.language?.slice(0, 2)) ? navigator.language.slice(0, 2) : 'en';
let recipe = emptyRecipe(), result = null, mapping = emptyMapping(), mappingHeaders = null;
const revision = { a: 0, b: 0, recipe: 0, mapping: 0 };
const operations = ['trim', 'normalize', 'lower', 'upper', 'redact', 'dropEmpty', 'dedupe', 'select', 'rename', 'filter', 'require', 'unique'];
const t = key => COPY[lang][key] ?? key;
const el = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
function message(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function fill(template, values) { return template.replace(/\{([a-z]+)\}/g, (_, key) => values[key] ?? ''); }
function describeError(error) {
  const raw = error instanceof Error ? error.message : String(error);
  let match = /^DUPLICATE_KEY: (?:(A|B) )?records (\d+),(\d+)$/.exec(raw);
  if (match) return `${t('error')}: ${fill(t('duplicateKeyError'), { source: match[1] ? `${t('dataset')} ${match[1]}` : t('currentDataset'), first: match[2], second: match[3] })}`;
  match = /^EMPTY_KEY: (?:(A|B) )?record (\d+)$/.exec(raw);
  if (match) return `${t('error')}: ${fill(t('emptyKeyError'), { source: match[1] ? `${t('dataset')} ${match[1]}` : t('currentDataset'), record: match[2] })}`;
  return `${t('error')}: ${raw}`;
}
function showError(error) { message(describeError(error), true); }
function exportState() { for (const id of ['export-csv', 'export-json', 'export-report']) $(id).disabled = !result || !$('review').checked; }
function invalidate() {
  result = null; $('results').hidden = true; $('review').checked = false; exportState();
  for (const id of ['preview', 'diagnostics', 'journal', 'diff', 'metrics', 'diff-metrics']) $(id).replaceChildren();
  message('');
}
function options(select, values, labels = values, first = null) {
  const selected = [...select.selectedOptions].map(o => o.value);
  select.replaceChildren();
  if (first !== null) { const option = el('option', first); option.value = ''; select.append(option); }
  values.forEach((value, i) => { const option = el('option', labels[i]); option.value = value; option.selected = selected.includes(value); select.append(option); });
  if (!select.multiple && !selected.some(v => values.includes(v)) && first !== null) select.value = '';
}
function renderSteps() {
  $('steps').replaceChildren(); $('no-steps').hidden = recipe.steps.length > 0;
  recipe.steps.forEach((step, i) => {
    const item = el('li'); item.append(el('strong', `${i + 1}. ${t(step.type)}`));
    item.append(el('div', (step.columns ?? [step.from ?? step.column]).join(', ') + (step.type === 'rename' ? ` → ${step.to}` : '')));
    const controls = el('div'); controls.className = 'step-actions';
    for (const [label, symbol, delta] of [['up', '↑', -1], ['down', '↓', 1], ['remove', '×', 0]]) {
      const button = el('button', symbol); button.type = 'button'; button.className = 'secondary'; button.setAttribute('aria-label', `${t(label)} ${i + 1}`);
      button.disabled = delta !== 0 && (i + delta < 0 || i + delta >= recipe.steps.length);
      button.addEventListener('click', () => {
        revision.recipe++;
        if (!delta) recipe.steps.splice(i, 1);
        else [recipe.steps[i], recipe.steps[i + delta]] = [recipe.steps[i + delta], recipe.steps[i]];
        invalidate(); renderSteps();
      });
      controls.append(button);
    }
    item.append(controls); $('steps').append(item);
  });
}
function translate() {
  document.documentElement.lang = lang; $('language').value = lang;
  document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
  options($('operation'), operations, operations.map(t));
  const oldKey = $('compare-key').value;
  if ($('compare-key').options[0]?.value === '') $('compare-key').options[0].textContent = t('noKey');
  $('compare-key').value = oldKey; renderSteps();
  if (mappingHeaders) renderMapping();
  if (result) renderResults();
}
function drawTable(id, headers, rows) {
  const table = el('table'), head = el('thead'), hr = el('tr'), body = el('tbody');
  for (const name of headers) { const th = el('th', name); th.scope = 'col'; hr.append(th); }
  head.append(hr);
  for (const row of rows) { const tr = el('tr'); for (const value of row) { const text = String(value ?? '—'); tr.append(el('td', text.length > 200 ? text.slice(0, 200) + '…' : text)); } body.append(tr); }
  table.append(head, body); $(id).replaceChildren(table);
}
function metrics(id, entries) {
  $(id).replaceChildren(...entries.map(([name, count]) => { const node = el('div'); node.className = 'metric'; node.append(el('strong', count.toLocaleString(lang)), el('span', t(name))); return node; }));
}
function selectedResult() { return $('preview-source').value === 'b' && result?.b ? result.b : result.a; }
function renderResults() {
  if (!result) return;
  $('results').hidden = false;
  $('preview-source').options[1].disabled = !result.b;
  if (!result.b) $('preview-source').value = 'a';
  const active = selectedResult(), data = active.data, stats = active.stats;
  metrics('metrics', [['rows', stats.rowCount], ['cols', stats.columnCount], ['duplicates', stats.duplicateRows], ['missing', stats.columns.reduce((n, c) => n + c.missing, 0)]]);
  drawTable('preview', [t('record'), ...data.columns], data.rows.slice(0, 30).map((row, i) => [data.sourceRows[i], ...row]));
  drawTable('diagnostics', [t('name'), t('missing'), t('distinct'), t('whitespace'), t('formula')], stats.columns.map(c => [c.name, c.missing, c.distinct, c.whitespace, c.formulaLike]));
  drawTable('journal', [t('step'), t('operation'), t('before'), t('after'), t('removedRows'), t('changedCells')], active.journal.map(s => [s.step, t(s.operation), s.rowsBefore, s.rowsAfter, s.removedRows, s.changedCells]));
  $('diff-section').hidden = !result.comparison;
  if (result.comparison) {
    metrics('diff-metrics', Object.entries(result.comparison.summary));
    drawTable('diff', [t('status'), t('before'), t('after'), t('changedColumns')], result.comparison.changes.slice(0, 100).map(c => [t(c.status), c.beforeRecord, c.afterRecord, c.columns.join(', ')]));
  }
  exportState();
}
function parseSource(id) {
  const format = $(`format-${id}`).value;
  return parseData($(`input-${id}`).value, format === 'semicolon' ? 'csv' : format, format === 'semicolon' ? ';' : ',');
}
function analyze() {
  invalidate();
  try {
    if (!$('input-a').value.trim()) throw new Error(t('empty'));
    const originalA = parseSource('a'), originalB = $('input-b').value.trim() ? parseSource('b') : null;
    mappingHeaders = originalB ? [originalA, originalB].map(data => ({ columns: [...data.columns], rows: [], sourceRows: [] })) : null;
    renderMapping();
    // A supplies canonical names. Mapping happens BEFORE recipes, never by sequential renames.
    const a = runRecipe(originalA, recipe);
    options($('columns'), a.data.columns);
    options($('compare-key'), a.data.columns, a.data.columns, t('noKey'));
    if ($('mapping-enabled').checked && !originalB) throw new Error('MAPPING_REQUIRES_B');
    const mappedB = originalB && $('mapping-enabled').checked ? applySchemaMapping(originalA, originalB, mapping) : originalB;
    const b = mappedB ? runRecipe(mappedB, recipe) : null;
    options($('columns'), a.data.columns);
    options($('compare-key'), a.data.columns, a.data.columns, t('noKey'));
    const key = $('compare-key').value;
    const comparison = b && key ? reconcile(a.data, b.data, [key]) : null;
    result = { schemaMapping: originalB && $('mapping-enabled').checked ? planSchemaMapping(originalA, originalB, mapping) : null, a: { ...a, stats: profile(a.data) }, b: b ? { ...b, stats: profile(b.data) } : null, comparison };
    renderResults(); message(t('ready'));
  } catch (error) { invalidate(); showError(error); }
}
function download(text, name, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type })); const link = el('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function loadFile(file, max = LIMITS.bytes) {
  if (!file || file.size > max) throw new Error('INPUT_TOO_LARGE');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
  catch { throw new Error('UTF8_REQUIRED'); }
}
for (const id of ['a', 'b']) {
  $(`input-${id}`).addEventListener('input', () => { revision[id]++; clearMappingView(); invalidate(); });
  $(`format-${id}`).addEventListener('change', () => { revision[id]++; clearMappingView(); invalidate(); });
  $(`file-${id}`).addEventListener('change', async event => {
    const token = ++revision[id], file = event.target.files[0]; clearMappingView(); invalidate();
    if (!file) return;
    try {
      const text = await loadFile(file); if (token !== revision[id]) return; clearMappingView(); invalidate();
      $(`input-${id}`).value = text;
      $(`format-${id}`).value = /\.json$/i.test(file.name) ? 'json' : /\.tsv$/i.test(file.name) ? 'tsv' : 'csv';
    } catch (error) { if (token === revision[id]) { clearMappingView(); invalidate(); $(`input-${id}`).value = ''; showError(error); } }
  });
}
function clearMappingView() {
  mappingHeaders = null; $('mapping-columns').replaceChildren(); $('mapping-summary').textContent = ''; $('save-mapping').disabled = true;
}
function renderMapping() {
  $('mapping-columns').replaceChildren(); $('mapping-summary').textContent = ''; $('save-mapping').disabled = true;
  if (!mappingHeaders || !$('mapping-enabled').checked) return;
  const [before, after] = mappingHeaders;
  let plan;
  try { plan = planSchemaMapping(before, after, mapping); }
  catch (error) { $('mapping-summary').textContent = error.message; return; }
  for (const [i, name] of before.columns.entries()) {
    const row = el('div'); row.className = 'mapping-row';
    const label = el('label', name), select = el('select'); select.id = `mapping-column-${i}`; label.htmlFor = select.id;
    // Empty value means "no explicit override", not column deletion. Exact names may still match.
    const automatic = el('option', t('mappingAutomatic')); automatic.value = ''; select.append(automatic);
    for (const column of after.columns) { const option = el('option', column); option.value = column; option.disabled = mapping.columns.some(pair => pair.before !== name && pair.after === column); select.append(option); }
    select.value = mapping.columns.find(pair => pair.before === name)?.after ?? '';
    const match = plan.pairs.find(pair => pair.before === name);
    row.append(label, select, el('small', match ? `B: ${match.after}` : t('mappingMissing')));
    select.addEventListener('change', () => {
      revision.mapping++;
      mapping.columns = mapping.columns.filter(pair => pair.before !== name);
      if (select.value) mapping.columns.push({ before: name, after: select.value });
      invalidate(); analyze();
    });
    $('mapping-columns').append(row);
  }
  const missing = plan.unmatchedBefore.length || plan.unmatchedAfter.length;
  $('mapping-summary').textContent = missing ? `${t('mappingUnmatched')} A: ${plan.unmatchedBefore.join(', ') || '—'}; B: ${plan.unmatchedAfter.join(', ') || '—'}` : t('mappingComplete');
  $('save-mapping').disabled = Boolean(missing);
}
$('mapping-enabled').addEventListener('change', () => { revision.mapping++; invalidate(); analyze(); });
$('reset-mapping').addEventListener('click', () => { revision.mapping++; mapping = emptyMapping(); $('mapping-file').value = ''; invalidate(); analyze(); });
$('save-mapping').addEventListener('click', () => {
  if (!mappingHeaders || !$('mapping-enabled').checked) return;
  try {
    const plan = planSchemaMapping(...mappingHeaders, mapping);
    if (plan.unmatchedBefore.length || plan.unmatchedAfter.length) throw new Error('SCHEMA_UNMAPPED');
    // Persist all resolved pairs, not guesses; round-trip unchanged through CLI and MCP/API.
    download(JSON.stringify({ ...emptyMapping(), columns: plan.pairs }, null, 2), 'trueflow-mapping.json');
    message(t('mappingWarning'));
  } catch (error) { showError(error); }
});
$('mapping-file').addEventListener('change', async event => {
  const token = ++revision.mapping, file = event.target.files[0]; invalidate();
  if (!file) return;
  try {
    const imported = readMapping(await loadFile(file, 65536));
    if (token !== revision.mapping) return;
    mapping = imported; $('mapping-enabled').checked = true; analyze();
  } catch (error) { if (token === revision.mapping) { invalidate(); showError(error); } }
});
$('run').addEventListener('click', analyze);
$('compare-key').addEventListener('change', analyze);
$('preview-source').addEventListener('change', () => { $('review').checked = false; renderResults(); });
$('language').addEventListener('change', () => { lang = $('language').value; translate(); });
$('review').addEventListener('change', exportState);
$('operation').addEventListener('change', () => { const op = $('operation').value; $('filter-options').hidden = op !== 'filter'; $('value-options').hidden = !['filter', 'rename'].includes(op); });
$('add').addEventListener('click', () => {
  try {
    const columns = [...$('columns').selectedOptions].map(o => o.value), type = $('operation').value;
    if (!columns.length) throw new Error(t('selectColumns'));
    let step = { type, columns };
    if (['rename', 'filter'].includes(type)) {
      if (columns.length !== 1) throw new Error(t('oneColumn'));
      step = type === 'rename' ? { type, from: columns[0], to: $('value').value } : { type, column: columns[0], operator: $('operator').value, value: $('value').value };
    }
    recipe = validateRecipe({ ...recipe, steps: [...recipe.steps, step] }); revision.recipe++;
    renderSteps(); analyze();
  } catch (error) { invalidate(); showError(error); }
});
$('reset-recipe').addEventListener('click', () => { recipe = emptyRecipe(); revision.recipe++; invalidate(); renderSteps(); });
$('save-recipe').addEventListener('click', () => { download(JSON.stringify(recipe, null, 2), 'trueflow-recipe.json'); message(t('recipeWarning')); });
$('recipe-file').addEventListener('change', async event => {
  const token = ++revision.recipe, file = event.target.files[0]; invalidate();
  if (!file) return;
  try { const imported = readRecipe(await loadFile(file, 65536)); if (token !== revision.recipe) return; invalidate(); recipe = imported; renderSteps(); message(t('imported')); }
  catch (error) { if (token === revision.recipe) showError(error); }
});
$('clear').addEventListener('click', () => {
  for (const id of ['a', 'b']) { revision[id]++; $(`input-${id}`).value = ''; $(`file-${id}`).value = ''; }
  revision.recipe++; recipe = emptyRecipe(); revision.mapping++; mapping = emptyMapping(); $('mapping-file').value = ''; $('mapping-enabled').checked = false; clearMappingView(); $('recipe-file').value = ''; $('value').value = '';
  options($('columns'), []); options($('compare-key'), [], [], t('noKey')); invalidate(); renderSteps();
});
$('demo').addEventListener('click', () => {
  $('clear').click(); $('format-a').value = 'csv'; $('format-b').value = 'csv';
  $('input-a').value = 'id,name,email,status\n001, Sample A ,sample-a@example.invalid,active\n002,Sample B,sample-b@example.invalid,pending\n003,Sample C,,active\n003,Sample C,,active\n004,Sample D,sample-d@example.invalid,inactive\n';
  $('input-b').value = 'id,name,email,status\n001,Sample A,sample-a@example.invalid,active\n002,Sample B,sample-b@example.invalid,active\n003,Sample C,,active\n005,Sample E,sample-e@example.invalid,active\n';
  recipe.steps = [{ type: 'trim', columns: ['name'] }, { type: 'dedupe', columns: ['id'] }];
  renderSteps(); analyze(); $('compare-key').value = 'id'; analyze();
});
$('export-csv').addEventListener('click', () => {
  if (!result || !$('review').checked) return;
  try { const output = exportCSV(selectedResult().data); download(output.text, `trueflow-${$('preview-source').value}.csv`, 'text/csv;charset=utf-8'); message(`${t('downloaded')} ${t('protected')}: ${output.protectedCells}`); }
  catch (error) { invalidate(); showError(error); }
});
$('export-json').addEventListener('click', () => { if (result && $('review').checked) { download(exportJSON(selectedResult().data), `trueflow-${$('preview-source').value}.json`); message(t('downloaded')); } });
$('export-report').addEventListener('click', () => {
  if (!result || !$('review').checked) return;
  const report = { format: 'mytools.trueflow.report', version: 1, a: { profile: result.a.stats, journal: result.a.journal }, b: result.b ? { profile: result.b.stats, journal: result.b.journal } : null, comparison: result.comparison };
  if (result.schemaMapping) report.schemaMapping = result.schemaMapping;
  download(JSON.stringify(report, null, 2), 'trueflow-report.json'); message(t('downloaded'));
});
options($('compare-key'), [], [], t('noKey')); translate();
