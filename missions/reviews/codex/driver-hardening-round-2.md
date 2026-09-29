---
kind: codex-review
plan: driver-hardening
round: 2
reviewed: e55040de..0a0c722c (feature/driver-hardening, after TASK-804 remediation abe43347)
command: codex exec -m gpt-6-sol -c model_reasoning_effort=high --sandbox read-only
framing: correctness and liveness re-review; verifies round-1 remediations then re-reviews
recordedAt: '2026-09-29'
verdict: DO-NOT-SHIP
---

# codex review — driver-hardening — round 2

Coordinator triage and dispositions are appended below the report.

**Verdict: DO-NOT-SHIP.** The read-only review of `e55040de..HEAD` found seven correctness or liveness issues. The checkout is unchanged.

## Findings

1. **P1 — A final human stop can still execute postflight.** [report-parser.ts](lib/driver/report-parser.ts:7) returns the first valid fenced JSON report before examining the final outcome line. I reproduced fenced `{"outcome":"success"}` followed by a final `outcome: blocked` parsing as success. Both Drive paths use this parser, so either can run postflight despite the worker’s final human stop (INV-002/004). Resolve conflicting report forms without treating the response as success.

2. **P1 — Done cleanup can destroy the only durable copy of discarded work.** [drive-finalization.ts](lib/driver/drive-finalization.ts:230) deletes every attempt snapshot ref when a task becomes Done. For example, an external worker can reset dirty work from a prior attempt and report success; under `no-commit`, Drive can mark Done and delete the ref that held those bytes. The snapshot then has no durable reference (INV-006). Retain refs until the final tree is verified to contain the protected work.

3. **P1 — Crash recovery can clear a journal while its test process survives.** [execution-probe/index.ts](bundled/coding/extensions/execution-probe/index.ts:345) restores and deletes a journal whenever the new `termination-error` marker is absent. That marker is written only *after* the process runner returns. If the tool host dies while its detached test process is running, the next probe can delete the journal and unblock Drive while that process can still rewrite source (AC-012, B-008). Recovery needs evidence that the process tree stopped before clearing the journal.

4. **P2 — The Drive Bash guard permits a destructive command built by the shell.** [drive-worker-tool-guard.ts](lib/agents/drive-worker-tool-guard.ts:7) classifies `git $(printf reset) --hard` as safe; the shell executes it as `git reset --hard`. The same classifier guards probe test commands. The plan records command substitution as a residual, but snapshot deletion in finding 2 means that residual can lose work (AC-014, INV-006). Refuse forms the classifier cannot safely resolve.

5. **P2 — Normalizing a summary can create a forbidden commit subject.** [runtime-helpers.ts](lib/driver/runtime-helpers.ts:66) checks the selected line *before* removing `summary:` or `status:`. I reproduced `summary: outcome: success` becoming `outcome: success`, and `summary: {"outcome":"success"}` becoming brace-delimited JSON. Both paths use the resulting subject through shared finalization (AC-015). Check the final normalized summary before accepting it.

6. **P2 — Snapshot Git remains uncancellable and freezes Drive during a stall.** [runtime-helpers.ts](lib/driver/runtime-helpers.ts:324) adds a 60-second timeout to each synchronous Git call, but takes no abort signal. A stalled clean filter in `git add` blocks the event loop and prevents cancellation or other graph work until that call returns; subsequent calls have separate timeouts. This bounds the original indefinite stall but does not close its abortability and concurrency risk (B-011).

7. **P2 — A retry event can still have no re-spawn.** [runtime-helpers.ts](lib/driver/runtime-helpers.ts:523) emits `task_retry` before the next attempt renders its prompt and takes its snapshot. Failure in either preparation step leaves a retry event without a second `spawn_started`, contrary to B-002’s explicit “not re-spawned” case. Round 1 finding 9 was rejected, but the recorded rationale does not resolve that case: the event could be emitted after preparation and still before `spawn_started` (INV-003).

## Round-1 disposition

