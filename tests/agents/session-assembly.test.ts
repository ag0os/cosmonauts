/**
 * Unit tests for buildSessionParams().
 *
 * Verifies: prompt content assembly, tool resolution, extension path
 * resolution, skill override wiring, model/thinkingLevel resolution,
 * and extraExtensionPaths injection into SessionParams.extensionPaths.
 */

import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AgentDefinition } from "../../lib/agents/types.ts";

// ============================================================================
// Hoisted mocks
// ============================================================================

const mocks = vi.hoisted(() => ({
	assemblePrompts: vi.fn(),
	resolveExtensionPaths: vi.fn(),
	getModel: vi.fn(),
	createCodingTools: vi.fn(),
	createReadOnlyTools: vi.fn(),
	createReadTool: vi.fn(),
	createBashTool: vi.fn(),
	createGrepTool: vi.fn(),
	createFindTool: vi.fn(),
	createLsTool: vi.fn(),
}));

vi.mock("../../lib/domains/prompt-assembly.ts", () => ({
	assemblePrompts: mocks.assemblePrompts,
}));

vi.mock(
	"../../lib/orchestration/definition-resolution.ts",
	async (importOriginal) => {
		const actual =
			await importOriginal<
				typeof import("../../lib/orchestration/definition-resolution.ts")
			>();
		return {
			...actual,
			resolveExtensionPaths: mocks.resolveExtensionPaths,
		};
	},
);

vi.mock("@mariozechner/pi-ai", () => ({
	getModel: mocks.getModel,
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
	createCodingTools: mocks.createCodingTools,
	createReadOnlyTools: mocks.createReadOnlyTools,
	createReadTool: mocks.createReadTool,
	createBashTool: mocks.createBashTool,
	createGrepTool: mocks.createGrepTool,
	createFindTool: mocks.createFindTool,
	createLsTool: mocks.createLsTool,
}));

import { buildSessionParams } from "../../lib/agents/session-assembly.ts";

// ============================================================================
// Fixtures
// ============================================================================

const BASE_DEF: AgentDefinition = {
	id: "worker",
	description: "Test worker",
	capabilities: ["core", "coding-readwrite"],
	model: "anthropic/claude-sonnet-4-5",
	tools: "coding",
	extensions: ["tasks"],
	projectContext: true,
	session: "ephemeral",
	loop: false,
	domain: "coding",
};

const MOCK_MODEL = {
	id: "claude-sonnet-4-5",
	name: "claude-sonnet-4-5",
	provider: "anthropic",
};
const MOCK_CODING_TOOLS = [
	{ name: "bash" },
	{ name: "read" },
	{ name: "write" },
];
const MOCK_READONLY_TOOLS = [{ name: "read" }, { name: "grep" }];
const MOCK_EXT_PATH = "/domains/shared/extensions/tasks";

function defaultSetup() {
	mocks.assemblePrompts.mockResolvedValue("# Base system prompt\n");
	mocks.resolveExtensionPaths.mockReturnValue([MOCK_EXT_PATH]);
	mocks.getModel.mockReturnValue(MOCK_MODEL);
	mocks.createCodingTools.mockReturnValue(MOCK_CODING_TOOLS);
	mocks.createReadOnlyTools.mockReturnValue(MOCK_READONLY_TOOLS);
	mocks.createReadTool.mockReturnValue({ name: "read" });
	mocks.createBashTool.mockReturnValue({ name: "bash" });
	mocks.createGrepTool.mockReturnValue({ name: "grep" });
	mocks.createFindTool.mockReturnValue({ name: "find" });
	mocks.createLsTool.mockReturnValue({ name: "ls" });
}

// ============================================================================
// Tests
// ============================================================================

