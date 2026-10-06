// SPDX-License-Identifier: LicenseRef-MyTools-Personal-1.0
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const withoutExports = text => text.replace(/^export /gm, '');
const wrapped = (text, names) => `(() => {\n${withoutExports(text)}\nreturn { ${names} };\n})()`;
const scrubNames = 'scrub';
const essentialsNames = 'formatJson, encodeBase64, decodeBase64, cleanLink, deduplicateLines, textStats, generatePassword, sha256, FILE_LIMIT';
const app = (await read('apps/toolbox/app.mjs')).replace(/^import .* from ['"][^'"]+['"];\n/gm, '');
if (/^import /m.test(app)) throw new Error('Unsupported import in browser entry.');
const script = `'use strict';\n(() => {\nconst { ${scrubNames} } = ${wrapped(await read('packages/truescrub/index.mjs'), scrubNames)};\nconst { ${essentialsNames} } = ${wrapped(await read('packages/essentials/index.mjs'), essentialsNames)};\n${withoutExports(await read('apps/toolbox/i18n.mjs'))}\n${app}\n})();\n`;
const css = await read('apps/toolbox/styles.css');
if (/<\/script/i.test(script) || /<\/style/i.test(css)) throw new Error('Unsafe inline closing tag.');
const hash = text => createHash('sha256').update(text).digest('base64');
const csp = `default-src 'none'; script-src 'sha256-${hash(script)}'; style-src 'sha256-${hash(css)}'; connect-src 'none'; img-src data:; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
const license = (await read('LICENSE')).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const template = await read('apps/toolbox/index.html');
const values = { __CSP__: csp, __STYLE__: css, __LICENSE__: license, __SCRIPT__: script };
const html = template.replace(/__CSP__|__STYLE__|__LICENSE__|__SCRIPT__/g, key => values[key]);
await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/MyTools.html', root), html);
for (const name of ['LICENSE', 'NOTICE', 'COMMERCIAL.md', 'SECURITY.md']) await copyFile(new URL(name, root), new URL(`dist/${name}`, root));
console.log('Built dist/MyTools.html and licensing documents.');

// Independent project: share licensing/build guarantees, not application state.
const flowNames = 'LIMITS, parseData, profile, emptyRecipe, readRecipe, validateRecipe, runRecipe, reconcile, exportCSV, exportJSON';
const flowApp = (await read('projects/trueflow/app.mjs')).replace(/^import .* from ['"][^'"]+['"];\n/gm, '');
if (/^import /m.test(flowApp)) throw new Error('Unsupported TrueFlow import.');
const flowScript = `'use strict';\n(() => {\nconst { ${flowNames} } = ${wrapped(await read('projects/trueflow/core.mjs'), flowNames)};\n${withoutExports(await read('projects/trueflow/i18n.mjs'))}\n${flowApp}\n})();\n`;
const flowCss = await read('projects/trueflow/styles.css');
if (/<\/script/i.test(flowScript) || /<\/style/i.test(flowCss)) throw new Error('Unsafe TrueFlow inline closing tag.');
const flowCsp = `default-src 'none'; script-src 'sha256-${hash(flowScript)}'; style-src 'sha256-${hash(flowCss)}'; connect-src 'none'; img-src data:; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
const flowValues = { __CSP__: flowCsp, __STYLE__: flowCss, __LICENSE__: license, __SCRIPT__: flowScript };
await writeFile(new URL('dist/TrueFlow.html', root), (await read('projects/trueflow/index.html')).replace(/__CSP__|__STYLE__|__LICENSE__|__SCRIPT__/g, key => flowValues[key]));
console.log('Built dist/TrueFlow.html.');
