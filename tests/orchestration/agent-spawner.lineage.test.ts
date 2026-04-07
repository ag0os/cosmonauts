/**
 * Tests for post-completion transcript and manifest recording in agent-spawner.
 * Covers plan-linked spawns (with planSlug) and non-plan spawns (without planSlug).
 */

import { join } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";

const mocks = vi.hoisted(() => ({
	getModel: vi.fn(),
	createAgentSessionFromDefinition: vi.fn(),
	generateTranscript: vi.fn(),
	writeTranscript: vi.fn(),
	appendSession: vi.fn(),
}));

vi.mock("@mariozechner/pi-ai", () => ({
	getModel: mocks.getModel,
}));

// Pi SDK mock — only SessionManager.inMemory is used when planSlug is absent;
// the session-factory is mocked so these are here for DefaultResourceLoader etc.
vi.mock("@mariozechner/pi-coding-agent", () => ({
	createAgentSession: vi.fn(),
	createCodingTools: () => [],
	createReadOnlyTools: () => [],
	DefaultResourceLoader: class {
		async reload() {}
	},
	SessionManager: {
		inMemory: () => ({ kind: "in-memory" }),
		open: vi.fn(() => ({ kind: "file-backed" })),
	},
	SettingsManager: {
		inMemory: () => ({}),
	},
}));

vi.mock("../../lib/orchestration/session-factory.ts", () => ({
	createAgentSessionFromDefinition: mocks.createAgentSessionFromDefinition,
}));

vi.mock("../../lib/sessions/session-store.ts", () => ({
	generateTranscript: mocks.generateTranscript,
	writeTranscript: mocks.writeTranscript,
	sessionsDirForPlan: (cwd: string, planSlug: string) =>
		join(cwd, "missions", "sessions", planSlug),
}));

vi.mock("../../lib/sessions/manifest.ts", () => ({
	appendSession: mocks.appendSession,
}));

import { createPiSpawner } from "../../lib/orchestration/agent-spawner.ts";

const FIXTURE_AGENT: AgentDefinition = {
	id: "planner",
	description: "Fixture planner",
	capabilities: ["core"],
	model: "fixture-provider/fixture-model",
	tools: "readonly",
	extensions: [],
	projectContext: false,
	session: "ephemeral",
	loop: false,
};

const FIXTURE_REGISTRY = new AgentRegistry([FIXTURE_AGENT]);
const DOMAINS_DIR = "/fake/domains";

const MOCK_SESSION_STATS = {
	sessionFile: undefined,
	sessionId: "session-abc",
	userMessages: 2,
	assistantMessages: 2,
	toolCalls: 3,
	toolResults: 3,
	totalMessages: 8,
	tokens: {
		input: 500,
		output: 300,
		cacheRead: 50,
		cacheWrite: 25,
		total: 875,
	},
	cost: 0.02,
};

function createMockSession(overrides?: Record<string, unknown>) {
	return {
		sessionId: "session-abc",
		messages: [{ role: "user", content: "Plan this." }],
		prompt: vi.fn(async () => undefined),
		dispose: vi.fn(),
		subscribe: vi.fn(() => vi.fn()),
		getSessionStats: vi.fn(() => MOCK_SESSION_STATS),
		...overrides,
	};
}

