import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
	registerSessionPolicy,
	removeSessionPolicy,
} from "../../lib/agents/session-policy.ts";
import { createQualityReviewSessionPolicy } from "../../lib/orchestration/quality-review-session-policy.ts";
import "./orchestration-mocks.ts";

import type { AgentRegistry } from "../../lib/agents/index.ts";
import type { DomainRegistry } from "../../lib/domains/registry.ts";
import { DomainResolver } from "../../lib/domains/resolver.ts";
import orchestrationExtension from "../../lib/extensions/orchestration/index.ts";
import { removePlanContext } from "../../lib/orchestration/plan-session-context.ts";
import { removeTracker } from "../../lib/orchestration/spawn-tracker.ts";
import {
	createMockPi,
	flushAsync,
	loadOrchestrationDomainFixtures,
	testDomainsDir,
} from "./orchestration-helpers.ts";
import { getOrchestrationMocks } from "./orchestration-mocks.ts";

const mocks = getOrchestrationMocks();

describe("spawn_agent inline compiler boundary", () => {
	test("uses the configured reviewer model only for the quality panel generalist", async () => {
		const fixtures = await loadOrchestrationDomainFixtures({
			includeReviewers: true,
		});
		const resolver = new DomainResolver(fixtures.domainRegistry);
		mocks.runtimeCreate.mockResolvedValue({
			agentRegistry: fixtures.agentRegistry,
			domainContext: "coding",
			projectSkills: [],
			skillPaths: [],
			domainRegistry: fixtures.domainRegistry,
			domainResolver: resolver,
			domainsDir: testDomainsDir,
		});
		const sessionId = "qm-model-wiring";
		const pi = createMockPi("/tmp/qm-panel", {
			sessionId,
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:coding/quality-manager -->",
		});
		orchestrationExtension(pi as never);
		const baseRuntime = {
			agentRegistry: fixtures.agentRegistry,
			domainContext: "coding",
			projectSkills: [],
			skillPaths: [],
			domainRegistry: fixtures.domainRegistry,
			domainResolver: resolver,
			domainsDir: testDomainsDir,
		} as never;
		registerSessionPolicy(
			sessionId,
			createQualityReviewSessionPolicy({
				runId: "qm-test",
				workspaceRoot: "/tmp/qm-panel",
				materialsRoot: "/tmp/qm-panel/materials",
				base: "base",
				changedFiles: [],
				hostRunStoreRoot: "/tmp/qm-host",
				artifactSink: {} as never,
				activeSpawns: new Set(),
				allowedLenses: new Set(["reviewer", "security-reviewer"]),
				attemptedLenses: new Set(),
				integrityFailures: [],
				reviewerModel: "anthropic/claude-sonnet-5",
				baseRuntime,
			}),
			baseRuntime,
		);
		const configs: Array<{ role: string; model?: string }> = [];
		mocks.createAgentSessionFromDefinition.mockImplementation(
			async (_definition, config) => {
				configs.push({ role: config.role, model: config.model });
				throw new Error("captured configuration");
			},
		);
		try {
			for (const role of ["coding/reviewer", "coding/security-reviewer"])
				await pi.callTool("spawn_agent", { role, prompt: "Review" });
			await flushAsync();
			expect(configs).toEqual([
				{ role: "coding/reviewer", model: "anthropic/claude-sonnet-5" },
				{ role: "coding/security-reviewer", model: undefined },
			]);
		} finally {
			removeSessionPolicy(sessionId);
			removeTracker(sessionId);
		}
	});
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
});
