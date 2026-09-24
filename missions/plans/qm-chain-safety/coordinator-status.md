# qm-chain-safety — coordinator status

Branch `feature/qm-chain-safety`, off local `main` at `29fc0ce`. Not pushed, not merged.
HEAD is the commit that last touched this file (`git log -1 -- missions/plans/qm-chain-safety/coordinator-status.md`) or a later Drive commit. Check `git status` and `git log`.

## State (2026-09-24, late) — SUCCESSOR HANDOFF #2 from session "qm-implementer"

### One-paragraph summary

- **Stages 1–6 are CLOSED.** Both channels gave SHIP at `mid-review-10-{codex,claude}.md`.
- **Stage 7 is implemented:** TASK-726, TASK-746 and TASK-747. TASK-748 (the D-031 calibration floors) is running or has just landed. Stage 7 review 3 decides Stage 7.
- **Not started:** Stage 8 (TASK-727, archive plus callers) and Stage 9 (TASK-728, independent closure, done by the coordinator under D-002).
- **Branch:** `feature/qm-chain-safety`. Never pushed or merged. Commit only with explicit paths.
- **Human rulings:** all four (N-001..N-004) plus the threat model were ruled on 2026-09-24 and recorded as D-027..D-030. Nothing is open for the user.

### Gates, last full run (after TASK-747)

- typecheck 0, lint on tracked paths 0.
- tests 3294/3295. The one failure is the known `validate-harness-exports` timeout flake, which passes in isolation.
- `check:suppressions -- --base main` passes.
- Changed-scope audit vs `main` with the committed baselines passes (0/0/0). Command: `npx fallow audit --base main --dead-code-baseline .fallow-baselines/dead-code.json --health-baseline .fallow-baselines/health.json --dupes-baseline .fallow-baselines/dupes.json --format json`.
- **Lint caveat:** `bun run lint` reports one error, in Shepherd's gitignored backup `.shepherd/backups/cosmonauts-packages-coding-2026-09-23/`. Lint tracked paths with `bunx biome check lib/ domains/ cli/ tests/ scripts/ bundled/`.

### Task ledger

All tasks have label `plan:qm-chain-safety`.

| Task | State | Commit | Notes |
|---|---|---|---|
| 720–725 | Done | see git log | Stages 1–6 |
| 729–738 | Done | | Stage 6 remediation rounds from mid-reviews 1–6 |
| 739 | Done | `0211d79` | Refresh script analyzes `--base`; docs follow D-029 |
| 740, 741 | Done | `351bf09`, `473178f` | Introduced-debt paydown |
| **742** | **Done** | `0b5e7d1`, `7e75231` | See note below |
| 743–745 | Done | `5c9ee93`, `ed9c674`, `237a3d9` | From mid-reviews 7–9 |
| 746 | Done | `2082356` | Test hardening |
| 726 | Done | `cdba7e1` | **Stage 7** |
| 747 | Done | `fde1063` | From Stage 7 review 1 |
| 748 | Done | `953d0f9` | D-031 floors, from Stage 7 review 2 |
| 749 | Done | `3ac2e24` | From Stage 7 review 3 |
| 750 | Done | `6733eae` | D-032, from Stage 7 review 4 |
| 751 | Done | `7ed6c05` | Review 5 closure items |
| 752 | Done | `88f272d` | Anchored section lookup (review 6) |
| 753 | Done | `843abeb` | Anchored plan summary, whitespace headings (review 7) |
| 754 | Done | `e4ad5dd` | Heading scan at EOF (review 8) |
| 755 | Done | `cf68b25` | One heading definition, normalized input (review 9) |
| 756 | Done | `9f3340c` | Plan-summary fidelity, anchored index marker (review 10) |
| 757 | Done | `4ceb768` | Malformed index lines fail safe (review 11) |
| 758 | Done | `9a45d1c` | Single-line Reason/Verdict rewrite, indented marker (review 12) |
| 727 | To Do | — | **Stage 8.** Depends on 758 (all done). **Next.** Coordinator note added (`f17cf51`). |
| **728** | In Progress | — | **Stage 9 closure.** Coordinator-run, per D-002 |

