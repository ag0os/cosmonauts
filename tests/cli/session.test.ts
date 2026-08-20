import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { AgentRegistry } from "../../lib/agents/resolver.ts";
import { buildAgentIdentityMarker } from "../../lib/agents/runtime-identity.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { createKnowledgeSurfaceSessionExtension } from "../../lib/extensions/knowledge-surface/session-extension.ts";
import {
	clearPendingSwitch,
	consumePendingSwitch,
	setPendingSwitch,
} from "../../lib/interactive/agent-switch.ts";
import type { MemoryStore } from "../../lib/memory/index.ts";
import { createMockPi } from "../helpers/mocks/index.ts";

const mocks = vi.hoisted(() => ({
	buildSessionParams: vi.fn(),
	createAgentSessionFromServices: vi.fn(),
	createAgentSessionRuntime: vi.fn(),
	createAgentSessionServices: vi.fn(),
	continueRecent: vi.fn(),
	inMemory: vi.fn(),
	open: vi.fn(),
	create: vi.fn(),
	forkFrom: vi.fn(),
	list: vi.fn(),
	listAll: vi.fn(),
	readlineQuestion: vi.fn(),
}));

vi.mock("node:readline", () => ({
	createInterface: () => ({
		question: mocks.readlineQuestion,
		close: vi.fn(),
	}),
}));

vi.mock("../../lib/agents/session-assembly.ts", () => ({
	buildSessionParams: mocks.buildSessionParams,
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
	AuthStorage: {
		create: () => ({ reload: vi.fn(), hasAuth: vi.fn(() => false) }),
	},
	createAgentSessionFromServices: mocks.createAgentSessionFromServices,
	createAgentSessionRuntime: mocks.createAgentSessionRuntime,
	createAgentSessionServices: mocks.createAgentSessionServices,
	getAgentDir: () => "/tmp/pi-agent",
	ModelRegistry: {
		create: () => ({ find: vi.fn(() => undefined) }),
	},
	SessionManager: {
		continueRecent: mocks.continueRecent,
		inMemory: mocks.inMemory,
		open: mocks.open,
		create: mocks.create,
		forkFrom: mocks.forkFrom,
		list: mocks.list,
		listAll: mocks.listAll,
	},
}));

import { createSession, GracefulExitError } from "../../cli/session.ts";

const TEST_DEF: AgentDefinition = {
	id: "worker",
	description: "Test agent",
	capabilities: [],
	model: "test/model",
	tools: "none",
	extensions: [],
	skills: ["*"],
	projectContext: false,
	session: "persistent",
	loop: false,
	domain: "coding",
};

const BASE_PARAMS = {
	promptContent: "test prompt",
	tools: [],
	extensionPaths: [],
	extensionFactories: [],
	knowledgeSurfaceEnabled: false,
	skillsOverride: undefined,
	additionalSkillPaths: undefined,
	projectContext: false,
	model: { id: "test/model" },
	thinkingLevel: undefined,
};

const TEST_SESSION_DIR = "/tmp/pi-agent/sessions/--tmp-project--/worker";

