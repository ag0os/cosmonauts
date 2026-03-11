/**
 * Regression tests for createPiSpawner() spawn behavior.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";

const mocks = vi.hoisted(() => ({
	createAgentSession: vi.fn(),
	getModel: vi.fn(),
}));

vi.mock("@mariozechner/pi-ai", () => ({
	getModel: mocks.getModel,
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
	createAgentSession: mocks.createAgentSession,
	createCodingTools: () => [],
	createReadOnlyTools: () => [],
	DefaultResourceLoader: class {
		async reload() {}
	},
	SessionManager: {
		inMemory: () => ({ kind: "in-memory" }),
	},
	SettingsManager: {
		inMemory: (settings?: Record<string, unknown>) => ({
			kind: "in-memory-settings",
			settings,
		}),
	},
}));

import { createPiSpawner } from "../../lib/orchestration/agent-spawner.ts";

const DOMAINS_DIR = resolve(
	fileURLToPath(import.meta.url),
	"..",
	"..",
	"..",
	"domains",
);

const FIXTURE_PLANNER: AgentDefinition = {
	id: "planner",
	description: "Fixture planner",
	capabilities: ["core"],
	model: "fixture-provider/fixture-planner-model",
	tools: "readonly",
	extensions: [],
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
		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);

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
		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);

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

		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);
		await spawner.spawn({
			role: "planner",
			cwd: "/tmp/test-project",
			prompt: "Plan the work.",
		});

		expect(callOrder).toEqual(["getSessionStats", "dispose"]);
	});

	test("stats not populated on failed spawn", async () => {
		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);

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
		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);

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
		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);

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
		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);

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

			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);
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

			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);
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

			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);
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
			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);
			await spawner.spawn({
				role: "planner",
				cwd: "/tmp/test-project",
				prompt: "Plan the work.",
				onEvent: (event) => receivedEvents.push(event),
			});

			expect(receivedEvents).toEqual([
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
			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);
			await spawner.spawn({
				role: "planner",
				cwd: "/tmp/test-project",
				prompt: "Plan the work.",
				onEvent: (event) => receivedEvents.push(event),
			});

			expect(receivedEvents).toEqual([
				{
					type: "tool_execution_start",
					toolName: "read",
					toolCallId: "tc-1",
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

		test("forwards auto_compaction_start/end events through onEvent", async () => {
			let subscribeListener: ((event: unknown) => void) | undefined;
			const mockSession = createMockSession({
				subscribe: vi.fn((listener: (event: unknown) => void) => {
					subscribeListener = listener;
					return vi.fn();
				}),
				prompt: vi.fn(async () => {
					subscribeListener?.({
						type: "auto_compaction_start",
						reason: "threshold",
					});
					subscribeListener?.({
						type: "auto_compaction_end",
						result: undefined,
						aborted: false,
						willRetry: false,
					});
				}),
			});
			mocks.createAgentSession.mockResolvedValue({ session: mockSession });

			const receivedEvents: unknown[] = [];
			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);
			await spawner.spawn({
				role: "planner",
				cwd: "/tmp/test-project",
				prompt: "Plan the work.",
				onEvent: (event) => receivedEvents.push(event),
			});

			expect(receivedEvents).toEqual([
				{
					type: "auto_compaction_start",
					reason: "threshold",
					sessionId: "session-1",
				},
				{ type: "auto_compaction_end", aborted: false, sessionId: "session-1" },
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
			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);
			await spawner.spawn({
				role: "planner",
				cwd: "/tmp/test-project",
				prompt: "Plan the work.",
				onEvent: (event) => receivedEvents.push(event),
			});

			expect(receivedEvents).toHaveLength(0);
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

			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);
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

			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);
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

			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);
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
