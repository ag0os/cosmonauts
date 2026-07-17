# Plan Review: episodic-log

Follow-up review after the plan's PR-001–PR-009 revision.

## Findings

- id: PR-010
  dimension: behavior-spec
  severity: medium
  title: "Plan-local aliases still do not create authoritative AC links"
  plan_refs: plan.md:26-42, Overview acceptance alias table, B-001–B-029 Source fields
  code_refs: missions/plans/episodic-log/spec.md:60-76
  description: |
    The revised plan now acknowledges that `AC-001`–`AC-008` are plan-local aliases, but the authoritative spec still contains eight unlabeled bullets. The canonical behavior spine requires behavior `Source` fields to link to acceptance IDs in the spec; aliases declared only in `plan.md` do not provide that durable spec-to-plan link and can diverge if the authoritative criterion text changes.

    The planner should either add stable IDs to the authoritative acceptance criteria or revise the artifact arrangement so the behavior sources point to actual durable criteria. Merely documenting that the aliases are local does not resolve artifact conformance.

- id: PR-011
  dimension: interface-fidelity
  severity: high
  title: "The exact Drive worker-resolution call does not honor bindings in default projects"
  plan_refs: D-007, Design 5, B-017, B-018, Implementation Order step 7
  code_refs: lib/agents/resolver.ts:208-221, lib/agents/resolver.ts:276-289, lib/runtime.ts:174-201, lib/config/defaults.ts:20-22
  description: |
    The plan prescribes `resolveReference("worker", runtime.domainContext)` and claims it honors project/live bindings. `AgentRegistry.boundReferenceFor()` applies a binding to an unqualified ID only when `domainContext` is present; with the shipped default config, `domainContext` is `undefined`, so resolution falls through to an unbound scan-all match. If the context is `main`, the same call constructs a bound `main/worker` reference and returns not-found before scan fallback. Neither case reliably means the coding-domain worker role, and the first silently ignores a `coding` role binding.

    This makes the frozen actor wrong or absent in ordinary/default-domain and bound-domain projects. The planner must correct the exact requested-role contract and test undefined/default context plus project and live bindings before tasking.

- id: PR-012
  dimension: lifecycle-invariant
  severity: high
  title: "Completion mtime is rewritten after child terminal capture"
  plan_refs: D-009, B-019, Design 5, Risks cross-process terminal race, Implementation Order step 8
  code_refs: lib/driver/drive-graph-runner.ts:126-158, lib/driver/run-step.ts:55-85, domains/shared/extensions/orchestration/driver-tool.ts:456-470, lib/driver/run-state.ts:62-69
  description: |
    D-009 makes completion-file mtime the idempotency key shared by child capture and parent abort reconciliation. Today `runDriveOnGraph()` writes `run.completion.json`, but the detached `run-step` writes the same completion again after the runner returns, and the Pi driver tool writes it yet again when the handle settles. `writeRunCompletion()` always performs an atomic replacement; it has no write-if-unchanged guard, so each write changes mtime even when bytes are identical.

    A child can therefore capture a terminal episode using the first mtime, then a parent abort/reconciliation can observe a later mtime and render a second terminal path for the same attempt. This directly contradicts B-019 and the planned after-normal-terminal fault injection. The plan must account for all completion writers or choose a stable terminal identity that those rewrites cannot change.

- id: PR-013
  dimension: lifecycle-invariant
  severity: medium
  title: "Terminal-only CLI resumes bypass attempt creation and run capture"
  plan_refs: D-007 resume rules, B-017, Design 5, Files to Change CLI Drive entry
  code_refs: cli/drive/subcommand.ts:246-334, tests/cli/drive/graph-resume.test.ts:148-215
  description: |
    The CLI calls `prepareResume()` before `createRunSpec()`, runtime resolution, or `runDriveOnGraph()`. A pending-finalization resume can finish its retry, write and print a completed result, return `false`, and exit without reaching any seam that creates the plan's new `episodeAttemptId` or emits the promised start/terminal pair. The existing graph-resume tests exercise exactly these no-backend terminal-result paths.

    B-017 says resume attempts receive one pair and D-007 says every enabled resume creates a new attempt ID, but its named test is scoped to `runDriveOnGraph()` and cannot prove this earlier CLI exit. The planner should assign lifecycle ownership and executable coverage for terminal-only resume paths.