describe("createSession", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearPendingSwitch();
		mocks.buildSessionParams.mockResolvedValue(BASE_PARAMS);
		mocks.createAgentSessionRuntime.mockReturnValue({ runtime: true });
		mocks.createAgentSessionServices.mockResolvedValue({
			diagnostics: {},
			resourceLoader: {
				getExtensions: () => ({ extensions: [], errors: [], runtime: {} }),
			},
		});
		mocks.createAgentSessionFromServices.mockResolvedValue({
			session: { sessionId: "session-1" },
		});
		mocks.continueRecent.mockReturnValue({ kind: "continue" });
		mocks.inMemory.mockReturnValue({ kind: "memory" });
	});

	afterEach(() => {
		clearPendingSwitch();
	});

	test("passes extraExtensionPaths to initial buildSessionParams call", async () => {
		await createSession({
			definition: TEST_DEF,
			cwd: "/tmp/project",
			domainsDir: "/tmp/domains",
			persistent: true,
			extraExtensionPaths: ["/tmp/extensions/agent-switch"],
		});

		expect(mocks.buildSessionParams).toHaveBeenCalledWith(
			expect.objectContaining({
				extraExtensionPaths: ["/tmp/extensions/agent-switch"],
			}),
		);
	});

	test("preserves legacy registration and authorization while enforcing one enabled recall across every session path @cosmo-behavior plan:knowledge-surface#B-005", async () => {
		const initialFactory = {
			name: "cosmonauts-knowledge-surface",
			factory: vi.fn(),
		};
		const switchedFactory = {
			name: "cosmonauts-knowledge-surface",
			factory: vi.fn(),
		};
		mocks.buildSessionParams
			.mockResolvedValueOnce({
				...BASE_PARAMS,
				extensionFactories: [initialFactory],
				knowledgeSurfaceEnabled: true,
			})
			.mockResolvedValueOnce({
				...BASE_PARAMS,
				extensionFactories: [switchedFactory],
				knowledgeSurfaceEnabled: true,
			});
		mocks.createAgentSessionServices.mockImplementation(async (options) => ({
			diagnostics: {},
			resourceLoader: {
				getExtensions: () => ({
					extensions: (
						options.resourceLoaderOptions.extensionFactories ?? []
					).map((factory: { name: string }) => ({
						path: `<inline:${factory.name}>`,
						tools: new Map([["recall", {}]]),
					})),
					errors: [],
					runtime: {},
				}),
			},
		}));
		mocks.createAgentSessionRuntime.mockImplementation(
			async (
				createRuntime: (args: {
					cwd: string;
					sessionManager: unknown;
					sessionStartEvent?: unknown;
				}) => Promise<unknown>,
				runtimeOptions: { cwd: string; sessionManager: unknown },
			) => {
				await createRuntime({
					cwd: runtimeOptions.cwd,
					sessionManager: runtimeOptions.sessionManager,
				});
				setPendingSwitch("planner");
				return createRuntime({
					cwd: runtimeOptions.cwd,
					sessionManager: runtimeOptions.sessionManager,
				});
			},
		);

		await createSession({
			definition: TEST_DEF,
			cwd: "/tmp/project",
			domainsDir: "/tmp/domains",
			persistent: false,
			agentRegistry: {
				resolve: () => ({ ...TEST_DEF, id: "planner" }),
			} as unknown as AgentRegistry,
			domainContext: "coding",
		});

		expect(mocks.createAgentSessionServices).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				resourceLoaderOptions: expect.objectContaining({
					extensionFactories: [initialFactory],
				}),
			}),
		);
		expect(mocks.createAgentSessionServices).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				resourceLoaderOptions: expect.objectContaining({
					extensionFactories: [switchedFactory],
				}),
			}),
		);

		const retrieve = vi.fn<MemoryStore["retrieve"]>(async () => ({
			records: [
				{
					type: "decision",
					scope: "project",
					kind: "semantic",
					title: "B-005 reaches knowledge",
					description: "Functional enabled recall evidence.",
					resource: "knowledge/b-005.md",
					tags: [],
					timestamp: "2026-08-20T00:00:00.000Z",
					content: "KNOWLEDGE_RECALL_REACHED_STORE",
					path: "/tmp/project/knowledge/b-005.md",
				},
			],
			searchedScopes: ["project", "user"],
			skippedScopes: [],
			warnings: [],
			stats: { filesScanned: 1, bytesRead: 64, durationMs: 1 },
		}));
		const store: MemoryStore = {
			write: async () => ({ kind: "unsupported", reason: "read fixture" }),
			retrieve,
			consolidate: async () => ({ kind: "noop", reason: "read fixture" }),
		};
		const functional = createKnowledgeSurfaceSessionExtension({
			agentId: "coding/worker",
			registerAgentMemoryTools: false,
			authorizeAuthoredMemory: false,
			registerArchitectureTool: false,
			authorizeArchitecture: false,
			recallOwner: "knowledge",
			canPropose: false,
			createKnowledgeStore: () => store,
		});
		if (typeof functional === "function") {
			throw new Error("Expected named enabled knowledge extension");
		}
		const pi = createMockPi({ cwd: "/tmp/project" });
		functional.factory(pi as never);
		await pi.fireEvent(
			"before_agent_start",
			{ systemPrompt: buildAgentIdentityMarker("coding/worker") },
			{ cwd: "/tmp/project" },
		);
		const recalled = (await pi.callTool("recall", {
			query: "B-005 reaches knowledge",
		})) as { content: Array<{ type: "text"; text: string }> };
		expect(recalled.content.map((entry) => entry.text).join("\n")).toContain(
			"KNOWLEDGE_RECALL_REACHED_STORE",
		);
		expect(retrieve).toHaveBeenCalledTimes(2);
		expect(retrieve).toHaveBeenLastCalledWith(
			{ projectRoot: "/tmp/project", scopes: ["project", "user"] },
			expect.objectContaining({ text: "B-005 reaches knowledge" }),
		);
	});

	test("switch path uses the session manager Pi provides, not a new one", async () => {
		const PLANNER_DEF: AgentDefinition = {
			...TEST_DEF,
			id: "planner",
			domain: "coding",
		};
		setPendingSwitch("planner");

		const injectedSm = { kind: "pi-provided-sm" };
		mocks.createAgentSessionRuntime.mockImplementation(
			(
				createRuntime: (args: {
					cwd: string;
					sessionManager: unknown;
					sessionStartEvent?: unknown;
				}) => Promise<unknown>,
				runtimeOptions: { cwd: string; sessionManager: unknown },
			) =>
				createRuntime({
					cwd: runtimeOptions.cwd,
					sessionManager: injectedSm,
					sessionStartEvent: undefined,
				}),
		);

		const resolve = vi.fn(() => PLANNER_DEF);

		await createSession({
			definition: TEST_DEF,
			cwd: "/tmp/project",
			domainsDir: "/tmp/domains",
			persistent: true,
			agentRegistry: { resolve } as unknown as AgentRegistry,
			domainContext: "coding",
		});

		// The switch path must pass Pi's session manager (injectedSm) to
		// createAgentSessionFromServices, NOT create its own via continueRecent.
		expect(mocks.createAgentSessionFromServices).toHaveBeenCalledWith(
			expect.objectContaining({
				sessionManager: injectedSm,
			}),
		);
		// continueRecent is called once for the initial session setup,
		// but NOT a second time for the switch target.
		expect(mocks.continueRecent).toHaveBeenCalledTimes(1);
	});

	test("clears pending switch when runtime resolution rejects unknown ID", async () => {
		setPendingSwitch("ghost");
		mocks.createAgentSessionRuntime.mockImplementation(
			(
				createRuntime: (args: {
					cwd: string;
					sessionManager: unknown;
					sessionStartEvent?: unknown;
				}) => Promise<unknown>,
				runtimeOptions: { cwd: string; sessionManager: unknown },
			) =>
				createRuntime({
					cwd: runtimeOptions.cwd,
					sessionManager: runtimeOptions.sessionManager,
					sessionStartEvent: undefined,
				}),
		);
		const resolve = vi.fn(() => {
			throw new Error('Unknown agent ID "ghost"');
		});

		await expect(
			createSession({
				definition: TEST_DEF,
				cwd: "/tmp/project",
				domainsDir: "/tmp/domains",
				persistent: false,
				agentRegistry: { resolve } as unknown as AgentRegistry,
				domainContext: "coding",
			}),
		).rejects.toThrow('Unknown agent ID "ghost"');

		expect(resolve).toHaveBeenCalledWith("ghost", "coding");
		expect(consumePendingSwitch()).toBeUndefined();
	});
});

