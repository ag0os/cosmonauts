/**
 * Tests for the multi-turn completion loop in createPiSpawner().
 * Covers ACs #1–#5 of TASK-110.
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
import { loadDomainsFromSources } from "../../lib/domains/index.ts";
import { DomainResolver } from "../../lib/domains/resolver.ts";
import { MessageBus } from "../../lib/orchestration/message-bus.ts";
import type { QualityReviewSessionContext } from "../../lib/orchestration/quality-review-context.ts";
import { getOrCreateTracker } from "../../lib/orchestration/spawn-tracker.ts";
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
		open: () => ({ kind: "quality-review" }),
	},
	SettingsManager: {
		inMemory: (settings?: Record<string, unknown>) => ({
			kind: "in-memory-settings",
			settings,
			setProjectTrusted: vi.fn(),
		}),
	},
}));

import { createPiSpawner } from "../../lib/orchestration/agent-spawner.ts";
import { awaitNextCompletionMessages } from "../../lib/orchestration/spawn-completion-loop.ts";

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
	syntheticPackageRoot = await mkdtemp(join(tmpdir(), "spawner-loop-alpha-"));
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
		model: { provider: "fixture-provider", id: "mock-model" },
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

		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
			bus,
			resolver: realResolver,
		});
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

		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
			bus,
			resolver: realResolver,
		});
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

		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
			bus,
			resolver: realResolver,
		});
		await spawner.spawn({ role: "planner", cwd: "/tmp", prompt: "go" });

		expect(session.prompt).toHaveBeenCalledTimes(2);
		const calls = session.prompt.mock.calls as unknown[][];
		const completionMsg = calls[1]?.[0] as string;
		expect(completionMsg).toContain("outcome=failed");
		expect(completionMsg).toContain("spawnId=spawn-fail");
		expect(completionMsg).toContain("Something went wrong");
	});

	test("records a quality panel timeout without aborting its child", async () => {
		const sessionId = nextSessionId();
		const session = createMockSession(sessionId);
		session.prompt = vi.fn(async () => {
			if (session.prompt.mock.calls.length === 1)
				getOrCreateTracker(sessionId, bus).register(
					"slow-reviewer",
					"reviewer",
					1,
				);
		});
		mocks.createAgentSession.mockResolvedValue({ session });
		const integrityFailures: string[] = [];
		const qualityReviewContext = {
			runId: "qm-test",
			workspaceRoot: "/tmp",
			materialsRoot: "/tmp",
			base: "a".repeat(40),
			changedFiles: [],
			hostRunStoreRoot: syntheticPackageRoot,
			artifactSink: {},
			activeSpawns: new Set(["slow-reviewer"]),
			allowedLenses: new Set(["reviewer"]),
			attemptedLenses: new Set(["reviewer"]),
			integrityFailures,
		} as unknown as QualityReviewSessionContext;
		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
			bus,
			resolver: realResolver,
			spawnTimeoutMs: 20,
		});
		const result = await spawner.spawn({
			role: "planner",
			cwd: "/tmp",
			prompt: "go",
			qualityReviewContext,
		});
		expect(result.error).toBeUndefined();
		expect(integrityFailures).toContain(
			"Panel completion timed out after 20ms",
		);
		expect(qualityReviewContext.activeSpawns.has("slow-reviewer")).toBe(true);
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

		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
			bus,
			resolver: realResolver,
		});
		await spawner.spawn({ role: "planner", cwd: "/tmp", prompt: "go" });

		// initial + one message per child
		expect(session.prompt).toHaveBeenCalledTimes(3);
	});

	test("delivers every completion when two children settle in the same tick", async () => {
		const sessionId = nextSessionId();
		const session = createMockSession(sessionId);
		const prompts: string[] = [];

		session.prompt = vi.fn(async (message: string) => {
			prompts.push(message);
			if (prompts.length === 1) {
				const tracker = getOrCreateTracker(sessionId, bus);
				tracker.register("spawn-1", "worker", 1);
				tracker.register("spawn-2", "worker", 1);
				setTimeout(() => {
					tracker.complete("spawn-1", "first done");
					tracker.complete("spawn-2", "second done");
				}, 0);
			}
		});
		mocks.createAgentSession.mockResolvedValue({ session });

		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
			bus,
			resolver: realResolver,
		});
		await spawner.spawn({ role: "planner", cwd: "/tmp", prompt: "go" });

		expect(prompts.filter((p) => p.includes("spawnId=spawn-1"))).toHaveLength(
			1,
		);
		expect(prompts.filter((p) => p.includes("spawnId=spawn-2"))).toHaveLength(
			1,
		);
	});

	test("a child that completes while its siblings are being timed out is reported as completed", async () => {
		const sessionId = nextSessionId();
		const tracker = getOrCreateTracker(sessionId, bus);
		tracker.register("slow", "worker", 1);
		tracker.register("finisher", "worker", 1);
		bus.subscribe("spawn_failed", () => {
			tracker.complete("finisher", "really finished");
		});

		const timedOut = await awaitNextCompletionMessages(tracker, 0);
		const delivered = [...timedOut];
		while (tracker.hasUndeliveredWork()) {
			delivered.push(...(await awaitNextCompletionMessages(tracker, 0)));
		}

		const aboutFinisher = delivered.filter((m) =>
			m.includes("spawnId=finisher"),
		);
		expect(aboutFinisher).toHaveLength(1);
		expect(aboutFinisher[0]).toContain("outcome=success");
		expect(delivered.filter((m) => m.includes("spawnId=slow"))).toHaveLength(1);
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

		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
			bus,
			resolver: realResolver,
		});
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

		const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR, {
			bus,
			resolver: realResolver,
		});
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