- id: PR-014
  dimension: interface-fidelity
  severity: medium
  title: "`driver_diagnostic` is persisted but not published to the session bus"
  plan_refs: D-008, B-026, Design 5, Files to Change Drive entries
  code_refs: lib/driver/event-stream.ts:416-443, lib/driver/event-stream.ts:711-725, lib/driver/durable-events.ts:133-136, lib/driver/drive-graph-runner.ts:443-463
  description: |
    B-026 requires an episode warning in the legacy log, normalized storage, and session bus. The durable normalizer already accepts `driver_diagnostic`, but `toBusEvent()` publishes only event types admitted by `BRIDGED_EVENT_TYPES`, and that set omits `driver_diagnostic`. The plan also omits `lib/driver/event-stream.ts` from Files to Change, so implementing only the named runner seam cannot satisfy the bus claim.

    There is a related rejection mismatch: the current `emitDriverDiagnostic()` catches and swallows event-sink failures, so using it as the reporter makes the helper believe reporting succeeded and prevents B-026's stderr fallback. The planner must make the bus and reporter-failure ownership explicit and attach the behavior to tests that observe both.

- id: PR-015
  dimension: lifecycle-invariant
  severity: high
  title: "A normalized retrieved-record digest cannot prove that a file was not human-edited"
  plan_refs: D-004, B-004, Design 1, Design 6, Quality Contract evidence 3
  code_refs: lib/memory/types.ts:33-44, lib/memory/okf.ts:47-113, missions/plans/memory-consolidation/spec.md:42-64
  description: |
    The plan hashes a normalized semantic envelope and exposes `isUnmodifiedMachineEpisode(record)` over `RetrievedMemoryRecord`. The shipped parser demonstrates what that shape loses: unknown frontmatter is discarded and body framing is normalized with `trim()`. A human can add a meaningful custom frontmatter key, a comment, or formatting-only content and still produce the same retrieved envelope and digest. The proposed utility would then return true even though the file was edited.

    That is not merely a wording issue: the consolidation contract permits deletion only of consumed, unedited machine episodes. B-004 tests a content change but does not attack edits outside the normalized fields, so it would certify an unsafe pruning predicate. The planner must reconcile the integrity mechanism with the actual human-edit invariant before exposing it to the sibling plan.

- id: PR-016
  dimension: constraint-ownership
  severity: medium
  title: "Drive-owned task status transitions have no specified episode actor wiring"
  plan_refs: D-006, D-007, B-014, B-017, Design 4, Design 5, Files to Change Drive entries
  code_refs: lib/tasks/task-manager.ts:42-54, domains/shared/extensions/orchestration/driver-tool.ts:221-224, cli/drive/subcommand.ts:252-258, lib/driver/run-step.ts:58-61, lib/driver/drive-scheduler-backend.ts:195-201
  description: |
    D-006 assigns every real task status transition to `TaskManager`, but Design 4 makes its episode context optional. All three Drive construction paths currently create a context-free `TaskManager`, and the scheduler uses that manager for `In Progress`, `Done`, and `Blocked` transitions. Design 5 freezes `episodeSource` for `drive.run` events but never states that the source is passed into these managers or what actor owns driver-finalized task transitions.

    Because the constructor context is optional, existing Drive call sites can remain unchanged without a type error, yielding skipped or fabricated task episodes while B-014's isolated manager test and B-017's run-pair test still pass. The planner should assign the actor and carry this constraint into an executable Drive integration behavior.

## Missing Coverage

- Worker identity resolution with no configured default domain, with `main` as context, and with project/live coding-role bindings.
- Abort reconciliation after the child captured terminal state but later completion writers replaced the file.
- CLI resumes that complete pending finalization without invoking `runDriveOnGraph()`.
- Human edits outside normalized fields, such as extra frontmatter or formatting-only changes, before safe-prune evaluation.
- Live session-bus observation and reporter-rejection fallback for `driver_diagnostic` warnings.
- Task status episodes emitted by inline, detached, and resumed Drive managers using an explicit actor.
- Authoritative `AC-###` identifiers in `spec.md`.

## Assessment

The plan is viable with another revision, but it is not ready for task decomposition. Fix the completion-identity invariant first: the proposed mtime-based exactly-once proof conflicts with the current multiple-writer completion lifecycle.
