import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAgentPackage } from "../../lib/agent-packages/build.ts";
import type { AgentPackageDefinition } from "../../lib/agent-packages/types.ts";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("agent-package-build-");

function makeAgent(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
	return {
		id: "explorer",
		domain: "alpha",
		description: "Explore a codebase.",
		capabilities: ["core"],
		model: "anthropic/claude-sonnet-4-5",
		tools: "readonly",
		extensions: [],
		skills: [],
		projectContext: true,
		session: "ephemeral",
		loop: false,
		...overrides,
	};
}

function makeDefinition(
	overrides: Partial<AgentPackageDefinition> = {},
): AgentPackageDefinition {
	return {
		schemaVersion: 1,
		id: "sample-agent-claude",
		description: "Sample packaged agent.",
		prompt: { kind: "inline", content: "You are packaged." },
		tools: { preset: "readonly" },
		skills: { mode: "none" },
		projectContext: "omit",
		targets: { "claude-cli": { promptMode: "append" } },
		...overrides,
	};
}

async function writeDomainPromptFiles(
	domain: string,
	persona: string,
): Promise<void> {
	await mkdir(join(tmp.path, "framework-prompts"), {
		recursive: true,
	});
	await mkdir(join(tmp.path, "domains", domain, "capabilities"), {
		recursive: true,
	});
	await mkdir(join(tmp.path, "domains", domain, "prompts"), {
		recursive: true,
	});
	await writeFile(
		join(tmp.path, "framework-prompts", "base.md"),
		"---\ntitle: Base\n---\n\nShared base prompt.",
	);
	await writeFile(
		join(tmp.path, "domains", domain, "capabilities", "core.md"),
		`${domain} core capability.`,
	);
	await writeFile(
		join(tmp.path, "domains", domain, "prompts", "explorer.md"),
		persona,
	);
}

async function writeFlatSkill(name: string, body: string): Promise<void> {
	await mkdir(join(tmp.path, "skills"), { recursive: true });
	await writeFile(
		join(tmp.path, "skills", `${name}.md`),
		`---\nname: ${name}\ndescription: ${name} skill\n---\n\n${body}`,
	);
}

async function writeDirectorySkill(name: string, body: string): Promise<void> {
	await mkdir(join(tmp.path, "skills", name), { recursive: true });
	await writeFile(
		join(tmp.path, "skills", name, "SKILL.md"),
		`---\nname: ${name}\ndescription: ${name} skill\n---\n\n${body}`,
	);
}

