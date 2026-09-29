---
kind: codex-review
plan: driver-hardening
round: 1
reviewed: e55040de..bf0dfc9c (feature/driver-hardening)
command: codex exec -m gpt-6-sol -c model_reasoning_effort=high --sandbox read-only
framing: correctness and liveness review against INV-001..006 and B-001..B-015
recordedAt: '2026-09-29'
verdict: DO-NOT-SHIP
---

# codex review — driver-hardening — round 1

Coordinator triage and dispositions are appended below the report.

**Verdict: DO-NOT-SHIP.** I found nine correctness or liveness findings in `e55040de..HEAD`. The checkout remains unchanged.

### Findings

1. **P1 — Drive can commit probe instrumentation (B-008, INV-006).** Both paths check for a probe journal before commit, but neither holds the probe lock through the commit: [legacy](lib/driver/run-one-task.ts:232), [graph](lib/driver/drive-scheduler-backend.ts:321). Another session can start a probe after that check; Drive can then stage its temporarily instrumented source file. The journal check and staging need one coordinated critical section.

2. **P1 — An unverified process cleanup clears the probe journal (B-008, AC-012).** The process runner can return `termination-error` when it cannot establish that the command’s process tree stopped. The probe treats that as a completed outcome, restores once, and deletes the journal at [execution-probe/index.ts:459](bundled/coding/extensions/execution-probe/index.ts:459) and [index.ts:494](bundled/coding/extensions/execution-probe/index.ts:494). A surviving process can rewrite the source afterward, while Drive sees no outstanding journal. Retain a `recovery-required` journal for unverified cleanup.

3. **P1 — A final blocked line can parse as success (B-013, INV-002/004).** [report-parser.ts:59](lib/driver/report-parser.ts:59) takes the *first* outcome line, although the prompt makes the last line authoritative. I confirmed that `outcome: success` earlier in the response followed by final `outcome: blocked` parses as `success`. Both Drive paths then proceed to postflight instead of honoring the human stop.

4. **P2 — A supported Git option bypasses the Drive guard (B-008/009, AC-014).** [drive-worker-tool-guard.ts:71](lib/agents/drive-worker-tool-guard.ts:71) does not skip `--no-pager`. `isDestructiveGitCommand("git --no-pager reset --hard")` returns `false`; Git accepts that global option. The same classifier guards probe test commands, so both entry points permit this destructive command.

5. **P2 — Snapshot creation can hang Drive before a spawn (B-011).** [runtime-helpers.ts:312](lib/driver/runtime-helpers.ts:312) runs Git synchronously without a timeout or abort signal, including `git add -A` at [line 348](lib/driver/runtime-helpers.ts:348). A stalled Git clean filter blocks the event loop indefinitely; the task timeout has not started. Run snapshot Git with bounded, abortable processes.

6. **P2 — Snapshots can include files excluded by the user (B-011).** [runtime-helpers.ts:343](lib/driver/runtime-helpers.ts:343) replaces `core.excludesFile` with a file containing only session paths. If a user’s global excludes ignore `.env`, a dirty tracked file triggers a snapshot that can add `.env` to the retained ref. Preserve the existing excludes alongside the session exclusions.

7. **P2 — A JSON line can still become a commit subject (B-011, AC-015).** [runtime-helpers.ts:50](lib/driver/runtime-helpers.ts:50) rejects brace-delimited JSON only when the *entire notes string* is JSON. I confirmed that notes starting `{"outcome":"success"}` followed by another line return that JSON as `reportSummary`; [drive-finalization.ts:756](lib/driver/drive-finalization.ts:756) uses it in the subject. Classify the selected summary line before accepting it.

8. **P2 — Trailing separators silently empty a paths scope (B-005/007, INV-005).** [fallow-provider.ts:2505](domains/shared/extensions/project-tools/fallow-provider.ts:2505) preserves a trailing `/`; the descendant test then looks for `src//` at [line 2524](domains/shared/extensions/project-tools/fallow-provider.ts:2524). A request for `src/` or `./` can return a clean verdict despite findings below that directory. Normalize trailing separators before matching.

