# Driver

`lib/driver/` runs mission tasks through a backend adapter. The driver owns task
selection, prompt rendering, verification, event logging, locking, and commit
policy. Backends only execute the rendered prompt and report the subprocess
result.

## Prompt Rendering

For each task, Drive writes `prompts/<task-id>.md` in the run workdir by
concatenating the configured envelope, optional precondition, serialized task,
optional per-task override, optional retry note, and a mandatory Drive report
contract. The report contract is injected by code after custom envelope content
so backends always receive the machine-readable outcome instructions Drive needs
for parsing.

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

- `codex`: runs `codex exec --full-auto` against the rendered prompt by default. This keeps Codex's command sandbox enabled, which can block dev-server sockets (`listen EPERM`) and cold build-time network fetches (for example `next/font`). To opt into Codex YOLO mode for externally sandboxed runs, set `COSMONAUTS_DRIVER_CODEX_YOLO=1`; the adapter then runs `codex --yolo exec ...` without `--full-auto`. For lower-level pass-through, set `COSMONAUTS_DRIVER_CODEX_ARGS` for top-level Codex args before `exec` (for example `--yolo`) and `COSMONAUTS_DRIVER_CODEX_EXEC_ARGS` for exec args after `exec` (for example `["--sandbox","danger-full-access"]`).
- `claude-cli`: runs `claude -p` against the rendered prompt by default. It does not bypass permissions unless requested. Set `COSMONAUTS_DRIVER_CLAUDE_SKIP_PERMISSIONS=1` to run `claude --dangerously-skip-permissions -p`, or use `COSMONAUTS_DRIVER_CLAUDE_ARGS` for lower-level pass-through before `-p` (for example `--permission-mode bypassPermissions`).

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

`cosmonauts drive status` and `drive list` classify a run directory in this
order:

1. `run.completion.json`: terminal result (`completed`, `blocked`, or
   `aborted`).
2. `run.pid`: detached process state (`running`, `dead`, or `orphaned`).
3. `run.inline.json`: inline process state (`running`, `dead`, or `orphaned`).

Resumed inline runs reuse the previous workdir, so preparation removes any
stale `run.completion.json` before writing a fresh `run.inline.json`.

## Detached Runner Binary

Detached runs execute `bin/cosmonauts-drive-step` from the run workdir. At run
startup, `startDetached` first copies a prebuilt runner from
`<cosmonautsRoot>/bin/cosmonauts-drive-step` when it exists. If no prebuilt
runner is present, it falls back to compiling `lib/driver/run-step.ts` into the
run workdir with `bun build --compile`.

`compile:drive-step` builds the optional prebuilt runner at
`bin/cosmonauts-drive-step`. Run workdirs still receive their own immutable copy
so detached runs survive later source or package changes.
