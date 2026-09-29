# Plan Review: driver-hardening

## Findings

- id: PR-011
  dimension: lifecycle-invariant
  severity: high
  title: "Status-only task updates still rewrite worker note bytes"
  plan_refs: D-005, B-001, Design §1, Files to Change — `lib/tasks/task-manager.ts`
  code_refs: lib/tasks/task-manager.ts:197-268, lib/tasks/task-parser.ts:34-36, lib/tasks/task-serializer.ts:86-111, lib/tasks/task-serializer.ts:142-151, lib/driver/drive-finalization.ts:164-181
  description: |
    The revised plan makes append mode source-preserving, but it leaves status changes on the ordinary `TaskManager.updateTask` path and only invokes the raw-section transplant “for append mode.” Drive also performs status-only updates, including the success transition to `Done`. Today every update parses and fully serializes the task; parsing normalizes CRLF and serialization rebuilds the body. A status-only update can therefore alter CRLF, trailing spaces, and blank-line bytes in worker-authored notes even when no note field is supplied.

    B-001 and ratified INV-001 require existing worker note bytes to survive Drive outcomes, including success. The plan must explicitly give note-preserving behavior to updates that omit both note fields (or otherwise ensure every Drive status mutation preserves the raw note section), not only append-mode calls. Weakening byte preservation would touch ratified ground and requires human escalation.

- id: PR-012
  dimension: lifecycle-invariant
  severity: high
  title: "Probe recovery can release or reclaim its lock while the instrumented process tree is still alive"
  plan_refs: D-013, B-008, Design §6, Risk — Probe interruption/concurrency
  code_refs: lib/entity-file-lock.ts:58-66, lib/entity-file-lock.ts:77-93, lib/fs/lock-file.ts:41-50, domains/shared/extensions/project-tools/process-runner.ts:359-393, domains/shared/extensions/project-tools/process-runner.ts:450-496
  description: |
    Design §6 says an unverified termination should “retain lock/journal state” and return `recovery-required`, but the mandated `withEntityFileLock` always releases in `finally` when the action returns. The settled process runner can return `termination-error` after its deadline while the process group still exists. Returning that outcome therefore releases the project lock while instrumented bytes and a live descendant remain. After a host crash, stale-lock reclamation checks only the lock-owner PID; the manifest records no child PID/process-group identity, so a later process can reclaim the lock and restore source while the orphaned test command is still executing.

    This contradicts the plan’s own quiescence invariant and can race or discard project writes. It also leaves instrumented source in place after a failed/aborted helper call, contrary to AC-012. The recovery contract needs an enforceable ownership/process-tree handoff rather than a scoped lock that is released on return. Narrowing AC-012 or the safety promise would touch ratified acceptance ground and needs human escalation.

- id: PR-013
  dimension: quality-contract
  severity: high
  title: "The analysis byte cap still excludes provider tool-error text"
  plan_refs: D-008, B-005, Design §5, Files to Change — analysis files
  code_refs: domains/shared/extensions/project-tools/index.ts:382-399, domains/shared/extensions/project-tools/index.ts:412-418, domains/shared/extensions/project-tools/index.ts:454-470, domains/shared/extensions/project-tools/analysis-provider-error.ts:18-41, domains/shared/extensions/project-tools/fallow-provider.ts:2559-2574, docs/analysis-capabilities.md:126-129
  description: |
    The shared renderer is specified for completed results, status, and non-ready resolutions, but provider execution failures bypass `textResult`: Fallow throws `AnalysisProviderError`, and the project-tools execute handler rethrows it. That error’s message interpolates the complete `stderrSummary`, which the process runner reads without a byte cap. Project documentation confirms that process failures, timeouts, cancellation, and invalid provider output surface as tool errors with process evidence.

    A provider can therefore return arbitrarily large stderr to the model despite B-005 and ratified INV-005 saying every analysis text response is bounded. The plan must own and bound the thrown-error presentation channel as well as successful/non-ready results; none of the currently named renderer work changes that channel. Weakening the all-text bound would modify ratified INV-005 and requires human escalation.

- id: PR-014
  dimension: state-sync
  severity: medium
  title: "Historical durable attempts cannot recover the in-run retry number"
  plan_refs: D-006, Design §3, Files to Change — `lib/driver/shell-command-finalizer.ts`
  code_refs: lib/driver/drive-scheduler-backend.ts:148-179, lib/driver/drive-scheduler-backend.ts:598-607, lib/driver/shell-command-finalizer.ts:99-105, lib/driver/shell-command-finalizer.ts:151-158
  description: |
    Design §3 says a finalizer that encounters a pre-feature task-output artifact without the new attempt metadata will use “the existing durable attempt record” instead of silently defaulting. That record is not authoritative for this value. `runContradictedAttempts` performs both worker spawns inside one scheduler `runDriveTaskStep`, and every output artifact is keyed by the same `prepared.attemptId`; a prior run that reached in-run attempt 2 can still have only durable scheduler `attempt-001`.

    On resume, the proposed fallback can therefore label a finalization note as attempt 1 even though the worker result came from attempt 2. The plan must identify a durable source that actually distinguishes historical in-run spawns, or specify an explicit unknown/recovery outcome; the existing scheduler attempt record cannot provide the claimed compatibility.

