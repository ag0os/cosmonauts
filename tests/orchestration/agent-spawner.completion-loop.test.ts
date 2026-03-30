/**
 * Tests for the multi-turn completion loop in createPiSpawner().
 * Covers ACs #1–#5 of TASK-110.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { loadDomains } from "../../lib/domains/index.ts";
import { DomainResolver } from "../../lib/domains/resolver.ts";
import { MessageBus } from "../../lib/orchestration/message-bus.ts";
import { getOrCreateTracker } from "../../lib/orchestration/spawn-tracker.ts";

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

let realResolver: DomainResolver;

beforeAll(async () => {
	const domains = await loadDomains(DOMAINS_DIR);
	realResolver = DomainResolver.fromSingleDir(DOMAINS_DIR, domains);
});

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
};

const FIXTURE_REGISTRY = new AgentRegistry([FIXTURE_PLANNER]);

const MOCK_SESSION_STATS = {
	sessionFile: undefined,
	sessionId: "",
	userMessages: 1,
	assistantMessages: 1,
	toolCalls: 0,
	toolResults: 0,
	totalMessages: 2,
	tokens: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, total: 150 },
	cost: 0.001,
};

let sessionCounter = 0;

function nextSessionId(): string {
	return `s-loop-test-${++sessionCounter}`;
}

function createMockSession(sessionId: string) {
	return {
		sessionId,
		messages: [],
		prompt: vi.fn(async () => undefined),
		dispose: vi.fn(),
		subscribe: vi.fn(() => vi.fn()),
		getSessionStats: vi.fn(() => ({ ...MOCK_SESSION_STATS, sessionId })),
	};
}

describe("createPiSpawner — completion loop", () => {
	let bus: MessageBus;

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getModel.mockReturnValue({ id: "mock-model" });
		bus = new MessageBus();
	});

	// AC#3: no extra prompts when no children are spawned
	test("loop does not activate when no children are spawned", async () => {
		const sessionId = nextSessionId();
		const session = createMockSession(sessionId);
		mocks.createAgentSession.mockResolvedValue({ session });

		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, { bus, resolver: realResolver });
		const result = await spawner.spawn({
			role: "planner",
			cwd: "/tmp",
			prompt: "go",
		});

		expect(result.success).toBe(true);
		expect(session.prompt).toHaveBeenCalledTimes(1);
	});

	// AC#1 + AC#2: loop activates and delivers formatted success message
	test("loop delivers formatted completion message for a successful child", async () => {
		const sessionId = nextSessionId();
		const session = createMockSession(sessionId);
		let callCount = 0;

		session.prompt = vi.fn(async () => {
			callCount++;
			if (callCount === 1) {
				// Simulate agent spawning a child during the first prompt.
				// Use setTimeout so the child is still "running" when prompt returns.
				const tracker = getOrCreateTracker(sessionId, bus);
				tracker.register("spawn-abc", "worker", 1);
				setTimeout(() => tracker.complete("spawn-abc", "Task done"), 0);
			}
		});
		mocks.createAgentSession.mockResolvedValue({ session });

		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, { bus, resolver: realResolver });
		await spawner.spawn({ role: "planner", cwd: "/tmp", prompt: "go" });

		// initial prompt + one completion prompt
		expect(session.prompt).toHaveBeenCalledTimes(2);

		const calls = session.prompt.mock.calls as unknown[][];
		const completionMsg = calls[1]?.[0] as string;
		expect(completionMsg).toContain("[spawn_completion]");
		expect(completionMsg).toContain("spawnId=spawn-abc");
		expect(completionMsg).toContain("role=worker");
		expect(completionMsg).toContain("outcome=success");
	});

	// AC#2: failed child produces a failure message
	test("loop delivers failure message for a failed child spawn", async () => {
		const sessionId = nextSessionId();
		const session = createMockSession(sessionId);
		let callCount = 0;

		session.prompt = vi.fn(async () => {
			callCount++;
			if (callCount === 1) {
				const tracker = getOrCreateTracker(sessionId, bus);
				tracker.register("spawn-fail", "worker", 1);
				setTimeout(() => tracker.fail("spawn-fail", "Something went wrong"), 0);
			}
		});
		mocks.createAgentSession.mockResolvedValue({ session });

		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, { bus, resolver: realResolver });
		await spawner.spawn({ role: "planner", cwd: "/tmp", prompt: "go" });

		expect(session.prompt).toHaveBeenCalledTimes(2);
		const calls = session.prompt.mock.calls as unknown[][];
		const completionMsg = calls[1]?.[0] as string;
		expect(completionMsg).toContain("outcome=failed");
		expect(completionMsg).toContain("spawnId=spawn-fail");
		expect(completionMsg).toContain("Something went wrong");
	});

	// AC#1: loop iterates once per child when multiple children complete sequentially
	test("loop iterates once per child for multiple sequential completions", async () => {
		const sessionId = nextSessionId();
		const session = createMockSession(sessionId);
		let callCount = 0;

		session.prompt = vi.fn(async () => {
			callCount++;
			if (callCount === 1) {
				const tracker = getOrCreateTracker(sessionId, bus);
				tracker.register("spawn-1", "worker", 1);
				tracker.register("spawn-2", "worker", 1);
				// Complete children with a small stagger
				setTimeout(() => tracker.complete("spawn-1", "Done"), 0);
				setTimeout(() => tracker.complete("spawn-2", "Done"), 5);
			}
		});
		mocks.createAgentSession.mockResolvedValue({ session });

		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, { bus, resolver: realResolver });
		await spawner.spawn({ role: "planner", cwd: "/tmp", prompt: "go" });

		// initial + one message per child
		expect(session.prompt).toHaveBeenCalledTimes(3);
	});

	// AC#5: timeout delivers failure messages and exits loop
	test("timeout delivers failed completion message and exits the loop", async () => {
		const sessionId = nextSessionId();
		const session = createMockSession(sessionId);
		let callCount = 0;

		session.prompt = vi.fn(async () => {
			callCount++;
			if (callCount === 1) {
				const tracker = getOrCreateTracker(sessionId, bus);
				tracker.register("spawn-hung", "worker", 1);
				// Never complete — let the timeout fire
			}
		});
		mocks.createAgentSession.mockResolvedValue({ session });

		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
			bus,
			resolver: realResolver,
			spawnTimeoutMs: 50, // very short for test
		});
		const result = await spawner.spawn({
			role: "planner",
			cwd: "/tmp",
			prompt: "go",
		});

		expect(result.success).toBe(true);
		// initial prompt + one timeout failure delivery
		expect(session.prompt).toHaveBeenCalledTimes(2);

		const calls = session.prompt.mock.calls as unknown[][];
		const completionMsg = calls[1]?.[0] as string;
		expect(completionMsg).toContain("outcome=failed");
		expect(completionMsg).toContain("spawnId=spawn-hung");
		expect(completionMsg).toContain("role=worker");
		expect(completionMsg).toContain("Timed out");
	}, 5000);

	// AC#5: all concurrently-running spawns are timed out together
	test("timeout fails all running children and delivers a message for each", async () => {
		const sessionId = nextSessionId();
		const session = createMockSession(sessionId);
		let callCount = 0;

		session.prompt = vi.fn(async () => {
			callCount++;
			if (callCount === 1) {
				const tracker = getOrCreateTracker(sessionId, bus);
				tracker.register("spawn-a", "worker", 1);
				tracker.register("spawn-b", "worker", 1);
				// Neither completes
			}
		});
		mocks.createAgentSession.mockResolvedValue({ session });

		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
			bus,
			resolver: realResolver,
			spawnTimeoutMs: 50,
		});
		await spawner.spawn({ role: "planner", cwd: "/tmp", prompt: "go" });

		// initial + one message per timed-out child
		expect(session.prompt).toHaveBeenCalledTimes(3);

		const calls = session.prompt.mock.calls as unknown[][];
		for (const callIdx of [1, 2]) {
			const msg = calls[callIdx]?.[0] as string;
			expect(msg).toContain("outcome=failed");
			expect(msg).toContain("Timed out");
		}
	}, 5000);

	// AC#4: removeTracker called even when prompt throws
	test("tracker is cleaned up when initial prompt throws", async () => {
		const sessionId = nextSessionId();
		const session = createMockSession(sessionId);
		session.prompt = vi.fn().mockRejectedValue(new Error("prompt failed"));
		mocks.createAgentSession.mockResolvedValue({ session });

		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, { bus, resolver: realResolver });
		const result = await spawner.spawn({
			role: "planner",
			cwd: "/tmp",
			prompt: "go",
		});

		expect(result.success).toBe(false);
		expect(result.error).toBe("prompt failed");

		// If removeTracker ran, getOrCreateTracker creates a fresh tracker
		// (active count 0) rather than returning a stale one.
		const fresh = getOrCreateTracker(sessionId, bus);
		expect(fresh.activeCount()).toBe(0);
		fresh.dispose();
	});

	// AC#4: removeTracker called even when a loop prompt throws
	test("tracker is cleaned up when a loop completion prompt throws", async () => {
		const sessionId = nextSessionId();
		const session = createMockSession(sessionId);
		let callCount = 0;

		session.prompt = vi.fn(async () => {
			callCount++;
			if (callCount === 1) {
				const tracker = getOrCreateTracker(sessionId, bus);
				tracker.register("spawn-xyz", "worker", 1);
				setTimeout(() => tracker.complete("spawn-xyz", "Done"), 0);
			} else {
				throw new Error("loop prompt failed");
			}
		});
		mocks.createAgentSession.mockResolvedValue({ session });

		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, { bus, resolver: realResolver });
		const result = await spawner.spawn({
			role: "planner",
			cwd: "/tmp",
			prompt: "go",
		});

		expect(result.success).toBe(false);

		// Tracker must have been removed from the registry
		const fresh = getOrCreateTracker(sessionId, bus);
		expect(fresh.activeCount()).toBe(0);
		fresh.dispose();
	});
});
