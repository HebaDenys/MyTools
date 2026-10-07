# TrueFlow — local data workbench

An independent MyTools application, not another format-conversion page. Complete
workflow: **import → diagnose → transform → compare → review → export**.

Useful for comparing successive exports, cleaning personal archives, checking a
migration or finding changed records without sending data to a web service.
Private personal use is free. Business/professional use, including internal use,
requires a paid license under the root [LICENSE](../../LICENSE).

## Try it

Open `TrueFlow.html` from the complete MyTools release ZIP. No installation or
runtime dependencies are required. Click **Load a synthetic example**: the demo
trims names, removes a repeated ID and compares two archives. Expected result:
**1 added, 1 removed, 1 changed, 2 unchanged**. All example identities are fictional.

For development run `npm start` from the repository root, then open
`http://127.0.0.1:4173/TrueFlow.html`. Run `npm run validate` for tests.

## What works

- CSV with comma/semicolon separators, TSV, and flat JSON record arrays. Quoted
  multiline cells and escaped quotes are supported. Delimiters are explicit.
- Counts of empty cells, distinct values, surrounding whitespace, identical rows
  and formula-like cells. No guessed type conversion and no silent repair.
- Twelve recipe operations: trim, Unicode NFC, lowercase, uppercase, whole-cell
  redaction, drop empty rows, keep-first deduplication, select/reorder columns,
  rename, literal filtering, require values, require unique nonempty keys.
- Recipes can be edited, reordered, removed, downloaded and imported. Both inputs
  are processed with the same recipe, always starting from unchanged originals.
- Key-based comparison: added, removed, changed and unchanged records, with
  original record positions and changed column names. Duplicate or empty keys
  and incompatible schemas are errors, not an excuse to guess a match.
- Review-gated CSV/JSON exports and count/location-only diagnostic reports.
- English, Italian and Spanish UI; responsive layout; offline batch CLI.

## Repeat it from the terminal

```sh
node projects/trueflow/cli.mjs projects/trueflow/examples/before.csv \
  --recipe projects/trueflow/examples/recipe.json \
  --compare projects/trueflow/examples/after.csv --key id \
  --output cleaned.json --report diagnostic.json
```

Repeat `--key` for composite keys. Add `--delimiter semicolon` for semicolon CSV;
TSV and JSON are selected by their filename extension. `--help` lists options.
Without `--report`, stdout contains the diagnostic report, not input records.
Output is dataset A after the recipe. Input files and existing output files are
never overwritten. Multiple output writes are not an atomic transaction; an I/O
failure can leave the first completed output, but cannot overwrite an existing file.
Recipes contain no filesystem paths or executable expressions.

## Exact semantics and limits

UTF-8 only, at most **5 MiB per input, 50,000 records, 100 columns, 500,000 cells,
30 steps**. Recipe files are limited to 64 KiB. Processing is in-memory; this is
not a streaming engine for gigabyte datasets. The UI preview shows at most 30
records and 100 change locations; exports contain all processed records/changes.

CSV headers must be nonempty and unique. Blank records are not silently skipped;
rows with the wrong width are rejected. Record numbers identify logical records,
not physical lines inside quoted cells. CSV header = record 1; JSON starts at 1.

Every cell is text. Leading zeroes and exact JSON number tokens, including long
integers and decimals, are preserved as strings. JSON `null` and absent fields
become empty strings; booleans become `true`/`false` strings. Nested records and
duplicate JSON keys are rejected. JSON export does not reconstruct original types.
Case conversion uses JavaScript Unicode rules, not a country-specific locale.
Deduplication is explicit and keeps the first record. No fuzzy matching.

CSV export quotes cells and prefixes formula-like cells/headers with an apostrophe.
This changes values, including negative numbers, and is not a universal guarantee:
spreadsheet software may reinterpret data or reactivate formulas after reopening.
Header collisions introduced by protection are refused. Prefer text-valued JSON
when exact text matters. Do not use CSV reimport as a security boundary.

Redaction replaces entire selected nonempty cells with `[REDACTED]`; unselected
columns and header names remain visible. It is not automatic anonymization.
Reports omit cell values but contain column names and original record positions.
Recipes contain column names and filter literals: review before sharing them.

No network calls, analytics, browser storage, remote scripts, accounts or license
server. Explicit exports are the only persistence. Browser extensions and the OS
remain outside the threat model. Clearing is not certified memory erasure.

## Verification

`npm run validate` runs core, CLI, serialization, security and distribution tests.
`python test/browser_trueflow.py` exercises the built HTML in Chromium, including
real downloads, local uploads, stale-result protection, language switching and a
390px viewport. Install the optional test dependency with
`pip install playwright==1.57.0` and `playwright install chromium`.

The development container blocks `file:` navigation by administrator policy.
Use `--in-memory --chromium /usr/bin/chromium` only as an explicit fallback:
that mode does not verify file navigation or relative app links. Check current
CI and PR results for the actual mode and number of executed assertions. CI is configured to run the direct-file variant; inspect its
actual result before claiming that variant passed.

## Format and security references

