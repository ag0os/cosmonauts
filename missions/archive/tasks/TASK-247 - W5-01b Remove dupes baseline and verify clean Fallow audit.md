---
id: TASK-247
title: 'W5-01b: Remove dupes baseline and verify clean Fallow audit'
status: Done
priority: medium
labels:
  - 'wave:5'
  - 'area:capstone'
  - 'plan:fallow-temp-exceptions-cleanup'
dependencies:
  - TASK-246
createdAt: '2026-04-29T14:01:50.875Z'
updatedAt: '2026-04-29T17:02:46.670Z'
---

## Description

Remove `audit.dupesBaseline` from `fallow.toml` and delete `.fallow/baselines/dupes.json`, then verify the full Fallow audit and suite pass with no baseline. Requires W5-01a residual cleanup to already be complete.

**Files:** modify `fallow.toml`; delete `.fallow/baselines/dupes.json`.

**Current state:** `fallow.toml:36` configures `audit.dupesBaseline = ".fallow/baselines/dupes.json"`; W5-01a has already cleaned residual duplicate clone groups.

**Target pattern:** no duplication baseline; keep permanent `entry` and `dynamicallyLoaded` arrays in `fallow.toml` untouched.

**Coverage status:** `existing-coverage-sufficient` after W5-01a; this task is configuration removal plus verification.

**TDD note:** no.

**Worker contract:**
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the change — all must be green.
- Verify no `// fallow-ignore-next-line complexity` comments remain in `cli`, `lib`, or `domains/shared/extensions/orchestration`.
- Commit the change as a single commit: `W5-01b: Remove dupes baseline and verify clean Fallow audit`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 5 / W5-01b

<!-- AC:BEGIN -->
- [ ] #1 .fallow/baselines/dupes.json is deleted.
- [ ] #2 audit.dupesBaseline is removed from fallow.toml, while entry and dynamicallyLoaded remain unchanged.
- [ ] #3 fallow audit passes without the duplication baseline file or config.
- [ ] #4 No // fallow-ignore-next-line complexity comments remain in cli, lib, or domains/shared/extensions/orchestration.
- [ ] #5 bun run test, bun run lint, and bun run typecheck are green.
<!-- AC:END -->

## Implementation Notes

Manual implementation in commit cc5671f (mechanical config removal — no code changes needed). Removed [audit] section and audit.dupesBaseline from fallow.toml; deleted .fallow/baselines/dupes.json. fallow audit now reports zero issues across 104 changed files without any baseline. All ACs satisfied (no suppressions remain in cli/lib/domains/shared/extensions/orchestration; entry and dynamicallyLoaded preserved).
