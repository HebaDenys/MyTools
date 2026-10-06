# SPDX-License-Identifier: LicenseRef-MyTools-Personal-1.0
"""Verify the already-built release server ZIP, using only the standard library.
Run npm run build && npm run package first. Does not install dependencies.
"""
import hashlib
import http.client
import json
import re
import subprocess
import tempfile
import os
from pathlib import Path
from zipfile import ZipFile

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text())['version']
archive = root / 'dist' / f'MyTools-server-v{version}.zip'
checks = []

def check(name, condition):
    if not condition:
        raise AssertionError(name)
    checks.append(name)

for line in (root / 'dist' / 'SHA256SUMS.txt').read_text().splitlines():
    digest, name = line.split('  ', 1)
    check(f'Artifact checksum: {name}', hashlib.sha256((root / 'dist' / name).read_bytes()).hexdigest() == digest)

with tempfile.TemporaryDirectory(prefix='mytools-package-') as directory:
    target = Path(directory)
    with ZipFile(archive) as bundle:
        check('Archive is valid and paths stay inside package', bundle.testzip() is None and all(not Path(n).is_absolute() and '..' not in Path(n).parts for n in bundle.namelist()))
        bundle.extractall(target)
    check('Exact license and commercial terms included', all((target / name).read_bytes() == (root / name).read_bytes() for name in ['LICENSE', 'COMMERCIAL.md', 'NOTICE']))
    messages = [
        {'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {'protocolVersion': '2025-11-25', 'capabilities': {}, 'clientInfo': {'name': 'package-test', 'version': '1'}}},
        {'jsonrpc': '2.0', 'method': 'notifications/initialized'},
        {'jsonrpc': '2.0', 'id': 2, 'method': 'tools/list'},
        {'jsonrpc': '2.0', 'id': 3, 'method': 'tools/call', 'params': {'name': 'trueflow_run', 'arguments': {'source': {'text': 'id,value\n001,synthetic'}, 'outputFormat': 'json'}}},
    ]
    result = subprocess.run(['node', 'adapters/local/mcp.mjs'], input=''.join(json.dumps(m) + '\n' for m in messages), text=True, capture_output=True, timeout=10, cwd=target)
    check('Packaged MCP launches without installation or extra logs', result.returncode == 0 and result.stderr == '')
    replies = [json.loads(line) for line in result.stdout.splitlines()]
    check('Packaged MCP discovers all operations', len(replies[1]['result']['tools']) == 10)
    check('Packaged MCP executes complete TrueFlow export', json.loads(replies[2]['result']['structuredContent']['text']) == [{'id': '001', 'value': 'synthetic'}])
    # Synthetic credential is only for the ephemeral test server, never persisted.
    token = 'synthetic_package_test_' * 3
    process = subprocess.Popen(['node', 'adapters/local/http.mjs'], cwd=target, env={**os.environ, 'MYTOOLS_API_TOKEN': token, 'MYTOOLS_API_PORT': '0'}, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        line = process.stderr.readline()
        match = re.search(r'http://127\.0\.0\.1:(\d+)', line)
        check('Packaged API launches with loopback address and without printing token', match is not None and token not in line)
        port = int(match.group(1))
        connection = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
        connection.request('GET', '/v1/tools')
        response = connection.getresponse()
        check('Packaged API refuses requests without token', response.status == 401)
        response.read(); connection.close()
        connection = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
        connection.request('POST', '/v1/tools/trueflow_run', json.dumps({'source': {'text': 'id,value\n001,synthetic'}}), {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
        response = connection.getresponse(); body = json.loads(response.read()); connection.close()
        check('Packaged API executes actual TrueFlow output', response.status == 200 and json.loads(body['result']['text']) == [{'id': '001', 'value': 'synthetic'}])
    finally:
        process.terminate()
        try:
            stdout, stderr = process.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill(); stdout, stderr = process.communicate(timeout=5)
        check('Packaged API does not log payloads or credentials', stdout == '' and token not in stderr and '001' not in stderr)
print(json.dumps({'passed': len(checks), 'checks': checks}, indent=2))