**TASK-742 note.** The worker returned "partial" only because its full-suite run hit the runner-injected `COSMONAUTS_DRIVER_CODEX_ARGS` artifact. The coordinator verified all its criteria and committed the work in `0b5e7d1` and `7e75231`. Marking it Done, a coordinator regex bug left `status: Done Progress`, which the task parser reads as To Do. Fixed on 2026-09-24 in the handoff commit. It is Done.

### Decisions added during implementation (plan Decision Log)

- **D-025** (coordinator, amended four times).
- **D-026** "review before execution" (coordinator).
- **D-027..D-030**, human rulings:
  - D-027: threat model is accidental damage only.
  - D-028: INV-001 interpretation for host-run checks, plus a disclosure in every report.
  - D-029: baselines re-anchored at `main` `29fc0ce`.
  - D-030: amendment-3 ratified; stray catalog package.
- **D-032** (coordinator, 2026-09-24). Findings is fail-safe, and dismissals live only in Out-of-range observations. Supersedes D-031's placement of dismissals.
- **D-031** (coordinator). B-010 host calibration is defense in depth, with hard floors: no false `ready`, and no silently dropped finding. Measured-cost and closure-evidence text heuristics are recorded limits. **Do not reopen them.**
- Spec additions beside the Intent: the D-028 INV-001 interpretation and the D-027 threat model.

### Review record

- `mid-review-{1..10}-{codex,claude}.md` and `stage7-review-{1,2}-{codex,claude}.md`, each with its `*-prompt.md`.
- Condensed Claude files are marked as condensed.
- Prompts from round 7 on carry the D-027 threat model. Reuse them.

### Next steps for the successor

1. **Stage 7 review 3.** Its result is recorded below, if this session got that far. If it is SHIP, go to step 2. Otherwise remediate its findings through a task, respecting D-031 (floors only), then re-review focused.
2. **Stage 8, TASK-727.** Read its task file. Update its description with a coordinator note like TASK-726's, covering D-025..D-031 and base-owned config. Then Drive it, and run a two-channel review.
   - In particular, `external-commands/implement-plan.md` must describe the review-only QM and D-002-style substitution. Named chains end at findings.
   - Link repair follows D-022.
3. **Stage 9, TASK-728 closure** (coordinator, never the QM). Two channels, full outputs saved as `closure-review-<n>.md`. Execute the TASK-728 AC #6 attack list, bounded by D-027: hostile-only routes are residuals.
   - That includes one real end-to-end QM run on a dirty checkout, with before/after hashes. N-003 is resolved: the stray package was moved, so the bundled definitions resolve.
   - Note that `qualityReview` is base-owned. A QM review of this branch against `main` reports checks and model as "not configured", which is expected.
4. When all tasks are Done, gates are green and the closure reviews say SHIP, reply "branch verified" to Shepherd. Do not push, merge or open a PR.

### Mechanics

- **Drive:** `COSMONAUTS_DRIVER_CODEX_ARGS="-m gpt-6-sol -c model_reasoning_effort=medium" cosmonauts run drive --plan qm-chain-safety --task-ids <ids> --backend codex --mode detached --branch feature/qm-chain-safety --task-timeout 7200000`.
  - Poll `missions/sessions/qm-chain-safety/runs/<runId>/events.jsonl` for `run_completed|run_aborted|task_blocked`.
  - `--resume` only replays. Relaunch with `--task-ids`; the worker continues from uncommitted partial work.
  - After each run, commit any stranded `missions/reviews/knowledge-surface-backfill-amendment-3.md` digest change. Check it equals `shasum -a 256 .cosmonauts/config.json`.
  - Workers that report "partial" only because of the runner-args test artifact: verify yourself.
