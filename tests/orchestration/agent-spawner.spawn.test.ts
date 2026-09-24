/**
 * Regression tests for createPiSpawner() spawn behavior.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { writeSyntheticDomainPackage } from "../helpers/domain-package-fixture.ts";

const mocks = vi.hoisted(() => ({
	createAgentSession: vi.fn(),
	getModel: vi.fn(),
}));

vi.mock("@earendil-works/pi-ai/providers/all", () => ({
	builtinModels: () => ({ getModel: mocks.getModel }),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
	AuthStorage: {
		create: () => ({ kind: "auth-storage" }),
	},
	createAgentSession: mocks.createAgentSession,
	DefaultResourceLoader: class {
		async reload() {}
		getExtensions() {
			return { extensions: [], errors: [], runtime: {} };
		}
	},
	getAgentDir: () => "/tmp/test-agent-dir",
	ModelRegistry: {
		create: () => ({ find: vi.fn(() => undefined) }),
	},
	SessionManager: {
		inMemory: () => ({ kind: "in-memory" }),
		open: (path: string) => ({ kind: "file", path }),
	},
	SettingsManager: {
		inMemory: (settings?: Record<string, unknown>) => ({
			kind: "in-memory-settings",
			settings,
			setProjectTrusted: vi.fn(),
		}),
	},
}));

import { loadDomainsFromSources } from "../../lib/domains/index.ts";
import { DomainResolver } from "../../lib/domains/resolver.ts";
import {
	createPiSpawner,
	resolveModel,
} from "../../lib/orchestration/agent-spawner.ts";
import { qualityReviewAuditFindingLines } from "../../lib/orchestration/quality-review-launch.ts";
import type { SpawnEvent } from "../../lib/orchestration/types.ts";

const DOMAINS_DIR = resolve(
	fileURLToPath(import.meta.url),
	"..",
	"..",
	"..",
	"domains",
);

let realResolver: DomainResolver;
let syntheticPackageRoot: string;

beforeAll(async () => {
	syntheticPackageRoot = await mkdtemp(
		join(tmpdir(), "spawner-alpha-package-"),
	);
	await writeSyntheticDomainPackage(syntheticPackageRoot, {
		packageName: "alpha-pkg",
		domainId: "alpha",
		lead: "planner",
		agents: [{ id: "planner" }, { id: "worker" }],
		prompts: {
			planner: "Synthetic alpha planner persona.",
			worker: "Synthetic alpha worker persona.",
		},
	});
	const domains = await loadDomainsFromSources([
		{ domainsDir: DOMAINS_DIR, origin: "framework", precedence: 1 },
		{
			domainsDir: syntheticPackageRoot,
			sourceType: "domain-root",
			origin: "synthetic",
			precedence: 2,
		},
	]);
	realResolver = DomainResolver.fromSingleDir(DOMAINS_DIR, domains);
});

afterAll(async () => {
	await rm(syntheticPackageRoot, { recursive: true, force: true });
});

const FIXTURE_PLANNER: AgentDefinition = {
	id: "planner",
	domain: "alpha",
	description: "Fixture planner",
	capabilities: ["tasks"],
	model: "fixture-provider/fixture-planner-model",
	tools: "readonly",
	extensions: [],
	skills: ["*"],
	projectContext: false,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "high",
};

const FIXTURE_REGISTRY = new AgentRegistry([FIXTURE_PLANNER]);

const MOCK_SESSION_STATS = {
	sessionFile: undefined,
	sessionId: "session-1",
	userMessages: 3,
	assistantMessages: 3,
	toolCalls: 5,
	toolResults: 5,
	totalMessages: 12,
	tokens: {
		input: 1000,
		output: 500,
		cacheRead: 200,
		cacheWrite: 100,
		total: 1800,
	},
	cost: 0.042,
};

function createMockSession(overrides?: Record<string, unknown>) {
	return {
		sessionId: "session-1",
		model: { provider: "fixture-provider", id: "mock-model" },
		messages: [],
		prompt: vi.fn(async () => undefined),
		dispose: vi.fn(),
		subscribe: vi.fn(() => vi.fn()),
		getSessionStats: vi.fn(() => MOCK_SESSION_STATS),
		...overrides,
	};
}

describe("createPiSpawner", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getModel.mockReturnValue({ id: "mock-model" });
		mocks.createAgentSession.mockResolvedValue({
			session: createMockSession(),
		});
	});

	test("uses definition thinkingLevel when spawn thinkingLevel is omitted", async () => {
		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
			resolver: realResolver,
		});

		await spawner.spawn({
			role: "planner",
			cwd: "/tmp/test-project",
			prompt: "Plan the work.",
		});

		expect(mocks.createAgentSession).toHaveBeenCalledWith(
			expect.objectContaining({
				thinkingLevel: "high",
			}),
		);
	});

	test("populates stats on successful spawn result", async () => {
		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
			resolver: realResolver,
		});

		const result = await spawner.spawn({
			role: "planner",
			cwd: "/tmp/test-project",
			prompt: "Plan the work.",
		});

		expect(result.success).toBe(true);
		expect(result.stats).toBeDefined();
		expect(result.stats?.tokens).toEqual({
			input: 1000,
			output: 500,
			cacheRead: 200,
			cacheWrite: 100,
			total: 1800,
		});
		expect(result.stats?.cost).toBe(0.042);
		expect(result.stats?.turns).toBe(3);
		expect(result.stats?.toolCalls).toBe(5);
		expect(result.stats?.durationMs).toBeGreaterThanOrEqual(0);
	});

	test("calls getSessionStats before dispose", async () => {
		const mockSession = createMockSession();
		const callOrder: string[] = [];
		mockSession.getSessionStats = vi.fn(() => {
			callOrder.push("getSessionStats");
			return MOCK_SESSION_STATS;
		});
		mockSession.dispose = vi.fn(() => {
			callOrder.push("dispose");
		});
		mocks.createAgentSession.mockResolvedValue({ session: mockSession });

		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
			resolver: realResolver,
		});
		await spawner.spawn({
			role: "planner",
			cwd: "/tmp/test-project",
			prompt: "Plan the work.",
		});

		expect(callOrder).toEqual(["getSessionStats", "dispose"]);
	});

	test("stats not populated on failed spawn", async () => {
		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
			resolver: realResolver,
		});

		const result = await spawner.spawn({
			role: "planner",
			cwd: "/tmp/test-project",
			prompt: "Plan the work.",
			signal: AbortSignal.abort(),
		});

		expect(result.success).toBe(false);
		expect(result.stats).toBeUndefined();
	});

	test("passes settingsManager with compaction settings when compaction config is provided", async () => {
		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
			resolver: realResolver,
		});

		await spawner.spawn({
			role: "planner",
			cwd: "/tmp/test-project",
			prompt: "Plan the work.",
			compaction: { enabled: true, keepRecentTokens: 5000 },
		});

		expect(mocks.createAgentSession).toHaveBeenCalledWith(
			expect.objectContaining({
				settingsManager: {
					kind: "in-memory-settings",
					setProjectTrusted: expect.any(Function),
					settings: {
						compaction: {
							enabled: true,
							keepRecentTokens: 5000,
						},
					},
				},
			}),
		);
	});

	test("passes settingsManager with compaction enabled only (no keepRecentTokens)", async () => {
		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
			resolver: realResolver,
		});

		await spawner.spawn({
			role: "planner",
			cwd: "/tmp/test-project",
			prompt: "Plan the work.",
			compaction: { enabled: true },
		});

		expect(mocks.createAgentSession).toHaveBeenCalledWith(
			expect.objectContaining({
				settingsManager: {
					kind: "in-memory-settings",
					setProjectTrusted: expect.any(Function),
					settings: {
						compaction: {
							enabled: true,
						},
					},
				},
			}),
		);
	});

	test("does not pass settingsManager when compaction config is not provided", async () => {
		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
			resolver: realResolver,
		});

		await spawner.spawn({
			role: "planner",
			cwd: "/tmp/test-project",
			prompt: "Plan the work.",
		});

		const callArgs = mocks.createAgentSession.mock.calls[0]?.[0];
		expect(callArgs).not.toHaveProperty("settingsManager");
	});

	describe("event subscription", () => {
		test("calls session.subscribe before session.prompt when onEvent is provided", async () => {
			const callOrder: string[] = [];
			const mockSession = createMockSession({
				subscribe: vi.fn(() => {
					callOrder.push("subscribe");
					return vi.fn();
				}),
				prompt: vi.fn(async () => {
					callOrder.push("prompt");
				}),
			});
			mocks.createAgentSession.mockResolvedValue({ session: mockSession });

			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
				resolver: realResolver,
			});
			await spawner.spawn({
				role: "planner",
				cwd: "/tmp/test-project",
				prompt: "Plan the work.",
				onEvent: () => {},
			});

			expect(callOrder).toEqual(
				expect.arrayContaining(["subscribe", "prompt"]),
			);
			expect(callOrder.indexOf("subscribe")).toBeLessThan(
				callOrder.indexOf("prompt"),
			);
		});

		test("does not call session.subscribe when onEvent is not provided", async () => {
			const mockSession = createMockSession();
			mocks.createAgentSession.mockResolvedValue({ session: mockSession });

			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
				resolver: realResolver,
			});
			await spawner.spawn({
				role: "planner",
				cwd: "/tmp/test-project",
				prompt: "Plan the work.",
			});

			expect(mockSession.subscribe).not.toHaveBeenCalled();
		});

		test("calls unsubscribe before session.dispose", async () => {
			const callOrder: string[] = [];
			const unsubscribe = vi.fn(() => callOrder.push("unsubscribe"));
			const mockSession = createMockSession({
				subscribe: vi.fn(() => {
					callOrder.push("subscribe");
					return unsubscribe;
				}),
				dispose: vi.fn(() => callOrder.push("dispose")),
			});
			mocks.createAgentSession.mockResolvedValue({ session: mockSession });

			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
				resolver: realResolver,
			});
			await spawner.spawn({
				role: "planner",
				cwd: "/tmp/test-project",
				prompt: "Plan the work.",
				onEvent: () => {},
			});

			expect(unsubscribe).toHaveBeenCalledTimes(1);
			expect(callOrder.indexOf("unsubscribe")).toBeLessThan(
				callOrder.indexOf("dispose"),
			);
		});

		test("emits resolved agent identity through onEvent before prompting", async () => {
			const mockSession = createMockSession();
			mocks.createAgentSession.mockResolvedValue({ session: mockSession });

			const receivedEvents: unknown[] = [];
			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
				resolver: realResolver,
			});
			await spawner.spawn({
				role: "planner",
				cwd: "/tmp/test-project",
				prompt: "Plan the work.",
				onEvent: (event) => receivedEvents.push(event),
			});

			expect(receivedEvents[0]).toEqual({
				type: "agent_resolved",
				sessionId: "session-1",
				requestedRole: "planner",
				resolvedAgentId: "alpha/planner",
			});
			expect(mockSession.prompt).toHaveBeenCalledTimes(1);
		});

		test("forwards turn_start/end events through onEvent", async () => {
			let subscribeListener: ((event: unknown) => void) | undefined;
			const mockSession = createMockSession({
				subscribe: vi.fn((listener: (event: unknown) => void) => {
					subscribeListener = listener;
					return vi.fn();
				}),
				prompt: vi.fn(async () => {
					// Simulate events during prompt execution
					subscribeListener?.({ type: "turn_start" });
					subscribeListener?.({
						type: "turn_end",
						message: {},
						toolResults: [],
					});
				}),
			});
			mocks.createAgentSession.mockResolvedValue({ session: mockSession });

			const receivedEvents: unknown[] = [];
			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
				resolver: realResolver,
			});
			await spawner.spawn({
				role: "planner",
				cwd: "/tmp/test-project",
				prompt: "Plan the work.",
				onEvent: (event) => receivedEvents.push(event),
			});

			expect(receivedEvents.slice(1)).toEqual([
				{ type: "turn_start", sessionId: "session-1" },
				{ type: "turn_end", sessionId: "session-1" },
			]);
		});

		test("forwards tool_execution_start/end events through onEvent", async () => {
			let subscribeListener: ((event: unknown) => void) | undefined;
			const mockSession = createMockSession({
				subscribe: vi.fn((listener: (event: unknown) => void) => {
					subscribeListener = listener;
					return vi.fn();
				}),
				prompt: vi.fn(async () => {
					subscribeListener?.({
						type: "tool_execution_start",
						toolCallId: "tc-1",
						toolName: "read",
						args: {},
					});
					subscribeListener?.({
						type: "tool_execution_end",
						toolCallId: "tc-1",
						toolName: "read",
						result: "ok",
						isError: false,
					});
				}),
			});
			mocks.createAgentSession.mockResolvedValue({ session: mockSession });

			const receivedEvents: unknown[] = [];
			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
				resolver: realResolver,
			});
			await spawner.spawn({
				role: "planner",
				cwd: "/tmp/test-project",
				prompt: "Plan the work.",
				onEvent: (event) => receivedEvents.push(event),
			});

			expect(receivedEvents.slice(1)).toEqual([
				{
					type: "tool_execution_start",
					toolName: "read",
					toolCallId: "tc-1",
					args: {},
					sessionId: "session-1",
				},
				{
					type: "tool_execution_end",
					toolName: "read",
					toolCallId: "tc-1",
					isError: false,
					sessionId: "session-1",
				},
			]);
		});

		test("captures compact analysis gate observations only for quality sessions", async () => {
			let listener: ((event: unknown) => void) | undefined;
			const session = createMockSession({
				subscribe: vi.fn((callback: (event: unknown) => void) => {
					listener = callback;
					return vi.fn();
				}),
				prompt: vi.fn(async () => {
					listener?.({
						type: "tool_execution_end",
						toolCallId: "audit",
						toolName: "analysis_audit",
						isError: false,
						result: {
							details: {
								kind: "findings",
								capability: "changed-scope-audit",
								scope: { kind: "changed", base: "abc" },
								verdict: "pass",
								native: { secret: "not forwarded" },
							},
						},
					});
				}),
			});
			mocks.createAgentSession.mockResolvedValue({ session });
			const received: unknown[] = [];
			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
				resolver: realResolver,
			});
			await spawner.spawn({
				role: "planner",
				cwd: "/tmp/test-project",
				prompt: "Plan",
				onEvent: (event) => received.push(event),
			});
			expect(JSON.stringify(received)).not.toContain("not forwarded");
			expect(received).toContainEqual(
				expect.objectContaining({
					type: "tool_execution_end",
					toolName: "analysis_audit",
				}),
			);
			expect(JSON.stringify(received)).not.toContain("changed-scope-audit");
			const hostRunStoreRoot = await mkdtemp(join(tmpdir(), "qm-events-"));
			try {
				const qualityEvents: unknown[] = [];
				const qualityResult = await spawner.spawn({
					role: "planner",
					cwd: "/tmp/test-project",
					prompt: "Plan",
					onEvent: (event) => qualityEvents.push(event),
					qualityReviewContext: {
						runId: "qm-test",
						workspaceRoot: "/tmp/test-project",
						materialsRoot: "/tmp/test-project",
						base: "abc",
						changedFiles: [],
						hostRunStoreRoot,
						artifactSink: {
							write: vi.fn(),
							writeReviewer: vi.fn(),
							references: () => [],
							reviewersOpen: () => true,
							sealReviewers: vi.fn(),
						},
						activeSpawns: new Set(),
						allowedLenses: new Set(),
						attemptedLenses: new Set(),
						integrityFailures: [],
					},
				});
				expect(qualityResult.success, qualityResult.error).toBe(true);
				expect(qualityEvents).toContainEqual(
					expect.objectContaining({
						type: "tool_execution_end",
						result: {
							details: {
								kind: "findings",
								capability: "changed-scope-audit",
								scope: { base: "abc" },
								verdict: "pass",
							},
						},
					}),
				);
			} finally {
				await rm(hostRunStoreRoot, { recursive: true, force: true });
			}
		});

		test("a quality spawn carries failing audit findings through to host report lines", async () => {
			const base = "b".repeat(40);
			let listener: ((event: unknown) => void) | undefined;
			const session = createMockSession({
				subscribe: vi.fn((callback: (event: unknown) => void) => {
					listener = callback;
					return vi.fn();
				}),
				prompt: vi.fn(async () => {
					listener?.({
						type: "tool_execution_end",
						toolCallId: "audit",
						toolName: "analysis_audit",
						isError: false,
						result: {
							details: {
								kind: "findings",
								capability: "changed-scope-audit",
								scope: { kind: "changed", base },
								verdict: "fail",
								findings: [
									{
										id: "f1",
										category: "dead-code",
										severity: "error",
										message: "unused export",
										locations: [{ path: "lib/a.ts", line: 17, column: 3 }],
										actions: [
											{
												description: "remove export",
												providerDetails: { secret: "not forwarded" },
											},
										],
										providerDetails: { secret: "not forwarded" },
									},
									{
										id: "f2",
										category: "complexity",
										severity: "warning",
										message: "complex branch",
										locations: [{ path: "lib/b.ts", line: 23 }],
										actions: [],
									},
								],
							},
						},
					});
				}),
			});
			mocks.createAgentSession.mockResolvedValue({ session });
			const hostRunStoreRoot = await mkdtemp(join(tmpdir(), "qm-findings-"));
			try {
				const events: SpawnEvent[] = [];
				const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
					resolver: realResolver,
				});
				const result = await spawner.spawn({
					role: "planner",
					cwd: "/tmp/test-project",
					prompt: "Plan",
					onEvent: (event) => events.push(event),
					qualityReviewContext: {
						runId: "qm-test",
						workspaceRoot: "/tmp/test-project",
						materialsRoot: "/tmp/test-project",
						base,
						changedFiles: [],
						hostRunStoreRoot,
						artifactSink: {
							write: vi.fn(),
							writeReviewer: vi.fn(),
							references: () => [],
							reviewersOpen: () => true,
							sealReviewers: vi.fn(),
						},
						activeSpawns: new Set(),
						allowedLenses: new Set(),
						attemptedLenses: new Set(),
						integrityFailures: [],
					},
				});
				expect(result.success, result.error).toBe(true);
				expect(JSON.stringify(events)).not.toContain("not forwarded");
				expect(qualityReviewAuditFindingLines(events, base)).toEqual([
					"f1 P1 lib/a.ts:17 dead-code error: unused export; fix: remove export",
					"f2 P2 lib/b.ts:23 complexity warning: complex branch; fix: Address complexity finding.",
				]);
			} finally {
				await rm(hostRunStoreRoot, { recursive: true, force: true });
			}
		});

		test("forwards compaction_start/end events through onEvent", async () => {
			let subscribeListener: ((event: unknown) => void) | undefined;
			const mockSession = createMockSession({
				subscribe: vi.fn((listener: (event: unknown) => void) => {
					subscribeListener = listener;
					return vi.fn();
				}),
				prompt: vi.fn(async () => {
					subscribeListener?.({
						type: "compaction_start",
						reason: "manual",
					});
					subscribeListener?.({
						type: "compaction_end",
						reason: "manual",
						result: undefined,
						aborted: false,
						willRetry: false,
					});
				}),
			});
			mocks.createAgentSession.mockResolvedValue({ session: mockSession });

			const receivedEvents: unknown[] = [];
			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
				resolver: realResolver,
			});
			await spawner.spawn({
				role: "planner",
				cwd: "/tmp/test-project",
				prompt: "Plan the work.",
				onEvent: (event) => receivedEvents.push(event),
			});

			expect(receivedEvents.slice(1)).toEqual([
				{
					type: "compaction_start",
					reason: "manual",
					sessionId: "session-1",
				},
				{
					type: "compaction_end",
					reason: "manual",
					aborted: false,
					willRetry: false,
					sessionId: "session-1",
				},
			]);
		});

		test("does not forward unrelated events (message_start, etc.)", async () => {
			let subscribeListener: ((event: unknown) => void) | undefined;
			const mockSession = createMockSession({
				subscribe: vi.fn((listener: (event: unknown) => void) => {
					subscribeListener = listener;
					return vi.fn();
				}),
				prompt: vi.fn(async () => {
					subscribeListener?.({ type: "agent_start" });
					subscribeListener?.({ type: "message_start", message: {} });
					subscribeListener?.({ type: "message_update", message: {} });
					subscribeListener?.({ type: "message_end", message: {} });
					subscribeListener?.({ type: "agent_end", messages: [] });
				}),
			});
			mocks.createAgentSession.mockResolvedValue({ session: mockSession });

			const receivedEvents: unknown[] = [];
			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
				resolver: realResolver,
			});
			await spawner.spawn({
				role: "planner",
				cwd: "/tmp/test-project",
				prompt: "Plan the work.",
				onEvent: (event) => receivedEvents.push(event),
			});

			expect(receivedEvents).toEqual([
				{
					type: "agent_resolved",
					sessionId: "session-1",
					requestedRole: "planner",
					resolvedAgentId: "alpha/planner",
				},
			]);
		});

		test("onEvent listener errors are swallowed", async () => {
			let subscribeListener: ((event: unknown) => void) | undefined;
			const mockSession = createMockSession({
				subscribe: vi.fn((listener: (event: unknown) => void) => {
					subscribeListener = listener;
					return vi.fn();
				}),
				prompt: vi.fn(async () => {
					subscribeListener?.({ type: "turn_start" });
				}),
			});
			mocks.createAgentSession.mockResolvedValue({ session: mockSession });

			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
				resolver: realResolver,
			});
			const result = await spawner.spawn({
				role: "planner",
				cwd: "/tmp/test-project",
				prompt: "Plan the work.",
				onEvent: () => {
					throw new Error("listener error");
				},
			});

			expect(result.success).toBe(true);
		});

		test("unsubscribe is called even when prompt throws", async () => {
			const unsubscribe = vi.fn();
			const mockSession = createMockSession({
				subscribe: vi.fn(() => unsubscribe),
				prompt: vi.fn(async () => {
					throw new Error("prompt failed");
				}),
			});
			mocks.createAgentSession.mockResolvedValue({ session: mockSession });

			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
				resolver: realResolver,
			});
			const result = await spawner.spawn({
				role: "planner",
				cwd: "/tmp/test-project",
				prompt: "Plan the work.",
				onEvent: () => {},
			});

			expect(result.success).toBe(false);
			expect(unsubscribe).toHaveBeenCalledTimes(1);
		});

		test("disposes session when subscribe throws", async () => {
			const mockSession = createMockSession({
				subscribe: vi.fn(() => {
					throw new Error("subscribe failed");
				}),
			});
			mocks.createAgentSession.mockResolvedValue({ session: mockSession });

			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
				resolver: realResolver,
			});
			const result = await spawner.spawn({
				role: "planner",
				cwd: "/tmp/test-project",
				prompt: "Plan the work.",
				onEvent: () => {},
			});

			expect(result).toEqual({
				success: false,
				sessionId: "",
				messages: [],
				error: "subscribe failed",
			});
			expect(mockSession.dispose).toHaveBeenCalledTimes(1);
			expect(mockSession.prompt).not.toHaveBeenCalled();
		});
	});
});

describe("resolveModel", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test("throws for model ID without provider/id separator", () => {
		expect(() => resolveModel("just-a-model")).toThrow(
			'Invalid model ID "just-a-model": expected "provider/model" format',
		);
	});

	test("throws for empty string", () => {
		expect(() => resolveModel("")).toThrow('expected "provider/model" format');
	});

	test("returns model for valid provider/id format", () => {
		const mockModel = { id: "test-model", provider: "anthropic" };
		mocks.getModel.mockReturnValue(mockModel);

		const result = resolveModel("anthropic/claude-sonnet-4-20250514");

		expect(result).toBe(mockModel);
		expect(mocks.getModel).toHaveBeenCalledWith(
			"anthropic",
			"claude-sonnet-4-20250514",
		);
	});

	test("returns custom model from model registry before built-in lookup", () => {
		const mockModel = { id: "custom-model", provider: "ollama" };
		const modelRegistry = {
			find: vi.fn(() => mockModel),
		};

		const result = resolveModel("ollama/custom-model", modelRegistry as never);

		expect(result).toBe(mockModel);
		expect(modelRegistry.find).toHaveBeenCalledWith("ollama", "custom-model");
		expect(mocks.getModel).not.toHaveBeenCalled();
	});

	test("throws when getModel returns undefined", () => {
		mocks.getModel.mockReturnValue(undefined);

		expect(() => resolveModel("fake-provider/fake-model")).toThrow(
			'Model not found: provider="fake-provider", id="fake-model"',
		);
	});

	test("handles model IDs with dots in the model name", () => {
		const mockModel = { id: "gpt-4.1" };
		mocks.getModel.mockReturnValue(mockModel);

		const result = resolveModel("openai/gpt-4.1");

		expect(result).toBe(mockModel);
		expect(mocks.getModel).toHaveBeenCalledWith("openai", "gpt-4.1");
	});
});
