---
description: Drive an existing cosmonauts plan to a clean, fully-verified feature branch — Drive (codex) → ground-truth gates → Quality Manager → independent codex review — then stop and report. Does not push, merge, or open a PR unless explicitly told.
argument-hint: <plan-slug> [backend=codex]
---

# Implement a cosmonauts plan

You are coordinating the implementation of an **existing** cosmonauts plan and driving it to a clean, fully-verified feature branch. You **orchestrate and verify** — you do **not** hand-implement the feature yourself; Drive's backend workers write the code. Seeded from the task-id-system run; improve/fork freely.

**Inputs**
- Plan slug: `$1` (required).
- Backend: `$2` (optional; default `codex`; may be `claude-cli`).

**Preconditions (check first; stop with a clear message if unmet)**
- You are at the root of a cosmonauts project (`missions/` exists) and the `cosmonauts` CLI is on PATH. If unsure how to drive the CLI, load the `cosmonauts` skill.
- The plan, spec, and **tasks already exist and are reviewed**. This command *implements*; it does not plan. If `cosmonauts task list --label plan:$1 --json` is empty, stop and say so.
- For the default backend, `codex` must be available; the review phase always uses `codex exec`.

**Portability rules (this runs in any repo — do not hardcode)**
- **Base branch:** detect it, don't assume `main`: `git symbolic-ref refs/remotes/origin/HEAD` → strip to the branch name; fall back to a local `main`/`master`. Call it `BASE`. Reconcile all review against **local `BASE`**.
- **Gate commands:** discover the project's typecheck / lint / test commands from `package.json` "scripts" (or the project's docs/AGENTS.md) — e.g. `bun run test` vs `npm test` vs `pnpm test`. Never assume a package manager.
- Keep everything stack-agnostic; refer to "the project's type-check/lint/test gates," not a specific command, when reasoning.

---

## Phase 0 — Orient & confirm

1. `git status` — worktree should be clean; note the current branch and where `BASE` points.
2. Read `missions/plans/$1/plan.md` and `missions/plans/$1/spec.md`. Note behaviors (e.g. `B-001…`), acceptance criteria, the quality contract, and any explicit **out-of-scope** items and risks — you will hold workers to these.
3. `cosmonauts task list --label plan:$1 --json` — confirm every task the plan implies is present, all **To Do**, dependencies form the expected DAG, and the behavior markers (`@cosmo-behavior plan:$1#B-…`) are all accounted for.
4. Capture a **baseline** of the gates (at least type-check) so later regressions are attributable. If the base is already red, note it — you may need to fix pre-existing breakage to reach "green," and you must call that out (it is not scope creep).
5. Create/checkout the feature branch: `feature/$1` off `BASE`.

## Phase 1 — Drive

1. Launch detached:
   `cosmonauts run drive --plan $1 --backend ${2:-codex} --mode detached --branch feature/$1`
   Capture the `runId` and `eventLogPath` from the launch output.
2. **Monitor the event log, not just status** — `run status` lags the event log. Poll `cosmonauts run status <runId>` **and** tail `missions/sessions/$1/runs/<runId>/events.jsonl`; track per-task `task_started` / `task_done` / `blocked`. Prefer a background watcher that blocks until a terminal state (`completed`/`blocked`/`aborted`/`dead`/`finalization_failed`) or a long timeout, so you are re-invoked on a real transition. **The detached launcher exiting is NOT the run finishing.** Tasks run sequentially.
3. **On stall/abort** (done-count frozen, nothing in-progress): diagnose immediately. If the plan edits code the repo dogfoods, a self-referential break is possible — check the type-check gate, look for a stale path/import, fix, commit, relaunch (Drive re-resolves ready tasks).
4. **On `finalization_failed`:** inspect `drive status` / `events.jsonl` for the failed phase, then `cosmonauts run drive --plan $1 --resume <runId>`.
5. **After completion, sweep for Drive boundary artifacts.** Drive treats `missions/tasks/` as task-state and **excludes it from per-task source commits** — a worker's legitimate edit to a file there (e.g. `missions/tasks/config.json`) can be left **uncommitted**. Run `git status`; if the intended end-state is stranded in the worktree, commit it yourself with a clear message.

