import { access, readFile } from "node:fs/promises";
import { PassThrough, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
	runClaudeBinary,
	type SpawnClaudeProcess,
	type SpawnOptions,
} from "../../lib/agent-packages/claude-binary-runner.ts";
import type {
	AgentPackage,
	MaterializedInvocation,
} from "../../lib/agent-packages/types.ts";

const basePackage = {
	schemaVersion: 1,
	packageId: "sample-agent-claude",
	description: "Sample packaged agent.",
	systemPrompt: "You are packaged.",
	tools: "readonly",
	skills: [],
	projectContext: "omit",
	target: "claude-cli",
	targetOptions: {},
} satisfies AgentPackage;

class FakeChild extends PassThrough {
	readonly stdout = new PassThrough();
	readonly stderr = new PassThrough();
	readonly stdin = new PassThrough();

	close(code: number): void {
		this.stdout.end();
		this.stderr.end();
		this.emit("close", code, null);
	}

	fail(error: Error): void {
		this.emit("error", error);
	}
}

function captureStream(): { readonly stream: Writable; text(): string } {
	const chunks: string[] = [];
	return {
		stream: new Writable({
			write(chunk, _encoding, callback) {
				chunks.push(
					Buffer.isBuffer(chunk) ? chunk.toString("utf-8") : String(chunk),
				);
				callback();
			},
		}),
		text: () => chunks.join(""),
	};
}

function materializedInvocation(
	overrides: Partial<MaterializedInvocation["spec"]> = {},
	cleanup = vi.fn(async () => {}),
): MaterializedInvocation {
	return {
		tempDir: "/tmp/cosmonauts-agent-package-test",
		spec: {
			command: "claude",
			args: ["-p"],
			env: {},
			cwd: "/repo",
			stdin: "prompt",
			warnings: [],
			...overrides,
		},
		cleanup,
	};
}

interface SpawnCall {
	readonly command: string;
	readonly args: readonly string[];
	readonly options: SpawnOptions;
}

function spawnClosingChild(
	child: FakeChild,
	options: {
		readonly exitCode?: number;
		readonly stdout?: string;
		readonly stderr?: string;
	} = {},
): { readonly spawn: SpawnClaudeProcess; readonly calls: SpawnCall[] } {
	const calls: SpawnCall[] = [];
	const spawn: SpawnClaudeProcess = (command, args, spawnOptions) => {
		calls.push({ command, args, options: spawnOptions });
		setTimeout(() => {
			if (options.stdout) child.stdout.write(options.stdout);
			if (options.stderr) child.stderr.write(options.stderr);
			child.close(options.exitCode ?? 0);
		}, 0);
		return child;
	};
	return { spawn, calls };
}

type TestSignal = "SIGINT" | "SIGTERM";
type TestSignalHandler = (signal: TestSignal) => void | Promise<void>;

interface TestSignalRuntime {
	on(signal: TestSignal, handler: TestSignalHandler): void;
	off(signal: TestSignal, handler: TestSignalHandler): void;
	reemit(signal: TestSignal): void;
}

function signalHarness(): {
	readonly runtime: TestSignalRuntime;
	readonly reemit: ReturnType<typeof vi.fn>;
	emit(signal: TestSignal): Promise<void>;
} {
	const handlers = new Map<TestSignal, TestSignalHandler>();
	const reemit = vi.fn();
	return {
		runtime: {
			on(signal, handler) {
				handlers.set(signal, handler);
			},
			off(signal, handler) {
				if (handlers.get(signal) === handler) handlers.delete(signal);
			},
			reemit,
		},
		reemit,
		async emit(signal) {
			await handlers.get(signal)?.(signal);
		},
	};
}

