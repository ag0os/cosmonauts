---
id: COSMO-046
title: Update .gitignore and untrack work artifacts
status: Done
priority: high
assignee: worker
labels:
  - devops
  - 'plan:local-vs-shared'
dependencies: []
createdAt: '2026-03-06T14:48:50.245Z'
updatedAt: '2026-03-06T14:51:46.260Z'
---

## Description

Add `missions/`, `memory/`, `.cosmonauts/`, and `.claude/` to `.gitignore`. Then run `git rm --cached -r` to untrack existing files without deleting them locally. This is the foundational change that separates personal work artifacts from the shared repository.

Files to change:
- `.gitignore` — add the four directory patterns

Commands to run:
- `git rm --cached -r missions/` — untrack all mission files
- `git rm --cached -r memory/` — untrack all memory files  
- `git rm --cached -r .claude/` — untrack Pi local settings (if tracked)

Note: `git rm --cached` preserves local files but removes them from git tracking. Subsequent `git status` will show them as deleted from index.

<!-- AC:BEGIN -->
- [x] #1 `.gitignore` contains entries for `missions/`, `memory/`, `.cosmonauts/`, and `.claude/`
- [x] #2 Running `git status` shows no tracked files under `missions/`, `memory/`, or `.claude/`
- [x] #3 Local copies of `missions/`, `memory/`, and `.claude/` files still exist on disk after the operation
<!-- AC:END -->

## Implementation Notes

Verified all ACs against commit 346ce64:
- AC#1: .gitignore lines 8-11 contain missions/, memory/, .cosmonauts/, .claude/
- AC#2: `git ls-files --cached` returns empty for missions/, memory/, .claude/ — none tracked
- AC#3: All three directories exist on disk with contents (missions/ has archive/plans/reviews/tasks, memory/ has .md files, .claude/ present)