## Phase 2 — Ground-truth gates + Quality Manager

1. Run the gates yourself for ground truth: type-check, lint, full test suite — all green. Read the final result line; don't trust captured fixture output that merely *looks* like a failure.
2. Run the plan's completeness checks: behavior markers present in the referenced tests; greps for symbols the plan said to remove; any byte-identical / no-churn / no-new-file guarantees the spec makes (verify with `git status` + `git hash-object` before/after a representative action). Clean up any throwaway artifacts you create.
3. Run the Quality Manager:
   `cosmonauts run chain "coding/quality-manager" "<scope prompt>"`
   In the prompt: name the plan and its behaviors; **tell it to reconcile against LOCAL `BASE`** (origin may lag — otherwise it flags already-merged commits as out-of-scope); restate the out-of-scope items; and disclose any known-accepted deviations (e.g. fixing a test that was already broken on `BASE`).
4. The QM tends to **under-remediate** — independently fix any real finding it surfaces, then re-run gates. Loop until it is clean. If the QM creates remediation tasks, watch that those creates behave correctly (they dogfood the task system).

## Phase 3 — Independent codex post-review

1. Run an independent review over the branch diff vs local `BASE`:
   `codex exec --dangerously-bypass-approvals-and-sandbox "<review prompt>" < /dev/null`
   **Close stdin (`< /dev/null`)** or it hangs. Redirect output to a file — it can be large; read the **tail** for the findings + verdict.
2. In the prompt: read-only review; diff against **local `BASE`** (state that origin lags and those commits are out of scope); verify spec/plan conformance, each behavior, the plan's key guarantees, no out-of-scope work (flag any), and correctness/concurrency/dead-code. Ask for severity-ranked findings and a SHIP / DO-NOT-SHIP verdict.
3. Triage findings against ground truth. Fix the real ones, re-run gates, and record accepted/rejected dispositions. Consider saving a short review record under `missions/plans/$1/` for traceability.

## Phase 4 — Report & stop

- **Improvement pass (living-memory LM-D-008).** Before reporting, run a read-only distiller-style pass over the run: re-read `events.jsonl` and the task notes — open Tier-2 transcripts only where something needs explaining — and extract *prescriptive* observations: friction, dead ends, driver/tooling defects, anything that should change. If (and only if) there is signal, write `missions/reviews/improvements/<runId>.md` with frontmatter `kind: drive-improvement-observations`, `status: open`, plan and run ids, and a four-column body (*observed problem → what happened in this run → suggested improvement → why it helps*) plus ranked follow-ups and explicit non-goals. Bounded and lossy by default: cap it around 8 rows, and an empty pass writes nothing. Commit it with the other artifacts.
- **Stop at a clean, fully-verified `feature/$1` branch. Do NOT push, merge, or open a PR** unless the user explicitly asks. (If they do, prefer a fast-forward onto `BASE`; report exactly what will be published — check `git rev-list --count origin/$BASE..$BASE` first.)
- Report: all tasks Done; gate results; the no-churn / plan-specific guarantees you verified; QM verdict; codex findings + dispositions; and anything still open.
- Offer, as an explicit follow-up (do **not** do it unattended): archive the plan (`cosmonauts plan archive $1`) and distill a `memory/$1.md` per the archive skill.

## Guardrails

- **Scope creep:** flag and reject any worker change outside the plan's stated behaviors/scope (renumber-style features, speculative additions). Distinguish *pre-existing-broken-on-`BASE`* tests (fix to reach green, and say so) from genuinely new breakage.
- **`codex --yolo` workers do broad git ops** — keep the worktree committed between phases so an unrelated edit isn't wiped.
- Commit driver/QM/review artifacts you produce; never commit secrets. Session transcripts under `missions/sessions/` are gitignored — leave them.
