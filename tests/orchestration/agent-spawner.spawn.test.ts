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

describe("createPiSpawner", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getModel.mockReturnValue({ id: "mock-model" });
		mocks.createAgentSession.mockResolvedValue({
			session: {
				sessionId: "session-1",
				messages: [],
				prompt: vi.fn(async () => undefined),
				dispose: vi.fn(),
			},
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
});
