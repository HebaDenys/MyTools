// SPDX-License-Identifier: LicenseRef-MyTools-Personal-1.0
// Copyright 2026 Denys Heba. See root LICENSE and COMMERCIAL.md.
export const TEXT_LIMIT = 1024 * 1024;
export const FILE_LIMIT = 20 * 1024 * 1024;
const utf8Encoder = new TextEncoder();
function checked(text) {
  if (typeof text !== 'string') throw new TypeError('Expected text.');
  if (utf8Encoder.encode(text).byteLength > TEXT_LIMIT) throw new RangeError('Text exceeds 1 MiB.');
  return text;
}
function utf8(text) {
  checked(text);
  if (!text.isWellFormed()) throw new TypeError('Invalid Unicode.');
  return utf8Encoder.encode(text);
}
/** Parse only for validation; emit original tokens to avoid number precision loss. */
export function formatJson(text, pretty = true) {
  checked(text);
  if (typeof pretty !== 'boolean') throw new TypeError('Expected a formatting flag.');
  try { JSON.parse(text); } catch { throw new SyntaxError('Invalid JSON.'); }
  const tokens = text.match(/"(?:\\[\s\S]|[^"\\])*"|[^\s{}\[\],:]+|[{}\[\],:]/g) ?? [];
  let depth = 0;
  for (const token of tokens) {
    if (token === '{' || token === '[') { if (++depth > 128) throw new RangeError('JSON nesting exceeds 128.'); }
    if (token === '}' || token === ']') depth--;
  }
  if (!pretty) return tokens.join('');
  const output = []; let length = 0;
  const put = value => {
    length += value.length;
    if (length > 4 * TEXT_LIMIT) throw new RangeError('Formatted output is too large.');
    output.push(value);
  };
  const line = () => put('\n' + '  '.repeat(depth));
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '{' || token === '[') {
      put(token); depth++;
      if (tokens[i + 1] !== '}' && tokens[i + 1] !== ']') line();
    } else if (token === '}' || token === ']') {
      depth--;
      if (tokens[i - 1] !== '{' && tokens[i - 1] !== '[') line();
      put(token);
    } else if (token === ',') { put(','); line(); }
    else if (token === ':') put(': ');
    else put(token);
  }
  const result = output.join('');
  if (utf8Encoder.encode(result).byteLength > 4 * TEXT_LIMIT) throw new RangeError('Formatted output is too large.');
  return result;
}
export function encodeBase64(text) {
  const bytes = utf8(text); let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
export function decodeBase64(text) {
  const compact = checked(text).replace(/[ \t\r\n]/g, '');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(compact)) throw new TypeError('Invalid standard padded Base64.');
  const binary = atob(compact);
  if (btoa(binary) !== compact) throw new TypeError('Noncanonical Base64 padding bits.');
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
  } catch { throw new TypeError('Decoded bytes are not UTF-8 text.'); }
}
/** Never fetch the URL. Keep retained query pairs and fragment byte-for-byte. */
export function cleanLink(text) {
  const value = checked(text).trim();
  if (!/^https?:\/\//i.test(value) || /[\s\u0000-\u001f\u007f]/u.test(value)) throw new TypeError('Expected an absolute HTTP(S) URL without whitespace.');
  try { new URL(value); } catch { throw new TypeError('Invalid URL.'); }
  const hash = value.indexOf('#'), fragment = hash < 0 ? '' : value.slice(hash), body = hash < 0 ? value : value.slice(0, hash);
  const question = body.indexOf('?');
  if (question < 0) return value;
  const tracking = new Set(['fbclid', 'gclid', 'dclid', 'msclkid', 'mc_cid', 'mc_eid']);
  const pairs = body.slice(question + 1).split('&');
  const keep = pairs.filter(pair => {
    let key;
    try { key = decodeURIComponent(pair.split('=', 1)[0].replace(/\+/g, ' ')).toLowerCase(); }
    catch { return true; }
    return !key.startsWith('utm_') && !tracking.has(key);
  });
  if (keep.length === pairs.length) return value;
  return body.slice(0, question) + (keep.length ? '?' + keep.join('&') : '') + fragment;
}
export function deduplicateLines(text) {
  return [...new Set(checked(text).replace(/\r\n?/g, '\n').split('\n'))].join('\n');
}
export function textStats(text) {
  checked(text);
  let graphemes = 0, words = 0, codePoints = 0;
  for (const _ of text) codePoints++;
  for (const _ of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) graphemes++;
  for (const part of new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text)) if (part.isWordLike) words++;
  return { utf8Bytes: utf8Encoder.encode(text).byteLength, codePoints, graphemes, words, lines: text ? text.replace(/\r\n?/g, '\n').split('\n').length : 0 };
}
/** Uniform sampling from allowed candidates; no weak RNG fallback. */
export function generatePassword(length = 24) {
  if (!Number.isInteger(length) || length < 12 || length > 128) throw new RangeError('Password length must be 12 through 128.');
  if (!globalThis.crypto?.getRandomValues) throw new Error('Cryptographic randomness unavailable.');
  const groups = ['abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '0123456789', '!@#$%^&*()-_=+[]{}:,.?'];
  const alphabet = groups.join(''), ceiling = 256 - (256 % alphabet.length);
  for (let attempt = 0; attempt < 1024; attempt++) {
    let result = '';
    for (let batch = 0; result.length < length && batch < 32; batch++) {
      const bytes = globalThis.crypto.getRandomValues(new Uint8Array(length * 2));
      for (const byte of bytes) {
        if (byte < ceiling && result.length < length) result += alphabet[byte % alphabet.length];
      }
    }
    if (result.length !== length) throw new Error('Randomness source failed.');
    if (groups.every(group => [...result].some(char => group.includes(char)))) return result;
  }
  throw new Error('Randomness source failed.');
}
/** Hash bytes exactly; a hash is not encryption or a file safety assessment. */
export async function sha256(input) {
  const bytes = typeof input === 'string' ? utf8(input) : input;
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Expected text or Uint8Array.');
  if (bytes.byteLength > FILE_LIMIT) throw new RangeError('File exceeds 20 MiB.');
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto requires a supported secure context.');
  const result = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(result)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
