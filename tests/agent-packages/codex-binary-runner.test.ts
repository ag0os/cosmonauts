import { PassThrough, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
	runCodexBinary,
	type SpawnCodexProcess,
	type SpawnOptions,
} from "../../lib/agent-packages/codex-binary-runner.ts";
import type {
	AgentPackage,
	MaterializedInvocation,
} from "../../lib/agent-packages/types.ts";

const basePackage = {
	schemaVersion: 1,
	packageId: "sample-agent-codex",
	description: "Sample packaged agent.",
	systemPrompt: "You are packaged.",
	tools: "coding",
	skills: [],
	projectContext: "omit",
	target: "codex",
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
		tempDir: "/tmp/cosmonauts-codex-package-test",
		spec: {
			command: "codex",
			args: ["exec", "-c", 'model_instructions_file="/tmp/system.md"'],
			env: {},
			cwd: "/repo",
			stdin: "",
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
): { readonly spawn: SpawnCodexProcess; readonly calls: SpawnCall[] } {
	const calls: SpawnCall[] = [];
	const spawn: SpawnCodexProcess = (command, args, spawnOptions) => {
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

describe("runCodexBinary", () => {
	it("passes Codex args through, exits with Codex's code, and cleans up", async () => {
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
					warnings: [{ code: "anthropic_api_key_removed", message: "warn" }],
				},
				cleanup,
			),
		);
		const spawned = spawnClosingChild(child, {
			exitCode: 7,
			stdout: "codex out\n",
			stderr: "codex err\n",
		});

		await runCodexBinary(basePackage, {
			argv: ["exec", "--sandbox", "workspace-write", "-"],
			cwd: () => "/repo",
			stdout: stdout.stream,
			stderr: stderr.stream,
			exit,
			materializeInvocation,
			spawn: spawned.spawn,
		});

		expect(materializeInvocation).toHaveBeenCalledWith(basePackage, {
			cwd: "/repo",
			env: process.env,
			codexArgs: ["exec", "--sandbox", "workspace-write", "-"],
		});
		expect(spawned.calls[0]).toEqual({
			command: "codex",
			args: ["exec", "-c", 'model_instructions_file="/tmp/system.md"'],
			options: {
				cwd: "/repo",
				env: {},
				stdio: "inherit",
			},
		});
		expect(stdout.text()).toBe("codex out\n");
		expect(stderr.text()).toBe("warn\ncodex err\n");
		expect(exit).toHaveBeenCalledWith(7);
		expect(cleanup).toHaveBeenCalledOnce();
		expect(events).toEqual(["cleanup-start", "cleanup-end", "exit"]);
	});

	it("starts interactive Codex when no args are supplied", async () => {
		const child = new FakeChild();
		const exit = vi.fn();
		const materializeInvocation = vi.fn(async () => materializedInvocation());
		const spawned = spawnClosingChild(child);

		await runCodexBinary(basePackage, {
			argv: [],
			exit,
			materializeInvocation,
			spawn: spawned.spawn,
		});

		expect(materializeInvocation).toHaveBeenCalledWith(
			basePackage,
			expect.objectContaining({ codexArgs: [] }),
		);
		expect(exit).toHaveBeenCalledWith(0);
	});

	it("passes unknown flags through to Codex", async () => {
		const child = new FakeChild();
		const exit = vi.fn();
		const materializeInvocation = vi.fn(async () => materializedInvocation());
		const spawned = spawnClosingChild(child);

		await runCodexBinary(basePackage, {
			argv: ["--bogus", "hello"],
			exit,
			materializeInvocation,
			spawn: spawned.spawn,
		});

		expect(materializeInvocation).toHaveBeenCalledWith(
			basePackage,
			expect.objectContaining({ codexArgs: ["--bogus", "hello"] }),
		);
		expect(exit).toHaveBeenCalledWith(0);
	});

	it("uses --codex-binary as the spawned command", async () => {
		const child = new FakeChild();
		const spawned = spawnClosingChild(child);
		await runCodexBinary(basePackage, {
			argv: ["--codex-binary", "/opt/bin/codex", "exec", "-"],
			spawn: spawned.spawn,
			exit: vi.fn(),
		});

		expect(spawned.calls[0]?.command).toBe("/opt/bin/codex");
	});

	it("prints a codex diagnostic and still cleans up when spawn throws", async () => {
		const stderr = captureStream();
		const events: string[] = [];
		const cleanup = vi.fn(async () => {
			events.push("cleanup-start");
			await Promise.resolve();
			events.push("cleanup-end");
		});
		const exit = vi.fn(() => events.push("exit"));
		await runCodexBinary(basePackage, {
			argv: ["exec", "-"],
			stderr: stderr.stream,
			exit,
			materializeInvocation: vi.fn(async () =>
				materializedInvocation({ command: "/missing/codex" }, cleanup),
			),
			spawn: vi.fn(() => {
				throw new Error("ENOENT");
			}),
		});

		expect(stderr.text()).toMatch(/codex runtime/);
		expect(stderr.text()).toMatch(/\/missing\/codex/);
		expect(stderr.text()).toMatch(/install Codex CLI or pass --codex-binary/);
		expect(exit).toHaveBeenCalledWith(1);
		expect(cleanup).toHaveBeenCalledOnce();
		expect(events).toEqual(["cleanup-start", "cleanup-end", "exit"]);
	});
});
