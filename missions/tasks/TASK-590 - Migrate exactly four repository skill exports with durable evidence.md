---
id: TASK-590
title: Migrate exactly four repository skill exports with durable evidence
status: To Do
priority: high
labels:
  - backend
  - testing
  - devops
  - 'plan:harness-adapters'
dependencies:
  - TASK-589
createdAt: '2026-08-25T23:05:55.162Z'
updatedAt: '2026-08-25T23:05:55.162Z'
---

## Description

Implementation Order step 8a and the first live validation; prerequisite to the sole B-012 owner in step 8b, so this task does not claim a B marker. Files/outputs: `.claude/skills/plan`, `.claude/skills/roadmap`, `.claude/skills/skills-cli`, `.claude/skills/task`, `domains/shared/skills/skills-cli/SKILL.md`, `.gitignore`, `tests/skills/skills-cli.test.ts`, `scripts/validate-harness-exports.ts`, `tests/scripts/validate-harness-exports.test.ts`, and `missions/plans/harness-adapters/repo-export-validation-evidence.json`. A-001/AC-007/INV-002 and human D-003 plus D-014/D-015 are stop-and-escalate ground. This is the first live write: it must finish with durable complete evidence and a zero four-row selected check before personal bundle work can start. It may not modify, move, or delete the personal bundle or either actively used live Claude command.

<!-- AC:BEGIN -->
- [ ] #1 The project validation set is exactly `plan`, `roadmap`, `skills-cli`, and `task`; no fifth authorization exists, `playwright-cli` remains byte-intact and excluded, and every untraceable same-name target remains a permanent conflict.
- [ ] #2 Each of the four rows establishes exact D-015 historical byte lineage from a named git revision and source-relative path without executing project code, matching owner, asset ID, output path, and node shape; any failed proof halts with zero target/manifest migration writes and no force/adopt fallback.
- [ ] #3 All four authorizations and one project-owner `after-evidence` atomic-set journal are durable before staging, and targets are re-read under the single owner-root transaction lock before any move.
- [ ] #4 Pre-commit, partial backup/install, rolling-back, release-uncertain, and retry cases restore or resume the four-row set without losing any old byte; ambiguity or unconfirmed release halts before later live work.
- [ ] #5 The evidence file is written and re-read through `installed` receipt, pending clear with backups retained, four-row selected zero check, `checked`, exact backup cleanup, and `complete`; each row records historical/source/old/new digests, `(ownerId, assetId)` key, recovery outcome, receipt, check row, backup exit, and timestamp.
- [ ] #6 The native `domains/shared/skills/skills-cli/SKILL.md` replaces its stale path table with the D-011 read-only JSON harness-check instruction, and the migrated obsolete-path copy demonstrably comes from that corrected source; `tests/skills/skills-cli.test.ts` exists and asserts both that the native source carries no hand-authored harness path table and that the migrated copy is byte-derived from that corrected source.
- [ ] #7 Step 8a is complete only when durable project evidence and the zero selected check can be re-read after a fresh process; the personal bundle and both live command files remain byte-intact until later dependent tasks.
- [ ] #8 D-003 prerequisite, satisfied BEFORE the first project-scope owner-root transaction is prepared: `.gitignore` already contains `.agents/` and `.cosmonauts-harness-*`, so no lock, pending journal, stage, or retained `after-evidence` backup written under the repository root during 8a is ever untracked; `git status --porcelain` shows no such artifact at any quiescent point of the four-row migration, including on the AC #4 halt paths where backups are deliberately retained. (TASK-591 AC #6 then re-verifies the rule under a full default sync rather than introducing it.)
<!-- AC:END -->
