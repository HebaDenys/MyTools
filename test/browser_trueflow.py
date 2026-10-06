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

def wait_hook(page, name):
    # wait_for_function's internal string eval is disallowed by the app CSP.
    # Poll the explicit test hook without weakening that CSP.
    for _ in range(100):
        if page.evaluate(f'typeof window.{name}') == 'function':
            return
        page.wait_for_timeout(20)
    raise AssertionError('File-read hook was not reached')

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
    # Schema mapping: B columns align before recipes; unmatched columns block export.
    page.locator('#clear').click()
    page.locator('#format-a').select_option('csv')
    page.locator('#format-b').select_option('csv')
    page.locator('#input-a').fill('id,name\n001, A \n002,B')
    page.locator('#input-b').fill('customer_id,label\n001,A\n003,C')
    page.locator('#run').click()
    page.locator('#mapping-panel summary').click()
    page.locator('#mapping-enabled').check()
    check('Mapping shows unmatched headers and blocks stale exports', 'customer_id' in page.locator('#mapping-summary').inner_text() and page.locator('#export-json').is_disabled())
    page.locator('#mapping-column-0').select_option('customer_id')
    check('Partial mappings never silently discard a column', 'label' in page.locator('#mapping-summary').inner_text() and not page.locator('#results').is_visible())
    page.locator('#mapping-column-1').select_option('label')
    page.locator('#columns').select_option(['name'])
    page.locator('#operation').select_option('trim')
    page.locator('#add').click()
    page.locator('#compare-key').select_option('id')
    check('Mapped comparison uses canonical names before recipe', page.locator('#diff-metrics strong').all_text_contents() == ['1', '1', '0', '1'])
    with page.expect_download() as info:
        page.locator('#save-mapping').click()
    mapping_bytes = Path(info.value.path()).read_bytes()
    saved_mapping = json.loads(mapping_bytes)
    check('Saved mapping contains exact column pairs but not records', saved_mapping['columns'] == [{'before': 'id', 'after': 'customer_id'}, {'before': 'name', 'after': 'label'}] and b'001' not in mapping_bytes)
    page.locator('#preview-source').select_option('b')
    page.locator('#review').check()
    with page.expect_download() as info:
        page.locator('#export-json').click()
    check('Mapped B download contains full canonical records', json.loads(Path(info.value.path()).read_text()) == [{'id': '001', 'name': 'A'}, {'id': '003', 'name': 'C'}])
    with page.expect_download() as info:
        page.locator('#export-report').click()
    report = json.loads(Path(info.value.path()).read_text())
    check('Mapping correspondence is included in value-free report', report['schemaMapping']['pairs'] == saved_mapping['columns'] and '001' not in json.dumps(report))
    page.locator('#mapping-column-1').select_option('')
    check('Mapping edits immediately invalidate review and outputs', page.locator('#export-json').is_disabled() and not page.locator('#results').is_visible())
    page.locator('#mapping-file').set_input_files({'name': 'mapping.json', 'mimeType': 'application/json', 'buffer': mapping_bytes})
    expect(page.locator('#results')).to_be_visible()
    check('Mapping reimport reproduces the comparison', page.locator('#diff-metrics strong').all_text_contents() == ['1', '1', '0', '1'])
    if args.screenshots:
        target = Path(args.screenshots); target.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(target / 'TrueFlow-mapping-desktop.png'), full_page=True)
        page.set_viewport_size({'width': 390, 'height': 844})
        page.screenshot(path=str(target / 'TrueFlow-mapping-mobile.png'), full_page=True)
        page.set_viewport_size({'width': 1440, 'height': 1100})
    page.set_viewport_size({'width': 390, 'height': 844})
    check('Mapping editor has no mobile horizontal overflow', page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
    page.set_viewport_size({'width': 1440, 'height': 1100})
    page.locator('#input-b').fill('customer_id,label,extra\n001,A,PRIVATE_CELL')
    page.locator('#run').click()
    check('Unexpected B column is named without exposing cell values in diagnostic', 'extra' in page.locator('#mapping-summary').inner_text() and 'PRIVATE_CELL' not in page.locator('#mapping-summary').inner_text() and page.locator('#export-json').is_disabled())
    # A pending import must not resurrect a cleared mapping or its results.
    page.evaluate("""() => { window.originalRead = File.prototype.arrayBuffer; File.prototype.arrayBuffer = async function() { const data = await window.originalRead.call(this); return new Promise(resolve => { window.finishMapping = () => resolve(data); }); }; }""")
    page.locator('#mapping-file').set_input_files({'name': 'delayed.json', 'mimeType': 'application/json', 'buffer': mapping_bytes})
    wait_hook(page, 'finishMapping')
    page.locator('#clear').click()
    page.evaluate('window.finishMapping()')
    page.wait_for_timeout(50)
    check('Late mapping import cannot undo Clear', not page.locator('#mapping-enabled').is_checked() and page.locator('#mapping-columns select').count() == 0 and not page.locator('#results').is_visible())
    page.evaluate('() => { File.prototype.arrayBuffer = window.originalRead; }')
    page.locator('#input-a').fill('id,name\n001,A')
    page.locator('#run').click()
    page.evaluate("""() => { window.originalRead = File.prototype.arrayBuffer; File.prototype.arrayBuffer = async function() { const data = await window.originalRead.call(this); return new Promise(resolve => { window.finishInvalidRead = () => resolve(data); }); }; }""")
    page.locator('#file-a').set_input_files({'name': 'invalid.csv', 'mimeType': 'text/csv', 'buffer': bytes([255])})
    wait_hook(page, 'finishInvalidRead')
    page.locator('#run').click()
    check('Old input can be inspected while file read is pending', page.locator('#results').is_visible())
    page.evaluate('window.finishInvalidRead()')
    expect(page.locator('#status')).to_contain_text('UTF8_REQUIRED')
    check('Failed late source import clears stale results and mapping', not page.locator('#results').is_visible() and page.locator('#mapping-columns select').count() == 0 and page.locator('#export-json').is_disabled())
    page.evaluate('() => { File.prototype.arrayBuffer = window.originalRead; }')
    # Failed validation is inspectable even beyond the normal 30-record preview.
    page.locator('#clear').click()
    page.locator('#format-a').select_option('csv')
    page.locator('#format-b').select_option('csv')
    original = 'id,name\n' + ''.join(f'{i:03d},Sample\n' for i in range(40)) + '001,PRIVATE_VALUE\n,PRIVATE_EMPTY\n'
    page.locator('#input-a').fill(original)
    page.locator('#input-b').fill('id,name\n001,Sample')
    page.locator('#run').click()
    page.locator('#compare-key').select_option('id')
    check('Conflict panel identifies duplicates beyond the normal preview', page.locator('#validation-panel').is_visible() and page.locator('#validation-issues tbody tr').count() == 2 and '42' in page.locator('#validation-issues').inner_text())
    check('Validation keeps original input unchanged and all data exports blocked', page.locator('#input-a').input_value() == original and not page.locator('#results').is_visible() and all(page.locator('#' + id).is_disabled() for id in ['export-json', 'export-csv', 'export-report']))
    check('Diagnostic UI does not show private cell values', 'PRIVATE_' not in page.locator('#validation-panel').inner_text())
    with page.expect_download() as info:
        page.locator('#export-validation').click()
    diagnostic_text = Path(info.value.path()).read_text()
    diagnostic = json.loads(diagnostic_text)
    check('Real diagnostic download contains original conflict positions only', diagnostic['totalIssues'] == 2 and diagnostic['issues'][0]['record'] == 42 and diagnostic['issues'][0]['firstRecord'] == 3 and 'PRIVATE_' not in diagnostic_text)
    page.locator('#language').select_option('es')
    check('Conflict guidance is translated without discarding diagnostic state', 'Registros que bloquean' in page.locator('#validation-title').inner_text() and page.locator('#validation-issues tbody tr').count() == 2)
    page.locator('#validation-issues').focus()
    check('Conflict table is keyboard-focusable', page.evaluate("document.activeElement.id") == 'validation-issues')
    if args.screenshots:
        target = Path(args.screenshots); target.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(target / 'TrueFlow-conflicts-desktop.png'), full_page=True)
    page.set_viewport_size({'width': 390, 'height': 844})
    check('Conflict panel fits a mobile viewport', page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
    if args.screenshots:
        page.screenshot(path=str(target / 'TrueFlow-conflicts-mobile.png'), full_page=True)
    page.set_viewport_size({'width': 1440, 'height': 1100})
    page.locator('#input-a').fill('id,name\n001,Repaired\n002,Sample')
    check('Editing input clears conflict details and disables their export', not page.locator('#validation-panel').is_visible() and page.locator('#export-validation').is_disabled() and page.locator('#validation-issues').inner_text() == '')
    page.locator('#run').click()
    page.locator('#review').check()
    with page.expect_download() as info:
        page.locator('#export-json').click()
    check('Correcting conflicts completes an actual reviewed data export', json.loads(Path(info.value.path()).read_text())[0]['name'] == 'Repaired')
    # A pending failed recipe import must invalidate both output and diagnostics
    # produced while that file was still being read (not only on import start).
    page.evaluate("() => { window.originalRead = File.prototype.arrayBuffer; File.prototype.arrayBuffer = async function() { await window.originalRead.call(this); return new Promise((_, reject) => { window.failRecipeRead = () => reject(new Error('synthetic')); }); }; }")
    page.locator('#recipe-file').set_input_files({'name': 'delayed-recipe.json', 'mimeType': 'application/json', 'buffer': b'{}'})
    wait_hook(page, 'failRecipeRead')
    page.locator('#run').click()
    page.locator('#review').check()
    page.evaluate('window.failRecipeRead()')
    expect(page.locator('#status')).to_contain_text('UTF8_REQUIRED')
    check('Late failed recipe read cannot leave results exportable', not page.locator('#results').is_visible() and page.locator('#export-json').is_disabled())
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
