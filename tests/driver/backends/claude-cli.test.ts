import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
	createClaudeCliBackend,
	readClaudeArgsFromEnv,
} from "../../../lib/driver/backends/claude-cli.ts";
import type { BackendInvocation } from "../../../lib/driver/backends/types.ts";
import type { EventSink } from "../../../lib/driver/types.ts";

interface SpawnOptions {
	cwd: string;
	stdin: unknown;
	stdout: "pipe";
	stderr: "pipe";
	signal?: AbortSignal;
}

interface MockChild {
	exited: Promise<number>;
	stdout: ConstructorParameters<typeof Response>[0];
	stderr: ConstructorParameters<typeof Response>[0];
}

interface BunMock {
	file: ReturnType<typeof vi.fn<(path: string) => unknown>>;
	spawn: ReturnType<
		typeof vi.fn<(argv: string[], options: SpawnOptions) => MockChild>
	>;
}

let tempDir: string | undefined;

async function createTempDir(): Promise<string> {
	tempDir = await mkdtemp(join(tmpdir(), "claude-cli-backend-"));
	return tempDir;
}

async function createPromptFile(
	content = "Implement TASK-268.",
): Promise<string> {
	const dir = tempDir ?? (await createTempDir());
	const promptPath = join(dir, "prompt.md");
	await writeFile(promptPath, content, "utf-8");
	return promptPath;
}

function createInvocation(
	promptPath: string,
	overrides: Partial<BackendInvocation> = {},
): BackendInvocation {
	const eventSink: EventSink = async () => {};
	return {
		runId: "run-1",
		promptPath,
		workdir: "/tmp/claude-cli-backend-workdir",
		projectRoot: "/tmp/claude-cli-backend-project-root",
		taskId: "TASK-268",
		parentSessionId: "parent-session-1",
		planSlug: "external-backends-and-cli",
		eventSink,
		...overrides,
	};
}

function createChild({
	exitCode = 0,
	stdout = "",
	stderr = "",
}: {
	exitCode?: number;
	stdout?: string;
	stderr?: string;
} = {}): MockChild {
	return {
		exited: Promise.resolve(exitCode),
		stdout,
		stderr,
	};
}

function stubBun(child: MockChild): BunMock {
	const promptFile = { kind: "bun-file" };
	const bun: BunMock = {
		file: vi.fn((_path: string) => promptFile),
		spawn: vi.fn((_argv: string[], _options: SpawnOptions) => child),
	};
	vi.stubGlobal("Bun", bun);
	return bun;
}

function firstSpawnCall(bun: BunMock): {
	argv: string[];
	options: SpawnOptions;
} {
	const call = bun.spawn.mock.calls[0];
	expect(call).toBeDefined();
	return { argv: call?.[0] ?? [], options: call?.[1] as SpawnOptions };
}

afterEach(async () => {
	vi.unstubAllGlobals();
	if (tempDir) {
		await rm(tempDir, { recursive: true, force: true });
		tempDir = undefined;
	}
});

