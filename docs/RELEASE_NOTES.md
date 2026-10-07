# MyTools v0.5.2 — identify JSON failures without exposing source data

TrueFlow now gives browser users structured guidance when JSON blocks a workflow.
Malformed JSON identifies whether dataset A or B failed. Invalid root/record shape,
nested objects/arrays and duplicate keys use the same value-free diagnostic surface.
When TrueFlow can derive a position from its own tokenizer, nested structures and
duplicate keys include the logical record plus Unicode code-point line/column.

Malformed JSON syntax deliberately has no guessed position: the JavaScript engine's
parser message is never copied into the UI or diagnostic. Root/primitive shape
failures may have only dataset and record metadata. JSON diagnostics contain fixed
error codes, source labels and safe numeric positions only — no cell values, JSON
keys, file names, paths or parser text. Editing the source clears stale diagnostics
and all data exports remain blocked until a workflow succeeds and is reviewed.

The existing CSV/TSV location diagnostics are unchanged. CLI, MCP stdio and the
authenticated loopback HTTP API retain their existing JSON error-code contracts;
parser metadata remains a browser opt-in through the core diagnostic accessor.
Regression tests cover malformed syntax, root/record shape, nested Unicode input,
duplicate keys, closed source labels, localization, diagnostic downloads and a
repair-to-reviewed-export browser flow.

No dependency, network surface, telemetry, persistence or automatic repair was
added. LICENSE and COMMERCIAL.md remain unchanged: private personal use is free;
every business/professional use requires a paid license. AI clients can still send
or retain inputs/results. TrueCase and Privacy Studio remain planned.
