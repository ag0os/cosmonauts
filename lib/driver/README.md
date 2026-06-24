# Driver

`lib/driver/` runs mission tasks through a backend adapter. The public CLI
frontend is `cosmonauts run drive`; successful starts return a `runId` and write
run state under `missions/sessions/<scope>/runs/<runId>/`. In detached mode, the
launcher returning only means background Drive work was started; it is not run
completion. Poll with `cosmonauts run status <runId>`. The driver owns task
selection, prompt rendering, verification, event logging, locking, and commit
policy. Backends only execute the rendered prompt and report the subprocess
result.

## Prompt Rendering

For each queued work item (currently a task ID), Drive writes
`prompts/<task-id>.md` in the run workdir by concatenating the configured
envelope, optional precondition, generated run expectations, serialized
work-item context, optional per-item override, optional retry note, and a
mandatory Drive report contract. The generated expectations describe the
backend, branch, commit policy, preflight commands, and postflight commands for
the concrete run. The report contract is injected by code after custom envelope
content so backends always receive the machine-readable outcome instructions
Drive needs for parsing.

## Backend Contract

Backends implement `Backend` from `lib/driver/backends/types.ts`:

```ts
export interface Backend {
	readonly name: string;
	readonly capabilities: BackendCapabilities;
	livenessCheck?(): { argv: string[]; expectExitZero: boolean };
	run(invocation: BackendInvocation): Promise<BackendRunResult>;
}
```

Required fields:

- `name`: stable backend ID used in run specs and logs.
- `capabilities`: declares whether the backend can commit and whether it runs
  isolated from the host source checkout.
- `run(invocation)`: executes one rendered task prompt and returns exit code,
  stdout, and elapsed milliseconds.

Optional fields:

- `livenessCheck()`: returns a command the driver or caller can run before a
  detached job starts, usually `<binary> --version`.

## Report Parsing

The driver treats the backend process exit code as transport status, not task
success. Task success comes from a fenced JSON report or an `OUTCOME:` line in
backend stdout; a bare `outcome:` line is accepted as a tolerant fallback.
`completed` is accepted as an alias for `success` in those structured markers.
If the backend emits only prose, Drive keeps blocking by
default; it infers success only when postflight commands were configured and all
passed. With `driver-commits`, the driver also requires committable source
changes before making that inference.

## Task Timeouts

Each task backend invocation has a wall-clock timeout. The default is 1800000ms
(30 minutes). Very long E2E suites or external CLI backends that need more time
to iterate on failures should set `taskTimeoutMs` / `--task-timeout` explicitly,
for example 3600000ms (60 minutes).

## Adapter Authoring Guide

1. Add `lib/driver/backends/<name>.ts`.
2. Export a `create<Name>Backend()` factory returning `Backend`.
3. Keep dependencies injectable, especially CLI binary names.
4. Set `name` to the backend ID users pass in driver specs.
5. Set `canCommit` to `true` only if the backend may create commits itself.
6. Set `isolatedFromHostSource` to `true` for external CLI agents.
7. Implement `livenessCheck()` when the backend depends on a local binary.
8. In `run()`, use `invocation.projectRoot` as the subprocess `cwd`; write backend artifacts under `invocation.workdir`.
9. Feed the rendered prompt from `invocation.promptPath`.
10. Pass `invocation.signal` to the subprocess if supported.
11. Capture stdout; stderr can be captured for diagnostics if needed.
12. Return the process exit code without reclassifying task success.
13. Return the text the report parser should inspect as `stdout`.
14. Return `durationMs` from wall-clock elapsed time.
15. Do not update task files from the backend.
16. Do not write driver events unless the backend exposes useful activity.
17. Do not perform post-verification; the driver owns it.
18. Register detached-capable adapters in `backends/registry.ts`.
19. Add tests under `tests/driver/backends/`.
20. Test binary override behavior when the adapter accepts a binary option.

