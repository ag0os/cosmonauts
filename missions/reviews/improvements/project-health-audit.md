---
kind: drive-improvement-observations
status: open
planSlug: project-health-audit
runId: multiple (23 Drive slices, see missions/plans/project-health-audit/coordinator-status.md "Improvement observations")
recordedAt: '2026-09-29'
---

# Drive improvement observations — project-health-audit

Read-only pass over the 23 slice runs (`missions/sessions/project-health-audit/runs/*`),
the 21 task notes, and the coordinator's running observation list (items 1-25 in
`coordinator-status.md`). Prescriptive only. The plan owns none of `lib/driver/*`,
the prompt templates, `report-parser.ts`, or the Pi `task_edit` tool, so nothing
here was changed on the branch; this is a follow-up backlog. Row numbers in
parentheses are the coordinator's observation numbers.

| Observed problem | What happened in this run | Suggested improvement | Why it helps |
|---|---|---|---|
| AC-marking instruction reaches only external backends (1) | `lib/driver/prompt-template.ts:136-158` injects "mark each acceptance criterion before reporting" only for `claude-cli`/`codex`; the `cosmonauts-subagent` worker never sees it, so Drive blocked TASK-768 and TASK-769 attempt 1 on unchecked ACs. Workaround was a standing note in every task. | Inject the block for every backend, or make the postflight AC check backend-aware. | Two lost attempts per plan start; the rule is the same regardless of who runs the worker. |
| A blocked report destroys the worker's notes (2, 9, 25) | On `task_blocked`, `lib/driver/run-one-task.ts:800` replaces `implementationNotes` with the block reason; `task_edit` has only replace-mode notes; a worker that used the file `edit` tool for notes lost them to Drive's state commit. The coordinator re-merged notes from transcripts after every block. | Append the block reason under a `### Blocked (attempt N)` heading instead of replacing; give `task_edit` an `appendImplementationNotes` mode; say in the worker prompt that only `task_edit` reaches the notes. | The blocker record is the most valuable output of a blocked attempt and is currently the first thing lost. |
| `outcome: blocked` is not a parseable outcome (19) | `lib/driver/report-parser.ts:5` accepts `success|failure|partial|completed`; the worker protocol tells workers to stop `blocked`. TASK-776 attempt 1 wrote a full blocker record, parsed as `unknown`, and the run aborted with the notes overwritten. | Add `blocked` to the parser, and on `unknown` keep the raw report text in the notes. | The protocol and the parser disagree on the one outcome that needs a human. |
| Postflight and in-run retry fire after a blocked report (3, 23) | TASK-780 attempt 3 reported `task_blocked`; Drive still ran postflight and a retry worker that started from the block reason as its notes, re-derived the same human question, and stopped 4 minutes later. Retries emit only a second `spawn_started`. | End the run on a `blocked` report without postflight or retry; emit a `worker_retry` event that names the trigger. | A blocked stop is a question for a human, not a transient failure; retrying it burns a worker turn and hides the retry in the event log. |
| Complexity surface results overflow the worker context (8, 11) | Each `analysis_complexity` result is ~100 KB (all findings, no path scope); three in one turn overflowed the worker, and Pi's compaction summary returned it to the same step, looping 21 compactions in 30 minutes (TASK-774 attempt 1). `analysis_trace` cannot resolve non-exported symbols. | Add a `paths`/`files` scope and a compact rendering to the complexity surface; document that trace is export-only so plans do not generalize it. | The D-024 "one metric per turn, direct diagnostic otherwise" rule is a workaround for a tool that cannot be scoped. |
| Extraction verdicts did not check duplication residue (24) | TASK-771's verdict covered complexity, gates, and the freeze; eight of its nine owned same-file clone groups survived unnoticed until the stage-13 verdict compared the whole `fallow dupes` inventory (D-035). | Make the coordinator verdict for an extraction slice diff the owned family list against the post-commit `fallow dupes` inventory; consider a Drive postflight hook that runs the bound duplication capability on the touched files. | A refactor slice's claimed outcome is a measurable inventory delta; the verdict should measure it. |
| Reachability blocks are argued from fixture greps (20, 21) | Workers enumerated return-site reachability by grepping test fixtures; TASK-776 attempt 2's block was false (D-031). Each coordinator counter-probe cost one full-suite run (~2.5 min). Vitest v8 line coverage had duplicated function-map entries for `scheduler.ts`, so it cannot be the standard either. | Provide a worker-side execution-probe helper (run the characterization file with a temporary marker) and require it before a reachability `blocked` stop. | Removes a coordinator round trip per claim and replaces inference with an observation. |
| Worker-supplied task titles and git writes corrupt state (13, 14) | A worker sent `task_edit` a quoted `title`; Drive's state commit wrote the task under a new quoted filename and left the canonical path deleted. Another worker ran `git checkout -- <file>` and discarded the previous attempt's uncommitted refactor. | Reject or normalize `title` from workers; forbid git writes in the worker tool surface (or WIP-commit carry-over between attempts). | Both are silent: nothing failed, the tree was simply wrong at verdict time. |

## Ranked follow-ups

1. Notes preservation on `blocked` (rows 2-4 together: append-not-replace, `blocked` outcome, no postflight/retry after a blocked report). One change to the blocked path fixes three recurring losses.
2. AC-marking block for every backend (row 1).
3. Scoped/compact complexity surface (row 5).
4. Duplication-residue check in extraction verdicts (row 6).
5. Execution-probe helper for reachability claims (row 7).
6. Title normalization and git-write guard for workers (row 8).
7. Smaller items from the observation list: expose `eventLogPath` on `run_driver` results (6); scrub `COSMONAUTS_DRIVER_*` from postflight env or document `ANTHROPIC_MODEL` (16); state in the `run_driver` schema that external backends are detached-only (17); `bun run lint` reads `.git/info/exclude`-ignored paths (4).

## Non-goals

- The `fallow-provider.ts` `warn` verdict gap (7, D-023) is gate-owned and stays in the human sign-off packet; not a driver follow-up.
- The two full-suite flakes (5, 10) are recorded in `project_suite_flakes` memory; they pass in isolation and are not driver defects.
- Coordinator process errors (12, 15, 18, 22) are rules already written into the successor handoffs, not tooling changes.
- Nothing here changes the shipped audit or its record.
