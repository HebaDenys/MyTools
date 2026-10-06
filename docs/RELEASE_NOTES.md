# MyTools v0.3.0 — MCP and authenticated local API

Ten callable operations reuse the existing engines: TrueScrub, JSON, Base64,
link cleanup, text, passwords, SHA-256 text/bytes, TrueFlow profiling, recipe
execution and keyed reconciliation. One registry supplies both transports and
the OpenAPI 3.1 contract. No third-party runtime dependencies were added.

MCP uses bounded stdio with explicit 2025-11-25 version negotiation and tools-only
capabilities. The HTTP API binds only 127.0.0.1 and requires a runtime bearer token;
Origin/Host checks, request limits, safe errors and no payload logging are tested.
It is not a public API service or MCP Streamable HTTP. AI clients may still send
inputs/results to their providers; use the offline UI for data they must not see.

The separate server ZIP includes actual Node entrypoints, engine modules and
setup instructions. The existing browser ZIP remains self-contained and offline.
New API requests do not read arbitrary paths, fetch URLs or save output files.

Merged PR branch cleanup now runs after main updates and can sweep historical
merged branches. It retains unmerged/advanced/protected/open-PR branches and uses
a guarded ordinary Git deletion, not force-pushing or rewriting history.

Verification must be read from the actual current CI run, not inferred from this
file. See docs/ADAPTERS.md and docs/BRANCH_MAINTENANCE.md for exact scope and limits.
Private personal use stays free; business/professional use requires paid licensing.
LICENSE and COMMERCIAL.md are unchanged. No checkout or commercial price added.
