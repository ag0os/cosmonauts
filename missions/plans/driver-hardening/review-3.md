# Plan Review: driver-hardening

## Findings

- id: PR-015
  dimension: lifecycle-invariant
  severity: high
  title: "Status-only and criterion-only task edits still rewrite worker note bytes"
  plan_refs: D-005, B-001, B-003, Design §1, Implementation Order stages 1–3
  code_refs: lib/tasks/task-manager.ts:189-273, lib/tasks/task-parser.ts:32-36, lib/tasks/task-parser.ts:139-158, lib/tasks/task-serializer.ts:86-111, lib/tasks/task-serializer.ts:142-151, lib/driver/drive-finalization.ts:181-197
  description: |
    The revised raw-section editor is still assigned only to append mode. Design §1 says replace mode keeps canonical serialization, but does not give source-preserving semantics to an update that supplies neither note field. Today every `TaskManager.updateTask` parses and serializes the complete task. Parsing converts CRLF to LF and trims extracted sections; serialization reconstructs `Implementation Notes`. A Drive success calls `updateTask(taskId, { status: "Done" })`, and `task_edit` criterion/title changes likewise pass existing parsed notes back through the serializer.

    Consequently a successful run or criterion check can alter CRLF, trailing spaces, or boundary blank lines in worker-authored notes without appending or replacing notes. B-001 and ratified INV-001 cover every Drive outcome, not only non-success append paths. The plan must assign raw-note preservation to every update that does not explicitly replace notes. Narrowing preservation to append calls would touch ratified ground and requires human escalation.

- id: PR-016
  dimension: state-sync
  severity: high
  title: "A persisted PID/process-group number is not durable process identity"
  plan_refs: D-013, B-008, Design §6, Risk — Probe interruption/concurrency
  code_refs: lib/process/process-group.ts:10-37, lib/process/process-group.ts:60-108, lib/fs/lock-file.ts:41-50, domains/shared/extensions/project-tools/process-runner.ts:303-310, missions/plans/execution-liveness/plan.md D-035 and Files to Change — `lib/process/process-identity.ts`
  description: |
    D-013 persists the supervisor PID/process-group identity and later recovery signals and probes that tree. The existing primitives identify both a process and a POSIX group only by a numeric PID: `processGroupExists` calls `process.kill(-processGroupId, 0)`, and signalling uses the same number. Lock liveness also uses `process.kill(pid, 0)`. After the original supervisor exits, either identifier can be reused before delayed recovery; recovery can then kill an unrelated group, report the old tree as surviving, or make restoration decisions from the wrong process.

    The active execution-liveness plan already identifies this repository-wide gap by introducing exact process identity, but driver-hardening neither depends on that delivery nor specifies an equivalent birth identity and verification contract. The probe cannot safely recover across process restart from PID/group number alone. This needs coordination or redesign before the persisted identity can govern signalling or source restoration; weakening the recovery promise touches ratified AC-012.

- id: PR-017
  dimension: lifecycle-invariant
  severity: high
  title: "Recovery-required returns release the probe lock while live code remains instrumented"
  plan_refs: D-013, B-008, Design §6, Risk — Probe interruption/concurrency
  code_refs: lib/entity-file-lock.ts:58-66, lib/entity-file-lock.ts:274-313, lib/fs/lock-file.ts:52-71, domains/shared/extensions/project-tools/process-runner.ts:455-515
  description: |
    Design §6 says that when termination cannot be verified the tool keeps the journal, leaves known instrumented bytes in place, and returns `recovery-required`. The required `withEntityFileLock` cannot preserve exclusivity across that return: it always runs lock release in `finally`. The process runner likewise has a bounded cleanup path that can return a termination error while the process tree is still present.

    The resulting state has live instrumented source and a possibly live project command, but no held project lock. Another worker action is not lock-aware, and a later recovery process must race source changes and numeric process identity before it can restore. A journal records the hazard but does not own it. Round-2 PR-012 therefore remains open: the plan needs an enforceable durable ownership/handoff state for an unsettled tree rather than returning through a scoped lock. Relaxing byte-identical restoration or quiescence would touch ratified AC-012.