describe("buildAgentPackage", () => {
	it("uses inline prompts as-is and appends package identity", async () => {
		const content = "---\ninline marker\n---\n\nUse exactly this prompt.";
		const agentPackage = await buildAgentPackage({
			definition: makeDefinition({
				prompt: { kind: "inline", content },
			}),
			agentRegistry: new AgentRegistry([]),
			skillPaths: [],
			target: "claude-cli",
		});

		expect(agentPackage).toMatchObject({
			schemaVersion: 1,
			packageId: "sample-agent-claude",
			description: "Sample packaged agent.",
			tools: "readonly",
			skills: [],
			projectContext: "omit",
			target: "claude-cli",
			targetOptions: { promptMode: "append" },
		});
		expect(agentPackage.systemPrompt).toContain(content);
		expect(agentPackage.systemPrompt).not.toContain("# Packaged Skills");
		expect(agentPackage.systemPrompt).toContain(
			"Package ID: sample-agent-claude",
		);
	});

	it("reads file prompts from absolute paths and strips frontmatter", async () => {
		const promptPath = join(tmp.path, "system.md");
		await writeFile(
			promptPath,
			"---\ntitle: Packaged Prompt\n---\n\n# File Prompt\n\nUse file content.",
		);

		const agentPackage = await buildAgentPackage({
			definition: makeDefinition({
				prompt: { kind: "file", path: promptPath },
			}),
			agentRegistry: new AgentRegistry([]),
			skillPaths: [],
			target: "claude-cli",
		});

		expect(agentPackage.systemPrompt).toContain(
			"# File Prompt\n\nUse file content.",
		);
		expect(agentPackage.systemPrompt).not.toContain("title: Packaged Prompt");
	});

	it("assembles source-agent prompts using the domain context and carries source metadata", async () => {
		await writeDomainPromptFiles("beta", "Beta explorer persona.");
		const alphaAgent = makeAgent({ domain: "alpha", model: "anthropic/alpha" });
		const betaAgent = makeAgent({
			domain: "beta",
			model: "anthropic/beta",
			thinkingLevel: "high",
		});

		const agentPackage = await buildAgentPackage({
			definition: makeDefinition({
				sourceAgent: "explorer",
				prompt: { kind: "source-agent" },
			}),
			agentRegistry: new AgentRegistry([alphaAgent, betaAgent]),
			domainContext: "beta",
			domainsDir: join(tmp.path, "domains"),
			frameworkPromptsDir: join(tmp.path, "framework-prompts"),
			skillPaths: [],
			target: "claude-cli",
		});

		expect(agentPackage.sourceAgentId).toBe("beta/explorer");
		expect(agentPackage.model).toBe("anthropic/beta");
		expect(agentPackage.thinkingLevel).toBe("high");
		expect(agentPackage.systemPrompt).toContain("Shared base prompt.");
		expect(agentPackage.systemPrompt).toContain("beta core capability.");
		expect(agentPackage.systemPrompt).toContain("Beta explorer persona.");
		expect(agentPackage.systemPrompt).toContain(
			"Source Agent ID: beta/explorer",
		);
	});

	it("uses main as the final source-agent prompt fallback while preserving source identity", async () => {
		// @cosmo-behavior plan:coding-agnostic-framework#B-007
		await writeDomainPromptFiles("main", "Main explorer persona.");
		const sourceAgent = makeAgent({
			domain: undefined,
			model: "anthropic/domainless",
		});

		const agentPackage = await buildAgentPackage({
			definition: makeDefinition({
				sourceAgent: "explorer",
				prompt: { kind: "source-agent" },
			}),
			agentRegistry: new AgentRegistry([sourceAgent]),
			domainsDir: join(tmp.path, "domains"),
			frameworkPromptsDir: join(tmp.path, "framework-prompts"),
			skillPaths: [],
			target: "claude-cli",
		});

		expect(agentPackage.sourceAgentId).toBe("explorer");
		expect(agentPackage.model).toBe("anthropic/domainless");
		expect(agentPackage.systemPrompt).toContain("main core capability.");
		expect(agentPackage.systemPrompt).toContain("Main explorer persona.");
		expect(agentPackage.systemPrompt).toContain(
			"Package ID: sample-agent-claude",
		);
		expect(agentPackage.systemPrompt).toContain("Source Agent ID: explorer");
		expect(agentPackage.systemPrompt).not.toContain("coding core capability.");
	});

	it("embeds allowlisted full skill markdown under a packaged skills heading", async () => {
		await writeFlatSkill("flat", "# Flat Skill\n\nFull flat body.");
		await writeDirectorySkill(
			"directory",
			"# Directory Skill\n\nFull directory body.",
		);

		const agentPackage = await buildAgentPackage({
			definition: makeDefinition({
				skills: { mode: "allowlist", names: ["flat", "directory"] },
			}),
			agentRegistry: new AgentRegistry([]),
			skillPaths: [join(tmp.path, "skills")],
			target: "claude-cli",
		});

		expect(agentPackage.skills.map((skill) => skill.name)).toEqual([
			"flat",
			"directory",
		]);
		expect(agentPackage.systemPrompt).toContain("# Packaged Skills");
		expect(agentPackage.systemPrompt).toContain("## flat");
		expect(agentPackage.systemPrompt).toContain(
			"# Flat Skill\n\nFull flat body.",
		);
		expect(agentPackage.systemPrompt).toContain("## directory");
		expect(agentPackage.systemPrompt).toContain(
			"# Directory Skill\n\nFull directory body.",
		);
		expect(agentPackage.systemPrompt).not.toContain("description: flat skill");
	});

	it("embeds skills selected by source-agent skill mode", async () => {
		await writeFlatSkill("tdd", "# TDD\n\nPractice red-green-refactor.");
		const sourceAgent = makeAgent({ skills: ["tdd"] });

		const agentPackage = await buildAgentPackage({
			definition: makeDefinition({
				sourceAgent: "alpha/explorer",
				skills: { mode: "source-agent" },
			}),
			agentRegistry: new AgentRegistry([sourceAgent]),
			skillPaths: [join(tmp.path, "skills")],
			target: "claude-cli",
		});

		expect(agentPackage.skills.map((skill) => skill.name)).toEqual(["tdd"]);
		expect(agentPackage.systemPrompt).toContain("# Packaged Skills");
		expect(agentPackage.systemPrompt).toContain("Practice red-green-refactor.");
	});

	it("fails clearly when the selected target was not declared", async () => {
		await expect(
			buildAgentPackage({
				definition: makeDefinition({ targets: { "claude-cli": {} } }),
				agentRegistry: new AgentRegistry([]),
				skillPaths: [],
				target: "codex",
			}),
		).rejects.toThrow(/does not declare target.*codex/i);
	});

	it("fails clearly when source-agent prompt mode cannot resolve the source agent", async () => {
		await expect(
			buildAgentPackage({
				definition: makeDefinition({
					sourceAgent: "alpha/missing",
					prompt: { kind: "source-agent" },
				}),
				agentRegistry: new AgentRegistry([]),
				skillPaths: [],
				target: "claude-cli",
			}),
		).rejects.toThrow(
			/source agent.*alpha\/missing.*prompt\.kind "source-agent"/i,
		);
	});

	it("fails clearly when source-agent skill mode cannot resolve the source agent", async () => {
		await expect(
			buildAgentPackage({
				definition: makeDefinition({
					sourceAgent: "alpha/missing",
					skills: { mode: "source-agent" },
				}),
				agentRegistry: new AgentRegistry([]),
				skillPaths: [],
				target: "claude-cli",
			}),
		).rejects.toThrow(
			/source agent.*alpha\/missing.*skills\.mode "source-agent"/i,
		);
	});

	it("rejects raw source-agent prompts for nonportable source agents", async () => {
		const sourceAgent = makeAgent({
			extensions: ["orchestration"],
			capabilities: ["core", "spawning"],
			subagents: ["worker"],
		});

		await expect(
			buildAgentPackage({
				definition: makeDefinition({
					sourceAgent: "alpha/explorer",
					prompt: { kind: "source-agent" },
				}),
				agentRegistry: new AgentRegistry([sourceAgent]),
				domainsDir: join(tmp.path, "domains"),
				skillPaths: [],
				target: "claude-cli",
			}),
		).rejects.toThrow(
			/raw source-agent prompt export is not supported.*extensions.*subagents.*extension-backed capabilities/is,
		);
	});
});
