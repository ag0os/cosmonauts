/**
 * Tests for orchestration extension wiring.
 * Verifies the cached CosmonautsRuntime is used and forwarded to runtime calls.
 */

import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import "./orchestration-mocks.ts";

import orchestrationExtension from "../../domains/shared/extensions/orchestration/index.ts";
import type { AgentRegistry } from "../../lib/agents/index.ts";
import type { DomainRegistry } from "../../lib/domains/registry.ts";
import { DomainResolver } from "../../lib/domains/resolver.ts";
import { activityBus } from "../../lib/orchestration/activity-bus.ts";
import { createPiSpawner } from "../../lib/orchestration/agent-spawner.ts";
import { parseChain } from "../../lib/orchestration/chain-parser.ts";
import { runChain } from "../../lib/orchestration/chain-runner.ts";
import type { SpawnActivityEvent } from "../../lib/orchestration/message-bus.ts";
import { getOrCreateTracker } from "../../lib/orchestration/spawn-tracker.ts";
import type { ChainResult, ChainStep } from "../../lib/orchestration/types.ts";
import {
	createMockPi,
	flushAsync,
	loadOrchestrationDomainFixtures,
	testBundledCodingDir,
	testDomainsDir,
} from "./orchestration-helpers.ts";
import { getOrchestrationMocks } from "./orchestration-mocks.ts";

const mocks = getOrchestrationMocks();