- id: PR-018
  dimension: lifecycle-invariant
  severity: high
  title: "Target-file backups cannot make an unrestricted failing command leave the source tree byte-identical"
  plan_refs: B-008, Design §6 `ExecutionProbeInput`, Design §6 digest matrix, Implementation Order stage 9
  code_refs: missions/plans/driver-hardening/spec.md AC-012, domains/shared/extensions/project-tools/process-runner.ts:17-21, domains/shared/extensions/project-tools/process-runner.ts:303-310
  description: |
    Ratified AC-012 says the helper leaves the source tree byte-identical to its start even when the test command fails. The design journals and restores only the explicitly instrumented target files, while `testCommand` is an unrestricted project command executed in the project cwd. The current runner provides process settlement but no filesystem sandbox or mutation inventory. A settled command such as one that updates another tracked source file and exits nonzero leaves that file changed after all planned target restoration. If the command changes an instrumented target, the digest matrix deliberately preserves the unknown bytes rather than restoring them, which also contradicts the absolute acceptance text.

    This is not only an interruption case: it occurs on an ordinary, fully settled failing command. The planner must either provide a mechanism that covers command-side source mutations or escalate an amendment to AC-012; the target-only journal cannot prove the promised whole-tree outcome.

- id: PR-019
  dimension: risk-blast-radius
  severity: high
  title: "`execution_probe.testCommand` bypasses the Drive Git guard"
  plan_refs: D-011, B-009, Design §6 `ExecutionProbeInput`, Design §7, Risk — Git guard coverage
  code_refs: bundled/coding/agents/worker.ts:4-20, lib/agents/session-assembly.ts:180-246, domains/shared/extensions/project-tools/process-runner.ts:303-310, lib/driver/backends/cosmonauts-subagent.ts:38-63
  description: |
    The Git guard is explicitly a Pi `tool_call` handler for Bash invocations. The new probe is a separate extension tool that accepts a command string and starts the command internally through the process runner. Pi therefore exposes the outer call as `execution_probe`; it does not expose the nested command as a Bash tool call for the proposed classifier. A Drive worker can pass `git reset --hard`, `git clean`, or an equivalent chained command as `testCommand`, set the schema's literal confirmation to `true`, and reach the same destructive operation B-009 blocks through Bash.

    AC-014 names Bash as its mechanism, but ratified INV-006 is broader: a worker cannot discard uncommitted work from a previous attempt. The plan's two new boundaries conflict, and current tests for B-009 could pass while the new worker tool defeats the invariant. The planner must make the probe command boundary participate in the safety rule or escalate a narrowing of INV-006.

- id: PR-020
  dimension: lifecycle-invariant
  severity: high
  title: "Retry candidates still publish a terminal durable step before the retry"
  plan_refs: D-006, B-002, Design §2, Design §3, Implementation Order stages 2 and 4
  code_refs: lib/driver/drive-finalization.ts:198-232, lib/driver/durable-events.ts:102-113, lib/driver/durable-steps.ts:136-174, lib/driver/durable-steps.ts:175-279, lib/driver/drive-scheduler-backend.ts:148-183, lib/driver/drive-scheduler-backend.ts:374-399, missions/plans/execution-liveness/plan.md D-036
  description: |
    D-006 suppresses the task-file status transition but says the contradicted terminal event still occurs before `task_retry`. In the current compatibility paths that event is not merely evidence: every `task_blocked` normalizes to `step_blocked`, `recordTaskBlocked` writes a blocked step, and a contradicted `spawn_failed` writes a failed step. The following `spawn_started` then reopens that terminal step as running. Adding `task_retry` as activity does not change either projection.

    This creates a blocked/failed → running lifecycle in the durable record and directly conflicts with the first-terminal absorption being delivered by the active execution-liveness plan. Once that guard lands, attempt 2 cannot start; without it, observers still see a terminal step before the announced retry. The plan must explicitly make retry-candidate evidence nonterminal in both normalizer and projector paths before emitting `task_retry`. Resolving this requires coordination with execution-liveness D-036 rather than leaving it to final verification.

- id: PR-021
  dimension: state-sync
  severity: medium
  title: "The legacy artifact fallback still fabricates attempt 1"
  plan_refs: D-016, Design §3, Files to Change — `lib/driver/shell-command-finalizer.ts`
  code_refs: lib/driver/drive-scheduler-backend.ts:148-183, lib/driver/shell-command-finalizer.ts:99-105, lib/driver/shell-command-finalizer.ts:151-178
  description: |
    The revision correctly tags new graph output artifacts with a local-attempt schema, but says a pre-feature artifact without that schema gets a diagnosed fallback of attempt 1. Both contradicted-path worker spawns currently run inside one scheduler step and share its durable scheduler attempt ID, so an old artifact can represent local attempt 2 with no authoritative discriminator. A diagnostic does not make the value `1` true.

    If the resumed finalizer uses that fallback in the structured Drive heading, it persists a newly written record under the wrong attempt. Round-2 PR-014 is therefore narrowed but not closed. The compatibility contract must preserve the attempt as unknown or otherwise avoid presenting the fallback as the artifact's actual local attempt.

