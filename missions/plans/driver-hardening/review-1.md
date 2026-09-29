# Plan Review: driver-hardening

## Findings

- id: PR-001
  dimension: lifecycle-invariant
  severity: high
  title: "The append design cannot preserve existing task-note bytes"
  plan_refs: Intent INV-001 (lines 22-24), B-001 (lines 229-234), Design §1 (lines 315-338), Risks (lines 498-500)
  code_refs: lib/tasks/task-parser.ts:34-39, lib/tasks/task-parser.ts:139-165, lib/tasks/task-parser.ts:253-271, lib/tasks/task-serializer.ts:86-115, lib/tasks/task-manager.ts:237-270
  description: |
    AC-001 and ratified INV-001 promise that existing `implementationNotes` survive byte for byte. The proposed mechanism weakens that to “their parsed value is the exact prefix” (plan line 326). The current parser normalizes CRLF to LF and trims section content, and every task update serializes the entire parsed task again. Therefore notes containing CRLF, trailing spaces, leading/trailing blank lines, or other parser-normalized bytes will change before the append is applied even if the string prefix assertion passes.

    This touches ratified ground: the planner cannot silently redefine byte preservation as preservation of the parsed value. The plan must either specify a source-preserving section update and acceptance evidence over raw task-file bytes, or halt and obtain a human decision narrowing AC-001/INV-001.

- id: PR-002
  dimension: state-sync
  severity: high
  title: "The claimed atomic append is not protected by an existing task lock"
  plan_refs: Architecture Context (line 148), D-005 (lines 179-183), Design §1 (lines 317-328)
  code_refs: lib/tasks/task-manager.ts:197-217, lib/tasks/task-manager.ts:228-270, lib/memory/episode-transition-lock.ts:62-81, domains/shared/extensions/orchestration/driver-tool.ts:273-280
  description: |
    The plan says `updateTaskLocked` resolves append “while holding the existing task transition lock.” In reality, `TaskManager.updateTask` uses `withEpisodeTransitionLock`, which immediately executes without a lock when the manager has no episode context or episodic logging is disabled. The shipped Drive path constructs `new TaskManager(ctx.cwd)` without episode context. This project's configuration also does not enable episodic logging. The private method name `updateTaskLocked` does not make the read/parse/write sequence serialized.

    Two processes can consequently read the same note value and each write its own append, losing one worker record. That directly defeats the reason D-005 chose an atomic manager operation. The plan must identify an always-on task-mutation serialization contract (including cross-process callers) rather than relying on the conditional episode-capture lock.

- id: PR-003
  dimension: behavior-spec
  severity: high
  title: "Bounded rendering covers findings only, contrary to ratified INV-005"
  plan_refs: Intent INV-005 and Ranking (lines 37-49), B-005 (lines 257-262), Design §5 (lines 395-409)
  code_refs: domains/shared/extensions/project-tools/index.ts:183-190, domains/shared/extensions/project-tools/index.ts:443-507, lib/analysis/types.ts:283-304, domains/shared/extensions/project-tools/fallow-provider.ts:2684-2717
  description: |
    Ratified INV-005 says “The text a tool returns to the model is bounded in size,” without limiting that promise to findings. B-005 and the renderer design narrow the bound to `kind: "findings"` and explicitly leave traces and fix previews on their existing presentation. Today that presentation JSON-stringifies the complete typed result, and both trace and fix-preview results carry the full native envelope, so either can remain unbounded and repeat `native.payload` into model context.

    AC-009 is narrower than INV-005, but the invariant outranks that mechanism. The planner must carry a bounded-text behavior for every analysis result variant or escalate any proposed narrowing of INV-005 as a human decision; implementing the current design would silently violate ratified ground.

- id: PR-004
  dimension: lifecycle-invariant
  severity: high
  title: "The probe journal has unrecoverable crash windows"
  plan_refs: D-002 (lines 161-165), B-008 (lines 278-283), Design §6 (lines 428-444), Risks (line 504)
  code_refs: domains/shared/extensions/project-tools/index.ts:510-530, domains/shared/extensions/project-tools/index.ts:692-703
  description: |
    The journal protocol says it first records `prepared`, then records each instrumented digest before command execution, and startup restores only when current bytes match a journaled instrumented digest; every non-match is a conflict. In a multi-file probe, a crash after file A is instrumented but before file B is changed leaves file B equal to its original digest, not its instrumented digest, so startup classifies an untouched file as a conflict instead of recovering A. There is also an unspecified window between replacing a file and durably recording its instrumented digest.

    B-008 promises next-initialization recovery, not merely preservation of enough evidence for a human. The plan needs a complete persisted state matrix and write ordering for original/current/instrumented bytes, with an exit for files still at the original digest and no mutation preceding the durable expected-state record.

