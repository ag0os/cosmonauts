# qm-chain-safety — coordinator status

Branch `feature/qm-chain-safety`, off local `main` at `29fc0ce`. Not pushed, not merged.
HEAD is the commit that last touched this file (`git log -1 -- missions/plans/qm-chain-safety/coordinator-status.md`). The worktree is clean at that commit.

## State (2026-09-24) — IMPLEMENTING (`/implement-plan`, session "qm-implementer")

- **Done:** spec ratified; `/spec-to-backlog` complete (see history below). Baseline gates at `e43c238`: typecheck 0, lint 0, tests 3053/3053 green.
- **Done (implementation):** Drive batch 1 `run-cc1c22ad-1847-4133-9daa-814c1b8cbb83` — TASK-720 `ece6af2`, TASK-722 `a8bacae`, TASK-721 `44f0566`, state `9b48a09`. Gates after batch 1: typecheck 0, lint 0, tests 3075/3075; `check:suppressions --base main` passes.
- **Done:** Drive batch 2 `run-45abf529-0210-43c6-9a3b-52809bc6197f` — TASK-723 `eb539cd` (state `3df0145`). Gates: typecheck 0, lint 0, tests 3110/3110. Until TASK-724/725 supply the workspace and assessment ports, every QM launch refuses (expected mid-branch).
- **TASK-724 first attempt** `run-3161f58f-…` blocked. The knowledge-surface backfill config-digest tripwire fired on the plan-sanctioned `.cosmonauts/config.json` change. Resolved by precedent in amendment-3 (`624c813`), pending owner ratification (N-002).
- **Done:** TASK-724 retry `run-d43e663f-…` — `4cc1093` (state `93bed5e`). Gates: typecheck 0, lint 0, tests 3121/3121. The amendment-3 digest was updated to the Stage 5 config.
- **TASK-725:** the first attempt `run-2ae54c4f-…` blocked on the same config-digest tripwire and was resolved by note (`c6bfe5f`). The retry `run-3ab35870-…` finished it: `a4d3731`, state `7213f3d`, amendment digest in `b437cd1`. Gates: typecheck 0, lint 0, tests 3159/3159.
- **Mid-branch review 1 (Stages 1–6)**, both channels DO-NOT-SHIP-YET: `mid-review-1-codex.md` (7 findings) and `mid-review-1-claude.md` (3 HIGH, 6 MEDIUM, 8 LOW). The prompt is in `mid-review-prompt.md`. My spot-check findings (a)–(c) were all confirmed.
  - **Dispositions:** plan D-025 amend-on-record (merge-base review base, checks in materials, D-025 triage, host-verified gate state, summary excluded from capture, bounded assessment, dual-caller reviewer prompts). Remediation tasks:
    - TASK-729: consent, path exposure, unbound gate, merge-base, finalization order, L1/L2/L3/L7, fail-closed markerless caller, L6.
    - TASK-730: cancellation, process-group kill, QM deadline, panel timeout.
    - TASK-731: restore specialist prompts and QM triage.
    - TASK-732: suppression directive forms.
  - **Accepted without a task:**
    - Claude L5 (test-only `execute` port): it has no production caller, so it gets another look at closure.
    - Claude L8 (`StepResult.childRun`): a generic runtime field used for D-016's inline-chain QM run id. Recorded here, and re-checked at closure under R-014.
  - TASK-726 and TASK-728 now depend on TASK-729..732.
- **Done:** Drive remediation `run-00e07810-…`: TASK-732 `8a3351a`, TASK-729 `c6b3d96`, TASK-730 `48435d8`, TASK-731 `38f579e`, state `a203b54`. Gates: typecheck 0, lint 0, tests 3198/3198, `check:suppressions --base main` passes.
- **Running:** mid-branch review 2 (re-review of the remediation): Claude + codex.
- **Blocked on:** N-001 (below) blocks closure only, not the next stages.

### Spec-to-backlog history

| Step | Commit |
|---|---|
| Phase 1 planner chain | `37ad121` |
| Phases 2–3: independent review and revision | `ad7c3e1` |
| Human rulings recorded | `75f4d11`, `d2b4541` |
| Backlog (TASK-720..728) | `6c226ea` |
| Compliance patches + plan D-024 | `4b93788` |

## Needs the user

### N-001 (open, 2026-09-24): the committed health baseline does not cover `main`, so INV-005 is not met as shipped

**Finding.** TASK-721 wired the three committed baselines exactly per D-008 ("adopted as-is"). Fallow 2.54.2 accepts all three flags (R-010 probe done by the coordinator: `Comparing against … baseline` for each, envelope consistent). But `.fallow-baselines/health.json` records 88 findings in 38 files, while `main` has 229 complexity findings in 90 files (a fresh `--save-baseline` on `main`). `fallow audit` has no introduced-only mode, so it counts every finding in a touched file that is not in the baseline.

