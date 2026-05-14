import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
	createCodexBackend,
	parseCodexExecArgs,
	readCodexArgsFromEnv,
	readCodexExecArgsFromEnv,
} from "../../../lib/driver/backends/codex.ts";
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
	tempDir = await mkdtemp(join(tmpdir(), "codex-backend-"));
	return tempDir;
}

async function createPromptFile(
	content = "Implement TASK-267.",
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
		workdir: "/tmp/codex-backend-workdir",
		projectRoot: "/tmp/codex-backend-project-root",
		taskId: "TASK-267",
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

describe("codex backend", () => {
	test("exports an isolated non-committing Backend", () => {
		const backend = createCodexBackend();

		expect(backend.name).toBe("codex");
		expect(backend.capabilities).toEqual({
			canCommit: false,
			isolatedFromHostSource: true,
		});
		expect(backend.run).toEqual(expect.any(Function));
	});

	test("livenessCheck uses the default and overridden binary", () => {
		expect(createCodexBackend().livenessCheck?.()).toEqual({
			argv: ["codex", "--version"],
			expectExitZero: true,
		});
		expect(
			createCodexBackend({ binary: "codex-nightly" }).livenessCheck?.(),
		).toEqual({
			argv: ["codex-nightly", "--version"],
			expectExitZero: true,
		});
	});

	test("run spawns codex exec with argv array, prompt file stdin, pipes, cwd, and signal", async () => {
		const workdir = await createTempDir();
		const projectRoot = "/tmp/codex-backend-project-root";
		const promptPath = await createPromptFile("Task prompt");
		const child = createChild({
			stdout: "OUTCOME: success\n",
			stderr: "debug",
		});
		const bun = stubBun(child);
		const signal = new AbortController().signal;
		const backend = createCodexBackend({ binary: "codex-dev" });

		const result = await backend.run(
			createInvocation(promptPath, { workdir, projectRoot, signal }),
		);

		expect(bun.file).toHaveBeenCalledWith(promptPath);
		expect(bun.spawn).toHaveBeenCalledTimes(1);
		const { argv, options } = firstSpawnCall(bun);
		expect(Array.isArray(argv)).toBe(true);
		expect(argv).toEqual([
			"codex-dev",
			"exec",
			"--full-auto",
			"-o",
			join(workdir, "TASK-267-summary.txt"),
			"-",
		]);
		expect(options).toEqual({
			cwd: projectRoot,
			stdin: bun.file.mock.results[0]?.value,
			stdout: "pipe",
			stderr: "pipe",
			signal,
		});
		expect(result).toMatchObject({ exitCode: 0, stdout: "OUTCOME: success\n" });
		expect(result.durationMs).toEqual(expect.any(Number));
	});

	test("run inserts global and exec extra args around the exec subcommand", async () => {
		const workdir = await createTempDir();
		const promptPath = await createPromptFile("Task prompt");
		const child = createChild({ stdout: "OUTCOME: success\n" });
		const bun = stubBun(child);
		const backend = createCodexBackend({
			binary: "codex-dev",
			globalArgs: ["--yolo"],
			extraArgs: ["--sandbox", "danger-full-access"],
		});

		await backend.run(createInvocation(promptPath, { workdir }));

		const { argv } = firstSpawnCall(bun);
		expect(argv).toEqual([
			"codex-dev",
			"--yolo",
			"exec",
			"--sandbox",
			"danger-full-access",
			"-o",
			join(workdir, "TASK-267-summary.txt"),
			"-",
		]);
	});

	test("reads codex args from environment", () => {
		expect(
			readCodexArgsFromEnv({
				COSMONAUTS_DRIVER_CODEX_YOLO: "1",
				COSMONAUTS_DRIVER_CODEX_ARGS: "--profile drive",
			}),
		).toEqual(["--yolo", "--profile", "drive"]);
		expect(
			readCodexExecArgsFromEnv({
				COSMONAUTS_DRIVER_CODEX_EXEC_ARGS: '["--sandbox","danger-full-access"]',
			}),
		).toEqual(["--sandbox", "danger-full-access"]);
		expect(
			parseCodexExecArgs("--config 'sandbox_permissions=[\"network\"]'"),
		).toEqual(["--config", 'sandbox_permissions=["network"]']);
	});

	test("run returns the summary file output when codex writes one", async () => {
		const workdir = await createTempDir();
		const promptPath = await createPromptFile();
		await writeFile(
			join(workdir, "TASK-267-summary.txt"),
			"OUTCOME: success\nfrom summary\n",
			"utf-8",
		);
		const child = createChild({ stdout: "stream logs\n" });
		stubBun(child);
		const backend = createCodexBackend();

		const result = await backend.run(createInvocation(promptPath, { workdir }));

		expect(result).toMatchObject({
			exitCode: 0,
			stdout: "OUTCOME: success\nfrom summary\n",
		});
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
		const backend = createCodexBackend();

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
		const backend = createCodexBackend();

		const resultPromise = backend.run(
			createInvocation(promptPath, { workdir, signal: controller.signal }),
		);
		controller.abort();
		const result = await resultPromise;

		expect(observedAbort).toBe(true);
		expect(result.exitCode).toBe(143);
	});
});
