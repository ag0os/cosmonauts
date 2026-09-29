---
title: Fix the Drive Defects the Health Audit Exposed
status: active
createdAt: '2026-09-29T13:31:06.260Z'
updatedAt: '2026-09-29T14:49:50.237Z'
---

## Overview

Harden the existing Drive execution path and its adjacent task, analysis, and worker surfaces using `missions/reviews/improvements/project-health-audit.md` as the evidence base. The implementation is behavior-first and keeps the graph-backed Drive path and the legacy single-task path in parity without changing scheduler attempt, lease, or cancellation semantics. The blocked-report path is delivered first so every later slice can record failures and blockers without destroying worker notes.

This plan covers all eight audit rows and ranked follow-ups 1–7. It introduces no work from `drive-envelope`, `execution-liveness`, or the excluded observation 4.

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

Everything else in this spec is derived ground and may be overridden freely.
Note for planning: the branch was rebased onto `main` `e55040de` on
2026-09-29, which includes the `fallow-provider.ts` `warn` verdict fix
(completed non-passing result) and tab-separated `--plain` rows; neither
touches this plan's files.

## Architecture Context

- `docs/orchestration.md` and `lib/driver/README.md` make the graph-backed path through `lib/driver/drive-scheduler-backend.ts` the shipped Drive path. `lib/driver/run-one-task.ts` retains equivalent legacy behavior and must stay in parity. `lib/driver/durable-events.ts`, `lib/driver/durable-steps.ts`, `lib/driver/event-stream.ts`, and `lib/driver/shell-command-finalizer.ts` are compatibility consumers of report and event contracts; they change with those contracts without moving scheduler ownership.
- The scheduler attempt/lease/cancellation state in `lib/durable-runtime/` is outside this plan. A task step continues to return the existing durable `StepResult`; blocked-report handling terminates the worker attempt before postflight and hands that result to the existing graph.
- Task files remain owned by `TaskManager`. Driver code depends on the generic task update contract; task code does not import Driver concepts. Raw note preservation and an unconditional task-ID mutation lock belong in the task module, while Drive-specific headings belong in Driver runtime helpers.
- `missions/architecture/tool-ecosystem.md`, `docs/analysis-capabilities.md`, and `docs/fallow.md` keep provider-neutral contracts in `lib/analysis/`, provider behavior in the Fallow adapter, and Pi presentation in extensions. The execution probe is a separate worker-only extension with an explicit capability prompt, so loading `project-tools` in read-only agents does not grant project execution. It reuses the existing settled process-tree runner rather than adding a second child-lifecycle implementation.
- `lib/orchestration/definition-resolution.ts` supplies the existing coding Bash tool. The pinned Pi API exposes a blocking `tool_call` event, and session assembly receives sub-agent runtime context; the guard wraps that existing tool only when `parentRole` is `driver`, without replacing tool resolution or affecting external sessions.
- Planning-time structural evidence is unavailable: complexity, duplication, boundary-conformance, and trace were all unbound with reason `execution-not-consented`. This is absence of evidence, not a clean baseline; implementation must rely on behavior-first evidence and sign-off's configured checks rather than assume the touched units are structurally clean.

## Decision Log

- **D-001 - Ratified intent and ranking govern implementation**
  - Decision: preserve INV-001..INV-006 and their Ranking paragraph exactly; mechanism, throughput, and output completeness yield in the stated order.
  - Alternatives: reinterpret the audit rows during planning; optimize retry throughput over note preservation.
  - Why: Q-001 explicitly ratified this ground.
  - Decided by: human, 2026-09-29 (spec Q-001)

- **D-002 - The probe edits the live clean file temporarily**
  - Decision: instrument only clean target files in the worker's current project and restore them to digest-verified byte identity.
  - Alternatives: probe a HEAD worktree copy; leave probing manual.
  - Why: Q-002 (a) ratified live-session temporary edits, dirty-file refusal, and digest-verified restoration.
  - Decided by: human, 2026-09-29 (spec Q-002 (a))

- **D-003 - Observation 4 stays excluded**
  - Decision: make no formatter, ignore-pattern, suppression, baseline, threshold, or other configuration change for the excluded Biome behavior.
  - Alternatives: absorb it as a small cleanup.
  - Why: Q-003 (a) excluded it and AC-020 forbids clearing findings through configuration changes.
  - Decided by: human, 2026-09-29 (spec Q-003)

- **D-004 - `blocked` is a distinct parsed report variant with an early terminal branch**
  - Decision: preserve raw stdout on a blocked report; use non-empty `notes` verbatim when present and otherwise raw stdout verbatim. Both Drive paths branch immediately after `spawn_completed`, before postflight, commit, acceptance inference, or contradiction classification. The durable projector records the blocked report as blocked before the existing `task_blocked` terminal event.
  - Alternatives: map `blocked` to `failure`; keep it `unknown` and infer from task status.
  - Why: only a distinct early branch satisfies INV-002 and keeps parser, legacy events, and durable evidence aligned (review-1.md PR-006).
  - Decided by: planner-proposed

- **D-005 - Task notes use source-preserving append under an unconditional mutation lock**
  - Decision: every task update acquires an always-on cross-process lock keyed by task ID. Append mode patches the exact existing raw `Implementation Notes` section in the original task source after other fields are serialized, leaving every pre-existing note byte unchanged, then adds a level-three Drive heading and text.
  - Alternatives: parsed read/serialize append; Driver-side read/concatenate/write; rely on the conditional episode-capture lock.
  - Why: parser normalization and the optional episode lock cannot satisfy INV-001 or concurrent append safety (review-1.md PR-001, PR-002).
  - Decided by: planner-proposed

