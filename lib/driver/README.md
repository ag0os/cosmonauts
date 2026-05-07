# Driver

`lib/driver/` runs mission tasks through a backend adapter. The driver owns task
selection, prompt rendering, verification, event logging, locking, and commit
policy. Backends only execute the rendered prompt and report the subprocess
result.

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

## Adapter Authoring Guide

1. Add `lib/driver/backends/<name>.ts`.
2. Export a `create<Name>Backend()` factory returning `Backend`.
3. Keep dependencies injectable, especially CLI binary names.
4. Set `name` to the backend ID users pass in driver specs.
5. Set `canCommit` to `true` only if the backend may create commits itself.
6. Set `isolatedFromHostSource` to `true` for external CLI agents.
7. Implement `livenessCheck()` when the backend depends on a local binary.
8. In `run()`, use `invocation.workdir` as the subprocess `cwd`.
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
				cwd: invocation.workdir,
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

- `codex`: runs `codex exec --full-auto` against the rendered prompt.
- `claude-cli`: runs `claude -p` against the rendered prompt.

Excluded or future backends:

- `gemini-cli`: future adapter candidate.
- `qwen`: future adapter candidate.
- Generic shell: intentionally excluded until command shape, reporting, and
  safety boundaries are explicit.

`cosmonauts-subagent` is an internal inline backend used by the orchestration
extension. It is not supported for detached driver runs.

## Detached Runner Binary

Detached runs execute `bin/cosmonauts-drive-step` from the run workdir. At run
startup, `startDetached` first copies a prebuilt runner from
`<cosmonautsRoot>/bin/cosmonauts-drive-step` when it exists. If no prebuilt
runner is present, it falls back to compiling `lib/driver/run-step.ts` into the
run workdir with `bun build --compile`.

`compile:drive-step` builds the optional prebuilt runner at
`bin/cosmonauts-drive-step`. Run workdirs still receive their own immutable copy
so detached runs survive later source or package changes.
