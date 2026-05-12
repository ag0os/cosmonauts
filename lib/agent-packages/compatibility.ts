import { qualifyRole } from "../agents/qualified-role.ts";
import type { AgentDefinition } from "../agents/types.ts";
import type { AgentPackageDefinition } from "./types.ts";

const EXTENSION_BACKED_CAPABILITIES = new Set([
	"spawning",
	"tasks",
	"todo",
	"drive",
]);

export interface RawSourcePromptExportOptions {
	readonly definition: AgentPackageDefinition;
	readonly sourceAgent: AgentDefinition;
}

export function assertRawSourcePromptExportable({
	definition,
	sourceAgent,
}: RawSourcePromptExportOptions): void {
	if (definition.prompt.kind !== "source-agent") return;

	const issues = rawSourcePromptIssues(sourceAgent);
	if (issues.length === 0) return;

	const sourceAgentId =
		definition.sourceAgent ?? qualifyRole(sourceAgent.id, sourceAgent.domain);
	throw new Error(
		`Raw source-agent prompt export is not supported for "${sourceAgentId}" because it uses ${issues.join(
			", ",
		)}. Create a package definition with prompt.kind "file" or "inline" and an external-safe prompt.`,
	);
}

export function rawSourcePromptIssues(
	sourceAgent: AgentDefinition,
): readonly string[] {
	const issues: string[] = [];
	if (sourceAgent.extensions.length > 0) {
		issues.push(`extensions (${sourceAgent.extensions.join(", ")})`);
	}
	if (sourceAgent.subagents && sourceAgent.subagents.length > 0) {
		issues.push(`subagents (${sourceAgent.subagents.join(", ")})`);
	}

	const extensionBackedCapabilities = sourceAgent.capabilities.filter(
		(capability) => EXTENSION_BACKED_CAPABILITIES.has(capability),
	);
	if (extensionBackedCapabilities.length > 0) {
		issues.push(
			`extension-backed capabilities (${extensionBackedCapabilities.join(", ")})`,
		);
	}

	return issues;
}