Minimal backend:

```ts
import type { Backend } from "./types.ts";

interface BunSubprocess {
	readonly exited: Promise<number>;
	readonly stdout: ConstructorParameters<typeof Response>[0];
}

declare const Bun: {
	file(path: string): unknown;
	spawn(
		argv: string[],
		options: { cwd: string; stdin: unknown; stdout: "pipe"; signal?: AbortSignal },
	): BunSubprocess;
};

export function createExampleBackend(binary = "example-agent"): Backend {
	return {
		name: "example",
		capabilities: { canCommit: false, isolatedFromHostSource: true },
		livenessCheck: () => ({ argv: [binary, "--version"], expectExitZero: true }),
		async run(invocation) {
			const start = Date.now();
			const child = Bun.spawn([binary, "run", "-"], {
				cwd: invocation.projectRoot,
				stdin: Bun.file(invocation.promptPath),
				stdout: "pipe",
				signal: invocation.signal,
			});
			const stdoutPromise = new Response(child.stdout).text();
			const exitCode = await child.exited;
			return {
				exitCode,
				stdout: await stdoutPromise,
				durationMs: Date.now() - start,
			};
		},
	};
}
```

## Backend Status

Supported external backends:

- `codex`: runs `codex --yolo exec ...` against the rendered prompt by default. This gives Drive's external backend the network, socket, and filesystem freedom implementation work usually needs. Set `COSMONAUTS_DRIVER_CODEX_YOLO=0` to opt back into sandboxed `codex exec --full-auto`. For lower-level pass-through, set `COSMONAUTS_DRIVER_CODEX_ARGS` for top-level Codex args before `exec` (for example `--profile drive`) and `COSMONAUTS_DRIVER_CODEX_EXEC_ARGS` for exec args after `exec` (for example `["--sandbox","danger-full-access"]`).
- `claude-cli`: runs `claude --dangerously-skip-permissions -p` against the rendered prompt by default. Set `COSMONAUTS_DRIVER_CLAUDE_SKIP_PERMISSIONS=0` to opt out, or use `COSMONAUTS_DRIVER_CLAUDE_ARGS` for lower-level pass-through before `-p` (for example `--permission-mode bypassPermissions`).

Backend arg env vars accept either shell-style words (`--profile drive --flag`) or a JSON string array (`["--profile","drive"]`). JSON arrays are safer for arguments that include spaces or shell-sensitive characters.

Excluded or future backends:

- `gemini-cli`: future adapter candidate.
- `qwen`: future adapter candidate.
- Generic shell: intentionally excluded until command shape, reporting, and
  safety boundaries are explicit.

`cosmonauts-subagent` is an internal inline backend used by the orchestration
extension. It is not supported for detached driver runs.

## Run State Files

Every CLI inline run prepares the run workdir with `spec.json`,
`task-queue.txt`, and `run.inline.json`. Detached runs prepare a frozen runner
and write `run.pid`. Terminal results are recorded atomically in
`run.completion.json`.

A run can also end as `finalization_failed` after the backend work and required
verification passed but Drive could not finish a commit, task status update, or
final task-state commit. Drive writes `pending-finalization.json` in the run
workdir with the failed phase and recovery evidence, then reports the terminal
failure through deprecated `watch_events` compatibility plus
`cosmonauts run watch`, `cosmonauts run status`, and `cosmonauts run list`.
This is different from behavioral blocked tasks: `blocked` means implementation
or verification needs remediation, while `finalization_failed` means verified
work needs Drive finalization recovery.

Resume is the recovery path. `cosmonauts run drive --plan <slug> --resume <runId>` checks
`pending-finalization.json` before starting backend work and retries the pending
commit/status/state step first. If an operator already completed the missing
commit outside Drive, resume may accept safe external evidence instead of
rerunning the backend: source-commit recovery requires the recorded
pre-finalization HEAD and a current changed HEAD with no remaining committable
source changes; state-commit recovery also requires the current task files for
all pending task IDs to exist and be `Done`. Without that evidence, Drive leaves
pending finalization in place and reports `finalization_failed` again.