- **Codex review:** `codex exec -m gpt-6-sol -c model_reasoning_effort=high --sandbox read-only "$(cat prompt)" < /dev/null > log 2>&1`. The final message follows the last line that is exactly `codex` and precedes `tokens used`.
- **Claude review:** a general-purpose subagent, read-only, with probes in the scratchpad. Mutation-check the tests.
- **Task batches:** `cosmonauts task create --from-file <yaml>`, with single-line ACs.
- **Workers:** tell them to run the suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`.
- **Known flakes:** `cross-plan-commit-lock`, `plans/archive`, `extensions/project-tools`, `validate-harness-exports` and `project-tools-fallow-fixtures`. They are timeouts under load; re-run them in isolation.

### Follow-ups (not in this plan)

- Find what wrote `~/.cosmonauts/packages/coding` at 2026-09-23 16:44Z. It is possibly a test writing to the real HOME (D-030).
- Biome lints the gitignored `.shepherd/` backups. Consider moving backups outside the repository.

### Stage 7 review 3 (session qm-implementer-2)

- **Gates after TASK-748:** all green.
  - typecheck 0, tracked lint 0, suppressions pass, audit vs `main` passes.
  - Suite 3305/3305.
- **Both channels: DO-NOT-SHIP-YET** (`stage7-review-3-{codex,claude}.md`).
  - **HIGH:** TASK-748 made only `- ` bullets block `ready`. A finding written as a numbered item, a `*` bullet or prose now reaches `ready`. That breaks D-031 floor 1.
  - **HIGH:** the dismissal of an ID also closes an open entry with the same ID.
  - Plus a duplicate-P0 cap escape and LOWs.
  - **Test gap:** replacing the Findings condition with `false` left the full suite green.
- **Remediation:** TASK-749 (`3ac2e24`). Gates green, suite 3328/3328.

### Stage 7 review 4

- **Both channels: DO-NOT-SHIP-YET** (`stage7-review-4-{codex,claude}.md`).
  - False `ready` through closure parsing inside Findings: an indented sub-finding riding a closed entry, keyword-only closure (`still open ... dismissed`), and closure that depends on reviewer order.
  - A cap applied to Gates instead of Findings.
- **Coordinator decision: D-032, amend-on-record** (Shepherd concurred, `d58a292`).
  - Findings blocks `ready` on any content except `None recorded.`.
  - Dismissals live only in Out-of-range observations: a positive dismissal word after the ID, and other-lens evidence checked independently of order.
  - The cap applies only to Findings and Out-of-range.
  - An unknown `##` section with content blocks `ready`.
- **TASK-750** implements D-032; Drive `run-0cc1611e-bcb2-4ca5-bfb7-01502d8fc5ba`. TASK-750 landed as `6733eae`. Gates are green and the suite is 3358/3358.

### Stage 7 review 5

- **Claude: SHIP**, with LOWs.
- **Codex: DO-NOT-SHIP-YET**, with two findings:
  - a duplicated `## Findings` heading is not inspected;
  - generalist performance P0 is not capped.
- **D-032 gained two notes** (`fd9cdbe`):
  - a duplicated section heading blocks `ready`;
  - the host cap works by lens identity, and non-performance-lens performance claims are a recorded limit covered by prompts.
- **TASK-751** is the final small round.

### Stage 7 reviews 6–9 (heading-shape edge cases; each round smaller)

- **Review 6.** Codex: no code findings. Claude: unanchored section lookup. → TASK-752.
- **Review 7.** Claude: SHIP. Codex: the plan summary is still unanchored. → TASK-753.
- **Review 8.** Claude: SHIP. Codex: duplicate heading bare at EOF. → TASK-754.
- **Review 9.** I asked for one complete pass over the heading functions. Both channels found the same class: inconsistent heading definitions (CRLF, empty title, tab, non-breaking space, text after the index). → TASK-755 fixes it structurally, with normalized input and one heading predicate.
- **Reviews 10–12:** each found one smaller edge case, fixed by TASK-756..758.

