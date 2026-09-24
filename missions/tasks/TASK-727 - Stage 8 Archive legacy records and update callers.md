---
id: TASK-727
title: Stage 8 Archive legacy records and update callers
status: To Do
priority: medium
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
dependencies:
  - TASK-755
  - TASK-754
  - TASK-753
  - TASK-752
  - TASK-751
  - TASK-750
  - TASK-749
  - TASK-748
  - TASK-747
  - TASK-725
  - TASK-726
createdAt: '2026-09-24T03:18:07.184Z'
updatedAt: '2026-09-24T03:18:07.184Z'
---

## Description

Implement Implementation Order Stage 8 only: archive the eleven shared review-round files with history, repair exactly the live links, and update named chains and caller guidance to the findings-only QM contract. This task solely owns B-012.

Binding ratified ground (not worker-adjustable; any collision requires halt-and-escalate with a drafted decision under the deviation protocol): INV-001 review and all children cannot mutate the reviewed checkout and isolation failure refuses; INV-002 every relied-on record belongs uniquely to its run and missing evidence fails; INV-003 a complete verdict persists on every exit; INV-004 authority lists bind every launch path; INV-005 changed-scope gates judge only introduced findings and new suppressions require a human-listed exception. D-001 requires: review-only QM with remediation through tasks, Drive and independent review; run-scoped full reports plus an every-exit plan summary and archived shared rounds; a private local clone now with generic runner isolation/OS sandbox deferred; introduced-only committed baselines and reconciled debt docs; human-only suppression exceptions; measured/reproduced evidence for performance P1 and independent closure; a different-family reviewer; and `chain_run` enforcement of the caller allowlist. D-002 forbids QM verification of this plan: implementation workers use codex `gpt-6-sol` at medium effort and closure uses a Claude subagent plus `codex exec -m gpt-6-sol -c model_reasoning_effort=high --sandbox read-only`, framed as correctness/liveness. D-018 permits exactly one reviewed-checkout change, the host-written new non-overwriting plan summary hidden from agents. D-019 makes missing checks/model config visible not-configured and human-decision items that block `ready`, never silence or refusal. D-020 requires a private local clone, not a linked worktree. D-021 starts the QM run after framework bootstrap at the launch boundary and before any QM/panel session. D-022 repairs only live-surface old links, preserves frozen/curated/evidence/archive history, and requires the archive README map. D-023 requires execution-liveness, when rebased later, to register prepare/check processes and the clone as outer-QM-attempt descendants.

<!-- AC:BEGIN -->
- [ ] #1 B-012 is owned here: “All eleven shared round files have one archive home, and their Git history stays reachable with `--follow`. Live surfaces no longer link to the old paths (scope per D-022). QM-ending chains complete with a findings report. Callers route remediation to tasks, Drive and independent review, and never claim the QM fixes code, completes plans or leaves a clean tree.”
- [ ] #2 D-022 scope is exact: an exact tracked search repairs old-path links in prompts, skills, docs, code, tests other than frozen fixtures, active plans, and `ROADMAP.md`; frozen fixtures, curated `knowledge/` records, evidence reports, and archived plans retain historical text. `missions/archive/reviews/qm/shared-rounds/README.md` maps every old path to its new home, the eleven files move with `git mv`, and the two plan-qualified `analysis-gate-coverage-*-round-1.md` files remain in place.
- [ ] #3 Named `plan-and-build`, `implement`, `spec-and-build`, `adapt`, and other QM-ending chain surfaces are exercised end to end and stop at the durable findings report; caller guidance consistently describes separate remediation through tasks, Drive, and independent review while preserving project checks, direct gate resolution, panel triage, specialists, and the D-019 visible unconfigured outcome.
- [ ] #4 D-014 and D-015 constrain authored changes: behavior is reviewed at observer/entry-point/outcome level without sentence-matching tests or invented gate sections, the authoritative historical D-001/spec citations remain verbatim, and any new investigation reference points to `.shepherd/work/in-progress/qm-chain-safety/investigation.md`.
- [ ] #5 The Stage 8 file seam is complete in `bundled/coding/chains.ts`, `bundled/coding/prompts/cody.md`, `domains/shared/skills/spawning/SKILL.md`, `domains/main/skills/dispatch/SKILL.md`, `docs/orchestration.md`, `README.md`, `AGENTS.md`, `external-commands/implement-plan.md`, `external-skills/cosmonauts/SKILL.md`, the eleven specified `missions/reviews/{review,security-review,ux-review}-round-{1,2,3}.md`/`performance-review-round-{1,2}.md` moves, the archive README, and every additional live-surface old-path reference found by the required exact search—without changing historical surfaces excluded by D-022.
- [ ] #6 Code/chain delivery follows red → green → refactor with Vitest tests under `tests/` mirroring source and proof through shipped named-chain entry points; authored prompts, skills, docs, and archive navigation are reviewed semantically. R-001 and all ratified constraints are stop-and-escalate ground rather than text to route around.
<!-- AC:END -->

## Implementation Notes

Coordinator note, 2026-09-24, after Stage 7 (TASK-726, TASK-746..748). Read plan D-025..D-031 first.

- **The QM is review-only (D-001, D-025).** It never edits, fixes, commits or completes a plan. It ends at a durable findings report with a verdict: `ready` only when host-verified gates, checks and model diversity are clean and there are no host human items. Callers route remediation through tasks, Drive and an independent review. Named QM-ending chains stop at that report; nothing downstream in a chain may claim a clean tree or a completed plan.
- **`external-commands/implement-plan.md`** still describes a QM sign-off and a fix loop. Rewrite that part: the QM (or, where the QM itself is under review, the D-002-style substitution of a Claude subagent reviewer plus a read-only `codex exec`) produces findings, and remediation goes through tasks, Drive and a re-review after every remediation round. Keep the rest of the command's flow.
- **`qualityReview` config is base-owned (D-025).** `checks`, `diverseReviewerModel` and `modelFamilies` are read from the review base revision. A review whose base lacks them reports visible "not configured" and human-decision items and cannot be `ready` (D-019). Caller guidance must describe that outcome, not treat it as an error.
- **Link repair follows D-022 exactly.** Find old paths with an exact tracked search (`git grep -n` for each of the eleven old paths). Repair only live surfaces. Leave frozen fixtures, curated `knowledge/` records, evidence reports, `missions/archive/**` and this plan's own review files unchanged. Use `git mv` for the eleven moves, and leave the two `analysis-gate-coverage-*-round-1.md` files in place.
- **Threat model (D-027).** Hostile-change-only routes are out of scope.
- **The changed-scope audit must keep passing.** `npx fallow audit --base main --dead-code-baseline .fallow-baselines/dead-code.json --health-baseline .fallow-baselines/health.json --dupes-baseline .fallow-baselines/dupes.json` introduces no new complexity, dead-code or duplication. Add no suppressions and do not re-save baselines.
- **Config digest.** If you change `.cosmonauts/config.json`, set `configDigest` in `missions/reviews/knowledge-surface-backfill-amendment-3.md` to `shasum -a 256 .cosmonauts/config.json` as your last step.
- **Lint and tests.** `bun run lint` has one known error, in the gitignored `.shepherd/backups/`; lint on tracked paths (`bunx biome check lib/ domains/ cli/ tests/ scripts/ bundled/`) must pass. Run the suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`.