- **D-006 - Retry status suppression never suppresses attempt evidence**
  - Decision: the contradicted-path loop passes a one-based attempt number and distinguishes `skipStatusTransition` from note persistence. Attempt 1 appends its structured Drive record, then emits `task_retry` with trigger, path, and attempt 2 immediately before the second spawn.
  - Alternatives: infer retries by counting spawns; keep `skipTaskUpdate`; add scheduler attempts or leases.
  - Why: every attempt record must survive and every re-spawn must be explicit without entering the execution-liveness seam (review-1.md PR-008).
  - Decided by: planner-proposed

- **D-007 - Scoped Fallow results are filtered after one project run**
  - Decision: advertise `paths` for complexity and duplication. Validate and normalize one full project payload, then retain a finding when any normalized location equals or lies below a requested path. Exclude locationless findings, recompute the scoped verdict, and retain the unfiltered native envelope in details.
  - Alternatives: reject paths; run once per path; pretend Fallow has a file filter.
  - Why: adapter-side filtering is the only truthful one-run implementation of INV-005 and also supplies duplication residue.
  - Decided by: planner-proposed

- **D-008 - Every analysis tool response has bounded model-facing text**
  - Decision: use a shared 32,768 UTF-8 byte renderer for findings, traces, fix previews, status, and non-ready resolutions, and cap typed provider-error messages under the same limit. Native payload never appears in text; complete typed/native completed-result data remains in details. Overflow carries a deterministic omission or truncation line.
  - Alternatives: bound only findings; stringify complete results; drop native details.
  - Why: INV-005 applies to every analysis response, while its Ranking permits bounded display to omit rows (review-1.md PR-003).
  - Decided by: planner-proposed

- **D-009 - Non-exported trace classification is a pre-execution provider check**
  - Decision: the private Fallow runtime exposes `classifyRequest(request, signal)` returning an optional provider-constraint `AnalysisUnsupportedTargetResolution`. The project-tools adapter calls it after generic binding resolution and before `execute`; `execute` remains `AnalysisResult`-only.
  - Alternatives: widen provider execution results; map exit 2 generically; export internal functions.
  - Why: the signature keeps resolution and completed results distinct and classifies only the confirmed exports-only limitation (review-1.md PR-009).
  - Decided by: planner-proposed

- **D-010 - Duplication residue reuses the existing capability**
  - Decision: use `analysis_duplication` with owned file paths as the reusable residue check; do not add a second duplication tool. Skills require clone-extraction verdicts to quote surviving scoped groups or an empty result.
  - Alternatives: add `analysis_duplication_residue`; leave the check as coordinator prose.
  - Why: path-scoped duplication already has the required inputs and output.
  - Decided by: planner-proposed

- **D-011 - Drive Git safety is a session-scoped Pi guard**
  - Decision: session assembly loads a blocking `tool_call` guard only for Pi sub-agents whose runtime parent is `driver`. It blocks destructive Git worktree/index verbs in Bash while leaving read-only Git and the existing add/commit policy unchanged. External CLI backends retain prompt guidance because they do not emit Pi events.
  - Alternatives: modify global Bash; rely only on prose; change repository permissions.
  - Why: this is the narrow enforceable seam named by AC-014.
  - Decided by: planner-proposed

- **D-012 - Delivery uses eleven dependency-ordered slices**
  - Decision: complete note preservation, blocked handling, and retry visibility in slices 1–4 before using Drive for the remaining seven slices. Each slice records red evidence before implementation.
  - Alternatives: parallelize immediately; combine all changes into one run.
  - Why: later failure evidence is trustworthy only after the must-have path preserves it.
  - Decided by: planner-proposed

- **D-013 - Probe recovery is journaled, exclusive, process-identified, and process-settled**
  - Decision: a project-wide probe lock covers validation through restoration. A durable manifest records every original and planned instrumented digest before any source write. A detached command supervisor cannot release the project command until its process-tree identity is durable; recovery settles that recorded tree before touching source. Recovery accepts both original and planned bytes, restores only known instrumented bytes from a digest-verified backup, and treats every other digest as a conflict.
  - Alternatives: in-memory backups; per-file locks; start the test shell before persisting its identity; restore immediately after signalling only the shell leader.
  - Why: this closes multi-file and parent-crash windows and prevents overlapping probes or live descendants from racing restoration (review-1.md PR-004, PR-005).
  - Decided by: planner-proposed

- **D-014 - Unknown raw output is persisted before inference**
  - Decision: both Drive paths append an `unknown` attempt record immediately after parsing and before postflight. Later success inference or failure transition does not replace or duplicate that record.
  - Alternatives: append only when unknown remains failure; copy raw text into synthetic success notes.
  - Why: AC-004 is unconditional and the current success-inference branch otherwise discards the raw report (review-1.md PR-007).
  - Decided by: planner-proposed

- **D-015 - Compatibility consumers and quality ownership are explicit**
  - Decision: update all Driver event/report/finalizer consumers named in Architecture Context. Carry the requested abstract quality contract inside B-012, owning risks, and per-slice evidence rather than a parallel gate section. Test files remain worker-chosen and are intentionally omitted from Files to Change under the canonical plan format.
  - Alternatives: let exhaustive consumers fail during implementation; declare a standalone gate list; preselect test files before workers inspect coverage.
  - Why: this resolves review-1.md PR-006 and PR-010 without crossing into `lib/durable-runtime/` or violating plan artifact rules.
  - Decided by: planner-proposed

