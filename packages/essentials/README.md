# Essentials

Dependency-free ES module for Node 22+ and modern browsers. Import any function
from index.mjs. Exports: formatJson(text, pretty=true), encodeBase64(text),
decodeBase64(text), cleanLink(text), deduplicateLines(text), textStats(text),
generatePassword(length=24), sha256(textOrUint8Array), TEXT_LIMIT, FILE_LIMIT.

JSON formatting validates without reserializing numeric values, escapes, key
order or duplicate keys. It rejects more than 128 nesting levels and formatted
output above 4 MiB. Base64 is standard padded UTF-8, not encryption; invalid UTF-8
and noncanonical padding bits are rejected. ASCII whitespace in Base64 is allowed.

Link cleaning removes utm_* and common click/marketing IDs only. No link is opened.
Unknown parameters, duplicate retained keys, escaping and fragments are preserved.
Removing parameters may invalidate a signed URL and does not guarantee privacy.

Text deduplication is exact and case-sensitive, preserves first occurrence and
normalizes CRLF/CR to LF. Counts use Intl.Segmenter for graphemes and words;
segmentation can differ with the platform's Unicode/locale implementation.

Passwords use cryptographic rejection sampling and require lower/upper/digit/
symbol groups. SHA-256 accepts UTF-8 text or raw bytes and needs Web Crypto.
No persistence, network calls or cryptographic-randomness fallback.

All text input: 1 MiB UTF-8 maximum. Hash file input: 20 MiB maximum.
License: root LICENSE. Private personal use free; business/professional use paid.
