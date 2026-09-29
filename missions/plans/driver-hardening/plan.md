---
title: Fix the Drive Defects the Health Audit Exposed
status: active
createdAt: '2026-09-29T13:31:06.260Z'
updatedAt: '2026-09-29T17:25:00.000Z'
---

## Overview

Harden the existing Drive execution path and its adjacent task, analysis, and worker surfaces using `missions/reviews/improvements/project-health-audit.md` as the evidence base. The implementation is behavior-first and keeps the graph-backed Drive path and the legacy single-task path in parity without changing scheduler attempt, lease, or cancellation semantics. The blocked-report path is delivered first so every later slice can record failures and blockers without destroying worker notes.

This plan covers all eight audit rows and ranked follow-ups 1–7. It introduces no work from `drive-envelope`, `execution-liveness`, or the excluded observation 4. The spec at `missions/plans/driver-hardening/spec.md` owns the Intent (INV-001..006 and the Ranking), the acceptance criteria AC-001..AC-020, the Scope with its non-goals, and the three human rulings Q-001..Q-003; this plan cites them by ID and does not restate them.

*(Revised 2026-09-29 after review: chain rounds `review-1.md`, `review-2.md`, `review-3.md` and the coordinator's independent four-lens adversarially verified review. Every change is a dated Decision Log entry D-017 through D-030 or an amendment noted in place. Rounds 2 and 3 were written after the planner's last edit and were unaddressed until this revision.)*

## Architecture Context

- `docs/orchestration.md` and `lib/driver/README.md` make the graph-backed path through `lib/driver/drive-scheduler-backend.ts` the shipped Drive path (inline `run_driver` runs it through `lib/driver/drive-graph-runner.ts`). `lib/driver/run-one-task.ts` retains equivalent legacy behavior and must stay in parity. `lib/driver/durable-events.ts`, `lib/driver/durable-steps.ts`, `lib/driver/event-stream.ts`, and `lib/driver/shell-command-finalizer.ts` are compatibility consumers of report and event contracts; they change with those contracts without moving scheduler ownership.
- The scheduler attempt/lease/cancellation state in `lib/durable-runtime/` is outside this plan. A task step continues to return the existing durable `StepResult`; blocked-report handling terminates the worker attempt before postflight and hands that result to the existing graph. The in-run contradicted-path retry stays a local loop inside one scheduler step; its evidence is projected as nonterminal activity so the first-terminal rule the active `execution-liveness` plan delivers (its decision entry 036) is never violated (D-021).
- Task files remain owned by `TaskManager`. Driver code depends on the generic task update contract; task code does not import Driver concepts. Raw note preservation on every update and a per-task mutation lock belong in the task module, while Drive-specific headings belong in Driver runtime helpers. The active `execution-liveness` plan (its decision entry 038) will absorb this lock into `TaskManager.withTaskMutation()`; this plan builds the lock as a plain `withEntityFileLock` around the update and records the hand-off (D-026). This plan does not edit that plan's artifacts.
- `missions/architecture/tool-ecosystem.md`, `docs/analysis-capabilities.md`, and `docs/fallow.md` keep provider-neutral contracts in `lib/analysis/`, provider behavior in the Fallow adapter, and Pi presentation in extensions. The execution probe is a worker-only extension under the coding domain (`bundled/coding/extensions/execution-probe/`), loaded only through the coding worker definition; the package manifest's auto-loaded directory is `domains/shared/extensions`, so a plain Pi session with cosmonauts installed never sees it (D-025). It reuses the existing provider process runner for the test command.
- `lib/orchestration/definition-resolution.ts` resolves the `coding` tool set to Pi's built-in tool names only; nothing wraps Bash. The pinned Pi API exposes a blocking `tool_call` event, and session assembly receives sub-agent runtime context (`parentRole`, set to `driver` by the `cosmonauts-subagent` backend). The Git guard is an inline `tool_call` extension added to the session's extension factories only when `parentRole === "driver"`; tool resolution and external sessions are unchanged (D-011 as amended, D-020).
- Planning-time structural evidence is unavailable: complexity, duplication, boundary-conformance, and trace were all unbound with reason `execution-not-consented`. This is absence of evidence, not a clean baseline; implementation must rely on behavior-first evidence and sign-off's configured checks rather than assume the touched units are structurally clean.

## Decision Log

- **D-001 - Ratified intent and ranking govern implementation**
  - Decision: preserve INV-001..INV-006 and their Ranking paragraph exactly; mechanism, throughput, and output completeness yield in the stated order.
  - Alternatives: reinterpret the audit rows during planning; optimize retry throughput over note preservation.
  - Why: Q-001 explicitly ratified this ground.
  - Decided by: human, 2026-09-29 (spec Q-001)

- **D-002 - The probe edits the live file temporarily**
  - Decision: instrument target files in the worker's current project and restore them to digest-verified byte identity; refuse to run on a dirty file.
  - Alternatives: probe a HEAD worktree copy; leave probing manual.
  - Why: Q-002 (a) ratified live-session temporary edits, dirty-file refusal, and digest-verified restoration.
  - Decided by: human, 2026-09-29 (spec Q-002 (a))
  - *(Note 2026-09-29 after review: the ruling does not define "dirty". Whether it means git-dirty or changed-during-the-probe is H-001 (D-019); ruled (a) by the human on 2026-09-29, rulings round 2.)*

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

