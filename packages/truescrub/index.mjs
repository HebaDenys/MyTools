// SPDX-License-Identifier: LicenseRef-MyTools-Personal-1.0
// Copyright 2026 Denys Heba. See root LICENSE and COMMERCIAL.md.
export const VERSION = '0.2.0';
export const MAX_INPUT_BYTES = 1024 * 1024;
export const MAX_FINDINGS = 20_000;
export const CATEGORIES = Object.freeze([
  'EMAIL', 'PHONE', 'IP_ADDRESS', 'PAYMENT_CARD', 'IBAN', 'SECRET', 'PRIVATE_KEY', 'CUSTOM',
]);
const encoder = new TextEncoder();

/** Format/checksum checks do not establish that a card or bank account exists. */
export function isLuhn(value) {
  const digits = String(value).replace(/[ -]/g, '');
  if (!/^\d{13,19}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  for (let i = digits.length - 1, double = false; i >= 0; i--, double = !double) {
    let digit = Number(digits[i]);
    if (double && (digit *= 2) > 9) digit -= 9;
    sum += digit;
  }
  return sum % 10 === 0;
}
export function isIban(value) {
  const normalized = String(value).replace(/[ -]/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(normalized)) return false;
  const rotated = normalized.slice(4) + normalized.slice(0, 4);
  let remainder = 0;
  for (const char of rotated) {
    const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}
function optionsFor(text, options) {
  if (typeof text !== 'string') throw new TypeError('Input must be a string.');
  if (encoder.encode(text).byteLength > MAX_INPUT_BYTES) throw new RangeError('Input exceeds the 1 MiB limit.');
  if (options === null || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Options must be an object.');
  const mode = options.mode ?? 'mask';
  if (!['mask', 'pseudonym'].includes(mode)) throw new TypeError('Mode must be mask or pseudonym.');
  const categories = options.categories ?? CATEGORIES;
  if (!Array.isArray(categories) || categories.some(x => !CATEGORIES.includes(x))) throw new TypeError('Unknown detection category.');
  const customTerms = options.customTerms ?? [];
  if (!Array.isArray(customTerms) || customTerms.length > 200 || customTerms.some(
    x => typeof x !== 'string' || x.length === 0 || x.length > 512 || !x.trim(),
  )) throw new TypeError('Use up to 200 nonempty literal terms, at most 512 characters each.');
  return { mode, enabled: new Set(categories), customTerms: [...new Set(customTerms)] };
}
function scan(text, config) {
  const candidates = [];
  const push = (start, end, category) => {
    if (end <= start) return;
    if (candidates.length >= MAX_FINDINGS) throw new RangeError('Too many matches; split the input into smaller pieces.');
    candidates.push({ start, end, category });
  };
  const collect = (regex, category, validate = () => true, group = 0) => {
    if (!config.enabled.has(category)) return;
    for (const match of text.matchAll(regex)) {
      const selected = typeof group === 'function' ? group(match) : group;
      if (match[selected] && validate(match[selected])) {
        const [start, end] = match.indices[selected];
        push(start, end, category);
      }
    }
  };
  // Truncated private keys hide the rest of the input rather than exposing it.
  collect(/-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z0-9]+ )?PRIVATE KEY-----|$)/gd, 'PRIVATE_KEY');
  collect(/(?<![\p{L}\p{N}_.+%-])[\p{L}\p{N}_.!#$%&'*+\-/=?^`{|}~]{1,128}@(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.){1,10}[\p{L}]{2,63}(?![\p{L}\p{N}-])/gdu, 'EMAIL');
  collect(/(?<![\p{L}\p{N}])\+[1-9][\d ().-]{5,40}\d(?!\d)/gdu, 'PHONE', x => {
    const length = x.replace(/\D/g, '').length;
    return length >= 8 && length <= 15;
  });
  collect(/(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/gd, 'IP_ADDRESS', x => x.split('.').every(n => Number(n) <= 255));
  collect(/(?<![\da-f:])(?:[\da-f]{0,4}:){2,7}[\da-f]{0,4}(?![\da-f:])/gdi, 'IP_ADDRESS', x => {
    if (!/[\da-f]/i.test(x)) return false;
    try { return new URL(`http://[${x}]/`).hostname.startsWith('['); } catch { return false; }
  });
  collect(/(?<!\d)(?:\d[ -]?){12,18}\d(?![ -]?\d)/gd, 'PAYMENT_CARD', isLuhn);
  if (config.enabled.has('IBAN')) {
    for (const match of text.matchAll(/\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]){11,30}/gd)) {
      for (let length = match[0].length; length >= 15; length--) {
        const candidate = match[0].slice(0, length), next = text[match.index + length] ?? '';
        if (/[A-Z0-9]$/.test(candidate) && !/[A-Z0-9]/.test(next) && isIban(candidate)) {
          push(match.index, match.index + length, 'IBAN'); break;
        }
      }
    }
  }
  collect(/(?<![A-Za-z0-9_-])(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}|sk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,})(?![A-Za-z0-9_-])/gd, 'SECRET');
  collect(/(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}(?![A-Za-z0-9_-])/gd, 'SECRET');
  collect(/\bBearer[ \t]+([A-Za-z0-9._~+\/-]{4,}=*)/gdi, 'SECRET', () => true, 1);
  collect(/\b(?:Proxy-)?Authorization[ \t]*:[ \t]*Basic[ \t]+([A-Za-z0-9+/]{8,}={0,2})(?![A-Za-z0-9+/=])/gdi, 'SECRET', () => true, 1);
  collect(/\b(?:password|passwd|pwd|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|secret|token)\b["']?[ \t]*[:=][ \t]*(?:"((?:\\[^\r\n]|[^"\\\r\n]|\\(?=\r?\n|$))+)(?:"|(?=\r?\n|$))|'((?:\\[^\r\n]|[^'\\\r\n]|\\(?=\r?\n|$))+)(?:'|(?=\r?\n|$))|([^\s,;}&"']+))/gdi,
    'SECRET', () => true, match => match[1] !== undefined ? 1 : match[2] !== undefined ? 2 : 3);
  collect(/\b[A-Za-z][A-Za-z0-9+.-]{0,20}:\/\/([^/\s@]+)(?=@)/gd, 'SECRET', () => true, 1);
  // Custom entries are case-insensitive literal strings, never executable regex.
  if (config.enabled.has('CUSTOM')) {
    for (const term of config.customTerms) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      for (const match of text.matchAll(new RegExp(`(?=(${escaped}))`, 'gdiu'))) push(match.indices[1][0], match.indices[1][1], 'CUSTOM');
    }
  }
  // Union all intersecting spans: priority must not expose an overlapping suffix.
  candidates.sort((a, b) => a.start - b.start || b.end - a.end || a.category.localeCompare(b.category));
  const merged = [];
  for (const span of candidates) {
    const previous = merged.at(-1);
    if (previous && span.start < previous.end) {
      if (span.end > previous.end) {
        previous.end = span.end;
        if (previous.category !== span.category) previous.category = 'SENSITIVE';
      } else if (span.start === previous.start && span.end === previous.end && span.category !== previous.category) previous.category = 'SENSITIVE';
    } else merged.push({ ...span });
  }
  return merged;
}
/** UTF-16 offsets and categories only; no matched source values. */
export function detect(text, options = {}) { return scan(text, optionsFor(text, options)); }
/** Best-effort redaction, NOT guaranteed anonymization or legal compliance. */
export function scrub(text, options = {}) {
  const config = optionsFor(text, options), spans = scan(text, config);
  const tokens = new Map(), sequence = Object.create(null), counts = Object.create(null);
  let output = '', cursor = 0;
  for (const { start, end, category } of spans) {
    let replacement = `[${category}]`;
    if (config.mode === 'pseudonym') {
      const key = `${category}\0${text.slice(start, end)}`;
      if (!tokens.has(key)) tokens.set(key, `[${category}_${sequence[category] = (sequence[category] ?? 0) + 1}]`);
      replacement = tokens.get(key);
    }
    output += text.slice(cursor, start) + replacement;
    cursor = end; counts[category] = (counts[category] ?? 0) + 1;
  }
  output += text.slice(cursor); tokens.clear();
  const warnings = ['REVIEW_REQUIRED', 'PLAIN_TEXT_OUTPUT'];
  if (config.mode === 'pseudonym') warnings.push('PSEUDONYMS_ARE_LINKABLE');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(text)) warnings.push('HIDDEN_CHARACTERS');
  return { text: output, report: { version: VERSION, matches: spans.length, counts: { ...counts }, warnings } };
}