9. **P2 — `task_retry` can be emitted without a second spawn (B-002, AC-005).** [runtime-helpers.ts:456](lib/driver/runtime-helpers.ts:456) emits the retry before entering the next attempt. If prompt rendering or the new snapshot step fails, the event log has `task_retry` but no following `spawn_started`. Emit it at the successful spawn boundary, or record the failed retry explicitly.

### Behavior check

| Behavior | Review result |
|---|---|
| B-001 | No issue found in either Drive path |
| B-002 | Finding 9 |
| B-003 | No issue found in note preservation and locked appends |
| B-004 | No issue found |
| B-005 | Finding 8 |
| B-006 | No issue found |
| B-007 | Finding 8 affects the residue scope |
| B-008 | Findings 1, 2, and 4 |
| B-009 | Finding 4 |
| B-010 | No issue found |
| B-011 | Findings 5–7 |
| B-012 | Evidence is present; the defects above prevent acceptance |
| B-013 | Finding 3 |
| B-014 | No issue found in the 32 KiB UTF-8 cap, native-detail separation, or D-032 error handling |
| B-015 | No issue found in the rendered prompt and worker guidance |

I also found no changes under `lib/durable-runtime/`, and no changed suppression, threshold, baseline, ignore-pattern, or configuration files. `git diff --check` passed; the focused parser and guard suites passed **42/42**. Those suites do not cover the reproduced cases above.

## Coordinator triage (2026-09-29, implementing coordinator)

Each finding was checked against the code at `bf0dfc9c` before disposition.

| # | Disposition | Ground truth | Route |
|---|---|---|---|
| 1 | Accepted (P1) | `blockForProbeJournal` runs before postflight and before commit on both paths, but no lock is held from the check through `git add`/`commit`; the probe lock is a separate project-wide entity lock. Cross-session race, narrow but real under INV-006. | TASK-804 F1 |
| 2 | Accepted (P1) | `execution-probe/index.ts` treats any defined `outcome` as completed, restores once, and `rm`s the journal at the end; `process-runner.ts` returns `kind: "termination-error"` when it cannot verify the process tree stopped. | TASK-804 F2 |
| 3 | Accepted (P1) | `parseOutcomeLine` uses `stdout.match(OUTCOME_LINE_PATTERN)` (first match) while the contract says the outcome line is the final line. Reproduced by codex. | TASK-804 F3 |
| 4 | Accepted (P2) | the global-option skip list in `drive-worker-tool-guard.ts` lacks `--no-pager` and the other git global options. | TASK-804 F4 |
| 5 | Accepted (P2) | `snapshotWorktree` uses `execFileSync` without `timeout`. | TASK-804 F5 |
| 6 | Accepted (P2) | the temporary `core.excludesFile` (coordinator fix `f2d6242c`) replaces the user's global excludes. | TASK-804 F6 |
| 7 | Accepted (P2) | `reportSummary` classifies the whole trimmed text, then selects the first non-empty line without classifying it. | TASK-804 F7 |
| 8 | Accepted (P2) | `canonicalScopePath` is `posix.normalize`, which keeps a trailing `/`; the descendant test then requires `src//`. | TASK-804 F8 |
| 9 | Rejected | INV-003 requires the announcement *before* Drive runs the worker again; `task_retry` is emitted before the second attempt by design (D-006, D-021). A re-spawn that then fails (prompt render, snapshot) is recorded by that attempt's own failure or the run abort, so the log is honest: an announced retry that did not start. Moving the event after `spawn_started` would violate the invariant; adding a "retry failed" event is out of this plan's scope. | none (recorded) |

Verdict handling: DO-NOT-SHIP is accepted as the round-1 verdict; findings 1–8 go to TASK-804 (one Drive run, red-first tests), then codex round 2 re-reviews `e55040de..HEAD`.
