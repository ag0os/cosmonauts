---
id: TASK-618
title: >-
  Slice 2 remediation — Make deterministic output bounded-and-lossy instead of
  failing
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory'
dependencies:
  - TASK-617
createdAt: '2026-09-02T18:01:39.408Z'
updatedAt: '2026-09-02T18:09:49.833Z'
---

## Description

Against the real 237-record corpus the pass now FAILS instead of bounding: `cosmonauts memory consolidate --dry-run --no-model` returns `kind: "failed"`, reason "Deterministic observation exceeds the proposal cap (15 > 10)."

Root cause: `lib/memory/living-memory.ts` ~line 267 throws when the deterministic Observer's own proposal findings exceed `limits.maxProposals`. That treats the pipeline's OWN deterministic findings like untrusted model output. The throws at ~1581/1589/1597 validate MODEL output and are correct — over-limit model batches must be rejected before mutation (D-010). The deterministic path is a category error and is inconsistent with its own sibling: `retirement-cap-deferred` (~line 354) already defers over-cap retirement candidates rather than failing.

This violates INV-005 ("Output is lossy and bounded by design: hard per-pass caps at every inlet and at L4") and B-010's Expected ("admitted bodies, episodes, observations, proposals, retirements, and model requests never exceed limits; ... cap-deferred items are reported"), and the plan's candidate table row "cap full -> cap-deferred; no candidate write". Practical impact: any corpus with more than `maxProposals` stale citations makes the tool permanently unusable — which is precisely the corpus this plan exists to regulate. No test pins the throwing behavior.

Fix: bound the deterministic proposal findings at `maxProposals` — persist the first N deterministically-ordered findings and report each remaining one as a decline (mirror the existing `retirement-cap-deferred` shape, e.g. code `proposal-cap-deferred`), keeping selection stable/deterministic across runs so convergence and D-020 represented-evidence recognition still hold. Apply the same bounded-and-lossy treatment to the deterministic observation cap if it can trip the same way. Do NOT weaken the model-output validation at ~1581/1589/1597 — those must keep failing closed.

Then iterate against the real corpus until it is clean: run `bun bin/cosmonauts memory consolidate --dry-run --no-model --json` from the repo root and confirm the pass completes as `ran` or `noop` (never `failed`), reports cap-deferred work honestly in `declines`, and leaves every store byte-identical. Fix any further bounding/ordering defects the real corpus exposes.

Binding ratified ground — stop and escalate rather than adjust it: dry-run must remain byte-identical and must create no lock, proposal, receipt, manifest, journal, retired file, or episode deletion; never move, edit, or delete anything under this repository's live `knowledge/`; `knowledgeSurface` stays on; no live retirement round; no TTL, OM, scheduling, user-scope L4 mutation, embeddings, new OKF type, or explicit-save change. Do not raise any cap to dodge the bug, and do not weaken retirement authority, byte authority, or the receipt floor.

<!-- AC:BEGIN -->
- [x] #1 Deterministic proposal findings over `limits.maxProposals` are bounded lossily rather than thrown: the first N are persisted in a stable deterministic order and every deferred finding is reported as a decline mirroring the existing `retirement-cap-deferred` shape; the same treatment covers the deterministic observation cap if it can trip identically.
- [x] #2 Model-output validation still fails closed: the over-limit observation, proposal, and retirement checks on judgment output are unchanged and still reject invalid or over-cap model batches before any mutation.
- [x] #3 A regression test proves a deterministic corpus fixture producing more proposal findings than `maxProposals` yields a bounded non-failed result whose declines name the deferred work, and that per-pass caps are still never exceeded.
- [x] #4 `bun bin/cosmonauts memory consolidate --dry-run --no-model --json` run from the repository root against the real corpus completes as `ran` or `noop` (never `failed`), reports deferred work honestly, and leaves `knowledge/` and `memory/` byte-identical with a clean worktree.
- [x] #5 Project-native universal correctness evidence passes after every commit; the Slice 0 B-001 receipt test and every existing marker B-001..B-021 remain green, unmodified, and owned by their original tasks; no cap is raised and no retirement, byte, or receipt authority is weakened.
<!-- AC:END -->
