---
id: TASK-323
title: Add plan artifact-conformance CLI command
status: Done
priority: medium
labels:
  - api
  - backend
  - testing
  - 'plan:artifact-conformance-gate'
dependencies:
  - TASK-322
createdAt: '2026-05-22T15:56:01.319Z'
updatedAt: '2026-05-22T16:31:36.249Z'
---

## Description

Add `cosmonauts plan check-artifacts <slug>` and register it in the plan CLI. Owns seams `cli/plans/commands/check-artifacts.ts`, `cli/plans/index.ts`, `lib/plans/plan-manager.ts` usage, plus tests `tests/cli/plans/commands/check-artifacts.test.ts` and `tests/cli/plans/subcommand.test.ts`. Tests must carry markers `@cosmo-behavior plan:artifact-conformance-gate#B-009`, `#B-010`, and `#B-011`. Source AC: AC-009. Named tests: `prints successful conformance output in human plain and json modes`; `prints conformance failures in human plain and json modes and exits non-zero`; `reports invalid slug and missing plan diagnostics before scanning artifacts`.

<!-- AC:BEGIN -->
- [ ] #1 B-009 / AC-009: `cosmonauts plan check-artifacts <slug>` reports successful conformance in human, plain, and JSON modes, emits structured results in JSON mode, and exits zero.
- [ ] #2 B-010 / AC-009: Conformance failures are reported in human, plain, and JSON modes with actionable issue evidence and non-zero exit status.
- [ ] #3 B-011 / AC-009: Invalid slugs and missing `missions/plans/<slug>/plan.md` files use normal CLI diagnostics for the requested output mode, perform no artifact scan, and exit non-zero.
- [ ] #4 The command uses `process.cwd()` as project root, validates slug with existing `validateSlug()`, reads only `missions/plans/<slug>/plan.md`, and does not scan archived plans or all active plans.
- [ ] #5 Plain output includes stable one-line success and per-issue failure lines; human output gives compact summary and bullet issues as planned.
- [ ] #6 The plan subcommand registration test recognizes `check-artifacts`, and the named CLI tests for B-009 through B-011 pass with required `@cosmo-behavior` markers.
<!-- AC:END -->
