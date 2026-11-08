import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { createConsumerSessionPolicy } from "../fixtures/library-consumer/policies.ts";

const mocks = vi.hoisted(() => ({
	createAgentSession: vi.fn(),
	sessionOpen: vi.fn(),
	sessionInMemory: vi.fn(),
	buildSessionParams: vi.fn(),
	loaderOptions: vi.fn(),
	unrelatedTool: vi.fn(async () => "spawned-tool-called"),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
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
					tools: path.includes("quality-tools")
						? new Map([
								...[
									"spawn_agent",
									"analysis_audit",
									"bash",
									"edit",
									"write",
									"chain_run",
									"drive_run",
									"task_create",
									"plan_edit",
								].map((name): [string, object] => [name, {}]),
							])
						: path.includes("conflict")
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
	ModelRegistry: class {
		find = vi.fn(() => undefined);
	},
	ModelRuntime: {
		create: vi.fn(async () => ({ kind: "model-runtime" })),
	},
	SessionManager: {
		open: mocks.sessionOpen,
		inMemory: mocks.sessionInMemory,
	},
	SettingsManager: {
		inMemory: vi.fn(() => ({ setProjectTrusted: vi.fn() })),
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
			session: {
				sessionId: "session-1",
				model: { provider: "observed", id: "resolved-model" },
			},
		});
	});

	test("attributes the model exposed by Pi after session creation", async () => {
		const result = await createAgentSessionFromDefinition(
			TEST_AGENT,
			{ role: "planner", cwd: "/tmp/project", prompt: "plan" },
			"/tmp/domains",
		);
		expect(result.resolvedModel).toEqual({
			provider: "observed",
			id: "resolved-model",
		});
	});

	test("preserves an exact tool grant and recall opt-out when spawning", async () => {
		const params = {
			promptContent: "consumer",
			tools: ["read"],
			exactTools: true,
			extensionPaths: ["/installed/unrelated/index.ts"],
			extensionFactories: [],
			knowledgeSurfaceEnabled: true,
			recallEnabled: false,
			projectContext: false,
			model: { id: "test/model" },
		};
		mocks.buildSessionParams.mockResolvedValue(params);
		await createAgentSessionFromDefinition(
			TEST_AGENT,
			{ role: "planner", cwd: "/tmp/project", prompt: "work" },
			"/tmp/domains",
		);
		expect(mocks.createAgentSession).toHaveBeenCalledWith(
			expect.objectContaining({ tools: ["read"] }),
		);
		mocks.buildSessionParams.mockResolvedValue({
			...params,
			tools: ["missing"],
		});
		await expect(
			createAgentSessionFromDefinition(
				TEST_AGENT,
				{ role: "planner", cwd: "/tmp/project", prompt: "work" },
				"/tmp/domains",
			),
		).rejects.toThrow("Unknown tool");
		expect(mocks.createAgentSession).toHaveBeenCalledTimes(1);
	});

	test("keeps unrelated extension tools callable in enabled spawned sessions", async () => {
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
				model: { provider: "observed", id: "resolved-model" },
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

	// @cosmo-behavior plan:qm-chain-safety#B-001

	// @cosmo-behavior plan:qm-chain-safety#B-003
});

test("applies a consumer host policy to an arbitrary declared actor", async () => {
	mocks.createAgentSession.mockResolvedValue({
		session: { model: { provider: "test", id: "model" } },
	});
	const settings = { source: "consumer-settings" };
	const loadConfig = vi.fn();
	const policy = createConsumerSessionPolicy({
		toolPreset: "readonly" as const,
		filterTools: vi.fn((tools: readonly string[]) =>
			tools.filter((name) => name === "read"),
		),
		loadConfig,
		prepareSkills: vi.fn(async () => ["/consumer/skills"]),
		resourceOptions: vi.fn(async () => ({
			cwd: "/hostile",
			noExtensions: false,
			noSkills: false,
			settingsManager: { source: "hostile" },
			appendSystemPrompt: ["host appendix"],
			additionalExtensionPaths: ["/policy/provider"],
			agentsFilesOverride: () => ({ agentsFiles: [] }),
		})),
		settingsManager: () => settings,
	});
	mocks.buildSessionParams.mockResolvedValue({
		promptContent: "consumer persona",
		tools: ["read", "bash"],
		extensionPaths: [],
		extensionFactories: [],
		knowledgeSurfaceEnabled: false,
		projectContext: true,
		model: { provider: "test", id: "model" },
	});
	await createAgentSessionFromDefinition(
		{ ...TEST_AGENT, id: "archivist", domain: "studio" },
		{
			role: "studio/archivist",
			cwd: "/consumer",
			prompt: "catalogue",
			sessionPolicy: policy,
			skillPaths: ["/request/skills"],
			compaction: { enabled: true },
		},
		"/consumer/providers",
	);
	expect(policy.prepareSkills).toHaveBeenCalledWith(
		["/request/skills"],
		"/consumer/providers",
	);
	expect(mocks.buildSessionParams.mock.calls.at(-1)?.[0]).toMatchObject({
		sessionPolicy: policy,
		loadConfig,
		skillPaths: ["/consumer/skills"],
	});
	expect(policy.resourceOptions).toHaveBeenCalledWith(
		expect.objectContaining({ promptContent: "consumer persona" }),
		"/consumer/providers",
	);
	expect(mocks.loaderOptions.mock.calls.at(-1)?.[0]).toMatchObject({
		appendSystemPrompt: ["host appendix"],
		additionalExtensionPaths: ["/policy/provider"],
		cwd: "/consumer",
		noExtensions: true,
		noSkills: true,
		settingsManager: settings,
	});
	expect(mocks.createAgentSession.mock.calls.at(-1)?.[0]).toMatchObject({
		tools: ["read"],
		settingsManager: settings,
	});
});

test("ordinary session context opt-out is independent of whether a host policy exists", async () => {
	mocks.createAgentSession.mockResolvedValue({
		session: { model: { provider: "test", id: "model" } },
	});
	for (const projectContext of [false, true]) {
		mocks.buildSessionParams.mockResolvedValue({
			promptContent: "ordinary",
			tools: [],
			extensionPaths: [],
			extensionFactories: [],
			knowledgeSurfaceEnabled: false,
			projectContext,
			model: { provider: "test", id: "model" },
		});
		await createAgentSessionFromDefinition(
			TEST_AGENT,
			{ role: TEST_AGENT.id, cwd: "/consumer", prompt: "work" },
			"/consumer/domains",
		);
		const loader = mocks.loaderOptions.mock.calls.at(-1)?.[0];
		if (projectContext) expect(loader.agentsFilesOverride).toBeUndefined();
		else {
			expect(loader.agentsFilesOverride).toBeTypeOf("function");
			expect(loader.agentsFilesOverride()).toEqual({ agentsFiles: [] });
		}
	}
});
