import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AgentDefinition } from "../../lib/agents/types.ts";

const mocks = vi.hoisted(() => ({
	createAgentSession: vi.fn(),
	sessionOpen: vi.fn(),
	sessionInMemory: vi.fn(),
	buildSessionParams: vi.fn(),
	loaderOptions: vi.fn(),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
	AuthStorage: {
		create: () => ({ kind: "auth-storage" }),
	},
	createAgentSession: mocks.createAgentSession,
	DefaultResourceLoader: class {
		private readonly options: { extensionFactories?: { name: string }[] };
		constructor(options: { extensionFactories?: { name: string }[] }) {
			this.options = options;
			mocks.loaderOptions(options);
		}
		async reload() {}
		getExtensions() {
			return {
				extensions: (this.options.extensionFactories ?? []).map((factory) => ({
					path: `<inline:${factory.name}>`,
					tools: new Map([["recall", {}]]),
				})),
				errors: [],
				runtime: {},
			};
		}
	},
	getAgentDir: () => "/tmp/test-agent-dir",
	ModelRegistry: {
		create: () => ({ find: vi.fn(() => undefined) }),
	},
	SessionManager: {
		open: mocks.sessionOpen,
		inMemory: mocks.sessionInMemory,
	},
	SettingsManager: {
		inMemory: vi.fn(() => ({})),
	},
}));

vi.mock("../../lib/agents/session-assembly.ts", () => ({
	buildSessionParams: mocks.buildSessionParams,
}));

import { createAgentSessionFromDefinition } from "../../lib/orchestration/session-factory.ts";

const TEST_AGENT: AgentDefinition = {
	id: "planner",
	description: "Test planner",
	capabilities: [],
	model: "test/model",
	tools: "none",
	extensions: [],
	skills: ["*"],
	projectContext: false,
	session: "ephemeral",
	loop: false,
	domain: "coding",
};

describe("session-factory planSlug validation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.buildSessionParams.mockResolvedValue({
			promptContent: "system prompt",
			tools: [],
			extensionPaths: [],
			extensionFactories: [],
			knowledgeSurfaceEnabled: false,
			skillsOverride: undefined,
			additionalSkillPaths: undefined,
			projectContext: false,
			model: { id: "test/model" },
			thinkingLevel: undefined,
		});
		mocks.sessionInMemory.mockReturnValue({ kind: "in-memory" });
		mocks.sessionOpen.mockReturnValue({ kind: "file-backed" });
		mocks.createAgentSession.mockResolvedValue({
			session: { sessionId: "session-1" },
		});
	});

	test("passes the enabled inline knowledge factory to spawned sessions", async () => {
		const factory = {
			name: "cosmonauts-knowledge-surface",
			factory: vi.fn(),
		};
		mocks.buildSessionParams.mockResolvedValue({
			promptContent: "system prompt",
			tools: [],
			extensionPaths: [],
			extensionFactories: [factory],
			knowledgeSurfaceEnabled: true,
			skillsOverride: undefined,
			additionalSkillPaths: undefined,
			projectContext: false,
			model: { id: "test/model" },
			thinkingLevel: undefined,
		});

		await createAgentSessionFromDefinition(
			TEST_AGENT,
			{ role: "planner", cwd: "/tmp/project", prompt: "plan" },
			"/tmp/domains",
		);

		expect(mocks.loaderOptions).toHaveBeenCalledWith(
			expect.objectContaining({ extensionFactories: [factory] }),
		);
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
