# qm-chain-safety — coordinator status

Branch `feature/qm-chain-safety`, off local `main` at `29fc0ce`. Not pushed, not merged.
HEAD is the commit that last touched this file (`git log -1 -- missions/plans/qm-chain-safety/coordinator-status.md`). The worktree is clean at that commit.

## State (2026-09-24) — HANDOFF: backlog ready, implementation not started

- **Done:**
  - Spec with Intent INV-001..INV-005, ratified by the human on 2026-09-23 (`1930dda`).
  - `/spec-to-backlog`, all phases:

    | Step | Commit |
    |---|---|
    | Phase 1 planner chain | `37ad121` |
    | Phases 2–3: independent review and revision | `ad7c3e1` |
    | Human rulings recorded | `75f4d11`, `d2b4541` |
    | Backlog (TASK-720..728) | `6c226ea` |
    | Compliance patches + plan D-024 | `4b93788` |

- **Running:** nothing. No chain, workflow or Drive process is alive.
- **Blocked on:** nothing.
- **Stopped by user direction** (2026-09-24, relayed). A fresh session runs `/implement-plan qm-chain-safety`. Do not start it from this session.

## Needs the user

Nothing open. Every human decision so far:

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