describe("claude-cli backend", () => {
	test("exports an isolated committing Backend", () => {
		const backend = createClaudeCliBackend();

		expect(backend.name).toBe("claude-cli");
		expect(backend.capabilities).toEqual({
			canCommit: true,
			isolatedFromHostSource: true,
		});
		expect(backend.run).toEqual(expect.any(Function));
	});

	test("livenessCheck uses the default and overridden binary", () => {
		expect(createClaudeCliBackend().livenessCheck?.()).toEqual({
			argv: ["claude", "--version"],
			expectExitZero: true,
		});
		expect(
			createClaudeCliBackend({ binary: "claude-dev" }).livenessCheck?.(),
		).toEqual({
			argv: ["claude-dev", "--version"],
			expectExitZero: true,
		});
	});

	test("run spawns claude -p with argv array, prompt file stdin, pipes, cwd, and signal", async () => {
		const workdir = await createTempDir();
		const promptPath = await createPromptFile("Task prompt");
		const child = createChild({
			stdout: "OUTCOME: success\n",
			stderr: "debug",
		});
		const bun = stubBun(child);
		const signal = new AbortController().signal;
		const backend = createClaudeCliBackend({ binary: "claude-dev" });

		const result = await backend.run(
			createInvocation(promptPath, {
				workdir,
				projectRoot: "/tmp/claude-cli-backend-project-root",
				signal,
			}),
		);

		expect(bun.file).toHaveBeenCalledWith(promptPath);
		expect(bun.spawn).toHaveBeenCalledTimes(1);
		const { argv, options } = firstSpawnCall(bun);
		expect(Array.isArray(argv)).toBe(true);
		expect(argv).toEqual(["claude-dev", "-p"]);
		expect(options).toEqual({
			cwd: "/tmp/claude-cli-backend-project-root",
			stdin: bun.file.mock.results[0]?.value,
			stdout: "pipe",
			stderr: "pipe",
			signal,
		});
		expect(result).toMatchObject({ exitCode: 0, stdout: "OUTCOME: success\n" });
		expect(result.durationMs).toEqual(expect.any(Number));
	});

	test("run includes configured args before print mode", async () => {
		const workdir = await createTempDir();
		const promptPath = await createPromptFile("Task prompt");
		const child = createChild({ stdout: "OUTCOME: success\n" });
		const bun = stubBun(child);
		const backend = createClaudeCliBackend({
			binary: "claude-dev",
			args: ["--dangerously-skip-permissions"],
		});

		await backend.run(createInvocation(promptPath, { workdir }));

		const { argv } = firstSpawnCall(bun);
		expect(argv).toEqual([
			"claude-dev",
			"--dangerously-skip-permissions",
			"-p",
		]);
	});

	test("reads Claude permission args from environment", () => {
		expect(
			readClaudeArgsFromEnv({
				COSMONAUTS_DRIVER_CLAUDE_SKIP_PERMISSIONS: "1",
				COSMONAUTS_DRIVER_CLAUDE_ARGS: "--permission-mode bypassPermissions",
			}),
		).toEqual([
			"--dangerously-skip-permissions",
			"--permission-mode",
			"bypassPermissions",
		]);
	});

	test("run returns nonzero child exit codes without throwing", async () => {
		const workdir = await createTempDir();
		const promptPath = await createPromptFile();
		const child = createChild({
			exitCode: 7,
			stdout: "OUTCOME: failure\n",
			stderr: "failed",
		});
		stubBun(child);
		const backend = createClaudeCliBackend();

		const result = await backend.run(createInvocation(promptPath, { workdir }));

		expect(result).toMatchObject({ exitCode: 7, stdout: "OUTCOME: failure\n" });
	});

	test("run forwards abort signals to the child process", async () => {
		const workdir = await createTempDir();
		const promptPath = await createPromptFile();
		const controller = new AbortController();
		let exitWithCode: ((code: number) => void) | undefined;
		let observedAbort = false;
		const child: MockChild = {
			exited: new Promise((resolve) => {
				exitWithCode = resolve;
			}),
			stdout: "",
			stderr: "",
		};
		const bun: BunMock = {
			file: vi.fn((_path: string) => ({ kind: "bun-file" })),
			spawn: vi.fn((_argv: string[], options: SpawnOptions) => {
				options.signal?.addEventListener(
					"abort",
					() => {
						observedAbort = true;
						exitWithCode?.(143);
					},
					{ once: true },
				);
				return child;
			}),
		};
		vi.stubGlobal("Bun", bun);
		const backend = createClaudeCliBackend();

		const resultPromise = backend.run(
			createInvocation(promptPath, { workdir, signal: controller.signal }),
		);
		controller.abort();
		const result = await resultPromise;

		expect(observedAbort).toBe(true);
		expect(result.exitCode).toBe(143);
	});
});
