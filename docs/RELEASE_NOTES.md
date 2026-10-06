# MyTools v0.5.0 — find the records blocking a workflow

TrueFlow now reports original record locations when a comparison key is empty or
repeated, or a recipe's require/unique validation fails. The browser displays the
failing dataset/gate, missing column positions and the first occurrence of repeated
keys. Export safe diagnostic JSON, fix the input/recipe, rerun and review actual
output. Data exports remain blocked until the workflow succeeds; no automatic
record deletion or ambiguous matching is introduced.

The same bounded diagnostics appear in CLI --diagnostics-json failures, HTTP 422
responses and MCP isError structuredContent. Old error codes and successful result
shapes remain unchanged. Only the first failed gate/dataset is inspected, with up
to 100 listed rows, complete total and an explicit truncation flag. Diagnostic
locations contain no cell/key values, header names or file paths. Column positions
refer to the failing schema; record numbers refer to original logical records.

Also fixes null/falsy recipe columns silently bypassing some operations, and a
late failed recipe-file import leaving an intervening result exportable.

Tests cover core validation, immutable inputs, filtering/mapping, first-occurrence
locations, caps, real stdio/HTTP, CLI failure-to-recovery, extracted packages and
browser uploads/downloads. Read actual CI and PR results, not this file, for the
verification status. No new runtime dependency, public endpoint, outbound request,
telemetry, hidden persistence or protocol revision. TrueCase and Privacy Studio
remain planned. Local client/model handling can still disclose inputs/results.

LICENSE and COMMERCIAL.md remain unchanged: private personal use free; every
business/professional use requires a paid license. No price or checkout introduced.
