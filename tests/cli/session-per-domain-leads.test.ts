import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import type { DomainResolver } from "../../lib/domains/resolver.ts";

const mocks = vi.hoisted(() => ({
	buildSessionParams: vi.fn(),
	createAgentSessionFromServices: vi.fn(),
	createAgentSessionRuntime: vi.fn(),
	createAgentSessionServices: vi.fn(),
	continueRecent: vi.fn(),
	inMemory: vi.fn(),
	open: vi.fn(),
	forkFrom: vi.fn(),
	list: vi.fn(),
	listAll: vi.fn(),
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
		forkFrom: mocks.forkFrom,
		list: mocks.list,
		listAll: mocks.listAll,
	},
}));

import { createSession } from "../../cli/session.ts";

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

const MAIN_LEAD_REF = "main/cosmo";
const MAIN_LEAD_ID = MAIN_LEAD_REF.slice("main/".length);

const resolver = {
	registry: {
		get: (domain: string) => {
			const leadByDomain: Record<string, string> = {
				main: MAIN_LEAD_ID,
				coding: "cody",
			};
			const lead = leadByDomain[domain];
			return lead
				? { manifest: { id: domain, description: domain, lead } }
				: undefined;
		},
	},
} as unknown as DomainResolver;

function makeAgent(id: string, domain: string): AgentDefinition {
	return {
		id,
		description: `${domain}/${id}`,
		capabilities: [],
		model: "test/model",
		tools: "none",
		extensions: [],
		skills: ["*"],
		projectContext: false,
		session: "persistent",
		loop: false,
		domain,
	};
}

async function sessionDirFor(
	definition: AgentDefinition,
): Promise<string | undefined> {
	await createSession({
		definition,
		cwd: "/tmp/project",
		domainsDir: "/tmp/domains",
		resolver,
		persistent: true,
	});

	const calls = mocks.continueRecent.mock.calls;
	return calls[calls.length - 1]?.[1];
}

describe("session per-domain-leads", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.buildSessionParams.mockResolvedValue(BASE_PARAMS);
		mocks.createAgentSessionRuntime.mockReturnValue({ runtime: true });
		mocks.continueRecent.mockReturnValue({ kind: "continue" });
	});

	test("uses domain directories for leads and agent directories for non-leads", async () => {
		const mainLeadDir = await sessionDirFor(makeAgent(MAIN_LEAD_ID, "main"));
		const codingLeadDir = await sessionDirFor(makeAgent("cody", "coding"));
		const plannerDir = await sessionDirFor(makeAgent("planner", "coding"));
		const workerDir = await sessionDirFor(makeAgent("worker", "coding"));

		expect(mainLeadDir).toBe("/tmp/pi-agent/sessions/--tmp-project--/main");
		expect(codingLeadDir).toBe("/tmp/pi-agent/sessions/--tmp-project--/coding");
		expect(plannerDir).toBe("/tmp/pi-agent/sessions/--tmp-project--/planner");
		expect(workerDir).toBe("/tmp/pi-agent/sessions/--tmp-project--/worker");
		expect(mainLeadDir).not.toBe(codingLeadDir);
	});
});
