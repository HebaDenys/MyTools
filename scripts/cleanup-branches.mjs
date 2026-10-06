// SPDX-License-Identifier: LicenseRef-MyTools-Personal-1.0
// Delete only unchanged heads of PRs verifiably merged into this repo's main.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
export function candidates({ repository, defaultBranch, branches, open, closed }) {
  const retained = new Set(open.flatMap(pr => [pr.base?.ref, pr.head?.repo?.full_name === repository ? pr.head?.ref : undefined]));
  return branches.flatMap(branch => {
    if (branch.protected !== false || branch.name === defaultBranch || retained.has(branch.name) || /^(?:main|master|dev|develop|qa|staging|production|prod)$|^release\//.test(branch.name) || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,150}$/.test(branch.name)) return [];
    const pr = closed.find(pr => pr.merged_at && pr.base?.ref === defaultBranch && pr.base?.repo?.full_name === repository && pr.head?.repo?.full_name === repository && pr.head?.ref === branch.name && pr.head?.sha === branch.commit?.sha && sha(pr.merge_commit_sha) && sha(pr.head.sha));
    return pr ? [{ branch: branch.name, head: pr.head.sha, merge: pr.merge_commit_sha, pr: pr.number }] : [];
  });
}
export async function cleanup(env = process.env) {
  const repository = 'HebaDenys/MyTools';
  if (env.GITHUB_REPOSITORY !== repository || env.GITHUB_REF !== 'refs/heads/main' || !['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME) || !env.GH_TOKEN) throw new Error('UNAUTHORIZED_CONTEXT');
  const get = async path => {
    const response = await fetch(`https://api.github.com/repos/${repository}${path}`, { headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`GITHUB_HTTP_${response.status}`);
    return response.json();
  };
  const all = async path => {
    const rows = [];
    for (let page = 1; page <= 20; page++) {
      const batch = await get(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      if (!Array.isArray(batch)) throw new Error('INVALID_GITHUB_RESPONSE');
      rows.push(...batch); if (batch.length < 100) return rows;
    }
    throw new Error('INCOMPLETE_LISTING'); // Never delete after a truncated search.
  };
  const repo = await get('');
  if (repo.default_branch !== 'main' || repo.archived) throw new Error('DEFAULT_BRANCH_CHANGED');
  const git = (args, extraEnv = {}) => spawnSync('git', args, { encoding: 'utf8', timeout: 30000, env: { ...env, ...extraEnv }, maxBuffer: 1024 * 1024 });
  const main = git(['rev-parse', 'HEAD']);
  if (main.status !== 0 || !sha(main.stdout.trim())) throw new Error('CHECKOUT_REQUIRED');
  const open = await all('/pulls?state=open');
  const closed = await all('/pulls?state=closed&sort=updated&direction=desc');
  const branches = await all('/branches');
  const planned = candidates({ repository, defaultBranch: 'main', branches, open, closed });
  let deleted = 0;
  for (const item of planned) {
    if (git(['merge-base', '--is-ancestor', item.merge, main.stdout.trim()]).status !== 0) continue;
    const current = await get(`/branches/${encodeURIComponent(item.branch)}`);
    const freshOpen = await all('/pulls?state=open');
    if (current.commit?.sha !== item.head || current.protected !== false || freshOpen.some(pr => pr.base?.ref === item.branch || (pr.head?.repo?.full_name === repository && pr.head?.ref === item.branch))) continue;
    // Git's pre-push hook checks the server-advertised old SHA. Git's receive-pack
    // then atomically compares that SHA when deleting. No --force or history rewrite.
    const result = git(['-c', `core.hooksPath=${resolve('.github/hooks')}`, 'push', `https://github.com/${repository}.git`, `:refs/heads/${item.branch}`], {
      MYTOOLS_DELETE_REF: `refs/heads/${item.branch}`, MYTOOLS_DELETE_SHA: item.head,
      GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
      GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${env.GH_TOKEN}`).toString('base64')}`,
    });
    if (result.status !== 0) throw new Error(`BRANCH_DELETE_FAILED_PR_${item.pr}`);
    console.log(`Deleted merged branch ${item.branch} (PR #${item.pr}, ${item.head}).`); deleted++;
  }
  console.log(`Deleted ${deleted} verified merged branches; other branches retained.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await cleanup(); }
  catch (error) { console.error(/^[A-Z0-9_]+$/.test(error.message) ? error.message : 'CLEANUP_FAILED'); process.exitCode = 1; }
}
