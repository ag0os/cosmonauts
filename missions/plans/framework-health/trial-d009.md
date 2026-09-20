# D-009 format trial — result

**11 of 11 mutants killed, 0 survived.** Run 2026-09-20 against trial commit `7c8811b` (branch `trial/b011-format-trial`, worktree `cosmonauts-trial-b011`, unmerged).

## Setup

A fresh agent with no prior context was given only what this branch ships — `worker.md`, the `tdd` skill, `behavior-spine.md`, `AGENTS.md` — plus `TASK-683` and `execution-liveness` B-011 restated as observer / entry point / outcome. No test file, test title, or source file was named to it. The 21 pre-created `test.todo` stubs had been deleted first, so there was no pre-named title to land on.

Mutants M1–M8 were written down before the worker's code or tests existed. Each was applied alone and restored from a `cp` backup.

## What the worker did

- Delivered through both real paths: the library spawner loop and the nested loop inside the registered `spawn_agent` tool.
- Wrote 8 tests of its own design: 4 through `createPiSpawner().spawn()`, 1 through the registered tool with fake timers, 3 at the tracker. Deleted 2 existing tests that asserted the behavior B-011 forbids.
- Ran 5 mutations of its own and reported, unprompted, that one test (the tracker "resolves undefined on expiry") was never seen red alone.
- Found and fixed a pre-existing silent drop the task did not name: the old loop exited with a completion still buffered when two children settled in one tick.
- Raised the liveness consequence itself: a hung child no longer ends the parent's loop after five minutes, and the chain deadline is only checked between steps. Until deadlines land (TASK-678/682) the only bound is the caller's abort signal. **Do not ship TASK-683 ahead of TASK-678.**

## Mutants

| # | Mutant | Result | Killed by |
|---|---|---|---|
| M1 | wait expiry reports running children as failed | killed | 4 tests, all new |
| M2 | completion with no waiter is dropped, not buffered | killed | 1 new + 3 existing |
| M3 | completion delivered twice | killed | 3 new + 5 existing |
| M4 | abandoned waiter not removed | killed | 5 tests, all new |
| M5 | completion with nobody waiting throws | killed | 22 tests, new and existing |
| M6 | late completion attributed to the wrong spawn | killed | 1 new + 3 existing |
| M6b | successful late child recorded as failed | killed | 3 new + 2 existing |
| M7' | expiry ends observation; the child's result is never delivered | killed | 3 tests, all new |
| M8 | cancelling the owning attempt no longer aborts the session | killed | 1 existing |
| M9 | **wiring**: the `spawn_agent` tool's loop reverts while the library loop stays fixed | killed | exactly 1 test — the one driving the registered tool |
| M10 | caller's abort signal does not end the wait | killed | 1 new |

M7 as pre-registered ("wait expiry cancels the healthy child") could not be expressed: nothing in the wait path holds a handle on the child. M7' replaced it. M6b, M9 and M10 were added after seeing the code and are marked as such; M1–M6, M7', M8 are the pre-registered set.

M9 is the one that speaks to the root cause. Under the old format the plan would have named `spawn-tracker.ts` as the seam and a tracker test as the proof, and a tool path left on the old loop would have stayed green. Here the behavior named the tool as the entry point, the worker tested through it, and un-wiring it goes red.

## What this does not show

- One behavior, one worker, one run. It is an existence proof, not a rate.
- No control arm was run under the old format on the same behavior. The historical controls are B-016 (an ordered unwired function) and the 21 empty stubs this same plan produced.
- The worker knew its report had to say how each test was shown able to fail. That is the shipped policy working as written, but it is also an observed worker.
- The worker was a general-purpose agent following the shipped prompt files, not a Pi session spawned by Drive with the composed four-layer prompt.
