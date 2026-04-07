/**
 * Tests for spawn_agent child session lineage persistence.
 *
 * Verifies that child sessions launched via spawn_agent:
 *   - carry plan context when the parent session has a registered planSlug (AC#1)
 *   - persist transcript and manifest entries using the correct record shape (AC#2)
 *   - do not write any files when no plan context is registered (AC#3)
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from "vitest";
import type { AgentRegistry } from "../../lib/agents/index.ts";
import { createRegistryFromDomains } from "../../lib/agents/index.ts";
import { loadDomainsFromSources } from "../../lib/domains/index.ts";
import { DomainRegistry } from "../../lib/domains/registry.ts";
import { DomainResolver } from "../../lib/domains/resolver.ts";

// ============================================================================
// Hoisted mock references
// ============================================================================

const mocks = vi.hoisted(() => ({
	runtimeCreate: vi.fn(),
	createAgentSessionFromDefinition: vi.fn(),
	generateTranscript: vi.fn(),
	writeTranscript: vi.fn(),
	appendSession: vi.fn(),
}));

vi.mock("../../lib/runtime.ts", () => ({
	CosmonautsRuntime: {
		create: mocks.runtimeCreate,
	},
}));

vi.mock("../../lib/orchestration/session-factory.ts", () => ({
	createAgentSessionFromDefinition: mocks.createAgentSessionFromDefinition,
}));

vi.mock("../../lib/sessions/session-store.ts", () => ({
	generateTranscript: mocks.generateTranscript,
	writeTranscript: mocks.writeTranscript,
	sessionsDirForPlan: (cwd: string, planSlug: string) =>
		`${cwd}/missions/sessions/${planSlug}`,
}));

vi.mock("../../lib/sessions/manifest.ts", () => ({
	appendSession: mocks.appendSession,
}));

// Chain tools are not under test here; stub out runChain / parseChain.
vi.mock("../../lib/orchestration/chain-runner.ts", () => ({
	runChain: vi.fn(),
	derivePlanSlug: vi.fn(),
	getDefaultStagePrompt: vi.fn(),
	injectUserPrompt: vi.fn(),
}));
vi.mock("../../lib/orchestration/chain-parser.ts", () => ({
	parseChain: vi.fn(),
}));
vi.mock("../../lib/orchestration/agent-spawner.ts", () => ({
	createPiSpawner: vi.fn(),
}));

import orchestrationExtension from "../../domains/shared/extensions/orchestration/index.ts";
import {
	registerPlanContext,
	removePlanContext,
} from "../../lib/orchestration/plan-session-context.ts";

// ============================================================================
// Helpers
// ============================================================================

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

const PARENT_SESSION_ID = "parent-session-xyz";
const PLAN_SLUG = "my-feature-plan";
const SESSION_FILE_PATH =
	"/tmp/project/missions/sessions/my-feature-plan/worker-uuid-456.jsonl";

const MOCK_SESSION_STATS = {
	sessionFile: undefined,
	sessionId: "child-session-abc",
	userMessages: 3,
	assistantMessages: 3,
	toolCalls: 4,
	toolResults: 4,
	totalMessages: 12,
	tokens: {
		input: 800,
		output: 400,
		cacheRead: 100,
		cacheWrite: 50,
		total: 1350,
	},
	cost: 0.03,
};

function createMockChildSession(overrides?: Record<string, unknown>) {
	return {
		sessionId: "child-session-abc",
		messages: [{ role: "user", content: "Do the task." }],
		prompt: vi.fn(async () => undefined),
		dispose: vi.fn(),
		subscribe: vi.fn(() => vi.fn()),
		getSessionStats: vi.fn(() => MOCK_SESSION_STATS),
		...overrides,
	};
}

interface MockPiOptions {
	systemPrompt?: string;
	sessionId?: string;
}

function createMockPi(cwd: string, options?: MockPiOptions) {
	const tools = new Map<
		string,
		{ execute: (...args: unknown[]) => Promise<unknown> }
	>();
	const sessionId = options?.sessionId ?? PARENT_SESSION_ID;
	const sendUserMessage = vi.fn();
	return {
		registerTool(def: {
			name: string;
			execute: (...args: unknown[]) => Promise<unknown>;
		}) {
			tools.set(def.name, def);
		},
		sendUserMessage,
		async callTool(name: string, params: unknown) {
			const tool = tools.get(name);
			if (!tool) throw new Error(`Tool not found: ${name}`);
			return tool.execute("call-id", params, undefined, undefined, {
				cwd,
				getSystemPrompt: () =>
					options?.systemPrompt ?? "<!-- COSMONAUTS_AGENT_ID:cosmo -->",
				sessionManager: { getSessionId: () => sessionId },
			});
		},
	};
}

function mockRuntime() {
	const resolver = new DomainResolver(realDomainRegistry);
	mocks.runtimeCreate.mockResolvedValue({
		agentRegistry: realRegistry,
		domainContext: "coding",
		projectSkills: [],
		skillPaths: [],
		domainRegistry: realDomainRegistry,
		domainResolver: resolver,
		domainsDir: testDomainsDir,
	});
}

/** Flush all pending microtasks and one event-loop tick. */
async function flushAsync() {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

// ============================================================================
// Tests
// ============================================================================

describe("spawn_agent child session lineage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRuntime();
		mocks.generateTranscript.mockReturnValue("# Session Transcript: worker\n");
		mocks.writeTranscript.mockResolvedValue(undefined);
		mocks.appendSession.mockResolvedValue(undefined);
	});

	afterEach(() => {
		// Clean up plan context registry to avoid test pollution.
		removePlanContext(PARENT_SESSION_ID);
	});

	describe("plan-context spawn (parent session has registered planSlug)", () => {
		beforeEach(() => {
			// Simulate the parent session being spawned with planSlug.
			registerPlanContext(PARENT_SESSION_ID, PLAN_SLUG);
			mocks.createAgentSessionFromDefinition.mockResolvedValue({
				session: createMockChildSession(),
				sessionFilePath: SESSION_FILE_PATH,
			});
		});

		test("passes planSlug to createAgentSessionFromDefinition (AC#1)", async () => {
			const cwd = "/tmp/project";
			const pi = createMockPi(cwd, { sessionId: PARENT_SESSION_ID });
			orchestrationExtension(pi as never);

			await pi.callTool("spawn_agent", {
				role: "worker",
				prompt: "implement the task",
			});

			await flushAsync();

			expect(mocks.createAgentSessionFromDefinition).toHaveBeenCalledWith(
				expect.any(Object),
				expect.objectContaining({ planSlug: PLAN_SLUG }),
				expect.any(String),
				expect.any(DomainResolver),
			);
		});

		test("writes transcript under plan sessions dir after completion (AC#1)", async () => {
			const cwd = "/tmp/project";
			const pi = createMockPi(cwd, { sessionId: PARENT_SESSION_ID });
			orchestrationExtension(pi as never);

			await pi.callTool("spawn_agent", {
				role: "worker",
				prompt: "implement the task",
			});

			await flushAsync();

			expect(mocks.writeTranscript).toHaveBeenCalledOnce();
			expect(mocks.writeTranscript).toHaveBeenCalledWith(
				"/tmp/project/missions/sessions/my-feature-plan",
				"worker-uuid-456.transcript.md",
				expect.any(String),
			);
		});

		test("appends manifest entry with correct shape after completion (AC#2)", async () => {
			const cwd = "/tmp/project";
			const pi = createMockPi(cwd, { sessionId: PARENT_SESSION_ID });
			orchestrationExtension(pi as never);

			await pi.callTool("spawn_agent", {
				role: "worker",
				prompt: "implement the task",
			});

			await flushAsync();

			expect(mocks.appendSession).toHaveBeenCalledOnce();
			const [baseDir, planSlug, record] = mocks.appendSession.mock.calls[0]!;
			expect(baseDir).toBe("/tmp/project/missions/sessions");
			expect(planSlug).toBe(PLAN_SLUG);
			expect(record).toMatchObject({
				sessionId: "child-session-abc",
				role: "worker",
				parentSessionId: PARENT_SESSION_ID,
				outcome: "success",
				sessionFile: "worker-uuid-456.jsonl",
				transcriptFile: "worker-uuid-456.transcript.md",
			});
		});

		test("manifest record contains stats on success (AC#2)", async () => {
			const cwd = "/tmp/project";
			const pi = createMockPi(cwd, { sessionId: PARENT_SESSION_ID });
			orchestrationExtension(pi as never);

			await pi.callTool("spawn_agent", {
				role: "worker",
				prompt: "implement the task",
			});

			await flushAsync();

			const [, , record] = mocks.appendSession.mock.calls[0]!;
			expect(record.stats).toBeDefined();
			expect(record.stats.tokens).toEqual({
				input: 800,
				output: 400,
				total: 1350,
			});
			expect(record.stats.cost).toBe(0.03);
			expect(record.stats.turns).toBe(3);
			expect(record.stats.toolCalls).toBe(4);
			expect(record.stats.durationMs).toBeGreaterThanOrEqual(0);
		});

		test("manifest record contains startedAt and completedAt ISO timestamps (AC#2)", async () => {
			const cwd = "/tmp/project";
			const pi = createMockPi(cwd, { sessionId: PARENT_SESSION_ID });
			orchestrationExtension(pi as never);

			await pi.callTool("spawn_agent", {
				role: "worker",
				prompt: "implement the task",
			});

			await flushAsync();

			const [, , record] = mocks.appendSession.mock.calls[0]!;
			expect(record.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
			expect(record.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		});

		test("includes taskId in manifest record when provided via runtimeContext (AC#2)", async () => {
			const cwd = "/tmp/project";
			const pi = createMockPi(cwd, { sessionId: PARENT_SESSION_ID });
			orchestrationExtension(pi as never);

			await pi.callTool("spawn_agent", {
				role: "worker",
				prompt: "implement the task",
				runtimeContext: {
					mode: "sub-agent",
					parentRole: "coordinator",
					taskId: "COSMO-042",
				},
			});

			await flushAsync();

			const [, , record] = mocks.appendSession.mock.calls[0]!;
			expect(record.taskId).toBe("COSMO-042");
		});

		test("failed child session still appends manifest entry with outcome: failed (AC#2)", async () => {
			mocks.createAgentSessionFromDefinition.mockResolvedValue({
				session: createMockChildSession({
					prompt: vi.fn(async () => {
						throw new Error("worker crashed");
					}),
				}),
				sessionFilePath: SESSION_FILE_PATH,
			});

			const cwd = "/tmp/project";
			const pi = createMockPi(cwd, { sessionId: PARENT_SESSION_ID });
			orchestrationExtension(pi as never);

			await pi.callTool("spawn_agent", {
				role: "worker",
				prompt: "implement the task",
			});

			await flushAsync();

			expect(mocks.appendSession).toHaveBeenCalledOnce();
			const [, , record] = mocks.appendSession.mock.calls[0]!;
			expect(record.outcome).toBe("failed");
			expect(record.stats).toBeUndefined();
		});

		test("failed child session still writes transcript (AC#2)", async () => {
			mocks.createAgentSessionFromDefinition.mockResolvedValue({
				session: createMockChildSession({
					prompt: vi.fn(async () => {
						throw new Error("worker crashed");
					}),
				}),
				sessionFilePath: SESSION_FILE_PATH,
			});

			const cwd = "/tmp/project";
			const pi = createMockPi(cwd, { sessionId: PARENT_SESSION_ID });
			orchestrationExtension(pi as never);

			await pi.callTool("spawn_agent", {
				role: "worker",
				prompt: "implement the task",
			});

			await flushAsync();

			expect(mocks.writeTranscript).toHaveBeenCalledOnce();
		});

		test("lineage errors do not crash the spawn (AC#1)", async () => {
			mocks.appendSession.mockRejectedValue(new Error("disk full"));

			const cwd = "/tmp/project";
			const pi = createMockPi(cwd, { sessionId: PARENT_SESSION_ID });
			orchestrationExtension(pi as never);

			const result = (await pi.callTool("spawn_agent", {
				role: "worker",
				prompt: "implement the task",
			})) as { details: { status: string } };

			await flushAsync();

			// Spawn still accepted despite lineage error
			expect(result.details.status).toBe("accepted");
		});
	});

	describe("non-plan spawn (parent session has no registered planSlug) — AC#3", () => {
		beforeEach(() => {
			// No registerPlanContext call — no plan context for parent session.
			mocks.createAgentSessionFromDefinition.mockResolvedValue({
				session: createMockChildSession(),
				sessionFilePath: undefined,
			});
		});

		test("does not call createAgentSessionFromDefinition with planSlug when no context (AC#3)", async () => {
			const cwd = "/tmp/project";
			const pi = createMockPi(cwd, { sessionId: PARENT_SESSION_ID });
			orchestrationExtension(pi as never);

			await pi.callTool("spawn_agent", {
				role: "worker",
				prompt: "implement the task",
			});

			await flushAsync();

			const [, spawnConfig] =
				mocks.createAgentSessionFromDefinition.mock.calls[0]!;
			expect((spawnConfig as Record<string, unknown>).planSlug).toBeUndefined();
		});

		test("does not write transcript when no plan context (AC#3)", async () => {
			const cwd = "/tmp/project";
			const pi = createMockPi(cwd, { sessionId: PARENT_SESSION_ID });
			orchestrationExtension(pi as never);

			await pi.callTool("spawn_agent", {
				role: "worker",
				prompt: "implement the task",
			});

			await flushAsync();

			expect(mocks.writeTranscript).not.toHaveBeenCalled();
		});

		test("does not append manifest when no plan context (AC#3)", async () => {
			const cwd = "/tmp/project";
			const pi = createMockPi(cwd, { sessionId: PARENT_SESSION_ID });
			orchestrationExtension(pi as never);

			await pi.callTool("spawn_agent", {
				role: "worker",
				prompt: "implement the task",
			});

			await flushAsync();

			expect(mocks.appendSession).not.toHaveBeenCalled();
		});

		test("non-plan spawn still returns accepted status (AC#3)", async () => {
			const cwd = "/tmp/project";
			const pi = createMockPi(cwd, { sessionId: PARENT_SESSION_ID });
			orchestrationExtension(pi as never);

			const result = (await pi.callTool("spawn_agent", {
				role: "worker",
				prompt: "implement the task",
			})) as { details: { status: string } };

			expect(result.details.status).toBe("accepted");
		});
	});
});
