import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	definitionFromAgent,
	loadAgentPackageDefinition,
	readPackagePrompt,
} from "../../lib/agent-packages/definition.ts";
import type {
	AgentPackage,
	AgentPackageDefinition,
	InvocationSpec,
	InvocationWarning,
	MaterializedInvocation,
	PackagedSkill,
	PackagePromptSource,
	PackageSkillSelection,
	PackageToolPolicy,
	TargetPackageOptions,
} from "../../lib/agent-packages/types.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("agent-package-definition-");

type DefinitionInput = Omit<AgentPackageDefinition, "prompt" | "targets"> & {
	readonly prompt: PackagePromptSource;
	readonly targets: Record<string, TargetPackageOptions>;
};

const baseDefinition = {
	schemaVersion: 1,
	id: "sample-agent-claude",
	description: "Sample packaged agent.",
	prompt: { kind: "inline", content: "You are packaged." },
	tools: { preset: "readonly" },
	skills: { mode: "none" },
	projectContext: "omit",
	targets: { "claude-cli": {} },
} satisfies DefinitionInput;

async function writeDefinition(
	name: string,
	definition: unknown,
): Promise<string> {
	const filePath = join(tmp.path, name);
	await mkdir(join(filePath, ".."), { recursive: true });
	await writeFile(filePath, JSON.stringify(definition, null, 2));
	return filePath;
}

const sourceAgent = {
	id: "explorer",
	domain: "coding",
	description: "Explore a codebase.",
	capabilities: ["core", "coding-readonly"],
	model: "anthropic/claude-sonnet-4-5",
	tools: "readonly",
	extensions: [],
	skills: ["engineering-principles"],
	projectContext: true,
	session: "ephemeral",
	loop: false,
} satisfies AgentDefinition;

describe("agent package type contracts", () => {
	it("exports the stable package contract names", () => {
		const definition: AgentPackageDefinition = baseDefinition;
		const toolPolicy: PackageToolPolicy = { preset: "readonly" };
		const prompt: PackagePromptSource = { kind: "inline", content: "prompt" };
		const skills: PackageSkillSelection = { mode: "none" };
		const target: TargetPackageOptions = { promptMode: "append" };
		const packagedSkill: PackagedSkill = {
			name: "tdd",
			description: "Test-first discipline.",
			content: "# TDD",
			sourcePath: "/skills/tdd/SKILL.md",
		};
		const agentPackage: AgentPackage = {
			schemaVersion: 1,
			packageId: definition.id,
			description: definition.description,
			systemPrompt: "prompt",
			tools: toolPolicy.preset,
			skills: [packagedSkill],
			projectContext: "omit",
			target: "codex",
			targetOptions: target,
		};
		const warning: InvocationWarning = {
			code: "anthropic_api_key_removed",
			message: "removed",
		};
		const spec: InvocationSpec = {
			command: "claude",
			args: [],
			env: {},
			cwd: tmp.path,
			stdin: "hello",
			warnings: [warning],
		};
		const materialized: MaterializedInvocation = {
			spec,
			tempDir: tmp.path,
			cleanup: async () => {},
		};

		expect(agentPackage.packageId).toBe("sample-agent-claude");
		expect(materialized.spec.warnings).toEqual([warning]);
		expect(prompt.kind).toBe("inline");
		expect(skills.mode).toBe("none");
	});

	it("keeps types.ts independent from CLI, Drive, and chain modules", async () => {
		const source = await readFile("lib/agent-packages/types.ts", "utf-8");
		expect(source).not.toMatch(/\.\.\/\.\.\/cli|\.\.\/cli|driver|chain/i);
	});
});

