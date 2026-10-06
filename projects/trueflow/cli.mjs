// SPDX-License-Identifier: LicenseRef-MyTools-Personal-1.0
// Offline batch runner. Never overwrites input or existing output files.
import { readFile, stat, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { extname } from 'node:path';
import { LIMITS, parseData, emptyRecipe, readRecipe, runRecipe, profile, reconcile, exportCSV, exportJSON, readMapping, applySchemaMapping, planSchemaMapping } from './core.mjs';
async function readBounded(path, limit = LIMITS.bytes) {
  const info = await stat(path);
  if (!info.isFile() || info.size > limit) throw new Error('INPUT_TOO_LARGE_OR_NOT_A_FILE');
  const bytes = await readFile(path);
  if (bytes.length > limit) throw new Error('INPUT_TOO_LARGE');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new Error('UTF8_REQUIRED'); }
}
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    recipe: { type: 'string' }, mapping: { type: 'string' }, compare: { type: 'string' }, key: { type: 'string', multiple: true },
    output: { type: 'string' }, report: { type: 'string' }, delimiter: { type: 'string' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('TrueFlow: node projects/trueflow/cli.mjs input.csv [--recipe recipe.json] [--compare after.csv --key id --mapping mapping.json] [--output cleaned.csv|cleaned.json] [--report report.json] [--delimiter comma|semicolon|tab]\nRepeat --key for composite keys. Mapping aligns original B headers to A before the same recipe applies to both inputs; no columns are silently discarded. UTF-8 only. Existing files are never overwritten. Default stdout is a diagnostic report without cell values. CSV guards alter formula-like cells; JSON preserves cell text. Private personal use is free; business/professional use requires a paid license.');
  } else {
    if (positionals.length !== 1) throw new Error('ONE_INPUT_REQUIRED');
    if (values.compare && !values.key?.length) throw new Error('COMPARISON_KEY_REQUIRED');
    if ((values.key?.length || values.mapping) && !values.compare) throw new Error('COMPARE_INPUT_REQUIRED');
    const delimiters = { comma: ',', semicolon: ';', tab: '\t' };
    if (values.delimiter && !Object.hasOwn(delimiters, values.delimiter)) throw new Error('INVALID_DELIMITER');
    const load = async path => {
      const extension = extname(path).toLowerCase();
      if (!['.csv', '.tsv', '.json'].includes(extension)) throw new Error('UNSUPPORTED_INPUT_EXTENSION');
      return parseData(await readBounded(path), extension.slice(1), delimiters[values.delimiter ?? 'comma']);
    };
    const recipe = values.recipe ? readRecipe(await readBounded(values.recipe, 65536)) : emptyRecipe();
    const originalA = await load(positionals[0]), originalB = values.compare ? await load(values.compare) : null;
    const mapping = values.mapping ? readMapping(await readBounded(values.mapping, 65536)) : null;
    const a = runRecipe(originalA, recipe);
    const b = originalB ? runRecipe(mapping ? applySchemaMapping(originalA, originalB, mapping) : originalB, recipe) : null;
    const report = { format: 'mytools.trueflow.report', version: 1, a: { profile: profile(a.data), journal: a.journal }, b: b ? { profile: profile(b.data), journal: b.journal } : null, comparison: b ? reconcile(a.data, b.data, values.key) : null };
    if (mapping) report.schemaMapping = planSchemaMapping(originalA, originalB, mapping);
    let output;
    if (values.output) {
      const extension = extname(values.output).toLowerCase();
      if (extension === '.json') output = exportJSON(a.data);
      else if (extension === '.csv') { const csv = exportCSV(a.data); output = csv.text; report.csvProtectedCells = csv.protectedCells; }
      else throw new Error('OUTPUT_MUST_BE_CSV_OR_JSON');
    }
    // Preflight avoids partial writes in common conflict cases; exclusive writes also
    // prevent races from overwriting a file created after this check. Not a transaction.
    const targets = [values.output, values.report].filter(Boolean);
    if (new Set(targets).size !== targets.length) throw new Error('DISTINCT_OUTPUT_PATHS_REQUIRED');
    for (const target of targets) {
      try { await stat(target); throw new Error('OUTPUT_ALREADY_EXISTS'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const reportText = JSON.stringify(report, null, 2) + '\n';
    if (values.output) await writeFile(values.output, output, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    if (values.report) await writeFile(values.report, reportText, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    else process.stdout.write(reportText);
  }
} catch (error) {
  // Runtime filesystem messages may contain sensitive paths. Print only stable codes.
  const message = /^[A-Z][A-Z0-9_]+(?:: (?:(?:A|B) )?(?:record \d+|records \d+,\d+))?$/.test(error.message) ? error.message : error.code ?? 'OPERATION_FAILED';
  console.error(`TrueFlow: ${message}`); process.exitCode = 1;
}
