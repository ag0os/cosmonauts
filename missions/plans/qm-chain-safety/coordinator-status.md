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
- **Mid-branch review 2** (re-review of TASK-729..732), both DO-NOT-SHIP-YET: `mid-review-2-codex.md` and `mid-review-2-claude.md`. Most round-1 findings are RESOLVED. New findings:
  - codex HIGH: deadline race; missing `gateState` fails open.
  - Claude HIGH: the suppression scanner regressed from 23 to 15 directives.
  - MEDIUM: a late-reviewer window; source-root skill paths in panel system prompts; detached check groups outlive Ctrl-C.
  - **Dispositions:** TASK-733 (settle, seal, hide, plus LOW L1/L3/L4/L6) and TASK-734 (parser-based scanner plus a repo-level registry-equality test).
  - **Accepted with record:**
    - Claude L5 (materials writable during checks): same-uid bits were never a boundary.
    - The residual own-process-group grandchild (codex): a configured check that deliberately detaches cannot be bounded without an OS sandbox, which the spec excludes.
    - Claude round-1 L4 remainder (caller prompt and model dropped): scope is host-determined by design, and the model is Stage 7.
  - My earlier acceptance of round-1 L5 (the `execute` port) is withdrawn. TASK-733 #2 closes it.
- **Done:** TASK-734 `e6c89ff`, TASK-733 `4fbf361` (state `8ef7a8f`). Gates: typecheck 0, lint 0, tests 3206/3206, suppressions pass.
- **Mid-branch review 3**, both DO-NOT-SHIP-YET; the Claude channel says "close". Files: `mid-review-3-codex.md`, `mid-review-3-claude.md`. Every round-2 finding is RESOLVED.
  - **New findings:**
    - codex HIGH: unbounded seal wait; workspace removal runs before the terminal event.
    - MEDIUM: SIGINT/SIGTERM swallowed; the triage floor drops `lib/memory`, deletions and prompts; failed-audit reporting vs D-025.
    - Both channels reject my grandchild acceptance: bound the wait on exit, not on close. codex also rejects the prompt-drop acceptance.
  - **Dispositions:** D-025 amended on record (a bound failing audit is a gate failure with findings, not a human item). TASK-735 covers all of it. Accepted with record: Claude NEW-L3 (JSX text false positive errs toward safety) and round-2 L5 (both channels agree it is sound).
- **Done:** TASK-735 `a9725bf` (state `1e00833`). Gates: typecheck 0, lint 0, tests 3222/3222.
- **Mid-branch review 4**, both DO-NOT-SHIP-YET (Claude: no HIGH, three small MEDIUMs). Files: `mid-review-4-codex.md` (verbatim) and `mid-review-4-claude.md` (coordinator condensation). Every round-3 finding is RESOLVED or soundly accepted.
  - **New findings:** the operator note leaks the path and carries generated boilerplate; an abandoned write discards the report and its late event can still land; normal-exit group leak; lost `run_*` terminal event (a QM branch in generic runtime); incomplete host audit findings; triage of capability markdown; removal timeout.
  - **Structural (codex):** the `qualityReview` config was read from the reviewed clone.
  - **Dispositions:** D-025 amended (base-owned config, sanitized caller-only note). TASK-736 covers all of it. The residual goes to the human as N-004.
- **Running:** Drive TASK-736, then mid-branch review 5.
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

### N-003 (open, 2026-09-24): an installed catalog `coding` package shadows the bundled one on this machine

`~/.cosmonauts/packages/coding` (installed 2026-09-23 13:44, not by this session) makes the runtime resolve `coding/quality-manager` and the reviewers to the **old** definitions and prompts. The restricted profile still enforces the tool allowlist, so safety holds. But a live QM run on this machine will not use this branch's prompts. TASK-728 #6 needs a real end-to-end QM run.

The user decides one of:
- (a) remove or reinstall that package from this branch before closure;
- (b) run the closure end-to-end with package discovery pointed away from it, if the CLI allows that;
- (c) accept an end-to-end run on the shadowed definitions.

I will not touch `~/.cosmonauts` myself.

### N-004 (open, 2026-09-24): host-run checks execute the reviewed code without an OS sandbox

**Finding.** This is codex mid-review-4's structural observation, confirmed by the coordinator. The QM host runs `qualityReview.prepare` (for example `bun install`) and `checks` (for example `bun run test`) in the private clone. Those processes execute the reviewed change's own code (tests, install scripts) as ordinary host processes with the operator's filesystem authority. A reviewed test that writes to an absolute path can therefore change the operator checkout. INV-001 says a QM run cannot change the reviewed checkout "by construction". The spec excludes an OS sandbox.

**Mitigation already in progress (derived, D-025 amendment).** The check argv is now base-owned (TASK-736), so a change cannot pick its own commands. The reviewed code the base commands execute is the residual.

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
