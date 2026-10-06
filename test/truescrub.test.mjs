// SPDX-License-Identifier: LicenseRef-MyTools-Personal-1.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { scrub, detect, isLuhn, isIban, MAX_INPUT_BYTES, MAX_FINDINGS } from '../packages/truescrub/index.mjs';
const cases = [
  ['ASCII email', 'Write alex@example.org today', 'Write [EMAIL] today'],
  ['email tag', 'alex+demo@example.co.uk', '[EMAIL]'],
  ['Unicode email', 'élève@exemple.fr', '[EMAIL]'],
  ['Paraguay phone', '+595 981 123456', '[PHONE]'],
  ['Italian phone', '+39 333 1234567', '[PHONE]'],
  ['parenthesized phone', '+1 (212) 555-0199', '[PHONE]'],
  ['IPv4', 'host=192.0.2.42', 'host=[IP_ADDRESS]'],
  ['IPv6', '2001:db8::1', '[IP_ADDRESS]'],
  ['bracketed IPv6', '[2001:db8::1]:443', '[[IP_ADDRESS]]:443'],
  ['card spaced', '4111 1111 1111 1111', '[PAYMENT_CARD]'],
  ['card compact', '4111111111111111', '[PAYMENT_CARD]'],
  ['card 15 digits', '378282246310005', '[PAYMENT_CARD]'],
  ['IBAN spaced', 'DE89 3704 0044 0532 0130 00', '[IBAN]'],
  ['IBAN compact', 'GB82WEST12345698765432', '[IBAN]'],
  ['IBAN trailing text', 'DE89 3704 0044 0532 0130 00 END', '[IBAN] END'],
  ['password plain', 'password=fictional', 'password=[SECRET]'],
  ['password quotes', 'password="fictional with spaces"', 'password="[SECRET]"'],
  ['password escaped', 'password="abc\\"def"', 'password="[SECRET]"'],
  ['password single quotes', "password='fictional with spaces'", "password='[SECRET]'"],
  ['JSON secret', '{"client_secret":"fictional","code":503}', '{"client_secret":"[SECRET]","code":503}'],
  ['API key', 'api_key=fictional', 'api_key=[SECRET]'],
  ['access token', 'access-token: fictional', 'access-token: [SECRET]'],
  ['bearer', 'Authorization: Bearer synthetic-token-only', 'Authorization: Bearer [SECRET]'],
  ['URL credential', 'https://demo:fictional@example.org/path', 'https://[SENSITIVE]/path'],
  ['PEM', 'before\n-----BEGIN PRIVATE KEY-----\nNOT_A_KEY\n-----END PRIVATE KEY-----\nafter', 'before\n[PRIVATE_KEY]\nafter'],
  ['truncated PEM', 'before\n-----BEGIN RSA PRIVATE KEY-----\nNOT_A_KEY', 'before\n[PRIVATE_KEY]'],
  ['GitHub token shape', 'ghp_' + 'x'.repeat(36), '[SECRET]'],
  ['API token shape', 'sk-proj-' + 'x'.repeat(32), '[SECRET]'],
  ['AWS shape', 'AKIA' + 'X'.repeat(16), '[SECRET]'],
  ['JWT shape', 'eyJxxxxx.abcdefghi.abcdefghi', '[SECRET]'],
];
for (const [name, input, expected] of cases) test(name, () => assert.equal(scrub(input).text, expected));
for (const value of ['HTTP 503 after 1200 ms', '2026-10-06', '999.1.1.1', '1234567890123', '0000000000000000', 'support at example dot org']) test(`negative: ${value}`, () => assert.equal(scrub(value).text, value));
test('empty string', () => assert.equal(scrub('').text, ''));
test('categories can be deliberately disabled', () => assert.equal(scrub('a@example.org', { categories: [] }).text, 'a@example.org'));
test('case-insensitive literal custom term', () => assert.equal(scrub('Alex EXAMPLE and Alex Example', { customTerms: ['Alex Example'] }).text, '[CUSTOM] and [CUSTOM]'));
test('regex metacharacters are literal', () => assert.equal(scrub('a+b[0].* other', { customTerms: ['a+b[0].*'] }).text, '[CUSTOM] other'));
test('Unicode custom term', () => assert.equal(scrub('Persona Ñandú', { customTerms: ['persona ñandú'] }).text, '[CUSTOM]'));
test('intersecting spans', () => assert.equal(scrub('abcde', { customTerms: ['abc', 'cde'] }).text, '[CUSTOM]'));
test('self-overlapping occurrences', () => assert.equal(scrub('banana', { customTerms: ['ana'] }).text, 'b[CUSTOM]'));
test('nested custom values', () => assert.equal(scrub('alice@example.org', { customTerms: ['alice'] }).text, '[EMAIL]'));
test('duplicate terms count once', () => assert.equal(scrub('someone', { customTerms: ['someone', 'someone'] }).report.matches, 1));
test('pseudonyms preserve repeated exact values', () => assert.equal(scrub('a@example.org b@example.org a@example.org', { mode: 'pseudonym' }).text, '[EMAIL_1] [EMAIL_2] [EMAIL_1]'));
test('pseudonym map is per call', () => {
  scrub('a@example.org b@example.org', { mode: 'pseudonym' });
  assert.equal(scrub('b@example.org', { mode: 'pseudonym' }).text, '[EMAIL_1]');
});
test('report excludes source values and mapping', () => {
  const { report } = scrub('unique-person@example.org password=topsecret', { mode: 'pseudonym' });
  assert.equal(report.matches, 2);
  for (const forbidden of ['unique-person', 'topsecret', 'start', 'end', 'mapping']) assert.ok(!JSON.stringify(report).includes(forbidden));
});
test('offsets are UTF-16', () => {
  const text = '😀 a@example.org', spans = detect(text);
  assert.equal(text.slice(spans[0].start, spans[0].end), 'a@example.org');
});
test('review required even for zero findings', () => assert.ok(scrub('hello').report.warnings.includes('REVIEW_REQUIRED')));
test('hidden characters warn', () => assert.ok(scrub('al\u200bex@example.org').report.warnings.includes('HIDDEN_CHARACTERS')));
test('pseudonyms are linkable', () => assert.ok(scrub('hello', { mode: 'pseudonym' }).report.warnings.includes('PSEUDONYMS_ARE_LINKABLE')));
test('plain text warning', () => assert.ok(scrub('{}').report.warnings.includes('PLAIN_TEXT_OUTPUT')));
test('Luhn positive and negative', () => {
  assert.equal(isLuhn('4111111111111111'), true);
  for (const value of ['letters', '', '0000000000000000', '4111111111111112']) assert.equal(isLuhn(value), false);
});
test('IBAN positive and negative', () => {
  assert.equal(isIban('DE89 3704 0044 0532 0130 00'), true);
  assert.equal(isIban('DE88370400440532013000'), false); assert.equal(isIban('nonsense'), false);
});
for (const bad of [null, 5, {}, []]) test(`invalid text ${JSON.stringify(bad)}`, () => assert.throws(() => scrub(bad), TypeError));
for (const options of [null, [], 8, {mode:'bad'}, {categories:['BAD']}, {categories:'EMAIL'}, {customTerms:['']}, {customTerms:[' ']}, {customTerms:[5]}, {customTerms:['x'.repeat(513)]}, {customTerms:Array(201).fill('x')}]) test(`invalid options ${JSON.stringify(options).slice(0,55)}`, () => assert.throws(() => scrub('hello', options), TypeError));
test('UTF-8 byte limit', () => assert.throws(() => scrub('😀'.repeat(MAX_INPUT_BYTES / 4 + 1)), RangeError));
test('match cap fails closed', () => assert.throws(() => scrub('a@b.org '.repeat(MAX_FINDINGS + 1)), RangeError));
test('large plain text', () => assert.equal(scrub('x'.repeat(100_000)).text.length, 100_000));
test('span union invariants', () => {
  for (let length = 1; length < 60; length++) {
    const text = ('alpha@example.org banana 192.0.2.7 ').repeat(length), options = { customTerms: ['ana', 'alpha'] };
    const spans = detect(text, options);
    for (let i = 0; i < spans.length; i++) {
      assert.ok(spans[i].end > spans[i].start); assert.ok(spans[i].end <= text.length);
      if (i) assert.ok(spans[i].start >= spans[i - 1].end);
    }
    const result = scrub(text, options).text;
    for (const forbidden of ['@example.org', '192.0.2.7', 'ana']) assert.ok(!result.includes(forbidden));
  }
});
for (const size of [4097, 10000]) {
  const token = 'x'.repeat(size);
  for (const [name, input, expected] of [
    ['Bearer', `Bearer ${token}`, 'Bearer [SECRET]'],
    ['assignment', `password=${token}`, 'password=[SECRET]'],
    ['quoted', `password="${token}"`, 'password="[SECRET]"'],
    ['GitHub', `ghp_${token}`, '[SECRET]'],
    ['URL', `https://user:${token}@localhost/path`, 'https://[SECRET]@localhost/path'],
    ['JWT', `eyJxxxxx.${token}.${token}`, '[SECRET]'],
  ]) test(`long ${name} ${size}`, () => assert.equal(scrub(input).text, expected));
}
for (const [name, input, expected] of [
  ['double quote EOF', 'password="unfinished', 'password="[SECRET]'],
  ['single quote EOF', "password='unfinished", "password='[SECRET]"],
  ['quoted newline', 'password="unfinished\ncode=503', 'password="[SECRET]\ncode=503'],
  ['trailing backslash', 'password="unfinished' + '\\', 'password="[SECRET]'],
  ['hyphen suffix', 'sk-proj-' + 'a'.repeat(20) + '-xyz-', '[SECRET]'],
]) test(`incomplete secret ${name}`, () => assert.equal(scrub(input).text, expected));
