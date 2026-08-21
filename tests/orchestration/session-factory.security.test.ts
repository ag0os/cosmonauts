import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AgentDefinition } from "../../lib/agents/types.ts";

const mocks = vi.hoisted(() => ({
	createAgentSession: vi.fn(),
	sessionOpen: vi.fn(),
	sessionInMemory: vi.fn(),
	buildSessionParams: vi.fn(),
	loaderOptions: vi.fn(),
	unrelatedTool: vi.fn(async () => "spawned-tool-called"),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
	AuthStorage: {
		create: () => ({ kind: "auth-storage" }),
	},
	createAgentSession: mocks.createAgentSession,
	DefaultResourceLoader: class {
		private readonly options: {
			extensionFactories?: { name: string }[];
			additionalExtensionPaths?: string[];
		};
		constructor(options: {
			extensionFactories?: { name: string }[];
			additionalExtensionPaths?: string[];
		}) {
			this.options = options;
			mocks.loaderOptions(options);
		}
		async reload() {}
		getExtensions() {
			const pathExtensions = (this.options.additionalExtensionPaths ?? []).map(
				(path) => ({
					path,
					tools: path.includes("conflict")
						? new Map([["recall", {}]])
						: new Map([
								["spawned_unrelated_tool", { execute: mocks.unrelatedTool }],
							]),
				}),
			);
			return {
				extensions: [
					...(this.options.extensionFactories ?? []).map((factory) => ({
						path: `<inline:${factory.name}>`,
						tools: new Map([["recall", {}]]),
					})),
					...pathExtensions,
				],
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

	test("keeps unrelated extension tools callable in enabled spawned sessions @cosmo-behavior plan:knowledge-surface#B-005", async () => {
		const factory = {
			name: "cosmonauts-knowledge-surface",
			factory: vi.fn(),
		};
		mocks.buildSessionParams.mockResolvedValue({
			promptContent: "system prompt",
			tools: [],
			extensionPaths: ["/installed/unrelated/index.ts"],
			extensionFactories: [factory],
			knowledgeSurfaceEnabled: true,
			skillsOverride: undefined,
			additionalSkillPaths: undefined,
			projectContext: false,
			model: { id: "test/model" },
			thinkingLevel: undefined,
		});
		mocks.createAgentSession.mockImplementation(async (options) => ({
			session: {
				sessionId: "session-1",
				async callTool(name: string, args?: unknown) {
					if (!options.tools.includes(name)) {
						throw new Error(`Tool ${name} is not callable`);
					}
					for (const extension of options.resourceLoader.getExtensions()
						.extensions) {
						const tool = extension.tools.get(name) as
							| { execute?: (input?: unknown) => Promise<unknown> }
							| undefined;
						if (tool?.execute) return tool.execute(args);
					}
					throw new Error(`Tool ${name} has no executable definition`);
				},
			},
		}));

		const result = await createAgentSessionFromDefinition(
			TEST_AGENT,
			{ role: "planner", cwd: "/tmp/project", prompt: "plan" },
			"/tmp/domains",
		);

		expect(mocks.loaderOptions).toHaveBeenCalledWith(
			expect.objectContaining({
				additionalExtensionPaths: ["/installed/unrelated/index.ts"],
				extensionFactories: [factory],
			}),
		);
		await expect(
			(
				result.session as unknown as {
					callTool(name: string): Promise<unknown>;
				}
			).callTool("spawned_unrelated_tool"),
		).resolves.toBe("spawned-tool-called");
		expect(mocks.unrelatedTool).toHaveBeenCalledTimes(1);
	});

	test("rejects an enabled spawned-session recall collision before session use", async () => {
		mocks.buildSessionParams.mockResolvedValue({
			promptContent: "system prompt",
			tools: [],
			extensionPaths: ["/installed/conflict/index.ts"],
			extensionFactories: [
				{ name: "cosmonauts-knowledge-surface", factory: vi.fn() },
			],
			knowledgeSurfaceEnabled: true,
			skillsOverride: undefined,
			additionalSkillPaths: undefined,
			projectContext: false,
			model: { id: "test/model" },
			thinkingLevel: undefined,
		});

		await expect(
			createAgentSessionFromDefinition(
				TEST_AGENT,
				{ role: "planner", cwd: "/tmp/project", prompt: "plan" },
				"/tmp/domains",
			),
		).rejects.toThrow(
			/<inline:cosmonauts-knowledge-surface>.*\/installed\/conflict\/index\.ts/,
		);
		expect(mocks.sessionInMemory).not.toHaveBeenCalled();
		expect(mocks.createAgentSession).not.toHaveBeenCalled();
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
