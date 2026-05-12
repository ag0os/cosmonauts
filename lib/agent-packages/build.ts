import { qualifyRole } from "../agents/qualified-role.ts";
import type { AgentRegistry } from "../agents/resolver.ts";
import type { AgentDefinition } from "../agents/types.ts";
import { assemblePrompts } from "../domains/prompt-assembly.ts";
import type { DomainResolver } from "../domains/resolver.ts";
import { assertRawSourcePromptExportable } from "./compatibility.ts";
import { readPackagePrompt } from "./definition.ts";
import { resolvePackageSkills } from "./skills.ts";
import type {
	AgentPackage,
	AgentPackageDefinition,
	PackagedSkill,
	SupportedExportTarget,
} from "./types.ts";

export interface BuildAgentPackageOptions {
	readonly definition: AgentPackageDefinition;
	readonly target: SupportedExportTarget;
	readonly agentRegistry: AgentRegistry;
	readonly domainContext?: string;
	readonly domainsDir?: string;
	readonly resolver?: DomainResolver;
	readonly projectSkills?: readonly string[];
	readonly skillPaths: readonly string[];
}

export async function buildAgentPackage(
	options: BuildAgentPackageOptions,
): Promise<AgentPackage> {
	const { definition, target } = options;
	const sourceAgent = resolveSourceAgent(options);
	const sourceAgentId = sourceAgent
		? qualifyRole(sourceAgent.id, sourceAgent.domain)
		: undefined;
	const baseSystemPrompt = await resolveSystemPrompt(options, sourceAgent);
	const skills = await resolvePackageSkills({
		selection: definition.skills,
		skillPaths: options.skillPaths,
		sourceAgent,
		projectSkills: options.projectSkills,
		domainsDir: options.domainsDir,
		resolver: options.resolver,
	});
	const systemPrompt = appendPackageIdentity(
		appendPackagedSkills(baseSystemPrompt, skills),
		definition.id,
		sourceAgentId,
	);

	return {
		schemaVersion: 1,
		packageId: definition.id,
		description: definition.description,
		...(sourceAgentId ? { sourceAgentId } : {}),
		systemPrompt,
		tools: definition.tools.preset,
		skills,
		...(sourceAgent ? { model: sourceAgent.model } : {}),
		...(sourceAgent?.thinkingLevel
			? { thinkingLevel: sourceAgent.thinkingLevel }
			: {}),
		projectContext: "omit",
		target,
		targetOptions: definition.targets[target] ?? {},
	};
}

function resolveSourceAgent(
	options: BuildAgentPackageOptions,
): AgentDefinition | undefined {
	const sourceAgentId = options.definition.sourceAgent;
	if (!sourceAgentId) return undefined;

	try {
		return options.agentRegistry.resolve(sourceAgentId, options.domainContext);
	} catch (error: unknown) {
		throw new Error(
			`Unable to resolve source agent "${sourceAgentId}" required by ${sourceAgentRequirement(
				options.definition,
			)}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

function sourceAgentRequirement(definition: AgentPackageDefinition): string {
	if (definition.prompt.kind === "source-agent") {
		return 'prompt.kind "source-agent"';
	}
	if (definition.skills.mode === "source-agent") {
		return 'skills.mode "source-agent"';
	}
	return "sourceAgent metadata";
}

async function resolveSystemPrompt(
	options: BuildAgentPackageOptions,
	sourceAgent: AgentDefinition | undefined,
): Promise<string> {
	const { definition } = options;
	if (definition.prompt.kind !== "source-agent") {
		return readPackagePrompt(definition.prompt);
	}

	if (!sourceAgent) {
		throw new Error(
			`Unable to resolve source agent "${definition.sourceAgent}" required by prompt.kind "source-agent"`,
		);
	}

	assertRawSourcePromptExportable({ definition, sourceAgent });
	return assemblePrompts({
		agentId: sourceAgent.id,
		domain: sourceAgent.domain ?? options.domainContext ?? "coding",
		capabilities: sourceAgent.capabilities,
		domainsDir: options.domainsDir,
		resolver: options.resolver,
	});
}

function appendPackagedSkills(
	systemPrompt: string,
	skills: readonly PackagedSkill[],
): string {
	if (skills.length === 0) return systemPrompt;
	return [systemPrompt, renderPackagedSkills(skills)].join("\n\n");
}

function renderPackagedSkills(skills: readonly PackagedSkill[]): string {
	return [
		"# Packaged Skills",
		...skills.map((skill) => `## ${skill.name}\n\n${skill.content}`),
	].join("\n\n");
}

function appendPackageIdentity(
	systemPrompt: string,
	packageId: string,
	sourceAgentId: string | undefined,
): string {
	return [systemPrompt, renderPackageIdentity(packageId, sourceAgentId)].join(
		"\n\n",
	);
}

function renderPackageIdentity(
	packageId: string,
	sourceAgentId: string | undefined,
): string {
	const lines = ["# Package Runtime Identity", `Package ID: ${packageId}`];
	if (sourceAgentId) lines.push(`Source Agent ID: ${sourceAgentId}`);
	return lines.join("\n");
}