- **D-016 - Closing consistency pass keeps mechanisms aligned with invariants**
  - Decision: same-file probe locations are batched with unique markers, backup bytes are verified before restore, provider errors share the text bound, and new Driver attempt artifacts carry an explicit local-attempt schema. No behavior, risk, or implementation stage now depends on a weaker mechanism than its governing invariant.
  - Alternatives: leave those details to implementers; rely on successful-path evidence only.
  - Why: it resolves the final cross-section discrepancies between D-008/D-013, B-005/B-008, and stages 4/7/9 before handoff.
  - Decided by: planner-proposed

## Behaviors

### B-001 - Worker records survive every non-success or unknown attempt

- Source: AC-001, AC-002, AC-003, AC-004
- Observer: a coordinator examining a Drive task, its legacy and durable events, and its terminal run result
- Entry point: `run_driver` when a backend returns a worker report or an attempt fails before a parseable report
- Outcome: `blocked` is recognized under the same contract the worker saw; its notes, or otherwise raw report, become the verbatim block reason. Drive marks the task Blocked, appends under a Drive/outcome/attempt/run heading without changing any existing note byte, emits that reason, and performs no postflight, commit, acceptance inference, or contradiction retry after the report. Every `failure` and `partial` attempt—including a retry candidate whose status stays In Progress—and every spawn failure appends the same structured record. Every `unknown` report appends its complete raw text before any postflight-based success inference. Existing `partialMode` scheduling behavior remains unchanged.

### B-002 - Every attempt record and in-run retry is explicit

- Source: AC-005
- Observer: a reviewer reading `events.jsonl`, normalized activity, and task notes
- Entry point: a task whose first failure claims that an existing project path is absent
- Outcome: attempt 1's Drive note is persisted while its status remains In Progress; exactly one retry event names the contradicted-path trigger, path, and next attempt number before the next spawn; attempt 2 receives its own note if non-successful. A task that is not re-spawned emits no retry event.

### B-003 - Task edits preserve notes and canonicalize titles

- Source: AC-006, AC-013
- Observer: a worker using `task_edit` and a coordinator opening the resulting task artifact
- Entry point: `task_edit` with implementation notes in append mode or with a quoted/irregular title
- Outcome: append mode preserves the exact pre-existing raw note bytes and adds supplied text once, including under concurrent cross-process append calls; replace mode retains its existing meaning and contradictory note modes are rejected. A title loses surrounding quote pairs, trims and collapses redundant whitespace, and produces one canonical task path; a title that normalizes empty is rejected without changing the task.

### B-004 - Every backend receives an actionable completion protocol

- Source: AC-007
- Observer: a Drive worker on any supported backend
- Entry point: the rendered prompt for a task with acceptance criteria
- Outcome: the worker sees how to mark every verified criterion before reporting, using `task_edit` in an in-process worker and the task CLI in an external worker. A success report with unchecked criteria remains blocked.

### B-005 - Analysis results honor scope and context budget

- Source: AC-008, AC-009
- Observer: an agent calling any `analysis_*` tool
- Entry point: status, findings, trace, fix-preview, or provider-failure analysis, including project- and paths-scoped complexity
- Outcome: project complexity exposes its full requested-metric inventory; paths scope contains only findings with a matching location and never silently widens. Findings text gives one compact row per displayed finding with location, severity, available metric values, and message. Trace and fix-preview use equally compact variant-specific rows. Every analysis response's model-facing text excludes native payload, reports omissions or truncation, and is at most 32,768 UTF-8 bytes; complete typed and native completed-result data remain in details without another provider run.

### B-006 - Trace limitations are explicit

- Source: AC-010
- Observer: an agent tracing a non-exported symbol with the Fallow-backed trace tool
- Entry point: `analysis_trace` with a symbol and project-relative source path
- Outcome: before provider execution, a confirmed non-export returns `unsupported-target`, states that Fallow traces exports only, and suggests a file-target trace. Exported or indeterminate targets retain normal provider handling. Analysis guidance prevents planners from treating this as proof about non-exported function reachability.

### B-007 - Clone extraction verdicts report residue

- Source: AC-011
- Observer: a worker or reviewer assessing a clone-extraction slice
- Entry point: path-scoped `analysis_duplication` over the files owned by that slice
- Outcome: the result names every surviving clone group with an owned location, or states that none remain, in bounded text that can be quoted in the verdict; Drive and analysis guidance require that evidence for clone-extraction work.

### B-008 - Execution probes produce recoverable hit evidence

- Source: AC-012
- Observer: a Drive worker evaluating whether one or more source sites are unreached
- Entry point: the worker-only execution-probe tool with clean tracked locations, language-appropriate marker statement templates, a test command, timeout, and explicit project-execution confirmation
- Outcome: under one exclusive project lock, the tool runs the command once and reports a hit count for each distinct location only after the command's process tree is quiescent. Multiple locations in one file are supported. It restores every instrumented regular file to its original digest when a failing, timed-out, or aborted command has settled; it refuses dirty, symlinked, non-regular, escaped, or duplicate locations. Interrupted work is recovered from persisted process identity plus original/planned digests; corrupt backups, unknown source bytes, or an unverified surviving tree preserve evidence and return recovery-required, never a fabricated zero or restoration claim. Worker guidance accepts a zero-hit blocker only from a successful test command and verified restoration.

### B-009 - Destructive Git is refused in Drive Pi workers

