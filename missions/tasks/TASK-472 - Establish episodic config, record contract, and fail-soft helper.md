---
id: TASK-472
title: 'Establish episodic config, record contract, and fail-soft helper'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:episodic-log'
dependencies:
  - TASK-471
createdAt: '2026-07-17T20:07:02.861Z'
updatedAt: '2026-07-17T20:07:02.861Z'
---

## Description

Implementation Order step 2, gated by the Pi-first audit. Establish the project-only off-by-default config, pure episode record contract, reserved tags and wake payload parser, the sole `recordEpisode` helper against injected dependencies, and the deliberately narrow retrieved-source seam. This task solely owns B-001, B-002, B-004, B-011, and B-020. It prepares the pure/injected contracts needed by B-003 and B-005, but their sole executable ownership and real-store GREEN proof belong to the store task so those behaviors are not split. Work test-first and place each owned marker near its executable Vitest test.

<!-- AC:BEGIN -->
- [ ] #1 B-001 (Source AC-001) is proven with `@cosmo-behavior plan:episodic-log#B-001`: `.cosmonauts/config.json` capture is enabled only by literal `episodicLog.enabled: true`, malformed settings fail safely, and the effective per-scope threshold defaults to 500 while valid positive integers survive.
- [ ] #2 B-002 (Source AC-001) is proven with `@cosmo-behavior plan:episodic-log#B-002`: disabled helper capture returns `disabled`, constructs or calls no store, emits no warning, and creates zero project/user memory, index, or episode files.
- [ ] #3 B-004 (Source AC-002) is proven with `@cosmo-behavior plan:episodic-log#B-004`: machine records carry only the honest `writer:cosmonauts` provenance tag, human records remain untagged and recallable, and W3 exposes no SHA-256 integrity, edit-detection, or safe-prune verifier.
- [ ] #4 B-011 (Source AC-006) is proven with `@cosmo-behavior plan:episodic-log#B-011`: config, construction, write-result, thrown-write, and awaitable-reporter failures resolve as one bounded non-fatal warning, leave no partial episode, and fall back to stderr when reporting is unavailable or rejects.
- [ ] #5 B-020 (Source AC-002) is proven with `@cosmo-behavior plan:episodic-log#B-020`: the finite vocabulary accepts only chain/Drive lifecycle, plan/task create or real status changes, successful authored saves, and caller-owned `autonomy.wake`; raw sessions, turns, tools, stages, task chatter, and arbitrary edits are rejected to preserve the O(runs + lifecycle transitions) noise budget.
- [ ] #6 The episode record module remains pure and the framework has one capture helper/serializer: record code imports no config, filesystem, Pi, domains, lifecycle owners, consolidation, or autonomy, while callers cannot replace reserved action/outcome/subject/payload/writer tags and wakes require a stable payload.
- [ ] #7 `lib/memory/types.ts` changes are limited to the single additive optional `RetrievedMemoryRecord.source`; MemoryStore methods, drafts, queries, result unions, and architecture-adapter compatibility remain unchanged, with the intentional interface hash re-pinned and the unrelated config doc-comment preserved.
<!-- AC:END -->