describe("agent-spawner lineage recording", () => {
	const SESSION_FILE_PATH =
		"/tmp/project/missions/sessions/my-plan/planner-uuid-123.jsonl";

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getModel.mockReturnValue({ id: "mock-model" });
		mocks.generateTranscript.mockReturnValue("# Session Transcript: planner\n");
		mocks.writeTranscript.mockResolvedValue(undefined);
		mocks.appendSession.mockResolvedValue(undefined);
		mocks.createAgentSessionFromDefinition.mockResolvedValue({
			session: createMockSession(),
			sessionFilePath: SESSION_FILE_PATH,
		});
	});

	describe("plan-linked spawn (planSlug set)", () => {
		const PLAN_CONFIG = {
			role: "planner",
			cwd: "/tmp/project",
			prompt: "Plan the work.",
			planSlug: "my-plan",
		};

		test("writes transcript to plan sessions dir after successful spawn (AC#1)", async () => {
			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);
			await spawner.spawn(PLAN_CONFIG);

			expect(mocks.writeTranscript).toHaveBeenCalledOnce();
			expect(mocks.writeTranscript).toHaveBeenCalledWith(
				"/tmp/project/missions/sessions/my-plan",
				"planner-uuid-123.transcript.md",
				expect.any(String),
			);
		});

		test("transcript filename is <role>-<uuid>.transcript.md (AC#1)", async () => {
			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);
			await spawner.spawn(PLAN_CONFIG);

			const [, filename] = mocks.writeTranscript.mock.calls[0]!;
			expect(filename).toBe("planner-uuid-123.transcript.md");
		});

		test("appends manifest record with correct fields after successful spawn (AC#2)", async () => {
			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);
			await spawner.spawn(PLAN_CONFIG);

			expect(mocks.appendSession).toHaveBeenCalledOnce();
			const [baseDir, planSlug, record] = mocks.appendSession.mock.calls[0]!;
			expect(baseDir).toBe("/tmp/project/missions/sessions");
			expect(planSlug).toBe("my-plan");
			expect(record).toMatchObject({
				sessionId: "session-abc",
				role: "planner",
				outcome: "success",
				sessionFile: "planner-uuid-123.jsonl",
				transcriptFile: "planner-uuid-123.transcript.md",
			});
		});

		test("manifest record contains stats on success (AC#2)", async () => {
			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);
			await spawner.spawn(PLAN_CONFIG);

			const [, , record] = mocks.appendSession.mock.calls[0]!;
			expect(record.stats).toBeDefined();
			expect(record.stats.tokens).toEqual({
				input: 500,
				output: 300,
				total: 875,
			});
			expect(record.stats.cost).toBe(0.02);
			expect(record.stats.turns).toBe(2);
			expect(record.stats.toolCalls).toBe(3);
			expect(record.stats.durationMs).toBeGreaterThanOrEqual(0);
		});

		test("manifest record stats tokens exclude cacheRead/cacheWrite fields (AC#2)", async () => {
			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);
			await spawner.spawn(PLAN_CONFIG);

			const [, , record] = mocks.appendSession.mock.calls[0]!;
			expect(record.stats.tokens).not.toHaveProperty("cacheRead");
			expect(record.stats.tokens).not.toHaveProperty("cacheWrite");
		});

		test("manifest record contains startedAt and completedAt ISO timestamps (AC#2)", async () => {
			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);
			await spawner.spawn(PLAN_CONFIG);

			const [, , record] = mocks.appendSession.mock.calls[0]!;
			expect(record.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
			expect(record.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		});

		test("failed spawn still appends manifest entry with outcome: failed (AC#3)", async () => {
			const failingSession = createMockSession({
				prompt: vi.fn(async () => {
					throw new Error("prompt exploded");
				}),
			});
			mocks.createAgentSessionFromDefinition.mockResolvedValue({
				session: failingSession,
				sessionFilePath: SESSION_FILE_PATH,
			});

			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);
			const result = await spawner.spawn(PLAN_CONFIG);

			expect(result.success).toBe(false);
			expect(mocks.appendSession).toHaveBeenCalledOnce();
			const [, , record] = mocks.appendSession.mock.calls[0]!;
			expect(record.outcome).toBe("failed");
		});

		test("failed spawn writes transcript even on failure (AC#3)", async () => {
			const failingSession = createMockSession({
				prompt: vi.fn(async () => {
					throw new Error("prompt failed");
				}),
			});
			mocks.createAgentSessionFromDefinition.mockResolvedValue({
				session: failingSession,
				sessionFilePath: SESSION_FILE_PATH,
			});

			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);
			await spawner.spawn(PLAN_CONFIG);

			expect(mocks.writeTranscript).toHaveBeenCalledOnce();
		});

		test("failed spawn manifest record has no stats (AC#3)", async () => {
			const failingSession = createMockSession({
				prompt: vi.fn(async () => {
					throw new Error("prompt failed");
				}),
			});
			mocks.createAgentSessionFromDefinition.mockResolvedValue({
				session: failingSession,
				sessionFilePath: SESSION_FILE_PATH,
			});

			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);
			await spawner.spawn(PLAN_CONFIG);

			const [, , record] = mocks.appendSession.mock.calls[0]!;
			expect(record.stats).toBeUndefined();
		});

		test("includes parentSessionId in manifest record when provided", async () => {
			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);
			await spawner.spawn({ ...PLAN_CONFIG, parentSessionId: "parent-xyz" });

			const [, , record] = mocks.appendSession.mock.calls[0]!;
			expect(record.parentSessionId).toBe("parent-xyz");
		});

		test("includes taskId in manifest record when provided via runtimeContext", async () => {
			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);
			await spawner.spawn({
				...PLAN_CONFIG,
				runtimeContext: {
					mode: "sub-agent",
					parentRole: "coordinator",
					taskId: "COSMO-042",
				},
			});

			const [, , record] = mocks.appendSession.mock.calls[0]!;
			expect(record.taskId).toBe("COSMO-042");
		});

		test("lineage errors do not crash the spawn", async () => {
			mocks.appendSession.mockRejectedValue(new Error("disk full"));

			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);
			const result = await spawner.spawn(PLAN_CONFIG);

			// Spawn still reports success despite lineage error
			expect(result.success).toBe(true);
		});
	});

	describe("non-plan spawn (planSlug absent) — AC#4, AC#5", () => {
		const NO_PLAN_CONFIG = {
			role: "planner",
			cwd: "/tmp/project",
			prompt: "Plan the work.",
			// no planSlug
		};

		beforeEach(() => {
			// For non-plan spawns, sessionFilePath is undefined
			mocks.createAgentSessionFromDefinition.mockResolvedValue({
				session: createMockSession(),
				sessionFilePath: undefined,
			});
		});

		test("does not write transcript when planSlug is absent (AC#4)", async () => {
			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);
			await spawner.spawn(NO_PLAN_CONFIG);

			expect(mocks.writeTranscript).not.toHaveBeenCalled();
		});

		test("does not append manifest when planSlug is absent (AC#4)", async () => {
			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);
			await spawner.spawn(NO_PLAN_CONFIG);

			expect(mocks.appendSession).not.toHaveBeenCalled();
		});

		test("non-plan spawn still succeeds normally (AC#5)", async () => {
			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);
			const result = await spawner.spawn(NO_PLAN_CONFIG);

			expect(result.success).toBe(true);
			expect(result.sessionId).toBe("session-abc");
		});

		test("generateTranscript is not called when planSlug is absent (AC#4)", async () => {
			const spawner = createPiSpawner(FIXTURE_REGISTRY, DOMAINS_DIR);
			await spawner.spawn(NO_PLAN_CONFIG);

			expect(mocks.generateTranscript).not.toHaveBeenCalled();
		});
	});
});
