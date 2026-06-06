---
id: COSMO-051
title: Restore first-run workflow availability for fresh projects
status: Done
priority: high
assignee: worker
labels:
  - review-fix
  - 'review-round:1'
  - workflows
  - onboarding
dependencies: []
createdAt: '2026-03-06T15:10:04.404Z'
updatedAt: '2026-03-06T15:17:08.664Z'
---

## Description

Reviewer finding F-001 (round 1): removing built-in DEFAULT_WORKFLOWS broke fresh-project onboarding because `cosmonauts-tasks init` does not scaffold workflow config into target projects. New projects fail on `--workflow plan-and-build` and docs reference missing `.cosmonauts/config.example.json`.

<!-- AC:BEGIN -->
- [x] #1 Running `cosmonauts-tasks init` in an empty directory creates the project-level workflow config scaffold under `.cosmonauts/` (or an equivalent supported mechanism).
- [x] #2 A fresh initialized project can execute `cosmonauts --workflow plan-and-build "test"` without `Unknown workflow` errors.
- [x] #3 The documented setup flow in `README.md` and `AGENTS.md` matches the actual bootstrap behavior and requires no missing-file manual recovery.
- [x] #4 Automated tests cover the no-config bootstrap path and workflow resolution behavior for fresh projects.
<!-- AC:END -->

## Implementation Notes

Verified all 4 ACs by inspecting the implementation and running tests (24/24 pass).\n\nAC#1: `cli/tasks/commands/init.ts` calls `scaffoldProjectConfig(projectRoot)` which creates `.cosmonauts/config.json` with default workflows.\nAC#2: `lib/workflows/loader.ts` starts with `DEFAULT_WORKFLOWS` as a base, so `plan-and-build` resolves even without any config file.\nAC#3: README.md Getting Started shows `cosmonauts-tasks init` creating config automatically. AGENTS.md references built-in defaults in `lib/workflows/defaults.ts`. No manual copy steps remain.\nAC#4: `tests/config/scaffold.test.ts` (9 tests) and `tests/workflows/workflow-loader.test.ts` (15 tests) cover scaffolding, idempotency, no-overwrite, bootstrap path, and workflow resolution with/without config.
