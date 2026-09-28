---
id: TASK-769
title: 'Stage 2: Characterize runners and locks'
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - testing
  - 'plan:project-health-audit'
dependencies:
  - TASK-768
createdAt: '2026-09-28T15:22:18.329Z'
updatedAt: '2026-09-28T17:36:29.054Z'
---

## Description

Land a characterization-only green commit for behavior-sensitive binary-runner and lock clone families. This task is the primary owner of B-011 and verifies B-010. Ratified ground is stop-and-escalate ground.

<!-- AC:BEGIN -->
- [x] #1 Owned behavior B-011 — observer: Drive and package users running Claude/Codex binaries and concurrent task/plan writers contending for locks; entry point: `runClaudeBinary`/`runCodexBinary` in `lib/agent-packages/` and lock primitives in `lib/driver/lock.ts` and `lib/entity-file-lock.ts`; outcome: after extraction runners clean materialized resources exactly once, uninstall signal handlers, propagate child exit code and signal unchanged, preserve variant-specific argument handling, and locks retain distinct timeout, stale-owner, warning, and release-confirmation behavior, with these outcomes characterized in this separate green commit before extraction. This stage verifies B-010 by closing without regression.
- [x] #2 The owned characterization cluster is `runClaudeBinary`, `runCodexBinary`, and the lock primitives in `lib/driver/lock.ts` and `lib/entity-file-lock.ts`, covering single cleanup, handler removal, exit-code/signal propagation, variant arguments, timeout, stale-owner races, warnings, and release confirmation. Owned Files to Change entries are only newly added test files under `tests/` (for example `tests/driver/lock.characterization.test.ts`); existing suites, including the mirrored ones such as `tests/driver/lock.test.ts`, stay unmodified, so the D-015 `--diff-filter=MDR` output is empty; `lib/agent-packages/claude-binary-runner.ts`, `lib/agent-packages/codex-binary-runner.ts`, `lib/driver/lock.ts`, and `lib/entity-file-lock.ts` are observed but not edited.
- [x] #3 D-009/D-016 are checkable: each function’s current result variants and durable fields are enumerated from signatures/return sites before tests, tests assert observable results rather than helper calls, missing tier is below high, and this characterization task does not edit any owned critical function or any of the four owned production modules. The commit is characterization-only, green, and records exact test files/cases for stage 3 reuse.
- [x] #4 Ratified constraints apply verbatim and are stop-and-escalate ground: refactors are behavior-preserving (INV-002); no new lint or fallow suppressions, no threshold, ignore, entry, or fallow.toml changes (INV-004); a finding is traced through the analysis surface immediately before the edit and a non-reproducing finding is reported unresolved, never fixed (INV-003); any test expectation change hard-stops for human review (Q-002). D-013 requires reproduced-but-untraceable findings to record failed/narrow successful traces plus repository-wide search and escalate without edit. Before every edit the Pi-hosted worker runs `analysis_status`, uses the project analysis surface tools to reconfirm/trace the owned clone locations, and stops and reports if those tools are unavailable (D-017).
- [x] #5 Dependency direction and ownership remain unchanged: characterization introduces no public entry, global utility, production seam, provider substitution, boundary zones, dependency bump, or change to `fallow.toml`, `missions/architecture/staged-code.toml`, `.cosmonauts/config.json`, `qualityReview`, or execution-liveness artifacts. Direct provider evidence, if needed for diagnosis, is labeled and cannot turn a failed/unbound surface result into a pass.
- [x] #6 D-015 freeze check. The base is the slice-start commit `S`, the HEAD the worker started from. Under driver-commits HEAD does not include the worker's edits, so the worker's in-session check compares the working tree with the base and records the base SHA and the exact outputs of `git diff --name-status --diff-filter=MDR S -- tests/`, `git status --porcelain -- tests/`, and `git diff -U0 S -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('`. Allowed without a human stop: (a) newly added test files; (b) pre-declared mechanical reference updates in existing tests for a symbol this task renames or moves, where every changed hunk contains only that identifier change and no assertion, fixture, or expectation change, named in this task before editing and reviewed and recorded by the coordinator. This characterization task adds only new test files and declares no reference update; existing suites, including mirrored ones, stay unmodified. Anything else blocks for human review. The freeze verdict comes from the coordinator, not the worker: after Drive commits this task, the coordinator confirms the base (`S` is the parent of this task's Drive commit), re-runs the same diff commands from that base to this task's Drive commit, and records its output and both SHAs under `## Implementation Notes` beside the worker's. Finding citations go in this task's notes, not in a commit message. Any disagreement, wrong base, or undeclared modified/deleted/renamed test or added skip/only/todo leaves the task `blocked` and the next slice is not dispatched. Worker-recorded output alone never satisfies this AC. Rows are copied to `## Implementation Notes`; the worker performs no git operation on `missions/reviews/`, and the coordinator owns record-only custody.
- [x] #7 Stage gate: `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, and `bun run check:suppressions -- --base main` all exit 0; the project-scope duplication capability and its D-012 diagnostic pairing are re-run and recorded with the owned families still present pending stage 3.
- [x] #8 `## Implementation Notes` maps, for each owned function, every enumerated result variant and return site to the test case(s) asserting it through a shipped entry point. A variant with no test is listed with the reason it cannot be reached and recorded as a Q-002 residual-risk item, since this task adds no production seam. Any unreachable variant is flagged to the coordinator before TASK-770 starts.
<!-- AC:END -->

