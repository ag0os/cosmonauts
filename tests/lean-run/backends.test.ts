/**
 * Tests for the lean builder backends: the Pi spawn contract and the external
 * harness invocations, with stubbed spawner and process runner.
 */
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { AgentPackage } from "../../lib/agent-packages/types.ts";
import {
	createExternalBuilderBackend,
	leanPackageResolver,
	type ProcessRequest,
} from "../../lib/lean-run/backends/external.ts";
import { createPiBuilderBackend } from "../../lib/lean-run/backends/pi.ts";
import type { LeanRole } from "../../lib/lean-run/types.ts";
import type {
	AgentSpawner,
	SpawnConfig,
	SpawnResult,
} from "../../lib/orchestration/types.ts";
import { discoverFrameworkBundledPackageDirs } from "../../lib/packages/dev-bundled.ts";
import { CosmonautsRuntime } from "../../lib/runtime.ts";

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

	test("reports guarded permissions: the role guard and the destructive-git guard", () => {
		const spawner = stubSpawner({});
		expect(createPiBuilderBackend({ spawner }).permissions).toBe("guarded");
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

	test("runs an envelope repair turn with the readonly tool set", async () => {
		const requests: ProcessRequest[] = [];
		const backend = createExternalBuilderBackend({
			kind: "claude-cli",
			resolvePackage: async () => PACKAGE,
			runProcess: async (request) => {
				requests.push(request);
				return { exitCode: 0, stdout: ENVELOPE, stderr: "" };
			},
		});
		await backend.run({
			prompt: "p",
			worktree: "/repo",
			role: "lean/builder",
			readonly: true,
		});
		const args = requests[0]?.args ?? [];
		expect(args[args.indexOf("--tools") + 1]).toBe("Read,Glob,Grep");
	});

	test("drops a package's allowed tools in a claude envelope repair turn", async () => {
		const requests: ProcessRequest[] = [];
		const backend = createExternalBuilderBackend({
			kind: "claude-cli",
			resolvePackage: async () => ({
				...PACKAGE,
				targetOptions: { allowedTools: ["Read", "Edit", "Write", "Bash"] },
			}),
			runProcess: async (request) => {
				requests.push(request);
				return { exitCode: 0, stdout: ENVELOPE, stderr: "" };
			},
		});
		await backend.run({
			prompt: "p",
			worktree: "/repo",
			role: "lean/builder",
			readonly: true,
		});
		const args = requests[0]?.args ?? [];
		expect(args[args.indexOf("--tools") + 1]).toBe("Read,Glob,Grep");
	});

	test("runs a codex envelope repair turn in the read-only sandbox", async () => {
		const requests: ProcessRequest[] = [];
		const backend = createExternalBuilderBackend({
			kind: "codex-cli",
			resolvePackage: async () => ({ ...PACKAGE, target: "codex" }),
			runProcess: async (request) => {
				requests.push(request);
				return { exitCode: 0, stdout: ENVELOPE, stderr: "" };
			},
		});
		await backend.run({
			prompt: "p",
			worktree: "/repo",
			role: "lean/builder",
			readonly: true,
		});
		const args = requests[0]?.args ?? [];
		expect(args[args.indexOf("--sandbox") + 1]).toBe("read-only");
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

	test("reports skipped permissions for claude, which runs with --dangerously-skip-permissions", () => {
		const backend = createExternalBuilderBackend({
			kind: "claude-cli",
			resolvePackage: async () => PACKAGE,
		});
		expect(backend.permissions).toBe("skipped");
	});

	test("reports the harness's own permissions for claude run without that flag", () => {
		const backend = createExternalBuilderBackend({
			kind: "claude-cli",
			resolvePackage: async () => PACKAGE,
			extraArgs: [],
		});
		expect(backend.permissions).toBe("harness");
	});

	test("reports the sandbox for codex", () => {
		const backend = createExternalBuilderBackend({
			kind: "codex-cli",
			resolvePackage: async () => PACKAGE,
		});
		expect(backend.permissions).toBe("sandbox");
	});
});

/** `claude -p --output-format json` as Claude Code 2.1.286 prints it. */
const CLAUDE_RESULT = {
	type: "result",
	subtype: "success",
	is_error: false,
	duration_ms: 4_210,
	num_turns: 3,
	result: `Built it.\n${ENVELOPE}`,
	session_id: "session",
	total_cost_usd: 0.0425,
	usage: {
		input_tokens: 1_200,
		output_tokens: 340,
		cache_creation_input_tokens: 5_000,
		cache_read_input_tokens: 20_000,
		service_tier: "standard",
	},
};

/** `codex exec --json` events as codex-cli 0.159 prints them. */
const CODEX_EVENTS = [
	{ type: "thread.started", thread_id: "t" },
	{ type: "turn.started" },
	{
		type: "item.completed",
		item: { id: "item_0", type: "agent_message", text: ENVELOPE },
	},
	{
		type: "turn.completed",
		usage: {
			input_tokens: 9_000,
			cached_input_tokens: 6_000,
			output_tokens: 500,
		},
	},
]
	.map((event) => JSON.stringify(event))
	.join("\n");

describe("createExternalBuilderBackend token usage", () => {
	function claudeBackend(stdout: string, requests: ProcessRequest[] = []) {
		return createExternalBuilderBackend({
			kind: "claude-cli",
			resolvePackage: async () => PACKAGE,
			runProcess: async (request) => {
				requests.push(request);
				return { exitCode: 0, stdout, stderr: "" };
			},
		});
	}

	function codexBackend(stdout: string, requests: ProcessRequest[] = []) {
		return createExternalBuilderBackend({
			kind: "codex-cli",
			resolvePackage: async () => ({ ...PACKAGE, target: "codex" }),
			runProcess: async (request) => {
				requests.push(request);
				const file =
					request.args[request.args.indexOf("--output-last-message") + 1];
				await writeFile(file ?? "", ENVELOPE);
				return { exitCode: 0, stdout, stderr: "" };
			},
		});
	}

	const input = {
		prompt: "p",
		worktree: "/repo",
		role: "lean/builder",
	} as const;

	test("runs claude with JSON output and reads the result text and usage", async () => {
		const requests: ProcessRequest[] = [];
		const backend = claudeBackend(
			`${JSON.stringify(CLAUDE_RESULT)}\n`,
			requests,
		);

		const result = await backend.run(input);

		const args = requests[0]?.args ?? [];
		expect(args[args.indexOf("--output-format") + 1]).toBe("json");
		expect(result).toEqual({
			text: `Built it.\n${ENVELOPE}`,
			stats: {
				tokens: {
					input: 1_200,
					output: 340,
					cacheRead: 20_000,
					cacheWrite: 5_000,
					total: 26_540,
				},
				cost: 0.0425,
				durationMs: 4_210,
				turns: 3,
				toolCalls: 0,
			},
		});
	});

	test("returns claude's stdout as plain text with no stats when it is not JSON", async () => {
		const result = await claudeBackend(`done\n${ENVELOPE}\n`).run(input);

		expect(result).toEqual({ text: `done\n${ENVELOPE}\n` });
	});

	test("returns claude's stdout as plain text with no stats when its JSON is cut off", async () => {
		const cut = JSON.stringify(CLAUDE_RESULT).slice(0, 40);

		const result = await claudeBackend(cut).run(input);

		expect(result).toEqual({ text: cut });
	});

	test("returns claude's result text with no stats when the usage is missing", async () => {
		const { usage: _usage, ...noUsage } = CLAUDE_RESULT;

		const result = await claudeBackend(JSON.stringify(noUsage)).run(input);

		expect(result).toEqual({ text: `Built it.\n${ENVELOPE}` });
	});

	test("reads claude's result object from the last line when a warning precedes it", async () => {
		const result = await claudeBackend(
			`warning: something\n${JSON.stringify(CLAUDE_RESULT)}`,
		).run(input);

		expect(result.text).toBe(`Built it.\n${ENVELOPE}`);
		expect(result.stats?.tokens.input).toBe(1_200);
	});

	test("runs codex with JSONL events and counts the uncached input and the output", async () => {
		const requests: ProcessRequest[] = [];

		const result = await codexBackend(CODEX_EVENTS, requests).run(input);

		const args = requests[0]?.args ?? [];
		expect(args).toContain("--json");
		expect(args.at(-1)).toBe("-");
		expect(result.text).toBe(ENVELOPE);
		expect(result.stats).toMatchObject({
			tokens: {
				input: 3_000,
				output: 500,
				cacheRead: 6_000,
				cacheWrite: 0,
				total: 9_500,
			},
			cost: 0,
			turns: 1,
			toolCalls: 0,
		});
		expect(result.stats?.durationMs).toBeGreaterThanOrEqual(0);
	});

	test("sums the usage of every completed codex turn", async () => {
		const turn = JSON.stringify({
			type: "turn.completed",
			usage: { input_tokens: 100, output_tokens: 10 },
		});

		const result = await codexBackend(`${turn}\n${turn}`).run(input);

		expect(result.stats?.tokens).toMatchObject({ input: 200, output: 20 });
		expect(result.stats?.turns).toBe(2);
	});

	test.each([
		["plain text", "log noise"],
		[
			"events without a completed turn",
			CODEX_EVENTS.split("\n").slice(0, 3).join("\n"),
		],
		[
			"a completed turn without usage counts",
			JSON.stringify({ type: "turn.completed", usage: { input_tokens: "x" } }),
		],
	])("reports no codex stats for %s", async (_name, stdout) => {
		const result = await codexBackend(stdout).run(input);

		expect(result).toEqual({ text: ENVELOPE });
	});
});

describe("leanPackageResolver", () => {
	const repositoryRoot = resolve(fileURLToPath(import.meta.url), "../../..");
	let projectRoot: string;
	let runtime: CosmonautsRuntime;

	beforeAll(async () => {
		projectRoot = await mkdtemp(join(tmpdir(), "lean-package-resolver-"));
		runtime = await CosmonautsRuntime.create({
			builtinDomainsDir: join(repositoryRoot, "domains"),
			projectRoot,
			bundledDirs: await discoverFrameworkBundledPackageDirs(repositoryRoot),
			includeUserSources: false,
		});
	});

	afterAll(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	function resolvePackage(kind: "claude-cli" | "codex-cli", role: LeanRole) {
		return leanPackageResolver({
			kind,
			registry: runtime.agentRegistry,
			domainsDir: runtime.domainsDir,
			resolver: runtime.domainResolver,
			skillPaths: runtime.skillPaths,
		})(role);
	}

	test.each([
		["claude-cli", "claude-cli"],
		["codex-cli", "codex"],
	] as const)("packages lean/builder, which declares Pi-only extensions, for %s", async (kind, target) => {
		expect(
			runtime.agentRegistry.resolve("lean/builder", "lean").extensions,
		).toContain("health-hook");

		const agentPackage = await resolvePackage(kind, "lean/builder");

		expect(agentPackage).toMatchObject({
			sourceAgentId: "lean/builder",
			tools: "coding",
			target,
		});
		expect(agentPackage.systemPrompt).toContain("You're the builder");
	});

	test("packages lean/code-reviewer with its readonly tools", async () => {
		const agentPackage = await resolvePackage(
			"claude-cli",
			"lean/code-reviewer",
		);

		expect(agentPackage).toMatchObject({
			sourceAgentId: "lean/code-reviewer",
			tools: "readonly",
		});
	});
});
