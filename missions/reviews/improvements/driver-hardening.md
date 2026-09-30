---
kind: drive-improvement-observations
status: open
planSlug: driver-hardening
runId: multiple (16 inline runs under missions/sessions/driver-hardening/runs/; see coordinator-status.md "Implementation log")
recordedAt: '2026-09-29'
---

# Drive improvement observations — driver-hardening

Read-only pass over the 16 Drive runs (12 slices, one follow-up run twice, two live-acceptance runs), the 14 task notes, and the coordinator's implementation log. Bounded to eight rows in the first pass; four rows (9-12) added by the review-phase coordinator after codex rounds 3-4 and coordinator finding C-001, four more (13-16) after Claude review 1, two (17-18) from TASK-811 residuals, one (19) from TASK-812; the plan's own defects (already fixed on the branch) are excluded unless they teach something about Drive or the process.

| Observed problem | What happened in this run | Suggested improvement | Why it helps |
|---|---|---|---|
| Drive's source commit stages every untracked file outside `missions/` and `memory/` (`git add --all -- .`). | Slice 1's commit `d1e53585` swept in the untracked `PI-UPGRADE-STATUS.md`, a file from another branch's work that was sitting in the worktree; the coordinator had to un-track it in a record commit and add it to `.git/info/exclude`. | Stage only paths whose status changed between the pre-spawn `git status --porcelain` capture (Drive already takes it for D-020) and postflight, or refuse to commit when pre-existing untracked files would be included and name them. | A Drive commit should carry the worker's change set, not whatever happened to be lying in the tree. |
| A step failure before spawn surfaces as `run_aborted` "scheduler drained … backend-setup-failure" with no cause. | TASK-803's first run died in `snapshotWorktree` (a git pathspec error). The event log and `run.completion.json` said only "Scheduler drained with pending Drive tasks and no runnable work"; the real error was two files deep in `steps/TASK-803/attempts/attempt-001/result.json`. | When `schedulerAbortDetails` finds a failed drive step with a result summary, carry that summary (and the step id) in the abort cause instead of the generic sentence. | The operator sees the cause in the first place they look. |
| Drive-path fixture repos do not mirror the project shape. | Slice 10's `snapshotWorktree` passed the whole suite and then aborted every real run: the fixtures have no `.gitignore`, so the exclude-pathspec error never fired. The fix needed a new fixture with a gitignored `missions/sessions/` (`tests/driver/worktree-snapshot.test.ts`). | Give the shared Drive fixture a `.gitignore` with `missions/sessions` and `missions/archive/sessions` plus one file under each, and run the detached suites against it too (they exercise the opposite case: non-ignored session dirs written during the run). | The two failure modes found here were each invisible to the other fixture shape. |
| Criteria that enumerate the tests a worker may change cause honest blocks when the list is incomplete. | TASK-803 AC #4 named three defect-pinning tests; a fourth existed, and the worker stopped `blocked` rather than exceed the list. TASK-796 stopped on an apparent AC-009/AC-020 collision that a derived ruling (D-032) resolved. | In task criteria, state the rule ("any test that pins the defect this task removes, citing the criterion") with the known instances as examples, not as an exhaustive list; keep the AC-020 exception rule in one plan-level sentence workers can quote. | Workers are treating the letter of a criterion as binding, which is right; the letter should say what is meant. |
| A live acceptance probe that asks the worker to assert something false does not run. | TASK-804's probe asked for a `failure` report saying an existing file was absent; the worker verified the file, refused ("I cannot submit that claim as a factual failure report"), and blocked. The contradicted-path classifier only needs a path token that exists, so the rebuilt probe named the path truthfully and passed. | Document in the drive skill how to stage a retry probe (name the path as a probe reference; no claim about it) and that real workers will not state falsehoods; never rely on a worker lying. | The next plan's acceptance run starts from a working recipe. |
| The `git stash create` snapshot mechanism sketched in the plan cannot capture untracked files. | Design §7 suggested `git stash create` with `git add -A --intent-to-add`; git refuses (`Entry … not uptodate. Cannot merge`). The shipped mechanism is a temporary index with `core.excludesFile`, `write-tree`, `commit-tree`, `update-ref`. | Record the working mechanism in `lib/driver/README.md` next to the snapshot ref format so the next design that needs a worktree snapshot does not rediscover it. | Saves the failed attempt. |
| Three test suites flaked during postflight or coordinator runs. | `tests/driver/driver-detached.test.ts` `startDetached > escalates an ignored SIGTERM to SIGKILL …` failed twice on unrelated slices and passed on rerun; `tests/driver/cross-plan-commit-lock.test.ts` timed out twice; `tests/driver/parity.test.ts` failed once under the first snapshot fix. Postflight treats one flake as a red gate. | Route to `suite-reliability`: bound the detached abort timing tests on a deterministic signal, and let postflight rerun a failed test file once before declaring the gate red (recording both results). | A slice should not block on a timing test it did not touch. |
| Every run emits two `drive_finalization_evidence` diagnostics for the state-commit finalizer. | `orchestration-events.jsonl` logs "Drive finalize event has no task context for normalized activity" for `finalize` `state_commit` started and passed on every run, and cosmo reports "completed (2 diagnostics)". | Give run-scoped finalize events their own activity kind so they normalize without a task id, or downgrade the diagnostic to debug. | A diagnostic that fires on every healthy run hides real ones. |

