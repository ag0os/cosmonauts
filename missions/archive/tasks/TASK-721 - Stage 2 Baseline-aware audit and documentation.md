---
id: TASK-721
title: Stage 2 Baseline-aware audit and documentation
status: Done
priority: medium
labels:
  - backend
  - devops
  - testing
  - 'plan:qm-chain-safety'
dependencies:
  - TASK-722
createdAt: '2026-09-24T03:15:35.215Z'
updatedAt: '2026-09-24T03:52:24.428Z'
---

## Description

Implement Implementation Order Stage 2 only: adopt the three existing committed Fallow baselines for changed-scope audit, add provenance and explicit refresh, and reconcile baseline/debt documentation. This task solely owns B-007 and B-009.

Binding ratified ground (not worker-adjustable; any collision requires halt-and-escalate with a drafted decision under the deviation protocol): INV-001 review and all children cannot mutate the reviewed checkout and isolation failure refuses; INV-002 every relied-on record belongs uniquely to its run and missing evidence fails; INV-003 a complete verdict persists on every exit; INV-004 authority lists bind every launch path; INV-005 changed-scope gates judge only introduced findings and new suppressions require a human-listed exception. D-001 requires: review-only QM with remediation through tasks, Drive and independent review; run-scoped full reports plus an every-exit plan summary and archived shared rounds; a private local clone now with generic runner isolation/OS sandbox deferred; introduced-only committed baselines and reconciled debt docs; human-only suppression exceptions; measured/reproduced evidence for performance P1 and independent closure; a different-family reviewer; and `chain_run` enforcement of the caller allowlist. D-002 forbids QM verification of this plan: implementation workers use codex `gpt-6-sol` at medium effort and closure uses a Claude subagent plus `codex exec -m gpt-6-sol -c model_reasoning_effort=high --sandbox read-only`, framed as correctness/liveness. D-018 permits exactly one reviewed-checkout change, the host-written new non-overwriting plan summary hidden from agents. D-019 makes missing checks/model config visible not-configured and human-decision items that block `ready`, never silence or refusal. D-020 requires a private local clone, not a linked worktree. D-021 starts the QM run after framework bootstrap at the launch boundary and before any QM/panel session. D-022 repairs only live-surface old links, preserves frozen/curated/evidence/archive history, and requires the archive README map. D-023 requires execution-liveness, when rebased later, to register prepare/check processes and the clone as outer-QM-attempt descendants.

<!-- AC:BEGIN -->
- [x] #1 B-007 is owned here and proven through the shipped `analysis_audit` tool: “A change that only touches files with baselined findings passes each category. A change that introduces a new finding fails that category. A missing or unreadable baseline file fails visibly. No review writes a baseline. The explicit refresh script requires a base and a reason and records provenance.”
- [x] #2 B-009 is owned here: through `docs/fallow-exceptions.md`, the `ROADMAP.md` `analysis-debt-paydown` item, and `.fallow-baselines/manifest.json`, “all three describe the same three baseline files, the current debt state, the suppression registry and the explicit reasoned refresh process. In particular, `docs/fallow-exceptions.md` no longer says that no duplication baseline exists.” Authored documentation is reviewed semantically rather than asserted sentence-by-sentence.
- [x] #3 D-008 and Design §7 are preserved exactly: only changed-scope audit receives `--dead-code-baseline .fallow-baselines/dead-code.json`, `--health-baseline .fallow-baselines/health.json`, and `--dupes-baseline .fallow-baselines/dupes.json` before common JSON/failure flags; the three existing files remain unchanged, `dupes.json` remains authoritative, missing/unreadable files never degrade to unbaselined audit, the manifest says “adopted as-is” with last-writer provenance/digests, and only an explicit base-plus-reason refresh appends provenance.
- [x] #4 R-010 is discharged before enforcement by a live probe of all three baseline flags against the committed files, including accepted argv and consistent verdict/envelope behavior; if pinned Fallow 2.54.2 rejects any file or produces contradictory envelopes, work stops for a dependency decision.
- [x] #5 The Stage 2 file seam is complete in `domains/shared/extensions/project-tools/fallow-provider.ts`, `.fallow-baselines/manifest.json`, `scripts/update-fallow-baselines.ts`, the baseline-refresh exposure in `package.json`, and the baseline/debt/suppression guidance in `docs/fallow-exceptions.md`, `ROADMAP.md`, and `AGENTS.md`; ordinary review has no path to the writer.
- [x] #6 Code delivery follows red → green → refactor with Vitest coverage under `tests/` mirroring source and proves B-007 at `analysis_audit` plus refresh-script failure/success entry points; realistic mutations such as omitting one flag, accepting a missing baseline, or refreshing without provenance fail the tests.
- [x] #7 R-001 and the ratified INV/D constraints in this task are stop-and-escalate ground; derived collisions are amended on record before code, and no baseline is regenerated merely to make a gate pass.
- [x] #8 (Compliance patch, 2026-09-24) The B-009 description of the suppression registry, its base-revision ownership and its check script is written against what TASK-722 actually shipped; this task therefore depends on TASK-722, and the docs are re-read against the landed registry before this task closes.
<!-- AC:END -->
