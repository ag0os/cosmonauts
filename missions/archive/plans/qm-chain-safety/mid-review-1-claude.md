---
kind: independent-review
plan: qm-chain-safety
channel: Claude subagent reviewer (general-purpose, read-only)
scope: Stages 1-6, e43c238..b437cd1
date: 2026-09-24
---

# Mid-branch review 1 — Claude reviewer

The prompt is `mid-review-prompt.md`. The reviewer's final message follows verbatim.

**Verdict: DO NOT SHIP YET (Stages 1–6).** One high-severity defect alone blocks shipping: analysis gates never run in real QM sessions. Two more HIGH findings break ratified plan decisions.

The authority work is sound. `chain_run`, `run_driver` and `spawn_agent` all check the caller's allowlist through one function (`authorizeAgentStart`). The QM session gets only read, grep, find, ls, the analysis tools and a `spawn_agent` limited to the four lenses. Reviewer evidence is written by the host, from the observed child, before the QM is told the child finished. The source capture only reads (with `GIT_OPTIONAL_LOCKS=0`) and uses a private clone with `origin` and the reflog removed. The 58 focused tests pass (`quality-review-*`, `orchestration-authority`, `quality-review-cli`).

### HIGH

**H1 — Analysis gates are never evaluated in a real QM run (breaks AC-016, D-004, B-006).**
- `lib/orchestration/quality-review-run.ts:218` builds a consent authorization for the snapshot. It is only passed to `execute` and disposed at `:515`.
- Nothing calls `authorizationFor` (a grep of `lib`, `domains`, `cli` and `bundled` finds only the definition). The default `execute` in `quality-review-launch.ts:144-156` doesn't even pass it into the QM's context.
- The Fallow provider checks consent from disk for the project's real path (`fallow-provider.ts:760` and `:1509-1529`). That path is now `/tmp/cosmonauts-qm-<runId>/checkout`, which can never have consent.
- **Failing scenario:** an operator who has consented runs `cosmonauts -a coding/quality-manager`. Every gate comes back `unbound` / `execution-not-consented`. The host doesn't block `ready` on unbound gates, only on an empty Gates section (`:361-371`).
- The only end-to-end test, `quality-review-one-pass.test.ts`, mocks the spawner and fakes the analysis events, so it cannot catch this.

**H2 — The QM prompt hands it a path into the operator's checkout (breaks D-004 and D-006; R-012 says a path visible to an agent should fail the run).**
- `quality-review-launch.ts:167` puts `${context.hostRunStoreRoot}/artifacts/qm/checks.md` into the QM prompt.
- `hostRunStoreRoot` is `run.runDir` (`quality-review-run.ts:283`), which is `<operator projectRoot>/missions/sessions/chain/runs/<runId>`.
- The QM therefore sees the source root and the run store, which holds `reviewers/*.md` and `final.md`. Pi's `read` tool accepts any absolute path (`path-utils.js` `resolveToCwd`), so the QM can read the live, drifting operator tree instead of the snapshot.
- `checks.md` needs to reach the QM as review material. It can't simply be dropped in: the materials directory is set read-only (0500) at `workspace.ts:391`, before the checks run.
- Minor aggravation: when Cosmonauts reviews itself, the skill locations in the system prompt also point into the operator checkout, because `frameworkRoot` resolves from `import.meta.url`.