// ============================================================================
// Session flag handling and graceful abort paths
// ============================================================================

describe("session flag handling", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.buildSessionParams.mockResolvedValue(BASE_PARAMS);
		mocks.createAgentSessionRuntime.mockReturnValue({ runtime: true });
		mocks.createAgentSessionServices.mockResolvedValue({
			diagnostics: {},
			resourceLoader: {
				getExtensions: () => ({ extensions: [], errors: [], runtime: {} }),
			},
		});
		mocks.createAgentSessionFromServices.mockResolvedValue({
			session: { sessionId: "session-1" },
		});
		mocks.continueRecent.mockReturnValue({ kind: "continue" });
		mocks.inMemory.mockReturnValue({ kind: "memory" });
		mocks.open.mockReturnValue({ kind: "open" });
		mocks.create.mockReturnValue({ kind: "create" });
		mocks.forkFrom.mockReturnValue({ kind: "fork" });
		mocks.list.mockResolvedValue([]);
		mocks.listAll.mockResolvedValue([]);
	});

	test("--continue uses SessionManager.continueRecent", async () => {
		await createSession({
			definition: TEST_DEF,
			cwd: "/tmp/project",
			domainsDir: "/tmp/domains",
			persistent: false,
			piFlags: { continue: true },
		});

		expect(mocks.continueRecent).toHaveBeenCalled();
	});

	test("--no-session uses SessionManager.inMemory", async () => {
		await createSession({
			definition: TEST_DEF,
			cwd: "/tmp/project",
			domainsDir: "/tmp/domains",
			persistent: true,
			piFlags: { noSession: true },
		});

		expect(mocks.inMemory).toHaveBeenCalled();
		expect(mocks.continueRecent).not.toHaveBeenCalled();
	});

	test("--session with file path uses SessionManager.open", async () => {
		await createSession({
			definition: TEST_DEF,
			cwd: "/tmp/project",
			domainsDir: "/tmp/domains",
			persistent: false,
			piFlags: { session: "/tmp/session.jsonl" },
		});

		expect(mocks.open).toHaveBeenCalledWith(
			"/tmp/session.jsonl",
			TEST_SESSION_DIR,
		);
	});

	test("--session with unknown partial UUID throws", async () => {
		mocks.list.mockResolvedValue([]);
		mocks.listAll.mockResolvedValue([]);

		await expect(
			createSession({
				definition: TEST_DEF,
				cwd: "/tmp/project",
				domainsDir: "/tmp/domains",
				persistent: false,
				piFlags: { session: "abc123" },
			}),
		).rejects.toThrow("No session found matching 'abc123'");
	});

	test("--session with local partial UUID resolves to open", async () => {
		mocks.list.mockResolvedValue([
			{
				id: "abc123-full-id",
				path: "/tmp/sessions/abc.jsonl",
				firstMessage: "hello",
			},
		]);

		await createSession({
			definition: TEST_DEF,
			cwd: "/tmp/project",
			domainsDir: "/tmp/domains",
			persistent: false,
			piFlags: { session: "abc" },
		});

		expect(mocks.open).toHaveBeenCalledWith(
			"/tmp/sessions/abc.jsonl",
			TEST_SESSION_DIR,
		);
	});

	test("--fork with file path uses SessionManager.forkFrom", async () => {
		await createSession({
			definition: TEST_DEF,
			cwd: "/tmp/project",
			domainsDir: "/tmp/domains",
			persistent: false,
			piFlags: { fork: "/tmp/session.jsonl" },
		});

		expect(mocks.forkFrom).toHaveBeenCalledWith(
			"/tmp/session.jsonl",
			"/tmp/project",
			TEST_SESSION_DIR,
		);
	});

	test("--fork with unknown partial UUID throws", async () => {
		await expect(
			createSession({
				definition: TEST_DEF,
				cwd: "/tmp/project",
				domainsDir: "/tmp/domains",
				persistent: false,
				piFlags: { fork: "xyz999" },
			}),
		).rejects.toThrow("No session found matching 'xyz999'");
	});

	test("--fork combined with --session throws conflict error", async () => {
		await expect(
			createSession({
				definition: TEST_DEF,
				cwd: "/tmp/project",
				domainsDir: "/tmp/domains",
				persistent: false,
				piFlags: { fork: "/tmp/a.jsonl", session: "/tmp/b.jsonl" },
			}),
		).rejects.toThrow("--fork cannot be combined with --session");
	});

	test("--fork combined with --continue throws conflict error", async () => {
		await expect(
			createSession({
				definition: TEST_DEF,
				cwd: "/tmp/project",
				domainsDir: "/tmp/domains",
				persistent: false,
				piFlags: { fork: "/tmp/a.jsonl", continue: true },
			}),
		).rejects.toThrow("--fork cannot be combined with --continue");
	});

	test("--fork combined with --no-session throws conflict error", async () => {
		await expect(
			createSession({
				definition: TEST_DEF,
				cwd: "/tmp/project",
				domainsDir: "/tmp/domains",
				persistent: false,
				piFlags: { fork: "/tmp/a.jsonl", noSession: true },
			}),
		).rejects.toThrow("--fork cannot be combined with --no-session");
	});

	test("--resume with no sessions throws GracefulExitError", async () => {
		mocks.list.mockResolvedValue([]);
		mocks.listAll.mockResolvedValue([]);

		await expect(
			createSession({
				definition: TEST_DEF,
				cwd: "/tmp/project",
				domainsDir: "/tmp/domains",
				persistent: false,
				piFlags: { resume: true },
			}),
		).rejects.toThrow(GracefulExitError);
	});

	test("--session with cross-project match and declined fork throws GracefulExitError", async () => {
		mocks.list.mockResolvedValue([]);
		mocks.listAll.mockResolvedValue([
			{
				id: "cross123-full",
				path: "/other/project/session.jsonl",
				cwd: "/other/project",
				firstMessage: "other",
			},
		]);

		// Mock readline to answer "n" to fork prompt
		mocks.readlineQuestion.mockImplementation(
			(_prompt: string, cb: (answer: string) => void) => cb("n"),
		);

		await expect(
			createSession({
				definition: TEST_DEF,
				cwd: "/tmp/project",
				domainsDir: "/tmp/domains",
				persistent: false,
				piFlags: { session: "cross" },
			}),
		).rejects.toThrow(GracefulExitError);
	});

	test("bundled themes directory is auto-injected into additionalThemePaths", async () => {
		mocks.createAgentSessionRuntime.mockImplementation(
			(
				createRuntime: (args: {
					cwd: string;
					sessionManager: unknown;
					sessionStartEvent?: unknown;
				}) => Promise<unknown>,
				runtimeOptions: { cwd: string; sessionManager: unknown },
			) =>
				createRuntime({
					cwd: runtimeOptions.cwd,
					sessionManager: runtimeOptions.sessionManager,
					sessionStartEvent: undefined,
				}),
		);

		await createSession({
			definition: TEST_DEF,
			cwd: "/tmp/project",
			domainsDir: "/tmp/domains",
			persistent: false,
		});

		const call = mocks.createAgentSessionServices.mock.calls[0]?.[0];
		const paths: string[] | undefined =
			call?.resourceLoaderOptions?.additionalThemePaths;
		expect(paths?.some((p: string) => p.endsWith("/themes"))).toBe(true);
	});

	test("--theme resolves relative paths against invocation cwd", async () => {
		mocks.createAgentSessionRuntime.mockImplementation(
			(
				createRuntime: (args: {
					cwd: string;
					sessionManager: unknown;
					sessionStartEvent?: unknown;
				}) => Promise<unknown>,
				runtimeOptions: { cwd: string; sessionManager: unknown },
			) =>
				createRuntime({
					cwd: runtimeOptions.cwd,
					sessionManager: runtimeOptions.sessionManager,
					sessionStartEvent: undefined,
				}),
		);

		await createSession({
			definition: TEST_DEF,
			cwd: "/tmp/project",
			domainsDir: "/tmp/domains",
			persistent: false,
			piFlags: { themes: ["./custom.json"] },
		});

		const call = mocks.createAgentSessionServices.mock.calls[0]?.[0];
		const paths: string[] =
			call?.resourceLoaderOptions?.additionalThemePaths ?? [];
		expect(paths).toContain("/tmp/project/custom.json");
	});

	test("--no-themes preserves explicit --theme paths but drops the bundled dir", async () => {
		mocks.createAgentSessionRuntime.mockImplementation(
			(
				createRuntime: (args: {
					cwd: string;
					sessionManager: unknown;
					sessionStartEvent?: unknown;
				}) => Promise<unknown>,
				runtimeOptions: { cwd: string; sessionManager: unknown },
			) =>
				createRuntime({
					cwd: runtimeOptions.cwd,
					sessionManager: runtimeOptions.sessionManager,
					sessionStartEvent: undefined,
				}),
		);

		await createSession({
			definition: TEST_DEF,
			cwd: "/tmp/project",
			domainsDir: "/tmp/domains",
			persistent: false,
			piFlags: { noThemes: true, themes: ["./custom.json"] },
		});

		const call = mocks.createAgentSessionServices.mock.calls[0]?.[0];
		const opts = call?.resourceLoaderOptions;
		expect(opts?.noThemes).toBe(true);
		expect(opts?.additionalThemePaths).toEqual(["/tmp/project/custom.json"]);
	});

	test("--resume cancel throws GracefulExitError", async () => {
		mocks.list.mockResolvedValue([
			{ id: "sess-1", path: "/tmp/s1.jsonl", firstMessage: "hello" },
		]);
		mocks.listAll.mockResolvedValue([
			{ id: "sess-1", path: "/tmp/s1.jsonl", firstMessage: "hello" },
		]);

		// Mock readline to enter blank (cancel)
		mocks.readlineQuestion.mockImplementation(
			(_prompt: string, cb: (answer: string) => void) => cb(""),
		);

		await expect(
			createSession({
				definition: TEST_DEF,
				cwd: "/tmp/project",
				domainsDir: "/tmp/domains",
				persistent: false,
				piFlags: { resume: true },
			}),
		).rejects.toThrow(GracefulExitError);
	});
});
