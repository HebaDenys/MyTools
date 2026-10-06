# MyTools v0.4.0 — compare exports with different column names

TrueFlow now supports explicit, reusable schema mappings from original B column
names to A, before running the shared recipe. The browser offers column selectors,
unmatched-column diagnostics, mapping import/download, reviewed canonical B
exports and a value-free mapping record in the diagnostic report. CLI `--mapping`
and MCP/API `trueflow_compare.mapping` consume the same versioned JSON format.

No silent column removal or fuzzy matching. Duplicate sources/targets, unknown
names, incomplete mappings, unsupported versions and extra fields are rejected.
Renames happen simultaneously and preserve source positions and exact cell text.
Existing unmapped calls retain their prior behavior. A failed late source-file
import now also clears results and mapping metadata from a subsequent analysis.

Synthetic core, CLI, browser, real stdio and authenticated HTTP regressions cover
the full workflow. The extracted server ZIP is tested with mapped comparisons.
Read the actual CI run/PR for verification results; this file does not assert a
successful release before the publishing workflow completes.

No new runtime dependencies, remote requests, file-read API capabilities, logging,
telemetry, persistence, public hosting or protocol revision. Existing size and
privacy limitations still apply; clients may send inputs/results to their models.
Private personal use is free; business/professional use requires paid licensing.
LICENSE and COMMERCIAL.md are unchanged. TrueCase and Privacy Studio remain planned.
