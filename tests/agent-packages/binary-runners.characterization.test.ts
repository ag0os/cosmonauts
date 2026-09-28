import { PassThrough, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
	runClaudeBinary,
	type SpawnClaudeProcess,
} from "../../lib/agent-packages/claude-binary-runner.ts";
import {
	runCodexBinary,
	type SpawnCodexProcess,
} from "../../lib/agent-packages/codex-binary-runner.ts";
import type {
	AgentPackage,
	MaterializedInvocation,
} from "../../lib/agent-packages/types.ts";

const claudePackage = {
	schemaVersion: 1,
	packageId: "characterized-claude",
	description: "Claude runner characterization fixture.",
	systemPrompt: "Keep behavior stable.",
	tools: "readonly",
	skills: [],
	projectContext: "omit",
	target: "claude-cli",
	targetOptions: {},
} satisfies AgentPackage;

const codexPackage = {
	...claudePackage,
	packageId: "characterized-codex",
	target: "codex",
} satisfies AgentPackage;

class FakeChild extends PassThrough {
	readonly stdout = new PassThrough();
	readonly stderr = new PassThrough();
	readonly stdin = new PassThrough();

	close(code: number | null, signal: string | null = null): void {
		this.stdout.end();
		this.stderr.end();
		this.emit("close", code, signal);
	}

	fail(error: Error): void {
		this.emit("error", error);
	}
}

