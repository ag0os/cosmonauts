---
id: TASK-477
title: Capture inline and durable chain lifecycles with visible warnings
status: To Do
priority: medium
labels:
  - backend
  - testing
  - 'plan:episodic-log'
dependencies:
  - TASK-471
  - TASK-473
createdAt: '2026-07-17T20:07:57.967Z'
updatedAt: '2026-07-17T20:07:57.967Z'
---

## Description

Implementation Order step 6, after the shared store checkpoint. Add one start/terminal owner to inline and durable chain runners, deterministic first-executable-stage actors, an optional awaitable reporter, and final chain-tool warning text without changing `ChainResult`. This task solely owns B-015, B-016, B-025, and B-027.

<!-- AC:BEGIN -->
- [ ] #1 B-015 (Sources AC-002 and AC-006) is proven with `@cosmo-behavior plan:episodic-log#B-015`: success, failure, abort, and throw paths produce exactly one inline `chain.run` start/terminal pair sharing a private subject and resolved first-stage actor, including deterministic group-first fallback, while stages/turns/tools emit none and capture cannot alter primary behavior.
- [ ] #2 B-016 (Sources AC-002 and AC-006) is proven with `@cosmo-behavior plan:episodic-log#B-016`: durable chains reuse their persisted `chain-*` identity and resolved/group-first actor for one start/terminal pair, preserving graph/events/steps/result reconstruction and reporting capture failure without changing outcome.
- [ ] #3 B-025 (Source AC-006) is proven with `@cosmo-behavior plan:episodic-log#B-025`: the chain tool awaits one reporter and includes a non-fatal capture warning exactly once in final model-visible content, not details alone, while CLI execution without a session reporter falls back to bounded stderr.
- [ ] #4 B-027 (Source AC-001) is proven with `@cosmo-behavior plan:episodic-log#B-027`: absent/false config preserves inline and durable results, errors, callbacks/event order, graphs, steps, events, and created files byte-for-byte with zero project/user episode or induced index paths.
- [ ] #5 `ChainConfig` gains only the optional warning transport needed by the plan, `ChainResult` stays unchanged, and all chain capture flows through the sole fail-soft helper rather than a parallel serializer.
- [ ] #6 The chain noise budget remains O(runs): parallel-group members, stages, turns, tools, and durable task chatter do not generate extra episodes, and targeted tests catch missing/duplicate terminals and actor drift.
<!-- AC:END -->
