# MyTools v0.5.1 — locate and repair malformed CSV/TSV

TrueFlow's browser diagnostic panel identifies source A/B, logical record,
physical line and column for unclosed/unexpected quotes, characters after a closing
quote and incorrect row width. Download the diagnostic, correct the source, rerun
and export reviewed data. Editing input immediately removes stale diagnostics.

Locations count Unicode code points, including supplementary characters such as
emoji. CRLF is one line break, tabs are one column, and a leading BOM is ignored.
Width errors point to the record start; an unclosed field points to its opening
quote. Diagnostics contain fixed labels, positions and optional column counts,
not values, headers or paths. Unsupported format labels are rejected rather than
copied into diagnostic metadata. English, Italian and Spanish UI are included.

Core regression coverage now exercises each syntax error, quoted multiline input,
LF/CR/CRLF, Unicode, BOM, TSV, semicolon input, diagnostic isolation and exact
value exclusion. Browser tests cover localization, real downloads, keyboard/mobile
use and a malformed-TSV-to-reviewed-export recovery. CLI, real MCP stdio children
and authenticated HTTP tests verify unchanged parser-error responses.

Parser locations remain browser-only; CLI/MCP/HTTP error contracts, successful
outputs, tool count, size limits and the existing key/required-value diagnostics
are unchanged. No new dependency, network surface, storage or automatic repair.

Read the actual PR/CI results for verification; this file does not claim the
candidate is published. LICENSE and COMMERCIAL.md remain unchanged: private
personal use free, every business/professional use paid. AI clients can still
retain or forward inputs/results. TrueCase and Privacy Studio remain planned.
