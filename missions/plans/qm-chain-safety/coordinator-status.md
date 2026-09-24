# qm-chain-safety — coordinator status

Branch `feature/qm-chain-safety`, off local `main` at `29fc0ce`. Not pushed, not merged.
HEAD is the commit that last touched this file (`git log -1 -- missions/plans/qm-chain-safety/coordinator-status.md`) or a later Drive commit. Check `git status` and `git log`.

## State (2026-09-24) — SUCCESSOR HANDOFF from session "qm-implementer" (implementation mid-way)

### Where things stand

- **Stages 1–6** are implemented, plus seven remediation rounds.
- **TASK-738** is the remediation from review round 6. The run order is being redesigned under D-026 ("review before execution").
- **Stages 7–9 have not started:** TASK-726 (model diversity and calibration), TASK-727 (archive and callers), TASK-728 (independent closure, done by the coordinator per D-002).
- **Branch:** `feature/qm-chain-safety`. Never pushed or merged. Commit only with explicit paths.
- **Gates at `7dd95c8`** (after TASK-738): typecheck 0, lint 0, tests 3242/3242 (baseline at `e43c238` was 3053). `check:suppressions -- --base main` passes.

### Task ledger

| Task | Commit | Notes |
|---|---|---|
| 720 authority | `ece6af2` | |
| 722 suppression check | `a8bacae` | |
| 721 baselines + docs | `44f0566` | R-010 probe done by the coordinator. See N-001. |
| 723 QM lifecycle | `eb539cd` | |
| 724 snapshot | `4cc1093` | First attempt blocked on the backfill config tripwire. Resolved by amendment-3 (N-002). |
| 725 review-only QM | `a4d3731` | First attempt blocked on the same tripwire. |
| 729 remediation A (isolation, consent, verdict) | `c6b3d96` | From mid-review-1. |
| 730 remediation B (liveness) | `48435d8` | From mid-review-1. |
| 731 remediation C (restore lenses) | `38f579e` | From mid-review-1. |
| 732 suppression forms | `8a3351a` | From mid-review-1. |
| 733 remediation D | `4fbf361` | From mid-review-2. |
| 734 parser-based scanner | `e6c89ff` | From mid-review-2. |
| 735 remediation E | `a9725bf` | From mid-review-3. |
| 736 remediation F | `a7136e0` | From mid-review-4. |
| 737 remediation G | `d6dd6c7` | From mid-review-5. |
| **738 remediation H (D-026)** | `c962b94` | From mid-review-6. Done (state `7dd95c8`). The live probe showed `analysis_audit` is unbound without installed dependencies, so a base-owned `analysisPrepare` (lifecycle scripts disabled) was added. |

TASK-726 and TASK-728 depend on TASK-729..738.

### Review history

- **Where the reviews live:** `mid-review-<n>-{codex,claude}.md` and `mid-review-<n>-prompt.md`, n = 1..6. Rounds 1–3 are verbatim; from round 4 on, the Claude files are condensed.
- **The pattern:** every round closed the previous round's findings, and the fixes introduced new ones. Rounds 4–6 kept finding new ways for **code or files the reviewed change controls to reach the host** (argv, package scripts, project domains, object-database tampering, `.pi` settings, materials races).
- **D-026 addresses that class structurally.** It reorders the run so that no reviewed code executes until the review evidence is sealed, and builds every quality runtime (including panel spawns) from a base export taken from the operator's source repository. The one remaining residual is N-004.
- **Plan amendments on record:**
  - D-025, 2026-09-24, amended three times: merge-base, checks in materials, triage floor plus QM additions, host-verified gate state (a failing audit is a gate failure with findings), summary excluded from capture, bounded assessment, dual-caller prompts, base-owned config, sanitized caller note, and "the change cannot choose what reviews it".
  - D-026, 2026-09-24.
- **Accepted with record** (reviewers judged these sound):
  - JSX text false positive in the suppression scanner (fails closed).
  - A process that deliberately leaves its process group can survive (the host wait is bounded).
  - `StepResult.childRun` as a generic field.
  - The `execute` port stays, and fails closed.
  - Reviewer artifact refs are published only via the StepResult (D-025).

