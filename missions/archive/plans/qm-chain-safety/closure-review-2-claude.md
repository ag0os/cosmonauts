# Closure review 2 — channel A: Claude subagent (Opus 5.5), attack execution

The prompt is `closure-review-2a-prompt.md`. The review ran at `fc2d047f` in a private `--no-hardlinks` clone, not a worktree. This is the final message, condensed by the coordinator; every finding, disposition, attack row and residual is kept.

**Verdict: SHIP.** No HIGH or MEDIUM findings. All four closure-review-1 blockers are resolved, every attack-list item holds, and all gates are green. Three LOW findings remain, and none can produce a false `ready`.

## Closure-review-1 finding dispositions

| Finding | Disposition | Re-run evidence |
|---|---|---|
| HIGH-1: provider-error reviewer counted as complete | **RESOLVED** | A real Pi 0.80.6 `createAgentSession` run with the faux provider and retries on went through `finalAssistantEvidence`: an error after exhausted retries becomes `{failure: "final assistant message error: 429 …"}`, where it was previously `"reviewer completed"`. The 5 failure shapes through `spawn_agent` write no reviewer file, and the verdict is `failed`. Restoring the old fallback fails 5 tests; removing only the error/abort check fails 3. Ordinary spawns are unchanged and pinned. |
| MEDIUM-1: audit findings dropped | **RESOLVED** | `auditFindingsObservation` feeds the gate assessment and report `auditFindings` (`quality-review-run.ts:385`). Removing it fails the real `createPiSpawner` test. |
| MEDIUM-2: `@ts-nocheck` passed | **RESOLVED** | The real script exits 1 on both line and block forms. Removing the family fails 3 tests. |
| LOW-1: renames flagged | **RESOLVED** | `git mv` passes, staged or committed. Adding a directive, or duplicating an identical one, still fails. Removing rename detection fails 2 tests. |
| LOW-2: block-comment last line and JSONC | **RESOLVED** | Both are detected. Across 11 comment forms compared against `tsc`, every form `tsc` honours is caught; any extra detections fail closed. |
| LOW-3: untested protections | **RESOLVED** | Removing the unresolvable-family check fails 2 tests; removing the digest mismatch fails the artifacts test. |

Also confirmed:
- TASK-761: the full suite, run with an isolated `TMPDIR`, leaves 0 `cosmonauts-qm-*` directories.
- TASK-762 AC #6: the bullet-format prompt and sentinel handling are pinned.

## Findings

**LOW-1: the QM's own final-message failure falls back to earlier text.**
- `quality-review-launch.ts:396` reads the report through `extractAssistantText`.
- `agent-spawner.ts:228-270` returns success without checking the stop reason.
- Fallback text normally parses to `failed / Missing required report section` (this was run). A stale reuse would need an earlier complete report, and the host floors still apply.
- Fix: apply `finalAssistantEvidence` to the QM result.

**LOW-2: a reviewer that stops on its token limit (`stopReason: "length"`) is sealed as evidence.** `finalAssistantEvidence` rejects only `error` and `aborted`.

**LOW-3: the "source changed during private clone" re-check (`quality-review-workspace.ts:395-398`) has no failing test.** Replacing it with `false` leaves 156 workspace and run tests green. The code itself is correct.

## Attack list (TASK-728 AC #6)

| Item | What was run | Outcome | Protected? |
|---|---|---|---|
| Stale stat cache + injected porcelain call | Injected `git status --porcelain` with and without `GIT_OPTIONAL_LOCKS=0`; injected `update-index --refresh` | Without the env var, and with the refresh, the stale-stat test fails | Yes, pinned |
| Absolute or root-escaping symlink | Made `safeLink` a no-op | The escape refusal test fails | Yes, pinned |
| Source edits between samples | `return first`; separately, removed the post-clone re-check | The first fails a test; the second fails nothing (LOW-3) | Yes, one gap |
| Bracket or fan-out `chain_run` to fixer | `[reviewer, fixer]`, `fixer[3]`, `reviewer -> [fixer, reviewer]`, `reviewer -> fixer[2]` and sequential, from coordinator, lead and QM; then a skip-parallel-groups mutation | All refused, 0 runs allocated; the mutation fails 2 shipped tests | Yes |
| QM or child attempting bash, write or `chain_run` | Removed the profile filter and its throw loop | 5 tests fail | Yes |
| Forged, duplicate, foreign or empty completion | Removed each sink check; ran the 5 real-path shapes and a real Pi faux session | Each removal fails a test; HIGH-1 is closed | Yes |
| Reviewer timeout, no cancellation | Disabled the timeout integrity push | The timeout test fails | Yes |
| Same-change registry edit | Real script in a temp repo | Exit 1 when the entry is in the same change; exit 0 only when it is in the base | Yes |
| Gate-owned-file edit | `isGateOwnedFile` → `false` | 3 tests fail | Yes |
| Same-family, unresolvable, substituted model | Removed each branch | 1, 2 and 1 tests fail respectively | Yes |
| Unconfigured checks and model | Forced both flags `false` | 5 tests fail; never `ready` | Yes |
| Suppression extras | 18 cases: `@ts-nocheck`, renames, block comments, JSONC, `biome-ignore-all`, `-start`/`-end`, copied file | All caught; clean cases pass | Yes |

## R-014

- Policy stays out of prompts; the only prompt change is the QM bullet-format sentence.
- The durable runtime is still generic.
- No new `lib` → `bundled/coding` import.
- Ordinary agents and runs are unchanged and pinned.
- No excluded scope entered.
- The legacy archive and its history are intact, and no live surface links to the old paths.

## Gates at `fc2d047f`

- Tests: 3432/3432, leaving 0 `cosmonauts-qm-*` directories.
- Lint: clean. Typecheck: exit 0. `check:suppressions`: passes.
- The Fallow audit with three baselines: `pass` (0/0/0).

## Residuals

- Hostile-only: a symlink that looks inside the root but escapes through another link is accepted (read-only). Host-run checks execute reviewed code (D-028).
- An unstaged plain `mv` fails `check:suppressions` in a dirty source tree. This fails closed, and the QM clone stages it.
- CSS and other Biome-lintable types are not scanned; the repo has none.
- The real end-to-end evidence predates TASK-762/763. One post-remediation real run would confirm the reviewer-evidence check on live models.
- The suite still leaves some non-QM temp directories (`orchestration-coding-*`, `artifact-viewer-server-*`), outside TASK-761's scope.
