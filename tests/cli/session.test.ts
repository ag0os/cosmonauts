import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import {
	clearPendingSwitch,
	consumePendingSwitch,
	setPendingSwitch,
} from "../../lib/interactive/agent-switch.ts";

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

vi.mock("@mariozechner/pi-coding-agent", () => ({
	AuthStorage: {
		create: () => ({ reload: vi.fn(), hasAuth: vi.fn(() => false) }),
	},
	createAgentSessionFromServices: mocks.createAgentSessionFromServices,
	createAgentSessionRuntime: mocks.createAgentSessionRuntime,
	createAgentSessionServices: mocks.createAgentSessionServices,
	getAgentDir: () => "/tmp/pi-agent",
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
	id: "cosmo",
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
	skillsOverride: undefined,
	additionalSkillPaths: undefined,
	projectContext: false,
	model: { id: "test/model" },
	thinkingLevel: undefined,
};

describe("createSession", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearPendingSwitch();
		mocks.buildSessionParams.mockResolvedValue(BASE_PARAMS);
		mocks.createAgentSessionRuntime.mockReturnValue({ runtime: true });
		mocks.createAgentSessionServices.mockResolvedValue({ diagnostics: {} });
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
		mocks.createAgentSessionServices.mockResolvedValue({ diagnostics: {} });
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

		expect(mocks.open).toHaveBeenCalledWith("/tmp/session.jsonl", undefined);
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
			undefined,
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
			undefined,
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
