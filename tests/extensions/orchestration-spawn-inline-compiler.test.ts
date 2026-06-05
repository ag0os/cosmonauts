import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import "./orchestration-mocks.ts";

import orchestrationExtension from "../../domains/shared/extensions/orchestration/index.ts";
import type { AgentRegistry } from "../../lib/agents/index.ts";
import type { DomainRegistry } from "../../lib/domains/registry.ts";
import { DomainResolver } from "../../lib/domains/resolver.ts";
import { FileRunStore } from "../../lib/durable-runtime/index.ts";
import {
	registerPlanContext,
	removePlanContext,
} from "../../lib/orchestration/plan-session-context.ts";
import { removeTracker } from "../../lib/orchestration/spawn-tracker.ts";
import {
	createMockPi,
	flushAsync,
	loadOrchestrationDomainFixtures,
	testDomainsDir,
} from "./orchestration-helpers.ts";
import { getOrchestrationMocks } from "./orchestration-mocks.ts";

const mocks = getOrchestrationMocks();
const PLAN_SLUG = "orchestration-surface-consolidation";

describe("spawn_agent inline compiler boundary", () => {
	let realRegistry: AgentRegistry;
	let realDomainRegistry: DomainRegistry;

	beforeAll(async () => {
		const fixtures = await loadOrchestrationDomainFixtures();
		realRegistry = fixtures.agentRegistry;
		realDomainRegistry = fixtures.domainRegistry;
	});

	beforeEach(() => {
		vi.clearAllMocks();
		removePlanContext("parent-session-inline");
		removeTracker("parent-session-inline");
		const resolver = new DomainResolver(realDomainRegistry);
		mocks.runtimeCreate.mockResolvedValue({
			agentRegistry: realRegistry,
			domainContext: "coding",
			projectSkills: ["typescript"],
			skillPaths: ["/tmp/project/skills"],
			domainRegistry: realDomainRegistry,
			domainResolver: resolver,
			domainsDir: testDomainsDir,
		});
	});

	// @cosmo-behavior plan:orchestration-surface-consolidation#B-017
	// @cosmo-behavior plan:orchestration-surface-consolidation#B-019
	test("keeps spawn_agent inline spawnId behavior without creating a durable run record", async () => {
		const cwd = join(process.cwd(), "tmp-spawn-inline-test");
		const parentSessionId = "parent-session-inline";
		const pi = createMockPi(cwd, {
			sessionId: parentSessionId,
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:cosmo -->",
		});
		orchestrationExtension(pi as never);
		registerPlanContext(parentSessionId, PLAN_SLUG);
		const childSession = {
			sessionId: "child-session-inline",
			messages: [
				{
					role: "assistant",
					content: [{ type: "text", text: "Spawn completed." }],
				},
			],
			prompt: vi.fn().mockResolvedValue(undefined),
			subscribe: vi.fn(() => vi.fn()),
			dispose: vi.fn(),
			getSessionStats: vi.fn(() => ({
				tokens: { input: 1, output: 2, total: 3 },
				cost: 0,
				userMessages: 1,
				toolCalls: 0,
			})),
		};
		mocks.createAgentSessionFromDefinition.mockResolvedValue({
			session: childSession,
			sessionFilePath: undefined,
		});

		try {
			const result = (await pi.callTool("spawn_agent", {
				role: "coding/worker",
				prompt: "Do the work.",
				model: "test/model",
				thinkingLevel: "high",
				runtimeContext: {
					mode: "sub-agent",
					parentRole: "cosmo",
					taskId: "TASK-382",
				},
			})) as {
				content: Array<{ type: "text"; text: string }>;
				details: { status: string; spawnId?: string };
			};
			await flushAsync();

			expect(result.details).toEqual({
				role: "coding/worker",
				status: "accepted",
				spawnId: expect.any(String),
				taskId: "TASK-382",
			});
			expect(result.content[0]?.text).toContain("Accepted spawn");
			expect(result.content[0]?.text).toContain(result.details.spawnId);
			expect(pi.sendUserMessage).toHaveBeenCalledWith(
				expect.stringContaining(
					`[spawn_completion] spawnId=${result.details.spawnId}`,
				),
				{ deliverAs: "followUp" },
			);
			expect(mocks.createAgentSessionFromDefinition).toHaveBeenCalledWith(
				expect.objectContaining({ id: "worker" }),
				expect.objectContaining({
					role: "coding/worker",
					cwd,
					prompt: "Do the work.",
					model: "test/model",
					thinkingLevel: "high",
					parentSessionId,
					planSlug: PLAN_SLUG,
					projectSkills: ["typescript"],
					skillPaths: ["/tmp/project/skills"],
				}),
				testDomainsDir,
				expect.any(DomainResolver),
			);

			const store = new FileRunStore({
				rootDir: join(cwd, "missions", "sessions"),
			});
			await expect(store.listRecentRuns()).resolves.toEqual([]);
		} finally {
			removePlanContext(parentSessionId);
			removeTracker(parentSessionId);
		}
	});
});
