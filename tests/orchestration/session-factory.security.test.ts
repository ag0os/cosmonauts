import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AgentDefinition } from "../../lib/agents/types.ts";

const mocks = vi.hoisted(() => ({
	createAgentSession: vi.fn(),
	sessionOpen: vi.fn(),
	sessionInMemory: vi.fn(),
	resolveTools: vi.fn(),
	resolveExtensionPaths: vi.fn(),
	resolveModel: vi.fn(),
	assemblePrompts: vi.fn(),
	buildSkillsOverride: vi.fn(),
	appendAgentIdentityMarker: vi.fn(),
	qualifyAgentId: vi.fn(),
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
	createAgentSession: mocks.createAgentSession,
	DefaultResourceLoader: class {
		async reload() {}
	},
	SessionManager: {
		open: mocks.sessionOpen,
		inMemory: mocks.sessionInMemory,
	},
	SettingsManager: {
		inMemory: vi.fn(() => ({})),
	},
}));

vi.mock("../../lib/orchestration/definition-resolution.ts", () => ({
	resolveTools: mocks.resolveTools,
	resolveExtensionPaths: mocks.resolveExtensionPaths,
}));

vi.mock("../../lib/orchestration/model-resolution.ts", () => ({
	FALLBACK_MODEL: "test/model",
	resolveModel: mocks.resolveModel,
}));

vi.mock("../../lib/domains/prompt-assembly.ts", () => ({
	assemblePrompts: mocks.assemblePrompts,
}));

vi.mock("../../lib/agents/skills.ts", () => ({
	buildSkillsOverride: mocks.buildSkillsOverride,
}));

vi.mock("../../lib/agents/index.ts", () => ({
	appendAgentIdentityMarker: mocks.appendAgentIdentityMarker,
	qualifyAgentId: mocks.qualifyAgentId,
}));

import { createAgentSessionFromDefinition } from "../../lib/orchestration/session-factory.ts";

const TEST_AGENT: AgentDefinition = {
	id: "planner",
	description: "Test planner",
	capabilities: [],
	model: "test/model",
	tools: "none",
	extensions: [],
	projectContext: false,
	session: "ephemeral",
	loop: false,
	domain: "coding",
};

describe("session-factory planSlug validation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.resolveModel.mockReturnValue({ id: "test/model" });
		mocks.resolveTools.mockReturnValue([]);
		mocks.resolveExtensionPaths.mockReturnValue([]);
		mocks.assemblePrompts.mockResolvedValue("system prompt");
		mocks.buildSkillsOverride.mockReturnValue(undefined);
		mocks.appendAgentIdentityMarker.mockImplementation((prompt) => prompt);
		mocks.qualifyAgentId.mockReturnValue("coding/planner");
		mocks.sessionInMemory.mockReturnValue({ kind: "in-memory" });
		mocks.sessionOpen.mockReturnValue({ kind: "file-backed" });
		mocks.createAgentSession.mockResolvedValue({
			session: { sessionId: "session-1" },
		});
	});

	test("rejects invalid planSlug before creating session persistence paths", async () => {
		await expect(
			createAgentSessionFromDefinition(
				TEST_AGENT,
				{
					role: "planner",
					cwd: "/tmp/project",
					prompt: "plan",
					planSlug: "../../escape",
				},
				"/tmp/domains",
			),
		).rejects.toThrow("Invalid plan slug");

		expect(mocks.sessionOpen).not.toHaveBeenCalled();
		expect(mocks.createAgentSession).not.toHaveBeenCalled();
	});
});
