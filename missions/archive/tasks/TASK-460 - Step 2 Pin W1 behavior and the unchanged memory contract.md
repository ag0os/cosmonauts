---
id: TASK-460
title: 'Step 2: Pin W1 behavior and the unchanged memory contract'
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:profile-playbooks'
dependencies:
  - TASK-459
createdAt: '2026-07-13T14:10:44.696Z'
updatedAt: '2026-07-13T20:29:39.351Z'
---

## Description

Implementation Order step 2. Establish characterization and contract evidence before refactoring the store. This task owns B-002 and B-015. `lib/memory/types.ts` is intentionally UNCHANGED, as are the architecture-map adapter and architecture-memory edge; any pressure to add a field, result arm, registry, or plugin contract is a stop-and-report failure of the plan assumption, not permission to edit the interface. Tests use injected temporary project/user roots and make no model calls.

<!-- AC:BEGIN -->
- [x] #1 B-002's contract test `supports note profile and playbook through the unchanged MemoryStore contract` is authored in `tests/memory/interface.test.ts`, carrying `@cosmo-behavior plan:profile-playbooks#B-002`: one `createMarkdownMemoryStore()` instance drives `note`, `profile`, and `playbook` through the existing `write`/`retrieve`/`consolidate` signatures, while `consolidate()` remains the shipped no-op and no type/backend registry or plugin dispatch exists. Per plan step 2, the new profile/playbook assertions are expected RED at this checkpoint (the W1 store still rejects non-note drafts); they turn green in TASK-461 where the store behavior lands, and B-002 completes there.
- [x] #2 B-002's boundary evidence confirms `lib/memory/types.ts` remains byte-for-byte structurally unchanged and the architecture-map adapter needs no contract change; inability to represent W2 with the existing `MemoryRecordDraft.type`, `MemoryQuery.recordTypes`, and result unions triggers stop-and-report.
- [x] #3 B-015 is proven by `tests/extensions/agent-memory.test.ts` test `preserves W1 note save recall allowlisting and Cosmo authorization`, carrying `@cosmo-behavior plan:profile-playbooks#B-015`: omitted `type` still means `note`, and W1 note paths/layout/defaults, scope and recency/list behavior, failures, 5/20 recall bounds, skipped session scope, no-op consolidation, allowlisting, authorization reset/non-Cosmo refusal, and absent-store inertness remain intact without substantive test rewrites.
- [x] #4 Applicable Quality Contract gates 1, 2, and 4 pass for this characterization checkpoint: existing W1 memory/agent-memory tests remain present and green — the deliberately-red new B-002 profile/playbook contract assertions (sanctioned by plan step 2) and the later sanctioned B-020 context-filter delta are the only exceptions — exact B-002/B-015 markers sit by the named executable tests, tests use temporary roots and no model calls, `lib/memory/*` keeps its inward dependency direction, and architecture-map code remains unchanged.
<!-- AC:END -->
