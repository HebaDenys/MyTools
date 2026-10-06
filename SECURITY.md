# Security and privacy

Do not put live secrets, personal data or exploit details about third-party
systems in a public issue. Use synthetic examples. For a sensitive vulnerability,
use GitHub private vulnerability reporting if enabled; otherwise open a minimal
issue requesting a private reporting channel without disclosure details.

The standalone app has no network APIs, telemetry, uploads or persistent input
storage. Its CSP blocks connections and remote resources. Browser extensions,
malware, clipboard history, downloaded files, backups and browser session restore
remain outside its security boundary. Clearing the workspace is not guaranteed
secure erasure from memory. Page navigation may contact an external site only
when the user explicitly follows a documentation or licensing link.

TrueScrub is heuristic. It may miss names, addresses, national identifiers,
unfamiliar credentials, obfuscated data and context. It may redact harmless text.
Its output is plain text, not guaranteed valid structured JSON/CSV. Pseudonyms
can still be linked within an input. Review before copying or exporting.

Base64 is not encryption. SHA-256 does not establish that a file is trustworthy.
The password generator requires cryptographic randomness and has no weak fallback.
No tool promises legal compliance or absolute security. Limits: 1 MiB UTF-8 text,
20 MiB hash files; JSON depth and formatted output are additionally bounded.