- id: PR-005
  dimension: risk-blast-radius
  severity: high
  title: "The live-edit probe lacks an exclusive and contained mutation boundary"
  plan_refs: B-008 (lines 278-283), Design §6 (lines 428-445), Risks (lines 504-505), Implementation Order stage 9 (line 531)
  code_refs: domains/shared/extensions/project-tools/index.ts:220-232, lib/driver/runtime-helpers.ts:138-183, domains/shared/extensions/project-tools/process-runner.ts:200-285, domains/shared/extensions/project-tools/process-runner.ts:418-553
  description: |
    The probe will edit live source, but the plan specifies no cross-process/project lock. Two sessions can both pass the clean-file check, instrument overlapping files, and then restore different snapshots. It also promises restoration after timeout or abort without requiring the test process tree to be quiescent first. The ordinary shell runner aborts only the spawned child; this repository's provider runner has substantially more machinery precisely to terminate and verify the whole process tree. A surviving test descendant can continue writing while or after originals are restored.

    The trust boundary is also lexical only: the proposed input has `path` and `line`, while the existing project-path validator does not reject symlinks or establish realpath containment. A tracked symlink can therefore point outside the project. Nor does the input name a language or instrumentation strategy, although a synchronous marker inserted at a statement boundary is language-specific. Because Q-002 ratified live-file editing only with byte-identical restoration and dirty-file refusal, the plan must define exclusive ownership, process-tree settlement, regular-file/realpath checks, and the supported instrumentation contract before this slice is implementable. Narrowing the AC to one language would change ratified AC-012 and requires human disposition.

- id: PR-006
  dimension: interface-fidelity
  severity: high
  title: "The file list omits mandatory blocked/event consumers and names a nonexistent module"
  plan_refs: Design §§2-3 (lines 340-384), Files to Change (lines 468-495), Implementation Order stages 3-4 (lines 519-521)
  code_refs: lib/driver/durable-events.ts:45-56, lib/driver/durable-events.ts:56-155, lib/driver/durable-steps.ts:791-849, lib/driver/event-stream.ts:448-488, lib/driver/event-stream.ts:852-865, lib/driver/shell-command-finalizer.ts:102-180, lib/analysis/binding-resolver.ts:150-224
  description: |
    Adding `task_retry` to `DriverEvent` requires a matching entry in the exhaustive `DRIVER_EVENT_NORMALIZERS ... satisfies Record<DriverEvent["type"], ...>` map; otherwise typecheck fails. Event bus visibility also requires an explicit decision about `BRIDGED_EVENT_TYPES`. Adding `blocked` to `ParsedReport` reaches `durable-steps.ts`, whose projector currently assumes every non-unknown report is a `Report` and passes its outcome to `ReportOutcome`. Carrying local attempt metadata into graph finalization also has a consumer in `shell-command-finalizer.ts`. None of these files appears in the flat file list.

    Conversely, the list names `lib/analysis/request-resolution.ts`, which does not exist; request resolution is implemented in `lib/analysis/binding-resolver.ts`. No test files are listed despite eleven slices assigning red/green evidence. The planner must correct the flat ownership list and the corresponding task boundaries; this is not a `lib/durable-runtime/` change, but it is required to keep graph/legacy parity compiling and observable.

- id: PR-007
  dimension: behavior-spec
  severity: medium
  title: "Unknown-report preservation contradicts itself on inferred success"
  plan_refs: B-001 (lines 229-234), Report matrix (lines 358-368), Implementation Order stage 2 (line 517)
  code_refs: lib/driver/run-one-task.ts:148-178, lib/driver/run-one-task.ts:382-443, lib/driver/drive-scheduler-backend.ts:233-272
  description: |
    B-001 and stage 2 say an unrecognized report appends its complete raw text. The matrix instead says unknown raw text is appended only “On failure.” Existing behavior can infer an unknown report as success when postflight passes (and, under driver commits, committable changes exist), after which the raw report is replaced by a synthetic success report. Implementing the matrix literally therefore leaves an AC-004 path where the raw report never reaches task notes.

    AC-004's letter is ratified. The planner must settle whether unknown raw output is appended before inference on every unknown report and make the behavior, matrix, and both backend paths state the same consequence; narrowing AC-004 to failures would require human approval.