- Source: AC-014
- Observer: an in-process Drive worker invoking Bash
- Entry point: a Bash call containing a Git operation that discards or rewrites worktree or index state
- Outcome: the tool call is blocked before execution with the Drive safety rule and a non-destructive alternative. Read-only Git calls and the existing add/commit policy are not redefined, and the same Bash call outside a Drive worker session is unaffected.

### B-010 - Drive operator output and mode errors agree

- Source: AC-016, AC-018
- Observer: a print-mode caller launching Drive
- Entry point: `run_driver`
- Outcome: a successful launch's visible text includes both workdir and event-log path. Its schema and every wrong backend/mode error use the same rule: `cosmonauts-subagent` is inline-only, while `codex` and `claude-cli` are detached-only.

### B-011 - Drive child execution does not leak control metadata

- Source: AC-015, AC-017
- Observer: a coordinator inspecting a Drive-created source commit and a project preflight/postflight process
- Entry point: `run_driver` with driver-owned commits and project commands
- Outcome: a source-commit subject uses a safe report summary or the task title, never a JSON fence, brace-delimited JSON, or report outcome line; unknown-success inference preserves the title fallback instead of substituting another generic subject. Project preflight and postflight processes receive no `COSMONAUTS_DRIVER_*` variables, while backend selection still reads the parent environment.

### B-012 - Acceptance evidence proves the hardening without weakening checks

- Source: AC-019, AC-020
- Observer: the implementing coordinator and final reviewer
- Entry point: the completed change set, per-slice evidence, and a real inline `run_driver` acceptance slice on a throwaway task
- Outcome: the abstract quality contract is carried as behavior evidence, static correctness, structural conformance, integration evidence, and change integrity—without declaring runtime commands. Every changed Drive behavior has a recorded pre-change failure and post-change pass. The real slice shows attempt 1's note, an announced retry, and a blocked attempt 2; preserves all prior worker bytes; runs postflight only before attempt 1; and leaves task, event, and run records consistent. The change set contains no suppression, threshold, baseline, ignore-pattern, or configuration workaround, and any changed expectation cites the defect criterion it removes.

## Design

### 1. Source-preserving task mutation

Make note modes unrepresentable together:

```ts
interface TaskUpdateFields {
  // existing fields except implementationNotes
}

type TaskUpdateInput = TaskUpdateFields & (
  | { implementationNotes?: string; appendImplementationNotes?: never }
  | { implementationNotes?: never; appendImplementationNotes?: string }
);
```

All `TaskManager.updateTask` calls acquire an unconditional `withEntityFileLock` at a task-ID-derived `.cosmonauts/*.lock` path before lookup, parse, rename, write, and release. The task lock is always outermost; the existing episode transition lock remains nested only for episode capture and is never acquired in the reverse order. A stable ID lock protects title renames across old/new filenames and separate processes.

For append mode, the manager removes `appendImplementationNotes` before forming the `Task`, computes the semantic appended notes so canonical serialization emits one target section, and passes original bytes plus that serialization to a focused task note editor. The editor accepts zero or one raw `## Implementation Notes` section in the original—including an empty section—and exactly one in the canonical document. If an original section exists, it composes the exact original section span, preserving its heading, line endings, spaces, and boundary blank lines, followed by a separator in that section's line-ending style and the new text. It then replaces the canonical section with that composed span. With no original section, it keeps the canonical new section. Duplicate/ambiguous sections or an empty append are rejected before write. Replace mode keeps canonical serialization. Evidence compares raw byte slices, including CRLF, trailing spaces, empty sections, and boundary blank lines; parsed-value equality is insufficient.

The task extension exposes `implementationNotesMode: "replace" | "append"` (default replace) and maps append mode to the atomic input. It normalizes tool-supplied titles by trimming, repeatedly removing matching surrounding single/double/backtick pairs, trimming again, and collapsing internal whitespace runs. Empty output fails before persistence.

Drive additions use:

```text
### Drive — outcome <blocked|failure|partial|unknown> — attempt <n> — run <runId>

<reason or raw report>
```

Level three is contractual because level two terminates the parser's notes section. Every Driver note write, including retry candidates and finalization failures, uses source-preserving append.

### 2. Report, note, and transition matrix

Keep executable postflight outcomes separate from a human block:

```ts
interface BlockedReport extends Omit<Report, "outcome"> {
  outcome: "blocked";
  raw: string;
}

type ParsedReport = Report | BlockedReport | { outcome: "unknown"; raw: string };
```

Both blocked forms retain original stdout. Non-empty `notes` is authoritative without trimming; otherwise raw stdout is authoritative. `lib/driver/durable-steps.ts` maps a blocked `spawn_completed` report to an existing blocked `StepResult` with `wait_for_human` and the same untrimmed reason; no `lib/durable-runtime/` type changes.

After `spawn_completed`, both task paths follow:

| Parsed report | Immediate note | Postflight | Contradiction retry | Final task effect |
|---|---|---|---|---|
| `success` | None | Run | Only if existing later checks create a failure candidate | Existing success/unchecked-AC behavior |
| `failure` | Append when attempt is finalized, including before retry | Run | Existing one-time rule | Blocked on final attempt; status unchanged on retry candidate |
| `partial` | Append when attempt is finalized, including before retry | Run | Existing one-time rule | Existing `partialMode`; status unchanged on retry candidate |
| `blocked` | Append verbatim reason | **Do not run** | **Never** | Blocked and terminal for this task attempt |
| `unknown` | Append complete raw stdout **before inference** | Run under existing rules | Existing rule only if a later candidate qualifies | Existing inferred-success/failure status; no second unknown note |

