/**
 * Tests for orchestration extension wiring.
 * Verifies project skill filters are loaded and forwarded to runtime calls.
 */

import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ProjectConfig } from "../../lib/config/types.ts";
import type { ChainResult } from "../../lib/orchestration/types.ts";

vi.mock("../../lib/config/index.ts", () => ({
	loadProjectConfig: vi.fn(),
}));

vi.mock("../../lib/orchestration/chain-parser.ts", () => ({
	parseChain: vi.fn(),
}));

vi.mock("../../lib/orchestration/chain-runner.ts", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("../../lib/orchestration/chain-runner.ts")
		>();
	return {
		...actual,
		runChain: vi.fn(),
	};
});

vi.mock("../../lib/orchestration/agent-spawner.ts", () => ({
	createPiSpawner: vi.fn(),
}));

import orchestrationExtension from "../../extensions/orchestration/index.ts";
import { loadProjectConfig } from "../../lib/config/index.ts";
import { createPiSpawner } from "../../lib/orchestration/agent-spawner.ts";
import { parseChain } from "../../lib/orchestration/chain-parser.ts";
import { runChain } from "../../lib/orchestration/chain-runner.ts";

interface RegisteredTool {
	name: string;
	execute: (...args: unknown[]) => Promise<unknown>;
}

interface MockPiOptions {
	systemPrompt?: string;
}

function createMockPi(cwd: string, options?: MockPiOptions) {
	const tools = new Map<string, RegisteredTool>();
	return {
		registerTool(def: RegisteredTool) {
			tools.set(def.name, def);
		},
		async callTool(name: string, params: unknown) {
			const tool = tools.get(name);
			if (!tool) throw new Error(`Tool not found: ${name}`);
			return tool.execute("call-id", params, undefined, undefined, {
				cwd,
				getSystemPrompt: () => options?.systemPrompt ?? "",
			});
		},
	};
}

describe("orchestration extension", () => {
	const loadProjectConfigMock = vi.mocked(loadProjectConfig);
	const parseChainMock = vi.mocked(parseChain);
	const runChainMock = vi.mocked(runChain);
	const createPiSpawnerMock = vi.mocked(createPiSpawner);

	beforeEach(() => {
		vi.clearAllMocks();
	});

	test("chain_run forwards project skills from config", async () => {
		const cwd = "/tmp/project";
		const pi = createMockPi(cwd);
		orchestrationExtension(pi as never);

		loadProjectConfigMock.mockResolvedValue({
			skills: ["typescript", "backend"],
		} as ProjectConfig);
		parseChainMock.mockReturnValue([{ name: "planner", loop: false }]);
		runChainMock.mockResolvedValue({
			success: true,
			stageResults: [],
			totalDurationMs: 1,
			errors: [],
		} as ChainResult);

		await pi.callTool("chain_run", { expression: "planner" });

		expect(runChainMock).toHaveBeenCalledWith(
			expect.objectContaining({
				projectRoot: cwd,
				projectSkills: ["typescript", "backend"],
			}),
		);
	});

	test("chain_run requires completionLabel when coordinator is present", async () => {
		const cwd = "/tmp/project";
		const pi = createMockPi(cwd);
		orchestrationExtension(pi as never);

		parseChainMock.mockReturnValue([{ name: "coordinator", loop: true }]);

		const result = await pi.callTool("chain_run", {
			expression: "coordinator",
		});

		expect(runChainMock).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			content: [
				{
					type: "text",
					text: 'chain_run requires completionLabel when coordinator is present (example: "plan:my-plan")',
				},
			],
		});
	});

	test("chain_run injects user prompt into first stage and forwards completion label", async () => {
		const cwd = "/tmp/project";
		const pi = createMockPi(cwd);
		orchestrationExtension(pi as never);

		loadProjectConfigMock.mockResolvedValue({
			skills: ["typescript"],
		} as ProjectConfig);
		parseChainMock.mockReturnValue([
			{ name: "planner", loop: false },
			{ name: "coordinator", loop: true },
		]);
		runChainMock.mockResolvedValue({
			success: true,
			stageResults: [],
			totalDurationMs: 1,
			errors: [],
		} as ChainResult);

		await pi.callTool("chain_run", {
			expression: "planner -> coordinator",
			prompt: "Build auth with refresh tokens",
			completionLabel: "plan:auth-system",
		});

		expect(runChainMock).toHaveBeenCalledWith(
			expect.objectContaining({
				completionLabel: "plan:auth-system",
				stages: [
					{
						name: "planner",
						loop: false,
						prompt:
							"Analyze the project and design an implementation plan.\n\nUser request: Build auth with refresh tokens",
					},
					{ name: "coordinator", loop: true },
				],
			}),
		);
	});

	test("spawn_agent forwards project skills from config", async () => {
		const cwd = "/tmp/project";
		const pi = createMockPi(cwd, {
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:cosmo -->",
		});
		orchestrationExtension(pi as never);

		loadProjectConfigMock.mockResolvedValue({
			skills: ["typescript"],
		} as ProjectConfig);

		const spawn = vi.fn().mockResolvedValue({
			success: true,
			sessionId: "session-1",
			messages: [],
		});
		const dispose = vi.fn();
		createPiSpawnerMock.mockReturnValue({ spawn, dispose });

		await pi.callTool("spawn_agent", {
			role: "worker",
			prompt: "implement this task",
		});

		expect(spawn).toHaveBeenCalledWith(
			expect.objectContaining({
				cwd,
				role: "worker",
				projectSkills: ["typescript"],
			}),
		);
		expect(dispose).toHaveBeenCalledTimes(1);
	});

	test("spawn_agent denies unauthorized target role", async () => {
		const cwd = "/tmp/project";
		const pi = createMockPi(cwd, {
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:worker -->",
		});
		orchestrationExtension(pi as never);

		loadProjectConfigMock.mockResolvedValue({ skills: [] } as ProjectConfig);
		const spawn = vi.fn();
		const dispose = vi.fn();
		createPiSpawnerMock.mockReturnValue({ spawn, dispose });

		const result = await pi.callTool("spawn_agent", {
			role: "planner",
			prompt: "plan this",
		});

		expect(spawn).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			content: [
				{
					type: "text",
					text: "spawn_agent denied: worker cannot spawn planner",
				},
			],
		});
	});

	test("spawn_agent denies when caller marker is missing", async () => {
		const cwd = "/tmp/project";
		const pi = createMockPi(cwd, { systemPrompt: "no marker here" });
		orchestrationExtension(pi as never);

		const spawn = vi.fn();
		const dispose = vi.fn();
		createPiSpawnerMock.mockReturnValue({ spawn, dispose });

		const result = await pi.callTool("spawn_agent", {
			role: "worker",
			prompt: "implement this",
		});

		expect(spawn).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			content: [
				{
					type: "text",
					text: "spawn_agent denied: caller role could not be resolved from runtime identity marker",
				},
			],
		});
	});
});
