// Content acceptance retained until the corresponding deletion PR.
import { createQualityReviewSessionPolicy } from "../../lib/orchestration/quality-review-session-policy.ts";
import { installContentTestHost } from "../helpers/library-host.ts";
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
import { createPiSpawner } from "../../lib/orchestration/agent-spawner.ts";
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

	describe("event subscription", () => {
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
					sessionPolicy: createQualityReviewSessionPolicy(
						{
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
						false,
					),
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
					sessionPolicy: createQualityReviewSessionPolicy(
						{
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
						false,
					),
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
	});
});

beforeEach(installContentTestHost);
