# SPDX-License-Identifier: LicenseRef-MyTools-Personal-1.0
"""Optional UI regression suite. pip install playwright==1.57.0; playwright install chromium.
Default tests direct file opening. --in-memory is an explicit restricted-environment
fallback: it tests the built HTML, but NOT navigation or relative links.
"""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--in-memory', action='store_true')
parser.add_argument('--chromium')
parser.add_argument('--screenshots')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
html = root / 'dist' / 'TrueFlow.html'
checks = []

def check(name, condition):
    assert condition, name
    checks.append(name)

with sync_playwright() as p:
    launch = {'headless': True, 'args': ['--no-sandbox']}
    if args.chromium:
        launch['executable_path'] = args.chromium
    browser = p.chromium.launch(**launch)
    context = browser.new_context(viewport={'width': 1440, 'height': 1100}, locale='it-IT', accept_downloads=True)
    page = context.new_page()
    errors, requests = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: requests.append(request.url))
    if args.in_memory:
        page.set_content(html.read_text(encoding='utf-8'))
    else:
        page.goto(html.as_uri())
    check('Italian language detection', page.locator('html').get_attribute('lang') == 'it')
    page.locator('#demo').click()
    check('Demo run finishes', page.locator('#results').is_visible())
    check('Sample reconciliation totals', page.locator('#diff-metrics strong').all_text_contents() == ['1', '1', '1', '2'])
    check('Dedupe reduces A to four rows', page.locator('#preview tbody tr').count() == 4)
    check('IDs keep leading zeroes', page.locator('#preview tbody tr').first.locator('td').nth(1).inner_text() == '001')
    check('Unreviewed export is blocked', page.locator('#export-json').is_disabled())
    page.locator('#review').check()
    with page.expect_download() as info:
        page.locator('#export-json').click()
    output = json.loads(Path(info.value.path()).read_text())
    check('JSON download contains real full output', len(output) == 4 and output[0]['name'] == 'Sample A')
    with page.expect_download() as info:
        page.locator('#export-report').click()
    report = Path(info.value.path()).read_text()
    check('Diagnostic report excludes sample email values', 'example.invalid' not in report)
    check('Diagnostic report contains actual comparison', json.loads(report)['comparison']['summary']['changed'] == 1)
    page.locator('#preview-source').select_option('b')
    check('Switching output resets export review', page.locator('#export-json').is_disabled())
    check('B preview selects B records', '005' in page.locator('#preview').inner_text())
    page.locator('#input-a').fill('id,value\n1,x\n1,y')
    check('Input edit clears prior results immediately', not page.locator('#results').is_visible())
    page.locator('#reset-recipe').click()
    page.locator('#input-b').fill('id,value\n1,x')
    page.locator('#run').click()
    check('Ambiguous comparison blocks export', 'DUPLICATE_KEY' in page.locator('#status').inner_text() and page.locator('#export-json').is_disabled())
    page.locator('#clear').click()
    page.locator('#input-a').fill('id,value\n001, ABC \n002, DEF ')
    page.locator('#run').click()
    page.locator('#columns').select_option(['value'])
    page.locator('#operation').select_option('trim')
    page.locator('#add').click()
    check('Interactive recipe updates the preview', page.locator('#preview tbody tr').first.locator('td').nth(2).inner_text() == 'ABC')
    page.locator('#operation').select_option('lower')
    page.locator('#add').click()
    check('Multiple steps execute in order', page.locator('#preview tbody tr').first.locator('td').nth(2).inner_text() == 'abc')
    with page.expect_download() as info:
        page.locator('#save-recipe').click()
    check('Recipe download contains two steps, not source records', len(json.loads(Path(info.value.path()).read_text())['steps']) == 2)
    page.locator('#steps li').last.locator('button').last.click()
    page.locator('#run').click()
    check('Removing a step replays from the original', page.locator('#preview tbody tr').first.locator('td').nth(2).inner_text() == 'ABC')
    page.locator('#clear').click()
    page.locator('#file-a').set_input_files({'name': 'exact.json', 'mimeType': 'application/json', 'buffer': b'[{"id":900719925474099312345,"v":"001"}]'})
    expect(page.locator('#format-a')).to_have_value('json')
    page.locator('#run').click()
    check('Local JSON import preserves long integer', '900719925474099312345' in page.locator('#preview').inner_text())
    page.locator('#recipe-file').set_input_files({'name': 'bad.json', 'mimeType': 'application/json', 'buffer': b'{"format":"mytools.trueflow.recipe","version":1,"steps":[{"type":"eval","code":"alert(1)"}]}'})
    expect(page.locator('#status')).to_contain_text('UNKNOWN_OPERATION')
    check('Untrusted recipes cannot execute operations', not page.locator('#results').is_visible())
    page.locator('#clear').click()
    page.locator('#format-a').select_option('csv')
    payload = 'value\n"<img src=""https://example.invalid/x"" onerror=""window.pwned=true"">"'
    page.locator('#input-a').fill(payload)
    page.locator('#run').click()
    check('HTML-looking cells render only as text', page.locator('#preview img').count() == 0 and '<img' in page.locator('#preview').inner_text())
    check('No injected script executed', page.evaluate('typeof window.pwned') == 'undefined')
    page.locator('#input-a').fill('value\n"broken')
    page.locator('#run').click()
    check('Malformed CSV clears outputs and blocks export', 'CSV_UNCLOSED_QUOTE' in page.locator('#status').inner_text() and page.locator('#export-csv').is_disabled())
    # Delayed file read: edits must supersede a pending import.
    page.locator('#clear').click()
    page.evaluate('''() => { window.originalRead = File.prototype.arrayBuffer; File.prototype.arrayBuffer = async function() { const data = await window.originalRead.call(this); return new Promise(resolve => { window.finishRead = () => resolve(data); }); }; }''')
    page.locator('#file-a').set_input_files({'name': 'delayed.csv', 'mimeType': 'text/csv', 'buffer': b'value\nOLD_IMPORT'})
    for _ in range(100):
        if page.evaluate('typeof window.finishRead') == 'function':
            break
        page.wait_for_timeout(20)
    assert page.evaluate('typeof window.finishRead') == 'function', 'File read hook was not reached'
    page.locator('#input-a').fill('value\nNEW_EDIT')
    page.evaluate('window.finishRead()')
    page.wait_for_timeout(50)
    check('Late file imports cannot overwrite newer edits', page.locator('#input-a').input_value() == 'value\nNEW_EDIT')
    page.evaluate('() => { File.prototype.arrayBuffer = window.originalRead; }')
    for language in ['en', 'es', 'it']:
        page.locator('#language').select_option(language)
        page.locator('#demo').click()
        check(f'Demo remains functional in {language}', page.locator('#diff-metrics strong').all_text_contents() == ['1', '1', '1', '2'])
    if args.screenshots:
        target = Path(args.screenshots); target.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(target / 'TrueFlow-desktop.png'), full_page=True)
    page.set_viewport_size({'width': 390, 'height': 844})
    check('Mobile has no horizontal document overflow', page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
    check('Mobile primary action remains visible', page.locator('#run').is_visible())
    if args.screenshots:
        page.screenshot(path=str(Path(args.screenshots) / 'TrueFlow-mobile.png'), full_page=True)
    page.locator('#clear').click()
    check('Clear removes source data, recipe and results', not page.locator('#input-a').input_value() and page.locator('#steps li').count() == 0 and not page.locator('#results').is_visible())
    check('No JavaScript runtime exceptions', errors == [])
    check('No HTTP requests during the exercised workflows', not any(url.startswith(('https://', 'http://')) for url in requests))
    browser.close()
print(json.dumps({'passed': len(checks), 'mode': 'in-memory (navigation unverified)' if args.in_memory else 'direct file', 'checks': checks}, indent=2))
