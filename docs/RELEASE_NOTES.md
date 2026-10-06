# MyTools v0.4.1 — actionable duplicate-key conflicts

TrueFlow duplicate-key failures now identify the dataset side during comparison
(A or B) and both source-record positions in the first conflicting pair. The
browser explains the correction in English, Italian and Spanish. CLI, MCP stdio
and authenticated loopback HTTP return the same bounded location detail.

Key values and cell values are never copied into these errors. Existing source
record semantics remain unchanged: CSV record numbers include the header as
record 1; JSON records start at 1. Recipe `unique` failures report the pair
without an A/B label because that operation validates the current dataset itself.

Regression coverage exercises core comparison, recipe uniqueness, CLI, browser,
MCP and HTTP error paths using synthetic private-looking values and verifies those
values do not appear in returned diagnostics. No new tools, protocol surfaces,
runtime dependencies, remote requests, persistence or file-read API were added.

Private personal use remains free; business/professional use requires paid
licensing from Denys Heba. LICENSE and COMMERCIAL.md are unchanged. AI clients
can still transmit or retain successful tool inputs/results; local execution
does not make the client private. TrueCase and Privacy Studio remain planned.