**Reproduction (on a scratch worktree of local `main`).** Add a comment-only line at the top of `domains/shared/extensions/orchestration/driver-tool.ts` and run `fallow audit --base HEAD` with the three baseline flags. The verdict is `fail`, with one complexity finding: `execute`, cyclomatic 19, severity high. That finding already exists on `main`, and the baseline lists only one *moderate* finding for this file. So a change that only touches a file with inherited debt fails the gate.

**Collision.** INV-005 (ratified) says "Findings already present in touched files never fail it." D-008 (derived) adopts the files unchanged, and TASK-721 AC #7 says no baseline is regenerated merely to make a gate pass. The mechanism must yield to the invariant, but the remedy loosens the repository's regression floor. Commit `6b36c80` records that the floor is a deliberate "regression floor, not a target", so this is escalated rather than decided here.

**Drafted decision (recommended option A).**

- **A. One explicit, recorded refresh at the base.** Run `bun run refresh:fallow-baselines -- --base main --reason '<INV-005: floor re-anchored to main so inherited debt in touched files does not fail the changed-scope gate>' --category health` (plus `dead-code` and `dupes` if a probe shows the same gap) as its own commit on this branch. D-008 is then amended on record: "adopted as-is, then re-anchored once at the base under N-001." The debt stays visible in the baseline, `docs/fallow-exceptions.md` and `analysis-debt-paydown`. With the gate enforced from here on, `main` stays in sync with the floor.
  - Consequence: about 140 existing health findings become part of the floor.
  - Consequence: the refresh itself is a gate-owned-file change, so any QM run over this range shows it as a human-decision item (D-009).
- **B. Keep the floor as committed.** The gate keeps failing inherited debt in touched hotspots. That needs INV-005 amended, which only the human can do.
- **C. Generate the comparison baseline from the base revision at gate time.** This conflicts with INV-005's "relative to the committed baseline".

**Status.** Implementation continues on TASK-723+ (independent of this). The final closure gate (TASK-728) needs this ruling.

### N-002 (open, non-blocking, 2026-09-24): ratify backfill amendment 3

`missions/reviews/knowledge-surface-backfill-amendment-3.md` registers the new `.cosmonauts/config.json` digest after the plan adds the `qualityReview` block. This follows the amendment-2 precedent (implementer-made, pending ratification). The owner ratifies it or reverses it; reversing means dropping the block, which makes the QM visibly "not configured" under D-019.

### Earlier human decisions (all closed)

- **Intent:** ratified 2026-09-23.
- **Consequences of decision 1:** acknowledged. The named chains end at a findings report, and `execution-liveness` lands after this plan.
- **H-001..H-005:** accepted as recommended, recorded as D-018..D-022.
- **Execution-liveness amendment consequence:** acknowledged, recorded as D-023.

## Artifacts (`missions/plans/qm-chain-safety/`)

- **`spec.md`** — authoritative.
  - AC-003, AC-015 and AC-016 were amended in place by the human rulings, each with a dated pointer.
  - The INV-001 interpretation (D-021) is recorded beside the Intent.
- **`plan.md`** — behaviors B-001..B-012 in the current format (Source / Observer / Entry point / Outcome), and Decision Log D-001..D-024 (D-010 superseded).
  - **Ratified:** D-001 (item 3 superseded by D-020), D-002, and D-018..D-023.
  - **Derived:** everything else, amendable on the record.
- **Reviews:**
  - `review-1.md`, `review-2.md` — the chain's plan-reviewer.
  - `review-3.md` — my independent four-lens adversarial review: 24 verified findings, with dispositions.
  - `task-compliance-review.md` — 15 verified findings, with dispositions.

## Backlog (all To Do, label `plan:qm-chain-safety`)

| Task | Stage | Owns | Depends on |
|---|---|---|---|
| TASK-720 | 1 Close the authority bypass (`chain_run`, `run_driver`) | B-001 routes | — |
| TASK-722 | 3 Base-owned suppression check | B-008 check part | — |
| TASK-721 | 2 Baseline-aware audit and documentation | B-007, B-009 | TASK-722 |
| TASK-723 | 4 QM run allocation, lifecycle, host artifacts | B-004, B-003 sink | TASK-720 |
| TASK-724 | 5 Private snapshot, materials, preparation | B-002 | TASK-723 |
| TASK-725 | 6 Review-only QM pass | B-001 QM profile, B-003, B-005, B-006, B-008 report | TASK-724, TASK-722 |
| TASK-726 | 7 Model diversity and calibration | B-010, B-011 | TASK-725 |
| TASK-727 | 8 Archive legacy records, update callers | B-012 | TASK-725, TASK-726 |
| TASK-728 | 9 Independent closure (D-002; owns no behavior) | — | all above |

