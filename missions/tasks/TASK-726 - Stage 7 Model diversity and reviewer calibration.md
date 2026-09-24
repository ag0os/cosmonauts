---
id: TASK-726
title: Stage 7 Model diversity and reviewer calibration
status: To Do
priority: medium
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
dependencies:
  - TASK-725
  - TASK-729
  - TASK-730
  - TASK-731
  - TASK-732
  - TASK-733
  - TASK-734
  - TASK-735
  - TASK-736
  - TASK-737
  - TASK-738
  - TASK-739
  - TASK-740
  - TASK-741
  - TASK-742
  - TASK-743
createdAt: '2026-09-24T03:17:44.318Z'
updatedAt: '2026-09-24T03:17:44.318Z'
---

## Description

Implement Implementation Order Stage 7 only: attest model-family diversity from host-resolved identities, override only the always-present generalist, and complete performance-severity and independent-closure calibration. This task solely owns B-010 and B-011.

Binding ratified ground (not worker-adjustable; any collision requires halt-and-escalate with a drafted decision under the deviation protocol): INV-001 review and all children cannot mutate the reviewed checkout and isolation failure refuses; INV-002 every relied-on record belongs uniquely to its run and missing evidence fails; INV-003 a complete verdict persists on every exit; INV-004 authority lists bind every launch path; INV-005 changed-scope gates judge only introduced findings and new suppressions require a human-listed exception. D-001 requires: review-only QM with remediation through tasks, Drive and independent review; run-scoped full reports plus an every-exit plan summary and archived shared rounds; a private local clone now with generic runner isolation/OS sandbox deferred; introduced-only committed baselines and reconciled debt docs; human-only suppression exceptions; measured/reproduced evidence for performance P1 and independent closure; a different-family reviewer; and `chain_run` enforcement of the caller allowlist. D-002 forbids QM verification of this plan: implementation workers use codex `gpt-6-sol` at medium effort and closure uses a Claude subagent plus `codex exec -m gpt-6-sol -c model_reasoning_effort=high --sandbox read-only`, framed as correctness/liveness. D-018 permits exactly one reviewed-checkout change, the host-written new non-overwriting plan summary hidden from agents. D-019 makes missing checks/model config visible not-configured and human-decision items that block `ready`, never silence or refusal. D-020 requires a private local clone, not a linked worktree. D-021 starts the QM run after framework bootstrap at the launch boundary and before any QM/panel session. D-022 repairs only live-surface old links, preserves frozen/curated/evidence/archive history, and requires the archive README map. D-023 requires execution-liveness, when rebased later, to register prepare/check processes and the clone as outer-QM-attempt descendants.

<!-- AC:BEGIN -->
- [ ] #1 B-010 is owned here and observable in the QM report: “A performance finding is P1 only when it cites a measured or reproduced cost; otherwise it is at most P2. No finding is closed or dismissed on the evidence of the lens that raised it alone.” D-012's host-measured check durations are valid available evidence; a lens assertion by itself is not.
- [ ] #2 B-011 is owned here in the report's reviewer-models section: “A completed assessment includes one generalist whose host-observed model is from a different family than the default implementer, and records every reviewer's model. A same-family, unresolvable or substituted model fails visibly. Unconfigured diversity follows D-019.”
- [ ] #3 D-005 and Design §6 are preserved: `qualityReview.diverseReviewerModel` overrides only the always-present general reviewer and never shipped definition models; the default worker's Pi-resolved provider determines implementer family; session creation returns actual provider/model identity; shipped provider aliases normalize families and project `qualityReview.modelFamilies` can extend them; reviewer text is never trusted as identity.
- [ ] #4 D-019 applies exactly when `diverseReviewerModel` is missing: the report contains visible “not configured” and human-decision items naming the key, verdict cannot be `ready`, and the run is neither silently incomplete nor refused.
- [ ] #5 The Stage 7 file seam is complete in new `lib/orchestration/quality-review-models.ts`, resolved-model evidence in `lib/orchestration/session-factory.ts` and `types.ts`, model/report composition, `qualityReview.diverseReviewerModel` and `modelFamilies` validation/examples in `lib/config/types.ts`, `loader.ts`, `.cosmonauts/config.json`, `.cosmonauts/config.example.json`, and semantic calibration of `bundled/coding/prompts/reviewer.md`, `security-reviewer.md`, `performance-reviewer.md`, and `ux-reviewer.md`; model selection remains host-owned.
- [ ] #6 Code delivery follows red → green → refactor with Vitest tests under `tests/` mirroring source and behavior proof through completed/failed/refused QM reports, including alias extension, different/same/unresolvable/substituted families, unconfigured diversity, unsupported P1, and self-closing findings; prompt prose is reviewed semantically rather than asserted sentence-by-sentence.
- [ ] #7 R-001 and the ratified INV/D constraints in this task are stop-and-escalate ground; derived collisions are amended on record before code, and neither model identity nor measured cost may be accepted from untrusted reviewer prose.
- [ ] #8 (Compliance patch, 2026-09-24) The resolved-model seam in `session-factory.ts` and `types.ts` is delivered by TASK-725 (#11). This task owns family normalization (`quality-review-models.ts`), the `diverseReviewerModel` override, `modelFamilies` config validation and the diversity verdict, all consuming the identity Stage 6 records. AC #5's mention of resolved-model evidence refers to consuming it.
<!-- AC:END -->

## Implementation Notes

Coordinator note, 2026-09-24:
- `.cosmonauts/config.json` changes are authorized for this plan. The knowledge-surface backfill config-digest tripwire is handled by `missions/reviews/knowledge-surface-backfill-amendment-3.md` (coordinator record, pending owner ratification; plan-sanctioned by Files to Change and the human-ratified D-019). Do not stop on it. If you change `.cosmonauts/config.json`, set `configDigest` in that file to the new `shasum -a 256 .cosmonauts/config.json` as your last step, and re-run `tests/scripts/knowledge-surface-backfill.test.ts`. Writing that one field is authorized.
- Run the full suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`. The runner-injected Codex args break the detached-driver fake-CLI tests.
