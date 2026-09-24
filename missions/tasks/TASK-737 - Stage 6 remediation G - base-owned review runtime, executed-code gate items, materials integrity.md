---
id: TASK-737
title: >-
  Stage 6 remediation G - base-owned review runtime, executed-code gate items,
  materials integrity
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-736
createdAt: '2026-09-24T07:46:59.634Z'
updatedAt: '2026-09-24T07:56:23.381Z'
---

## Description

Remediate the verified round-5 findings in `missions/plans/qm-chain-safety/mid-review-5-codex.md` (the HIGH on `package.json` scripts, the external store-root LOW and the materials acceptance) and `mid-review-5-claude.md` (H-1 and L-1..L-3).

This work is governed by D-025 (see its 2026-09-24 mid-review-5 amendment: "The change cannot choose what reviews it or what the host imports"), plus D-009, D-013, Design §3 and R-014. Binding ratified ground is INV-001..INV-005 and D-018..D-023. N-004 (host checks executing reviewed code without an OS sandbox) is pending the human. Do not try to sandbox execution here. Timed-out panel children are never cancelled. Add no leases or owner protocol.

Every test must fail on the current code and drive the real path.

Run the full suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`. If you change `.cosmonauts/config.json`, update `configDigest` in `missions/reviews/knowledge-surface-backfill-amendment-3.md` as your last step (authorized).

<!-- AC:BEGIN -->
- [x] #1 The QM runtime is base-owned (Claude H-1): the runtime that resolves the QM and panel definitions, prompts, project domains, local packages and config is created from the framework plus the review base revision's project files (materialized outside the clone, e.g. a base export under the reserved workspace), never from the reviewed clone; sessions keep the clone as `cwd`; tested with a reviewed change adding `.cosmonauts/domains/evil/domain.ts` that writes a marker on import (marker never appears) and a project domain overriding `coding/security-reviewer` (the base definition is used).
- [x] #2 Changes to what configured checks execute are gate-owned (codex HIGH): a reviewed change to a `package.json` script named by any configured check or prepare argv (e.g. `bun run test` -> script `test`), or to any path in the base-owned `qualityReview.gateOwnedPaths`, is a gate-owned human-decision item that blocks `ready`; this repository's base-owned config lists its test runner files (e.g. `scripts/vitest-runner.mjs`, vitest config) in `gateOwnedPaths`; tested by changing the `test` script to a no-op.
- [x] #3 Review materials are integrity-checked (codex and Claude materials acceptance): each materials file is digested when the host writes it and verified immediately before the QM session starts; a mismatch fails the run as a report-integrity failure naming the file; tested by a check that rewrites `materials/full.diff`.
- [x] #4 Operator-note redaction covers `~`-relative forms of the source root and the host store root even when the store is outside the project root (Claude L-1, codex LOW); tested for both.
- [x] #5 An abandoned reviewer write appends its reason and keeps the original failure reason (Claude L-2); tested with a deadline plus an abandoned write.
- [x] #6 Workspace disposition is generic and visible (Claude L-3, R-014): `lib/durable-runtime` has no QM-specific record kind (use a generic post-terminal activity or artifact-disposition record), the `run_status` tool text shows the disposition, and the 60 s default removal timeout is exercised through config rather than asserted as a constant.
<!-- AC:END -->
