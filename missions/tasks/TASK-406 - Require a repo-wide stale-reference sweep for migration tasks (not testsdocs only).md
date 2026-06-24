---
id: TASK-406
title: >-
  Require a repo-wide stale-reference sweep for migration tasks (not tests/docs
  only)
status: To Do
priority: high
labels:
  - verification
  - prompts
  - migration
  - 'plan:orchestration-hardening'
dependencies: []
createdAt: '2026-06-24T17:30:31.320Z'
updatedAt: '2026-06-24T17:31:45.283Z'
---

## Description

PROBLEM (observed): a directory migration (`bundled/coding/coding/` ->
`bundled/coding/`) left a stale path in `cli/drive/subcommand.ts` — RUNTIME
SOURCE CODE — which broke the Drive mid-run. The plan's reference sweep was
scoped to "tests/docs", and the dead-code gate that would have caught it runs
only at the FINAL quality stage, far too late.

WHERE (persona/guidance files — additive edits):
- `bundled/coding/prompts/worker.md` — worker migration guidance.
- `bundled/coding/prompts/quality-manager.md` — dead-code / stale-reference
  checking guidance.
- any relevant capability under `bundled/coding/capabilities/` (e.g.
  engineering-discipline) if migration guidance already lives there.

WHAT TO DO:
Add explicit guidance that when a task moves or renames a file, directory,
exported symbol, or path, the worker MUST grep the ENTIRE repository source tree
(lib/, cli/, bin/, domains/, bundled/, scripts/, AND tests/docs) for the old
identifier/path and update every reference BEFORE marking the task done —
prioritizing runtime source over tests/docs. Frame it as a pre-completion
checklist item for migration-shaped work. In quality-manager.md, make the
dead-code/stale-reference check scan ALL source directories and recommend
running it immediately after a migration task, not only at the end.

CONSTRAINTS: edits are ADDITIVE — preserve all existing persona content,
including any additions made by sibling tasks touching the same file.

<!-- AC:BEGIN -->
- [ ] #1 `worker.md` instructs that file/dir/symbol/path moves require a repo-wide reference sweep across all source dirs (not just tests/docs) before completion, runtime source prioritized.
- [ ] #2 `quality-manager.md` stale-reference/dead-code guidance explicitly covers all source directories and recommends a post-migration sweep.
- [ ] #3 All edits are additive and preserve existing persona content.
- [ ] #4 lint/format pass and the full test suite still passes.
<!-- AC:END -->