`cosmonauts run status` and `cosmonauts run list` classify a run directory in this
order:

1. `run.completion.json`: terminal result (`completed`, `blocked`,
   `finalization_failed`, or `aborted`).
2. `run.pid`: detached process state (`running`, `dead`, or `orphaned`).
3. `run.inline.json`: inline process state (`running`, `dead`, or `orphaned`).

Operators should route `cosmonauts run watch` / `cosmonauts run status` / `cosmonauts run list` output by status: fix code or
verification for `blocked`; run resume for `finalization_failed`; inspect and
resume `dead` or `orphaned` runs only after deciding whether the worktree is
safe. Resumed inline runs reuse the previous workdir, so preparation removes any
stale `run.completion.json` before writing a fresh `run.inline.json`.

## Durable Runtime Compatibility

Drive remains the owner of legacy run behavior. The legacy `events.jsonl`
stream is still the source for deprecated `watch_events` compatibility and
resume compatibility, while `cosmonauts run status` and `cosmonauts run list` continue to classify runs from
`run.completion.json`, `run.pid`, and `run.inline.json`. Normalized runtime
files do not make a run listable or change status classification.

Phase-1 durable runtime support dual-writes normalized orchestration events
beside the legacy stream. Drive creates or adopts a normalized `run.json` in
the run workdir and writes normalized envelopes to
`orchestration-events.jsonl`; `RunRecord.eventsPath` points at that sidecar.
The root `events.jsonl` filename is reserved for legacy `DriverEvent` records
in Drive run directories for this compatibility phase.

Normalized events use the canonical durable-runtime event contracts. Drive-only
backend reports, commit evidence, preflight details, and finalization details
are preserved as activity or artifact evidence around terminal events rather
than extending terminal `step_blocked`, `step_failed`, or `run_failed` variants
with Drive-specific fields. Advisory legacy events that have no canonical
normalized run-level variant remain legacy-only instead of fabricating backend,
step, or terminal data.

The normalized sink is failure-isolated. Drive writes and publishes the legacy
event first; normalized run-record setup is lazy, and setup or append failures
are reported as diagnostics without throwing `EventLogWriteError`, blocking the
task, aborting the run, or changing finalization recovery. Resume also keeps
reading legacy events for completed/blocked task slicing and pending
finalization recovery, while any new resume events are dual-written when the
normalized sink is available.

The durable observation helpers are read-only. `run_status` and `run_watch`
read normalized runtime data through `RunRecord.eventsPath`; `run_watch` pages
by normalized event sequence cursor and reports malformed normalized JSONL
lines as diagnostics. Prefer them for new observation paths. They do not
silently replace existing `watch_events` cursors because `watch_events` keeps
legacy Drive event shape and line-count cursor semantics. This phase adds no
scheduler ownership, backend adapter migration, or mutating run controls.

Plan-2 durable step support is a backend wrapper around Drive's existing run
loop, not a replacement scheduler. Drive still selects tasks, renders prompts,
invokes the configured backend adapter, parses reports, verifies, commits, and
writes the legacy event stream first. The durable sink then projects those
legacy `DriverEvent` records into a normalized run sidecar and into step records
under the same run workdir. Step projection failures are diagnostics only:
legacy event writes and normalized event writes remain authoritative for the
run.

The authoritative backend identity for durable Drive task steps is the
configured `DriverRunSpec.backendName`, also stored in `RunRecord.policy` and
metadata as `configuredBackendName`. Backend telemetry events may report the
adapter that actually emitted the event; if that observed name differs from the
configured name, Drive appends a `drive_backend_identity_mismatch` diagnostic
but keeps the step record backend set to the configured backend.

