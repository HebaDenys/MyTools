# MyTools

**Independent local-first applications for data and privacy, with a shared toolbox.**

One public monorepo, complete workflows, independent applications. Built by
Denys Heba. **Free for private personal use; paid licensing for business and
professional use, including internal use.** See [LICENSE](LICENSE) and
[commercial licensing](COMMERCIAL.md). Source-available, not OSI open source.

## Use it

Download the complete `MyTools-v0.4.1.zip` from [Releases](https://github.com/HebaDenys/MyTools/releases),
extract it and open `MyTools.html` for the catalog or `TrueFlow.html` for the data
workbench. Keep both HTML files in the same folder for navigation between them.
Each app is self-contained: no installation, account, CDN, AI subscription or
runtime network calls. A release exists only after publishing succeeds.

## MCP and local API

The same engines are callable from MCP clients and programs. Use the repository
or the separate `MyTools-server-v0.4.1.zip` release asset (Node.js 22+):

```sh
node adapters/local/mcp.mjs   # MCP stdio; configure this command in your client
node adapters/local/http.mjs  # authenticated loopback API; token required
```

Read [setup, contracts and privacy limits](docs/ADAPTERS.md). Ten operations cover
the seven utility families and TrueFlow profiling, recipes and reconciliation.
The HTTP API is opt-in and binds only localhost; it is not public hosting or an
HTTP MCP endpoint. The standalone browser apps still make no runtime requests.
An AI client may send tool inputs/results to its provider: local execution alone
does not guarantee private AI use. Business licensing applies to these interfaces too.

## First independent application: TrueFlow

**Import → diagnose → transform → compare → review → export.**

[TrueFlow](projects/trueflow/README.md) cleans CSV/JSON archives, builds reusable
transformation recipes, and identifies added, removed and changed records by
explicit unique keys. It includes a separate three-language browser UI, offline
CLI, real CSV/JSON downloads and diagnostic reports without cell values. It
preserves originals and refuses ambiguous comparisons instead of guessing.
Duplicate-key failures identify A/B and both records in the first conflict while
omitting the actual key value from UI/CLI/API error text.

For exports with renamed columns, enable **Compare different column names** in
TrueFlow, select the original B counterparts of A, and save/import the mapping.
Mapping precedes the recipe; all columns must match one-to-one. The same mapping
file works with `--mapping` in the CLI and `mapping` in MCP/API `trueflow_compare`.
See [the mapped example](projects/trueflow/README.md#different-column-names).

Click **Load a synthetic example** to complete a real workflow immediately.
Expected comparison: **1 added, 1 removed, 1 changed, 2 unchanged**.
The application is bounded to 5 MiB/input and 50,000 records; see its README for
all data semantics and safety limits. This is not a streaming big-data platform.

For development, install Node.js 22 or newer, clone this repository and run:

```sh
npm run validate
npm start
```

Open `http://127.0.0.1:4173`. No `npm install` is needed: the app and Node tests
have zero third-party dependencies. `npm run build` creates `dist/MyTools.html` and `dist/TrueFlow.html`.
The workbench is served at `/TrueFlow.html`.
A local server is a convenience for opening the static app, not an API backend.
SHA-256 and clipboard access require browser support and a permitted context;
HTTPS or localhost is the reliable fallback when file-opening policies differ.

## Quick utilities (the foundation, not the whole product)

| Tool | Purpose | Important boundary |
| --- | --- | --- |
| TrueScrub | Redact common personal data and secrets in text/logs; add literal custom terms | Best effort; review mandatory; output is plain text |
| JSON | Validate, pretty-print or minify | Preserves original number tokens, key order and duplicate keys; no semantic repair |
| Base64 | Encode/decode UTF-8 text | Encoding is **not encryption**; strict standard padded Base64 |
| Clean link | Remove common marketing parameters | Does not open links or guarantee anonymity; can invalidate signed links |
| Text | Count Unicode text and remove duplicate lines | Exact, case-sensitive deduplication; preserves first occurrence |
| Password | Generate a 24-character password with browser cryptographic randomness | No storage or recovery; copy to a trusted password manager |
| SHA-256 | Hash text or a local file, up to 20 MiB | A checksum, not encryption or proof that a file is safe |

The shared browser UI is available in English, Italian and Spanish. Inputs are
not stored in cookies, browser storage, URLs or application logs. Changing a tool
clears the workspace. Clipboard contents and exported files are outside the app's
control. A compromised browser, extension or operating system can still read data.
The standalone browser app has no upload endpoint, analytics, service worker or remote license check.
If someone hosts the static files, their server may log page requests; use the
downloaded build to avoid contacting a host while opening the app.

## Repository structure

```text
apps/toolbox/          shared browser catalog and workspace
adapters/local/       MCP stdio, authenticated loopback HTTP, shared contracts
packages/truescrub/   reusable redaction module
packages/essentials/  small, independently testable utilities
projects/trueflow/    complete data workbench: UI, core, CLI and fixtures
projects/             independent applications, not placeholders
scripts/              dependency-free build, checks and localhost server
test/                 unit, regression and distribution tests
docs/                 roadmap, architecture and release notes
```

This repository can host several projects. A small browser utility belongs in a
package and the shared catalog. A larger application can live in `projects/<id>`
with its own README, runtime and tests. Do not force a future Java/Spring, desktop
or mobile project into the browser app. All original projects inherit the root
personal-free/business-paid policy; third-party licenses remain independent.

## Quality and publishing

`npm run validate` checks JavaScript syntax, builds the standalone distribution
and runs the Node test suite. CI runs on pushes, pull requests and weekly. A
versioned release is published from `main` only after the test matrix passes;
existing releases are not overwritten. TrueFlow browser checks are also required
before release. Bump `package.json` and release notes for
a new version. Test output and CI are evidence; a configured workflow alone is
not evidence that checks passed. See [AGENTS.md](AGENTS.md) for automation rules.

## Roadmap and contributions

[Roadmap](docs/ROADMAP.md) · [Architecture](docs/ARCHITECTURE.md) ·
[Security](SECURITY.md) · [Contributing](CONTRIBUTING.md)

The [product vision](docs/PRODUCT_VISION.md) defines three tracks: **TrueFlow**
(implemented), **TrueCase** portable document/evidence bundles (planned), and
**Privacy Studio** batch preparation (planned). Future tracks are not advertised
as available tools. Complete useful workflows take priority over more formatters.
Contributions need the explicit grant in CONTRIBUTING. Do not submit personal
data, working secrets or copied incompatible code.

## Italiano

Un unico repository per più strumenti e progetti, non un'unica applicazione
monolitica. Elaborazione locale, nessun account e nessun abbonamento AI.
**Privati gratis; aziende e uso professionale a pagamento, anche per uso interno.**

## Español

Un repositorio para varias herramientas y proyectos, con módulos independientes.
Procesamiento local, sin cuentas ni suscripciones de IA.
**Uso privado gratuito; uso empresarial y profesional de pago, incluso interno.**

Merged branch cleanup runs on main updates; see [branch maintenance](docs/BRANCH_MAINTENANCE.md).
