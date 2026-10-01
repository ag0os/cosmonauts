/**
 * Tests for the lean builder backends: the Pi spawn contract and the external
 * harness invocations, with stubbed spawner and process runner.
 */
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import type { AgentPackage } from "../../lib/agent-packages/types.ts";
import {
	createExternalBuilderBackend,
	type ProcessRequest,
} from "../../lib/lean-run/backends/external.ts";
import { createPiBuilderBackend } from "../../lib/lean-run/backends/pi.ts";
import type {
	AgentSpawner,
	SpawnConfig,
	SpawnResult,
} from "../../lib/orchestration/types.ts";

const ENVELOPE = '{"outcome":"done"}';

function stubSpawner(result: Partial<SpawnResult>): AgentSpawner & {
	configs: SpawnConfig[];
} {
	const configs: SpawnConfig[] = [];
	return {
		configs,
		async spawn(config) {
			configs.push(config);
			return { success: true, sessionId: "s", messages: [], ...result };
		},
		dispose() {},
	};
}

const assistant = (text: string) => ({
	role: "assistant",
	content: [{ type: "text", text }],
});

describe("createPiBuilderBackend", () => {
	test("spawns in the lean domain under the driver parent role with the run's task id", async () => {
		const spawner = stubSpawner({ messages: [assistant(ENVELOPE)] });
		await createPiBuilderBackend({ spawner }).run({
			prompt: "build it",
			worktree: "/repo",
			role: "lean/builder",
			taskId: "lean-20261001T000000-abcd1234",
		});
		expect(spawner.configs[0]).toMatchObject({
			role: "lean/builder",
			domainContext: "lean",
			cwd: "/repo",
			prompt: "build it",
			runtimeContext: {
				mode: "sub-agent",
				parentRole: "driver",
				taskId: "lean-20261001T000000-abcd1234",
			},
		});
	});

	test("returns the final assistant text and the spawn stats", async () => {
		const stats = {
			tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 2 },
			cost: 0.01,
			durationMs: 10,
			turns: 1,
			toolCalls: 3,
		};
		const spawner = stubSpawner({ messages: [assistant(ENVELOPE)], stats });
		const result = await createPiBuilderBackend({ spawner }).run({
			prompt: "p",
			worktree: "/repo",
			role: "lean/code-reviewer",
		});
		expect(result).toEqual({ text: ENVELOPE, stats });
	});

	test("throws with the spawn error when the spawn fails", async () => {
		const spawner = stubSpawner({ success: false, error: "no model" });
		await expect(
			createPiBuilderBackend({ spawner }).run({
				prompt: "p",
				worktree: "/repo",
				role: "lean/builder",
			}),
		).rejects.toThrow("lean/builder spawn failed: no model");
	});
});

const PACKAGE: AgentPackage = {
	schemaVersion: 1,
	packageId: "lean-builder-claude-cli",
	description: "builder",
	systemPrompt: "You are the builder.",
	tools: "coding",
	skills: [],
	projectContext: "omit",
	target: "claude-cli",
	targetOptions: {},
};

describe("createExternalBuilderBackend", () => {
	test("runs claude in print mode with the package persona and the prompt on stdin", async () => {
		const requests: ProcessRequest[] = [];
		const backend = createExternalBuilderBackend({
			kind: "claude-cli",
			resolvePackage: async () => PACKAGE,
			runProcess: async (request) => {
				requests.push(request);
				return { exitCode: 0, stdout: `done\n${ENVELOPE}\n`, stderr: "" };
			},
		});
		const result = await backend.run({
			prompt: "build it",
			worktree: "/repo",
			role: "lean/builder",
		});
		expect(result).toEqual({ text: `done\n${ENVELOPE}\n` });
		expect(requests[0]).toMatchObject({
			command: "claude",
			cwd: "/repo",
			stdin: "build it",
		});
		expect(requests[0]?.args).toEqual(
			expect.arrayContaining([
				"--append-system-prompt-file",
				"--tools",
				"--dangerously-skip-permissions",
				"-p",
			]),
		);
	});

	test("runs codex exec and returns its last message file", async () => {
		const requests: ProcessRequest[] = [];
		const backend = createExternalBuilderBackend({
			kind: "codex-cli",
			resolvePackage: async () => ({ ...PACKAGE, target: "codex" }),
			runProcess: async (request) => {
				requests.push(request);
				const file =
					request.args[request.args.indexOf("--output-last-message") + 1];
				await writeFile(file ?? "", ENVELOPE);
				return { exitCode: 0, stdout: "log noise", stderr: "" };
			},
		});
		const result = await backend.run({
			prompt: "p",
			worktree: "/repo",
			role: "lean/builder",
		});
		expect(result.text).toBe(ENVELOPE);
		expect(requests[0]?.args[0]).toBe("exec");
		expect(requests[0]?.args.at(-1)).toBe("-");
		expect(requests[0]?.args).toContain("workspace-write");
	});

	test("throws on a non-zero exit and removes the invocation files", async () => {
		let systemPrompt = "";
		const backend = createExternalBuilderBackend({
			kind: "claude-cli",
			resolvePackage: async () => PACKAGE,
			runProcess: async (request) => {
				systemPrompt =
					request.args[
						request.args.indexOf("--append-system-prompt-file") + 1
					] ?? "";
				return { exitCode: 2, stdout: "", stderr: "auth expired" };
			},
		});
		await expect(
			backend.run({ prompt: "p", worktree: "/repo", role: "lean/builder" }),
		).rejects.toThrow("claude-cli exited 2: auth expired");
		expect(existsSync(systemPrompt)).toBe(false);
	});

	test("resolves the package for the role it runs", async () => {
		const roles: string[] = [];
		const backend = createExternalBuilderBackend({
			kind: "claude-cli",
			resolvePackage: async (role) => {
				roles.push(role);
				return { ...PACKAGE, tools: "readonly" };
			},
			runProcess: async () => ({ exitCode: 0, stdout: ENVELOPE, stderr: "" }),
		});
		await backend.run({
			prompt: "p",
			worktree: "/r",
			role: "lean/code-reviewer",
		});
		expect(roles).toEqual(["lean/code-reviewer"]);
	});
});
