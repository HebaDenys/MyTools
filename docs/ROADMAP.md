# Roadmap

See [product vision](PRODUCT_VISION.md). Prefer complete local workflows to a
larger count of utility pages. Fix regressions and unsafe exports first.

## Implemented

- v0.1.0: seven browser utilities, reusable modules, licensing and release pipeline.
- v0.2.0: TrueFlow independent data workbench: import, diagnose, recipes, keyed
  comparison, review, real exports and CLI. See its README for exact boundaries.

- v0.3.0: shared MCP stdio/local HTTP contracts, ten callable operations, bounded
  authenticated loopback API, and guarded merged-branch maintenance.

- v0.4.0: explicit reusable schema mapping before TrueFlow recipes, in browser,
  CLI and the shared MCP/API comparison contract. Original columns are preserved;
  unmatched/ambiguous mappings fail closed. Late failed imports clear stale output.

- v0.5.0: inspect/export bounded validation locations for missing/duplicate keys
  and required values across browser, CLI and MCP/API; preserve fail-closed data
  exports. Null/falsy recipe columns are rejected and late failed recipe imports
  invalidate any intervening results.

- v0.5.1: browser CSV/TSV syntax and row-width locations with exact Unicode
  columns, safe diagnostic export and repair-to-export regression coverage.
  CLI/MCP/HTTP parser-error contracts stay unchanged.

- v0.5.2: browser JSON source guidance for malformed syntax and invalid flat-record
  structure, with safe record/token coordinates for nested values and duplicate
  keys. Diagnostics omit values, keys and engine parser messages; CLI/MCP/HTTP
  error contracts stay unchanged.

## Next milestone: make TrueFlow easier to trust on real archives

1. Key/required-value, CSV/TSV location and JSON source/structure diagnostics are
   implemented. Next: source guidance for invalid headers/schema errors without
   echoing values or guessing repairs.
2. Schema mapping is implemented. Next: improve guidance for complex mapping
   conflicts without guessing correspondences or silently dropping columns.
3. Evaluate cancellable worker-based processing and bounded larger-file support.
   Measure memory/time before increasing limits; do not merely change constants.
4. Expand browser tests to async import races, keyboard accessibility, both app
   links and guarded CSV downloads, alongside actual GitHub CI results.
5. Add privacy-preserving regression fixtures from reported bugs only after they
   have been replaced with synthetic values.

## Next independent application

TrueCase portable document/evidence bundles, then TrueScrub Privacy Studio batch
workflows. Both are **planned**, not existing features. Each must meet the
acceptance criteria in PRODUCT_VISION before being advertised or released.
No placeholder applications, paid APIs, telemetry or silent background storage.

## Licensing provenance

Preserve the root personal-free/business-paid license on original modules.
Earlier separately distributed TrueScrub versions retain their valid grants.
The initial license-only Git commit used PolyForm; application code introduced
in MyTools uses the custom root license. Do not rewrite history or revoke old grants.
