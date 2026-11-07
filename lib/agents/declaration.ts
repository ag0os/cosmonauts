import { qualifyAgentId } from "./runtime-identity.ts";
import type { AgentDefinition, AgentMemoryGrants } from "./types.ts";

export function resolveMemoryGrants(
	grants: AgentMemoryGrants | undefined,
): Required<AgentMemoryGrants> {
	return {
		knowledge: grants?.knowledge ?? true,
		authored: grants?.authored ?? false,
		proposals: grants?.proposals ?? false,
		architecture: grants?.architecture ?? false,
		episodes: grants?.episodes ?? false,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateInstructions(source: unknown): void {
	if (source === undefined) return;
	if (!isRecord(source))
		throw new Error("Agent instructions require an inline or file source");
	if (source.kind === "inline" && typeof source.content === "string") return;
	if (
		source.kind === "file" &&
		typeof source.path === "string" &&
		source.path.trim()
	)
		return;
	throw new Error("Agent instructions require inline content or a file path");
}

function validateTools(tools: unknown): void {
	if (typeof tools === "string") {
		if (["coding", "readonly", "verification", "none"].includes(tools)) return;
		throw new Error(`Unknown tool preset: ${tools}`);
	}
	if (
		Array.isArray(tools) &&
		tools.every((name) => typeof name === "string" && name.trim())
	)
		return;
	throw new Error("Agent tools must be a preset or non-empty tool names");
}

function validateMemory(memory: unknown): void {
	if (memory === undefined) return;
	if (!isRecord(memory))
		throw new Error("Agent memory grants must be an object");
	for (const [group, grant] of Object.entries(memory)) {
		if (
			![
				"knowledge",
				"authored",
				"proposals",
				"architecture",
				"episodes",
			].includes(group) ||
			typeof grant !== "boolean"
		) {
			throw new Error(`Invalid memory grant: ${group}`);
		}
	}
}

/** Validate new declaration inputs before loading providers or requesting a model. */
export function validateAgentDefinition(def: AgentDefinition): void {
	if (typeof def.id !== "string" || !def.id.trim())
		throw new Error("Agent id must be non-empty");
	if (
		def.resourceDomain !== undefined &&
		(typeof def.resourceDomain !== "string" || !def.resourceDomain.trim())
	) {
		throw new Error("Agent resourceDomain must be non-empty");
	}
	validateInstructions(def.instructions);
	validateTools(def.tools);
	validateMemory(def.memory);
	if (
		def.memory?.proposals &&
		!/^[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9_/-]*$/u.test(
			qualifyAgentId(def.id, def.domain),
		)
	) {
		throw new Error("Knowledge proposal writer must be a qualified agent id");
	}
}
