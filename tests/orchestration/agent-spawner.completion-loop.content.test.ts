// Content acceptance retained until the corresponding deletion PR.
import { createQualityReviewSessionPolicy } from "../../lib/orchestration/quality-review-session-policy.ts";
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
	createAgentSession: mocks.createAgentSession,
	DefaultResourceLoader: class {
		async reload() {}
		getExtensions() {
			return { extensions: [], errors: [], runtime: {} };
		}
	},
	getAgentDir: () => "/tmp/test-agent-dir",
	ModelRegistry: class {
		find = vi.fn(() => undefined);
	},
	ModelRuntime: {
		create: vi.fn(async () => ({ kind: "model-runtime" })),
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

	// AC#1 + AC#2: loop activates and delivers formatted success message

	// AC#2: failed child produces a failure message

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
			sessionPolicy: createQualityReviewSessionPolicy(
				qualityReviewContext,
				false,
			),
		});
		expect(result.error).toBeUndefined();
		expect(integrityFailures).toContain(
			"Panel completion timed out after 20ms",
		);
		expect(qualityReviewContext.activeSpawns.has("slow-reviewer")).toBe(true);
	});

	// AC#1: loop iterates once per child when multiple children complete sequentially

	// AC#5: timeout delivers failure messages and exits loop

	// AC#5: all concurrently-running spawns are timed out together

	// AC#4: removeTracker called even when prompt throws

	// AC#4: removeTracker called even when a loop prompt throws
});
