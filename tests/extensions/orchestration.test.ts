/**
 * Tests for orchestration extension wiring.
 * Verifies the cached CosmonautsRuntime is used and forwarded to runtime calls.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { AgentRegistry } from "../../lib/agents/index.ts";
import { createRegistryFromDomains } from "../../lib/agents/index.ts";
import { loadDomainsFromSources } from "../../lib/domains/index.ts";
import { DomainRegistry } from "../../lib/domains/registry.ts";
import { DomainResolver } from "../../lib/domains/resolver.ts";
import type { ChainResult } from "../../lib/orchestration/types.ts";

// ============================================================================
// Hoisted mock references — declared before imports via vi.hoisted()
// ============================================================================

const mocks = vi.hoisted(() => ({
	runtimeCreate: vi.fn(),
	parseChain: vi.fn(),
	runChain: vi.fn(),
	createPiSpawner: vi.fn(),
	createAgentSessionFromDefinition: vi.fn(),
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

vi.mock("../../lib/orchestration/session-factory.ts", () => ({
	createAgentSessionFromDefinition: mocks.createAgentSessionFromDefinition,
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
	/** Session ID for the parent session (used by spawn_agent depth tracking). */
	sessionId?: string;
}

function createMockPi(cwd: string, options?: MockPiOptions) {
	const tools = new Map<string, RegisteredTool>();
	const sessionId = options?.sessionId ?? `test-session-${Math.random()}`;
	const sendUserMessage = vi.fn();
	return {
		registerTool(def: RegisteredTool) {
			tools.set(def.name, def);
		},
		registerMessageRenderer: vi.fn(),
		sendMessage: vi.fn(),
		on: vi.fn(),
		sendUserMessage,
		getTool(name: string) {
			return tools.get(name);
		},
		async callTool(name: string, params: unknown) {
			const tool = tools.get(name);
			if (!tool) throw new Error(`Tool not found: ${name}`);
			return tool.execute("call-id", params, undefined, undefined, {
				cwd,
				getSystemPrompt: () => options?.systemPrompt ?? "",
				sessionManager: { getSessionId: () => sessionId },
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
	const testBundledCodingDir = resolve(
		fileURLToPath(import.meta.url),
		"..",
		"..",
		"..",
		"bundled",
		"coding",
	);
	let realRegistry: AgentRegistry;
	let realDomainRegistry: DomainRegistry;

	beforeAll(async () => {
		const domains = await loadDomainsFromSources([
			{ domainsDir: testDomainsDir, origin: "framework", precedence: 1 },
			{ domainsDir: testBundledCodingDir, origin: "bundled", precedence: 2 },
		]);
		realRegistry = createRegistryFromDomains(domains);
		realDomainRegistry = new DomainRegistry(domains);
	});

	function mockRuntime(overrides?: {
		domainContext?: string;
		projectSkills?: readonly string[];
		skillPaths?: readonly string[];
	}) {
		const resolver = new DomainResolver(realDomainRegistry);
		runtimeCreateMock.mockResolvedValue({
			agentRegistry: realRegistry,
			domainContext: overrides?.domainContext,
			projectSkills: overrides?.projectSkills ?? [],
			skillPaths: overrides?.skillPaths ?? [],
			domainRegistry: realDomainRegistry,
			domainResolver: resolver,
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
			skillPaths: ["/skills/shared", "/skills/project"],
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
				skillPaths: ["/skills/shared", "/skills/project"],
				domainsDir: testDomainsDir,
				resolver: expect.any(DomainResolver),
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

	test("orchestration runtime includes bundled coding package in framework dev mode", async () => {
		const cwd = "/tmp/project";
		const pi = createMockPi(cwd);
		orchestrationExtension(pi as never);

		parseChainMock.mockReturnValue([{ name: "planner", loop: false }]);
		runChainMock.mockResolvedValue({
			success: true,
			stageResults: [],
			totalDurationMs: 1,
			errors: [],
		} as ChainResult);

		await pi.callTool("chain_run", { expression: "planner" });

		expect(runtimeCreateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				builtinDomainsDir: testDomainsDir,
				projectRoot: cwd,
				bundledDirs: expect.arrayContaining([testBundledCodingDir]),
			}),
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
				steps: [{ name: "coordinator", loop: true }],
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
				steps: [
					{
						name: "planner",
						loop: false,
						prompt: "Build auth with refresh tokens",
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
			skillPaths: ["/skills/shared", "/skills/project"],
		});

		const mockSession = {
			sessionId: "child-session-1",
			messages: [],
			prompt: vi.fn().mockResolvedValue(undefined),
			subscribe: vi.fn(() => vi.fn()),
			dispose: vi.fn(),
		};
		mocks.createAgentSessionFromDefinition.mockResolvedValue({
			session: mockSession,
			sessionFilePath: undefined,
		});

		const result = (await pi.callTool("spawn_agent", {
			role: "worker",
			prompt: "implement this task",
		})) as { details: { status: string; spawnId: string } };

		// Let background Promise settle so session factory was called
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(result.details.status).toBe("accepted");
		expect(typeof result.details.spawnId).toBe("string");

		expect(mocks.createAgentSessionFromDefinition).toHaveBeenCalledWith(
			expect.any(Object), // targetDef
			expect.objectContaining({
				cwd,
				domainContext: "coding",
				role: "worker",
				projectSkills: ["typescript"],
				skillPaths: ["/skills/shared", "/skills/project"],
			}),
			testDomainsDir, // domainsDir
			expect.any(DomainResolver), // resolver
		);
		expect(mockSession.dispose).toHaveBeenCalledTimes(1);
	});

	test("spawn_agent includes the verifier's full final report in the completion message", async () => {
		const cwd = "/tmp/project";
		const pi = createMockPi(cwd, {
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:quality-manager -->",
		});
		orchestrationExtension(pi as never);

		mockRuntime({ domainContext: "coding" });
		const verifierReport = `# Verification Report

## Summary

2/3 claims passed

## Claims

- id: C-001
  claim: "All tests pass"
  result: pass
  evidence: "bun run test exited 0"

- id: C-002
  claim: "Lint passes"
  result: fail
  evidence: "bun run lint exited 1"`;
		const mockSession = {
			sessionId: "child-session-verifier",
			messages: [
				{
					role: "assistant",
					content: [{ type: "text", text: verifierReport }],
				},
			],
			prompt: vi.fn().mockResolvedValue(undefined),
			subscribe: vi.fn(() => vi.fn()),
			dispose: vi.fn(),
		};
		mocks.createAgentSessionFromDefinition.mockResolvedValue({
			session: mockSession,
			sessionFilePath: undefined,
		});

		const result = (await pi.callTool("spawn_agent", {
			role: "verifier",
			prompt: "Validate these claims",
		})) as { details: { status: string; spawnId: string } };

		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(result.details.status).toBe("accepted");
		expect(pi.sendUserMessage).toHaveBeenCalledWith(
			expect.stringContaining(
				`[spawn_completion] spawnId=${result.details.spawnId} role=verifier outcome=success`,
			),
			{ deliverAs: "followUp" },
		);
		expect(pi.sendUserMessage).toHaveBeenCalledWith(
			expect.stringContaining(verifierReport),
			{ deliverAs: "followUp" },
		);
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
		const mockSession = {
			sessionId: "child-session-1",
			messages: [],
			prompt: vi.fn().mockResolvedValue(undefined),
			dispose: vi.fn(),
		};
		mocks.createAgentSessionFromDefinition.mockResolvedValue({
			session: mockSession,
			sessionFilePath: undefined,
		});

		const result = (await pi.callTool("spawn_agent", {
			role: "worker",
			prompt: "implement this task",
		})) as { details: { status: string } };

		expect(result.details.status).toBe("accepted");
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
				skillPaths: [],
				domainRegistry: realDomainRegistry,
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
