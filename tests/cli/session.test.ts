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
}));

vi.mock("../../lib/agents/session-assembly.ts", () => ({
	buildSessionParams: mocks.buildSessionParams,
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
	createAgentSessionFromServices: mocks.createAgentSessionFromServices,
	createAgentSessionRuntime: mocks.createAgentSessionRuntime,
	createAgentSessionServices: mocks.createAgentSessionServices,
	getAgentDir: () => "/tmp/pi-agent",
	SessionManager: {
		continueRecent: mocks.continueRecent,
		inMemory: mocks.inMemory,
	},
}));

import { createSession } from "../../cli/session.ts";

const TEST_DEF: AgentDefinition = {
	id: "cosmo",
	description: "Test agent",
	capabilities: [],
	model: "test/model",
	tools: "none",
	extensions: [],
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
