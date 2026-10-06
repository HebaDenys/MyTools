# MyTools v0.2.1 — TrueScrub authorization redaction

TrueScrub now detects and redacts HTTP Basic credentials carried in
`Authorization` and `Proxy-Authorization` headers, alongside the existing Bearer
and secret patterns. The detector only redacts the credential payload and leaves
the header name and authentication scheme visible for diagnostic context.

Regression coverage includes both header forms plus ordinary prose containing the
word “Basic” to reduce false positives. All existing data/privacy boundaries and
licensing remain unchanged.

Private personal use remains free. Business and professional use remains paid.
No checkout, price list or commercial agreement is introduced by this release.
