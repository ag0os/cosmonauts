---
kind: codex-review
plan: driver-hardening
round: 4
reviewed: e55040de..6c9c17f3 (feature/driver-hardening, after TASK-806 remediation 9161ee5f)
command: codex exec -m gpt-6-sol -c model_reasoning_effort=high --sandbox read-only
framing: correctness and liveness re-review; verifies round-3 remediations H1..H4 then re-reviews
recordedAt: '2026-09-29'
verdict: DO-NOT-SHIP
---

# codex review — driver-hardening — round 4

Coordinator triage and dispositions are appended below the report.

**Verdict: DO-NOT-SHIP.** The remediation closes the main H1, H3, and H4 scenarios, but H2 still has a path that can spawn a worker without a snapshot. I found four correctness issues in the reviewed diff.
### Findings
1. **P1 — A timed-out snapshot check can silently disable protection.** [runtime-helpers.ts](/Users/cosmos/Projects/cosmonauts-framework-health/lib/driver/runtime-helpers.ts:220) uses captured stderr in preference to the timeout message. At [runtime-helpers.ts](/Users/cosmos/Projects/cosmonauts-framework-health/lib/driver/runtime-helpers.ts:383), `snapshotWorktree` treats a failed initial `git rev-parse` as “not a worktree” unless the error text says “timed out.” If that child writes a warning to stderr and then times out, the helper returns `undefined`; both Drive paths proceed to spawn without a snapshot of dirty work. A read-only call to `runCommand` reproduced the missing timeout marker. Preserve timeout as a separate result state and fail the snapshot attempt.
2. **P1 — A status edit can erase existing worker notes.** [task-note-editor.ts](/Users/cosmos/Projects/cosmonauts-framework-health/lib/tasks/task-note-editor.ts:25) recognizes only the exact-case `## Implementation Notes` heading, while [task-parser.ts](/Users/cosmos/Projects/cosmonauts-framework-health/lib/tasks/task-parser.ts:159) accepts it case-insensitively. For a task headed `## implementation notes`, a routine `In Progress` update parses the notes and then removes them during preservation. A read-only function call confirmed that `KEEP THIS` disappeared, violating INV-001.
3. **P2 — The task-file exemption can cover a second file.** [runtime-helpers.ts](/Users/cosmos/Projects/cosmonauts-framework-health/lib/driver/runtime-helpers.ts:492) exempts *every* `missions/tasks/<taskId> - *.md` snapshot path. If the snapshot also contains `TASK-1 - backup.md` and a worker deletes that file, cleanup ignores its missing bytes and can delete the recovery ref. D-035 exempts the task’s own file, not every file sharing its ID prefix. Resolve and exempt the actual task path.
4. **P2 — Two blocked fenced reports use the earlier reason.** [report-parser.ts](/Users/cosmos/Projects/cosmonauts-framework-health/lib/driver/report-parser.ts:29) selects the first fenced report when their outcomes agree. With blocked reports whose notes are `Old` and then `New`, it returns `Old`; both Drive paths record that as the human block reason. I confirmed this with a read-only parser call. The new H1 test covers multiple blocked reports only when another outcome creates a disagreement.
### Round-3 closure
| Round-3 finding | Status | Regression test against round-3 code |
|---|---|---|
| 1, Git normalization | Rejected as the recorded D-020 residual; unchanged. | Not applicable |
| 2, conflicting report reason / H1 | **Closed for the reported disagreement** on both paths. Finding 4 above is an adjacent case. | Parser and legacy/graph task-record tests would fail. |
| 3, inherited-pipe timeout / H2 | **Partial.** The new shared runner bounds pipe closure, and its timeout/abort tests would fail on round-3 code. Finding 1 leaves a timeout failure unrecognized. | Shared snapshot timeout and abort tests. |
| 4, ordinary Done refs / H3 | **Partial.** Both paths now remove contained refs under all three commit policies; those tests would fail on round-3 code. Finding 3 leaves an overbroad exemption. | Shared helper plus legacy/graph policy tests. |
| 5, graph terminal refs / H4 | **Closed.** Graph `aborted` and `finalization_failed` completion records carry earlier retained refs. The legacy path has no graph terminal-result builder. | Both graph terminal tests would fail on round-3 code. |
I inspected the added tests and TASK-806’s recorded red/green runs, ran the three read-only reproductions described above, and confirmed `git diff --check` passes and the working tree is clean. I did not run Vitest in this read-only environment because it writes cache and fixture files.

## Coordinator triage (2026-09-29, review-phase coordinator 2)

Round-3 closure per codex: H1, H4 closed; H2, H3 partial (re-raised as findings 1 and 3). Every H1..H4 fix was confirmed to reach both Drive paths with a test that fails on round-3 code. The coordinator's own finding C-001 (coordinator-status.md; the containment check iterates the whole snapshot tree) was found between rounds and is routed with these.

| # | Disposition | Ground truth | Route |
|---|---|---|---|
| 1 | Accepted (P1) | `runCommand` reports `timed out (SIGTERM)` only when stderr is empty; `snapshotWorktree`'s preflight catch rethrows only when the error text contains `timed out`/`aborted`, otherwise returns `undefined` ("not a worktree") and both paths spawn without a snapshot (INV-006, B-011). Timeout must be a distinct result state, not a stderr string. | TASK-807 K1 |
| 2 | Accepted (P1) | `task-note-editor.ts` `noteSection` matches `## Implementation Notes` case-sensitively while `task-parser.ts` reads the section case-insensitively; a status-only update on a task with a lower-case heading parses the notes and then drops them (INV-001, B-003; the editor was added by slice 1 on this branch). | TASK-807 K2 |
| 3 | Accepted (P2) | The exemption is `missions/tasks/<taskId> - *.md`, i.e. every file sharing the ID prefix; D-035 exempts the task's own file only. Resolve the actual task path (the task manager knows it). Mostly moot once D-036 narrows the containment set to the snapshot's delta, but the exemption must still be exact. | TASK-807 K3 |
| 4 | Accepted (P2) | When every fenced report agrees on `blocked`, the parser returns the first; H1's "last blocked report" rule applies only under disagreement. Make the last blocked report's notes the reason in both cases (INV-002). | TASK-807 K4 |

Verdict handling: DO-NOT-SHIP accepted for round 4; K1..K4 plus C-001 (J1, D-036) go to TASK-807 (one Drive run, red-first tests), then codex round 5.