- id: PR-008
  dimension: lifecycle-invariant
  severity: medium
  title: "The first contradicted attempt can still lose its Drive note"
  plan_refs: D-005 (lines 179-183), D-006 (lines 185-189), Design §3 (lines 370-384), Implementation Order stages 2 and 4 (lines 517-521)
  code_refs: lib/driver/runtime-helpers.ts:222-268, lib/driver/drive-scheduler-backend.ts:276-320, lib/driver/run-one-task.ts:602-623
  description: |
    D-005 says every failure/partial addition is appended with its attempt number. The contradicted-path loop currently finalizes attempt 1 with `skipTaskUpdate: true`, and both backend finalizers interpret that as skipping the entire task update, not merely the status transition. The plan adds attempt metadata and a retry event but never specifies that attempt 1's structured note must still append while its terminal status write is suppressed.

    As written, a worker can implement the new append inside the existing `if (!skipTaskUpdate)` branch and preserve only attempt 2, violating D-005 and AC-001 for the recorded first failure. The plan must separate “do not transition status because retry follows” from “persist this attempt's Drive record,” and include that ordering in parity evidence.

- id: PR-009
  dimension: interface-fidelity
  severity: medium
  title: "Provider-side unsupported-target has no defined return contract"
  plan_refs: D-009 (lines 203-207), Design §5 (lines 411-426), Files to Change (lines 481-484), Implementation Order stage 8 (line 529)
  code_refs: lib/analysis/types.ts:283-304, lib/analysis/types.ts:430-492, lib/analysis/binding-resolver.ts:199-224, domains/shared/extensions/project-tools/fallow-provider.ts:2773-2819, domains/shared/extensions/project-tools/index.ts:479-503
  description: |
    `unsupported-target` is currently an `AnalysisRequestResolution` produced before provider IO, while the Fallow runtime's `execute` path returns only `AnalysisResult` (`findings | trace | fix-preview`). The plan moves a new export-surface classification into the provider runtime after request resolution and says it returns `unsupported-target`, but it does not define whether provider execution is widened to return a resolution, whether classification moves before `runtime.execute`, or how the project-tools adapter discriminates the two.

    The nonexistent `request-resolution.ts` file compounds the ambiguity. A shared signature is required before this slice is delegated; otherwise the provider and presentation changes can compile against incompatible unions or resort to casts. The safe live probe performed during review confirmed the external contract the design is adapting: Fallow 2.54.2 returned exit 2 with an error envelope for a non-exported `FILE:EXPORT`, and exit 0 with trace JSON for an exported symbol.

- id: PR-010
  dimension: quality-contract
  severity: low
  title: "The plan declares a separate quality contract"
  plan_refs: Design §9 (lines 460-466)
  code_refs: /Users/cosmos/Projects/cosmonauts/domains/shared/skills/work-artifacts/references/plan-format.md:76-78, /Users/cosmos/Projects/cosmonauts/domains/shared/skills/work-artifacts/references/gate-contracts.md:31-33
  description: |
    Canonical plan format requires work-specific quality expectations to live in behaviors or named risks and says plans do not declare quality gates. The dedicated “Quality contract (abstract kinds)” section separately prescribes static, structural, integration, and change-integrity checks. Even without command names, this is the exact parallel quality list the artifact contract says downstream does not carry reliably.

    Move each work-specific expectation into the owning behavior or risk and leave runtime gate resolution to sign-off. This is an artifact-shape correction, not a change to AC-019 or AC-020.

## Missing Coverage