function materializedInvocation(options: {
	readonly command: string;
	readonly args: readonly string[];
	readonly cleanup: () => Promise<void>;
	readonly warning?: string;
}): MaterializedInvocation {
	return {
		tempDir: "/tmp/runner-characterization",
		spec: {
			command: options.command,
			args: options.args,
			env: { CHARACTERIZATION: "true" },
			cwd: "/characterization",
			stdin: "characterized input",
			warnings: options.warning
				? [{ code: "anthropic_api_key_removed", message: options.warning }]
				: [],
		},
		cleanup: options.cleanup,
	};
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

type TestSignal = "SIGINT" | "SIGTERM";
type TestSignalHandler = (signal: TestSignal) => void | Promise<void>;

function signalHarness(): {
	readonly runtime: {
		on(signal: TestSignal, handler: TestSignalHandler): void;
		off(signal: TestSignal, handler: TestSignalHandler): void;
		reemit(signal: TestSignal): void;
	};
	readonly on: ReturnType<typeof vi.fn>;
	readonly off: ReturnType<typeof vi.fn>;
	readonly reemit: ReturnType<typeof vi.fn>;
	activeSignals(): TestSignal[];
	emit(signal: TestSignal): Promise<void>;
} {
	const handlers = new Map<TestSignal, TestSignalHandler>();
	const on = vi.fn((signal: TestSignal, handler: TestSignalHandler) => {
		handlers.set(signal, handler);
	});
	const off = vi.fn((signal: TestSignal, handler: TestSignalHandler) => {
		if (handlers.get(signal) === handler) handlers.delete(signal);
	});
	const reemit = vi.fn();

	return {
		runtime: { on, off, reemit },
		on,
		off,
		reemit,
		activeSignals: () => [...handlers.keys()],
		async emit(signal) {
			await handlers.get(signal)?.(signal);
		},
	};
}

function expectHandlersUninstalled(
	signals: ReturnType<typeof signalHarness>,
): void {
	expect(signals.on.mock.calls.map(([signal]) => signal)).toEqual([
		"SIGINT",
		"SIGTERM",
	]);
	expect(signals.off.mock.calls).toEqual(signals.on.mock.calls);
	expect(signals.activeSignals()).toEqual([]);
}

describe("runClaudeBinary characterization", () => {
	it("preserves Claude-only flags, warnings, child exit code, cleanup, and handler removal", async () => {
		const child = new FakeChild();
		const cleanup = vi.fn(async () => undefined);
		const invocation = materializedInvocation({
			command: "/opt/claude",
			args: ["-p", "--system-prompt-file", "/tmp/system.md"],
			cleanup,
			warning: "Claude warning",
		});
		const materializeInvocation = vi.fn(async () => invocation);
		const spawn = vi.fn<SpawnClaudeProcess>((command, args, options) => {
			expect({ command, args, options }).toEqual({
				command: invocation.spec.command,
				args: invocation.spec.args,
				options: {
					cwd: invocation.spec.cwd,
					env: invocation.spec.env,
					stdio: "inherit",
				},
			});
			queueMicrotask(() => child.close(23));
			return child;
		});
		const stderr = captureStream();
		const exit = vi.fn();
		const signals = signalHarness();
		const env = { ANTHROPIC_API_KEY: "allowed", OTHER: "value" };

		await runClaudeBinary(claudePackage, {
			argv: [
				"--allow-api-billing",
				"--claude-binary",
				"/opt/claude",
				"--prompt-mode",
				"replace",
				"--",
				"--child-flag",
			],
			cwd: () => "/repo",
			env,
			stderr: stderr.stream,
			exit,
			materializeInvocation,
			spawn,
			signals: signals.runtime,
		});

		expect(materializeInvocation).toHaveBeenCalledWith(claudePackage, {
			allowApiBilling: true,
			claudeBinary: "/opt/claude",
			promptMode: "replace",
			claudeArgs: ["--", "--child-flag"],
			cwd: "/repo",
			env,
		});
		expect(stderr.text()).toBe("Claude warning\n");
		expect(exit).toHaveBeenCalledWith(23);
		expect(cleanup).toHaveBeenCalledOnce();
		expectHandlersUninstalled(signals);
	});

	it("re-emits SIGTERM unchanged and cleans once when completion races signal cleanup", async () => {
		const child = new FakeChild();
		const cleanup = vi.fn(async () => undefined);
		const signals = signalHarness();
		const spawn = vi.fn<SpawnClaudeProcess>(() => child);
		const exit = vi.fn();
		const run = runClaudeBinary(claudePackage, {
			argv: ["prompt"],
			exit,
			materializeInvocation: vi.fn(async () =>
				materializedInvocation({ command: "claude", args: ["-p"], cleanup }),
			),
			spawn,
			signals: signals.runtime,
		});

		await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce());
		await signals.emit("SIGTERM");
		child.close(143);
		await run;

		expect(signals.reemit).toHaveBeenCalledExactlyOnceWith("SIGTERM");
		expect(exit).toHaveBeenCalledWith(143);
		expect(cleanup).toHaveBeenCalledOnce();
		expectHandlersUninstalled(signals);
	});

	it("maps a signal-only child close to status 1", async () => {
		const child = new FakeChild();
		const exit = vi.fn();
		const spawn = vi.fn<SpawnClaudeProcess>(() => {
			queueMicrotask(() => child.close(null, "SIGKILL"));
			return child;
		});

		await runClaudeBinary(claudePackage, {
			argv: ["prompt"],
			exit,
			materializeInvocation: vi.fn(async () =>
				materializedInvocation({
					command: "claude",
					args: ["-p"],
					cleanup: vi.fn(async () => undefined),
				}),
			),
			spawn,
		});

		expect(exit).toHaveBeenCalledWith(1);
	});

	it("reports a pre-materialization failure without inventing a resource to clean", async () => {
		const stderr = captureStream();
		const signals = signalHarness();
		const exit = vi.fn();
		const spawn = vi.fn();

		await runClaudeBinary(claudePackage, {
			argv: ["prompt"],
			stderr: stderr.stream,
			exit,
			materializeInvocation: vi.fn(async () => {
				throw new Error("materialization failed");
			}),
			spawn,
			signals: signals.runtime,
		});

		expect(stderr.text()).toContain(
			'claude-cli runtime failed to spawn "claude"',
		);
		expect(exit).toHaveBeenCalledWith(1);
		expect(spawn).not.toHaveBeenCalled();
		expectHandlersUninstalled(signals);
	});

	it("cleans once and removes handlers after a post-materialization spawn error", async () => {
		const cleanup = vi.fn(async () => undefined);
		const stderr = captureStream();
		const signals = signalHarness();
		const exit = vi.fn();

		await runClaudeBinary(claudePackage, {
			argv: ["prompt"],
			stderr: stderr.stream,
			exit,
			materializeInvocation: vi.fn(async () =>
				materializedInvocation({
					command: "/missing/claude",
					args: ["-p"],
					cleanup,
				}),
			),
			spawn: vi.fn(() => {
				throw new Error("ENOENT");
			}),
			signals: signals.runtime,
		});

		expect(stderr.text()).toContain(
			'claude-cli runtime failed to spawn "/missing/claude"',
		);
		expect(exit).toHaveBeenCalledWith(1);
		expect(cleanup).toHaveBeenCalledOnce();
		expectHandlersUninstalled(signals);
	});

	it("returns before materialization and signal installation for an invalid prompt mode", async () => {
		const stderr = captureStream();
		const materializeInvocation = vi.fn();
		const signals = signalHarness();
		const exit = vi.fn();

		await runClaudeBinary(claudePackage, {
			argv: ["--prompt-mode", "merge", "prompt"],
			stderr: stderr.stream,
			exit,
			materializeInvocation,
			signals: signals.runtime,
		});

		expect(stderr.text()).toBe("--prompt-mode must be append or replace\n");
		expect(exit).toHaveBeenCalledWith(1);
		expect(materializeInvocation).not.toHaveBeenCalled();
		expect(signals.on).not.toHaveBeenCalled();
	});
});

