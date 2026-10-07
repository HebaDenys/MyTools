# Merged branch maintenance

Requested by Denys on 6 October 2026. The versioned `Clean merged branches`
workflow runs on every push to `main`, including PR merges, and can be dispatched
manually. It sweeps historical merged PRs too. It does not change repository
visibility, protection rules or the native `delete_branch_on_merge` setting.

Only an unchanged, unprotected head of a merged PR into this repository's `main`
is eligible. The merge commit must remain an ancestor of the checked-out main.
Heads/base branches referenced by open PRs, foreign forks, default/long-lived
branches, branches with new commits and incomplete listings are retained.
Squash merges are supported through the merged PR's recorded head and merge SHA.

A dedicated pre-push hook checks the Git server's advertised SHA against the
approved SHA immediately before a deletion. Git then performs the receive-pack
old-SHA check atomically. No force push or history rewrite is used. The hook is
selected only by the cleanup command; it is not installed in developers' clones.
The workflow's ephemeral GitHub token is never written to disk or printed.

Deletion removes a remote branch reference, not PR discussions or merged history.
Local clones are not touched. Reused branches should have new commits; a branch
recreated at the exact already-merged SHA remains eligible. Open-PR state is
refreshed immediately before each deletion; GitHub does not offer a transaction
combining that PR check with a Git ref deletion. Do not recycle merged names for
new PRs during a cleanup run.

The workflow is not an administrator setting: events suppressed by GitHub's
workflow-token recursion rules require a later normal push or manual dispatch.
Protection/ruleset rejections cause failure rather than being bypassed. Test the
planner and guarded deletion with `node --test test/branch-cleanup.test.mjs`.

## Main-first owner workflow

Since 7 October 2026, routine first-party changes by Denys/authorized automation
should normally be developed and committed directly on `main` after local tests and
a fresh SHA check. Temporary branches and PRs are reserved for work that genuinely
needs isolation, external review, or cannot yet be integrated safely. This reduces
stale branch accumulation without weakening validation: every direct-main commit
still needs the relevant local checks before publication and GitHub CI verification
on the exact resulting SHA afterward.

External contributions still use PRs so the explicit CONTRIBUTING grant and review
can be verified. Existing stale branches are not evidence that their code belongs on
main: superseded/duplicate or known-buggy work must be reviewed and consciously
discarded or reimplemented, never blindly merged. The cleanup workflow remains
limited to verified merged PR heads; it does not become a generic branch-deletion
mechanism.
