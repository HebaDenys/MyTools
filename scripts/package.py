# SPDX-License-Identifier: LicenseRef-MyTools-Personal-1.0
"""Package an already-built offline app using only Python's standard library."""
import hashlib
import json
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
if not re.fullmatch(r'\d+\.\d+\.\d+', version):
    raise SystemExit('Expected a simple semantic version.')
dist = root / 'dist'
archive = dist / f'MyTools-v{version}.zip'
with ZipFile(archive, 'w', ZIP_DEFLATED) as bundle:
    for name in ['MyTools.html', 'TrueFlow.html', 'LICENSE', 'NOTICE', 'COMMERCIAL.md', 'SECURITY.md']:
        bundle.write(dist / name, name)
server_archive = dist / f'MyTools-server-v{version}.zip'
server_files = [
    'adapters/local/registry.mjs', 'adapters/local/mcp.mjs', 'adapters/local/http.mjs',
    'packages/truescrub/index.mjs', 'packages/essentials/index.mjs',
    'projects/trueflow/core.mjs', 'docs/ADAPTERS.md',
    'LICENSE', 'NOTICE', 'COMMERCIAL.md', 'SECURITY.md',
]
with ZipFile(server_archive, 'w', ZIP_DEFLATED) as bundle:
    for name in server_files:
        bundle.write(root / name, name)
    bundle.writestr('README.md', 'MyTools local server. Node.js 22+ required. Read docs/ADAPTERS.md.\n'
        'Run node adapters/local/mcp.mjs, or set MYTOOLS_API_TOKEN and run node adapters/local/http.mjs.\n'
        'Private personal use free; business/professional use requires a paid license. See LICENSE.\n')
artifacts = [dist / 'MyTools.html', dist / 'TrueFlow.html', archive, server_archive]
checksums = ''.join(f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n' for path in artifacts)
(dist / 'SHA256SUMS.txt').write_text(checksums, encoding='utf-8')
print(f'Packaged {archive.name}, {server_archive.name} and SHA256SUMS.txt')