describe("runClaudeBinary", () => {
	it("passes Claude args through, pipes Claude output from tests, exits with Claude's code, and cleans up", async () => {
		const child = new FakeChild();
		const stdout = captureStream();
		const stderr = captureStream();
		const events: string[] = [];
		const exit = vi.fn(() => events.push("exit"));
		const cleanup = vi.fn(async () => {
			events.push("cleanup-start");
			await Promise.resolve();
			events.push("cleanup-end");
		});
		const materializeInvocation = vi.fn(async () =>
			materializedInvocation(
				{
					stdin: "design a cache layer",
					warnings: [
						{
							code: "anthropic_api_key_removed",
							message: "removed API key",
						},
					],
				},
				cleanup,
			),
		);
		const spawned = spawnClosingChild(child, {
			exitCode: 7,
			stdout: "claude out\n",
			stderr: "claude err\n",
		});

		await runClaudeBinary(basePackage, {
			argv: ["design", "a", "cache", "layer"],
			cwd: () => "/repo",
			stdout: stdout.stream,
			stderr: stderr.stream,
			exit,
			materializeInvocation,
			spawn: spawned.spawn,
		});

		expect(materializeInvocation).toHaveBeenCalledWith(basePackage, {
			allowApiBilling: false,
			cwd: "/repo",
			env: process.env,
			claudeArgs: ["design", "a", "cache", "layer"],
		});
		expect(spawned.calls[0]).toEqual({
			command: "claude",
			args: ["-p"],
			options: {
				cwd: "/repo",
				env: {},
				stdio: "inherit",
			},
		});
		expect(stdout.text()).toBe("claude out\n");
		expect(stderr.text()).toBe("removed API key\nclaude err\n");
		expect(exit).toHaveBeenCalledWith(7);
		expect(cleanup).toHaveBeenCalledOnce();
		expect(events).toEqual(["cleanup-start", "cleanup-end", "exit"]);
	});

	it("launches Claude with no args when no prompt is provided", async () => {
		const child = new FakeChild();
		const exit = vi.fn();
		const materializeInvocation = vi.fn(async () => materializedInvocation());

		const spawned = spawnClosingChild(child);
		await runClaudeBinary(basePackage, {
			argv: [],
			exit,
			materializeInvocation,
			spawn: spawned.spawn,
		});

		expect(materializeInvocation).toHaveBeenCalledWith(
			basePackage,
			expect.objectContaining({ claudeArgs: [] }),
		);
		expect(exit).toHaveBeenCalledWith(0);
	});

	it("does not require a prompt", async () => {
		const child = new FakeChild();
		const exit = vi.fn();
		const materializeInvocation = vi.fn(async () => materializedInvocation());
		const spawned = spawnClosingChild(child);

		await runClaudeBinary(basePackage, {
			argv: [],
			exit,
			materializeInvocation,
			spawn: spawned.spawn,
		});

		expect(materializeInvocation).toHaveBeenCalled();
		expect(exit).toHaveBeenCalledWith(0);
	});

	it("passes --help through to Claude", async () => {
		const child = new FakeChild();
		const exit = vi.fn();
		const materializeInvocation = vi.fn(async () => materializedInvocation());
		const spawned = spawnClosingChild(child);

		await runClaudeBinary(basePackage, {
			argv: ["--help"],
			exit,
			materializeInvocation,
			spawn: spawned.spawn,
		});

		expect(materializeInvocation).toHaveBeenCalledWith(
			basePackage,
			expect.objectContaining({ claudeArgs: ["--help"] }),
		);
		expect(exit).toHaveBeenCalledWith(0);
	});

	it("passes unknown flags through to Claude", async () => {
		const child = new FakeChild();
		const exit = vi.fn();
		const materializeInvocation = vi.fn(async () => materializedInvocation());
		const spawned = spawnClosingChild(child);

		await runClaudeBinary(basePackage, {
			argv: ["--bogus", "hello"],
			exit,
			materializeInvocation,
			spawn: spawned.spawn,
		});

		expect(materializeInvocation).toHaveBeenCalledWith(
			basePackage,
			expect.objectContaining({ claudeArgs: ["--bogus", "hello"] }),
		);
		expect(exit).toHaveBeenCalledWith(0);
	});

	it("allows prompts starting with dashes after --", async () => {
		const child = new FakeChild();
		const materializeInvocation = vi.fn(async () => materializedInvocation());
		const spawned = spawnClosingChild(child);

		await runClaudeBinary(basePackage, {
			argv: ["--", "--not-a-flag"],
			exit: vi.fn(),
			materializeInvocation,
			spawn: spawned.spawn,
		});

		expect(materializeInvocation).toHaveBeenCalledWith(
			basePackage,
			expect.objectContaining({ claudeArgs: ["--", "--not-a-flag"] }),
		);
	});

	it("starts interactive Claude when no prompt is supplied", async () => {
		const child = new FakeChild();
		const materializeInvocation = vi.fn(async () => materializedInvocation());
		const spawned = spawnClosingChild(child);

		await runClaudeBinary(basePackage, {
			argv: [],
			exit: vi.fn(),
			materializeInvocation,
			spawn: spawned.spawn,
		});

		expect(materializeInvocation).toHaveBeenCalled();
	});

	it("preserves ANTHROPIC_API_KEY when --allow-api-billing is provided", async () => {
		const child = new FakeChild();
		const exit = vi.fn();
		const spawned = spawnClosingChild(child);

		await runClaudeBinary(basePackage, {
			argv: ["--allow-api-billing", "hello"],
			env: { ANTHROPIC_API_KEY: "key", OTHER: "value" },
			exit,
			spawn: spawned.spawn,
		});

		expect(spawned.calls[0]?.options.env).toMatchObject({
			ANTHROPIC_API_KEY: "key",
			OTHER: "value",
		});
		expect(exit).toHaveBeenCalledWith(0);
	});

	it("uses --claude-binary as the spawned command", async () => {
		const child = new FakeChild();
		const spawned = spawnClosingChild(child);
		await runClaudeBinary(basePackage, {
			argv: ["--claude-binary", "/opt/bin/claude", "hello"],
			spawn: spawned.spawn,
			exit: vi.fn(),
		});

		expect(spawned.calls[0]?.command).toBe("/opt/bin/claude");
	});

	it("overrides the package prompt mode with --prompt-mode", async () => {
		const child = new FakeChild();
		const spawned = spawnClosingChild(child);
		await runClaudeBinary(
			{ ...basePackage, targetOptions: { promptMode: "append" } },
			{
				argv: ["--prompt-mode", "replace", "hello"],
				spawn: spawned.spawn,
				exit: vi.fn(),
			},
		);

		const args = spawned.calls[0]?.args ?? [];
		expect(args).toContain("--system-prompt-file");
		expect(args).not.toContain("--append-system-prompt-file");
	});

	it("prints a claude-cli diagnostic and still cleans up when spawn throws", async () => {
		const stderr = captureStream();
		const events: string[] = [];
		const cleanup = vi.fn(async () => {
			events.push("cleanup-start");
			await Promise.resolve();
			events.push("cleanup-end");
		});
		const exit = vi.fn(() => events.push("exit"));
		await runClaudeBinary(basePackage, {
			argv: ["hello"],
			stderr: stderr.stream,
			exit,
			materializeInvocation: vi.fn(async () =>
				materializedInvocation({ command: "/missing/claude" }, cleanup),
			),
			spawn: vi.fn(() => {
				throw new Error("ENOENT");
			}),
		});

		expect(stderr.text()).toMatch(/claude-cli/);
		expect(stderr.text()).toMatch(/\/missing\/claude/);
		expect(stderr.text()).toMatch(
			/install Claude Code CLI or pass --claude-binary/,
		);
		expect(exit).toHaveBeenCalledWith(1);
		expect(cleanup).toHaveBeenCalledOnce();
		expect(events).toEqual(["cleanup-start", "cleanup-end", "exit"]);
	});

	it("cleans up and re-emits when SIGINT is received", async () => {
		const child = new FakeChild();
		const signals = signalHarness();
		const cleanup = vi.fn(async () => {});
		const spawn = vi.fn<SpawnClaudeProcess>(() => child);
		const run = runClaudeBinary(basePackage, {
			argv: ["hello"],
			exit: vi.fn(),
			materializeInvocation: vi.fn(async () =>
				materializedInvocation({}, cleanup),
			),
			spawn,
			signals: signals.runtime,
		});

		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(spawn).toHaveBeenCalled();
		await signals.emit("SIGINT");
		child.close(130);
		await run;

		expect(cleanup).toHaveBeenCalledOnce();
		expect(signals.reemit).toHaveBeenCalledWith("SIGINT");
	});

	it("runs Claude in process.cwd() by default and removes temp assets after completion", async () => {
		const child = new FakeChild();
		const spawned = spawnClosingChild(child);
		await runClaudeBinary(basePackage, {
			argv: ["hello"],
			spawn: spawned.spawn,
			exit: vi.fn(),
		});

		const spawnOptions = spawned.calls[0]?.options;
		const args = spawned.calls[0]?.args ?? [];
		const promptFlagIndex = args.indexOf("--append-system-prompt-file");
		const promptPath = args[promptFlagIndex + 1];

		expect(spawnOptions?.cwd).toBe(process.cwd());
		expect(promptPath).toBeTruthy();
		await expect(access(String(promptPath))).rejects.toThrow();
	});

	it("does not import runtime, domain discovery, Drive, chain, or task modules", async () => {
		const source = await readFile(
			"lib/agent-packages/claude-binary-runner.ts",
			"utf-8",
		);

		expect(source).not.toMatch(
			/CosmonautsRuntime|domain-discovery|discoverFrameworkBundledPackageDirs|driver|Drive|chain|tasks?\//i,
		);
	});
});
