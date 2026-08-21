---
id: TASK-568
title: 'Stage 9: Run integrated refactor and Quality Contract gates'
status: Done
priority: high
labels:
  - testing
  - 'plan:knowledge-surface'
dependencies:
  - TASK-567
createdAt: '2026-08-19T18:36:41.950Z'
updatedAt: '2026-08-21T16:25:26.952Z'
---

## Description

Complete Slice B Stage 9 as an integration/refactor and verification checkpoint; it owns no B-### behavior. Recheck, do not first discover, the Stage 6 scan evidence and Stage 7B human approval. Run the ordered Quality Contract and record degraded reviewer judgment for unbound bindable gates rather than calling them passes.

This task must not broaden scope to make a gate pass. Ratified AC/INV/default/exclusion collisions halt and escalate; derived plan/reality collisions require amend-on-record before work continues. If integration reveals a code defect, observe a targeted RED regression before any repair, then GREEN and refactor; do not reassign behavior ownership or alter expected behavior merely to pass.

<!-- AC:BEGIN -->
- [x] #1 The bound correctness gate passes all 13 planned behavior tests plus the project-native test, lint, and type-check evidence, with no expected-result changes made merely to obtain GREEN.
- [x] #2 The bound artifact-conformance gate resolves B-001 through B-013 to their named executable test files with every exact `@cosmo-behavior plan:knowledge-surface#B-###` marker present; each behavior remains owned by exactly one earlier implementing task.
- [x] #3 Reviewer mutation judgment confirms detectable faults for path authority, writer identity, semantic retry, migration field/body/destination loss, budget overflow/empty output, authorization widening, OFF attribution/D-009 deltas, both gate transitions, profile-pin shadowing, backfill failure/cancellation/concurrent edits/orphan cleanup, and approval absence/reject/digest mismatch.
- [x] #4 Reviewer duplication/complexity judgment finds one focused parser, store, retrieval combiner, budget allocator, session composer, proposal derivation, and backfill lifecycle, with no surviving migration implementation, second extractor, duplicate enabled handler, WeakMap, module singleton, EventBus correctness state, speculative registry/backend, or correctness cache.
- [x] #5 Reviewer boundary-conformance judgment confirms `lib/memory/` remains Pi/config/agent/domain/session/task/plan/architecture-map independent, adapters depend inward on `MemoryStore`, thin wrappers add no policy, legacy authority is not widened, and generic trusted tools/backends remain documentation-only and unsandboxed.
- [x] #6 The existing `missions/reviews/knowledge-surface-scan-cost.md` still has the required 20-turn real-corpus `pass` evidence within thresholds, the human approval artifact still matches review-index/proposal-set digests with `approve`, config is OFF, and neither artifact is regenerated as a substitute for its earlier gate.
- [x] #7 Dead-code/scope inspection finds no active JSONL, non-OKF/fifth knowledge type, proposal outside `memory/agent/proposals/`, machine promotion, consolidation, working state, episode/explicit-save change, embeddings, retention, autonomy-host behavior, enabled bare-host promise, default ON, speculative `fallow.toml` suppression, or non-stack-agnostic shipped prompt/skill delta; any integration repair has RED-before-GREEN evidence.
<!-- AC:END -->
