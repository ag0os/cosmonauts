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
});