## Round-1 Closure

- PR-001: not closed; the raw append mechanism is now specified, but PR-011 leaves routine Drive status updates able to rewrite the same protected bytes.
- PR-002: closed; every `updateTask` call is assigned a stable task-ID lock with bounded acquisition, including lookup, rename, and write.
- PR-003: closed for completed/status/non-ready result variants; PR-013 is a newly identified unbounded thrown-error channel.
- PR-004: closed for the pre-write original/planned manifest and digest recovery matrix.
- PR-005: not closed; normal timeout/abort settlement is specified, but PR-012 leaves unverified and crash-surviving process trees outside the lock/recovery ownership model.
- PR-006: closed; the revised file list and design name the report/event/finalizer compatibility consumers.
- PR-007: closed; unknown raw output is appended before postflight inference in both Drive paths.
- PR-008: closed for new executions through explicit one-based attempts and persisted metadata; PR-014 is a separate historical rehydration defect.
- PR-009: closed; classification now has a concrete pre-execution runtime signature and keeps completed execution `AnalysisResult`-only.
- PR-010: closed; quality expectations are carried by B-012, risks, and slice evidence rather than a standalone gate section.

## Acceptance and Invariant Check

- AC-001 and INV-001 are not implementation-ready because of PR-011; PR-014 also leaves historical attempt headings unreliable.
- AC-012 and INV-006 are not implementation-ready because of PR-012.
- Ratified INV-005 is not satisfied across every tool-text channel because of PR-013. AC-009’s completed-findings rendering is otherwise covered.
- No additional conflict was found for AC-002 through AC-011 (apart from the items above), AC-013 through AC-020, or INV-002 through INV-004.

## Missing Coverage

- A status-only Drive transition over a task containing CRLF, trailing-space, and boundary-blank-line note bytes is not assigned a source-preserving mechanism or acceptance example.
- Probe recovery does not cover a dead tool host whose child process group remains alive, nor the normal return path after process-tree cleanup cannot be verified.
- Analysis failure tests do not require an oversized provider stderr/tool-error message to respect the 32,768-byte model-text cap.
- Historical graph records with one scheduler attempt but two contradicted-path worker spawns have no authoritative finalizer attempt-number recovery case.

## Coverage Ledger

- dimension: interface-fidelity
  status: checked
  checked: Compared task update/serialization, Drive graph/finalizer, analysis runtime/error, entity-lock, process-runner, and Pi extension boundaries against the revised contracts.
  findings: PR-011, PR-012, PR-013, PR-014
- dimension: duplication
  status: unchecked
  checked: Structural duplication capability is unbound (`provider=fallow`, `reason=execution-not-consented`); no capability evidence was available.
  findings: none
- dimension: state-sync
  status: checked
  checked: Traced task locks, raw-note ownership, probe journal/lock ownership, and scheduler versus in-run attempt identities through restart/finalizer paths.
  findings: PR-011, PR-012, PR-014
- dimension: risk-blast-radius
  status: checked
  checked: Followed failures through task artifacts, Drive finalizers/resume, analysis tool errors, and probe interruption/recovery.
  findings: PR-011, PR-012, PR-013, PR-014
- dimension: user-experience
  status: checked
  checked: Walked blocked/unknown/retry records, recovery-required probe output, analysis failure output, and resumed finalization from coordinator and worker perspectives.
  findings: PR-012, PR-013, PR-014
- dimension: behavior-spec
  status: checked
  checked: Mapped B-001 through B-012 to AC-001 through AC-020 and tested their observable failure/edge outcomes against the design.
  findings: PR-011, PR-012, PR-013
- dimension: architecture-record
  status: unchecked
  checked: The declared `tool-ecosystem` context was read, but configured boundary-conformance evidence is unavailable because Fallow execution was not consented; no dependency violation is asserted.
  findings: none
- dimension: quality-contract
  status: checked
  checked: Confirmed the plan has no standalone gate table and traced quality expectations through behaviors/risks; checked the bounded-text contract across success and error channels.
  findings: PR-013
- dimension: lifecycle-invariant
  status: checked
  checked: Attacked note writes, status transitions, retry/finalizer rehydration, scoped lock exits, stale-owner recovery, and live process-tree cleanup.
  findings: PR-011, PR-012, PR-014
- dimension: constraint-ownership
  status: checked
  checked: Traced load-bearing byte preservation, quiescence, bounded presentation, compatibility, and file ownership into behaviors and implementation stages.
  findings: PR-011, PR-012, PR-013, PR-014
- dimension: scope-size
  status: checked
  checked: The plan has 12 behaviors, at the project guidance limit, and explicit dependency-ordered implementation slices.
  findings: none

## Assessment

The revised plan closes most round-1 defects but is not ready for task creation. The first issue to fix is the source-preservation contract: routine status-only Drive updates must not pass worker notes through the normalizing parser/serializer, or the plan still violates its highest-ranked ratified invariant before the new append path can help.