describe("loadAgentPackageDefinition", () => {
	it.each([
		"schemaVersion",
		"id",
		"description",
		"prompt",
		"tools",
		"skills",
		"projectContext",
		"targets",
	])("rejects a missing required %s field with a clear error", async (field) => {
		const definition: Record<string, unknown> = { ...baseDefinition };
		delete definition[field];
		const filePath = await writeDefinition(`missing-${field}.json`, definition);

		await expect(loadAgentPackageDefinition(filePath)).rejects.toThrow(
			new RegExp(`missing required field "${field}"`),
		);
	});

	it("resolves file prompt paths relative to the definition and strips frontmatter when read", async () => {
		await mkdir(join(tmp.path, "package", "prompts"), { recursive: true });
		await writeFile(
			join(tmp.path, "package", "prompts", "system.md"),
			"---\ntitle: System Prompt\n---\n\n# System\n\nUse the repository carefully.",
		);
		const filePath = await writeDefinition("package/package.json", {
			...baseDefinition,
			prompt: { kind: "file", path: "prompts/system.md" },
		});

		const definition = await loadAgentPackageDefinition(filePath);

		expect(definition.prompt).toEqual({
			kind: "file",
			path: join(tmp.path, "package", "prompts", "system.md"),
		});
		expect(
			definition.prompt.kind === "file" && isAbsolute(definition.prompt.path),
		).toBe(true);
		await expect(readPackagePrompt(definition.prompt)).resolves.toBe(
			"# System\n\nUse the repository carefully.",
		);
	});

	it("rejects absolute file prompt paths", async () => {
		const filePath = await writeDefinition("absolute-path.json", {
			...baseDefinition,
			prompt: { kind: "file", path: join(tmp.path, "secret.md") },
		});

		await expect(loadAgentPackageDefinition(filePath)).rejects.toThrow(
			/prompt\.path must be relative to the package definition directory/,
		);
	});

	it("rejects file prompt paths that escape the definition directory", async () => {
		const filePath = await writeDefinition("package/escape.json", {
			...baseDefinition,
			prompt: { kind: "file", path: "../escape.md" },
		});

		await expect(loadAgentPackageDefinition(filePath)).rejects.toThrow(
			/prompt\.path must stay within the package definition directory/,
		);
	});

	it("reads inline prompts without changing their content", async () => {
		const content =
			"---\nnot frontmatter for inline prompts\n---\n\nUse exactly this.";
		const filePath = await writeDefinition("inline.json", {
			...baseDefinition,
			prompt: { kind: "inline", content },
		});

		const definition = await loadAgentPackageDefinition(filePath);

		expect(definition.prompt).toEqual({ kind: "inline", content });
		expect(await readPackagePrompt(definition.prompt)).toBe(content);
	});

	it("rejects source-agent prompts without sourceAgent and names the prompt field", async () => {
		const filePath = await writeDefinition("source-prompt-without-agent.json", {
			...baseDefinition,
			prompt: { kind: "source-agent" },
		});

		await expect(loadAgentPackageDefinition(filePath)).rejects.toThrow(
			/prompt\.kind.*sourceAgent is required/,
		);
	});

	it("rejects source-agent skill selection without sourceAgent and names the skills field", async () => {
		const filePath = await writeDefinition("source-skills-without-agent.json", {
			...baseDefinition,
			skills: { mode: "source-agent" },
		});

		await expect(loadAgentPackageDefinition(filePath)).rejects.toThrow(
			/skills\.mode.*sourceAgent is required/,
		);
	});

	it("rejects projectContext values other than omit in Phase 1", async () => {
		const filePath = await writeDefinition("project-context.json", {
			...baseDefinition,
			projectContext: "include",
		});

		await expect(loadAgentPackageDefinition(filePath)).rejects.toThrow(
			/projectContext.*omit/,
		);
	});

	it.each([
		[
			"prompt kind",
			{ prompt: { kind: "remote", url: "https://example.test/prompt.md" } },
			/prompt\.kind/,
		],
		["tool preset", { tools: { preset: "networked" } }, /tools\.preset/],
		["skill mode", { skills: { mode: "automatic" } }, /skills\.mode/],
		[
			"allowlist names",
			{ skills: { mode: "allowlist", names: "tdd" } },
			/skills\.names/,
		],
		[
			"target prompt mode",
			{ targets: { "claude-cli": { promptMode: "prepend" } } },
			/targets\.claude-cli\.promptMode/,
		],
	] as const)("rejects invalid %s values", async (_label, override, error) => {
		const filePath = await writeDefinition("invalid-values.json", {
			...baseDefinition,
			...override,
		});

		await expect(loadAgentPackageDefinition(filePath)).rejects.toThrow(error);
	});

	it("accepts future target blocks while parsing Phase 1 definitions", async () => {
		const filePath = await writeDefinition("future-targets.json", {
			...baseDefinition,
			targets: {
				"claude-cli": { promptMode: "append" },
				codex: {},
				"gemini-cli": { skillDelivery: "inline" },
				"open-code": { allowedTools: ["read"] },
			},
		});

		await expect(loadAgentPackageDefinition(filePath)).resolves.toMatchObject({
			targets: {
				"claude-cli": { promptMode: "append" },
				codex: {},
				"gemini-cli": { skillDelivery: "inline" },
				"open-code": { allowedTools: ["read"] },
			},
		});
	});
});

describe("definitionFromAgent", () => {
	it("normalizes an agent id shorthand into a source-agent package definition", () => {
		const definition = definitionFromAgent(sourceAgent, "claude-cli");

		expect(definition).toEqual({
			schemaVersion: 1,
			id: "coding-explorer-claude-cli",
			description: sourceAgent.description,
			sourceAgent: "coding/explorer",
			prompt: { kind: "source-agent" },
			tools: { preset: "readonly" },
			skills: { mode: "source-agent" },
			projectContext: "omit",
			targets: { "claude-cli": {} },
		});
	});

	it("uses the selected supported export target in generated definition ids", () => {
		const definition = definitionFromAgent(sourceAgent, "codex");

		expect(definition).toMatchObject({
			id: "coding-explorer-codex",
			sourceAgent: "coding/explorer",
			targets: { codex: {} },
		});
	});
});