Spawn failures use the failure append path even without a parsed report. A blocked task leaves Drive's control and can exit Blocked only through a later explicit task edit or run; Drive never auto-clears it. Partial remains In Progress for later work. Unknown note persistence failure aborts the attempt before inference rather than proceeding with lost evidence.

### 3. Retry and compatibility events

`runContradictedAttempts` passes `{ appendedNote, attemptNumber }` and its retry callback receives `{ trigger, attemptNumber, contradicted }`. Rename finalizer control to `skipStatusTransition`; note append and the contradicted terminal event still occur for attempt 1. Then emit:

```ts
{
  type: "task_retry";
  taskId: string;
  trigger: "contradicted-path";
  attemptNumber: 2;
  contradicted: { path: string; existsOnDisk: true };
}
```

The graph callback emits this and then its second `spawn_started`; the legacy attempt emits its own next `spawn_started`. `lib/driver/durable-events.ts` adds the exhaustive normalizer as retry activity, and `lib/driver/event-stream.ts` bridges it for live subscribers while legacy JSONL remains authoritative. `lib/driver/durable-steps.ts` carries local attempt metadata when reconstructing compatibility records. The retry loop exits on a normal outcome or after finalizing attempt 2; it creates no persisted scheduler state.

Every new graph task-output report artifact carries `{ driverAttemptSchema: 1, attemptNumber }`. `shell-command-finalizer.ts` reads it for source/task finalization notes, so a fresh finalizer process does not use empty in-memory state. A schema-1 artifact missing its number is invalid and blocks finalization. A pre-feature artifact with no schema uses an explicit, diagnosed compatibility fallback of attempt 1; it is never presented as newly persisted evidence.

### 4. Prompt composition

Tasks with acceptance criteria always receive a completion section. `cosmonauts-subagent` uses `task_edit` with `checkAc`; external backends use the existing task CLI instruction. The report contract lists `blocked` as a human stop with no postflight or retry.

The coding worker prompt uses task-note append mode, says response prose is not the durable record, aligns Blocked status with `outcome: blocked`, uses `partial` for unfinished carry-over, forbids destructive Git, and requires a successful restored execution probe before an unreached-site block. Authored prose is reviewed for those agent outcomes; rendered protocol behavior is code-tested.

### 5. Analysis scoping, classification, and bounded presentation

Add optional provider-neutral values:

```ts
readonly metricValues?: Readonly<Partial<Record<AnalysisMetric, number>>>;
```

Fallow promotes cyclomatic/cognitive/CRAP numbers while retaining native detail. Complexity and duplication advertise `paths`; Fallow still runs once at project scope. After full schema and provider-verdict reconciliation, canonicalize project-relative separators and dot segments, then retain a finding if any location equals a requested path or starts with that directory plus `/`; exclude locationless findings, recompute the scoped verdict, preserve coverage, and never mutate native payload. Project scope bypasses filtering.

One shared renderer caps every analysis tool's model-facing text at 32,768 UTF-8 bytes and reserves room for an omitted-count or truncation line without splitting code points. Findings rows carry locations, severity, metric values, and message; trace rows carry nodes/edges/evidence; fix-preview rows carry proposed action and locations; status and non-ready resolutions use bounded summaries. A single oversized row is truncated deterministically. Native payload and provider details are omitted from text but remain complete in `details`. The typed `AnalysisProviderError` keeps full structured process fields but caps its formatted message to the same bound, so provider-failure tool text cannot bypass INV-005.

`analysis_duplication({ paths })` is the residue helper. Skills require all extraction-owned files and a quoted survivor/empty result.

Refactor unsupported target data as a discriminated union so existing `unsupported-kind`/`missing-identity` shapes remain unchanged and the provider variant is explicit:

```ts
type AnalysisUnsupportedTargetResolution =
  | ExistingUnsupportedTargetResolution
  | {
      kind: "unsupported-target";
      capability: "trace";
      providerId: string;
      requestedTargetKind: "symbol";
      reason: "provider-target-constraint";
      message: string;
      suggestedTarget: Extract<AnalysisTraceTarget, { kind: "file" }>;
    };
```

The private Fallow runtime adds:

```ts
classifyRequest(
  request: AnalysisRequest,
  signal?: AbortSignal,
): Promise<AnalysisUnsupportedTargetResolution | undefined>;
```

After generic `resolveAnalysisRequest` returns ready, project-tools calls this classifier before `runtime.execute`. A TypeScript-compiler AST check handles JS/TS direct exports, export lists/aliases, default exports, and supported CommonJS assignments. Confirmed absent exports return the exports-only unsupported result and file suggestion without spawning Fallow. Re-exports, unsupported languages, unreadable files, and syntactically indeterminate source return `undefined` and retain normal provider handling. `execute` remains `Promise<AnalysisResult>`.

### 6. Worker-only execution probe

Ship `execution_probe` from its own extension and add an `execution-probe` capability to the coding worker; do not register it in `project-tools`, which is loaded by read-only roles. Boundary input is:

```ts
interface ExecutionProbeInput {
  locations: readonly {
    path: string;
    line: number;
    statementTemplate: string; // contains {{hitFile}} and {{marker}}
  }[];
  testCommand: string;
  timeoutMs?: number;
  confirmProjectExecution: true;
}
```

The caller supplies syntax appropriate to each source language; the tool substitutes JSON string literals for a private OS-temporary hit file and a unique marker per location, and requires each statement to append that marker. It groups locations by canonical file and constructs one planned byte sequence from original lines, applying distinct-line insertions in descending order so line numbers remain source-relative. Exact duplicate `(realpath, line)` entries are rejected; different lines in the same file are supported. One test command runs after all locations are instrumented, addressing the per-site full-suite cost. A zero count is usable only when that command succeeds.

