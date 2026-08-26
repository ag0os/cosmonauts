---
id: TASK-575
title: 'Preserve canonical, legacy, and future package-definition parsing'
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:harness-adapters'
dependencies:
  - TASK-573
createdAt: '2026-08-25T23:02:33.029Z'
updatedAt: '2026-08-26T03:00:10.753Z'
---

## Description

Owns B-002 from AC-001 at Implementation Order step 2. Seam/files: `lib/agent-packages/types.ts`, `lib/agent-packages/definition.ts`, `tests/agent-packages/definition.test.ts`; characterization in `tests/agent-packages/build.test.ts` must remain compatible. This task parses schema only and performs no target build, sync, content migration, or live-command write. AC-001/INV-005 and D-005 are stop-and-escalate ground where restated; parser acceptance must never be reinterpreted as runtime support, and full Gemini/`open-code` support stays out of scope.

<!-- AC:BEGIN -->
- [x] #1 B-002: each single valid `claude`, `claude-cli`, `codex`, `gemini-cli`, or `open-code` target block parses and retains its exact option object.
- [x] #2 B-002: invalid option shapes fail definition parsing without consulting or mutating runtime support state.
- [x] #3 B-002: parser acceptance remains target-selection agnostic and does not imply that declared future blocks are supported for build or materialization.
- [x] #4 B-002: both `claude` and `claude-cli` keys remain parseable together so the selection seam, not the parser, can emit the dedicated ambiguity failure.
- [x] #5 B-002/D-005/INV-005: no consumer-local runtime-support table is consulted; schema syntax does not become a second harness registry.
- [x] #6 `tests/agent-packages/definition.test.ts` contains `parses canonical legacy and future target blocks without selecting support` with marker `@cosmo-behavior plan:harness-adapters#B-002` and proves valid exact retention plus invalid-shape and no-support-implication negatives.
<!-- AC:END -->
