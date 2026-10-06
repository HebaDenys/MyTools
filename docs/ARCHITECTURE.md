# Architecture

The monorepo is a container for multiple projects, not a requirement to share
one framework. packages/truescrub and packages/essentials expose pure ES modules.
apps/toolbox connects them to a catalog/workspace with three UI languages.
projects is reserved for independently runnable larger applications.

The build script wraps modules in separate closures and inlines CSS and JS into
one HTML document. No transpiler, package install or network operation is needed.
Only fixed import statements are stripped. CSP hashes cover the exact inline
bytes. Distribution copies carry LICENSE, NOTICE and commercial-use instructions.
Do not add arbitrary dynamic imports or external assets without revisiting the
build and privacy tests. Package APIs can be imported independently in Node 22+.

Text is capped at 1 MiB UTF-8. Hash files are capped at 20 MiB before reading them.
JSON is parsed for validation only; token formatting preserves numeric lexemes,
escapes, duplicate keys and ordering. Format depth is capped at 128 and output at
4 MiB to bound expansion. URL cleaning preserves the original bytes of retained
query pairs and fragments, rather than reserializing signed parameters.

Password characters use Web Crypto rejection sampling, not modulo-biased random
bytes or Math.random. All four character groups are required by rejection of
whole generated candidates. SHA-256 uses Web Crypto and is not encryption.
UI operation revisions prevent a completed asynchronous operation from restoring
stale sensitive results after edits or clear. Output uses textarea.value or
textContent, never HTML parsing. Errors shown in the UI do not quote user input.

Run `npm run validate` for syntax, distribution and logic tests. CI uses explicit
minimum permissions, immutable action SHAs, no persisted checkout credentials and
no paid external APIs. Publication is separate from tests and requires successful
checks; releases are versioned and existing assets are not overwritten.