## Implementation Notes

### Worker report, attempt 1 (run-b3040f19, restored by the coordinator from the transcript)

The worker wrote no task notes and ticked no acceptance criteria, so Drive ended `task_blocked` and replaced the notes with its reason. Its final report follows verbatim.

```
{
  "outcome": "success",
  "files": [
    {
      "path": "tests/agent-packages/binary-runners.characterization.test.ts",
      "change": "added"
    },
    {
      "path": "tests/driver/lock-primitives.characterization.test.ts",
      "change": "added"
    }
  ],
  "verification": [
    {
      "command": "bun run test",
      "status": "pass",
      "details": "266 files, 3475 tests passed"
    },
    {
      "command": "bun run lint",
      "status": "pass"
    },
    {
      "command": "bun run typecheck",
      "status": "pass"
    },
    {
      "command": "bun run check:reachability",
      "status": "pass",
      "details": "199/199 runtime modules reached"
    },
    {
      "command": "bun run check:suppressions -- --base main",
      "status": "pass"
    },
    {
      "command": "analysis_audit base a0b89e94b632e7004b9a6784d183209f8a1f0497",
      "status": "pass",
      "details": "No changed-scope findings"
    }
  ],
  "coverage": {
    "runClaudeBinary": [
      "Claude-only flags, warnings, child exit code, cleanup, and handler removal",
      "SIGTERM re-emission and cleanup/completion race",
      "signal-only child close mapping to status 1",
      "pre-materialization failure",
      "post-materialization spawn failure",
      "invalid prompt-mode early return"
    ],
    "runCodexBinary": [
      "Codex-only arguments, warnings, child exit code, cleanup, and handler removal",
      "SIGINT re-emission and cleanup/completion race",
      "signal-only child close mapping to status 1",
      "pre-materialization failure",
      "post-materialization spawn failure",
      "missing binary-path early return"
    ],
    "driverLocks": [
      "distinct plan and repository lock paths",
      "invalid, live, missing, and inaccessible owner classification",
      "active plan-owner durable fields",
      "stale plan/repository owner warning payloads",
      "replacement-owner preservation",
      "release failure propagation and retry",
      "repository waiter serialization"
    ],
    "withEntityFileLock": [
      "timeout error fields and owner preservation",
      "public timeout constructor fields",
      "stale-owner replacement race",
      "stale-owner reclamation, action result, and confirmed release",
      "three-attempt release failure reporting",
      "bounded release timeout without duplicate unlink",
      "primary action-error preservation"
    ]
  },
  "duplication": {
    "capability": "Fallow 2.54.2 project scope",
    "stats": "85 clone groups, 2990 duplicated lines, 3.218653117464692%",
    "runnerFamily": "11 groups, 301 duplicated lines",
    "lockFamily": "5 groups, 112 duplicated lines",
    "diagnosticPairing": "bunx fallow dupes --format json --quiet --no-cache returned the same project statistics and owned families"
  },
  "freeze": {
    "base": "a0b89e94b632e7004b9a6784d183209f8a1f0497",
    "headAtCheck": "a0b89e94b632e7004b9a6784d183209f8a1f0497",
    "modifiedDeletedRenamed": "(no output)",
    "testStatus": [
      "?? tests/agent-packages/binary-runners.characterization.test.ts",
      "?? tests/driver/lock-primitives.characterization.test.ts"
    ],
    "addedSkipOnlyTodo": "(no output; grep exit 1)",
    "supplementaryUntrackedSearch": "(no skip/only/todo matches)"
  },
  "notes": "Added 27 characterization tests without modifying production or existing test files. No unreachable result variant or Q-002 residual-risk item was identified. Changes remain unstaged and uncommitted for driver-owned commit and coordinator freeze review."
}
outcome: success
```

### Coordinator note before attempt 2 (2026-09-28)

Attempt 1's work is complete and sits uncommitted in the worktree: the two new files `tests/agent-packages/binary-runners.characterization.test.ts` and `tests/driver/lock-primitives.characterization.test.ts` (27 cases), no production or existing test file modified. Slice-start commit `S` = `a0b89e9`. Do not redo or revert them; build on them.

