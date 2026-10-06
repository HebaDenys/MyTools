// SPDX-License-Identifier: LicenseRef-MyTools-Personal-1.0
import { scrub } from '../../packages/truescrub/index.mjs';
import { formatJson, encodeBase64, decodeBase64, cleanLink, deduplicateLines, textStats, generatePassword, sha256, FILE_LIMIT } from '../../packages/essentials/index.mjs';
import { TOOLS, TRANSLATIONS } from './i18n.mjs';
const $ = id => document.getElementById(id);
let language = 'en', selected = 'scrub', revision = 0, complete = false;
const t = key => TRANSLATIONS[language][key];
function exportState() {
  const permitted = complete && (selected !== 'scrub' || $('review').checked);
  $('copy').disabled = !permitted; $('download').disabled = !permitted;
}
function invalidate() {
  revision++; complete = false;
  $('output').value = ''; $('review').checked = false; $('review').disabled = true;
  $('status').textContent = ''; $('status').classList.remove('error'); $('run').disabled = false;
  exportState();
}
function clearAll() { invalidate(); $('input').value = ''; $('terms').value = ''; $('file').value = ''; }
function operationView() {
  const fileMode = selected === 'hash' && $('operation').value === 'hashFile';
  $('file-wrap').hidden = !fileMode;
  $('input-wrap').hidden = selected === 'password' || fileMode;
  $('sample').hidden = selected === 'password' || fileMode;
}
function renderCatalog() {
  const fragment = document.createDocumentFragment(), query = $('search').value.trim().toLocaleLowerCase(language);
  let shown = 0;
  for (const [index, tool] of TOOLS.entries()) {
    if (!(t(tool.id + 'Name') + ' ' + t(tool.id + 'Description')).toLocaleLowerCase(language).includes(query)) continue;
    const button = document.createElement('button'), number = document.createElement('span'), name = document.createElement('span');
    button.type = 'button'; button.className = 'tool'; button.dataset.tool = tool.id;
    button.setAttribute('aria-pressed', String(tool.id === selected));
    number.className = 'tool-number'; number.textContent = String(index + 1).padStart(2, '0');
    name.textContent = t(tool.id + 'Name'); button.append(number, name);
    button.addEventListener('click', () => {
      selected = tool.id; renderTool(); $('tool-title').focus({ preventScroll: true });
    });
    fragment.append(button); shown++;
  }
  $('catalog').replaceChildren(fragment); $('catalog').setAttribute('aria-label', t('catalog')); $('no-results').hidden = shown !== 0;
}
function renderTool() {
  clearAll();
  const index = TOOLS.findIndex(tool => tool.id === selected), tool = TOOLS[index];
  $('tool-title').textContent = t(selected + 'Name'); $('tool-title').tabIndex = -1;
  $('tool-number').textContent = `${String(index + 1).padStart(2, '0')} / 07`;
  $('tool-description').textContent = t(selected + 'Description'); $('warning').textContent = t(selected + 'Warning');
  $('operation').replaceChildren(...tool.actions.map(action => {
    const option = document.createElement('option'); option.value = action; option.textContent = t(action); return option;
  }));
  $('custom-wrap').hidden = selected !== 'scrub'; $('review-wrap').hidden = selected !== 'scrub';
  $('status').textContent = t('ready'); operationView(); renderCatalog();
}
function setLanguage(value) {
  language = Object.hasOwn(TRANSLATIONS, value) ? value : 'en';
  document.documentElement.lang = language; $('language').value = language;
  for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n);
  renderTool();
}
$('language').addEventListener('change', event => setLanguage(event.target.value));
$('search').addEventListener('input', renderCatalog);
$('operation').addEventListener('change', () => { invalidate(); operationView(); });
for (const id of ['input', 'terms']) $(id).addEventListener('input', invalidate);
$('file').addEventListener('change', invalidate);
$('review').addEventListener('change', exportState);
$('clear').addEventListener('click', clearAll);
$('sample').addEventListener('click', () => {
  clearAll();
  const examples = {
    scrub: 'Contact Example Person at alex@example.org\nAuthorization: Bearer synthetic-token-only\nhost=192.0.2.42',
    json: '{"message":"Hello","id":900719925474099312345,"items":[1,2,3]}',
    base64: $('operation').value === 'decode' ? 'SG9sYSDwn5iA' : 'Hola 😀',
    link: 'https://example.org/article?id=42&utm_source=newsletter&fbclid=example#section',
    text: 'One line\nAnother line\nOne line\nUnicode: café 😀', hash: 'abc',
  };
  $('input').value = examples[selected] ?? '';
  if (selected === 'scrub') $('terms').value = 'Example Person';
});
$('run').addEventListener('click', async () => {
  invalidate(); const current = revision, action = $('operation').value;
  $('run').disabled = true; $('status').textContent = t('busy');
  try {
    let output, status = t('done'); const input = $('input').value;
    if (selected === 'scrub') {
      const result = scrub(input, { mode: action, customTerms: $('terms').value.split(/\r?\n/).filter(term => term.trim()) });
      output = result.text; status = `${result.report.matches} ${t('matches')}`;
      if (result.report.warnings.includes('HIDDEN_CHARACTERS')) status += ' ' + t('hidden');
    } else if (selected === 'json') output = formatJson(input, action === 'pretty');
    else if (selected === 'base64') output = action === 'encode' ? encodeBase64(input) : decodeBase64(input);
    else if (selected === 'link') output = cleanLink(input);
    else if (selected === 'text') output = action === 'count' ? JSON.stringify(textStats(input), null, 2) : deduplicateLines(input);
    else if (selected === 'password') output = generatePassword();
    else if (selected === 'hash') {
      if (action === 'hashFile') {
        const file = $('file').files[0];
        if (!file) { $('status').textContent = t('noFile'); return; }
        if (file.size > FILE_LIMIT) throw new RangeError('File size limit.');
        output = await sha256(new Uint8Array(await file.arrayBuffer()));
      } else output = await sha256(input);
    }
    if (current !== revision) return;
    $('output').value = output; complete = true; $('review').disabled = false;
    $('status').textContent = status; exportState();
  } catch {
    if (current !== revision) return;
    $('output').value = ''; complete = false; exportState();
    $('status').textContent = t('error'); $('status').classList.add('error');
  } finally { if (current === revision) $('run').disabled = false; }
});
$('copy').addEventListener('click', async () => {
  if ($('copy').disabled) return;
  const current = revision;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable.');
    await navigator.clipboard.writeText($('output').value);
    if (current === revision) $('status').textContent = t('copied');
  } catch {
    if (current !== revision) return;
    $('output').focus(); $('output').select(); $('status').textContent = t('manualCopy');
  }
});
$('download').addEventListener('click', () => {
  if ($('download').disabled) return;
  const url = URL.createObjectURL(new Blob([$('output').value], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = selected === 'json' ? 'mytools-result.json' : 'mytools-result.txt';
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('pagehide', clearAll);
window.addEventListener('pageshow', event => { if (event.persisted) clearAll(); });
setLanguage(navigator.language?.slice(0, 2) ?? 'en');