Drive task steps use the task ID as the durable step ID and are written below
`steps/<task-id>/step.json`. Attempts are append-like records under
`steps/<task-id>/attempts/attempt-NNN/`, with `attempt.json`, optional
`output.md`, and `result.json` when a result exists. Task step input artifacts
point at `missions/tasks/<task-id>.md` and `prompts/<task-id>.md`; report
artifacts point at `steps/<task-id>/attempts/<attempt-id>/result.json`.
Dependencies preserve the original queued task order from
`RunRecord.metadata.driveTaskIds`, falling back to the active task slice with a
diagnostic when that metadata is unavailable.

D-006 malformed backend reports are represented as completed durable attempts
with result outcome `unknown`, summary `Drive backend report was not
machine-readable.`, and `nextAction: "wait_for_human"`. This is the one
intentional correction normalized task completion receives from step
projection: when the legacy task still reaches `task_done`, the normalized
`step_completed` event carries the projected `unknown` result instead of
inventing success. `run_watch` and `run_status` summarize from the normalized
events at `RunRecord.eventsPath`; `watch_events`, `cosmonauts run status`, and
`cosmonauts run list` continue to read only legacy `events.jsonl` and legacy run-state
sentinels, so step records do not add fields or change those surfaces.

Drive finalization phases are modeled as generic durable finalizer steps. Source
commit finalizers use `finalizer-source-commit-<task-id>`, task status
finalizers use `finalizer-task-status-<task-id>`, and the final task-state
commit uses `finalizer-state-commit`. Finalizer steps use backend
`shell-command` with `options.drivePhase`, depend on the task step for per-task
finalizers and all queued task steps for the final state commit, and write the
same attempt layout as task steps. A failed finalizer records a failed result
with `nextAction: "retry"` and a `pending-finalization.json` artifact; resume
retries the pending finalization before backend work and appends a new attempt
unless the latest failed attempt is already the retry evidence for that failure.

Finalization has one normalized-event compatibility exception: because existing
normalized observers already route terminal finalization failures through run
and step terminal events, Drive still normalizes `task_finalization_failed` to
`step_failed` plus finalization activity, and `run_finalization_failed` to
`run_failed` plus finalization activity when task context exists. Missing task
context is preserved as a diagnostic rather than fabricating a step ID.

## Commit and Finalization Policies

With `commitPolicy=driver-commits`, Drive owns source commits after verification
and defaults `stateCommitPolicy` to `final-state-commit`. That final state
commit stages only Drive-owned task status updates for this run under
`missions/tasks/` after all queued tasks have successfully finalized. With
`backend-commits` or `no-commit`, the default `stateCommitPolicy` is `none`.
Callers may set `stateCommitPolicy` explicitly to `final-state-commit` or
`none` when they need a different task-state persistence boundary.

The final state commit is bounded task-state persistence. It is not archive,
memory, push, PR, or automatic plan lifecycle automation, and Drive does not
mark a plan completed. When all tasks for a `plan:<slug>` are `Done`, Drive may
emit `plan_completion_candidate` so an operator can decide the plan lifecycle
step manually.

Verification-only work can complete without source changes. For a successful
`driver-commits` task with no source changes to commit, Drive emits explicit
no-source-change finalization evidence instead of inventing an empty commit;
operators should treat that as expected for verification-only tasks and route
any later failure to task status or state-commit recovery rather than source
remediation.

## Detached Runner Binary

Detached runs execute `bin/cosmonauts-drive-step` from the run workdir. At run
startup, `startDetached` first copies a prebuilt runner from
`<cosmonautsRoot>/bin/cosmonauts-drive-step` when it exists. If no prebuilt
runner is present, it falls back to compiling `lib/driver/run-step.ts` into the
run workdir with `bun build --compile`.

`compile:drive-step` builds the optional prebuilt runner at
`bin/cosmonauts-drive-step`. Run workdirs still receive their own immutable copy
so detached runs survive later source or package changes.
