# TrueScrub (MyTools edition 0.2.0)

```js
import { scrub } from './index.mjs';
const result = scrub('demo@example.org password=synthetic', {
  mode: 'mask', // or pseudonym; IDs are consistent only within this call
  customTerms: ['Example Person']
});
console.log(result.text); // Never log real input in an application.
```

Exports: scrub, detect, isLuhn, isIban, CATEGORIES, VERSION, MAX_INPUT_BYTES,
MAX_FINDINGS. detect returns UTF-16 offsets and categories, not matched values.
Inputs are bounded to 1 MiB UTF-8 and 20,000 candidate matches. Options can select
a subset of categories; categories: [] intentionally disables all detection.

Heuristics cover common email, international-phone, IP, card/IBAN checksum and
secret shapes. Names/addresses need custom terms. Unicode obfuscation, domestic
phones, country IDs and unfamiliar tokens may be missed. Overlapping spans are
merged and truncated secrets handled conservatively. False positives are possible.
Output is plain text, not guaranteed parseable JSON/CSV. Review is mandatory.

License: root LICENSE. Personal use free; business/professional use paid.
