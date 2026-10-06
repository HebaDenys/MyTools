# MyTools v0.2.0 — first independent application

The toolbox is now the foundation of a suite, not the entire product. TrueFlow
is a working local data workbench with a separate UI, reusable core and CLI.

- Import CSV, semicolon CSV, TSV and flat JSON without losing numeric tokens.
- Diagnose missing/duplicate/whitespace/formula-like values.
- Compose, reorder, save and import twelve kinds of transformation steps.
- Compare two archives by unique keys; reject duplicate/empty keys.
- Review and export real CSV/JSON results and value-free diagnostic reports.
- Preserve originals; rerun recipes from source on every execution.
- English/Italian/Spanish UI and responsive layout.
- Suite vision and acceptance criteria for future TrueCase and Privacy Studio.
  These future applications are NOT included in this release.

Use the complete ZIP to keep MyTools.html and TrueFlow.html together. Each
application works independently; navigation between them needs both files.

Local verification: 255 Node tests passed on Node 22.16.0; 31 Chromium UI checks
passed against the built HTML loaded in memory. Administrator policy blocked
file navigation in the development container. CI also runs a direct-file browser
suite; its result must be checked independently. No claim of a CI pass is made
by these notes alone.

Limits: UTF-8, 5 MiB/input, 50,000 records, 100 columns, 500,000 cells, 30 steps.
No XLSX, PDF/OCR, databases, remote connectors, fuzzy matching or guaranteed
anonymization. CSV guarding changes formula-like cell values and is not a universal
spreadsheet-safety guarantee. Use JSON to preserve cell text. See project README.

Private personal use remains free. Business and professional use remains paid.
No checkout, price list or new commercial agreement was activated.
