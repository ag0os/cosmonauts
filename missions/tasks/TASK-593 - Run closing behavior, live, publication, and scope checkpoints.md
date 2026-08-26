---
id: TASK-593
title: 'Run closing behavior, live, publication, and scope checkpoints'
status: Done
priority: high
labels:
  - testing
  - devops
  - 'plan:harness-adapters'
dependencies:
  - TASK-592
createdAt: '2026-08-25T23:06:55.146Z'
updatedAt: '2026-08-26T12:06:27.647Z'
---

## Description

Implementation Order step 9; final dependency barrier with no B-### ownership. Run the plan's closing correctness, artifact-conformance, live-provisioning, publication, structural, and scope audits after strict 8a→8b→8c completion. This task verifies constraints owned by implementing tasks; it does not repair gaps by narrowing ratified Goal, INV-001..INV-006, AC-001..AC-007, A-001/A-002, human decisions, or Out of Scope. Any such collision halts and escalates. Unbound mutation/duplication/complexity/boundary/dead-code gates remain explicitly unbound and require reviewer judgment; never fabricate a pass.

<!-- AC:BEGIN -->
- [x] #1 Project-native correctness passes for B-001..B-012 targeted tests, the full configured test/static-analysis gates, both complete evidence artifacts, and all provisioned selected checks at zero.
- [x] #2 Artifact conformance finds exactly one owning task and one plan-named executable proof for every B-001..B-012, with each exact `@cosmo-behavior plan:harness-adapters#B-###` marker present at its root-relative test/evidence path.
- [x] #3 Mutation-style evidence catches overwrite, project clobber, authority misclassification, partial/degraded-discovery deletion, mode disagreement, stale hash, recovery/check writes, lost evidence, rollback reversal, lock reentry/contention, inventory mirroring, and command-byte changes; unavailable mechanical mutation binding is reported as unbound, not passed.
- [x] #4 An isolated-home full default sync/check provisions all non-conflict rows, uses `.agents`, leaves `.codex/skills` absent, preserves the one ratified foreign target byte-intact, exits nonzero for exactly that conflict, and leaves `git status --porcelain` empty.
- [x] #5 Publication/autoload and dead-code audits confirm `external-commands/` ships without Pi/domain autoload, no universal harness-check script or root chain-list flag exists, and destructive copier/local target-directory/package-selection/chain/inventory registries plus stale authored inventories are absent.
- [x] #6 Boundary/complexity/duplication review confirms registry, strict discovery health, rendering, classification, transaction phases, materialization, runtime composition, and migration proofs remain separately testable; core imports no runtime/CLI/skills/package/git edge and writes stay within declared roots, siblings, sources, evidence, publication, and ignore files.
- [x] #7 Scope audit confirms no coordinator package, `skillDelivery: "reference"`, agent-package build expansion, full Gemini support, `open-code`, Drive envelope, external-session capture, native external workflow runtime, marketplace/domain distribution, memory/knowledge feature, or memory/knowledge/task/session write was introduced; memory/knowledge remains gated off.
<!-- AC:END -->