### Running / next

- **Rulings applied (2026-09-24):** D-027..D-030 recorded (`c29255c`). Baselines re-anchored at `main` (`3ca0291`). With the baselines honest, the branch's own changed-scope audit fails on **introduced** debt: 31 complexity findings (`quality-review-run.ts` `execute` is cyclomatic 209), 8 dead-code issues and 10 clone groups. The refresh script analyzes `--root`, not `--base`.
- **TASK-739 done** (`0211d79`): the refresh script analyzes a temporary checkout of `--base`, and the docs follow D-029.
- **TASK-740 partial** (`661f98c`, tests 3243/3243): introduced dead code is gone, but 30 complexity findings and 8 clone groups remain. It is rescoped into TASK-740 (quality-review modules), TASK-741 (tools and session plumbing) and TASK-742 (the rest; the branch audit must pass).
- **TASK-740..742 done** (`351bf09`, `473178f`, `0b5e7d1`, `7e75231`). The coordinator verified TASK-742, whose only "partial" was the runner-args artifact. The branch's changed-scope audit vs `main` passes (0/0/0). Gates: typecheck 0, tracked lint 0, tests 3244/3244.
- **Mid-branch review 7** (under D-027), both DO-NOT-SHIP-YET, converging with no HIGH. Files: `mid-review-7-codex.md` (verbatim) and `mid-review-7-claude.md` (condensed).
  - **Remaining findings:** `analysisPrepare` failure aborts the review; lost prep lines; setup cancel always retains the workspace; missing D-028 report disclosure; untested user-source exclusion; a seal test that cannot fail.
  - **Accepted:** Claude LOW-2 (the registry parser rejects array shapes; stricter, and no committed file is affected).
- **TASK-743 done** (`5c9ee93`). Gates: typecheck 0, tracked lint 0, tests 3254/3254, audit vs `main` pass.
- **Mid-branch review 8:** Claude says **SHIP** with one LOW; codex says DO-NOT-SHIP-YET with one MEDIUM and one LOW, all in the same code. Files: `mid-review-8-codex.md` (verbatim) and `mid-review-8-claude.md` (condensed). TASK-744 covers all three.
- **TASK-744 done** (`ed9c674`). Gates: tests 3257/3257, audit pass.
- **Mid-branch review 9 (focused):** all round-8 findings are RESOLVED. Both channels found the same new HIGH regression: a failed analysis prep plus a bound audit gives `ready`. Files: `mid-review-9-{codex,claude}.md`. TASK-745 fixes the class: no `ready` with any host human item.
- **TASK-745 done** (`237a3d9`). Tests 3267/3267 after one rerun. Two new load-dependent flakes (`project-tools-fallow-fixtures` and `validate-harness-exports` timeouts) pass in isolation.
- **Mid-branch review 10 (focused): both channels SHIP for Stages 1–6.** Files: `mid-review-10-{codex,claude}.md`. Two LOW test-only gaps go to TASK-746.
- **STAGES 1–6 CLOSED.** Stage 7 has started.
- **TASK-746 done** (`2082356`). **TASK-726 (Stage 7) done** (`cdba7e1`). The coordinator set `diverseReviewerModel` to `anthropic/claude-sonnet-5` in `0ffaa48`; the worker had picked `claude-sonnet-4-5`. Gates: typecheck 0, tracked lint 0, tests 3278/3278, suppressions pass, audit vs `main` pass.
- **Stage 7 review 1**, both DO-NOT-SHIP-YET. Files: `stage7-review-1-{codex,claude}.md`. B-011 is sound, with no Stages 1–6 regressions. B-010 host enforcement can be bypassed by ordinary behavior (IDs, missing index, loose measured cost, QM-side dismissal), and the wiring tests are missing. TASK-747 covers all of it.
- **TASK-747 done** (`fde1063`). Gates: tests 3294/3295; the one failure is the known `validate-harness-exports` timeout flake, which passes 12/12 in isolation. Audit pass.
- **Stage 7 review 2:** Claude says **SHIP**; codex says DO-NOT-SHIP-YET (it keeps finding prose-parsing edge cases). Files: `stage7-review-2-{codex,claude}.md`.
  - **Decision:** D-031 (amend-on-record). Host B-010 calibration is defense in depth, with two hard floors: never a false `ready`, and never a silently dropped finding. Heuristic misses in measured-cost and closure-evidence text are recorded limits.
  - TASK-748 implements the floors: entry parsing, the out-of-range section counts as reported, and the P0 cap.
