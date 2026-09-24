/**
 * Tests for orchestration extension wiring.
 * Verifies the cached CosmonautsRuntime is used and forwarded to runtime calls.
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import "./orchestration-mocks.ts";

vi.mock("../../lib/packages/dev-bundled.ts", () => ({
	discoverFrameworkBundledPackageDirs: vi.fn(async () => [
		"/framework/bundled/alpha",
	]),
}));

import orchestrationExtension from "../../domains/shared/extensions/orchestration/index.ts";
import type { AgentDefinition } from "../../lib/agents/index.ts";
import { AgentRegistry } from "../../lib/agents/index.ts";
import type { DomainRegistry } from "../../lib/domains/registry.ts";
import { DomainResolver } from "../../lib/domains/resolver.ts";
import { FileRunStore } from "../../lib/durable-runtime/index.ts";
import { activityBus } from "../../lib/orchestration/activity-bus.ts";
import { createPiSpawner } from "../../lib/orchestration/agent-spawner.ts";
import { parseChain } from "../../lib/orchestration/chain-parser.ts";
import { runChain } from "../../lib/orchestration/chain-runner.ts";
import type { SpawnActivityEvent } from "../../lib/orchestration/message-bus.ts";
import {
	registerQualityReviewSession,
	removeQualityReviewSession,
} from "../../lib/orchestration/quality-review-context.ts";
import { launchQualityReview } from "../../lib/orchestration/quality-review-launch.ts";
import { enforceQualityReviewProfile } from "../../lib/orchestration/quality-review-profile.ts";
import { renderQualityReviewReport } from "../../lib/orchestration/quality-review-report.ts";
import {
	getOrCreateTracker,
	removeTracker,
} from "../../lib/orchestration/spawn-tracker.ts";
import type { ChainResult, ChainStep } from "../../lib/orchestration/types.ts";
import {
	createMockPi,
	flushAsync,
	loadOrchestrationDomainFixtures,
	testBundledAlphaDir,
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
		const fixtures = await loadOrchestrationDomainFixtures({
			domainId: "alpha",
		});
		realRegistry = fixtures.agentRegistry;
		realDomainRegistry = fixtures.domainRegistry;
	});

	function mockRuntime(overrides?: {
		domainContext?: string;
		projectSkills?: readonly string[];
		skillPaths?: readonly string[];
		agentRegistry?: AgentRegistry;
	}) {
		const resolver = new DomainResolver(realDomainRegistry);
		runtimeCreateMock.mockResolvedValue({
			agentRegistry: overrides?.agentRegistry ?? realRegistry,
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
		const pi = createMockPi(cwd, {
			defaultSystemPrompt: "<!-- COSMONAUTS_AGENT_ID:alpha/cody -->",
			...options,
		});
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

	function makeAgent(
		id: string,
		domain: string,
		overrides: Partial<AgentDefinition> = {},
	): AgentDefinition {
		return {
			id,
			domain,
			description: `${domain}/${id}`,
			capabilities: [],
			model: "test/model",
			tools: "none",
			extensions: [],
			skills: [],
			projectContext: false,
			session: "ephemeral",
			loop: false,
			...overrides,
		};
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
			domainContext: "alpha",
			projectSkills: ["typescript", "backend"],
			skillPaths: ["/skills/shared", "/skills/project"],
		});
		mockSuccessfulChain([{ name: "coordinator", loop: true }]);

		await pi.callTool("chain_run", { expression: "coordinator" });

		expect(runChainMock).toHaveBeenCalledWith(
			expect.objectContaining({
				projectRoot: cwd,
				domainContext: "alpha",
				projectSkills: ["typescript", "backend"],
				skillPaths: ["/skills/shared", "/skills/project"],
				domainsDir: testDomainsDir,
				resolver: expect.any(DomainResolver),
			}),
		);
		expect(parseChainMock).toHaveBeenCalledWith(
			"coordinator",
			expect.objectContaining({
				has: expect.any(Function),
			}),
			"alpha",
			"alpha",
		);
	});

	test("orchestration runtime includes a synthetic bundled package in framework dev mode", async () => {
		const { cwd, pi } = createExtensionPi();

		mockSuccessfulChain([{ name: "coordinator", loop: true }]);

		await pi.callTool("chain_run", { expression: "coordinator" });

		expect(runtimeCreateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				builtinDomainsDir: testDomainsDir,
				projectRoot: cwd,
				bundledDirs: expect.arrayContaining([testBundledAlphaDir]),
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

	test("chain_run forwards timeout options to runChain", async () => {
		const { pi } = createExtensionPi();

		mockSuccessfulChain([{ name: "coordinator", loop: true }]);

		await pi.callTool("chain_run", {
			expression: "coordinator",
			timeoutMs: 3_600_000,
			spawnTimeoutMs: 900_000,
		});

		expect(runChainMock).toHaveBeenCalledWith(
			expect.objectContaining({
				timeoutMs: 3_600_000,
				spawnTimeoutMs: 900_000,
			}),
		);
	});

	test("chain_run forwards abort signal to runChain", async () => {
		const { cwd, pi } = createExtensionPi();

		mockRuntime({ projectSkills: [] });
		mockSuccessfulChain([{ name: "coordinator", loop: true }]);

		const controller = new AbortController();
		const tool = pi.getTool("chain_run");
		expect(tool).toBeDefined();
		if (!tool) {
			throw new Error("chain_run tool is not registered");
		}
		await tool.execute(
			"call-id",
			{ expression: "coordinator" },
			controller.signal,
			undefined,
			{
				cwd,
				getSystemPrompt: () => "<!-- COSMONAUTS_AGENT_ID:alpha/cody -->",
				sessionManager: { getSessionId: () => "test-session" },
			},
		);

		expect(runChainMock).toHaveBeenCalledWith(
			expect.objectContaining({
				signal: controller.signal,
			}),
		);
	});

	test("chain_run includes partial summaries for failed stages", async () => {
		const { pi } = createExtensionPi();
		const stage = { name: "coordinator", loop: true };

		mockRuntime({ projectSkills: [] });
		parseChainMock.mockReturnValue([stage]);
		runChainMock.mockResolvedValue({
			success: false,
			stageResults: [
				{
					stage,
					success: false,
					iterations: 2,
					durationMs: 1000,
					error:
						'Loop stage "coordinator" reached max iterations (2) before completion',
					summary: "Implemented TASK-123 and blocked TASK-124.",
				},
			],
			totalDurationMs: 1000,
			errors: [
				'Loop stage "coordinator" reached max iterations (2) before completion',
			],
		} as ChainResult);

		const result = (await pi.callTool("chain_run", {
			expression: "coordinator",
		})) as { content: Array<{ type: "text"; text: string }> };

		expect(result.content[0]?.text).toContain(
			'- coordinator: FAILED — Loop stage "coordinator" reached max iterations (2) before completion — Implemented TASK-123 and blocked TASK-124.',
		);
	});

	test("spawn_agent forwards project skills from config", async () => {
		const { cwd, pi } = createExtensionPi("/tmp/project", {
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:alpha/cody -->",
		});

		mockRuntime({
			domainContext: "alpha",
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
				domainContext: "alpha",
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

		mockRuntime({ domainContext: "alpha" });
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
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:alpha/cody -->",
		});

		mockRuntime({ domainContext: "alpha" });
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
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:alpha/cody -->",
			sessionId: "parent-session-activity",
		});

		mockRuntime({ domainContext: "alpha" });

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
				childEventHandler?.({ type: "compaction_start" });
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
					parentRole: "coordinator",
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
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:alpha/cody -->",
		});

		mockRuntime({ domainContext: "alpha" });
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
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:alpha/cody -->",
		});

		mockRuntime({ domainContext: "alpha" });

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

	test("spawn_agent delivers every nested completion when two children settle in the same tick", async () => {
		const { pi } = createExtensionPi("/tmp/project", {
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:alpha/cody -->",
		});

		mockRuntime({ domainContext: "alpha" });

		const childSessionId = "child-session-same-tick";
		const prompts: string[] = [];
		const mockSession = {
			sessionId: childSessionId,
			messages: [] as Array<{
				role: string;
				content: Array<{ type: string; text: string }>;
			}>,
			prompt: vi.fn(async (message: string) => {
				prompts.push(message);
				if (prompts.length === 1) {
					const tracker = getOrCreateTracker(childSessionId);
					tracker.register("nested-1", "verifier", 2);
					tracker.register("nested-2", "verifier", 2);
					setTimeout(() => {
						tracker.complete("nested-1", "first done");
						tracker.complete("nested-2", "second done");
					}, 0);
				}
				mockSession.messages.push({
					role: "assistant",
					content: [{ type: "text", text: `turn ${prompts.length}` }],
				});
			}),
			subscribe: vi.fn(() => vi.fn()),
			dispose: vi.fn(),
		};
		mockChildSession(mockSession);

		await expectAcceptedSpawn(
			pi,
			{ role: "quality-manager", prompt: "run quality checks" },
			20,
		);

		expect(prompts.filter((p) => p.includes("spawnId=nested-1"))).toHaveLength(
			1,
		);
		expect(prompts.filter((p) => p.includes("spawnId=nested-2"))).toHaveLength(
			1,
		);
	});

	test("chain_run passes the caller domain as requester while preserving default resolution context", async () => {
		const { pi } = createExtensionPi("/tmp/project", {
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:main/cosmo -->",
		});
		const registry = new AgentRegistry(
			[makeAgent("cosmo", "main"), makeAgent("secret", "target")],
			{
				internalAgentsByDomain: new Map([["target", new Set(["secret"])]]),
			},
		);

		mockRuntime({ domainContext: "target", agentRegistry: registry });
		mockSuccessfulChain([{ name: "secret", loop: true }]);

		await pi.callTool("chain_run", { expression: "secret" });

		expect(parseChainMock).toHaveBeenCalledWith(
			"secret",
			registry,
			"target",
			"main",
		);
	});

	test("chain_run surfaces internal-agent denial for a non-owner caller in target default context", async () => {
		const { pi } = createExtensionPi("/tmp/project", {
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:main/cosmo -->",
		});
		const registry = new AgentRegistry(
			[makeAgent("cosmo", "main"), makeAgent("secret", "target")],
			{
				internalAgentsByDomain: new Map([["target", new Set(["secret"])]]),
			},
		);
		parseChainMock.mockImplementationOnce(
			(_expression, _registry, _domainContext, requesterDomain) => {
				throw new Error(
					`Agent "secret" is internal to domain "target" and is not visible from domain "${requesterDomain}".`,
				);
			},
		);

		mockRuntime({ domainContext: "target", agentRegistry: registry });

		await expect(
			pi.callTool("chain_run", { expression: "secret" }),
		).rejects.toThrow(
			'Agent "secret" is internal to domain "target" and is not visible from domain "main".',
		);
		expect(runChainMock).not.toHaveBeenCalled();
	});

	test("spawn_agent denies an internal target for a non-owner caller in target default context", async () => {
		const { pi } = createExtensionPi("/tmp/project", {
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:main/cosmo -->",
		});
		const registry = new AgentRegistry(
			[
				makeAgent("cosmo", "main", { subagents: ["target/secret"] }),
				makeAgent("secret", "target"),
			],
			{
				internalAgentsByDomain: new Map([["target", new Set(["secret"])]]),
			},
		);
		const spawn = vi.fn();
		const dispose = vi.fn();
		createPiSpawnerMock.mockReturnValue({ spawn, dispose });

		mockRuntime({ domainContext: "target", agentRegistry: registry });

		const result = await pi.callTool("spawn_agent", {
			role: "secret",
			prompt: "run internal work",
		});

		expect(spawn).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			content: [
				{
					type: "text",
					text: 'spawn_agent denied: Agent "secret" is internal to domain "target" and is not visible from domain "main".',
				},
			],
			details: {
				status: "denied",
				error:
					'Agent "secret" is internal to domain "target" and is not visible from domain "main".',
			},
		});
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
					text: 'spawn_agent denied: worker cannot spawn planner. To run planner as a top-level chain stage, use `chain_run(expression: "planner")`.',
				},
			],
			details: {
				status: "denied",
				error: "worker cannot spawn planner",
			},
		});
	});

	test("spawn_agent denial suggests qualified chain_run for cross-domain targets", async () => {
		const { pi } = createExtensionPi("/tmp/project", {
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:alpha/worker -->",
		});

		mockRuntime({ domainContext: "main" });
		const spawn = vi.fn();
		const dispose = vi.fn();
		createPiSpawnerMock.mockReturnValue({ spawn, dispose });

		const result = await pi.callTool("spawn_agent", {
			role: "alpha/quality-manager",
			prompt: "verify this plan",
		});

		expect(spawn).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			content: [
				{
					type: "text",
					text: 'spawn_agent denied: worker cannot spawn quality-manager. To run quality-manager as a top-level chain stage, use `chain_run(expression: "alpha/quality-manager")`.',
				},
			],
			details: {
				status: "denied",
				error: "worker cannot spawn quality-manager",
			},
		});
	});

	test("spawn_agent routes the resolved canonical QM through a durable refusal without a session", async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "spawn-qm-"));
		const sessionId = `qm-parent-${Date.now()}`;
		const registry = new AgentRegistry([
			makeAgent("cody", "coding", { subagents: ["quality-manager"] }),
			makeAgent("quality-manager", "coding"),
		]);
		mockRuntime({ domainContext: "coding", agentRegistry: registry });
		const { pi } = createExtensionPi(projectRoot, {
			sessionId,
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:coding/cody -->",
		});
		const tracker = getOrCreateTracker(sessionId);
		try {
			const accepted = (await pi.callTool("spawn_agent", {
				role: "quality-manager",
				prompt: "review",
			})) as { details: { status: string } };
			expect(accepted.details.status).toBe("accepted");
			const completion = await tracker.nextCompletion();
			expect(completion.type).toBe("spawn_failed");
			expect(JSON.stringify(completion)).not.toContain("/artifacts/");
			expect(mocks.createAgentSessionFromDefinition).not.toHaveBeenCalled();
			const runs = await new FileRunStore({
				rootDir: join(projectRoot, "missions", "sessions"),
			}).listRecentRuns({ scope: "chain" });
			expect(runs).toHaveLength(1);
			expect(
				await readFile(
					join(runs[0]?.artifactsDir ?? "", "qm", "final.md"),
					"utf8",
				),
			).toContain("Verdict: refused");
		} finally {
			removeTracker(sessionId);
			await rm(projectRoot, { recursive: true, force: true });
		}
	});

	// @cosmo-behavior plan:qm-chain-safety#B-001
	test("a scripted QM and panel refuse mutation tools and a forbidden spawn without changing the checkout", async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "qm-scripted-isolation-"));
		const sessionId = "scripted-qm-session";
		const fixture = await loadOrchestrationDomainFixtures({
			domainId: "coding",
		});
		const resolver = new DomainResolver(fixture.domainRegistry);
		const registry = new AgentRegistry([
			makeAgent("quality-manager", "coding", { subagents: ["reviewer"] }),
			makeAgent("reviewer", "coding"),
			makeAgent("verifier", "coding"),
			makeAgent("worker", "coding"),
			makeAgent("fixer", "coding"),
			makeAgent("coordinator", "coding"),
			makeAgent("integration-verifier", "coding"),
		]);
		runtimeCreateMock.mockResolvedValue({
			agentRegistry: registry,
			domainContext: "coding",
			projectSkills: [],
			skillPaths: [],
			domainRegistry: fixture.domainRegistry,
			domainResolver: resolver,
			domainsDir: testDomainsDir,
		});
		const { execFileSync } = await import("node:child_process");
		const git = (...args: string[]) =>
			execFileSync("git", args, { cwd: projectRoot, encoding: "utf8" }).trim();
		try {
			git("init", "-q");
			git("config", "user.email", "test@example.com");
			git("config", "user.name", "Test");
			await writeFile(join(projectRoot, ".gitignore"), "missions/sessions/\n");
			await writeFile(join(projectRoot, "tracked.txt"), "base\n");
			git("add", ".gitignore", "tracked.txt");
			git("commit", "-qm", "base");
			await writeFile(join(projectRoot, "tracked.txt"), "staged\n");
			git("add", "tracked.txt");
			await writeFile(join(projectRoot, "tracked.txt"), "unstaged\n");
			await writeFile(join(projectRoot, "untracked.txt"), "untracked\n");
			const headRef = git("symbolic-ref", "HEAD");
			const snapshot = async () => ({
				head: await readFile(join(projectRoot, ".git", "HEAD")),
				refs: await readFile(join(projectRoot, ".git", headRef)),
				index: await readFile(join(projectRoot, ".git", "index")),
				tracked: await readFile(join(projectRoot, "tracked.txt")),
				untracked: await readFile(join(projectRoot, "untracked.txt")),
			});
			const before = await snapshot();
			const result = await launchQualityReview({
				projectRoot,
				execute: async (context) => {
					const candidateTools = [
						"read",
						"grep",
						"find",
						"ls",
						"bash",
						"write",
						"edit",
						"chain_run",
						"spawn_agent",
					];
					const managerTools = enforceQualityReviewProfile(
						candidateTools,
						"manager",
					);
					const panelTools = enforceQualityReviewProfile(
						candidateTools,
						"reviewer",
					);
					const pi = createMockPi(context.workspaceRoot ?? "", {
						sessionId,
						systemPrompt: "<!-- COSMONAUTS_AGENT_ID:coding/quality-manager -->",
						allowedTools: managerTools,
					});
					orchestrationExtension(pi as never);
					for (const tool of ["bash", "write", "edit", "chain_run"])
						await expect(pi.callTool(tool, {})).rejects.toThrow(
							`Tool refused by session profile: ${tool}`,
						);
					const qualityContext = {
						runId: context.runId,
						workspaceRoot: context.workspaceRoot ?? "",
						materialsRoot: context.materialsRoot ?? "",
						base: context.base ?? "",
						changedFiles: context.changedFiles ?? [],
						hostRunStoreRoot: context.hostRunStoreRoot,
						artifactSink: context.artifactSink,
						activeSpawns: context.activeChildIds,
						allowedLenses: new Set(["reviewer"]),
						attemptedLenses: new Set<string>(),
						integrityFailures: [],
					};
					registerQualityReviewSession(sessionId, qualityContext);
					try {
						for (const role of [
							"fixer",
							"coordinator",
							"worker",
							"verifier",
							"integration-verifier",
						]) {
							const denied = (await pi.callTool("spawn_agent", {
								role,
								prompt: "change code",
							})) as { details: { status: string } };
							expect(denied.details.status).toBe("denied");
						}
						const panelSessionId = "scripted-panel-session";
						const panel = createMockPi(context.workspaceRoot ?? "", {
							sessionId: panelSessionId,
							systemPrompt: "<!-- COSMONAUTS_AGENT_ID:coding/reviewer -->",
							allowedTools: panelTools,
						});
						orchestrationExtension(panel as never);
						for (const tool of [
							"bash",
							"write",
							"edit",
							"chain_run",
							"spawn_agent",
						])
							await expect(panel.callTool(tool, {})).rejects.toThrow(
								`Tool refused by session profile: ${tool}`,
							);
						registerQualityReviewSession(panelSessionId, qualityContext);
						try {
							await expect(
								panel.callTool("spawn_agent", {
									role: "worker",
									prompt: "change code",
								}),
							).rejects.toThrow("Tool refused by session profile: spawn_agent");
						} finally {
							removeQualityReviewSession(panelSessionId);
						}
						return {
							markdown: renderQualityReviewReport({
								verdict: "not-ready",
								reason: "forbidden attempts refused",
							}),
						};
					} finally {
						removeQualityReviewSession(sessionId);
					}
				},
			});
			const report = await readFile(
				join(
					projectRoot,
					"missions",
					"sessions",
					"chain",
					"runs",
					result.ref.runId,
					"artifacts",
					"qm",
					"final.md",
				),
				"utf8",
			);
			expect(result.stepResult.outcome, report).toBe("success");
			expect(await snapshot()).toEqual(before);
		} finally {
			removeQualityReviewSession(sessionId);
			await rm(projectRoot, { recursive: true, force: true });
		}
	});

	test("spawn_agent allows authorized target with unqualified caller resolving via scan-all", async () => {
		const { pi } = createExtensionPi("/tmp/project", {
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:alpha/cody -->",
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
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:unknown-domain/cody -->",
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

	test("discards a panel completion that arrives after assessment", async () => {
		mockRuntime({
			domainContext: "coding",
			agentRegistry: new AgentRegistry([
				makeAgent("quality-manager", "coding", { subagents: ["reviewer"] }),
				makeAgent("reviewer", "coding"),
			]),
		});
		const sessionId = "late-panel-parent";
		const { pi } = createExtensionPi("/private/snapshot", {
			sessionId,
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:coding/quality-manager -->",
		});
		const writeReviewer = vi.fn();
		const qualityContext = {
			runId: "qm-late",
			workspaceRoot: "/private/snapshot",
			materialsRoot: "/private/materials",
			base: "a".repeat(40),
			changedFiles: [],
			hostRunStoreRoot: "/operator/run-store",
			artifactSink: { writeReviewer } as never,
			activeSpawns: new Set<string>(),
			allowedLenses: new Set(["reviewer"]),
			attemptedLenses: new Set<string>(),
			integrityFailures: [] as string[],
			assessmentActive: true,
		};
		let settlePrompt: (() => void) | undefined;
		const pending = new Promise<void>((resolve) => {
			settlePrompt = resolve;
		});
		mockChildSession(
			createIdleChildSession("late-reviewer", {
				prompt: vi.fn(() => pending),
				messages: [
					{
						role: "assistant",
						content: [{ type: "text", text: "late full review" }],
					},
				],
			}),
		);
		registerQualityReviewSession(sessionId, qualityContext);
		try {
			const accepted = (await pi.callTool("spawn_agent", {
				role: "reviewer",
				prompt: "review",
			})) as { details: { status: string } };
			expect(accepted.details.status, JSON.stringify(accepted)).toBe(
				"accepted",
			);
			qualityContext.assessmentActive = false;
			settlePrompt?.();
			await flushAsync(10);
			expect(writeReviewer).not.toHaveBeenCalled();
		} finally {
			removeQualityReviewSession(sessionId);
		}
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
		mockSuccessfulChain([{ name: "coordinator", loop: true }]);

		await pi.callTool("chain_run", { expression: "coordinator" });
		await pi.callTool("chain_run", { expression: "coordinator" });

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
		mockSuccessfulChain([{ name: "coordinator", loop: true }]);

		await expect(
			pi.callTool("chain_run", { expression: "coordinator" }),
		).rejects.toThrow("invalid config");

		await expect(
			pi.callTool("chain_run", { expression: "coordinator" }),
		).resolves.toBeDefined();

		expect(runtimeCreateMock).toHaveBeenCalledTimes(2);
	});
});