- Raw task-file fixtures with CRLF, trailing spaces, and leading/trailing blank lines are not included in the note-preservation evidence; a parsed-string prefix test cannot prove AC-001.
- Concurrent task-note appends from separate `TaskManager` instances/processes are not covered.
- The report matrix does not cover the unknown-report-plus-passing-postflight inferred-success branch.
- Contradicted retry evidence does not explicitly require attempt 1's Drive note before the retry event and attempt 2 note.
- Probe recovery lacks crash points before the first edit, between each journal/edit operation, between files, during command termination, and during each restore.
- Probe coverage does not define simultaneous probes, tracked symlinks, non-regular files, realpath escape, supported source languages, or descendants that survive shell abort.
- Durable normalization and bus behavior for `task_retry`, plus blocked-report compatibility projection, are absent from the implementation ownership list.
- The trace behavior lacks a shared provider-execution/result union for the new post-resolution `unsupported-target` outcome.
- The flat file list contains no test ownership despite the required per-slice red/green evidence.
- AC-019's real inline acceptance is operationally feasible with explicit `taskIds`, `backend: "cosmonauts-subagent"`, `mode: "inline"`, and `commitPolicy: "no-commit"`; the plan correctly treats unavailable/nondeterministic model access as a stop. It should additionally state cleanup/evidence retention when the live run starts but fails before acceptance completes.

## Coverage Ledger

- dimension: interface-fidelity
  status: checked
  checked: Compared report/event consumers, graph finalizer handoff, analysis resolution/result unions, Pi `tool_call` support, backend/mode validation, and Fallow 2.54.2 flags/output. Safe probes ran only the package-owned native binary in synthetic temporary directories: `health`/`dupes` expose no per-file flag, `dead-code` exposes the claimed trace flags, non-export trace exits 2 with an error envelope, and exported trace exits 0 with JSON.
  findings: PR-006, PR-009

- dimension: duplication
  status: unchecked
  checked: Structural duplication capability was unbound with reason `execution-not-consented`; existing task, Driver, analysis, and process-runner paths were read manually, but no complete duplication claim is made.
  findings: none

- dimension: state-sync
  status: checked
  checked: Traced task read/parse/write locking, contradicted retry persistence, graph finalizer metadata, and probe journal/concurrency ownership.
  findings: PR-002, PR-004, PR-005, PR-008

- dimension: risk-blast-radius
  status: checked
  checked: Walked graph-backed and legacy Drive outcomes, durable compatibility consumers, analysis context exposure, probe abort/crash behavior, session-scoped Git guard, and real acceptance launch requirements. No `lib/durable-runtime/` source change is required by the reviewed design; required durable compatibility changes are in `lib/driver/`.
  findings: PR-003, PR-004, PR-005, PR-006

- dimension: user-experience
  status: checked
  checked: Walked coordinator task-note recovery, worker blocked/retry flow, analysis result consumption, probe refusal/recovery, print-mode launch text, and wrong backend/mode errors.
  findings: PR-001, PR-003, PR-007

- dimension: behavior-spec
  status: checked
  checked: Mapped AC-001 through AC-020 to B-001 through B-012 and checked observers, shipped entry points, outcomes, failure paths, prompt prose review, and AC-019 live acceptance feasibility.
  findings: PR-003, PR-007

- dimension: architecture-record
  status: unchecked
  checked: Read `missions/architecture/tool-ecosystem.md`, the named analysis docs, and relevant code boundaries. Boundary-conformance capability was unbound with reason `execution-not-consented`, so full conformance to dependency rules could not be established.
  findings: none

- dimension: quality-contract
  status: checked
  checked: Compared the plan's dedicated quality section and AC-019/AC-020 behavior against the canonical gate contract.
  findings: PR-010

- dimension: lifecycle-invariant
  status: checked
  checked: Attacked note-byte invariants, blocked/unknown/retry exits, graph finalization rehydration, probe journal states, abort settlement, and stale recovery.
  findings: PR-001, PR-004, PR-008

- dimension: constraint-ownership
  status: checked
  checked: Traced load-bearing design constraints and every Files-to-Change entry to behavior/task ownership; verified file existence and mandatory consumers.
  findings: PR-006, PR-009

- dimension: scope-size
  status: checked
  checked: The plan has 12 behaviors and 11 candidate implementation tasks, within the stated guidance. Stage 9 is large, but its principal problem is missing safety contracts captured above rather than count alone.
  findings: none

## Assessment

The plan is viable only after substantial revision; it does not require changing `lib/durable-runtime/`, but several mandatory consumers under `lib/driver/` are missing. The first issue to resolve is the task-note contract: the current parsed read/serialize write path and conditional episode lock cannot deliver ratified byte preservation or atomic append, so later Drive evidence would not be trustworthy.
