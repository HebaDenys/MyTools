// SPDX-License-Identifier: LicenseRef-MyTools-Personal-1.0
import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
async function walk(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (['.git', 'dist', 'node_modules'].includes(entry.name)) continue;
    const target = `${path}/${entry.name}`;
    if (entry.isDirectory()) await walk(target);
    else if (entry.name.endsWith('.mjs')) {
      const result = spawnSync(process.execPath, ['--check', target], { stdio: 'inherit' });
      if (result.status !== 0) throw new Error(`Syntax check failed: ${entry.name}`);
      if (!(await readFile(target, 'utf8')).includes('SPDX-License-Identifier: LicenseRef-MyTools-Personal-1.0')) throw new Error(`Missing license marker: ${entry.name}`);
    }
  }
}
await walk(root);
console.log('JavaScript syntax and license markers checked.');
