---
id: TASK-513
title: Pin the reference engine and capture live provider envelopes
status: To Do
priority: high
labels:
  - 'plan:analysis-capability-runtime'
  - devops
  - testing
dependencies: []
createdAt: '2026-07-29T16:40:48.854Z'
updatedAt: '2026-07-29T16:40:48.854Z'
---

## Description

Stage 1 of `missions/plans/analysis-capability-runtime/plan.md`, second
half. These fixtures are the evidence base for the schema freeze in the
contract task and for every adapter behavior after it, so they are captured
before the generic result schema is settled.

This task owns no `B-###` behavior; it is the enabling infrastructure for
`B-002`, `B-004`, `B-007`–`B-012`, `B-025`, and `B-037`. Do not add
markers for behaviors it does not own.

Today this repository has only a global engine and no package pin. That is
the modeled signal-without-executable state (`D-015`), not a defect —
installing the pin here is what moves it. Resolution must never use a
PATH/global binary or a mutable fetch.

Ratified ground: INV-1..5 outrank any mechanism. Gate kinds for this task:
`correctness` (hard fail). Record the commit HEAD at task start; that SHA
is the changed-scope base for any audit at task close.

<!-- AC:BEGIN -->
- [ ] #1 The reference provider engine is pinned at exactly 2.54.2 in this repository's package manifest and lockfile.
- [ ] #2 Captured live envelopes exist as test fixtures for every capability the reference provider supports, including a changed-scope audit over a working tree carrying tracked, staged, and untracked changes.
- [ ] #3 The config-introspection exit-code matrix is captured as fixtures covering healthy-with-config, defaults-in-effect (exit 3 with a plain-text stdout preamble), and error (exit 2), per `D-022`.
- [ ] #4 Each fixture records whether its envelope came from the live engine or from a captured payload, so later behaviors can state which they use.
- [ ] #5 Capture leaves the worktree unchanged: no provider cache or generated file is committed, and no capture step depends on writing into the repository (`INV-5`).
- [ ] #6 The project's test, lint, and type-check steps pass.
<!-- AC:END -->
