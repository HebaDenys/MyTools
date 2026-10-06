// SPDX-License-Identifier: LicenseRef-MyTools-Personal-1.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatJson, encodeBase64, decodeBase64, cleanLink, deduplicateLines, textStats, generatePassword, sha256, TEXT_LIMIT, FILE_LIMIT } from '../packages/essentials/index.mjs';

test('JSON preserves large integers and duplicate keys', () => {
  const text = '{ "n":900719925474099312345, "n":1e400, "z":-0, "s":"a  b" }';
  assert.equal(formatJson(text, false), '{"n":900719925474099312345,"n":1e400,"z":-0,"s":"a  b"}');
  assert.ok(formatJson(text).includes('900719925474099312345'));
});
test('JSON formatting is readable and stable', () => {
  const expected = '{\n  "a": [\n    1,\n    {},\n    []\n  ]\n}';
  assert.equal(formatJson('{"a":[1,{},[]]}'), expected);
  assert.equal(formatJson(expected), expected);
});
test('JSON preserves escaped strings', () => {
  const text = '{"x":"\\u0041\\n\\\"{}[],: ","y":true}';
  assert.equal(formatJson(formatJson(text), false), text);
});
for (const text of ['null', 'true', '1e400', '-0', '"hello"', '[]', '{}']) test(`JSON scalar/container ${text}`, () => assert.equal(formatJson(text), text));
for (const text of ['', '{', '[1,]', '{"a":NaN}', 'undefined', '{"a":1}garbage']) test(`invalid JSON ${text}`, () => assert.throws(() => formatJson(text), SyntaxError));
test('JSON depth limit', () => assert.throws(() => formatJson('['.repeat(129) + '0' + ']'.repeat(129)), RangeError));
test('JSON expansion limit', () => assert.throws(() => formatJson('['.repeat(128) + Array(18000).fill('0').join(',') + ']'.repeat(128)), RangeError));
test('JSON flags are validated', () => assert.throws(() => formatJson('{}', 'yes'), TypeError));
for (const text of ['', 'hello', 'Español 😀 日本語', '\ufeffBOM', 'a\u0000b', 'x'.repeat(20000)]) test(`Base64 roundtrip ${text.length}`, () => assert.equal(decodeBase64(encodeBase64(text)), text));
test('Base64 known value', () => assert.equal(encodeBase64('hello'), 'aGVsbG8='));
test('Base64 allows line wrapping', () => assert.equal(decodeBase64('aGVs\nbG8=\r\n'), 'hello'));
for (const text of ['a', 'aGVsbG8', 'ab==', '////', 'SGVsbG8_', '====']) test(`invalid Base64 ${text}`, () => assert.throws(() => decodeBase64(text)));
test('Base64 rejects invalid Unicode rather than silently replacing it', () => assert.throws(() => encodeBase64('\ud800'), TypeError));
test('link cleaner preserves query bytes and fragment', () => assert.equal(cleanLink('https://example.org/p?a=%2f&a=two+words&utm_source=x&FBCLID=y#utm_source=z'), 'https://example.org/p?a=%2f&a=two+words#utm_source=z'));
test('encoded tracking keys are removed', () => assert.equal(cleanLink('https://example.org?%75tm_source=x&keep=1'), 'https://example.org?keep=1'));
test('all tracking query removed', () => assert.equal(cleanLink('https://example.org?gclid=x#part'), 'https://example.org#part'));
test('unknown malformed parameters preserved', () => assert.equal(cleanLink('https://example.org?%zz=a&ref=keep'), 'https://example.org?%zz=a&ref=keep'));
test('URL unchanged without tracking', () => assert.equal(cleanLink('https://example.org/path?x=%2f#f'), 'https://example.org/path?x=%2f#f'));
for (const value of ['javascript:alert(1)', 'file:///tmp/a', '/relative', 'https://', 'https://example.org/a b']) test(`reject URL ${value}`, () => assert.throws(() => cleanLink(value), TypeError));
test('dedup retains first occurrence and case', () => assert.equal(deduplicateLines('a\r\na\rB\nb\nB\n'), 'a\nB\nb\n'));
test('dedup empty input', () => assert.equal(deduplicateLines(''), ''));
test('Unicode counts', () => {
  const stats = textStats('é 😀');
  assert.equal(stats.utf8Bytes, 7); assert.equal(stats.codePoints, 3); assert.equal(stats.graphemes, 3); assert.equal(stats.words, 1); assert.equal(stats.lines, 1);
});
test('combined character grapheme', () => { const s = textStats('e\u0301'); assert.equal(s.codePoints, 2); assert.equal(s.graphemes, 1); });
test('empty and normalized line counts', () => { assert.equal(textStats('').lines, 0); assert.equal(textStats('a\r\nb\rc').lines, 3); });
for (const length of [12, 24, 128]) test(`password requirements ${length}`, () => {
  for (let i = 0; i < 25; i++) {
    const password = generatePassword(length);
    assert.equal(password.length, length);
    for (const pattern of [/[a-z]/, /[A-Z]/, /[0-9]/, /[!@#$%^&*()\-_=+\[\]{}:,.?]/]) assert.match(password, pattern);
  }
});
for (const length of [0, 11, 129, 12.5, '24', null]) test(`invalid password length ${length}`, () => assert.throws(() => generatePassword(length), RangeError));
test('SHA-256 standard text and binary vector', async () => {
  const expected = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  assert.equal(await sha256('abc'), expected);
  assert.equal(await sha256(new Uint8Array([97, 98, 99])), expected);
});
test('SHA-256 empty vector', async () => assert.equal(await sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'));
test('SHA-256 rejects overlarge files and wrong types', async () => {
  await assert.rejects(sha256(new Uint8Array(FILE_LIMIT + 1)), RangeError);
  await assert.rejects(sha256({}), TypeError);
  await assert.rejects(sha256('\ud800'), TypeError);
});
for (const [name, fn] of Object.entries({ formatJson, encodeBase64, decodeBase64, cleanLink, deduplicateLines, textStats })) {
  test(`${name}: invalid input`, () => assert.throws(() => fn(null), TypeError));
  test(`${name}: UTF-8 byte limit`, () => assert.throws(() => fn('😀'.repeat(TEXT_LIMIT / 4 + 1)), RangeError));
}