Acquire one project-wide `withEntityFileLock` before recovery or validation and hold it through process settlement and restore. Canonicalize project root and target realpaths; require tracked regular files whose realpaths stay inside the root; reject symlinks, duplicate locations, staged/unstaged target changes, and invalid lines.

Use a deterministic mode-0700 recovery directory under the OS temp root, keyed by a hash of the canonical project root while storing the exact root as identity. Before any source write, compute every original and planned instrumented byte sequence, persist original sidecars, fsync them, verify each sidecar against its original digest, and atomically/fsync a manifest containing project identity plus both digests for every file. No restore writes a sidecar whose digest does not match the manifest.

The command starts through the existing process-tree runner behind a private detached supervisor and a one-use `go` gate. The manifest enters an arming state before spawn; the supervisor writes its PID/process-group identity and waits behind the gate with a durable absolute arm deadline. The tool persists that identity before modifying source. Only after every atomic source replacement matches its planned digest does the manifest enter running and the tool create the gate. If the parent dies before identity persistence, the supervisor can never run the project command and exits at the arm deadline; recovery waits through that recorded deadline before clearing an all-original state. Thus no crash window permits an unidentified project command to run against live edits.

Recovery under the same project lock first settles any persisted supervisor/process tree using the runner's platform-specific termination and positive liveness check, then classifies every current source digest:

| Current digest | Recovery action |
|---|---|
| original | File was untouched or already restored; verify and continue |
| planned instrumented | Restore the already-verified persisted original, then verify |
| anything else | Preserve those unknown bytes, restore other safely recognized instrumented files, keep journal, return recovery-required |

Manifest states have exits: prepared/all-original clears; arming waits for identity or arm deadline; armed/instrumented/running first settle the tree then apply the digest matrix; restoring re-enters the same idempotent matrix; complete deletes the journal. Delete the journal only after every target verifies original and no recorded process tree survives. A stale PID lock can be reclaimed, but the manifest—not memory—is authoritative.

The test shell remains in the supervisor's detached process tree. Count hit-file markers and restore only after code exit or verified tree termination. If termination cannot be verified, keep the journal, return recovery-required, and never report counts or zero. Command failure with a settled tree still restores and reports its nonzero status plus counts. The command and marker templates are project-controlled execution with the worker's existing Bash authority; literal `confirmProjectExecution: true` is the command-level consent gate.

### 7. Drive worker Git guard

Session assembly includes a focused inline extension only for sub-agent runtime context with `parentRole: "driver"`. Its Pi `tool_call` handler examines executable shell command positions and blocks Git worktree/index mutation families including `checkout`, `switch`, `restore`, `reset`, `stash`, `clean`, `rm`, `read-tree`, `checkout-index`, `update-index`, reverse apply, and equivalent chained invocations. It recognizes shell separators and common `env`/`command`/`git -C` prefixes without treating quoted prose such as `echo 'git reset'` as execution.

Refusal says earlier-attempt work may be uncommitted and directs the worker to inspect with read-only Git, edit intended files directly, or stop for coordinator recovery. Read-only calls and existing add/commit policy are unchanged. External CLI agents get prompt guidance but no false claim of Pi enforcement.

### 8. Driver boundary hygiene

`reportSummary` classifies a candidate as usable, absent, or unsafe. JSON fences, complete brace-delimited JSON, and report outcome markers are unsafe. Legacy inferred-success reports and graph `StepResult` summaries preserve unsafe/absent as the already-recognized generic `Drive task completed.` so `commitSubject` falls back to the task title; safe prose remains usable.

Preflight and postflight shells receive a copied environment with all `COSMONAUTS_DRIVER_*` keys removed. Backend creation reads the parent environment first and backend processes retain their existing configuration path.

The orchestration extension defines one backend/mode guidance string reused by schema and explicit/defaulted-mode errors. Validation precedes backend construction. Successful visible text includes literal `workdir:` and `eventLogPath:` fields plus unchanged structured details.

## Files to Change