- **Running:** Drive TASK-748, then Stage 7 review 3 (focused on the D-031 floors).
- **Lint caveat:** `bun run lint` reports one error, in Shepherd's gitignored backup under `.shepherd/backups/`. Tracked content passes. I asked Shepherd to move the backup out of the repo.
- **Next steps for the successor:**
  1. Run mid-branch review 7 (after TASK-739/740). The prompt must state the D-027 threat model: hostile-change-only routes are residual limits, not findings to remediate on both channels, over `<TASK-738 commit>^..HEAD` plus the resolution of mid-review-6. Build the prompt from `mid-review-6-prompt.md`, and tell the reviewers N-004 is with the human.
  2. Loop through remediation tasks until both channels give SHIP for Stages 1–6.
  3. Then Drive TASK-726, then TASK-727, each followed by a two-channel review.
  4. Then do TASK-728 closure (needs N-001 and N-003 ruled).
- **Reusable mechanics:**
  - Drive: `COSMONAUTS_DRIVER_CODEX_ARGS="-m gpt-6-sol -c model_reasoning_effort=medium" cosmonauts run drive --plan qm-chain-safety --task-ids <ids> --backend codex --mode detached --branch feature/qm-chain-safety --task-timeout 7200000`.
  - Watch `events.jsonl` for `run_completed|run_aborted|task_blocked`.
  - `--resume` of an aborted run only replays the result. Relaunch with `--task-ids` instead; the worker continues from uncommitted partial work.
  - Codex review: `codex exec -m gpt-6-sol -c model_reasoning_effort=high --sandbox read-only "$(cat prompt)" < /dev/null > log 2>&1`. The final message follows the last line that reads exactly `codex`.
  - Claude reviewer: a general-purpose subagent. Tell it to read the prompt file, stay read-only, keep probes in the scratchpad, and check that each test could actually fail.
  - Task batches: `cosmonauts task create --from-file <yaml>`, with single-line ACs.
  - Workers must run the suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`. With the runner's Codex args injected, two detached-driver tests fail.
- **Blocked on:** nothing for Stages 1–8. Closure (TASK-728) needs N-001 and N-003; N-004 shapes the final INV-001 statement.

### Spec-to-backlog history

| Step | Commit |
|---|---|
| Phase 1 planner chain | `37ad121` |
| Phases 2–3: independent review and revision | `ad7c3e1` |
| Human rulings recorded | `75f4d11`, `d2b4541` |
| Backlog (TASK-720..728) | `6c226ea` |
| Compliance patches + plan D-024 | `4b93788` |

## Needs the user

Nothing open. The 2026-09-24 rulings are in `.shepherd/work/in-progress/qm-chain-safety/rulings-2026-09-24.md` (user: "all recommended"), recorded as plan D-027..D-030:

- **N-001 → D-029:** baselines re-anchored once at `main` `29fc0ce`, in their own commit. The probe found gaps in all three categories: dead-code 3, dupes 15, health 217.
- **N-002 → D-030:** amendment-3 ratified.
- **N-003 → D-030:** the stray catalog package was moved to a `.shepherd/backups/` backup by Shepherd. **Follow-up:** find what wrote to the real HOME on 2026-09-23 16:44Z, possibly a test during framework-health work.
- **N-004 → D-028:** INV-001 interpretation recorded beside the Intent.
- **Threat model → D-027:** the QM guards against accidental damage, not a hostile change. Hostile-only routes are recorded as residual limits. Reviewer prompts must state this.

The earlier drafts of N-001..N-004 are in git history, at commit `5a9ef4a` and before.

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

## Original backlog (label `plan:qm-chain-safety`; see the task ledger above for status)

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