describe("orchestration extension", () => {
	const runtimeCreateMock = vi.mocked(mocks.runtimeCreate);
	const parseChainMock = vi.mocked(parseChain);
	const runChainMock = vi.mocked(runChain);
	const createPiSpawnerMock = vi.mocked(createPiSpawner);

	let realRegistry: AgentRegistry;
	let realDomainRegistry: DomainRegistry;

	beforeAll(async () => {
		const fixtures = await loadOrchestrationDomainFixtures();
		realRegistry = fixtures.agentRegistry;
		realDomainRegistry = fixtures.domainRegistry;
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

	function createExtensionPi(
		cwd = "/tmp/project",
		options?: Parameters<typeof createMockPi>[1],
	) {
		const pi = createMockPi(cwd, options);
		orchestrationExtension(pi as never);
		return { cwd, pi };
	}

	function mockSuccessfulChain(steps: ChainStep[]) {
		parseChainMock.mockReturnValue(steps);
		runChainMock.mockResolvedValue({
			success: true,
			stageResults: [],
			totalDurationMs: 1,
			errors: [],
		} as ChainResult);
	}

	function mockChildSession(session: Record<string, unknown>) {
		mocks.createAgentSessionFromDefinition.mockResolvedValue({
			session,
			sessionFilePath: undefined,
		});
	}

	function createIdleChildSession(
		sessionId: string,
		extra?: Record<string, unknown>,
	) {
		return Object.assign(
			{
				sessionId,
				messages: [],
				prompt: vi.fn().mockResolvedValue(undefined),
				subscribe: vi.fn(() => vi.fn()),
				dispose: vi.fn(),
			},
			extra,
		);
	}

	function createReportChildSession(sessionId: string, report: string) {
		return createIdleChildSession(sessionId, {
			messages: [
				{
					role: "assistant",
					content: [{ type: "text", text: report }],
				},
			],
		});
	}

	async function expectAcceptedSpawn(
		pi: ReturnType<typeof createMockPi>,
		params: Record<string, unknown>,
		delayMs = 0,
	): Promise<{ status: string; spawnId: string }> {
		const result = (await pi.callTool("spawn_agent", params)) as {
			details: { status: string; spawnId: string };
		};
		await flushAsync(delayMs);
		expect(result.details.status).toBe("accepted");
		return result.details;
	}

	function expectFollowUpContaining(
		pi: ReturnType<typeof createMockPi>,
		text: string,
	) {
		expect(pi.sendUserMessage).toHaveBeenCalledWith(
			expect.stringContaining(text),
			{ deliverAs: "followUp" },
		);
	}

	function renderFallbackResult(
		toolName: "chain_run" | "spawn_agent",
		text: string,
	) {
		const { pi } = createExtensionPi();
		const tool = pi.getTool(toolName);
		expect(tool?.renderResult).toBeTypeOf("function");

		const component = tool?.renderResult?.(
			{
				content: [{ type: "text", text }],
				details: null,
			},
			{ expanded: false, isPartial: false },
			{ fg: (_color: "toolOutput", value: string) => value } as never,
		) as { render: (width: number) => string[] } | undefined;

		expect(component).toBeDefined();
		return component?.render(120).join("\n");
	}

	test("chain_run forwards project skills from config", async () => {
		const { cwd, pi } = createExtensionPi();

		mockRuntime({
			domainContext: "coding",
			projectSkills: ["typescript", "backend"],
			skillPaths: ["/skills/shared", "/skills/project"],
		});
		mockSuccessfulChain([{ name: "planner", loop: false }]);

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
		const { cwd, pi } = createExtensionPi();

		mockSuccessfulChain([{ name: "planner", loop: false }]);

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
		const { cwd, pi } = createExtensionPi();

		mockRuntime({ projectSkills: ["typescript"] });
		mockSuccessfulChain([{ name: "coordinator", loop: true }]);

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
		const { pi } = createExtensionPi();

		mockRuntime({ projectSkills: ["typescript"] });
		mockSuccessfulChain([
			{ name: "planner", loop: false },
			{ name: "coordinator", loop: true },
		]);

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
						prompt: "User request: Build auth with refresh tokens",
					},
					{ name: "coordinator", loop: true },
				],
			}),
		);
	});

	test("chain_run forwards abort signal to runChain", async () => {
		const { cwd, pi } = createExtensionPi();

		mockRuntime({ projectSkills: [] });
		mockSuccessfulChain([{ name: "planner", loop: false }]);

		const controller = new AbortController();
		const tool = pi.getTool("chain_run");
		expect(tool).toBeDefined();
		if (!tool) {
			throw new Error("chain_run tool is not registered");
		}
		await tool.execute(
			"call-id",
			{ expression: "planner" },
			controller.signal,
			undefined,
			{
				cwd,
				getSystemPrompt: () => "",
				sessionManager: { getSessionId: () => "test-session" },
			},
		);

		expect(runChainMock).toHaveBeenCalledWith(
			expect.objectContaining({
				signal: controller.signal,
			}),
		);
	});

	test("spawn_agent forwards project skills from config", async () => {
		const { cwd, pi } = createExtensionPi("/tmp/project", {
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:cosmo -->",
		});

		mockRuntime({
			domainContext: "coding",
			projectSkills: ["typescript"],
			skillPaths: ["/skills/shared", "/skills/project"],
		});

		const mockSession = createIdleChildSession("child-session-1");
		mockChildSession(mockSession);

		const result = await expectAcceptedSpawn(pi, {
			role: "worker",
			prompt: "implement this task",
		});
		expect(typeof result.spawnId).toBe("string");

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

	test("spawn_agent includes the child's full final report in the completion message", async () => {
		const { pi } = createExtensionPi("/tmp/project", {
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:quality-manager -->",
		});

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
		const mockSession = createReportChildSession(
			"child-session-verifier",
			verifierReport,
		);
		mockChildSession(mockSession);

		const result = await expectAcceptedSpawn(pi, {
			role: "verifier",
			prompt: "Validate these claims",
		});

		expectFollowUpContaining(
			pi,
			`[spawn_completion] spawnId=${result.spawnId} role=verifier outcome=success`,
		);
		expectFollowUpContaining(pi, verifierReport);
	});

	test("spawn_agent includes full final report for non-verifier roles (e.g. explorer)", async () => {
		const { pi } = createExtensionPi("/tmp/project", {
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:cosmo -->",
		});

		mockRuntime({ domainContext: "coding" });
		const explorerReport = `# Codebase Exploration

## Entry points
- bin/cosmonauts — CLI shim
- cli/index.ts — commander setup

## Key modules
- lib/orchestration/agent-spawner.ts — spawner factory
- lib/orchestration/spawn-tracker.ts — per-session tracker

## Notes
Spawns are detached Promises that deliver completions via sendUserMessage.`;
		const mockSession = {
			sessionId: "child-session-explorer",
			messages: [
				{
					role: "assistant",
					content: [{ type: "text", text: explorerReport }],
				},
			],
			prompt: vi.fn().mockResolvedValue(undefined),
			subscribe: vi.fn(() => vi.fn()),
			dispose: vi.fn(),
			getSessionStats: vi.fn(() => ({
				tokens: { input: 0, output: 0, total: 0 },
				cost: 0,
				userMessages: 1,
				toolCalls: 0,
			})),
		};
		mockChildSession(mockSession);

		const result = await expectAcceptedSpawn(pi, {
			role: "explorer",
			prompt: "explore the orchestration layer",
		});

		expectFollowUpContaining(
			pi,
			`[spawn_completion] spawnId=${result.spawnId} role=explorer outcome=success`,
		);
		expectFollowUpContaining(pi, explorerReport);
	});

	test("spawn_agent publishes child session activity events", async () => {
		const { pi } = createExtensionPi("/tmp/project", {
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:cosmo -->",
			sessionId: "parent-session-activity",
		});

		mockRuntime({ domainContext: "coding" });

		const activityEvents: SpawnActivityEvent[] = [];
		const activityToken = activityBus.subscribe<SpawnActivityEvent>(
			"spawn_activity",
			(event) => activityEvents.push(event),
		);
		let childEventHandler:
			| ((event: { type: string; [key: string]: unknown }) => void)
			| undefined;
		const mockSession = {
			sessionId: "child-session-activity",
			messages: [],
			prompt: vi.fn(async () => {
				childEventHandler?.({
					type: "tool_execution_start",
					toolName: "read",
					args: { file_path: "/tmp/project/src/index.ts" },
				});
				childEventHandler?.({
					type: "tool_execution_end",
					toolName: "read",
					isError: false,
				});
				childEventHandler?.({ type: "turn_start" });
				childEventHandler?.({ type: "turn_end" });
				childEventHandler?.({ type: "auto_compaction_start" });
			}),
			subscribe: vi.fn((handler) => {
				childEventHandler = handler;
				return vi.fn();
			}),
			dispose: vi.fn(),
		};
		mockChildSession(mockSession);

		try {
			const result = await expectAcceptedSpawn(pi, {
				role: "worker",
				prompt: "emit activity",
				runtimeContext: {
					mode: "sub-agent",
					parentRole: "cosmo",
					taskId: "TASK-238",
				},
			});

			expect(activityEvents).toMatchObject([
				{
					type: "spawn_activity",
					spawnId: result.spawnId,
					parentSessionId: "parent-session-activity",
					role: "worker",
					taskId: "TASK-238",
					activity: {
						kind: "tool_start",
						toolName: "read",
						summary: "read index.ts",
					},
				},
				{
					activity: { kind: "tool_end", toolName: "read", isError: false },
				},
				{ activity: { kind: "turn_start" } },
				{ activity: { kind: "turn_end" } },
				{ activity: { kind: "compaction" } },
			]);
		} finally {
			activityBus.unsubscribe(activityToken);
		}
	});

	test("spawn_agent cleans up child session subscriptions when prompt throws", async () => {
		const { pi } = createExtensionPi("/tmp/project", {
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:cosmo -->",
		});

		mockRuntime({ domainContext: "coding" });
		const unsubscribeActivity = vi.fn();
		const mockSession = {
			sessionId: "child-session-throws",
			messages: [],
			prompt: vi.fn(async () => {
				throw new Error("prompt failed after subscribe");
			}),
			subscribe: vi.fn(() => unsubscribeActivity),
			dispose: vi.fn(),
		};
		mockChildSession(mockSession);

		await expectAcceptedSpawn(pi, {
			role: "worker",
			prompt: "fail after subscribing",
		});

		expect(mockSession.subscribe).toHaveBeenCalledOnce();
		expect(unsubscribeActivity).toHaveBeenCalledOnce();
		expect(mockSession.dispose).toHaveBeenCalledOnce();
		expectFollowUpContaining(pi, "prompt failed after subscribe");
	});

	test("spawn_agent waits for nested child completions before completing the spawned session", async () => {
		const { pi } = createExtensionPi("/tmp/project", {
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:cosmo -->",
		});

		mockRuntime({ domainContext: "coding" });

		const childSessionId = "child-session-quality-manager";
		const nestedReport = "# Nested verifier report\n\nAll checks passed.";
		const finalReport = "Quality manager synthesized nested verifier result.";
		const mockSession = {
			sessionId: childSessionId,
			messages: [] as Array<{
				role: string;
				content: Array<{ type: string; text: string }>;
			}>,
			prompt: vi.fn(async (message: string) => {
				if (message === "run quality checks") {
					const tracker = getOrCreateTracker(childSessionId);
					expect(tracker.deliveryMode).toBe("external");
					tracker.register("nested-spawn", "verifier", 2);
					setTimeout(
						() =>
							tracker.complete("nested-spawn", "checks passed", nestedReport),
						0,
					);
					mockSession.messages.push({
						role: "assistant",
						content: [{ type: "text", text: "Waiting for nested verifier." }],
					});
					return;
				}

				expect(message).toContain("[spawn_completion]");
				expect(message).toContain("summary=checks passed");
				expect(message).toContain(nestedReport);
				mockSession.messages.push({
					role: "assistant",
					content: [{ type: "text", text: finalReport }],
				});
			}),
			subscribe: vi.fn(() => vi.fn()),
			dispose: vi.fn(),
		};
		mockChildSession(mockSession);

		await expectAcceptedSpawn(
			pi,
			{
				role: "quality-manager",
				prompt: "run quality checks",
			},
			20,
		);

		expect(mockSession.prompt).toHaveBeenCalledTimes(2);
		expect(mockSession.dispose).toHaveBeenCalledTimes(1);
		expectFollowUpContaining(pi, finalReport);
	});

	test("spawn_agent denies unauthorized target role", async () => {
		const { pi } = createExtensionPi("/tmp/project", {
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:worker -->",
		});

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
		const { pi } = createExtensionPi("/tmp/project", {
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:cosmo -->",
		});

		mockRuntime();
		const mockSession = {
			sessionId: "child-session-1",
			messages: [],
			prompt: vi.fn().mockResolvedValue(undefined),
			dispose: vi.fn(),
		};
		mockChildSession(mockSession);

		const result = (await pi.callTool("spawn_agent", {
			role: "worker",
			prompt: "implement this task",
		})) as { details: { status: string } };

		expect(result.details.status).toBe("accepted");
	});

	test("spawn_agent denies unknown qualified caller ID", async () => {
		const { pi } = createExtensionPi("/tmp/project", {
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:unknown-domain/cosmo -->",
		});

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
		const { pi } = createExtensionPi("/tmp/project", {
			systemPrompt: "no marker here",
		});

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
		expect(renderFallbackResult("chain_run", "config load failed")).toContain(
			"config load failed",
		);
	});

	test("spawn_agent renderer falls back to result text when details are missing", () => {
		expect(
			renderFallbackResult("spawn_agent", "failed to load project config"),
		).toContain("failed to load project config");
	});

	test("runtime is cached per-cwd across multiple tool calls", async () => {
		const { pi } = createExtensionPi();

		mockRuntime({ projectSkills: ["typescript"] });
		mockSuccessfulChain([{ name: "planner", loop: false }]);

		await pi.callTool("chain_run", { expression: "planner" });
		await pi.callTool("chain_run", { expression: "planner" });

		// CosmonautsRuntime.create should only be called once for the same cwd
		expect(runtimeCreateMock).toHaveBeenCalledTimes(1);
	});

	test("runtime cache evicts failed bootstrap attempts", async () => {
		const { pi } = createExtensionPi();

		runtimeCreateMock
			.mockRejectedValueOnce(new Error("invalid config"))
			.mockResolvedValueOnce({
				agentRegistry: realRegistry,
				domainContext: undefined,
				projectSkills: [],
				skillPaths: [],
				domainRegistry: realDomainRegistry,
			});
		mockSuccessfulChain([{ name: "planner", loop: false }]);

		await expect(
			pi.callTool("chain_run", { expression: "planner" }),
		).rejects.toThrow("invalid config");

		await expect(
			pi.callTool("chain_run", { expression: "planner" }),
		).resolves.toBeDefined();

		expect(runtimeCreateMock).toHaveBeenCalledTimes(2);
	});
});
