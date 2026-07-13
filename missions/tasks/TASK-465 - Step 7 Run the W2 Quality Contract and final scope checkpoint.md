---
id: TASK-465
title: 'Step 7: Run the W2 Quality Contract and final scope checkpoint'
status: To Do
priority: high
labels:
  - testing
  - 'plan:profile-playbooks'
dependencies:
  - TASK-464
createdAt: '2026-07-13T14:13:33.950Z'
updatedAt: '2026-07-13T14:13:33.950Z'
---

## Description

Implementation Order step 7. This task owns no B-### behavior; it is the required final verification checkpoint after all implementation-order owners are complete. Run the project-discovered test, lint, and typecheck gates, inspect every behavior marker/evidence home, run or inspect the targeted mutation negatives, verify boundaries and final status (including the Pi audit under `missions/**`), and review complexity/dead-code scope. Earlier tasks own the constraints; this checkpoint verifies them. Any approval-state, cache, registry/backend, extra consumer/tool, W3/W4 code, or `lib/memory/types.ts` pressure must be removed or trigger plan revision/abort rather than silent expansion.

<!-- AC:BEGIN -->
- [ ] #1 Quality Contract gate 1 (`correctness`) passes with project-native test, lint, and typecheck evidence; all pre-existing W1 memory/agent-memory tests remain present and green except the sanctioned keep-newest B-020 contract change, and W2 tests demonstrably make no model calls and write only to injected temporary project/user roots, never the real `~/.cosmonauts`.
- [ ] #2 Quality Contract gate 2 (`artifact-conformance`) passes with exact markers beside all named evidence: B-001 audit `missions/plans/profile-playbooks/pi-first-profile-playbooks-audit.md` > `Pi 0.80.6 recommendation gates W2 implementation`; B-002 `tests/memory/interface.test.ts` > `supports note profile and playbook through the unchanged MemoryStore contract`; B-003/B-004/B-005/B-007/B-009/B-010/B-013/B-015/B-016/B-020/B-021/B-022/B-023/B-024 in `tests/extensions/agent-memory.test.ts` at their plan-named tests; B-008/B-011/B-012/B-014/B-017/B-018 in `tests/memory/markdown-store.test.ts` at their plan-named tests; and B-006/B-019 in `tests/domains/main-domain.test.ts` at their plan-named tests. Every marker is exactly `@cosmo-behavior plan:profile-playbooks#B-###`, evidence paths are root-relative, and final status includes the audit artifact.
- [ ] #3 Quality Contract gate 3 (`mutation`) hard-fails realistic faults covering: current-turn context removal; parallel same-name saves both writing; invalid profile scope/kind and playbook kind; wrong record types admitted under `notes/`, `playbooks/`, or reserved profile path; cross-project playbook leakage; unconfirmed canonical overwrite or persisted collision/proposal state; blocked old-name reuse after human retitle; duplicate retitled canonical names without warning/refusal; stale human edits or retained deleted records; Unicode/oversized profile budget overflow or dropped required notice; and failed writes leaving partial files.
- [ ] #4 Quality Contract gate 4 (`boundary-conformance`) passes: `lib/memory/types.ts`, architecture-map code, architecture-memory extension, Cosmo agent wiring, CLI/config/generated architecture files, and coding-agent definitions remain unchanged; `lib/memory/*` imports no Pi/CLI/domain/architecture code; only `main/cosmo` consumes agent-memory; tests use construction seams/temp roots; and no registry/backend/approval machinery appears.
- [ ] #5 Quality Contract gate 5 (`complexity`) is explicitly reviewed and records W2 as one markdown store, exactly two tools, fixed profile/notes/playbooks layout, finite discriminated authored variants, sequential `remember`, default-mode `recall`, and no speculative configuration or dispatch layer.
- [ ] #6 Quality Contract gate 6 (`dead-code`) is explicitly reviewed and records that no W3 episodic capture, W4 consolidation/mining/pruning/decay, pending-proposal persistence, push relevance gate, cache/latest map, embeddings/SQLite/vector backend, backend registry, extra agent wiring, new result variant, or other future-wave scaffolding shipped; `consolidate()` remains the W1 no-op.
<!-- AC:END -->
