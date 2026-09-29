---
id: TASK-794
title: 'Slice 5: Render completion instructions for every backend'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-793
createdAt: '2026-09-29T16:45:17.494Z'
updatedAt: '2026-09-29T18:21:20.793Z'
---

## Description

Implementation Order slice 5. Owns B-004 from AC-007. Design ownership: §4 Prompt composition, limited to the machine-routed per-backend completion protocol. Governed by D-001, D-003, D-012, D-015, D-027, D-028, and D-030.

Files to Change owned by this slice: `lib/driver/prompt-template.ts` for all-backend criterion-marking instructions.

**Precondition (D-028 checkpoint, coordinator-run before launch):** after TASK-793's Drive commit, exit the cosmo host, start a fresh print-mode cosmo session, confirm `bin/cosmonauts-drive-step` does not exist, and record HEAD and the session start time in this task's implementation notes. Inline runs execute the host's loaded source; without the restart, slices 5-12 would run on slice 1-4 code.

**Standing AC-marking note (D-028):** as each acceptance criterion is verified, call `task_edit` with `checkAc: [index]`; Drive blocks a `success` report while any criterion is unchecked. This note stands until the all-backend completion protocol (slice 5) is live in the host.

**Standing worker rule until TASK-801 aligns the persona (D-028):** write every implementation note, including the D-030 red/green rows, with `task_edit` `implementationNotesMode: "append"`; never replace notes; if you stop blocked, set status Blocked and end the report with `outcome: blocked`.

## Implementation Plan

Follow Design §4: render a completion section whenever a task has acceptance criteria; route in-process workers to `task_edit` with `checkAc` and external `codex`/`claude-cli` workers to the task CLI; preserve the existing post-report check that blocks success while criteria remain unchecked. Test prompt routing as a contract while leaving authored persona wording to slice 12 review.

<!-- AC:BEGIN -->
- [x] #1 B-004 (source AC-007): a task with acceptance criteria renders an actionable completion section for every supported backend, using `task_edit`/`checkAc` for `cosmonauts-subagent` and the task CLI for `codex` and `claude-cli`; a success report with unchecked criteria remains blocked.
- [x] #2 The slice’s Prove clause is satisfied: rendered prompts for `cosmonauts-subagent`, `codex`, and `claude-cli` each contain the correct mechanism-specific instruction, the pre-change `cosmonauts-subagent` case is shown failing, and unchecked-success blocking still holds.
- [x] #3 The owned Files to Change entry `lib/driver/prompt-template.ts` delivers Design §4’s per-backend completion-protocol routing without taking ownership of slice 12’s authored persona prose.
- [x] #4 Ratified ground binds exactly: “INV-004 - The protocol and the parser agree, for every backend. Every outcome word the rendered prompt allows is parsed, every parsed outcome has one documented Drive consequence, and a rule that governs completion (such as marking acceptance criteria) reaches every backend in a form that backend can act on.” A collision is stop-and-escalate ground under the deviation protocol, not worker-adjustable detail.
- [x] #5 No `lib/durable-runtime/` change; no `drive-envelope` or `execution-liveness` work; no suppression, threshold, baseline, ignore-pattern, or configuration change to clear a finding; no test expectation change except where it pinned the defect being removed, citing the criterion (AC-020).
- [x] #6 D-028: this slice is implemented in a single Drive run on the `cosmonauts-subagent` inline backend from the fresh print-mode cosmo session established by the checkpoint below; before this run started, the coordinator restarted the cosmo host after TASK-793's Drive commit, confirmed no stale `bin/cosmonauts-drive-step` exists, and recorded that confirmation with HEAD and the session start time in this task's implementation notes.
- [x] #7 D-030: for B-004, implementation notes record one failing run before the change and one passing run after it; each row includes the test name and commit, the failing row includes a one-line failure, and the passing row records the successful result.
<!-- AC:END -->

## Implementation Notes

### Coordinator precondition (D-028/D-031 host restart, recorded 2026-09-29T18:09Z)

Slice 4 Drive commit b2752b04 landed (run run-8b24ed33; Drive state commit 29d180f8). The slice-4 cosmo host (pid 50144) exited at ~18:08:30Z. `bin/cosmonauts-drive-step` does not exist (bin/ holds only cosmonauts and cosmo-worker-codex). HEAD at restart: 29d180f8 plus the slice-4 record commit that follows. This task's run starts a fresh print-mode cosmo host from the worktree binary (/Users/cosmos/Projects/cosmonauts-framework-health/bin/cosmonauts); its start time is the `startedAt` in missions/sessions/driver-hardening/driver.lock and the run's first event, and is copied into coordinator-status.md after the run.

Task-start changed-scope audit base: dedc033d70f6a551707007304eec32aa91cb7556 (feature/driver-hardening). Drive owns commits; worker will not stage or commit.

D-030 B-004 RED | test: `instructs internal subagent workers to check acceptance criteria via task_edit` | commit: dedc033d70f6a551707007304eec32aa91cb7556 | `bun run test -- tests/driver/prompt-template.test.ts -t 'instructs internal subagent workers to check acceptance criteria via task_edit'` failed: expected rendered prompt to contain `## Task Completion Protocol`, but in-process prompt omitted it (1 failed, 12 skipped).

D-028 checkpoint clarification: this run is `run-1de7983c-9aa0-4f1e-93af-7ebf4dd100ff` on inline `cosmonauts-subagent`; fresh print-mode host `startedAt` from `missions/sessions/driver-hardening/driver.lock`: 2026-09-29T18:09:36.345Z. HEAD at task start dedc033d70f6a551707007304eec32aa91cb7556; `test ! -e bin/cosmonauts-drive-step` confirmed absent. Coordinator's prior restart note is preserved above.

D-030 B-004 GREEN | test: `instructs internal subagent workers to check acceptance criteria via task_edit` (plus external codex/claude-cli routes and unchecked-success tests) | commit: dedc033d70f6a551707007304eec32aa91cb7556 (pre-Drive commit) | `bun run test -- tests/driver/prompt-template.test.ts tests/driver/run-one-task.test.ts tests/driver/drive-scheduler-backend.test.ts` passed: 51/51. Deliberately reintroduced the missing internal branch and saw the subagent test fail, then restored the fix. Full `bun run test` passed: 3968/3968. `bun run lint`, `bun run typecheck`, `bun run check:reachability`, `bun run check:suppressions -- --base main` passed after correcting test formatting and typing. `analysis_audit` at literal base dedc033d70f6a551707007304eec32aa91cb7556: unbound (`execution-not-consented`, provider fallow); no audit findings available.

B-004 refinement: render the concrete `taskId` in the in-process instruction so the `task_edit` call is immediately actionable. The focused test went red on missing `taskId: "TASK-001"` then green; final focused run 51/51, lint and typecheck pass. An intermediate full `bun run test` failed 1/3968 in unrelated detached abort timing test `startDetached > escalates an ignored SIGTERM to SIGKILL so abort settles on a bounded deadline`: `AssertionError: promise rejected "Error: Detached driver start aborted" instead of resolving` at `tests/driver/driver-detached.test.ts:878` / `lib/driver/driver.ts:712`. No detached code changed; repeat full `bun run test` passed 3968/3968 (289/289 files). Audit still unbound (`execution-not-consented`).