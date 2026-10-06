// SPDX-License-Identifier: LicenseRef-MyTools-Personal-1.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import { TOOLS, TRANSLATIONS } from '../apps/toolbox/i18n.mjs';
const root = new URL('../', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');
const html = await read('dist/MyTools.html');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
const css = html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
test('standalone script parses and has no module imports', () => {
  assert.ok(script); assert.doesNotThrow(() => new Script(script)); assert.doesNotMatch(script, /^import /m);
});
test('CSP hashes match exact inline script and style bytes', () => {
  for (const text of [script, css]) assert.ok(html.includes(`'sha256-${createHash('sha256').update(text).digest('base64')}'`));
  assert.ok(html.includes("connect-src 'none'")); assert.ok(html.includes("default-src 'none'"));
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval/);
});
test('no network, storage, eval, HTML injection or weak randomness APIs in app', () => {
  assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|Math\.random|\beval\s*\(|\.innerHTML/);
  assert.doesNotMatch(html, /<(?:script|iframe)[^>]+src=/i);
});
test('all seven tools have complete translations', () => {
  assert.equal(TOOLS.length, 7); assert.equal(new Set(TOOLS.map(tool => tool.id)).size, 7);
  const keys = Object.keys(TRANSLATIONS.en).sort();
  for (const language of ['en', 'it', 'es']) {
    assert.deepEqual(Object.keys(TRANSLATIONS[language]).sort(), keys);
    for (const tool of TOOLS) {
      for (const suffix of ['Name', 'Description', 'Warning']) assert.ok(TRANSLATIONS[language][tool.id + suffix]);
      for (const action of tool.actions) assert.ok(TRANSLATIONS[language][action]);
    }
  }
});
test('custom license is embedded and copied unchanged', async () => {
  assert.ok(html.includes('MyTools Personal Use License 1.0'));
  assert.ok(html.includes('BUSINESS AND PROFESSIONAL USE REQUIRES A PAID LICENSE'));
  for (const name of ['LICENSE', 'NOTICE', 'COMMERCIAL.md', 'SECURITY.md']) assert.equal(await read(`dist/${name}`), await read(name));
  assert.doesNotMatch(script, /SPDX-License-Identifier: PolyForm/);
});
test('build replaces every template placeholder', () => assert.doesNotMatch(html, /__CSP__|__STYLE__|__SCRIPT__|__LICENSE__/));