**H3 — The review base is the tip of `main`, not the merge-base (breaks D-004 "same order as today's QM prompt"; hurts AC-016 and the report's accuracy).**
- `quality-review-workspace.ts:302-311` takes the SHA of `refs/heads/main` and diffs against it (`git diff --cached base`, `:332` and `:337`). That same SHA is passed to checks as `{base}` and enforced for `analysis_audit` (`launch.ts:26-37`).
- The QM prompt at `e43c238` required the merge-base with the local base branch, and said to treat base-side-only commits as outside the review. No merge-base is computed anywhere in `quality-review-*.ts`.
- **Failing scenario:** a feature branch forks at M1, then local `main` advances to M2 by changing `.fallow-baselines/dupes.json`. The QM diff shows that change reversed, and the host adds a false "gate-owned file changed" human item, forcing `not-ready`. Reviewers also see M2's work as reverse changes. This is the known "stale-base false alarm" failure mode.

### MEDIUM

**M1 — The host's lens triage replaces the QM's judgment and is too coarse (AC-016 "panel triage keeps working").**
- `triageReviewLenses` (`launch.ts:197-210`) uses keyword regexes, and `spawn-tool.ts` denies any lens not in `allowedLenses`, so the QM cannot add a specialist it judges applicable.
- The UX lens only fires on `.tsx`/`.jsx`/`.css`/`.html`/`.erb`/views/`<form`. The old triage also covered CLI help text, flags and API shapes.
- Security has no trigger for dependency bumps or for `spawn`/exec/path-handling code.
- **Failing input:** a diff that only changes `cli/main.ts` help text and flags gets no UX review, and the QM cannot request one.

**M2 — Specialist lens capability was not preserved (AC-016), and direct reviewer spawns are broken.**
- The four reviewer prompts shrank from about 170 lines each to 3–5 lines. Lost:
  - security's six-dimension checklist (input validation, authorization/IDOR, injection, secrets, dependencies, blast radius);
  - the "confirm the lens applies / no findings in scope" step and calibrated-severity guidance;
  - UX coverage of CLI and API surfaces.
- All four now say "Your cwd is the private snapshot checkout. Read the host-supplied materials… Do not… run commands."
- `cody` (`bundled/coding/agents/cody.ts:35-44`) and `cosmo` (`domains/main/agents/cosmo.ts:26-35`) still spawn these reviewers directly, with their ordinary "coding" tools. There are no materials there, and running commands (so no `git diff`) is forbidden. A directly spawned reviewer can no longer obtain the diff unless the caller pastes it.

**M3 — Cancellation is ignored for the whole assessment (design §5 terminal matrix; liveness).**
- `launch.ts:164` calls `spawner.spawn` without `signal`.
- `runQualityReviewChecks` and the prepare step (`processOutput`) take no signal either.
- `runQualityReview` checks `signal.aborted` only at entry and after assessment (`:196`, `:339`).
- A chain timeout or caller abort therefore waits for install, the full check suite and the whole panel before reporting `cancelled`.

**M4 — Check and prepare timeouts don't bound the run, and can leave orphaned processes in the clone.**
- `quality-review-checks.ts:41-44,61` and `quality-review-workspace.ts:64-67,74` send SIGKILL to the direct child only, then wait for `close`, which needs every stdio pipe holder to exit.
- This repository's `test` check is `bun run test` → `node scripts/vitest-runner.mjs` → `vitest` (with `stdio: "inherit"`). Killing `bun` orphans node and vitest, which keep the pipe open, so the timeout never resolves the check.
- There is no process-group kill (`detached` plus `kill(-pid)`).

**M5 — A workspace-cleanup failure destroys a completed verdict (B-004, INV-003, design §3 ordering).**
- `quality-review-run.ts:516-535` removes the workspace before replacing the plan summary and `final.md`. Design §3 orders it: replace the report, append `finalized`, then remove the workspace.
- If `removePrivateReviewWorkspace` throws, the catch at `:567` leaves `final.md` as the provisional "failed: Assessment did not complete" and resets the summary to failed. A finished `not-ready` report with findings survives only in `raw-final.md`.
- Example: `rm -r` fails with ENOTEMPTY because an orphan from M4 is still writing into the clone.

**M6 — The suppression check misses directive forms TypeScript honours (B-008, AC-011).**
- `lib/quality/suppression-policy.ts:57-66` strips a leading `//` or `/*` and then requires the comment to start with the family name.
- TypeScript also honours `/// @ts-ignore` and `/** @ts-ignore */`. I checked in the scratchpad: with both forms on type errors, `tsc --noEmit --strict` exits 0, and `scanSuppressions` reports only the plain `// @ts-ignore` line.
- **Failing input:** an added `/** @ts-ignore */` passes `scripts/check-new-suppressions.ts` without a registry entry.

### LOW

- **L1 — The plan summary gets reviewed as part of the change.** It is created before capture (`quality-review-run.ts:158-172`, versus the snapshot at `:210`). `missions/plans/*/qm-runs/` isn't gitignored, so each plan-scoped run captures its own provisional summary as an untracked addition in `changedFiles` and `full.diff`.
- **L2 — The model can end a run as `blocked`.** A QM report saying `Verdict: refused` is accepted (`report.ts:65`), skips the host check block (`run.ts:357`) and becomes outcome `blocked` / `wait_for_human`. The matrix reserves `refused` for host isolation or preparation refusals.
- **L3 — Late reviewers write into a finished run.** A panel child that times out and later finishes still calls `artifactSink.writeReviewer` (`spawn-tool.ts:189-201`). That adds `reviewers/<lens>.md` and an `artifact_written` event after the run's terminal event. D-011 defers late delivery, but here the write actually happens.
- **L4 — Caller parameters are silently dropped for the QM.** The QM path ignores the caller's `prompt`, `spawnTimeoutMs` and model (spawn-tool QM branch `:744`, chain runner, CLI). The QM panel always gets the default 5-minute completion timeout, so reviewers on large diffs time out and the workspace is retained.
- **L5 — A test-only port sits in production types.** `ChainConfig.qualityReview.execute` (`types.ts:123`) and `hostChecks?` ("legacy injected assessment tests") are never set outside tests. The non-`hostChecks` path skips every host blocking rule.
- **L6 — Over-broad gate ownership.** `isGateOwnedFile` flags any `.cosmonauts/config.json` change, not just the `qualityReview` block (`run.ts:668`), so unrelated config edits force `not-ready`.
- **L7 — Unprotected route.** `/agent quality-manager` in the interactive TUI starts a QM with the restricted profile but no snapshot or report. Analysis runs against the operator checkout. It is not a B-002 entry point but is outside the launcher.
- **L8 — Scope note.** `StepResult.childRun` (`lib/durable-runtime/types.ts:189`) is a new generic runtime field, beyond "expose existing step artifact refs".

### Checked and not reported
- **Authority:** sequential, bracket and fan-out stages are authorized in `chain_run` before any run is allocated, and an unknown caller fails closed. `run_driver` is gated before plan validation.
- **Snapshot mechanics:** a second sample must match the first, with up to three attempts, plus a re-check after the clone. Linked worktrees, sparse checkouts, submodules, gitlinks and unsafe symlinks are refused. The clone's reflog is removed.
- **Reviewer evidence:** created exclusively, digest-checked and correlated by run.
- **Artifact writes:** the artifact sink's path checks hold.
- **Report and summary writes:** the provisional `final.md` exists before any fallible work, and `final.md` is replaced atomically.
- **Run status:** `run status` / `run_status` point to `qm/final.md`.
- **Baselines:** the manifest digests match the three baseline files.

I made no changes to the repository. Scratchpad probe files were written only under `/private/tmp/.../scratchpad/supp/`.
