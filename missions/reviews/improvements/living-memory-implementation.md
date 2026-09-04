---
kind: drive-improvement-observations
status: open
plan: living-memory
runs:
  - run-8ac3fb66-8341-406b-a221-f90189bbad74
  - run-ce1f43b1-6ad1-4114-91ad-9f2389ecfc60
  - run-c20b1c93-fbd7-4a21-a44a-15eda6b8701f
  - run-4ac4bead-1d7d-463e-a59a-4063c0b7ad4f
  - run-4ebe0a26-1801-4b6a-b487-6041e04ab5d5
  - run-9cfe6dba-2bb7-4ee0-afb0-738403767022
  - run-61270ca6-a1c0-4b77-969c-26457b41e3ac
  - run-5144e115-fc4d-4d0c-9f65-b22effe71ee0
  - run-f7d5c8b4-6ae4-4558-99f8-1f4941bcc0c6
  - run-2e042b1a-e132-487f-b8c9-a5729bd71365
  - run-ede69a96-fa3c-473d-b07a-35b4c8263fe0
  - run-41f776a6-1872-4b89-b0d8-e8fbaffb77ad
  - run-82bfbeec-cf86-4a2c-b85e-82ca0a92ab7d
  - run-d0b684ca-bd44-4ca1-910c-60b05012bac3
date: '2026-09-04'
---

# Drive improvement observations — living-memory implementation

Fourteen Drive runs, 20 tasks (9 planned + 11 coordinator-authored), five
independent review rounds. Bounded and lossy by design; ranked by expected value.

| Observed problem | What happened in this run | Suggested improvement | Why it helps |
|---|---|---|---|
| A fully green behaviour suite proved nothing about the system's real input | All 21 behaviours reached green with exact markers while the production corpus source did not exist at all. Every behaviour test injects fixture sources into `createLivingMemoryConsolidator()`, so the pipeline was complete, correct, and disconnected from `knowledge/`. Found only by running the real CLI against the real 237-record corpus. | For plans that ship a user-invokable surface, require one acceptance criterion that exercises the real composition root against real project data, not fixtures. | Marker/name conformance cannot detect a missing adapter or an unwired composition root. This class is invisible to the entire gate ladder. |
| No task owned the production corpus adapter | The backlog decomposed the plan by *behaviour*; the corpus adapter is infrastructure every behaviour assumes but none names. TASK-614 named only the episodic source. | During spec-to-backlog coverage checks, verify each declared v1 *source/adapter* has an owning task, not only each behaviour. | Behaviour-complete backlogs can still be deliverable-incomplete. |
| Drive's `--task-timeout` is wall-clock, so machine sleep burns it | TASK-609 (60 min) and TASK-610 (120 min) both failed as "timed out" while the machine was asleep. TASK-610's heartbeat never advanced past spawn and it produced zero file changes in 2h; it then finished in ~10 min once awake. | Treat a non-advancing heartbeat as distinct from elapsed wall-clock: pause the timeout, or report "no heartbeat progress" instead of "timed out". | The failure presents as a task or backend fault and sends the operator diagnosing the wrong thing; it also makes long detached runs unsafe to leave unattended on a laptop. |
| A timeout mid-finalization discards completed work | TASK-609's worker had every substantive AC green but died before the mandatory `types.ts` re-pin and formatting. Drive committed nothing, so a rerun would have redone ~1160 correct lines. The coordinator salvaged it by hand. | Commit worker output as WIP on timeout, or grant a finalization grace window, so a resume can complete rather than restart. | Finalization is cheap and mechanical; discarding an entire task for missing it is the most expensive possible failure mode. |
| Remediation workers over-apply narrowly-scoped review findings | TASK-624 read "23 dead-code findings in the changed scope" as licence to go repo-wide, deleting and demoting exports across `lib/driver`, `lib/harness-adapters`, `lib/process`, orchestration and two CLIs — 18 files outside the plan. All were reverted after verifying none was functional. | State the directory boundary as an explicit AC on every remediation task, as later rounds did. Tasks carrying that AC stayed in scope; the one without it did not. | Scope creep in a byte-safety branch inflates the review surface and buries the change under unrelated API edits. |
| Fixes to concurrent/durable code reliably introduce new defects | Every one of the first four review rounds' fixes introduced a regression: round 1's whole-pass lock made `inspect()` report `concurrent-mutation` against its own lock (every successful consolidate would have exited 1); round 3's tombstone added a check-then-`rename` that could clobber a concurrently recreated file. | Treat "re-review after every remediation" as mandatory for transaction/recovery code specifically, and tell the reviewer which regressions previous rounds introduced. | Naming the pattern to the reviewer measurably sharpened later rounds; each found the regression the previous fix added. |
| A test can encode the bug it should catch | The reported-retirements array exceeded `maxRetirements`, and a test asserted six rows under a limit of five — pinning the violation as expected behaviour. | When a review finds a contract violation, check whether a test asserts the wrong side of it, and correct the test rather than the contract. | A test encoding a violation converts a bug into a defended invariant and will block the correct fix. |
| Unbounded check-then-act chasing has no natural stopping point | Four review rounds each closed the named pathname race and surfaced the next one syscall further in. Only an explicit human ratification (D-026) ended it, after which the ruling had to be broadened once when the class proved general. | When a review round closes an instance and names a structurally identical successor, escalate the *class* for ratification rather than fixing the instance and re-reviewing. | Recognising an unclosable class early converts an unbounded loop into one bounded decision. |

## Ranked follow-ups

1. Heartbeat-aware Drive timeouts, and WIP-commit-on-timeout (two highest-value driver changes; both cost real work this run).
2. A "real composition root against real data" acceptance criterion for plans shipping a user-invokable surface.
3. Adapter/source ownership check in the spec-to-backlog coverage matrix.
4. Directory-boundary AC as a standing template for remediation tasks.

## Non-goals

- Not proposing changes to the living-memory design itself; the ratified brief held up under five review rounds.
- Not proposing weaker review gates: the reviews found genuine byte-safety defects a 3035-test green suite did not.
- Not proposing automated remediation-scope enforcement; an explicit AC proved sufficient.
