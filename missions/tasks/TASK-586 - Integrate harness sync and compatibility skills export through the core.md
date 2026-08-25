---
id: TASK-586
title: Integrate harness sync and compatibility skills export through the core
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:harness-adapters'
dependencies:
  - TASK-585
createdAt: '2026-08-25T23:04:53.781Z'
updatedAt: '2026-08-25T23:04:53.781Z'
---

## Description

Implementation Order step 6 integration task; it supports but does not own B-004, B-006, or B-007. Files: `cli/harness/subcommand.ts`, `cli/main.ts`, `cli/skills/subcommand.ts`, `lib/skills/exporter.ts`, `lib/skills/index.ts`, `tests/cli/harness/subcommand.test.ts`, `tests/cli/main.test.ts`, `tests/cli/skills/subcommand.test.ts`, and `tests/skills/exporter.test.ts`. It consumes the already-tested core contracts without duplicating target, state, transaction, or discovery logic. D-004/D-007 and INV-002/INV-003/INV-005 are stop-and-escalate ground. No Drive/session hook, external native chain execution, root chain-list flag, memory/knowledge write, live migration, or live-command change is in scope.

<!-- AC:BEGIN -->
- [ ] #1 `cosmonauts harness sync` is registered with repeatable target/scope/kind/asset selectors, exclusive copy/link mode, read-only check, forget, transfer, JSON, and plain reporting exactly as Design §6 defines.
- [ ] #2 D-007 selector defaults and deduplication hold: omitted target selects supported Claude/Codex, descriptor scope defaults apply unless overridden, explicit assets imply partial reconciliation, and kind/asset filters isolate the requested catalogue rows.
- [ ] #3 Invalid forget/transfer/check/mode combinations fail before owner-root or manifest writes; command-resolving link requests preserve D-019's actionable pre-write rejection.
- [ ] #4 CLI rows expose owner diagnostics, source/target, recorded/requested mode, before reason, action/final state, recovery/evidence/discovery detail, and release warnings; normal/check exits preserve D-004's nonzero rules and check never calls transaction/materialization.
- [ ] #5 Every named and `--all` `skills export` invocation becomes a partial facade over the shared discovery, descriptor, renderer, classifier, and transaction engine; destructive `rm -rf`/copy behavior and local target tables disappear without touching bundle, command, or omitted entries.
- [ ] #6 `tests/cli/harness/subcommand.test.ts`, `tests/cli/main.test.ts`, `tests/cli/skills/subcommand.test.ts`, and `tests/skills/exporter.test.ts` prove selector/report/no-write/recovery integration and preservation of listing/compatibility behavior in arbitrary temporary project/home roots.
- [ ] #7 No universal check script, root chain-list flag or `cli/types.ts` chain-list surface, Drive envelope, external-session capture, memory/knowledge/task/session write, or live project/personal mutation is introduced.
<!-- AC:END -->
