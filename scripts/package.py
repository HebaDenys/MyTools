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
artifacts = [dist / 'MyTools.html', dist / 'TrueFlow.html', archive]
checksums = ''.join(f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n' for path in artifacts)
(dist / 'SHA256SUMS.txt').write_text(checksums, encoding='utf-8')
print(f'Packaged {archive.name} and SHA256SUMS.txt')