describe("runCodexBinary characterization", () => {
	it("preserves Codex-only arguments, warnings, child exit code, cleanup, and handler removal", async () => {
		const child = new FakeChild();
		const cleanup = vi.fn(async () => undefined);
		const invocation = materializedInvocation({
			command: "/opt/codex",
			args: ["exec", "-c", 'model_instructions_file="/tmp/system.md"'],
			cleanup,
			warning: "Codex warning",
		});
		const materializeInvocation = vi.fn(async () => invocation);
		const spawn = vi.fn<SpawnCodexProcess>(() => {
			queueMicrotask(() => child.close(31));
			return child;
		});
		const stderr = captureStream();
		const exit = vi.fn();
		const signals = signalHarness();
		const env = { OPENAI_API_KEY: "present", OTHER: "value" };

		await runCodexBinary(codexPackage, {
			argv: [
				"--codex-binary",
				"/opt/codex",
				"exec",
				"--sandbox",
				"workspace-write",
				"-",
			],
			cwd: () => "/repo",
			env,
			stderr: stderr.stream,
			exit,
			materializeInvocation,
			spawn,
			signals: signals.runtime,
		});

		expect(materializeInvocation).toHaveBeenCalledWith(codexPackage, {
			codexBinary: "/opt/codex",
			codexArgs: ["exec", "--sandbox", "workspace-write", "-"],
			cwd: "/repo",
			env,
		});
		expect(stderr.text()).toBe("Codex warning\n");
		expect(exit).toHaveBeenCalledWith(31);
		expect(cleanup).toHaveBeenCalledOnce();
		expectHandlersUninstalled(signals);
	});

	it("re-emits SIGINT unchanged and cleans once when completion races signal cleanup", async () => {
		const child = new FakeChild();
		const cleanup = vi.fn(async () => undefined);
		const signals = signalHarness();
		const spawn = vi.fn<SpawnCodexProcess>(() => child);
		const exit = vi.fn();
		const run = runCodexBinary(codexPackage, {
			argv: ["exec", "-"],
			exit,
			materializeInvocation: vi.fn(async () =>
				materializedInvocation({ command: "codex", args: ["exec"], cleanup }),
			),
			spawn,
			signals: signals.runtime,
		});

		await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce());
		await signals.emit("SIGINT");
		child.close(130);
		await run;

		expect(signals.reemit).toHaveBeenCalledExactlyOnceWith("SIGINT");
		expect(exit).toHaveBeenCalledWith(130);
		expect(cleanup).toHaveBeenCalledOnce();
		expectHandlersUninstalled(signals);
	});

	it("maps a signal-only child close to status 1", async () => {
		const child = new FakeChild();
		const exit = vi.fn();
		const spawn = vi.fn<SpawnCodexProcess>(() => {
			queueMicrotask(() => child.close(null, "SIGKILL"));
			return child;
		});

		await runCodexBinary(codexPackage, {
			argv: ["exec", "-"],
			exit,
			materializeInvocation: vi.fn(async () =>
				materializedInvocation({
					command: "codex",
					args: ["exec"],
					cleanup: vi.fn(async () => undefined),
				}),
			),
			spawn,
		});

		expect(exit).toHaveBeenCalledWith(1);
	});

	it("reports a pre-materialization failure without inventing a resource to clean", async () => {
		const stderr = captureStream();
		const signals = signalHarness();
		const exit = vi.fn();
		const spawn = vi.fn();

		await runCodexBinary(codexPackage, {
			argv: ["exec", "-"],
			stderr: stderr.stream,
			exit,
			materializeInvocation: vi.fn(async () => {
				throw new Error("materialization failed");
			}),
			spawn,
			signals: signals.runtime,
		});

		expect(stderr.text()).toContain('codex runtime failed to spawn "codex"');
		expect(exit).toHaveBeenCalledWith(1);
		expect(spawn).not.toHaveBeenCalled();
		expectHandlersUninstalled(signals);
	});

	it("cleans once and removes handlers after a post-materialization spawn error", async () => {
		const cleanup = vi.fn(async () => undefined);
		const stderr = captureStream();
		const signals = signalHarness();
		const exit = vi.fn();

		await runCodexBinary(codexPackage, {
			argv: ["exec", "-"],
			stderr: stderr.stream,
			exit,
			materializeInvocation: vi.fn(async () =>
				materializedInvocation({
					command: "/missing/codex",
					args: ["exec"],
					cleanup,
				}),
			),
			spawn: vi.fn(() => {
				throw new Error("ENOENT");
			}),
			signals: signals.runtime,
		});

		expect(stderr.text()).toContain(
			'codex runtime failed to spawn "/missing/codex"',
		);
		expect(exit).toHaveBeenCalledWith(1);
		expect(cleanup).toHaveBeenCalledOnce();
		expectHandlersUninstalled(signals);
	});

	it("returns before materialization and signal installation for a missing binary path", async () => {
		const stderr = captureStream();
		const materializeInvocation = vi.fn();
		const signals = signalHarness();
		const exit = vi.fn();

		await runCodexBinary(codexPackage, {
			argv: ["--codex-binary"],
			stderr: stderr.stream,
			exit,
			materializeInvocation,
			signals: signals.runtime,
		});

		expect(stderr.text()).toBe("--codex-binary requires a path\n");
		expect(exit).toHaveBeenCalledWith(1);
		expect(materializeInvocation).not.toHaveBeenCalled();
		expect(signals.on).not.toHaveBeenCalled();
	});
});