TASK-720 and TASK-722 can start in parallel. TASK-721 follows TASK-722 (D-024). Compliance patches are appended ACs marked `(Compliance patch, 2026-09-24)`.

## D-002: the verifier substitution (human, ratified)

This plan is **never** verified by the quality-manager, because the QM is the thing being fixed.

- **Replacement:** wherever `/implement-plan` calls the QM, run instead:
  1. a Claude subagent reviewer;
  2. `codex exec -m gpt-6-sol -c model_reasoning_effort=high --sandbox read-only < /dev/null`.
- **Framing:** both are a **correctness/liveness** review. Never frame them as adversarial or an attack; that trips codex's content filter and kills the run.
- **Outputs:** save them as `missions/plans/qm-chain-safety/closure-review-<n>.md` (TASK-728 #7).
- **Workers:** codex `gpt-6-sol` at medium effort. For Drive, set `COSMONAUTS_DRIVER_CODEX_ARGS="-m gpt-6-sol -c model_reasoning_effort=medium"`.

## Method notes for the implementer

- **Ratified ground moves only by a relayed human decision.** That means spec INV and AC text, D-001, D-002 and D-018..D-023. On a collision, halt and escalate with a drafted decision entry.
- **Derived entries** (D-003..D-017, D-024) are amended on the record first, per `domains/shared/skills/work-artifacts/references/deviation-protocol.md`.
- **Commits:** commit only on this branch, with explicit paths. No push, merge or PR.
- **This file:** keep it current (done, running, blocked, HEAD, handoff).
- **Stage boundaries** follow the plan's Implementation Order. An authority is removed only in the stage that delivers its replacement. TASK-725 removes `fixer`, `coordinator`, `verifier` and `integration-verifier` together with the host-run checks and panel capture.
- **Verification:** run `bun run test`, `bun run lint` and `bun run typecheck`. Land TASK-721 early, so that later stages are judged on introduced debt only.
- **`external-commands/implement-plan.md`** still describes a QM sign-off. Updating it is TASK-727's job; until then, apply D-002 by hand.

## Traps seen or known on this work

- **Two-stage chains.** A two-stage cosmonauts chain passes the prompt only to its **first** stage, and the plan-reviewer stage picks a plan by itself. It has reviewed the wrong plan before. After any `planner -> plan-reviewer` chain, check that the review file names this plan and sits at the expected path. Otherwise run `bun bin/cosmonauts -a coding/plan-reviewer -p '<prompt naming the plan and review-N.md>'`.
- **The external `.claude/skills/plan` bundle is stale.** It still asks for Seam/Test/Marker fields and a Quality Contract. The live contract is `domains/shared/skills/work-artifacts/references/plan-format.md`: Source/Observer/Entry point/Outcome, with no gate section.
- **Task ACs must be single lines.** The task parser keeps only the first line of a multi-line AC. Edit task files with Read then Edit, keep the `<!-- AC:BEGIN/END -->` block, and append rather than renumber.
- **Drive does not commit task files.** It excludes `missions/tasks/` from source commits. Check `git status` after each Drive run and commit task-state changes with explicit paths.
- **Files owned by a running chain or Drive.** Never edit them: a live planner stage can rewrite `plan.md` late. Never `git add -A` while a chain is alive either; add explicit paths.
- **Known suite flakes** (they pass in isolation): `cross-plan-commit-lock`, `plans/archive.test.ts`, `extensions/project-tools.test.ts`. Capture the exit code and re-run before believing a failure. `bun run test:coverage` exits 1 on the branch-coverage threshold even with a green suite.
- **Stalled stages.** A chain stage at 0% CPU mid-turn usually means its model is out of usage; check the stage's model first. Coding agents run `openai-codex/gpt-5.6-sol`.
- **Do not run the QM on this repository.** It reverts uncommitted work, and D-002 applies anyway. Use read-only codex for review.
- **execution-liveness** (TASK-712..719, To Do) lands after this plan. It needs an amend-on-record entry (D-023) that registers this plan's host-run prepare and check processes, and the private clone, as descendants of the QM attempt. Do not touch its files here.
- **The duplication baseline of record is `.fallow-baselines/dupes.json`.** An earlier draft wrongly planned a new `duplication.json`; D-008 now consumes the three committed files as they are.

## Evidence

- **Investigation:** `.shepherd/work/in-progress/qm-chain-safety/investigation.md`.
- **Incident report:** `missions/reviews/qm/framework-health-incidents.md`.
- **Coordinator workflows** (read-only reviews): `wf_d255f9f5-310` (plan), `wf_2081638c-a05` (task compliance).
