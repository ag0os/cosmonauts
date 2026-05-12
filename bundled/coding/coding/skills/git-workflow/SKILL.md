---
name: git-workflow
description: Git hygiene for implementation work — feature branches and naming, decomposing changes into atomic commits, one-structural-change-per-commit, the commit and pull-request procedures, and rebase vs. merge. Use when starting a feature, committing, opening a PR, untangling a messy worktree, or shaping history before review. Do NOT load for read-only work or routine edits with no commit step.
---

# Git Workflow

## Feature branches

Implementation work happens on a feature branch, never directly on `main` / the default branch.

- If you're on the default branch when work starts, create a branch off it first.
- Name it for the work, not the mechanism: `add-refresh-token-rotation`, `fix-chain-timeout`, not `wip` or `cody-changes`. Match any existing convention in the repo's recent branch names.
- One branch per logical change set — the scope that will become one PR.
- Don't reuse a stale branch from unrelated past work; branch fresh from an up-to-date default branch.

## Atomic commits

A commit is the smallest change that makes sense on its own and keeps the build green. Decompose by intent, not by file:

- Separate **structural** changes (rename, move, extract, reformat) from **behavioral** changes. One structural change per commit; never mix structure and behavior in the same commit — it makes review and `git bisect` useless.
- A commit that adds a capability and the test that covers it belong together; an unrelated fix you noticed along the way is its own commit.
- Don't bundle "and also reformatted the file" into a feature commit. Reformatting is its own commit (ideally its own PR).
- If you've made a tangle of unrelated changes, stage them in groups (`git add -p`) and commit each group separately rather than one mega-commit. (`git add -i` interactive mode is not available — use `git add -p` or path args.)

Commit messages: 1–2 sentences, **why** not what, imperative mood. Check the recent `git log` for the repo's style. Scan the diff for secrets before committing.

## Committing — procedure

When committing (as part of a run, or when asked):

1. In parallel: `git status`, `git diff` (staged + unstaged), `git log -n 10` (recent messages for style).
2. Decide the commit boundaries (see "Atomic commits"). Draft each message. Check for sensitive data.
3. In parallel: stage the relevant paths, create the commit.
4. If a pre-commit hook fails, retry once to fold in any automated changes the hook made. If it still fails, stop and report.

Rules: never `git config`; never push unless explicitly asked; never `git -i` (interactive mode unsupported); don't create an empty commit if there are no changes; don't amend unless asked.

## Pull requests — procedure

When asked to open a PR:

1. In parallel: `git status`, `git diff`, remote-tracking check, `git log` + `git diff <base>...HEAD`.
2. Analyze **all** commits on the branch, not just the latest, for the description.
3. In parallel: create the branch if needed, push with `-u`, create the PR via `gh pr create`.
4. Return the PR URL.

Confirm the PR title and body with the user before creating it — anything that goes to other people is theirs to approve. Never push or open a PR without an explicit request.

## Rebase vs. merge

- Keep a feature branch current by **rebasing onto** the updated default branch (`git rebase main`) when the branch is yours and unpushed or only you use it — it keeps history linear and reviewable.
- Don't rewrite history that others may have pulled. If the branch is shared, merge the default branch in instead.
- Interactive rebase (`git rebase -i`) for tidying local history is fine *before* a branch is shared — but the interactive editor isn't available in this environment, so do reshaping by other means (soft resets, cherry-picks) or hand it to the user.
- Resolve conflicts by understanding both sides; don't blindly take one. After resolving, re-run tests before continuing the rebase.

## Untangling a messy worktree

- Unrelated changes in files you didn't touch: leave them. Don't stage, don't revert.
- Your own WIP that spans several logical changes: split with `git add -p` into separate commits.
- Need a clean base but want to keep the WIP: `git stash` (or commit on a scratch branch), branch fresh, then reapply.
- Never `git reset --hard` or `git checkout -- <path>` to "clean up" unless the user asked — it destroys work irreversibly.
