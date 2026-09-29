---
kind: codex-review
plan: driver-hardening
round: 3
reviewed: e55040de..427b7eda (feature/driver-hardening, after TASK-805 remediation 3dab72db)
command: codex exec -m gpt-6-sol -c model_reasoning_effort=high --sandbox read-only
framing: correctness and liveness re-review; verifies round-2 remediations G1..G5 then re-reviews
recordedAt: '2026-09-29'
verdict: DO-NOT-SHIP
---

# codex review — driver-hardening — round 3

Coordinator triage and dispositions are appended below the report.

**Verdict: DO-NOT-SHIP.** G1–G5 each have a test that would fail on the round 2 code, and their fixes reach both the legacy and graph Drive paths. Three fixes still leave correctness or liveness gaps. I found five issues in total.
## Findings
1. **P1 — A snapshot may never contain the worktree bytes it promises to protect.** [runtime-helpers.ts](/Users/cosmos/Projects/cosmonauts-framework-health/lib/driver/runtime-helpers.ts:427) builds the snapshot with `git add -A`. Git applies text normalization and clean filters while adding files, so the ref can hold bytes different from the dirty worktree. A worker can discard a CRLF file or content transformed by a custom clean filter; even a retained ref cannot recover its original bytes. The cleanup comparison at [runtime-helpers.ts](/Users/cosmos/Projects/cosmonauts-framework-health/lib/driver/runtime-helpers.ts:478) cannot establish INV-006 from that ref. Both paths call this helper. Preserve raw worktree bytes, or refuse snapshots whose Git blobs differ from them. [Git’s attributes documentation](https://git-scm.com/docs/gitattributes/) confirms that `git add` applies these conversions.
2. **P1 — Conflicting fenced reports can record the wrong human block reason.** [report-parser.ts](/Users/cosmos/Projects/cosmonauts-framework-health/lib/driver/report-parser.ts:16) selects the first fenced report with notes, regardless of its outcome. I reproduced a `success` report with notes “Finished” followed by a `blocked` report with notes “Need approval”: the parser returns `blocked` with reason “Finished”. Both Drive paths then use that reason, violating INV-002’s verbatim reason requirement. Select notes from the blocked report.
3. **P2 — A snapshot Git timeout can still leave Drive waiting indefinitely.** [runtime-helpers.ts](/Users/cosmos/Projects/cosmonauts-framework-health/lib/driver/runtime-helpers.ts:219) resolves the runner on the child’s `close` event. A timed-out Git process may exit while a spawned clean filter retains its output pipe, delaying `close`. In a read-only Node reproduction, a 50 ms timeout produced `exit` at 55 ms but `close` at 2,019 ms. An unbounded filter leaves the snapshot attempt pending despite the 60-second Git timeout. The G4 tests simulate a direct child, so they miss this case. Enforce a bound independent of pipe closure and settle descendants. Git documents filters that run during `git add` in its [attributes reference](https://git-scm.com/docs/gitattributes/).
4. **P2 — Normal successful tasks retain snapshot refs indefinitely.** Both paths mark a tracked task **In Progress before snapshotting** ([legacy](/Users/cosmos/Projects/cosmonauts-framework-health/lib/driver/run-one-task.ts:90), [graph](/Users/cosmos/Projects/cosmonauts-framework-health/lib/driver/drive-scheduler-backend.ts:181)). The snapshot includes that dirty task file. Marking it Done changes its bytes before [cleanup compares every snapshot path](/Users/cosmos/Projects/cosmonauts-framework-health/lib/driver/runtime-helpers.ts:478), so a normal Done task retains its ref even when the worker discarded nothing. This project tracks task files; the contained-snapshot tests ignore `missions/`, masking the common case. Compare protected worker work separately from Drive’s own status changes.
5. **P2 — Graph terminal records can omit retained refs from earlier Done tasks.** The graph runner gathers retained refs from completed task-status steps at [drive-graph-runner.ts](/Users/cosmos/Projects/cosmonauts-framework-health/lib/driver/drive-graph-runner.ts:629), but its aborted and finalization-failed result builders omit them ([aborted](/Users/cosmos/Projects/cosmonauts-framework-health/lib/driver/drive-graph-runner.ts:689), [finalization failed](/Users/cosmos/Projects/cosmonauts-framework-health/lib/driver/drive-graph-runner.ts:714)). If task A finishes with a retained ref and task B later fails finalization, `run.completion.json` does not name A’s ref, contrary to G2/D-034. Carry the collected refs into every terminal result.
## Round 2 closure
| Round 2 finding | Status on both Drive paths | Round 2 code caught by |
|---|---|---|
| 1 / G1 | **Partial:** the reported conflicting `success`/`blocked` outcome now stops postflight and retry; finding 2 remains. | Parser and both path-level conflicting-report tests |
| 2 / G2 | **Partial:** the reported discarded-file ref is retained; findings 1, 4, and 5 remain. | Missing-file and contained-file snapshot tests on both paths |
| 3 | **Recorded D-019 residual; not re-raised.** | — |
| 4 | **Recorded B-009 residual; not re-raised.** | — |
| 5 / G3 | **Closed:** shared summary normalization reaches both commit paths. | Normalized-summary and commit-subject tests |
| 6 / G4 | **Partial:** snapshot Git is asynchronous and receives the abort signal; finding 3 remains. | In-flight abort test |
| 7 / G5 | **Closed:** both paths prepare the retry before emitting `task_retry`. | Failed retry-prompt preparation tests on both paths |
The focused Vitest command could not start in the read-only sandbox because Vite attempted to write `node_modules/.vite-temp` (`EPERM`). The direct parser and child-process reproductions above ran read-only. `git diff --check` passed, and the working tree remains clean.

## Coordinator triage (2026-09-29, review-phase coordinator 2)

Round-2 closure per codex: G3 and G5 closed; G1, G2, G4 partial (re-raised as findings 2, 1/4/5, 3). Every G1..G5 fix was confirmed to reach both Drive paths with a test that fails on round-2 code.

| # | Disposition | Ground truth | Route |
|---|---|---|---|
| 1 | Rejected (recorded residual, D-020 mechanism) | The snapshot is a Git commit by decision (D-020, human-reviewed, not vetoed); it stores exactly the bytes a commit of the same worktree would store, so a repository whose own `.gitattributes`/`core.autocrlf` normalizes text has declared those bytes non-canonical. The D-034 containment check hashes both sides through the same filters, so it stays consistent. Refusing snapshots whose blobs differ from the raw file would make Drive unusable on every autocrlf repository; preserving raw bytes outside Git would replace the ratified mechanism. This repository has no `.gitattributes` and no `core.autocrlf`. Recorded in the Drive README as a residual and in the improvement pass as a follow-up candidate. | none (recorded) |
| 2 | Accepted (P1) | `parseReport` takes the notes of the first fenced report that has notes, not the blocked one; a `success` report with notes followed by a `blocked` report records the success notes as the human reason (INV-002 verbatim reason). | TASK-806 H1 |
| 3 | Accepted (P2) | `runCommand` resolves only on `close`; a timed-out or aborted git child that leaves a descendant holding the stdout/stderr pipe delays `close` indefinitely, so the G4 bound holds the child but not the promise. Resolve on `exit` with a bounded wait for the pipes (destroy them on timeout/abort). | TASK-806 H2 |
| 4 | Accepted (P2, raised to the top of the slice) | Verified by probe at `427b7eda`: `removeDoneTaskSnapshots` with a ref whose only differences from the Drive commit are `missions/` files returns it as retained. Drive's source commit excludes `missions/**`, `memory/**` and `.cosmonauts/*.lock` (drive-finalization.ts), and both paths write In Progress to the task file before the snapshot, so under `driver-commits` every Done task in a project that tracks task files keeps its ref forever; the live run `run-4ac4797c` deleted its ref only because that host loaded the pre-G2 source. D-034's mechanism is derived; amended by **D-035**. | TASK-806 H3, plan D-035 |
| 5 | Accepted (P2) | `aborted` and `finalization_failed` result builders in drive-graph-runner.ts do not carry the retained refs collected from earlier Done task-status steps, so `run.completion.json` can omit a ref D-034 requires it to name. | TASK-806 H4 |

Verdict handling: DO-NOT-SHIP accepted for round 3; H1..H4 go to TASK-806 (one Drive run, red-first tests), then codex round 4.