describe("buildSessionParams", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		defaultSetup();
	});

	describe("prompt content assembly", () => {
		test("includes assembled prompt text in promptContent", async () => {
			mocks.assemblePrompts.mockResolvedValue(
				"# Platform Base\n## Capabilities\n",
			);

			const params = await buildSessionParams({
				def: BASE_DEF,
				cwd: "/tmp/project",
				domainsDir: "/domains",
			});

			expect(params.promptContent).toContain("# Platform Base");
		});

		test("appends runtime identity marker to prompt", async () => {
			const params = await buildSessionParams({
				def: BASE_DEF,
				cwd: "/tmp/project",
				domainsDir: "/domains",
			});

			// Identity marker is: <!-- COSMONAUTS_AGENT_ID:coding/worker -->
			expect(params.promptContent).toContain("COSMONAUTS_AGENT_ID");
			expect(params.promptContent).toContain("worker");
		});

		test("identity marker uses qualified agent ID when domain is set", async () => {
			const params = await buildSessionParams({
				def: { ...BASE_DEF, domain: "coding" },
				cwd: "/tmp/project",
				domainsDir: "/domains",
			});

			expect(params.promptContent).toContain("coding/worker");
		});

		test("identity marker uses unqualified ID when no domain is set", async () => {
			const params = await buildSessionParams({
				def: { ...BASE_DEF, domain: undefined },
				cwd: "/tmp/project",
				domainsDir: "/domains",
			});

			expect(params.promptContent).toContain("COSMONAUTS_AGENT_ID:worker");
			expect(params.promptContent).not.toContain("coding/worker");
		});

		test("passes agentId, domain, and capabilities to assemblePrompts", async () => {
			await buildSessionParams({
				def: BASE_DEF,
				cwd: "/tmp/project",
				domainsDir: "/domains",
			});

			expect(mocks.assemblePrompts).toHaveBeenCalledWith(
				expect.objectContaining({
					agentId: "worker",
					domain: "coding",
					capabilities: ["core", "coding-readwrite"],
					domainsDir: "/domains",
				}),
			);
		});

		test("passes runtimeContext to assemblePrompts when provided", async () => {
			const runtimeContext = {
				mode: "sub-agent" as const,
				parentRole: "cosmo",
				objective: "Build auth",
				taskId: "TASK-123",
			};

			await buildSessionParams({
				def: BASE_DEF,
				cwd: "/tmp/project",
				domainsDir: "/domains",
				runtimeContext,
			});

			expect(mocks.assemblePrompts).toHaveBeenCalledWith(
				expect.objectContaining({ runtimeContext }),
			);
		});
	});

	describe("tool resolution", () => {
		test("resolves coding tools for tools:coding", async () => {
			const params = await buildSessionParams({
				def: { ...BASE_DEF, tools: "coding" },
				cwd: "/tmp/project",
				domainsDir: "/domains",
			});

			expect(mocks.createCodingTools).toHaveBeenCalledWith("/tmp/project");
			expect(params.tools).toBe(MOCK_CODING_TOOLS);
		});

		test("resolves readonly tools for tools:readonly", async () => {
			const params = await buildSessionParams({
				def: { ...BASE_DEF, tools: "readonly" },
				cwd: "/tmp/project",
				domainsDir: "/domains",
			});

			expect(mocks.createReadOnlyTools).toHaveBeenCalledWith("/tmp/project");
			expect(params.tools).toBe(MOCK_READONLY_TOOLS);
		});

		test("returns empty array for tools:none", async () => {
			const params = await buildSessionParams({
				def: { ...BASE_DEF, tools: "none" },
				cwd: "/tmp/project",
				domainsDir: "/domains",
			});

			expect(params.tools).toEqual([]);
		});

		test("passes cwd to tool factories", async () => {
			const cwd = "/home/user/my-project";
			await buildSessionParams({
				def: BASE_DEF,
				cwd,
				domainsDir: "/domains",
			});

			expect(mocks.createCodingTools).toHaveBeenCalledWith(cwd);
		});
	});

	describe("extension path resolution", () => {
		test("includes resolved extension paths in extensionPaths", async () => {
			mocks.resolveExtensionPaths.mockReturnValue([
				"/domains/shared/extensions/tasks",
				"/domains/shared/extensions/orchestration",
			]);

			const params = await buildSessionParams({
				def: { ...BASE_DEF, extensions: ["tasks", "orchestration"] },
				cwd: "/tmp/project",
				domainsDir: "/domains",
			});

			expect(params.extensionPaths).toContain(
				"/domains/shared/extensions/tasks",
			);
			expect(params.extensionPaths).toContain(
				"/domains/shared/extensions/orchestration",
			);
		});

		test("passes extensions and domain/domainsDir to resolveExtensionPaths", async () => {
			await buildSessionParams({
				def: BASE_DEF,
				cwd: "/tmp/project",
				domainsDir: "/domains",
			});

			expect(mocks.resolveExtensionPaths).toHaveBeenCalledWith(
				BASE_DEF.extensions,
				expect.objectContaining({
					domain: "coding",
					domainsDir: "/domains",
				}),
			);
		});

		test("returns empty extensionPaths when def has no extensions", async () => {
			mocks.resolveExtensionPaths.mockReturnValue([]);

			const params = await buildSessionParams({
				def: { ...BASE_DEF, extensions: [] },
				cwd: "/tmp/project",
				domainsDir: "/domains",
			});

			expect(params.extensionPaths).toEqual([]);
		});
	});

	describe("extraExtensionPaths injection", () => {
		test("appends extraExtensionPaths after resolved extension paths", async () => {
			const extraPath = "/absolute/path/to/agent-switch";
			mocks.resolveExtensionPaths.mockReturnValue([MOCK_EXT_PATH]);

			const params = await buildSessionParams({
				def: BASE_DEF,
				cwd: "/tmp/project",
				domainsDir: "/domains",
				extraExtensionPaths: [extraPath],
			});

			expect(params.extensionPaths).toEqual([MOCK_EXT_PATH, extraPath]);
		});

		test("extensionPaths equals resolved paths when no extraExtensionPaths", async () => {
			mocks.resolveExtensionPaths.mockReturnValue([MOCK_EXT_PATH]);

			const params = await buildSessionParams({
				def: BASE_DEF,
				cwd: "/tmp/project",
				domainsDir: "/domains",
			});

			expect(params.extensionPaths).toEqual([MOCK_EXT_PATH]);
		});

		test("multiple extraExtensionPaths all appended in order", async () => {
			mocks.resolveExtensionPaths.mockReturnValue([MOCK_EXT_PATH]);
			const extra1 = "/ext/agent-switch";
			const extra2 = "/ext/custom";

			const params = await buildSessionParams({
				def: BASE_DEF,
				cwd: "/tmp/project",
				domainsDir: "/domains",
				extraExtensionPaths: [extra1, extra2],
			});

			expect(params.extensionPaths).toEqual([MOCK_EXT_PATH, extra1, extra2]);
		});
	});

	describe("skill override wiring", () => {
		test("skillsOverride is undefined when no agent or project skills", async () => {
			const params = await buildSessionParams({
				def: { ...BASE_DEF, skills: undefined },
				cwd: "/tmp/project",
				domainsDir: "/domains",
			});

			expect(params.skillsOverride).toBeUndefined();
		});

		test("skillsOverride filters to agent skills when no project skills", async () => {
			const params = await buildSessionParams({
				def: { ...BASE_DEF, skills: ["typescript", "tdd"] },
				cwd: "/tmp/project",
				domainsDir: "/domains",
			});

			expect(params.skillsOverride).toBeDefined();
			const override = params.skillsOverride;
			if (!override) throw new Error("expected skillsOverride");
			const result = override({
				skills: [
					{ name: "typescript" } as never,
					{ name: "tdd" } as never,
					{ name: "playwright" } as never,
				],
				diagnostics: [],
			});
			expect(result.skills.map((s) => s.name)).toEqual(["typescript", "tdd"]);
		});

		test("skillsOverride filters to intersection of agent and project skills", async () => {
			const params = await buildSessionParams({
				def: { ...BASE_DEF, skills: ["typescript", "tdd", "playwright"] },
				cwd: "/tmp/project",
				domainsDir: "/domains",
				projectSkills: ["typescript", "tdd"],
			});

			expect(params.skillsOverride).toBeDefined();
			const override2 = params.skillsOverride;
			if (!override2) throw new Error("expected skillsOverride");
			const result = override2({
				skills: [
					{ name: "typescript" } as never,
					{ name: "tdd" } as never,
					{ name: "playwright" } as never,
				],
				diagnostics: [],
			});
			expect(result.skills.map((s) => s.name)).toEqual(["typescript", "tdd"]);
		});

		test("additionalSkillPaths is undefined when no skillPaths provided", async () => {
			const params = await buildSessionParams({
				def: BASE_DEF,
				cwd: "/tmp/project",
				domainsDir: "/domains",
			});

			expect(params.additionalSkillPaths).toBeUndefined();
		});

		test("additionalSkillPaths contains provided skillPaths", async () => {
			const params = await buildSessionParams({
				def: BASE_DEF,
				cwd: "/tmp/project",
				domainsDir: "/domains",
				skillPaths: ["/skills/shared", "/skills/project"],
			});

			expect(params.additionalSkillPaths).toEqual([
				"/skills/shared",
				"/skills/project",
			]);
		});
	});

	describe("model resolution", () => {
		test("uses modelOverride when provided", async () => {
			await buildSessionParams({
				def: BASE_DEF,
				cwd: "/tmp/project",
				domainsDir: "/domains",
				modelOverride: "anthropic/claude-opus-4-6",
			});

			expect(mocks.getModel).toHaveBeenCalledWith(
				"anthropic",
				"claude-opus-4-6",
			);
		});

		test("falls back to def.model when no override", async () => {
			await buildSessionParams({
				def: { ...BASE_DEF, model: "anthropic/claude-haiku-4-5" },
				cwd: "/tmp/project",
				domainsDir: "/domains",
			});

			expect(mocks.getModel).toHaveBeenCalledWith(
				"anthropic",
				"claude-haiku-4-5",
			);
		});

		test("returns model from getModel", async () => {
			const customModel = {
				id: "custom-model",
				name: "Custom",
				provider: "anthropic",
			};
			mocks.getModel.mockReturnValue(customModel);

			const params = await buildSessionParams({
				def: BASE_DEF,
				cwd: "/tmp/project",
				domainsDir: "/domains",
			});

			expect(params.model).toBe(customModel);
		});
	});

	describe("thinkingLevel resolution", () => {
		test("uses thinkingLevelOverride when provided", async () => {
			const params = await buildSessionParams({
				def: { ...BASE_DEF, thinkingLevel: undefined },
				cwd: "/tmp/project",
				domainsDir: "/domains",
				thinkingLevelOverride: "high",
			});

			expect(params.thinkingLevel).toBe("high");
		});

		test("falls back to def.thinkingLevel when no override", async () => {
			const params = await buildSessionParams({
				def: { ...BASE_DEF, thinkingLevel: "medium" },
				cwd: "/tmp/project",
				domainsDir: "/domains",
			});

			expect(params.thinkingLevel).toBe("medium");
		});

		test("thinkingLevel is undefined when neither override nor def value", async () => {
			const params = await buildSessionParams({
				def: { ...BASE_DEF, thinkingLevel: undefined },
				cwd: "/tmp/project",
				domainsDir: "/domains",
			});

			expect(params.thinkingLevel).toBeUndefined();
		});
	});

	describe("projectContext pass-through", () => {
		test("passes through projectContext from definition", async () => {
			const withContext = await buildSessionParams({
				def: { ...BASE_DEF, projectContext: true },
				cwd: "/tmp",
				domainsDir: "/domains",
			});
			expect(withContext.projectContext).toBe(true);

			const withoutContext = await buildSessionParams({
				def: { ...BASE_DEF, projectContext: false },
				cwd: "/tmp",
				domainsDir: "/domains",
			});
			expect(withoutContext.projectContext).toBe(false);
		});
	});
});
