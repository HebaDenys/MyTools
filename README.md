# MyTools

**A local-first Swiss Army knife for everyday digital tasks.**

One public monorepo, independent tools, a common browser workspace. Built by
Denys Heba. **Free for private personal use; paid licensing for business and
professional use, including internal use.** See [LICENSE](LICENSE) and
[commercial licensing](COMMERCIAL.md). Source-available, not OSI open source.

## Use it

Download `MyTools.html` from [Releases](https://github.com/HebaDenys/MyTools/releases)
and open it in a modern browser. It is a single self-contained HTML file: no
installation, account, CDN, AI subscription or runtime network calls. A release
is available only once the publishing workflow has completed successfully.

For development, install Node.js 22 or newer, clone this repository and run:

```sh
npm run validate
npm start
```

Open `http://127.0.0.1:4173`. No `npm install` is needed: the app and Node tests
have zero third-party dependencies. `npm run build` creates `dist/MyTools.html`.
A local server is a convenience for opening the static app, not an API backend.
SHA-256 and clipboard access require browser support and a permitted context;
HTTPS or localhost is the reliable fallback when file-opening policies differ.

## Included tools

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
The app has no upload endpoint, analytics, service worker or remote license check.
If someone hosts the static files, their server may log page requests; use the
downloaded build to avoid contacting a host while opening the app.

## Repository structure

```text
apps/toolbox/          shared browser catalog and workspace
packages/truescrub/   reusable redaction module
packages/essentials/  small, independently testable utilities
projects/             guidance for larger independent applications
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
existing releases are not overwritten. Bump `package.json` and release notes for
a new version. Test output and CI are evidence; a configured workflow alone is
not evidence that checks passed. See [AGENTS.md](AGENTS.md) for automation rules.

## Roadmap and contributions

[Roadmap](docs/ROADMAP.md) · [Architecture](docs/ARCHITECTURE.md) ·
[Security](SECURITY.md) · [Contributing](CONTRIBUTING.md)

Prefer useful, finished tools over a catalog full of placeholders. Next work:
stronger redaction, browser regression coverage, accessibility and careful local
file utilities. Contributions need the explicit license grant in CONTRIBUTING.
Do not submit personal data, working secrets or copied incompatible code.

## Italiano

Un unico repository per più strumenti e progetti, non un'unica applicazione
monolitica. Elaborazione locale, nessun account e nessun abbonamento AI.
**Privati gratis; aziende e uso professionale a pagamento, anche per uso interno.**

## Español

Un repositorio para varias herramientas y proyectos, con módulos independientes.
Procesamiento local, sin cuentas ni suscripciones de IA.
**Uso privado gratuito; uso empresarial y profesional de pago, incluso interno.**