### Stage 7 CLOSED: review 13, both channels SHIP (HEAD `20b0311`)

- **Gates:** all green.
  - Suite 3400/3400.
  - Audit vs `main`: pass.
  - Typecheck 0, tracked lint 0, suppressions pass.
- **Residuals recorded:**
  - the D-031/D-032 text limits, plus the host-owned Reviewer models section;
  - the public `runQualityReview` port without `hostChecks`, where the production launcher enables them;
  - the generic reason given for a malformed marker;
  - three end-to-end "empty Reason" tests that are shielded, with unit tests guarding instead.
- **Next:** Stage 8, TASK-727.

### Stage 8 CLOSED — review 2, both channels SHIP (`61ac478`)

- Review 1 (both channels DO-NOT-SHIP-YET) found stale QM caller prose and no named-chain entry-point test. TASK-759 fixed both.
- Review 2: both channels SHIP. TASK-760 then fixed its two LOWs.

### claude-cli backend findings (Drive trial, TASK-761, run-f22e320f, 2026-09-24)

- **Events:** a clean transition sequence: run_started → task_started → preflight passed → spawn_started → spawn_completed → commit_made → task_status → task_done → state_commit → run_completed. No stuck `running` step, nothing uncommitted from the worker, task status Done.
- **Commit:** `74892bc`. It changes only `tests/orchestration/quality-review-run.test.ts`, which matches the AC scope.
- **Verification:** the coordinator confirmed with an isolated `TMPDIR` that 0 workspaces leak (153/153 tests).
- **Minor issue:** the worker's commit subject is truncated mid-word ("…; production u"). Cosmetic.
- **Minor issue:** the worker added no explicit leak assertion. The coordinator's isolated-`TMPDIR` measurement serves as the AC #1 check.
- **Verdict:** usable. Keep using it with `COSMONAUTS_DRIVER_CLAUDE_ARGS="--model claude-opus-5-5"`.

### Stage 9 (TASK-728) — in progress

- Closure prompt: `closure-review-prompt.md`. Two channels are running closure review 1; the outputs go to `closure-review-1-{codex,claude}.md`.
- The real end-to-end QM runs in a dirty scratch clone at `cca8f7d` with before/after snapshots. Script: `scratchpad/e2e/snapshot.sh`. Evidence goes to `closure-e2e.md`.

### Spec-to-backlog history

| Step | Commit |
|---|---|
| Phase 1 planner chain | `37ad121` |
| Phases 2–3: independent review and revision | `ad7c3e1` |
| Human rulings recorded | `75f4d11`, `d2b4541` |
| Backlog (TASK-720..728) | `6c226ea` |
| Compliance patches + plan D-024 | `4b93788` |

## Needs the user

### N-005 (RULED 2026-09-24 → D-033): the D-002 codex closure channel is out of usage until 2026-09-30 10:29

**Ruling (user, via Shepherd):** switch everything that used codex to Opus 5.5. Drive uses `--backend claude-cli` on Opus 5.5. Reviews use two independent Claude subagent channels on Opus 5.5, with different framings. **The cross-family codex closure review is PENDING until 2026-09-30.** Do not merge.

`codex exec` returns "You've hit your usage limit ... try again at Sep 30th, 2026 10:29 AM". D-002 (ratified) names that exact command as the second closure channel for TASK-728. The TASK-760 worker failure has the same cause. The Claude closure channel and the real end-to-end QM run are proceeding.

Options:
- **(A) Wait (recommended).** Run the codex closure channel after the limit resets. The branch stays unmerged and nothing else is blocked. Until then, TASK-728 sits at "Claude channel plus end-to-end evidence done; codex channel pending".
- **(B) Top up usage now.** The user buys Codex credits, and the codex channel runs today.
- **(C) Substitute the second channel.** For example, a second independent Claude reviewer on a different model, or `codex exec` through an API key. This amends ratified D-002 and needs a human ruling.


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