- `lib/tasks/task-types.ts` — make replace and append note inputs mutually exclusive.
- `lib/tasks/lock.ts` — define the always-on task-ID mutation lock path and bounded acquisition.
- `lib/tasks/task-note-editor.ts` — new raw-source note-section extraction/transplant/append module.
- `lib/tasks/task-manager.ts` — serialize every update under the mutation lock and use source-preserving append.
- `domains/shared/extensions/tasks/index.ts` — expose append mode and normalize/reject tool-supplied titles.
- `lib/driver/types.ts` — add blocked parsed reports and the retry event.
- `lib/driver/report-parser.ts` — parse blocked JSON/line reports and retain raw output.
- `lib/driver/runtime-helpers.ts` — format Drive notes, carry attempts, preserve retry evidence, scrub project-command environments, and classify report summaries.
- `lib/driver/run-one-task.ts` — implement unknown-before-inference and early blocked behavior in the legacy path.
- `lib/driver/drive-scheduler-backend.ts` — implement matching graph behavior and persist schema-tagged local attempt metadata.
- `lib/driver/drive-finalization.ts` — append structured notes and enforce safe title fallback.
- `lib/driver/durable-events.ts` — normalize retry as explicit activity and keep the event map exhaustive.
- `lib/driver/durable-steps.ts` — project blocked reports and local retry metadata into existing step results.
- `lib/driver/event-stream.ts` — bridge retry events to live subscribers while preserving JSONL.
- `lib/driver/shell-command-finalizer.ts` — consume persisted local attempt metadata with diagnosed legacy compatibility.
- `lib/driver/prompt-template.ts` — align report vocabulary and all-backend completion instructions.
- `lib/driver/README.md` — document blocked parsing, retry visibility, and compatibility behavior.
- `bundled/coding/agents/worker.ts` — enable the execution-probe capability and extension only for coding workers.
- `bundled/coding/prompts/worker.md` — require append notes, aligned outcomes, safe Git, and valid probe evidence.
- `domains/shared/capabilities/execution-probe.md` — new always-on worker contract for the native probe tool.
- `domains/shared/extensions/execution-probe/index.ts` — new locked/journaled probe implementation with gated process supervision.
- `domains/shared/extensions/project-tools/process-runner.ts` — expose platform-specific settlement for a persisted supervised process tree.
- `lib/analysis/types.ts` — add normalized metric values and a discriminated provider-constraint unsupported target.
- `domains/shared/extensions/project-tools/analysis-provider-error.ts` — cap model-facing typed provider-error messages while retaining structured evidence.
- `domains/shared/extensions/project-tools/fallow-provider.ts` — filter scoped complexity/duplication, promote metrics, and classify export surfaces.
- `domains/shared/extensions/project-tools/index.ts` — render every analysis response boundedly and call provider classification before execution.
- `lib/agents/session-assembly.ts` — compose the Drive-only Pi guard from runtime context.
- `lib/agents/drive-worker-tool-guard.ts` — new Bash Git classifier and blocking `tool_call` extension.
- `domains/shared/extensions/orchestration/driver-tool.ts` — align mode validation and expose workdir/event log in text.
- `domains/shared/skills/analysis/SKILL.md` — document residue, bounded details, and export-only trace.
- `domains/shared/skills/drive/SKILL.md` — require duplication residue and preserve worker-stop/retry protocol.
- `docs/analysis-capabilities.md` — document scopes, all-response text cap, details, and trace limit.
- `docs/analysis-provider-validation.md` — record metric neutrality and adapter limitations.
- `docs/fallow.md` — document adapter filtering and export classification.
- `docs/orchestration.md` — align report, retry, result text, environment, and mode behavior.

## Risks

- **Raw note fidelity:** any parsed-string append, full-body rewrite without raw-section transplant, ambiguous duplicate note section, or unlocked update violates ratified INV-001. Abort on a raw byte-prefix mismatch or concurrent lost append; do not narrow the invariant (review-1.md PR-001, PR-002).
- **Graph/legacy/compatibility drift:** blocked reports and retry events have legacy, durable, bridge, and finalizer consumers. Each affected slice exercises all owned consumers. Abort if parity would require scheduler attempt/lease/cancellation changes; revise only Driver compatibility seams (review-1.md PR-006).
- **Unknown inference:** postflight may infer success, but raw unknown output must already be durable. Abort inference if append fails; never synthesize away the record (review-1.md PR-007).
- **Scoped verdict mismatch:** provider exit describes full inventory while paths scope describes a subset. Reconcile full integrity first, then scoped verdict. Abort if native evidence cannot be validated; never label an unknown run clean.
- **Bounded text versus complete display:** unbounded finding/trace/fix inventories and provider errors cannot all fit. The ratified Ranking makes the cap authoritative; text states omissions/truncation and completed-result details retain all data (review-1.md PR-003).
- **Export false certainty:** only AST-confirmed non-exports return unsupported; indeterminate source proceeds to provider. Pivot narrower rather than misclassify.
- **Probe interruption/concurrency:** one project lock, verified backups, pre-write durable planned state, pre-write process identity, a no-exec gate, regular contained paths, quiescent process tree, and the digest matrix are mandatory. On corrupt backup, unknown digest, or unverified termination, preserve evidence and return recovery-required; never guess, race restoration, or report zero (review-1.md PR-004, PR-005).
- **Probe instrumentation trust:** caller templates and test commands execute project-controlled code. Require explicit confirmation, successful command for zero-hit claims, and worker-only extension loading. Do not expose the mutating tool to read-only roles.
- **Git guard coverage:** shell syntax is broad and external CLI workers lack Pi events. Test executable positions, quoting, chaining/prefix forms, scope enforcement to Drive Pi sessions, and keep prompt guidance elsewhere. If pinned Pi cannot block, stop and record the fallback before implementation.
- **Commit fallback provenance:** legacy and graph inference must both preserve an unsafe-summary signal through finalization. Abort if a generic synthetic sentence can become a commit subject instead of task-title fallback.
- **Live acceptance lifecycle:** if the run starts but fails, abort/settle it before cleanup, retain run artifacts, append observed evidence/failure to the owning task, then remove only the throwaway task and external sentinel. Backend unavailability is a human stop, never a mock substitution.
- **Static/structural evidence:** type/lint correctness and no new structural findings are work expectations carried by B-012, but planning analysis was unbound. Treat sign-off findings as evidence and pivot the owning slice; never clear them through floors, suppressions, or configuration.
- **Scope creep:** no `lib/durable-runtime/`, `drive-envelope`, execution-liveness, suppression, threshold, baseline, ignore, or config work belongs here. Apply deviation protocol rather than absorb it.

## Implementation Order

The eleven numbered stages are candidate tasks, each one Drive slice and dependent on prior stages. Their abstract quality contract is inherited from B-012 and owning Risks: behavior evidence, static correctness, structural conformance, integration evidence, and change integrity; sign-off resolves actual checks. Each Drive behavior slice appends its focused pre-change failure and post-change pass to its own task notes. Test files are selected by the worker after inspecting existing coverage, not prescribed here.

