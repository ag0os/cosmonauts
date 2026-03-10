/**
 * Tests for orchestration extension wiring.
 * Verifies the cached CosmonautsRuntime is used and forwarded to runtime calls.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { AgentRegistry } from "../../lib/agents/index.ts";
import { createRegistryFromDomains } from "../../lib/agents/index.ts";
import { loadDomains } from "../../lib/domains/index.ts";
import type { ChainResult } from "../../lib/orchestration/types.ts";

// ============================================================================
// Hoisted mock references — declared before imports via vi.hoisted()
// ============================================================================

const mocks = vi.hoisted(() => ({
	runtimeCreate: vi.fn(),
	parseChain: vi.fn(),
	runChain: vi.fn(),
	createPiSpawner: vi.fn(),
}));

vi.mock("../../lib/runtime.ts", () => ({
	CosmonautsRuntime: {
		create: mocks.runtimeCreate,
	},
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

import orchestrationExtension from "../../domains/shared/extensions/orchestration/index.ts";
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
	const runtimeCreateMock = vi.mocked(mocks.runtimeCreate);
	const parseChainMock = vi.mocked(parseChain);
	const runChainMock = vi.mocked(runChain);
	const createPiSpawnerMock = vi.mocked(createPiSpawner);

	const testDomainsDir = resolve(
		fileURLToPath(import.meta.url),
		"..",
		"..",
		"..",
		"domains",
	);
	let realRegistry: AgentRegistry;

	beforeAll(async () => {
		const domains = await loadDomains(testDomainsDir);
		realRegistry = createRegistryFromDomains(domains);
	});

	function mockRuntime(overrides?: {
		domainContext?: string;
		projectSkills?: readonly string[];
	}) {
		runtimeCreateMock.mockResolvedValue({
			agentRegistry: realRegistry,
			domainContext: overrides?.domainContext,
			projectSkills: overrides?.projectSkills ?? [],
			domainsDir: testDomainsDir,
		});
	}

	beforeEach(() => {
		vi.clearAllMocks();
		mockRuntime();
	});

	test("chain_run forwards project skills from config", async () => {
		const cwd = "/tmp/project";
		const pi = createMockPi(cwd);
		orchestrationExtension(pi as never);

		mockRuntime({
			domainContext: "coding",
			projectSkills: ["typescript", "backend"],
		});
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
				domainContext: "coding",
				projectSkills: ["typescript", "backend"],
			}),
		);
		expect(parseChainMock).toHaveBeenCalledWith(
			"planner",
			expect.objectContaining({
				has: expect.any(Function),
			}),
			"coding",
		);
	});

	test("chain_run allows coordinator without completionLabel", async () => {
		const cwd = "/tmp/project";
		const pi = createMockPi(cwd);
		orchestrationExtension(pi as never);

		mockRuntime({ projectSkills: ["typescript"] });
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

		mockRuntime({ projectSkills: ["typescript"] });
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

		mockRuntime({
			domainContext: "coding",
			projectSkills: ["typescript"],
		});

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
				domainContext: "coding",
				role: "worker",
				projectSkills: ["typescript"],
			}),
		);
		expect(createPiSpawnerMock).toHaveBeenCalledWith(
			expect.objectContaining({
				has: expect.any(Function),
			}),
			expect.any(String),
		);
		expect(dispose).toHaveBeenCalledTimes(1);
	});

	test("spawn_agent denies unauthorized target role", async () => {
		const cwd = "/tmp/project";
		const pi = createMockPi(cwd, {
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:worker -->",
		});
		orchestrationExtension(pi as never);

		mockRuntime();
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

	test("spawn_agent allows authorized target with unqualified caller resolving via scan-all", async () => {
		const cwd = "/tmp/project";
		const pi = createMockPi(cwd, {
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:cosmo -->",
		});
		orchestrationExtension(pi as never);

		mockRuntime();
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

		expect(spawn).toHaveBeenCalled();
		expect(dispose).toHaveBeenCalledTimes(1);
	});

	test("spawn_agent denies unknown qualified caller ID", async () => {
		const cwd = "/tmp/project";
		const pi = createMockPi(cwd, {
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:unknown-domain/cosmo -->",
		});
		orchestrationExtension(pi as never);

		const spawn = vi.fn();
		const dispose = vi.fn();
		createPiSpawnerMock.mockReturnValue({ spawn, dispose });

		const result = await pi.callTool("spawn_agent", {
			role: "worker",
			prompt: "implement this task",
		});

		expect(spawn).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			content: [
				{
					type: "text",
					text: expect.stringContaining("unknown caller"),
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

	test("runtime is cached per-cwd across multiple tool calls", async () => {
		const cwd = "/tmp/project";
		const pi = createMockPi(cwd);
		orchestrationExtension(pi as never);

		mockRuntime({ projectSkills: ["typescript"] });
		parseChainMock.mockReturnValue([{ name: "planner", loop: false }]);
		runChainMock.mockResolvedValue({
			success: true,
			stageResults: [],
			totalDurationMs: 1,
			errors: [],
		} as ChainResult);

		await pi.callTool("chain_run", { expression: "planner" });
		await pi.callTool("chain_run", { expression: "planner" });

		// CosmonautsRuntime.create should only be called once for the same cwd
		expect(runtimeCreateMock).toHaveBeenCalledTimes(1);
	});

	test("runtime cache evicts failed bootstrap attempts", async () => {
		const cwd = "/tmp/project";
		const pi = createMockPi(cwd);
		orchestrationExtension(pi as never);

		runtimeCreateMock
			.mockRejectedValueOnce(new Error("invalid config"))
			.mockResolvedValueOnce({
				agentRegistry: realRegistry,
				domainContext: undefined,
				projectSkills: [],
				domainsDir: testDomainsDir,
			});
		parseChainMock.mockReturnValue([{ name: "planner", loop: false }]);
		runChainMock.mockResolvedValue({
			success: true,
			stageResults: [],
			totalDurationMs: 1,
			errors: [],
		} as ChainResult);

		await expect(
			pi.callTool("chain_run", { expression: "planner" }),
		).rejects.toThrow("invalid config");

		await expect(
			pi.callTool("chain_run", { expression: "planner" }),
		).resolves.toBeDefined();

		expect(runtimeCreateMock).toHaveBeenCalledTimes(2);
	});
});