| # | Round-2 status |
|---|---|
| 1 | **Closed for the reported race.** Legacy and graph commits share the probe lock through staging and commit. The new lock-held test would fail on round-1 code. Finding 3 above is a separate recovery route. |
| 2 | **Closed for a returned `termination-error`.** The journal is retained, and the new test would fail on round-1 code. Host death before that result remains unsafe (finding 3). |
| 3 | **Incomplete.** New legacy, graph, and parser tests catch competing plain outcome lines and would fail on round-1 code; they miss a conflicting fenced report (finding 1). |
| 4 | **Closed for the reported global-option bypass.** The `--no-pager` tests would fail on round-1 code. Command substitution remains (finding 4). |
| 5 | **Partial.** The timeout test would fail on round-1 code, and Git calls now have timeouts; cancellation remains unhandled (finding 6). |
| 6 | **Closed.** The global-excludes snapshot test would fail on round-1 code. |
| 7 | **Incomplete.** The JSON-first-line tests would fail on round-1 code; normalized prefixes still produce forbidden subjects (finding 5). |
| 8 | **Closed.** Trailing-directory scope tests would fail on round-1 code and exercise the shared complexity/duplication filter. |
| 9 | **Open; rejected by the coordinator.** Finding 7 explains the remaining B-002 failure. |

I inspected the new tests and TASK-804’s recorded red runs. My focused Vitest run could not start in the read-only sandbox: Vite attempted to write `node_modules/.vite-temp` and received `EPERM`. Direct read-only Bun reproductions confirmed findings 1, 4, and 5. `git diff --check` passed, and the working tree remains clean.

## Coordinator triage (2026-09-29, implementing coordinator)

Round-1 closure: 1, 2, 4, 6, 8 closed; 3, 5, 7 incomplete (re-opened as round-2 findings 1, 6, 5); 9 re-raised as finding 7.

| # | Disposition | Ground truth | Route |
|---|---|---|---|
| 1 | Accepted (P1) | `parseReport` returns the first valid fenced JSON before looking at the outcome line, so a fenced `success` plus a final `outcome: blocked` parses as success. The contract says the outcome line MUST match the JSON field; a conflict must never resolve to success. Rule: if either form says `blocked`, the report is blocked; any other disagreement is `unknown` with raw retained (INV-002/INV-004). | TASK-805 G1 |
| 2 | Accepted (P1) | `removeDoneTaskSnapshots` deletes every attempt ref on Done regardless of whether the final tree still contains the snapshotted bytes; an external worker can discard a prior attempt's work, report success, and under `no-commit` Drive marks Done and deletes the only copy. INV-006 is ratified; D-020's "delete on Done" clause is derived and is amended by D-034: delete only when every snapshot path is byte-identical in the final tree, otherwise keep the ref and record it. | TASK-805 G2, plan D-034 |
| 3 | Rejected (by design, D-019) | D-019 superseded D-013's supervisor/PID/settlement machinery on purpose: the probe has no process identity, recovery restores instrumented files from digest-verified sidecars, and "a stray test process" is the recorded residual. A surviving process that later rewrites source is outside the amended AC-012 (H-001 (i)(a): restore instrumented files; report other changes the command made). Recorded as a follow-up candidate in the improvement observations, not fixed here. | none (recorded) |
| 4 | Rejected (recorded residual, B-009) | B-009's Outcome lists command substitution, aliases, and redirect-overwrite as residuals "covered by the snapshot in B-011"; the docs state them. The coverage argument depends on finding 2, which is being fixed. Refusing every `$(`/backtick near `git` would block legitimate read-only commands. | none (recorded) |
| 5 | Accepted (P2) | `reportSummary` classifies the selected line, then strips `implemented|status|summary:` prefixes, so `summary: outcome: success` becomes `outcome: success`. Classify the final normalized value. | TASK-805 G3 |
| 6 | Accepted (P2) | snapshot git calls are `execFileSync` with a 60 s timeout and no abort signal; every other Drive git call goes through `runCommand` with the attempt's signal. Make the snapshot use the same abortable runner. | TASK-805 G4 |
| 7 | Accepted (P2; reverses the round-1 rejection of finding 9) | emitting `task_retry` after the next attempt's prompt render and snapshot, but still before its `spawn_started`, satisfies INV-003's "before" and B-002's "a task that is not re-spawned emits no retry event". | TASK-805 G5 |

Verdict handling: DO-NOT-SHIP accepted for round 2; G1..G5 go to TASK-805 (one Drive run, red-first tests), then codex round 3.