- **D-005 - Task notes use source-preserving editing under a per-task lock**
  - Decision: every `TaskManager.updateTask` acquires a cross-process lock keyed by task ID before lookup, parse, rename, write, and release. The raw `Implementation Notes` section of the original source is transplanted byte for byte into the re-serialized document on every update that does not explicitly replace notes (status, title, criteria, labels, and append-mode updates alike); append mode adds a level-three Drive heading and text after the transplanted bytes.
  - Alternatives: parsed read/serialize append; Driver-side read/concatenate/write; rely on the conditional episode-capture lock; preserve raw bytes only in append mode.
  - Why: parser normalization and the optional episode lock cannot satisfy INV-001 or concurrent append safety (review-1.md PR-001, PR-002).
  - Decided by: planner-proposed
  - *(Amended 2026-09-29 after review, review-2.md PR-011 / review-3.md PR-015: preservation applies to every non-replacing update, not only append mode; see D-018. The lock's hand-off to `execution-liveness` decision 038 is D-026.)*

- **D-006 - Retry status suppression never suppresses attempt evidence**
  - Decision: the contradicted-path loop passes a one-based attempt number and distinguishes `skipStatusTransition` from note persistence. Attempt 1 appends its structured Drive record, then emits `task_retry` with trigger, path, and attempt 2 immediately before the second spawn.
  - Alternatives: infer retries by counting spawns; keep `skipTaskUpdate`; add scheduler attempts or leases.
  - Why: every attempt record must survive and every re-spawn must be explicit without entering the execution-liveness seam (review-1.md PR-008).
  - Decided by: planner-proposed
  - *(Amended 2026-09-29 after review, review-3.md PR-020/PR-021: the attempt number is held in memory for the step and is not persisted in a schema-tagged artifact; retry-candidate evidence is projected as nonterminal; a finalizer that cannot know the local attempt writes `attempt unknown`, never `1`. See D-021.)*

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
  - *(Amended 2026-09-29 after review: the text carries a fixed, never-truncated header before the rows; the pinned text-equals-details tests change under AC-009; see D-024.)*

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

- **D-011 - Drive Git safety is a session-scoped Pi guard plus a backend-independent snapshot**
  - Decision: session assembly loads a blocking `tool_call` guard only for Pi sub-agents whose runtime parent is `driver`. It blocks destructive Git worktree/index verbs in Bash while leaving read-only Git and the existing add/commit policy unchanged. The same classifier is applied to the execution probe's test command. For every backend, Drive records a recoverable snapshot of the dirty worktree before each spawn (D-020), so a worker on `codex` or `claude-cli` cannot cause loss either.
  - Alternatives: modify global Bash; rely only on prose; change repository permissions; give external backends prose only.
  - Why: this is the narrow enforceable seam named by AC-014, and the snapshot satisfies INV-006 for every backend instead of narrowing it.
  - Decided by: planner-proposed
  - *(Amended 2026-09-29 after review, coordinator channel finding 7 (confirmed high) and review-3.md PR-019: the original text gave external backends prompt guidance only, which narrowed ratified INV-006 under a planner decision; D-020 restores full coverage. The probe's test command now passes through the same classifier.)*

- **D-012 - Delivery uses twelve dependency-ordered slices**
  - Decision: complete note preservation, blocked handling, and retry visibility in slices 1–4 before the remaining slices depend on Drive's own failure evidence. Each slice records red evidence per behavior before implementation. All slices run through Drive on the `cosmonauts-subagent` inline backend (D-028).
  - Alternatives: parallelize immediately; combine all changes into one run; run slices 1–4 by hand.
  - Why: later failure evidence is trustworthy only after the must-have path preserves it.
  - Decided by: planner-proposed
  - *(Amended 2026-09-29 after review: eleven slices became twelve when the worker-prompt contract and final acceptance got an owning slice (D-027); how slices 1–4 survive the unfixed Drive is D-028.)*

- **D-013 - Probe recovery is journaled and digest-verified** *(superseded in part by D-019, 2026-09-29)*
  - Decision: a project-wide probe lock covers validation through restoration. A durable manifest records every original digest before any source write. Recovery restores only known instrumented bytes from a digest-verified backup and treats every other digest as a conflict.
  - Alternatives: in-memory backups; per-file locks.
  - Why: this closes multi-file crash windows and prevents overlapping probes (review-1.md PR-004, PR-005).
  - Decided by: planner-proposed
  - *(Superseded 2026-09-29 by D-019 for everything about a detached supervisor, a `go` gate, arm deadlines, persisted PID/process-group identity, process-tree settlement before restore, and a five-state manifest machine. Reviews review-2.md PR-012 and review-3.md PR-016/PR-017 showed that numeric process identity is not durable and that a scoped lock cannot own an unsettled tree; the coordinator channel (findings 2, 8, 13, 18, 19, 22) showed the mechanism was too large for one slice and still could not meet AC-012's letter. The journal, the sidecars, and the digest matrix stand.)*

- **D-014 - Unknown raw output is persisted before inference**
  - Decision: both Drive paths append an `unknown` attempt record immediately after parsing and before postflight. Later success inference or failure transition does not replace or duplicate that record.
  - Alternatives: append only when unknown remains failure; copy raw text into synthetic success notes.
  - Why: AC-004 is unconditional and the current success-inference branch otherwise discards the raw report (review-1.md PR-007).
  - Decided by: planner-proposed

- **D-015 - Compatibility consumers and quality ownership are explicit**
  - Decision: update all Driver event/report/finalizer consumers named in Architecture Context. Quality expectations specific to this work are carried by B-012, the owning Risks, and per-slice evidence; the plan declares no gate table, per the work-artifacts rule that gates are resolved at sign-off. Test files remain worker-chosen and are intentionally omitted from Files to Change under the canonical plan format.
  - Alternatives: let exhaustive consumers fail during implementation; declare a standalone gate list; preselect test files before workers inspect coverage.
  - Why: this resolves review-1.md PR-006 and PR-010 without crossing into `lib/durable-runtime/` or violating plan artifact rules.
  - Decided by: planner-proposed

- **D-016 - Closing consistency pass keeps mechanisms aligned with invariants**
  - Decision: same-file probe locations are batched with unique markers, backup bytes are verified before restore, and provider errors share the text bound. No behavior, risk, or implementation stage now depends on a weaker mechanism than its governing invariant.
  - Alternatives: leave those details to implementers; rely on successful-path evidence only.
  - Why: it resolves cross-section discrepancies between D-008/D-013 and B-005/B-008 before handoff.
  - Decided by: planner-proposed
  - *(Amended 2026-09-29 after review: the "explicit local-attempt schema" clause is withdrawn by D-021.)*

- **D-017 - The plan cites the spec instead of copying it** *(Added 2026-09-29 after review)*
  - Decision: the verbatim copies of the spec's `## Intent`, `## Scope`, `## Assumptions`, and `## Open Questions` are removed from this plan; the Overview cites them by ID. Citations to the previous plan's decisions (`project-health-audit` decisions 019, 021, 023, and 031) live only in the spec.
  - Alternatives: keep the copies as convenience.
  - Why: the plan format says plans cite `INV-###` and do not restate intent; the copies created a second copy of ratified text, four dangling decision citations (artifact check), and two sentences that only make sense in the spec (coordinator channel finding 12, confirmed).
  - Decided by: coordinator, amend-on-record, 2026-09-29
  - Supersedes: plan.md lines 14–142 of the chain revision.

- **D-018 - Raw note bytes survive every non-replacing task update** *(Added 2026-09-29 after review)*
  - Decision: `TaskManager.updateTask` transplants the original raw `## Implementation Notes` section (heading, line endings, trailing spaces, boundary blank lines) into the re-serialized document on every update that does not supply `implementationNotes` in replace mode. This covers Drive's success transition to Done, `task_edit` criterion checks and title edits, and CLI edits. Replace mode alone re-serializes the notes.
  - Alternatives: preserve raw bytes only in append mode (chain revision); amend INV-001 to "semantic content" preservation (would be human ground).
  - Why: INV-001 covers every Drive outcome, and today every update parses (CRLF to LF, trimmed sections) and re-serializes, so a status-only update rewrites worker bytes (review-2.md PR-011, review-3.md PR-015, both high). A mechanism that preserves the bytes on every path satisfies the invariant without touching it.
  - Decided by: coordinator, amend-on-record, 2026-09-29
  - Supersedes: D-005's "for append mode" scope and Design §1's "Replace mode keeps canonical serialization" as the only other case.

- **D-019 - The execution probe is a locked, journaled, always-restoring tool with no process-identity machinery** *(Added 2026-09-29 after review; H-001 ruled (a),(a) by the human on 2026-09-29)*
  - Decision: one `execution_probe` call, under one project-wide `withEntityFileLock` held for the call only: validate; write digest-verified sidecars and a manifest before any source write; instrument; run the test command through the existing provider process runner with a timeout; count markers; restore every instrumented file from its sidecar and verify the digest in a `finally` that runs on success, failure, timeout, and abort; compare `git status --porcelain` before and after and report every other changed path as a side effect. A zero hit count is evidence only when the command exited 0, every restore verified, and there were no side effects. If a restore cannot be verified (corrupt sidecar, digest mismatch), the journal stays and the result is `recovery-required` naming the journal. A later probe call first recovers any outstanding journal (restore from verified sidecars) or refuses with `recovery-required`. Drive's preflight and postflight refuse to proceed, and Drive never commits, while a probe journal for the project is outstanding (the task is blocked with a `recovery-required` reason). The test command is classified by the same destructive-Git classifier as the Bash guard and refused on a match. No persisted PID or process-group identity, no detached supervisor, no arm gate: if the tool host dies mid-command, the journal is recovered by the next probe call or blocks Drive, and a stray test process cannot alter source.
  - Alternatives: the D-013 supervisor design (cannot make numeric process identity durable; too large for one slice); a filesystem sandbox for the test command (no portable primitive); dropping the helper (Q-002 rejected (c)).
  - Why: AC-012 and Q-002 (a) ask for hit counts, digest-verified restoration, and dirty-file refusal; every reviewed hazard (instrumented source reaching a Drive commit, coordinator channel 13; unsettled trees, review-3.md PR-017; command-side mutation, PR-018; guard bypass through the test command, PR-019) is closed by always restoring, blocking Drive on an outstanding journal, and reporting side effects, without process identity.
  - Decided by: coordinator, amend-on-record, 2026-09-29; H-001 clauses by the human (above)
  - Supersedes: D-013's supervisor, gate, identity, settlement, and manifest-state clauses; Design §6 of the chain revision.
  - Decided by (H-001 clauses): human, 2026-09-29 (rulings round 2): (i) **(a)** AC-012 amended on record; (ii) **(a)** dirty = changed between validation and instrumentation, or an outstanding journal. The drafted item is kept below as the record of the options.
  - **H-001 (ruled; kept as record).** Two clauses of ratified ground collide with this mechanism and only the human can settle them. (i) AC-012's letter promises "the source tree byte-identical to its start even when the command fails"; a target-file journal can prove that for the instrumented files and can *detect* but not undo mutations an arbitrary test command makes elsewhere (review-3.md PR-018; coordinator finding 18). Options: (a) amend AC-012 on record to "every instrumented file is restored to its original digest; any other tracked-file change the command makes is reported as a side effect and invalidates the hit evidence" (recommended); (b) keep the letter, which requires a filesystem sandbox this plan cannot build, so drop the helper and keep the project-health-audit decision-031 procedure manual. (ii) Q-002 (a) says the helper "refuses a dirty file" without defining dirty. Read as git-dirty, it refuses exactly the uncommitted refactor Q-002 rejected option (b) for not covering (coordinator finding 19). Options: (a) dirty means the target's bytes changed between the digest taken at validation and the instrumentation write, or an outstanding journal exists for the project; git-dirty files are probeable (recommended); (b) dirty means git-dirty. Both were ruled (a) on 2026-09-29; stage 9 is unblocked.

- **D-020 - Drive snapshots the dirty worktree before every spawn** *(Added 2026-09-29 after review)*
  - Decision: before each worker spawn (attempt 1 and any retry), when `git status --porcelain` is non-empty, Drive writes a snapshot commit object of the tracked and untracked worktree state (the `git stash create` object, never applied) and stores its SHA under a run-scoped ref `refs/cosmonauts/drive/<runId>/<taskId>/attempt-<n>`; the ref is recorded in the attempt's Drive note and in a `worktree_snapshot` field on the next `spawn_started` event. Refs are deleted by the run's terminal cleanup only when the task ended Done; blocked, partial, and aborted runs keep them. The Pi guard (D-011) remains defense in depth for in-process workers.
  - Alternatives: prompt guidance only for external backends (narrows INV-006); a WIP commit on the branch (pollutes history and collides with `driver-commits`); per-harness deny rules for `codex` and `claude-cli` (three implementations, each unverifiable here).
  - Why: INV-006's Ranking prefers a guard to a prompt rule, and INV-006 has no backend qualifier; a snapshot the worker cannot reach makes the previous attempt's work unlosable on every backend with one mechanism in `lib/driver/`.
  - Decided by: coordinator, amend-on-record, 2026-09-29; reviewed by the human 2026-09-29 (stands, not vetoed)
  - Supersedes: D-011's "External CLI backends retain prompt guidance because they do not emit Pi events."

- **D-021 - Retry evidence is nonterminal, and the local attempt is never fabricated** *(Added 2026-09-29 after review)*
  - Decision: a `task_blocked` or `spawn_failed` event carrying `contradicted` (a retry candidate) normalizes to durable *activity*, not `step_blocked`/`step_failed`, and the projector does not write a terminal step for it; `task_retry` follows as activity; the second `spawn_started` continues the same running step. The attempt number lives in memory for the duration of the scheduler step; no task-output artifact is extended with an attempt schema. A finalizer that runs after a resume and cannot know the local attempt writes the Drive heading with `attempt unknown` and a diagnostic, never `attempt 1`.
  - Alternatives: keep terminal projection and rely on the second spawn reopening the step (violates first-terminal, review-3.md PR-020); persist `{ driverAttemptSchema, attemptNumber }` on artifacts with a fallback of 1 (fabricates, PR-021; edges into the attempt concept the spec reserves, coordinator finding 11).
  - Why: INV-003 wants the retry explicit; the active `execution-liveness` plan (its decision entry 036) will reject terminal-to-running transitions; a fabricated attempt number is a false record under INV-001.
  - Decided by: coordinator, amend-on-record, 2026-09-29
  - Supersedes: D-006's terminal-event clause; Design §3's schema-tagged artifact and finalizer consumption; D-016's "explicit local-attempt schema".

- **D-022 - One writer per Drive note, and appends are idempotent** *(Added 2026-09-29 after review)*
  - Decision: the task step (legacy attempt or graph attempt) is the sole writer of the per-attempt Drive record; the graph task-status finalizer changes status only and writes no note; commit-finalization-failure notes are written once per failure reason, and the append helper skips a heading-plus-body block that is already present byte for byte. `partialMode: continue` therefore produces one record per attempt with no `partial: partial:` prefix.
  - Alternatives: let both the step and the finalizer write (duplicates on the graph path today, coordinator findings 14 and 21, both confirmed medium); make finalizers the only writer (they lack the attempt number).
  - Why: INV-001's append heading must be a record, not noise; finalizers retry without limit.
  - Decided by: coordinator, amend-on-record, 2026-09-29
  - Supersedes: Design §1 "Every Driver note write, including retry candidates and finalization failures, uses source-preserving append" as a statement about writers.

- **D-023 - A blocked report under `backend-commits` records unverified commits** *(Added 2026-09-29 after review)*
  - Decision: Drive records HEAD before every spawn. On a `blocked` report, if HEAD moved, the Drive note and the `task_blocked` event carry `unverifiedCommits: <before>..<after>`; under `driver-commits` and `no-commit` the note lists the dirty paths. The rendered prompt tells `backend-commits` workers not to commit before a `blocked` stop.
  - Alternatives: run postflight anyway on blocked (violates INV-002); ignore the moved HEAD (silent).
  - Why: INV-002 forbids postflight on blocked, so the only honest handling of a worker commit is to name it as unverified (coordinator finding 17, partial).
  - Decided by: coordinator, amend-on-record, 2026-09-29

- **D-024 - Bounded text has a fixed header, and pinned text-equals-details tests change under AC-009** *(Added 2026-09-29 after review)*
  - Decision: every completed analysis result's text begins with a never-truncated header: capability, provider id and version, scope kind and paths, verdict (the recomputed scoped verdict for paths scope), coverage, and metric when present; then the rows, then the omission line. Existing tests that assert the model-visible text equals the JSON details change their expectation citing AC-009 and this decision.
  - Alternatives: rows only (the reader cannot tell what was run); keep the pinned equality (contradicts AC-009).
  - Why: AC-009 changes the text contract by design; AC-020 allows an expectation change that cites the criterion (coordinator finding 15, partial).
  - Decided by: coordinator, amend-on-record, 2026-09-29

- **D-025 - The probe extension lives in the coding domain, not the auto-loaded shared directory** *(Added 2026-09-29 after review)*
  - Decision: `bundled/coding/extensions/execution-probe/index.ts` with the capability at `bundled/coding/capabilities/execution-probe.md`; the coding worker lists the extension by name and domain-first resolution finds it. Nothing under `domains/shared/extensions/` changes for the probe.
  - Alternatives: `domains/shared/extensions/execution-probe/` (the package manifest auto-loads every subdirectory there, so any plain Pi session would get a source-mutating tool, coordinator finding 22, confirmed).
  - Why: "worker-only" must hold for package consumers too.
  - Decided by: coordinator, amend-on-record, 2026-09-29
  - Supersedes: Files to Change entries for `domains/shared/extensions/execution-probe/` and `domains/shared/capabilities/execution-probe.md`.

- **D-026 - Overlap with `execution-liveness` is recorded, not duplicated** *(Added 2026-09-29 after review)*
  - Decision: this plan adds a per-task `withEntityFileLock` around `updateTask` (D-005) and nothing about process identity (D-019 needs none). The `execution-liveness` plan's decision 038 (`withTaskMutation`) will absorb the lock and its decision-035 lock-generation work will supersede the lock file semantics; this plan records the change to `lib/tasks/task-manager.ts` and `lib/tasks/lock.ts` in its final report for that plan's re-validation and does not edit that plan's artifacts.
  - Alternatives: build the execution-liveness decision-038 shape now (pre-empts an active plan's design); skip the lock (loses concurrent append safety).
  - Why: INV-001 needs concurrent append safety today; the seam is derived ground and the spec's non-goal covers only `lib/durable-runtime/` (coordinator finding 1, partial).
  - Decided by: coordinator, amend-on-record, 2026-09-29

- **D-027 - Every behavior has one owning slice** *(Added 2026-09-29 after review)*
  - Decision: B-001 is narrowed to failure/partial/unknown/spawn-failure records (slice 2); the blocked branch is B-013 (slice 3); B-002 is the retry event alone (slice 4); B-005 is scope filtering (slice 6) and bounded presentation is B-014 (slice 7); the worker-prompt clauses of AC-002, AC-006, AC-012, and AC-014 are B-015 (slice 12); B-012 is owned by slice 12 as the coordinator-run acceptance whose evidence table lands in this plan. Red/green evidence is recorded per behavior, and every slice has a proof clause.
  - Alternatives: leave behaviors shared across slices (a coverage matrix cannot assign owners; coordinator findings 3, 4, 5, 9, 10).
  - Why: the task backlog needs exactly one owner per behavior, and AC-019 says "the plan records the failing run for each".
  - Decided by: coordinator, amend-on-record, 2026-09-29
  - *(Amended 2026-09-29 by D-031: B-012 is owned by slice 13, coordinator-run.)*

- **D-028 - Slices 1–4 run on the unfixed Drive with mitigations; the host restarts after slice 4** *(Added 2026-09-29 after review)*
  - Decision: every slice runs through `run_driver` on the `cosmonauts-subagent` inline backend from a print-mode cosmo session. Until slice 3 lands, each task carries the standing AC-marking note and the coordinator recovers worker notes from the worker transcript after any block. After slice 4's Drive commit, the coordinator starts a fresh cosmo session (inline runs load live source) and confirms no stale `bin/cosmonauts-drive-step` binary exists before slice 5. Slice 12's live acceptance is the first run that relies on the fixed path.
  - Alternatives: run slices 1–4 by hand (breaks "every slice is one Drive run"); trust the running host to pick up source changes (it does not).
  - Why: D-012 is otherwise ambiguous (coordinator finding 6, partial).
  - Decided by: coordinator, amend-on-record, 2026-09-29
  - *(Amended 2026-09-29 by D-031: the standing note holds until slice 5 is live; a second restart precedes slice 13.)*

- **D-029 - The CLI's `--append-notes` uses the same source-preserving editor** *(Added 2026-09-29 after review)*
  - Decision: `cli/tasks/commands/edit.ts` maps `--append-notes` to the append input instead of read-concatenate-replace, so external backends and humans get the same byte preservation.
  - Alternatives: leave the CLI path (silently re-serializes, coordinator finding 20).
  - Why: INV-001 does not depend on which surface wrote the note.
  - Decided by: coordinator, amend-on-record, 2026-09-29

- **D-030 - Red/green evidence is tabulated in the plan at closeout** *(Added 2026-09-29 after review)*
  - Decision: each slice's task notes carry, per behavior, the failing run (test name, commit, one-line failure) and the passing run; slice 12 copies those rows into a `## Evidence` table appended to this plan, so "the plan records the failing run for each" (AC-019) is literally true.
  - Alternatives: notes only (AC-019's letter unmet, coordinator finding 10).
  - Why: AC-019.
  - Decided by: coordinator, amend-on-record, 2026-09-29

- **D-031 - Coordinator-only work leaves worker acceptance criteria; slice 12 splits into a Drive slice and a coordinator closeout** *(Added 2026-09-29 after the task compliance review)*
  - Decision: slice 12 (TASK-801) keeps only the worker-run B-015 prose alignment. A thirteenth slice (TASK-802), owned by the coordinator and never dispatched through Drive, owns B-012: the second host restart, the `## Evidence` table (D-030), the AC-020 change-set audit, the live acceptance run, and the D-026 hand-off copy. The D-028 host-restart checkpoint after slice 4 is TASK-794's recorded precondition, not a TASK-793 criterion. Tasks 1-5 carry the standing AC-marking note in their Description until the all-backend completion protocol (slice 5) is live; tasks 5-12 carry the standing worker rule (append-mode notes, `outcome: blocked`) until the persona is aligned.
  - Alternatives: keep coordinator actions as worker criteria (Drive blocks a `success` report with unchecked criteria, so TASK-793 and TASK-801 could never complete honestly; compliance review findings 3, 11, 12, 13, all confirmed).
  - Why: INV-004 (a rule that governs completion reaches the worker in a form it can act on) and the single-Drive-run rule of D-028.
  - Decided by: coordinator, amend-on-record, 2026-09-29
  - Supersedes: D-027's "B-012 is owned by slice 12"; D-028's "until slice 3 lands" boundary (the note is needed until slice 5 is live) and its single restart (a second restart precedes the live acceptance); Implementation Order slice 12's coordinator paragraph.

- **D-032 - Thrown provider errors keep their message format; the fixed header belongs to returned results** *(Added 2026-09-29 by the implementing coordinator after TASK-796 attempt 1 stopped `blocked`)*
  - Decision: the D-024 header (capability, provider, scope, verdict, coverage, metric) applies to every text the analysis tools *return* (completed findings, trace, fix preview, status, non-ready resolutions). A thrown `AnalysisProviderError` keeps its existing message (`Analysis failed to run.` / `Capability:` / `Provider:` / `Failure class:` / `Process evidence:`) and receives only the 32,768-byte cap that D-008 asks for. B-014's "provider-error responses" clause means the cap, not the header. `tests/pi-contract/pi-behavior-contract.test.ts` `preserves serialized capability failure in Pi error content` is a Pi error-transport probe, not a defect pin, and does not change.
  - Alternatives: (a) authorize an AC-020 exception for that test (needs the human; rewrites a transport probe to carry a presentation change); (b) drop the cap on errors too (contradicts D-008).
  - Why: ratified AC-009 bounds the text of *findings results*; nothing ratified puts a header on a thrown error. AC-020 permits an expectation change only where a test pinned the defect being removed, and this test pins Pi's transport of the message, which is not a defect. Choosing the reading under which both ratified clauses hold is a derived decision; escalating would have asked the human to break one of them.
  - Decided by: coordinator, amend-on-record, 2026-09-29
  - Supersedes: the "provider-error" entry-point item of B-014 as far as it implied the header; D-008's "cap typed provider-error messages" stands unchanged.

- **D-033 - The worktree snapshot ref is carried inside the attempt's Drive record, never as a standalone note** *(Added 2026-09-29 by the implementing coordinator after slice 10 landed)*
  - Decision: `snapshotWorktree` returns the ref and Drive holds it in memory for the attempt; the ref is written into the task only as a line inside the attempt's `### Drive — outcome … — attempt … — run …` record when one is written (blocked, failure, partial, unknown, spawn failure), and into the `worktreeSnapshot` field of the next `spawn_started` event on every path. A `success` attempt leaves no note; its ref is in the event log and `cosmonauts run status`, and terminal cleanup deletes it when the task ends Done (D-020). The standalone `Drive worktree snapshot (attempt n): <ref>` append that slice 10 introduced is removed, and the tests that pinned it change citing this decision and INV-001.
  - Alternatives: keep the standalone paragraph (a Drive addition outside a heading naming Drive, outcome, and attempt; collides with INV-001's letter); write a Drive heading for `success` attempts too (adds a record the matrix in Design §2 says does not exist).
  - Why: INV-001 is ratified: "anything Drive adds to a task is appended under a heading that names Drive, the outcome, and the attempt." D-020 already places the ref "in the attempt's Drive note"; slice 10 implemented the placement outside it. Choosing the mechanism that satisfies the letter is derived ground. Owned by follow-up task TASK-803, which runs before slice 11 because both edit `lib/driver/runtime-helpers.ts`, `run-one-task.ts`, and `drive-scheduler-backend.ts`.
  - Decided by: coordinator, amend-on-record, 2026-09-29

- **D-034 - Snapshot refs are deleted only when the final tree provably contains the snapshotted bytes** *(Added 2026-09-29 by the implementing coordinator after codex review round 2, finding 2)*
  - Decision: terminal cleanup of a Done task deletes `refs/cosmonauts/drive/<runId>/<taskId>/attempt-<n>` only when every path in that snapshot's tree is byte-identical in the task's final tree (the Drive commit under `driver-commits`, HEAD under `backend-commits`, the worktree under `no-commit`). Otherwise the ref is kept and the run's terminal record names it as retained. Blocked, partial, and aborted tasks keep their refs as before.
  - Alternatives: keep D-020's "delete on Done" (an external worker can discard a prior attempt's work, report success, and Drive deletes the only durable copy, so the snapshot no longer satisfies INV-006); never delete refs (accumulates on every dirty Done task).
  - Why: INV-006 is ratified and the snapshot is its mechanism for backends without the Pi guard; a mechanism that deletes its own evidence on the worker's say-so is not a guard. D-020's cleanup clause is derived ground.
  - Decided by: coordinator, amend-on-record, 2026-09-29
  - Supersedes: D-020's "Refs are deleted by the run's terminal cleanup only when the task ended Done" as far as it made Done sufficient.

## Behaviors

### B-001 - Worker records survive failure, partial, unknown, and spawn-failure attempts

- Source: AC-001, AC-004
- Observer: a coordinator examining a Drive task file, its legacy and durable events, and its terminal run result
- Entry point: `run_driver` when a backend returns a `failure`, `partial`, or `unknown` report, or the spawn itself fails
- Outcome: every pre-existing byte of the worker's implementation notes is unchanged, including after Drive's own status transitions; Drive's reason is appended once under a heading naming Drive, the outcome, the attempt number, and the run ID; an `unknown` report's complete raw text is appended before any postflight-based success inference and is not duplicated when inference later succeeds or fails; a retry candidate's record is appended while its status stays In Progress; a graph run with `partialMode: continue` and a retried finalizer each produce exactly one record per attempt; a worker's title edit or criterion check does not alter note bytes either.

### B-002 - Every in-run retry is announced before the re-spawn

- Source: AC-005
- Observer: a reviewer reading `events.jsonl`, the normalized run activity, and the live event stream
- Entry point: a task whose first attempt is blocked or fails citing a project path Drive can see on disk
- Outcome: exactly one retry event names the trigger (contradicted path), the path, and the next attempt number, and precedes the second `spawn_started`; the first attempt's blocked or failed evidence is recorded as activity and never as a terminal step, so the durable record shows one running step across both attempts; a task that is not re-spawned emits no retry event.

### B-003 - Task edits preserve notes and canonicalize titles

- Source: AC-006, AC-013
- Observer: a worker using `task_edit` or the task CLI, and a coordinator opening the resulting task file
- Entry point: `task_edit` (or `cosmonauts task edit --append-notes`) with implementation notes in append mode, with only a status or criterion change, or with a quoted or irregular title
- Outcome: append mode preserves the exact pre-existing raw note bytes and adds the supplied text once, including under concurrent appends from separate processes; a status-only or criterion-only edit leaves the raw note section byte-identical; replace mode keeps its meaning and supplying both modes is rejected; a title loses surrounding quote pairs, trims and collapses whitespace, and yields one canonical task file path; a title that normalizes to empty is rejected without changing the task.

### B-004 - Every backend receives an actionable completion protocol

- Source: AC-007
- Observer: a Drive worker on any supported backend
- Entry point: the rendered prompt for a task with acceptance criteria
- Outcome: the worker sees how to mark every verified criterion before reporting, using `task_edit` in an in-process worker and the task CLI in an external worker; a success report with unchecked criteria remains blocked as today.

### B-005 - Analysis findings honor the requested scope

- Source: AC-008
- Observer: an agent calling `analysis_complexity` or `analysis_duplication`
- Entry point: a project-scope or `paths`-scope call
- Outcome: project scope returns the full inventory for the requested metric; `paths` scope returns only findings with a location equal to a requested path or below a requested directory, with the verdict recomputed for that subset and coverage preserved; locationless findings are excluded from a scoped result; the binding advertises the `paths` scope; the native provider payload is unchanged and available in details.

### B-006 - Trace limitations are explicit

- Source: AC-010
- Observer: an agent tracing a symbol with the Fallow-backed trace tool
- Entry point: `analysis_trace` with a symbol target and a project-relative source path
- Outcome: a symbol the adapter can confirm is not exported returns an unsupported-target result before any provider run, stating that the provider traces exports only and suggesting the file-target trace; exported, re-exported, unreadable, non-JS/TS, or indeterminate targets take the normal provider path; the analysis skill and documentation state the limit so plans do not generalize symbol tracing to non-exported functions.

### B-007 - Clone extraction verdicts report residue

- Source: AC-011
- Observer: a worker or reviewer assessing a clone-extraction slice
- Entry point: `analysis_duplication` with `paths` set to the files the slice owns
- Outcome: the result names every surviving clone group with an owned location, or states that none remain, in bounded quotable text; the Drive and analysis skills require that evidence in the verdict of clone-extraction work.

### B-008 - Execution probes produce hit evidence and always restore

- Source: AC-012
- Observer: a Drive worker deciding whether one or more source sites are unreached
- Entry point: the worker-only `execution_probe` tool with source locations, marker statement templates, a test command, and explicit project-execution confirmation
- Outcome: the tool runs the command once and reports a hit count per location and the command's exit status; multiple locations in one file are supported; every instrumented file is restored to its original digest whether the command passed, failed, timed out, or was aborted, and any other tracked path the command changed is listed as a side effect; a zero count is marked usable only when the command exited 0, every restore verified, and no side effects occurred; symlinked, escaped, non-regular, or duplicate locations are refused, as is a file whose bytes changed between validation and instrumentation or a project with an outstanding probe journal (dirty per the human ruling H-001 (ii)(a)); a restore that cannot be verified returns `recovery-required` naming the journal and never a count; a test command that contains a destructive Git operation is refused with the same rule as the Bash guard.

### B-009 - Destructive Git is refused in Drive Pi workers

- Source: AC-014
- Observer: an in-process Drive worker invoking Bash
- Entry point: a Bash call containing a Git operation that discards or rewrites worktree or index state, in executable position (including chained, `env`/`command`-prefixed, `git -C`, `git -c`, `--git-dir`/`--work-tree`, and `sh -c`/`bash -c`/`eval` forms)
- Outcome: the call is blocked before execution with the Drive safety rule, the snapshot ref where the previous attempt's work is recoverable, and a non-destructive alternative; quoted prose, read-only Git, and the add/commit policy are unaffected; the same call outside a Drive worker session is unaffected; forms the classifier does not recognize (command substitution, aliases, redirect-overwrite) are listed in the documentation as residual and are covered by the snapshot in B-011.

### B-010 - Drive operator output and mode errors agree

- Source: AC-016, AC-018
- Observer: a print-mode caller launching Drive
- Entry point: `run_driver`
- Outcome: a successful launch's visible text includes the run workdir and the event-log path; the tool schema and every wrong backend/mode error use the same sentence: `cosmonauts-subagent` is inline-only, `codex` and `claude-cli` are detached-only.

### B-011 - Drive protects previous work and leaks no control metadata

- Source: AC-015, AC-017
- Observer: a coordinator inspecting a Drive-created source commit, a project preflight/postflight process, and the run's refs
- Entry point: `run_driver` with driver-owned commits, project commands, and a dirty worktree between attempts
- Outcome: a source-commit subject uses a safe report summary or the task title, never a JSON fence, brace-delimited JSON, or a report outcome line; project preflight and postflight processes receive no `COSMONAUTS_DRIVER_*` variables while backend selection still reads them; before every spawn with a dirty worktree, Drive records a snapshot ref of that state, names it in the attempt's Drive note and the next `spawn_started` event, and keeps it unless the task ends Done; a `blocked` report under `backend-commits` with a moved HEAD is recorded with the unverified commit range.

### B-012 - Acceptance evidence proves the hardening without weakening checks

- Source: AC-019, AC-020
- Observer: the implementing coordinator and the final reviewer
- Entry point: the completed change set, the per-behavior evidence in task notes, the `## Evidence` table in this plan, and one real inline `run_driver` slice on a throwaway task
- Outcome: every behavior has a recorded failing run before its change and a passing run after; the live slice shows attempt 1's appended record, a `task_retry` before the second `spawn_started`, one postflight set before the retry and none after the blocked report, attempt 2's verbatim block reason, the worker's sentinel bytes untouched, and durable and legacy records that agree; the change set contains no suppression, threshold, baseline, ignore-pattern, or configuration workaround, and every changed test expectation cites the criterion whose defect it pinned.

### B-013 - A blocked report ends the attempt without postflight or retry

- Source: AC-002, AC-003
- Observer: a coordinator reading the task file, `events.jsonl`, and the run's terminal result
- Entry point: `run_driver` when a worker's final report says `outcome: blocked` in the fenced JSON or the outcome line
- Outcome: the report is parsed as blocked under the same contract the worker saw; no postflight command runs; no contradicted-path retry occurs; the task is Blocked with the worker's notes (or, absent notes, the raw report) verbatim as the reason; `task_blocked` carries that reason; the run's handling of the task follows the existing `partialMode` rule; under `backend-commits` a moved HEAD is recorded as unverified commits.

### B-014 - Every analysis response fits a bounded text budget

- Source: AC-009
- Observer: an agent calling any `analysis_*` tool, including on provider failure
- Entry point: status, findings, trace, fix-preview, non-ready, and provider-error responses
- Outcome: the model-facing text begins with a fixed header (capability, provider, scope, verdict, coverage, metric) followed by one compact row per displayed finding (location, severity, metric values, message) or the variant's equivalent rows; the text never contains the native payload, states omissions or truncation deterministically, and is at most 32,768 UTF-8 bytes without splitting a code point; complete typed and native data remain in details without another provider run; a provider error's message is capped at the same bound.

### B-015 - The worker prompt matches the mechanisms

- Source: AC-002, AC-006, AC-012, AC-014
- Observer: a coding worker reading its rendered prompt and the coding worker persona
- Entry point: the rendered Drive prompt and `bundled/coding/prompts/worker.md`
- Outcome: the worker is told that only `task_edit` (or the task CLI append) reaches the notes Drive preserves and that response prose is not the durable record; that a Blocked status is reported with `outcome: blocked`, which ends the run for a human with no postflight or retry; that a `blocked` stop claiming an unreached site must quote a usable zero hit count from `execution_probe`; and that destructive Git is refused and the previous attempt's work is in a snapshot ref; the report contract lists `blocked` with that meaning.

## Design

### 1. Source-preserving task mutation

`TaskUpdateInput` makes note modes unrepresentable together:

```ts
type TaskUpdateInput = TaskUpdateFields & (
  | { implementationNotes?: string; appendImplementationNotes?: never }
  | { implementationNotes?: never; appendImplementationNotes?: string }
);
```

Every `TaskManager.updateTask` acquires `withEntityFileLock` at a task-ID-derived `.cosmonauts/*.lock` path (bounded wait, like the create lock) around lookup, parse, rename, write, and release. The task lock is outermost; the existing episode transition lock stays exactly where it is today, wrapping `updateTaskLocked`, and episode capture still runs after that lock is released and inside the task lock. `execution-liveness` decision 038 absorbs this later (D-026).

A focused note editor (`lib/tasks/task-note-editor.ts`) works on raw source. It finds zero or one raw `## Implementation Notes` section in the original (an empty section counts) and exactly one in the canonical re-serialization. For every update that does not replace notes, it transplants the original section span (heading, line endings, trailing spaces, boundary blank lines) over the canonical one. For append mode it composes original span + separator in the section's line-ending style + new text, and skips the write when the exact heading-plus-body block is already present (D-022). Duplicate or ambiguous sections, and an empty append, are rejected before write. Replace mode alone re-serializes. Evidence compares raw byte slices, including CRLF, trailing spaces, empty sections, and boundary blank lines.

The task extension exposes `implementationNotesMode: "replace" | "append"` (default replace) and normalizes titles: trim, repeatedly strip matching surrounding single, double, or backtick quotes, trim, collapse internal whitespace; empty output fails before persistence. `cli/tasks/commands/edit.ts` maps `--append-notes` to the append input (D-029).

Drive appends use:

```text
### Drive — outcome <blocked|failure|partial|unknown> — attempt <n|unknown> — run <runId>

<reason or raw report>
```

Level three is contractual because level two terminates the parser's notes section.

### 2. Report, note, and transition matrix

```ts
interface BlockedReport extends Omit<Report, "outcome"> { outcome: "blocked"; raw: string }
type ParsedReport = Report | BlockedReport | { outcome: "unknown"; raw: string };
```

Both blocked forms retain original stdout; non-empty `notes` is the reason verbatim, otherwise raw stdout. `lib/driver/durable-steps.ts` maps a blocked `spawn_completed` report to the existing blocked `StepResult` with `wait_for_human` and the same reason; no `lib/durable-runtime/` type changes.

After `spawn_completed`, both task paths follow one matrix. The task step is the sole note writer (D-022):

| Parsed report | Note (task step) | Postflight | Contradiction retry | Final task effect |
|---|---|---|---|---|
| `success` | none | run | only if a later check produces a failure candidate | existing success / unchecked-AC behavior |
| `failure` | append when the attempt is finalized, including before a retry | run | existing one-time rule | Blocked on the final attempt; status untouched on a retry candidate |
| `partial` | append when finalized, including before a retry | run | existing one-time rule | existing `partialMode`; one record per attempt under `continue` |
| `blocked` | append the verbatim reason (+ unverified commit range or dirty paths, D-023) | **never** | **never** | Blocked, terminal for this attempt; run follows `partialMode` |
| `unknown` | append the complete raw stdout **before inference** | run under existing rules | existing rule only if a later candidate qualifies | existing inferred success/failure; no second unknown note |

Spawn failures use the failure append path. A blocked task leaves Drive's control and exits Blocked only through a later explicit edit or run. Unknown-note persistence failure aborts the attempt before inference. HEAD is recorded before every spawn (D-023).

### 3. Retry event and durable projection

`runContradictedAttempts` passes `{ appendedNote, attemptNumber }` to each attempt and `{ trigger, attemptNumber, contradicted }` to `onRetry`. `skipTaskUpdate` becomes `skipStatusTransition`; the note append and the contradicted `task_blocked`/`spawn_failed` event still happen for attempt 1. Then:

```ts
{ type: "task_retry"; taskId: string; trigger: "contradicted-path"; attemptNumber: 2; contradicted: { path: string; existsOnDisk: true } }
```

The graph callback emits `task_retry` and then its second `spawn_started`; the legacy attempt emits its own next `spawn_started`. In `lib/driver/durable-events.ts`, a `task_blocked`/`spawn_failed` carrying `contradicted` normalizes to activity only (no `step_blocked`/`step_failed`), and `task_retry` normalizes to activity; `lib/driver/durable-steps.ts` writes no terminal step for a retry candidate. `lib/driver/event-stream.ts` bridges `task_retry` to live subscribers; legacy JSONL stays authoritative. The attempt number is in-memory for the step; a finalizer that cannot know it writes `attempt unknown` with a diagnostic (D-021). Before every spawn, Drive records HEAD and, if the worktree is dirty, the snapshot ref (D-020); `spawn_started` gains an optional `worktreeSnapshot` field.

### 4. Prompt composition

Tasks with acceptance criteria always receive a completion section: `cosmonauts-subagent` gets `task_edit` with `checkAc`; external backends keep the task CLI instruction. The report contract lists `outcome: blocked` as a human stop with no postflight or retry and tells `backend-commits` workers not to commit before a blocked stop. Rendered protocol behavior is code-tested per backend name (B-004); authored persona prose is B-015 (slice 12).

### 5. Analysis scoping, classification, and bounded presentation

`lib/analysis/types.ts` adds optional `metricValues?: Readonly<Partial<Record<AnalysisMetric, number>>>` on findings; Fallow promotes cyclomatic/cognitive/CRAP. Complexity and duplication advertise `paths`; Fallow runs once at project scope; after full schema and verdict reconciliation the adapter canonicalizes project-relative separators and dot segments and retains a finding whose location equals a requested path or starts with a requested directory plus `/`; locationless findings are excluded; the scoped verdict is recomputed; coverage is preserved; native payload is untouched. Project scope bypasses filtering. `analysis_duplication({ paths })` is the residue helper (D-010).

One shared renderer caps every analysis tool's text at 32,768 UTF-8 bytes: a fixed never-truncated header (D-024), then rows, then a deterministic omitted-count or truncation line, never splitting a code point. Findings rows carry location, severity, metric values, message; trace rows carry nodes/edges/evidence; fix-preview rows carry action and locations; status and non-ready resolutions use bounded summaries; `AnalysisProviderError` keeps its structured fields and caps its formatted message. Native payload and provider details stay in `details`.

Unsupported-target resolution becomes a discriminated union with a new provider-constraint variant (`reason: "provider-target-constraint"`, `suggestedTarget` of kind `file`); the private Fallow runtime adds `classifyRequest(request, signal)`, called by project-tools after `resolveAnalysisRequest` returns ready and before `execute`. A TypeScript-compiler AST check recognizes direct exports, export lists and aliases, default exports, and supported CommonJS assignments; confirmed absent exports return the exports-only result without spawning Fallow; re-exports, other languages, unreadable, or indeterminate sources return `undefined` and proceed.

### 6. Execution probe (worker-only)

Input:

```ts
interface ExecutionProbeInput {
  locations: readonly { path: string; line: number; statementTemplate: string }[]; // template uses {{hitFile}} and {{marker}}
  testCommand: string;
  timeoutMs?: number;
  confirmProjectExecution: true;
}
```

Flow, under one project-wide `withEntityFileLock` held for the call: (1) recover any outstanding journal for this project (restore from digest-verified sidecars) or return `recovery-required`; (2) classify `testCommand` with the destructive-Git classifier and refuse on a match; (3) validate locations: tracked regular files whose realpath stays inside the root, no symlinks, no exact duplicate `(realpath, line)`, valid lines; take each file's digest; (4) write sidecars and a manifest (project root, per-file original digest, planned instrumented digest) to a mode-0700 directory under the OS temp root keyed by a hash of the canonical root, fsync, verify; (5) re-check each file's digest against step 3 and refuse if it changed (the H-001 (ii)(a) dirty rule, human-ruled; git-dirty is allowed); (6) instrument, grouping locations by file and inserting in descending line order so line numbers stay source-relative, each marker unique; (7) run the command once through the existing provider process runner with the timeout; (8) in `finally`, restore every instrumented file from its sidecar, verify the digest, compare `git status --porcelain` with the pre-instrumentation capture and record side effects, delete the journal only when every restore verified; (9) count markers in the private hit file and return `{ hits, exitCode, sideEffects, usableZero, restored }` or `recovery-required` with the journal path.

Drive's preflight and postflight (both paths) check the project's probe journal directory: an outstanding journal blocks the task with a `recovery-required` reason before any postflight or commit. There is no persisted process identity and no supervisor; a stray test process cannot alter source, and its hit file is ignored (D-019).

### 7. Drive worker Git guard and snapshot

`lib/agents/drive-worker-tool-guard.ts` exports a pure classifier over a shell command string that finds Git invocations in executable position (handling `;`, `&&`, `||`, `|`, newlines, `env`/`command` prefixes, `git -C`, `git -c`, `--git-dir`/`--work-tree`, and `sh -c`/`bash -c`/`eval` string arguments) and matches the destructive families `checkout` (with paths or `--`), `switch --discard-changes`, `restore`, `reset`, `stash` (except `list`/`show`), `clean`, `rm`, `read-tree`, `checkout-index`, `update-index`, `apply -R`. Command substitution, aliases, and redirect-overwrite are documented residuals. Session assembly adds an inline `tool_call` extension using the classifier only when `runtimeContext.parentRole === "driver"`; refusal text names the rule, the snapshot ref, and the alternative. The same classifier gates the probe's test command.

`lib/driver/runtime-helpers.ts` gains `snapshotWorktree(projectRoot, ref)`: `git stash create` (tracked + untracked via `git add -A --intent-to-add` on a temporary index if needed), `git update-ref <ref> <sha>`; called before every spawn when the worktree is dirty; refs under `refs/cosmonauts/drive/<runId>/<taskId>/attempt-<n>`; terminal cleanup deletes refs of Done tasks only (D-020).

### 8. Driver boundary hygiene

`reportSummary` classifies a candidate as usable, absent, or unsafe (JSON fence, complete brace-delimited JSON, report outcome marker); unsafe or absent yields the task title through `commitSubject` on both paths. Pre/postflight shells receive a copied environment with all `COSMONAUTS_DRIVER_*` keys removed; backend construction reads the parent environment first. The orchestration extension defines one backend/mode guidance string reused by the schema and both mode errors; validation precedes backend construction; successful text includes `workdir:` and `eventLogPath:`.

## Files to Change

- `lib/tasks/task-types.ts` — make replace and append note inputs mutually exclusive.
- `lib/tasks/lock.ts` — task-ID mutation lock path and bounded acquisition (hand-off to execution-liveness decision 038 recorded).
- `lib/tasks/task-note-editor.ts` — new raw-source note-section extraction, transplant, and idempotent append.
- `lib/tasks/task-manager.ts` — lock every update; transplant raw notes on every non-replacing update; append mode.
- `domains/shared/extensions/tasks/index.ts` — expose append mode; normalize/reject tool-supplied titles.
- `cli/tasks/commands/edit.ts` — route `--append-notes` through the append input.
- `lib/driver/types.ts` — blocked parsed report, `task_retry` event, `worktreeSnapshot` on `spawn_started`, unverified-commit fields.
- `lib/driver/report-parser.ts` — parse blocked JSON/line reports and retain raw output.
- `lib/driver/runtime-helpers.ts` — Drive note formatting, attempt numbers in the retry loop, environment scrub, report-summary classification, HEAD capture, worktree snapshot.
- `lib/driver/run-one-task.ts` — unknown-before-inference, early blocked branch, probe-journal check, snapshot before spawn (legacy path).
- `lib/driver/drive-scheduler-backend.ts` — matching graph behavior; sole note writer; `task_retry` before the second spawn.
- `lib/driver/drive-finalization.ts` — status-only finalizers; safe title fallback; `attempt unknown` diagnostic.
- `lib/driver/durable-events.ts` — nonterminal projection of retry candidates; `task_retry` as activity; exhaustive map.
- `lib/driver/durable-steps.ts` — blocked report projection; no terminal step for a retry candidate.
- `lib/driver/event-stream.ts` — bridge `task_retry` to live subscribers.
- `lib/driver/shell-command-finalizer.ts` — no note writes; `attempt unknown` when the local attempt is not known.
- `lib/driver/prompt-template.ts` — `blocked` in the report contract; all-backend completion protocol; no-commit-before-blocked for `backend-commits`.
- `lib/driver/README.md` — blocked parsing, retry visibility, snapshot refs, probe-journal check.
- `lib/agents/drive-worker-tool-guard.ts` — new destructive-Git classifier and blocking `tool_call` extension.
- `lib/agents/session-assembly.ts` — compose the Drive-only guard from runtime context.
- `bundled/coding/agents/worker.ts` — load the `execution-probe` extension and capability.
- `bundled/coding/capabilities/execution-probe.md` — new worker contract for the probe tool.
- `bundled/coding/extensions/execution-probe/index.ts` — new locked, journaled, always-restoring probe tool.
- `bundled/coding/prompts/worker.md` — append notes, aligned blocked outcome, probe evidence rule, Git rule and snapshot.
- `lib/analysis/types.ts` — `metricValues`; provider-constraint unsupported-target variant.
- `domains/shared/extensions/project-tools/analysis-provider-error.ts` — cap the formatted message.
- `domains/shared/extensions/project-tools/fallow-provider.ts` — scoped filtering, metric promotion, export classification, `paths` advertisement.
- `domains/shared/extensions/project-tools/index.ts` — bounded renderer with header; pre-execution classification.
- `domains/shared/extensions/orchestration/driver-tool.ts` — unified mode guidance and errors; workdir and event-log path in text.
- `domains/shared/skills/analysis/SKILL.md` — residue, bounded text and details, export-only trace.
- `domains/shared/skills/drive/SKILL.md` — residue requirement, blocked/retry protocol, snapshot refs, probe-journal block.
- `docs/analysis-capabilities.md` — scopes, text cap and header, details, trace limit.
- `docs/analysis-provider-validation.md` — metric neutrality and adapter limitations.
- `docs/fallow.md` — adapter filtering and export classification.
- `docs/orchestration.md` — report vocabulary, retry event, result text, environment, mode rule, snapshots.

## Risks

- **Raw note fidelity:** any parsed-string write, full-body rewrite without raw-section transplant, ambiguous duplicate note section, or unlocked update violates INV-001. Abort on a raw byte-prefix mismatch or a lost concurrent append; do not narrow the invariant.
- **Graph/legacy/compatibility drift:** blocked reports, retry events, and the nonterminal projection have legacy, durable, bridge, and finalizer consumers. Each slice exercises all owned consumers. Abort if parity would require scheduler attempt/lease/cancellation changes; revise only Driver seams. Pivot if `execution-liveness` lands its first-terminal guard before slice 4: re-validate B-002 against it.
- **Unknown inference:** raw unknown output must be durable before inference. Abort inference if the append fails.
- **Duplicate records:** a second writer or a non-idempotent append turns the record into noise. Abort if the graph `continue` case or a finalizer retry yields two records for one attempt.
- **Scoped verdict mismatch:** provider exit describes the full inventory; paths scope describes a subset. Reconcile full integrity first, then the scoped verdict. Never label an unknown run clean.
- **Bounded text versus complete display:** the Ranking makes the cap authoritative; text states omissions; details retain all data. The pinned text-equals-details tests change only with the AC-009 citation.
- **Export false certainty:** only AST-confirmed non-exports return unsupported. Pivot narrower rather than misclassify.
- **Probe restoration:** H-001 is ruled (a),(a). Restoration runs in `finally` on every exit; an unverifiable restore returns `recovery-required` and blocks Drive; never report a count without a verified restore. AC-012 is amended on record per H-001 (i)(a).
- **Probe instrumentation trust:** the test command executes project code with the worker's authority; it is classified against destructive Git and requires explicit confirmation; the tool is loaded only by the coding worker.
- **Git guard coverage:** the classifier is syntactic; residual bypasses are documented and the snapshot ref makes them non-lossy. If the pinned Pi cannot block a `tool_call`, stop and record the fallback before implementation.
- **Snapshot cost and hygiene:** a snapshot per spawn on a dirty tree is one `git stash create`; refs accumulate on blocked runs by design and are listed in `cosmonauts run status`. Abort if a snapshot would require applying stash state to the worktree.
- **Commit fallback provenance:** both paths must carry the unsafe-summary signal through finalization; abort if a synthetic sentence can become a subject instead of the task title.
- **Live acceptance lifecycle:** if the run starts but fails, settle it, retain artifacts, append the evidence to slice 12's task, then remove the throwaway task and sentinel. Backend unavailability is a human stop, never a mock.
- **Static/structural evidence:** planning analysis was unbound. Treat sign-off findings as evidence and pivot the owning slice; never clear them through floors, suppressions, or configuration.
- **Scope creep:** no `lib/durable-runtime/`, `drive-envelope`, execution-liveness, suppression, threshold, baseline, ignore, or config work belongs here. Apply the deviation protocol rather than absorb it.

## Implementation Order

Thirteen slices: twelve are each one Drive run on the `cosmonauts-subagent` inline backend (D-028), dependency-ordered; the thirteenth is coordinator-run (D-031). Every slice records, per owned behavior, one failing run before the change and one passing run after, in its task notes (D-030). Test files are chosen by the worker after inspecting existing coverage.

1. **Source-preserving task mutation and task-edit hygiene — B-003 (AC-006, AC-013).** Per-task lock, raw note transplant on every non-replacing update, exclusive input type, `task_edit` append mode, CLI `--append-notes` routing, title normalization, canonical rename. Prove: CRLF/trailing-space/blank-line bytes survive a status-only, criterion-only, and title-only update; empty-section append; no-section insertion; duplicate-section refusal; replace compatibility; both-modes rejection; simultaneous appends from separate processes; idempotent re-append; normalized-empty rejection; one canonical path.

2. **Structured Drive records on failure, partial, unknown, and spawn failure — B-001 (AC-001, AC-004).** Drive heading with attempt number, sole-writer rule on both paths, unknown-before-inference, retry-candidate record with status untouched, HEAD capture before spawn. Prove: prior bytes intact on both paths; inferred-unknown success keeps one record; final unknown failure; graph `continue` yields one record per attempt; finalizer retry does not duplicate; attempt 1 then attempt 2 ordering; finalization failure writes once.

3. **Blocked report vertical slice — B-013 (AC-002, AC-003).** Blocked parse (both forms) with raw retention, report-contract wording, early branch on both paths, verbatim reason in task and event, durable blocked projection, unverified-commit range under `backend-commits`, dirty-path list otherwise. Prove: both forms; no postflight, commit, acceptance inference, or retry; legacy and normalized terminal evidence agree; `partialMode` unchanged; moved HEAD recorded.

4. **Explicit retry event and nonterminal projection — B-002 (AC-005).** `task_retry` at the existing loop, activity-only normalization of contradicted evidence, no terminal step before the second spawn, bridge inclusion, `attempt unknown` in resumed finalizers. Prove: attempt 1's note precedes `task_retry`; `task_retry` precedes the second `spawn_started`; no retry event without a re-spawn; durable record shows one running step; a resumed finalizer writes `attempt unknown`; no `lib/durable-runtime/` change. *Checkpoint (D-028, D-031): before slice 5 launches, the coordinator restarts the cosmo host and confirms no stale `bin/cosmonauts-drive-step`; recorded in TASK-794's notes.*

5. **All-backend completion protocol — B-004 (AC-007).** Render the criterion-marking section for every backend name with its mechanism; keep unchecked-success blocking. Prove: the rendered prompt for `cosmonauts-subagent`, `codex`, and `claude-cli` each contains the instruction with the right mechanism (failing before the change for the subagent); a success report with unchecked criteria still blocks.

6. **Scoped complexity and duplication residue — B-005, B-007 (AC-008, AC-011).** Advertise and filter `paths` after one project run; recompute the scoped verdict; skill guidance for residue. Prove: exact file, directory descendant, non-match, locationless exclusion, one-owned-side clone group, separator/dot normalization, full project unchanged, binding advertises `paths`.

7. **Bounded presentation for every analysis response — B-014 (AC-009).** Metric promotion, shared renderer with fixed header and 32 KiB cap, provider-error cap, pinned-test expectation change citing AC-009. Prove: header always present; required columns; variant rows; no native text; complete details; oversized rows and errors; UTF-8 safety; deterministic omission line.

8. **Export-only trace classification — B-006 (AC-010).** Discriminated unsupported-target variant, `classifyRequest`, AST check, docs and skill wording. Prove: direct/aliased/default/CommonJS exports proceed; confirmed internals return unsupported without a provider spawn; re-export/unreadable/other-language/indeterminate proceed.

9. **Locked, journaled, always-restoring execution probe — B-008 (AC-012).** Worker-only extension and capability under `bundled/coding/`; validation, sidecars and manifest, instrumentation with same-file batching, single command run with timeout, `finally` restore with digest verification, side-effect comparison, hit counts and `usableZero`, journal recovery on the next call, Drive preflight/postflight journal block on both paths, test-command Git classification. Prove: pass/fail/timeout/abort all restore; side effect invalidates zero; changed-since-validation refusal; outstanding-journal refusal and recovery; corrupt sidecar returns `recovery-required` and Drive blocks before postflight and commit; symlink/escape/non-regular/duplicate refusal; multiple lines in one file; destructive test command refused.

10. **Drive Pi worker Git guard and worktree snapshots — B-009, B-011 snapshot clauses (AC-014).** Classifier, Drive-only `tool_call` extension, refusal text, `snapshotWorktree` before every spawn on a dirty tree, ref naming and cleanup, `worktreeSnapshot` on `spawn_started`. Prove: Drive versus non-Drive sessions; executable position versus quoted prose; separators, prefixes, `-C`, `-c`, `--git-dir`, `sh -c`/`eval`; each destructive family; read-only Git and add/commit unaffected; snapshot ref exists and resolves after a simulated `git checkout --` on a dirty tree; refs kept on blocked, removed on Done.

11. **Driver boundary hygiene — B-010, B-011 remaining clauses (AC-015, AC-016, AC-017, AC-018).** Safe-summary classification with task-title fallback on both paths, environment scrub for project commands only, workdir and event-log path in text, unified mode wording. Prove: safe prose remains; every forbidden subject form yields the title; backend creation still sees the variables while project children do not; identical wording in schema and both errors.

12. **Worker prompt alignment — B-015 (AC-002, AC-006, AC-012, AC-014).** Persona prose in `worker.md` for append-only notes, `outcome: blocked`, probe evidence, the `backend-commits` no-commit-before-blocked rule, Git rule and snapshot ref location; skills and docs consistency. Prove: a rendered report contract or persona lacking a clause fails before the change; every clause is verified by reviewed diff. The worker records the carrying lines for TASK-802.

13. **Coordinator closeout and live acceptance — B-012 (AC-019, AC-020).** *Coordinator-run, not a Drive task (D-031).* After slice 12's Drive commit: restart the cosmo host and confirm no stale `bin/cosmonauts-drive-step`; audit every task's red/green rows and copy them into a `## Evidence` table appended to this plan; audit the change set for prohibited configuration, suppression, or uncited expectation edits; create an unlabelled throwaway task with raw sentinel notes whose attempt 1 reports `failure` naming an existing path as absent and whose attempt 2 reports `blocked` with a fixed reason; run only that task through real inline `cosmonauts-subagent` with `no-commit` and one consented external postflight sentinel; accept only if the notes preserve the sentinel bytes and show Drive attempt 1 then attempt 2, events show attempt 1's block evidence, `task_retry`, the second `spawn_started`, exactly one postflight set before the retry and none after the blocked report, no third spawn, the verbatim final reason, a snapshot ref for the dirty tree, and durable and legacy records that agree; in `finally`, settle the run, retain its directory, append run ID and evidence to this slice's task, then remove the throwaway task and sentinel; copy the D-026 hand-off from TASK-790's notes into the closeout report. If live access is unavailable or behavior is nondeterministic, stop for human disposition.

## Evidence

Red/green record per behavior (D-030, AC-019), copied from the owning task's implementation notes by the implementing coordinator on 2026-09-29. Commits in the "failing" column are the slice-start HEAD at which the test was run against pre-change code; the "passing" column names the Drive commit that carries the change.

| Behavior | Owner | Failing run (test, commit, failure) | Passing run |
|---|---|---|---|
| B-001 | TASK-791 | `preserves worker notes and records unknown output before inferred success` at `0e2fe9f9`: expected a Drive unknown record, received only the worker sentinel | same test green; suite 3947; commit `10664396` |
| B-002 | TASK-793 | `retries a graph task once` at `f0a7d37c`: `expected [] to deeply equal [ObjectContaining{…}]` (no `task_retry` before re-spawn) | green; suite 3964; commit `b2752b04` |
| B-003 | TASK-790 | `source-preserving task edits > preserves the complete raw CRLF notes section on status, criterion and title edits` at `4bbe5f40`: serialization replaced CRLF/trailing-space notes with LF/trimmed | green; suite 3942 (+ separate-process concurrent appends); commit `d1e53585` |
| B-004 | TASK-794 | `instructs internal subagent workers to check acceptance criteria via task_edit` at `dedc033d`: in-process prompt omitted `## Task Completion Protocol` | green 51/51; suite 3968; commit `08ff87f9` |
| B-005 | TASK-795 | `scopes complexity to an exact file after a single full health run` at `1940bdbb`: `FallowBindingUnavailableError` (`paths` scope not advertised) | green; commit `ac4c10f6` |
| B-006 | TASK-797 | `returns an exports-only constraint for a confirmed internal symbol without running Fallow` at `2ddaa923`: expected unsupported-target, received trace | green; suite 3999; commit `665c7103` |
| B-007 | TASK-795 | `reports every clone group with one owned side and no unrelated groups` at `1940bdbb`: `FallowBindingUnavailableError` | green; commit `ac4c10f6` |
| B-008 | TASK-798 | `returns hits and exit status and restores a git-dirty tracked file` at `c9c4af90`: expected hits/exitCode/restored, received undefined; classifier dependency `refuses destructive invocation git reset --hard`: expected true, received false | green 16/16 probe, 31 classifier cases; commit `c03cccd9` |
| B-009 | TASK-799 | `blocks destructive Bash only for a Drive worker while preserving ordinary Git` at `69a8c9df`: expected 1 Drive-only extension, got 0 | green 35; commit `852c92b6` |
| B-010 | TASK-800 | `preserves tool registration shape while accepting detached-capable parameters` and `routes detached codex runs to startDetached and returns handle details` at `17d6fb41`: no unified mode guidance; no labeled workdir/eventLogPath | green; commit `3b5c1b88`; live: the slice-12 host printed `eventLogPath` (run `run-1a2af012`) |
| B-011 | TASK-799 / TASK-800 / coordinator / TASK-803 | snapshot: `snapshots tracked and untracked bytes` (legacy) and `snapshots dirty tracked and untracked bytes` (graph) at `69a8c9df`: `spawn_started` has no `worktreeSnapshot`; boundary: 9 failures at `17d6fb41` incl. `uses safe prose or task title for legacy/graph commit subject` and `keeps driver metadata in backend but not legacy/graph project commands`; coordinator: `snapshots a dirty tree when a gitignored missions/sessions directory exists` at `4fd7eda8`: `git add … :(exclude)missions/sessions failed: The following paths are ignored`; note placement (D-033): 7 snapshot/blocked-note cases at `f2d6242c`: standalone paragraph present, in-record line absent | green; commits `852c92b6`, `3b5c1b88`, `f2d6242c`, `c2fe7c0b` |
| B-012 | TASK-802 | live acceptance, first run `run-d8550075` (TASK-804): the real worker refused the probe's false "file is absent" claim and stopped `blocked` on attempt 1 (blocked path held: notes intact, no postflight, no retry; retry path not exercised; probe rebuilt without the false claim, derived amendment recorded in TASK-802) | second run `run-f79d00a4` (TASK-805) on real inline `cosmonauts-subagent`, `no-commit`, one sentinel postflight: sentinel bytes byte-identical, `### Drive — outcome failure — attempt 1` (with `Worktree snapshot:` line) then `— outcome blocked — attempt 2`, events `spawn_started > spawn_completed(failure) > verify ×2 > task_blocked(contradicted) > task_retry > spawn_started > spawn_completed(blocked) > task_blocked > run_aborted`, one postflight set before the retry and none after, no third spawn, verbatim final reason, snapshot refs retained, durable step `blocked` with one terminal `step_blocked`; 19/19 verifier checks |
| B-013 | TASK-792 | `report-parser > retains raw stdout and notes for a blocked fenced report` at `b60570df`: expected blocked, received unknown; `stops a blocked report before postflight or retry with driver-commits`: post-verify ran instead of preserving the reason; `renders a blocked human stop for cosmonauts-subagent`: blocked disallowed | green; suite 3961; commit `aa74f856` |
| B-014 | TASK-796 | `leaves the entire worktree unchanged across status and every capability` at `34ae869b`: `analysis_dead_code` text lacked `capability: dead-code` (native JSON exposed); attempt 2 under D-032: `keeps the legacy provider error message for ordinary process evidence` | green; commit `aa7c7338` |
| B-015 | TASK-801 | semantic review of the rendered report contract and worker persona at `61c89b09`: no append-only durable-note rule, blocked stop, probe-zero evidence, or snapshot recovery | reviewed diff green; suite 4082; commit `363169bd` |