- [RFC 4180](https://www.rfc-editor.org/rfc/rfc4180.html): quoted CSV fields.
  TrueFlow also accepts LF/CR line endings and explicit semicolon/tab variants.
- [OWASP CSV Injection](https://owasp.org/www-community/attacks/CSV_Injection):
  spreadsheet-formula risks, mitigations and their limitations.

The implementation is original MyTools code; these references are not copied code.

## Different column names

Enable **Compare different column names** in the browser, run once to inspect
headers, then choose B counterparts for the original A columns. A remains the
canonical schema. Unassigned, exactly identical names match automatically;
there is no case-insensitive, fuzzy or value-based matching. Explicit pairs take
precedence. Unmatched A/B columns are displayed and block mapped output. No input
column is silently dropped. Disable mapping for independent original A/B previews.

Save/import the mapping as a separate versioned JSON file (64 KiB maximum,
100 pairs). The same file is accepted by the CLI and its object by MCP/API:

```json
{"format":"mytools.trueflow.mapping","version":1,"columns":[
  {"before":"id","after":"customer_id"},
  {"before":"name","after":"label"}
]}
```

Only original header names appear in this file, not record values. Browser Save
includes all resolved pairs, including identical names. Renames are applied
simultaneously, so swapping two columns cannot overwrite an intermediate name.
B is aligned **before** the common recipe; recipe steps and comparison keys use
A names (or the names produced by subsequent recipe renames). Comparison/report
locations still refer to the original source record numbers. B exports use the
canonical A headers; original B bytes are never rewritten.

Runnable synthetic example, from the repository root:

```sh
node projects/trueflow/cli.mjs projects/trueflow/examples/before.csv \
  --compare projects/trueflow/examples/after-renamed.csv --key id \
  --mapping projects/trueflow/examples/mapping.json \
  --recipe projects/trueflow/examples/recipe.json --report mapped-report.json
```

Expected: **1 added, 1 removed, 1 changed, 2 unchanged**. The report includes
resolved mapping pairs and counts/locations, not record values. Existing output
files are not overwritten. `--mapping` without `--compare` is rejected.
Mapping is opt-in; existing calls without it retain their prior behavior.
Unknown names, duplicate targets/sources, unsupported versions or unrecognized
fields are rejected. Mapping files contain data, never executable expressions.
Headers may themselves be sensitive: review mapping/report files before sharing.

## Inspecting validation failures (v0.5.0)

An empty/repeated comparison key or failing `require`/`unique` recipe step now
opens a **Records blocking this workflow** panel. It lists logical source record
numbers, the first occurrence of each repeated nonempty key, and 1-based column
positions. You can export those locations as JSON even though data exports remain
blocked. Correct the original input or deliberately change the recipe, then rerun
and review the actual output. This never automatically removes duplicate rows.

The diagnostic describes only the **first failing gate and dataset**. Later steps
and datasets have not been validated yet. Each invalid row counts once; the first
occurrence of a duplicate nonempty key does not count as a failure. An empty key
is listed as missing, not grouped with other empty keys. At most 100 locations are
returned, with a complete total and explicit `truncated` flag. Run again after
fixes to inspect remaining failures. No list is presented as exhaustive when capped.

`record`/`firstRecord` refer to original logical records (CSV header is 1, JSON
starts at 1), even after filtering. `columns` refer to the schema **at the failing
gate**, after mapping, reordering or preceding recipe steps, not necessarily the
original column positions. `source` is `a`, `b` or `input` for a standalone engine/
API recipe. `step` is 1-based in the recipe, or null for comparison-key checks.
The diagnostic contains no cell values, key values, header names, file names or
paths. Counts and positions are still metadata; review before sharing them.

Synthetic example: save the input/recipe below locally, or paste the CSV into
TrueFlow and add a Unique step for `id`:

```csv
id,name
001,Sample A
001,Sample B
,Sample C
```

```json
{"format":"mytools.trueflow.recipe","version":1,"steps":[{"type":"unique","columns":["id"]}]}
```

The diagnostic identifies record 3 as repeating record 2, and record 4 as missing
the key. Repair to distinct nonempty IDs, rerun, review and export normally.

For command-line handling:

```sh
node projects/trueflow/cli.mjs input.csv --recipe recipe.json --diagnostics-json
```

On validation failure the process exits 1, preserves the existing stable stderr
error code, and writes `{ "error": "...", "diagnostic": { ... } }` to stdout.
No requested output/report file is created on validation failure. Other failures
may have only `error`, without `diagnostic`; a later I/O error can still leave an
already completed first output as documented above. Without the flag, error
stdout stays empty. Successful output behavior is unchanged. No extra file read
capability or automatic persistence was added to MCP/API.


## Locating malformed CSV/TSV

The browser reports `CSV_UNCLOSED_QUOTE`, `CSV_UNEXPECTED_QUOTE`,
`CSV_AFTER_QUOTE` and `CSV_WIDTH` with the source (A/B), logical record and
physical line/column. Use **Export diagnostic locations** to save
`trueflow-parse-diagnostic.json`, correct the source and rerun. Data exports stay
blocked until the workflow succeeds; editing or clearing removes stale diagnostics.

Locations are 1-based. CRLF is one line break; standalone CR and LF each count as
one too, even inside quoted fields. Columns count Unicode code points, not UTF-16
units, bytes, grapheme clusters or visual editor columns. A tab counts as one
column. A leading UTF-8 BOM is ignored. CSV headers are logical record 1.

An unclosed field points to its opening quote, an unexpected quote to that quote,
text after a closing quote to the first invalid character, and width errors to
the start of the offending logical record. Width diagnostics also contain expected
and actual column counts. No automatic repair or silent row removal occurs.

This versioned `mytools.trueflow.parse` diagnostic contains only fixed enum labels,
numbers and nulls, not cell values, header names, file names or paths. Only the
browser opts into parser metadata through `validationDiagnostic(error, true)`;
CLI (including `--diagnostics-json`), MCP and HTTP keep their existing error-code
responses. Their structured key/required-value diagnostics are unchanged. This
addition does not locate JSON syntax, invalid headers, schema errors or size limits.
