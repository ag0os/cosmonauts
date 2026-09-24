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

- **Running:** nothing. TASK-738 finished (Drive `run-595ad64d-a3d1-41e3-ae8a-4877696f6df8`), and its amendment-3 digest is committed.
- **Next steps for the successor:**
  1. Run mid-branch review 7 on both channels, over `<TASK-738 commit>^..HEAD` plus the resolution of mid-review-6. Build the prompt from `mid-review-6-prompt.md`, and tell the reviewers N-004 is with the human.
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

### N-003 (open, 2026-09-24): an installed catalog `coding` package shadows the bundled one on this machine

`~/.cosmonauts/packages/coding` (installed 2026-09-23 13:44, not by this session) makes the runtime resolve `coding/quality-manager` and the reviewers to the **old** definitions and prompts. The restricted profile still enforces the tool allowlist, so safety holds. But a live QM run on this machine will not use this branch's prompts. TASK-728 #6 needs a real end-to-end QM run.

The user decides one of:
- (a) remove or reinstall that package from this branch before closure;
- (b) run the closure end-to-end with package discovery pointed away from it, if the CLI allows that;
- (c) accept an end-to-end run on the shadowed definitions.

I will not touch `~/.cosmonauts` myself.

### N-004 (open, 2026-09-24): host-run checks execute the reviewed code without an OS sandbox

**Finding.** This is codex mid-review-4's structural observation, confirmed by the coordinator. The QM host runs `qualityReview.prepare` (for example `bun install`) and `checks` (for example `bun run test`) in the private clone. Those processes execute the reviewed change's own code (tests, install scripts) as ordinary host processes with the operator's filesystem authority. A reviewed test that writes to an absolute path can therefore change the operator checkout. INV-001 says a QM run cannot change the reviewed checkout "by construction". The spec excludes an OS sandbox.

**Mitigation already in progress (derived, D-025 amendments).**
- The check argv is base-owned (TASK-736).
- The QM runtime (definitions, prompts, project domains) is base-owned (TASK-737).
- Changes to check-referenced scripts and runner files are gate-owned human items that block `ready` (TASK-737).
- Review materials are digest-verified before the QM reads them (TASK-737).

What remains is only that the base commands execute the reviewed code (tests, install hooks) with host authority.

**Options:**
- **A (recommended).** Record an INV-001 interpretation beside the Intent, like D-021. INV-001's by-construction guarantee covers the QM, its agents and the host code. Host-run project checks execute the reviewed change's code with the operator's own authority, the same trust as the operator running those tests, and the report says so explicitly. Nothing else changes.
- **B.** Require OS-level sandboxing for prepare and checks. This reverses a spec exclusion, is platform-specific, and is new scope.
- **C.** Drop host-run checks from the QM, so the caller runs the checks. This amends AC-016 ("the QM's project checks keep working").

**Consequence for this branch either way.** With base-owned config and `main` having no `qualityReview` block, a QM review of this branch reports checks and model as "not configured" (D-019) and cannot be `ready`. That is visible and expected until the branch merges.

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