1. **Source-preserving task mutation and task-edit hygiene — B-003 (AC-006, AC-013).** Add the unconditional task-ID lock, raw note-section append, exclusive input type, task-edit append mode, title normalization, and canonical rename. Prove raw CRLF/spaces/blank bytes, empty-note-section append, no-note insertion, duplicate-section refusal, replace compatibility, simultaneous appends from separate processes/manager instances, normalized-empty no-op, and one canonical path.

2. **Structured Drive records on existing outcomes — B-001, B-002 (AC-001, AC-004).** Add Drive heading formatting and attempt identity. Convert graph/legacy/finalization writes to append; persist every unknown before inference; append failure/partial/spawn failure on contradicted attempt 1 while suppressing only status. Prove prior raw bytes, inferred-unknown success, final unknown failure, attempt 1 then attempt 2 ordering, and finalization failure.

3. **Blocked report vertical slice and durable projection — B-001 (AC-002, AC-003).** Add blocked parse/raw contract, prompt meaning, early graph/legacy branches, verbatim task/event reason, and blocked durable projection. Prove both report forms, no postflight/commit/acceptance inference/retry, matching legacy and normalized terminal evidence, and unchanged partial-mode scheduling.

4. **Explicit retry event and compatibility visibility — B-002 (AC-005).** Add the event at the existing contradiction loop, exhaustive durable activity normalization, live bridge inclusion, JSONL ordering, schema-tagged local attempt artifacts, and finalizer consumption. Prove attempt 1 note precedes retry, retry precedes second spawn, no retry without re-spawn, current-schema missing-number failure, diagnosed legacy fallback, and no scheduler source change.

5. **All-backend completion protocol — B-004 (AC-007).** Render criterion-marking instructions for all backend names with their available mechanism and retain unchecked-success blocking. Review worker prose for aligned blocked, partial, append, and Git semantics.

6. **Scoped complexity and duplication residue — B-005, B-007 (AC-008, AC-011).** Advertise/filter complexity and duplication paths after one full Fallow run, recompute scoped verdicts, retain native payload, and require scoped clone verdict evidence. Prove exact file, directory descendant, nonmatch, locationless, one-owned-side clone, separator/dot normalization, and full project cases.

7. **Bounded presentation for every analysis response — B-005 (AC-009, INV-005).** Promote metric values and implement the shared 32 KiB renderer for findings, trace, fix preview, status, non-ready outcomes, and typed provider errors. Prove required finding columns, variant rows, no native text, full completed-result details, oversized single rows/errors, UTF-8 safety, and deterministic omissions within cap.

8. **Export-only trace classification — B-006 (AC-010).** Add the discriminated provider-constraint variant and pre-execution classifier contract. Prove direct/aliased/default/CommonJS exports proceed, confirmed JS/TS internals return unsupported without provider spawn, and re-export/unreadable/unsupported-language/indeterminate source is not mislabeled.

9. **Locked recoverable execution probe — B-008 (AC-012).** Ship the worker-only capability/extension; implement templates, same-file batching, containment, project lock, verified planned manifest, gated supervisor identity, multi-file writes, settled execution, counts, restoration, and recovery. Prove crashes before identity, before/between writes, before/after gate, during command termination, and during each restore; command pass/fail/timeout/abort; surviving-descendant refusal; simultaneous calls; symlink/escape/nonregular/dirty/exact-duplicate refusal; multiple lines in one file; corrupt backup; original/instrumented/conflict recovery cells; and no zero from unsafe or failed commands.

10. **Drive Pi worker Git guard — B-009 (AC-014).** Compose runtime-scoped blocking and refusal text. Prove Drive versus non-Drive sessions, executable positions versus quoted prose, separators/prefixes/`git -C`, destructive families, read-only commands, and unchanged add/commit policy. Do not alter external CLI or global Bash.

11. **Driver boundary hygiene — B-010, B-011 (AC-015, AC-016, AC-017, AC-018).** Preserve unsafe-summary fallback through legacy and graph inference, scrub Driver variables only from project pre/postflight environments, print workdir/event path, and unify explicit/default mode errors. Prove safe prose remains, every forbidden subject form uses task title, backend creation retains parent variables, project children see none, and mode wording is identical.

After stage 11, the coordinator performs final acceptance for **B-012 (AC-019, AC-020)**; it is not an implementation task:

- Audit all task notes for red/green evidence and the change set for prohibited configuration/suppression or unrelated expectation edits.
- Create an unlabelled throwaway task with raw sentinel notes. Its first attempt appends a worker record and reports failure naming a known existing path as absent; after the contradiction note, attempt 2 appends another record and reports blocked with a fixed reason.
- Launch only that task through real inline `cosmonauts-subagent` with no commit. Use an explicitly consented external postflight sentinel that appends once per execution.
- Accept only if task notes preserve the sentinel bytes and show Drive attempt 1 followed by Drive attempt 2; events show attempt 1's block evidence, then `task_retry`, then the second `spawn_started`, exactly one postflight set before retry, none after blocked completion, no third spawn, and the verbatim final block reason; durable and legacy run records agree on blocked.
- In `finally`, settle any started run, retain its run directory, append run ID/artifact paths/event subsequence or failure evidence to the final implementation task, then remove the throwaway task and external sentinel. If live access is unavailable or behavior is nondeterministic, stop for human disposition rather than substitute a mock.
