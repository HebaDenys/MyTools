# MyTools: complete local applications, not a collection of snippets

## Mission

Give individuals control of useful digital workflows without requiring them to
upload private data, purchase an AI subscription, or write scripts for every task.
Make the same workflows usable for organizations under paid business licenses.
This is a product direction, not evidence of demand, differentiation or revenue.

The invariant is **private personal use free; business/professional use paid**.
No automatic small-company exemption and no unapproved change of license.
No prices, sales claims or payment integration are implied by this roadmap.

## Three product tracks

### 1. TrueFlow — Data Workbench: implemented in v0.2.0

Problem: successive exports disagree, records are duplicated, identifiers get
rounded, and a one-time cleanup has to be repeated manually next month.

Outcome: import local CSV/JSON, inspect issues, compose explicit transformations,
compare by reliable keys, review changes, export results and reuse the same recipe
from the UI or command line. No silent corrections and no original-file writes.

The first vertical workflow is complete within documented limits. It is not a
replacement for a distributed ETL platform. Next work should improve this workflow
rather than add unrelated converters: mapping different schemas, validation error
locations, larger-file responsiveness and cancellable processing.

### 2. TrueCase — evidence and document workspace: planned, NOT implemented

Problem: receipts, conversations, photos and notes for an incident become scattered
across folders. Preparing a coherent history requires repetitive manual work.

Target outcome: explicitly import files locally, organize a timeline, annotate
without modifying originals, identify duplicates and export a portable bundle
with a manifest and integrity hashes. People can prepare a history for repairs,
warranties, projects or personal records without uploading documents to a service.

Initial acceptance criteria: portable export/import round-trip, original-byte
preservation, manifest verification, clear missing-file errors, a synthetic demo,
and no background persistence. Hashes are not notarization, proof of authenticity
or legal advice. Encryption requires separate design/review; do not invent it.
No UI card or runnable command should claim this exists before it is implemented.

### 3. TrueScrub Privacy Studio — batch preparation: planned, NOT implemented

Problem: sharing a support bundle or dataset may expose private data across many
files, while the existing TrueScrub textbox only handles one text at a time.

Target outcome: local batch inspection, per-file findings, explicit exclusion of
files/columns, reviewed redacted outputs and a report without matched values.
Reuse the existing engine where appropriate; do not pretend regex detection is
complete anonymization. Consistent pseudonyms introduce correlation risks and
need explicit scope, reset behavior and regression tests.

Initial acceptance criteria: bounded multi-file import, visible unsupported-file
errors, preview/review before export, unchanged originals and no leaked source
values in diagnostics. ZIP/PDF/OCR support is not automatically in scope.

## Repository shape

`apps/toolbox` remains useful for quick tasks. `projects/<name>` hosts each real
application with its own UI, core, documentation, fixtures and tests. Share proven
code and build infrastructure, not unrelated state. Larger future apps may use
Java/Spring, a desktop shell or another runtime only when a workflow needs it.

## Definition of a meaningful milestone

A specific person can finish a real task from input to usable exported result.
The demo works, failure cases are explicit, originals remain safe, test results
are recorded honestly, and the release has actual build artifacts. A roadmap,
new folder, extra button, impressive architecture or high test count is not enough.
