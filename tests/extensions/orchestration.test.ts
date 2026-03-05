/**
 * Tests for orchestration extension wiring.
 * Verifies project skill filters are loaded and forwarded to runtime calls.
 */

import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ProjectConfig } from "../../lib/config/types.ts";
import type { ChainResult } from "../../lib/orchestration/types.ts";

// ============================================================================
// Hoisted mock references — declared before imports via vi.hoisted()
// ============================================================================

const mocks = vi.hoisted(() => ({
	loadProjectConfig: vi.fn(),
	parseChain: vi.fn(),
	runChain: vi.fn(),
	createPiSpawner: vi.fn(),
}));

vi.mock("../../lib/config/index.ts", () => ({
	loadProjectConfig: mocks.loadProjectConfig,
}));

vi.mock("../../lib/orchestration/chain-parser.ts", () => ({
	parseChain: mocks.parseChain,
}));

vi.mock("../../lib/orchestration/chain-runner.ts", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("../../lib/orchestration/chain-runner.ts")
		>();
	return {
		...actual,
		runChain: mocks.runChain,
	};
});

vi.mock("../../lib/orchestration/agent-spawner.ts", () => ({
	createPiSpawner: mocks.createPiSpawner,
}));

import orchestrationExtension from "../../extensions/orchestration/index.ts";
import { loadProjectConfig } from "../../lib/config/index.ts";
import { createPiSpawner } from "../../lib/orchestration/agent-spawner.ts";
import { parseChain } from "../../lib/orchestration/chain-parser.ts";
import { runChain } from "../../lib/orchestration/chain-runner.ts";

interface RegisteredTool {
	name: string;
	execute: (...args: unknown[]) => Promise<unknown>;
	renderResult?: (...args: unknown[]) => unknown;
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
		getTool(name: string) {
			return tools.get(name);
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

	test("chain_run allows coordinator without completionLabel", async () => {
		const cwd = "/tmp/project";
		const pi = createMockPi(cwd);
		orchestrationExtension(pi as never);

		loadProjectConfigMock.mockResolvedValue({
			skills: ["typescript"],
		} as ProjectConfig);
		parseChainMock.mockReturnValue([{ name: "coordinator", loop: true }]);
		runChainMock.mockResolvedValue({
			success: true,
			stageResults: [],
			totalDurationMs: 1,
			errors: [],
		} as ChainResult);

		await pi.callTool("chain_run", {
			expression: "coordinator",
		});

		expect(runChainMock).toHaveBeenCalledWith(
			expect.objectContaining({
				projectRoot: cwd,
				completionLabel: undefined,
				stages: [{ name: "coordinator", loop: true }],
			}),
		);
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

	test("chain_run renderer falls back to result text when details are missing", () => {
		const cwd = "/tmp/project";
		const pi = createMockPi(cwd);
		orchestrationExtension(pi as never);

		const tool = pi.getTool("chain_run");
		expect(tool?.renderResult).toBeTypeOf("function");

		const component = tool?.renderResult?.(
			{
				content: [{ type: "text", text: "config load failed" }],
				details: null,
			},
			{ expanded: false, isPartial: false },
			{ fg: (_color: "toolOutput", text: string) => text } as never,
		) as { render: (width: number) => string[] } | undefined;

		expect(component).toBeDefined();
		expect(component?.render(120).join("\n")).toContain("config load failed");
	});

	test("spawn_agent renderer falls back to result text when details are missing", () => {
		const cwd = "/tmp/project";
		const pi = createMockPi(cwd);
		orchestrationExtension(pi as never);

		const tool = pi.getTool("spawn_agent");
		expect(tool?.renderResult).toBeTypeOf("function");

		const component = tool?.renderResult?.(
			{
				content: [{ type: "text", text: "failed to load project config" }],
				details: null,
			},
			{ expanded: false, isPartial: false },
			{ fg: (_color: "toolOutput", text: string) => text } as never,
		) as { render: (width: number) => string[] } | undefined;

		expect(component).toBeDefined();
		expect(component?.render(120).join("\n")).toContain(
			"failed to load project config",
		);
	});
});
