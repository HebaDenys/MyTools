// SPDX-License-Identifier: LicenseRef-MyTools-Personal-1.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { candidates, cleanup } from '../scripts/cleanup-branches.mjs';
const repository = 'HebaDenys/MyTools', head = 'a'.repeat(40), merge = 'b'.repeat(40);
const fixture = () => ({ repository, defaultBranch: 'main', branches: [{ name: 'feat/demo', commit: { sha: head }, protected: false }], open: [], closed: [{ number: 1, merged_at: '2026-10-06T00:00:00Z', merge_commit_sha: merge, base: { ref: 'main', repo: { full_name: repository } }, head: { ref: 'feat/demo', sha: head, repo: { full_name: repository } } }] });
test('unchanged heads of merged same-repo PRs are candidates, also with squash merges', () => assert.deepEqual(candidates(fixture()), [{ branch: 'feat/demo', head, merge, pr: 1 }]));
for (const [name, change] of [
  ['unmerged PR', f => { f.closed[0].merged_at = null; }],
  ['new commits after merge', f => { f.branches[0].commit.sha = 'c'.repeat(40); }],
  ['protected branch', f => { f.branches[0].protected = true; }],
  ['unknown protection', f => { delete f.branches[0].protected; }],
  ['foreign head repository', f => { f.closed[0].head.repo.full_name = 'other/fork'; }],
  ['foreign base repository', f => { f.closed[0].base.repo.full_name = 'other/fork'; }],
  ['merge into another base', f => { f.closed[0].base.ref = 'other'; }],
  ['missing merge evidence', f => { f.closed[0].merge_commit_sha = null; }],
  ['open head PR', f => { f.open = [structuredClone(f.closed[0])]; }],
  ['open dependent PR', f => { f.open = [{ base: { ref: 'feat/demo' } }]; }],
  ['default branch', f => { f.defaultBranch = 'feat/demo'; }],
]) test(`retain ${name}`, () => { const f = fixture(); change(f); assert.deepEqual(candidates(f), []); });
for (const name of ['main', 'master', 'dev', 'develop', 'qa', 'staging', 'production', 'prod', 'release/1', 'feat/a\ninjection']) test(`retain long-lived/unsafe branch ${JSON.stringify(name)}`, () => {
  const f = fixture(); f.branches[0].name = name; f.closed[0].head.ref = name; assert.deepEqual(candidates(f), []);
});
test('cleanup refuses non-main/untrusted invocation before requesting any credentials', async () => { await assert.rejects(cleanup({}), /UNAUTHORIZED_CONTEXT/); });
const hook = fileURLToPath(new URL('../.github/hooks/pre-push', import.meta.url));
const runHook = (line, ref = 'refs/heads/feat/demo', expected = head) => spawnSync(process.execPath, [hook], { input: line, encoding: 'utf8', env: { MYTOOLS_DELETE_REF: ref, MYTOOLS_DELETE_SHA: expected } });
const deletion = `(delete) ${'0'.repeat(40)} refs/heads/feat/demo ${head}\n`;
test('pre-push accepts only the exact deletion approved by the planner', () => assert.equal(runHook(deletion).status, 0));
test('pre-push rejects a branch that moved between REST inspection and Git advertisement', () => assert.equal(runHook(deletion, 'refs/heads/feat/demo', 'c'.repeat(40)).status, 1));
test('pre-push rejects another branch or multiple deletions', () => { assert.equal(runHook(deletion, 'refs/heads/other').status, 1); assert.equal(runHook(deletion + deletion).status, 1); });
test('pre-push rejects a normal or force-update payload', () => assert.equal(runHook(`refs/heads/new ${merge} refs/heads/feat/demo ${head}\n`).status, 1));

test('real git deletion uses the hook and retains a moved remote branch without force', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mytools-git-'));
  const run = (args, env = {}) => spawnSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
  const good = args => { const r = run(args); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  try {
    good(['init', '-b', 'main']); good(['config', 'user.name', 'Synthetic test']); good(['config', 'user.email', 'test@example.invalid']);
    writeFileSync(join(dir, 'fixture'), 'synthetic'); good(['add', '.']); good(['commit', '-m', 'baseline']);
    const first = good(['rev-parse', 'HEAD']); good(['init', '--bare', 'remote.git']); good(['remote', 'add', 'origin', join(dir, 'remote.git')]);
    good(['push', 'origin', 'HEAD:refs/heads/feat/demo']);
    const remove = () => run(['-c', `core.hooksPath=${fileURLToPath(new URL('../.github/hooks/', import.meta.url))}`, 'push', 'origin', ':refs/heads/feat/demo'], { MYTOOLS_DELETE_REF: 'refs/heads/feat/demo', MYTOOLS_DELETE_SHA: first });
    assert.equal(remove().status, 0); assert.equal(good(['ls-remote', '--heads', 'origin']), '');
    writeFileSync(join(dir, 'fixture'), 'new work'); good(['add', 'fixture']); good(['commit', '-m', 'unmerged work']);
    good(['push', 'origin', 'HEAD:refs/heads/feat/demo']);
    assert.notEqual(remove().status, 0); assert.ok(good(['ls-remote', '--heads', 'origin']).includes(good(['rev-parse', 'HEAD'])));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
