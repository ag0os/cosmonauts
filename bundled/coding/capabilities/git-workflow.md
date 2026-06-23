# Git Workflow

Before starting non-trivial implementation — and before kicking off any chain, Drive run, or coordinator — get the repo into a fit state:

- **Be on a feature branch.** If you're on `main` (or the repo's default branch), create one off it first. Chains, Drive runs, and workers create per-task commits; if the branch isn't set up, that work lands on `main`.
- **Have the working tree in shape.** Either the in-flight changes belong to this work and should be committed in logical, atomic groups first, or they're unrelated churn you leave untouched (don't stage or revert files you didn't change). Don't let a messy tree get swept into task commits.

Setting up the branch and committing in-flight work as part of an implementation run is *part of the job* — it doesn't conflict with "don't commit unless asked," which is about ad-hoc commits outside a run. Pushing, force-pushing, deleting branches, opening PRs, and reverting changes you didn't make still need explicit confirmation. Never `git reset --hard` / `git checkout --` / amend unless asked, and never touch `git config`.

For branch naming, decomposing changes into atomic commits, one-structural-change-per-commit, the commit and PR procedures, and rebase vs. merge, **load `/skill:git-workflow`**.