**Drive commits a task only when every acceptance criterion is checked.** An unchecked criterion ends the run `task_blocked` with nothing committed, which is what happened. Attempt 2 must, before reporting:

1. Re-run `analysis_status` (D-017) and the stage gate (`bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, `bun run check:suppressions -- --base main`); record exit codes and result lines here with `task_edit` `implementationNotes` (append; do not drop the sections above).
2. Record the D-015 in-session check verbatim against base `a0b89e9` (the three commands in the task's AC), and the per-function result-variant → test-case mapping from the attempt-1 report as durable task notes.
3. Tick every satisfied AC with `task_edit` `checkAc` (all of #1..#8 if satisfied; for the coordinator-verdict freeze AC, plan D-020 applies: tick it once the in-session half is recorded; the coordinator appends the post-commit verdict).
4. Report `outcome: success`. Keep the two test files uncommitted; the driver commits.

### Worker validation, attempt 2

#### D-017 analysis surface and trace evidence

`analysis_status` was re-run from `/Users/cosmos/Projects/cosmonauts`. Fallow 2.54.2 reported `dead-code`, `duplication`, `complexity`, `changed-scope-audit`, `trace`, and `fix-preview` bound; boundary conformance remained visibly unbound (`provider-not-configured`). The capabilities needed by this slice were available.

Fresh duplicate-location traces reconfirmed both owned families without editing them:

- `lib/agent-packages/claude-binary-runner.ts:108:1` traced the 51-line runner lifecycle group to `lib/agent-packages/codex-binary-runner.ts:65-115`.
- `lib/driver/lock.ts:88:49` traced the acquisition/stale-owner group to `lib/entity-file-lock.ts:87-102`.

No finding failed to reproduce or failed to trace, and no production edit was attempted.

#### D-012 duplication evidence

The project-scope `analysis_duplication` capability was re-run and completed with the expected finding verdict (`fail`, not an invocation failure): 85 clone groups, 172 instances, 2,990 duplicated lines, and 3.218653117464692% duplication. The owned families remain pending TASK-770:

- `lib/agent-packages/claude-binary-runner.ts` + `lib/agent-packages/codex-binary-runner.ts`: 11 groups, 301 duplicated lines.
- `lib/driver/lock.ts` + `lib/entity-file-lock.ts`: 5 groups, 112 duplicated lines.

D-012 diagnostic pairing was run directly and labeled diagnostic-only: executable `fallow`, args `["dupes", "--format", "json", "--quiet", "--no-cache"]` (shell invocation `bunx fallow dupes --format json --quiet --no-cache`). Its parsed output matched the capability: 274 files, 45 files with clones, 85 groups, 172 instances, 2,990 duplicated lines, 3.218653117464692%; runner family 11/301 and lock family 5/112. This diagnostic evidence does not substitute for or alter the surface verdict.

#### Stage gate and changed-scope audit

All required commands were re-run exactly and exited 0:

- `bun run test` — exit 0; `Test Files 266 passed (266)`, `Tests 3475 passed (3475)`.
- `bun run lint` — exit 0; `Checked 606 files in 352ms. No fixes applied.`
- `bun run typecheck` — exit 0; `tsc --noEmit`.
- `bun run check:reachability` — exit 0; `reachability: 199/199 runtime lib modules reached; 13 type-only lib modules exempt; 0 staged`.
- `bun run check:suppressions -- --base main` — exit 0; `suppression check passed`.

`analysis_audit` with literal base `a0b89e94b632e7004b9a6784d183209f8a1f0497` passed with no changed-scope dead-code, duplication, or complexity findings.

#### D-015 in-session freeze evidence

Slice base and worker-start HEAD: `a0b89e94b632e7004b9a6784d183209f8a1f0497` (`a0b89e9`). Verbatim commands and outputs:

```text
$ git diff --name-status --diff-filter=MDR a0b89e9 -- tests/
$ echo $?
0
```

```text
$ git status --porcelain -- tests/
?? tests/agent-packages/binary-runners.characterization.test.ts
?? tests/driver/lock-primitives.characterization.test.ts
$ echo $?
0
```

```text
$ git diff -U0 a0b89e9 -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('
$ echo $?
1
```

The MDR and added skip/only/todo commands produced no output. Only the two allowed new test files appear. No existing test suite was modified, deleted, or renamed. Under D-020 this records the worker half; the coordinator retains the post-commit freeze verdict.

#### Result-variant and return-site mapping for TASK-770 reuse

The enumeration is derived from current signatures and return sites. Both test files drive exported/shipped entry points and assert observable results and durable fields, not private helper calls.

`tests/agent-packages/binary-runners.characterization.test.ts`:

- `runClaudeBinary(...): Promise<void>`
  - Input-error early return after exit 1, before materialization or signal installation → `returns before materialization and signal installation for an invalid prompt mode`.
  - Successful materialized result `{ exitCode, materialized }`, child exit propagation, Claude-only parsed fields, warning output, exactly-once cleanup, and both handlers removed → `preserves Claude-only flags, warnings, child exit code, cleanup, and handler removal`.
  - Child close with `code: null` return maps to exit 1 → `maps a signal-only child close to status 1`.
  - Failure return `{ exitCode: 1 }` before materialization, with no invented cleanup target → `reports a pre-materialization failure without inventing a resource to clean`.
  - Failure return `{ exitCode: 1, materialized }` after materialization, preserving exactly-once cleanup and handler removal → `cleans once and removes handlers after a post-materialization spawn error`.
  - Signal-handler completion return preserves the signal value and shares the same cleanup promise with normal completion → `re-emits SIGTERM unchanged and cleans once when completion races signal cleanup`.
- `runCodexBinary(...): Promise<void>`
  - Input-error early return after exit 1, before materialization or signal installation → `returns before materialization and signal installation for a missing binary path`.
  - Successful materialized result `{ exitCode, materialized }`, child exit propagation, Codex-only parsed fields, warning output, exactly-once cleanup, and both handlers removed → `preserves Codex-only arguments, warnings, child exit code, cleanup, and handler removal`.
  - Child close with `code: null` return maps to exit 1 → `maps a signal-only child close to status 1`.
  - Failure return `{ exitCode: 1 }` before materialization, with no invented cleanup target → `reports a pre-materialization failure without inventing a resource to clean`.
  - Failure return `{ exitCode: 1, materialized }` after materialization, preserving exactly-once cleanup and handler removal → `cleans once and removes handlers after a post-materialization spawn error`.
  - Signal-handler completion return preserves the signal value and shares the same cleanup promise with normal completion → `re-emits SIGINT unchanged and cleans once when completion races signal cleanup`.

`tests/driver/lock-primitives.characterization.test.ts`:

- `getPlanLockPath(...): string` and `getRepoCommitLockPath(...): string` single return values → `keeps lock path ownership distinct for plans and repository commits` asserts both exact durable paths.
- `isProcessAlive(...): boolean` return sites → `classifies invalid, live, missing, and inaccessible process owners` covers invalid/non-positive false, successful probe true, ESRCH false, and non-ESRCH/EPERM true.
- `acquirePlanLock(...): Promise<LockHandle | ActivePlanLock>`
  - New-owner `LockHandle` variant and persisted owner fields → setup/cleanup in `returns the active plan owner's durable run and timestamp fields` and `reclaims a stale plan owner and emits the exact warning payload`.
  - Existing-live-owner `ActivePlanLock` variant with `error`, `activeRunId`, and `activeAt` → `returns the active plan owner's durable run and timestamp fields`.
  - Stale-owner retry returns a new handle and emits the exact warning details → `reclaims a stale plan owner and emits the exact warning payload`.
  - Handle release return sites: owned removal, replacement/missing ownership as idempotent success, already-released success, and non-ENOENT failure followed by retry → `does not release a replacement plan owner` and `propagates an unconfirmed plan release and allows the same handle to retry`.
- `acquireRepoCommitLock(...): Promise<LockHandle>`
  - Immediate handle and post-live-wait handle returns → `serializes repository commit waiters until the current owner releases`.
  - Stale-owner retry handle and exact warning contract → `reclaims a stale repository commit owner with the same warning contract`.
- `EntityFileLockTimeoutError` constructor durable return object fields (`name`, `lockPath`, `waitTimeoutMs`, `message`) → `exposes the timeout error fields through its public constructor`.
- `withEntityFileLock<T>(...): Promise<T>`
  - Acquisition-time timeout rejection with durable error fields, no action, and live-owner preservation → `times out on a live owner with durable error fields and leaves it intact`.
  - Stale-owner race declines reclamation, preserves the replacement, leaves no removal sibling, then returns the timeout rejection variant → `does not reclaim a live replacement that wins the stale-owner race`.
  - Successful action `T` return after stale reclamation and confirmed release → `reclaims a stale owner, returns the action result, and confirms release`.
  - Successful action `T` remains the return when release fails all three attempts; the final error is reported once → `returns a persisted result and reports the final release error after three attempts`.
  - Successful action `T` remains the return when release times out; one in-flight unlink is reported without duplicate unlink → `reports a timed-out release once without retrying the in-flight unlink`.
  - Action-error rejection remains primary when release is also unconfirmed → `preserves an action failure when release also remains unconfirmed`.

All enumerated observable result variants are mapped. No variant was unreachable through the shipped entry points, no production seam was added, and no Q-002 residual-risk item was identified. The characterization-only source diff remains the two new test files (27 cases); production modules and existing tests remain unchanged and uncommitted for the driver-owned commit.