## Missing Coverage

- No acceptance example covers a status-only, title-only, or acceptance-criterion-only task edit over raw CRLF/trailing-space note bytes.
- Probe recovery has no PID-reuse case and no durable ownership case for returning while the recorded process tree remains alive.
- Probe tests do not cover a settled failing command that modifies a non-target source file or changes an instrumented target itself.
- The Git safety matrix does not call `execution_probe` with a directly destructive `testCommand`.
- Retry coverage does not assert that contradicted `task_blocked` and `spawn_failed` evidence remains nonterminal in both compatibility projectors before the second spawn.
- Historical graph output from local attempt 2 with no schema has no non-fabricated finalizer outcome.
- Driver-hardening and the already-tasked execution-liveness plan both own `lib/tasks/task-manager.ts`, `lib/tasks/lock.ts`, process identity, and lock semantics (execution-liveness D-035/D-038), but the handoff does not say which plan amends the later tasks after these contracts land.

## Coverage Ledger

- dimension: interface-fidelity
  status: unchecked
  checked: Code interfaces for task mutation, Pi session assembly, Driver retry projection, entity locks, and process supervision were checked. Live Fallow flag/exit-envelope probing was not performed because execution was not consented and no probe that cannot load project-controlled configuration/plugins was established.
  findings: PR-015, PR-016, PR-017, PR-019, PR-020, PR-021
- dimension: duplication
  status: unchecked
  checked: The duplication capability is unbound (`provider=fallow`, `reason=execution-not-consented`). Named Driver/task/process paths and the active execution-liveness plan were compared manually, but project-wide duplication was not checked.
  findings: none
- dimension: state-sync
  status: checked
  checked: Traced raw task state, probe journal/lock/process identity, durable retry projection, restart finalization, and active-plan ownership.
  findings: PR-015, PR-016, PR-017, PR-020, PR-021
- dimension: risk-blast-radius
  status: checked
  checked: Followed arbitrary probe commands, failed restoration, Git mutation, PID reuse, retry terminalization, and later execution-liveness integration.
  findings: PR-016, PR-017, PR-018, PR-019, PR-020
- dimension: user-experience
  status: checked
  checked: Walked coordinator-visible task bytes/events, worker probe recovery, destructive-command refusal, and resumed finalization.
  findings: PR-015, PR-017, PR-018, PR-019, PR-020, PR-021
- dimension: behavior-spec
  status: checked
  checked: Mapped B-001 through B-012 to the ratified acceptance criteria, including failure, interruption, restart, and retry cases.
  findings: PR-015, PR-017, PR-018, PR-019, PR-020
- dimension: architecture-record
  status: unchecked
  checked: The declared tool-ecosystem record and active execution-liveness decisions were read, but configured boundary-conformance evidence is unavailable because Fallow execution was not consented.
  findings: PR-020
- dimension: quality-contract
  status: checked
  checked: Confirmed the revision has no standalone quality-gate table and that the bounded provider-error channel from round 2 is now explicitly owned.
  findings: none
- dimension: lifecycle-invariant
  status: checked
  checked: Attacked every raw-note write, probe process/journal/lock exit, arbitrary command mutation, retry terminal transition, and legacy attempt fallback.
  findings: PR-015, PR-016, PR-017, PR-018, PR-019, PR-020, PR-021
- dimension: constraint-ownership
  status: checked
  checked: Traced load-bearing note fidelity, probe quiescence, Git safety, retry ordering, and attempt identity into behaviors, design, files, risks, and implementation stages.
  findings: PR-015, PR-016, PR-017, PR-018, PR-019, PR-020, PR-021
- dimension: scope-size
  status: checked
  checked: The plan has 12 behaviors, at the project guidance limit, and eleven dependency-ordered implementation stages.
  findings: none

## Assessment

The plan remains viable only after substantial revision and is not ready for task handoff. The execution-probe boundary is the first issue to redesign: its command, process identity, lock lifetime, and restoration contract currently permit ratified safety guarantees to fail even on ordinary tool use.
