---
kind: codex-review
plan: driver-hardening
round: 5
reviewed: e55040de..00d1ff5d (feature/driver-hardening, after TASK-807 remediation 525166de)
command: codex exec -m gpt-6-sol -c model_reasoning_effort=high --sandbox read-only
framing: correctness and liveness re-review; verifies round-4 remediations K1..K4 and C-001/J1 then re-reviews
recordedAt: '2026-09-29'
verdict: DO-NOT-SHIP
---

# codex review — driver-hardening — round 5

Coordinator triage and dispositions are appended below the report.

## Verdict: DO-NOT-SHIP
Three correctness and liveness findings remain in `e55040de..00d1ff5d`. The checkout is clean. The branch advanced during this review by one documentation-only commit; the implementation did not change.
### Findings
1. **P1 — The execution probe can certify a false zero.** [execution-probe/index.ts](/Users/cosmos/Projects/cosmonauts-framework-health/bundled/coding/extensions/execution-probe/index.ts:467) treats an instrumented file ending with its original bytes as unchanged by the command. If a test command restores that file *before executing it*, the marker never runs, yet the command can exit 0 and [the probe reports `usableZero: true`](/Users/cosmos/Projects/cosmonauts-framework-health/bundled/coding/extensions/execution-probe/index.ts:526). A worker could then use that result to claim a site is unreached. This violates the usable-evidence requirement in AC-012. Invalidate zero whenever an instrumented file differs from its instrumented bytes after the command, including when it matches the original.
2. **P1 — The Git timeout still has no hard bound.** [runtime-helpers.ts](/Users/cosmos/Projects/cosmonauts-framework-health/lib/driver/runtime-helpers.ts:201) relies on `spawn` sending SIGTERM; [the result is settled only after the child exits or closes](/Users/cosmos/Projects/cosmonauts-framework-health/lib/driver/runtime-helpers.ts:248). A Git wrapper that ignores SIGTERM leaves either Drive path waiting indefinitely before spawn. If it handles SIGTERM and exits 0, [the code labels the timed-out command `exit`](/Users/cosmos/Projects/cosmonauts-framework-health/lib/driver/runtime-helpers.ts:221), allowing a partial successful-looking result. A read-only Node reproduction confirmed that handling the timeout’s SIGTERM can produce exit code 0 and a null exit signal. Track the timeout firing explicitly and enforce termination or promise settlement independently of child exit.
3. **P2 — Renaming a task retains its task-only snapshot.** Both paths pass the task’s *final* filename to cleanup at [drive-finalization.ts](/Users/cosmos/Projects/cosmonauts-framework-health/lib/driver/drive-finalization.ts:231). If a worker changes the title through `task_edit`, the snapshot delta contains the old task filename, while [cleanup exempts only the new one](/Users/cosmos/Projects/cosmonauts-framework-health/lib/driver/runtime-helpers.ts:520). The old path is absent, so a Done task retains a ref despite no discarded worker work. This defeats D-035/D-036 cleanup for a supported task edit. Identify the task file at snapshot time as well as its final path.
### Round-4 and C-001 closure
| Finding | Status on both paths | Test that would fail on round-4 code |
|---|---|---|
| C-001 / J1 | **Closed** for the reported whole-tree comparison; both paths use the delta check. | Task-only and preserved-dirty snapshot tests under all three commit policies |
| K1 | **Partial**: the warning-plus-default-timeout scenario is fixed; finding 2 remains. | Legacy and graph warning-producing timeout tests |
| K2 | **Closed** through the shared task manager. | Lower-case heading preservation and mixed-case duplicate tests |
| K3 | **Closed** for the same-ID backup exemption; finding 3 is an adjacent task-rename case. | Legacy and graph deleted-backup tests |
| K4 | **Closed** through the shared parser. | Parser, legacy, and graph two-blocked-report tests |
I inspected the tests and TASK-807’s recorded red/green evidence; I did not run Vitest in this read-only review. `git diff --check e55040de..HEAD` passed.

## Coordinator triage (2026-09-29, review-phase coordinator 2)

Round-4/C-001 closure per codex: J1, K2, K3, K4 closed; K1 partial (re-raised as finding 2). All accepted:

| # | Disposition | Ground truth | Route |
|---|---|---|---|
| 1 | Accepted (P1) | The probe's post-command check counts a file as unmodified when its digest equals the *original*; a command that restores the file before running it never executes the marker, exits 0, and the probe reports `usableZero: true` (AC-012 as amended by H-001: side effects must invalidate the evidence). Compare to the instrumented digest only. | TASK-808 L1 |
| 2 | Accepted (P1) | `runCommand` relies on `spawn`'s `timeout` sending SIGTERM and settles only on exit/close; a child that ignores SIGTERM hangs the attempt, and one that handles it and exits 0 is labelled `exit` (K1's distinct state is inferred from the close signal, not from the timer). Track the timer firing explicitly, escalate to SIGKILL after a grace, and settle the promise on the timer regardless of the child. | TASK-808 L2 |
| 3 | Accepted (P2) | Cleanup exempts only the task's final path; a title edit through `task_edit` renames the file, so the snapshot delta holds the old path, which is absent from the final tree, and a Done task retains its ref without any discarded work (D-036). Record the task path at snapshot time and exempt both. | TASK-808 L3 |

Convergence note: rounds 3, 4, 5 returned 5, 4, 3 findings; each round's findings are adjacent cases of the previous round's fixes in the same three areas (snapshot containment, git runner bounds, report parsing/probe evidence). The brief's convergence bound (two more rounds after round 2) is exceeded; recorded for the human in the final report. Round 6 follows TASK-808.