| A Drive host loads the source it was launched from, so a run always executes the previous slice's Drive code. | Runs `run-4ac4797c` and `run-fac5ed2b` each exhibited the defect their own task was fixing (unconditional ref deletion, then universal ref retention); the coordinator had to probe the new code by hand to see it live. | The Drive record for a run names the source commit the host loaded (`git rev-parse HEAD` at host start) next to the run id. | Removes a class of false "verified live" readings; the coordinator's own record in this plan contained one until corrected (C-001). |
| A worktree snapshot is a full tree, but its containment check needs only the dirty delta. | D-034/D-035 compared every snapshot path against the final tree; every real Done task retained its ref (C-001), and three review rounds plus two fixtures missed it because no fixture had a worker edit a tracked file after a dirty snapshot. | Drive-path fixtures include a "worker edits a tracked file after a dirty snapshot" case as a standing shape (extends row 3). | The retention signal is only meaningful when ordinary success clears refs. |
| Git text normalization inside the snapshot (codex round 3, finding 1, rejected as a D-020 residual). | Not observed in this repo (no `.gitattributes`, no `core.autocrlf`). | If a project with autocrlf adopts Drive, document in the README that a snapshot holds the bytes a commit would hold. | Sets expectations without replacing the ratified mechanism. |
| A `run_status` polling loop on an aborted run never exits. | A cosmo host from TASK-803's aborted `run-18d6659d` polled for 1 h 40 min until killed by hand at handoff. | `run_status` returns terminal for `run_aborted` and the cosmo print-mode prompt stops on it. | Stale hosts hold the driver lock's pid namespace and burn tokens. |
| The shared provider runner (`domains/shared/extensions/project-tools/process-runner.ts`) never settles when a descendant escapes the process group holding stdio (Claude review 1, F3, pre-existing half). | Reproduced by the reviewer with a `setsid` child; the probe-local runner inherited the same gap (fixed in TASK-811 P3). | Bounded settle deadline after termination, as `runCommand` has since TASK-808 L2. | Every analysis capability call can hang a Pi session today. |
| The containment check compares symlinks and group-only execute bits through `hash-object`/`mode & 0o111`, which never equal the tree entry (Claude review 1, F5, P3). | Conservative over-retention of refs for symlinks under worktree-compared paths. | `readlink` + `hash-object --stdin`; Git's owner-x rule; respect `core.fileMode`. | Retention stays a signal only when ordinary success clears refs. |
| The probe does not detect a test command that moves HEAD (Claude review 1, F6, P3). | A command that commits instrumented bytes is reported `restored: true` although HEAD holds probe code. | Record `rev-parse HEAD` before and after; report movement as a side effect. | Closes the last visible way probe statements can reach history. |
| The probe journal lives under `os.tmpdir()` by plan flow step 4 (Claude review 1, F7, P3, design residual). | A temp-directory purge after a host crash removes the only copy of git-dirty originals and the journal that blocks commit. | Human decision: journal under the project (e.g. `.cosmonauts/probe/`, ignored) or keep as ruled. | Defeats "refuse while a journal is outstanding" only after a crash plus a purge. |
| `appendFinalizationFailure` in `drive-finalization.ts` still embeds its reason unfenced (TASK-811 residual 1; same class as Claude review F2). | The reason can carry git hook output; a `## ` line in it could restructure the notes. Not worker text, so outside TASK-811 P2. | Route through the same fenced record writer. | One choke point for every Drive-written raw text. |
| `parseAcceptanceCriteria` finds `AC:BEGIN`/`AC:END` with `indexOf` over the whole body (TASK-811 residual 2). | A literal marker inside recorded worker text can be misread when the task has no real AC block. | Anchor marker detection to column-0 lines outside fences. | Closes the last unfenced-text parse hazard. |
| The serializer always moves untitled preamble text after the notes, so after one update it re-parses as notes text rather than raw content (TASK-812 residual; bytes survive). | Present since base; TASK-812 Q1 keeps the bytes but not the field. | Serialize raw content where it was found, or forbid untitled preamble in the task format. | Field fidelity, not just byte fidelity, across updates. |

## Ranked follow-ups

1. Abort cause carries the failed step's summary (row 2) — smallest change, largest operator win.
2. Drive fixture shape (row 3) — prevents the class of defect that shipped in slice 10.
3. Stage only worker-changed paths (row 1).
4. Criteria wording rule for defect-pinning tests (row 4) — process, no code.
5. Drive skill: retry-probe recipe and no-falsehood rule (row 5).
6. README note on the snapshot mechanism (row 6).
7. Flakes to `suite-reliability` (row 7).
8. Finalize-event diagnostic noise (row 8).
9. Host records the source commit it loaded (row 9) — every "verified live" reading in this plan depended on knowing it.
10. Standing fixture shape: worker edits a tracked file after a dirty snapshot (row 10).
11. `run_status` terminal on `run_aborted` (row 12).
12. README note on text normalization for autocrlf projects (row 11).
13. Shared provider runner settle deadline (row 13) — a Pi-session hang today.
14. Probe HEAD-movement detection (row 15).
15. Symlink/mode containment identity (row 14).
16. Journal location (row 16) — human decision.
17. Fence the finalization-failure reason (row 17).
18. Anchor AC marker detection (row 18).
19. Preamble field fidelity (row 19).

## Non-goals

- Re-litigating any decision D-001..D-040 or the ratified Intent; the plan's own defects are fixed on the branch and recorded in its Evidence table.
- Changing `lib/durable-runtime/`, `drive-envelope`, or `execution-liveness` scope.
- The observation-4 Biome behavior (Q-003) and the `fallow-provider.ts` warn verdict.
