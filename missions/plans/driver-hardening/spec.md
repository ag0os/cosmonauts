## Purpose

Drive is the execution base of every plan: it renders the task prompt, runs a
worker, verifies, commits, and writes task state. During `project-health-audit`
(23 Drive slices in one day, 2026-09-28/29) the coordinator logged 25
observations; the read-only improvement pass distilled them into eight rows and
seven ranked follow-ups in `missions/reviews/improvements/project-health-audit.md`.
The top three rows caused most of the retries: a blocked report destroyed the
worker's notes, `outcome: blocked` was not parseable, and Drive ran postflight
plus an in-run retry after a worker had already stopped on a human question.

This plan fixes those defects in Drive and its adjacent surfaces (the `task_edit`
tool, the analysis capability tools, the worker prompt) so the next plans run on
a base that keeps the worker's record, agrees with its own protocol, and gives
the worker tools whose results fit its context. It is the first of two items
the human added to the quality pause on 2026-09-29 ("keep improving the base
system before major features"); `suite-reliability` follows, then
`execution-liveness` resumes.

Every acceptance criterion below traces to a row of the improvement review
(row numbers in parentheses are the review's table rows; observation numbers
are the coordinator's list). The code paths named were read at
`feature/driver-hardening` HEAD `33913f84`:

| Review row | Defect | Code path read |
|---|---|---|
| 1 | AC-marking protocol only for external backends | `lib/driver/prompt-template.ts` `renderTaskCompletionProtocol` returns `undefined` for `cosmonauts-subagent` |
| 2, 9, 25 | Block reason replaces `implementationNotes`; `task_edit` notes are replace-only | `lib/driver/run-one-task.ts` `blockTask`, `lib/driver/drive-finalization.ts` `transitionDriveTaskStatus` (`partial` and blocked branches), `domains/shared/extensions/tasks/index.ts` `task_edit` |
| 3 (obs. 19) | `outcome: blocked` parses as `unknown` | `lib/driver/report-parser.ts` `OUTCOME_LINE_PATTERN`, `toReportOutcome`; the report contract in `prompt-template.ts` currently says "Do not invent other values such as `outcome: blocked`" while `bundled/coding/prompts/worker.md` tells the worker to set status Blocked |
| 4 (obs. 3, 23) | Postflight and the contradicted-path retry fire after a blocked report; the retry emits only a second `spawn_started` | `run-one-task.ts` `runTaskAttempt` runs `runPostVerify` unconditionally; `lib/driver/runtime-helpers.ts` `runContradictedAttempts` re-spawns with no dedicated event |
| 5 (obs. 8, 11) | `analysis_complexity` result ~100 KB; `paths` scope accepted by the tool but not applied; `analysis_trace` cannot resolve non-exported symbols | `domains/shared/extensions/project-tools/index.ts` `textResult` stringifies the whole result including `native.payload`; `fallow-provider.ts` declares complexity `scopes: ["project"]` and `capabilityArgs` ignores paths for `health --complexity` (Fallow `health` has no per-file filter); `traceArgs` maps symbol traces to `dead-code --trace FILE:EXPORT` |
| 6 (obs. 24) | Extraction verdicts did not check duplication residue | coordinator procedure only; no framework check exists |
| 7 (obs. 20, 21) | Reachability blocks argued from fixture greps; coordinator probes cost a full-suite run each | no helper exists; D-031 set the execution-probe standard by hand |
| 8 (obs. 13, 14) | Worker-supplied quoted `title` renamed the task file; a worker's `git checkout --` discarded a previous attempt's uncommitted work | `lib/tasks/task-manager.ts` `updateTaskLocked` renames on any title change via `getTaskFilename`; workers hold the `coding` tool set (`read`, `bash`, `edit`, `write`) with no guard |
| Small (obs. 6, 16, 17) | `eventLogPath` only in tool `details`, not in the text the model sees; `COSMONAUTS_DRIVER_*` inherited by postflight; schema text says "for detached runs" while the code rejects inline | `domains/shared/extensions/orchestration/driver-tool.ts` `runDriverResult`; `runtime-helpers.ts` `runCommand` spawns with the inherited env; `driver-tool.ts` backend description vs `Unsupported driver backend in inline mode` |
| Roadmap bullet | Drive commit subjects never carry raw report JSON | `runtime-helpers.ts` `reportSummary` takes the first non-empty line of `raw` for `unknown` reports, which can be a JSON fence |

Re-derived from the 41 archived run records
(`missions/archive/sessions/project-health-audit/runs/`, main checkout,
gitignored; read 2026-09-29 after the archive step moved them):

- Of 40 `spawn_completed` reports, 24 parsed `success`, 8 `failure`, 1
  `partial`, 7 `unknown`. Of the 7 unknown, three ended with `outcome: blocked`
  (TASK-768, TASK-776, TASK-782), one with `outcome: task_blocked` (TASK-780),
  and three had no outcome line. Every unknown report reached `task_blocked`
  with the reason `report outcome unknown` or `task failed`, and the worker's
  notes were replaced by that reason (rows 2-3).
- Every `spawn_completed`, including the four with a blocked outcome line, is
  followed by ten `verify` events (five postflight commands, started plus
  passed or failed) before `task_blocked` (row 4).
- Four runs contain two `spawn_started` events with no event between the first
  `task_blocked` and the second `spawn_started` (`run-57fabb1f` TASK-780,
  `run-76487eb0` TASK-768 on `claude-cli`, `run-aaee3993`, `run-fbbd2445`
  TASK-773, the last of which then succeeded). The retry is invisible except by
  counting (row 4, AC-005).
- Three `commit_made` subjects carry report prose or JSON instead of a title:
  TASK-788's subject begins `{"outcome":"success",...`; TASK-780's and
  TASK-778's carry a sentence of the report (roadmap bullet, AC-015).
- The two `task_blocked` reasons `acceptance criteria still unchecked` are both
  `cosmonauts-subagent` runs (TASK-768, TASK-769), matching row 1.

## Intent

Goal: a Drive run never loses what a worker recorded, never acts on a report
its own protocol did not define, and hands the worker tools whose results fit
the worker's context.

Invariants — mechanism yields to these:

- INV-001 - The worker's record survives every Drive outcome. Drive never
  replaces text a worker wrote into a task; anything Drive adds to a task is
  appended under a heading that names Drive, the outcome, and the attempt.
- INV-002 - A blocked report is a question for a human, not a transient
  failure. When a worker reports `blocked`, Drive runs no postflight, spawns no
  automatic retry, and records the worker's reason verbatim as the block
  reason.
- INV-003 - Every re-spawn is announced. Before Drive runs a worker again for
  the same task inside one run, it emits an event that names the trigger.
  Nothing re-spawns silently.
- INV-004 - The protocol and the parser agree, for every backend. Every outcome
  word the rendered prompt allows is parsed, every parsed outcome has one
  documented Drive consequence, and a rule that governs completion (such as
  marking acceptance criteria) reaches every backend in a form that backend can
  act on.
- INV-005 - Analysis results fit their consumer. A capability result honors the
  requested scope or reports the scope unsupported; it never silently widens.
  The text a tool returns to the model is bounded in size, with the full
  provider payload reachable without re-running the provider.
- INV-006 - Task state and the worktree change only through validated paths.
  Worker-supplied task fields are validated before they reach task files, and
  a worker cannot discard uncommitted work left by a previous attempt.

Ranking. INV-001 and INV-002 win over throughput: a lost note or a burned
retry costs more than the minutes a retry might save. INV-005 wins over
completeness: a bounded, scoped result beats a complete one; the complete
inventory stays available through the result's details or a paths-scoped
follow-up call. INV-006 wins over worker autonomy: a guard that refuses a
destructive git command is preferred to a prompt rule the worker may ignore.

Provenance. The scope (the roadmap item's six bullets; ranked follow-ups 1-3
must-have, 4-7 in scope unless argued out) is a human ruling of 2026-09-29
typed to Shepherd and relayed. The invariant wording was drafted by the
coordinator on 2026-09-29 and **ratified as drafted by the human on
2026-09-29** (typed to Shepherd, relayed; recorded in
`.shepherd/work/in-progress/driver-hardening/rulings.md`, Q-001: goal,
INV-001..006, and the Ranking paragraph). These invariants and their ranking
are ratified ground and change only by human decision.

## Users

- Coordinators (human or agent) who read task notes after a blocked slice and
  today re-merge the worker's notes from transcripts.
- Drive workers on every backend, who need one completion protocol, one
  outcome vocabulary, and analysis results they can hold in context.
- The next plans in the pause order (`suite-reliability`, then
  `execution-liveness`), which run on this Drive.
- Reviewers reading `events.jsonl`, who need a retry to be visible as a retry.

## User Experience

A worker that cannot finish sets the task Blocked through `task_edit`, writes
its blocker record into the notes, and ends its response with
`outcome: blocked`. Drive parses that outcome, skips postflight and the
contradicted-path retry, appends its own short record under a Drive heading
below the worker's notes, emits `task_blocked` with the worker's reason, and
ends the task's attempt. The coordinator opens the task file and finds the
worker's record intact.

A worker that reports `failure` or `partial` gets the same append treatment.
When Drive retries a task inside one run (today only the contradicted-path
retry), the event log shows a retry event naming the trigger before the second
`spawn_started`.

Every backend's prompt tells the worker to mark acceptance criteria before
reporting, using the mechanism that backend has: `task_edit` for the in-process
subagent, the `cosmonauts` CLI for external CLI backends.

`analysis_complexity` accepts `paths` and returns only findings in those
paths; its text result is a compact table of findings with the provider
payload left in details. `analysis_trace` on a symbol Fallow cannot resolve
because it is not exported returns an explicit unsupported-target result that
says so, instead of a provider failure.

An extraction slice's verdict runs a residue check that names which owned
clone groups survive at the post-commit tip. A worker who believes a return
site is unreached runs the execution-probe helper and records its hit count
before it may stop `blocked` on that claim.

A worker that passes a quoted title gets it normalized; a worker that runs a
destructive git command in a Drive session gets a refusal naming the rule.
`run_driver` prints the `eventLogPath` in its text, postflight commands run
with the `COSMONAUTS_DRIVER_*` variables removed, and the tool schema says
plainly which backends run in which mode.

## Acceptance Criteria

Blocked-report path (review rows 2-4; must-have):

- [ ] AC-001 - When Drive records a `blocked`, `failure`, or `partial` outcome on
  a task, the worker's existing `implementationNotes` are preserved byte for
  byte and Drive's reason is appended under a heading that names Drive, the
  outcome, the attempt number, and the run ID. (row 2; INV-001)
- [ ] AC-002 - `outcome: blocked` is a parsed report outcome in both the fenced
  JSON form and the outcome-line form, the rendered report contract lists it
  with its meaning, and the worker prompt's blocked protocol and the report
  contract describe the same stop. (row 3; INV-004)
- [ ] AC-003 - On a parsed `blocked` report Drive runs no postflight command,
  performs no contradicted-path retry, sets the task Blocked with the worker's
  reason verbatim, emits `task_blocked` carrying that reason, and the run's
  terminal handling for the task follows the existing `partialMode` rule. (row
  4; INV-002)
- [ ] AC-004 - On an `unknown` report the raw report text reaches the task
  notes under Drive's appended heading, so a worker that wrote a full record
  in an unrecognized shape loses nothing. (row 3; INV-001)
- [ ] AC-005 - Before any in-run re-spawn of the same task, Drive emits one
  event whose type names it a retry and whose payload names the trigger and the
  attempt number; `events.jsonl` for a contradicted-path retry shows it before
  the second `spawn_started`. (row 4; INV-003)
- [ ] AC-006 - `task_edit` offers an append mode for implementation notes that
  never replaces existing notes, the worker prompt says only `task_edit`
  reaches the notes Drive preserves, and the coding worker protocol tells the
  worker to append. (rows 2, 9, 25; INV-001)

Completion protocol for every backend (row 1; must-have):

- [ ] AC-007 - For every backend name, a task with acceptance criteria renders a
  completion-protocol section that tells the worker to mark each verified
  criterion before reporting, using the marking mechanism available to that
  backend; the existing behavior that Drive blocks a `success` report with
  unchecked criteria is unchanged. (row 1; INV-004)

Scoped and compact analysis results (row 5; must-have):

- [ ] AC-008 - `analysis_complexity` with `paths` returns only findings whose
  location lies under one of the requested paths, the binding advertises the
  `paths` scope, and a project-scope call still returns the full inventory.
  (row 5; INV-005)
- [ ] AC-009 - The text content of every `analysis_*` findings result is a
  compact rendering (one row per finding with location, severity, metric
  values where present, and message) whose size is bounded by a stated limit,
  with the provider's native payload available in the result details and not
  repeated in the text. The bound is stated in the analysis documentation.
  (row 5; INV-005)
- [ ] AC-010 - `analysis_trace` on a symbol target the provider cannot resolve
  because it is not exported returns an explicit unsupported-target result
  that says the provider traces exports only and suggests the file-target
  trace, and the analysis skill and documentation state the limit so plans
  do not generalize symbol tracing to non-exported functions. (row 5, obs. 8;
  INV-005)

Verdict and probe helpers (rows 6-7; in scope):

- [ ] AC-011 - A reusable duplication-residue check takes a list of owned clone
  families (or the files they live in) and reports which groups the
  duplication capability still finds at the current tree, in a form a verdict
  can quote; the Drive and analysis skills require it in the verdict of any
  slice whose task is clone extraction. (row 6)
- [ ] AC-012 - A worker-invocable execution-probe helper takes one or more
  source locations and a test command, reports the hit count per location
  under that command, restores every instrumented file to its original digest
  whether the command passed, failed, timed out, or was aborted, and reports
  any other tracked-file change the command made as a side effect that
  invalidates the hit evidence; the worker protocol requires a recorded,
  usable zero hit count from it before a `blocked` stop that claims a site is
  unreached. (row 7; D-031/D-033 standard) *(Amended on record by human
  ruling H-001 (i)(a), 2026-09-29; the original letter read "leaves the
  source tree byte-identical to its start even when the command fails".)*

Worker input hygiene (row 8; in scope):

- [ ] AC-013 - A `title` supplied to `task_edit` is normalized (surrounding
  quotes and redundant whitespace removed) before it reaches the task manager,
  an empty result is rejected with a message, and the task file keeps one
  canonical path after the edit. (row 8, obs. 13; INV-006)
- [ ] AC-014 - In a Drive worker session, a `bash` invocation that would
  discard or rewrite worktree or index state through git (`checkout --`,
  `restore`, `reset`, `stash`, `clean`, and the like) is refused with a
  message naming the rule and the alternative; the commit-policy rules for
  `git add`/`git commit` are unchanged. (row 8, obs. 14; INV-006)
- [ ] AC-015 - A Drive source-commit subject never contains a JSON fence,
  brace-delimited JSON, or the report contract's outcome line; when the
  report summary would, the subject falls back to the task title. (roadmap
  bullet; INV-004)

Small items (ranked follow-up 7; in scope):

- [ ] AC-016 - The text content of a successful `run_driver` result includes the
  `eventLogPath` and the run workdir, so a print-mode caller can report them
  without access to tool details. (obs. 6)
- [ ] AC-017 - Postflight and preflight commands run in an environment from
  which every `COSMONAUTS_DRIVER_*` variable has been removed; the driver's
  own backend resolution still reads them. (obs. 16)
- [ ] AC-018 - The `run_driver` schema text states that `cosmonauts-subagent`
  is inline-only and that `codex` and `claude-cli` are detached-only, and the
  error returned for the wrong pairing says the same thing in the same words.
  (obs. 17)

Proof and safety (brief constraints):

- [ ] AC-019 - Every Drive behavior change has a test that fails on the
  pre-change code and passes after it, and the plan records the failing run
  for each; the blocked-report path is additionally accepted by one real
  end-to-end Drive slice on a throwaway task on the `cosmonauts-subagent`
  inline backend whose task file, events, and run record show AC-001, AC-003,
  and AC-005 holding.
- [ ] AC-020 - No suppression, threshold, baseline, ignore pattern, or
  configuration change is introduced to clear a finding, and no test's expected
  behavior changes except where it pinned the defect being removed, citing the
  criterion.

## Scope

In scope (human ruling 2026-09-29, relayed; ratified ground):

- The roadmap item's six bullets, restated as AC-001 through AC-018 above.
- Ranked follow-ups 1-3 (rows 2-4, 1, 5) are must-have.
- Ranked follow-ups 4-7 (rows 6-8 and the small items) are in scope.

Argued out, with the reason (coordinator-proposed; **confirmed by the human
on 2026-09-29**, Q-003 (a), rulings file above):

- Observation 4 (`bun run lint` reads `.git/info/exclude`-ignored paths and
  formats machine-canonical JSON under `missions/reviews/`). It is a
  lint-configuration matter, not a Drive defect; the only fix is a Biome
  configuration change, which the brief forbids as a way to clear findings,
  and the previous plan already recorded the exclusions it needed (D-019/D-021).
  Recorded here so it is not lost; it belongs to `suite-reliability` or a
  direct fix.

Non-goals:

- Anything from `drive-envelope` (portable run envelope, harness-agnostic
  prompt layers) or `execution-liveness` (the scheduler attempt/lease/
  cancellation seam in `lib/durable-runtime/`). The retry event in AC-005 is
  emitted by the existing contradicted-path loop in `lib/driver/`; it does not
  add attempts, leases, or cancellation semantics.
- The `fallow-provider.ts` `warn` verdict gap (obs. 7, D-023): gate-owned,
  in the human sign-off packet of `project-health-audit`.
- The suite flakes (obs. 5, 10): `suite-reliability`.
- Coordinator process rules (obs. 12, 15, 18, 22): already written into
  handoffs, not tooling.
- New analysis providers, a Fallow bump, a Pi bump, or any change to the
  changed-scope audit floors.
- Pushing, merging, or opening a pull request.

## Assumptions

- The improvement review is the evidence base. Its rows were re-derived
  against the 41 archived run records on 2026-09-29 (see the Purpose section);
  the records confirm rows 1-4 and the commit-subject bullet directly and are
  consistent with the rest. If a row is contradicted during implementation,
  the deviation protocol applies and the review is amended on the record.
- The execution-probe helper (AC-012) may make a temporary source edit inside
  the worker's session, with digest-verified byte-identical restore and a
  refusal to run on a dirty file (human ruling 2026-09-29, Q-002 (a); ratified
  ground for the helper's mechanism).
- Fallow 2.54.2 `health` has no per-file filter (its help lists only
  `--changed-since`), so AC-008's path scope is applied by the adapter after a
  project run; the cost of one provider run per call is unchanged. Fallow
  `dead-code --trace` takes `FILE:EXPORT`, so AC-010 is a surface-level
  classification, not a provider capability.
- Pi's `tool_call` hook can block a tool invocation (the pinned Pi skill lists
  "Block/allow" for that event), which is the mechanism AC-014 will use; if
  the pinned Pi version cannot block, the plan falls back to a bash-tool
  wrapper and records the change.
- The `cosmonauts-subagent` worker holds the `tasks` extension, so AC-007's
  in-process mechanism is `task_edit` with `checkAc`; external backends keep
  the CLI instruction.
- One slice per run stays the operating mode for this plan's own
  implementation, so AC-003's run-level consequence (a blocked task ends the
  run) is observed directly; multi-task runs keep the existing `partialMode`
  semantics untouched.

## Open Questions

None open. All three were ruled by the human on 2026-09-29 (typed to
Shepherd, relayed; `.shepherd/work/in-progress/driver-hardening/rulings.md`).
The rulings are ratified ground:

- Q-001 - Intent INV-001..006 and the ranking: **ratified as drafted**.
- Q-002 - Execution-probe helper mechanism: **(a)**, a temporary source edit
  inside the worker's session with digest-verified byte-identical restore and
  a refusal on a dirty file. Rejected: (b) a throwaway worktree copy of HEAD
  (cannot probe uncommitted refactors); (c) keeping D-031 manual.
- Q-003 - Observation 4 (Biome and `.git/info/exclude`): **excluded** as a
  lint-configuration matter.

Ruled during planning (human, 2026-09-29, typed to Shepherd, relayed;
rulings file round 2):

- H-001 (i) - AC-012's letter: **(a)**, amended on record as shown in the
  criterion. Rejected: (b) keep the whole-tree letter and drop the helper.
- H-001 (ii) - "Dirty file" in Q-002 (a): **(a)**, dirty means the target's
  bytes changed between the digest taken at validation and the
  instrumentation write, or an outstanding probe journal exists for the
  project; git-dirty files are probeable. Rejected: (b) git-dirty.
- D-020 (Drive snapshots the dirty worktree to a run-scoped ref before every
  spawn, for every backend) was reviewed by the human and stands.

Everything else in this spec is derived ground and may be overridden freely.
Note for planning: the branch was rebased onto `main` `e55040de` on
2026-09-29, which includes the `fallow-provider.ts` `warn` verdict fix
(completed non-passing result) and tab-separated `--plain` rows; neither
touches this plan's files.