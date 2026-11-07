import { isAbsolute } from "node:path";
import { qualifyAgentId } from "./runtime-identity.ts";
import type { AgentDefinition, AgentMemoryGrants } from "./types.ts";

/** Same alphabet as the runtime marker; do not silently normalize identity. */
export function validateAgentId(
	value: unknown,
	field = "Agent id",
): asserts value is string {
	if (
		typeof value !== "string" ||
		!/^[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)?$/u.test(value)
	)
		throw new Error(
			`${field} requires lowercase [a-z0-9][a-z0-9-]* segments (at most domain/id)`,
		);
}

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
		isAbsolute(source.path)
	)
		return;
	throw new Error(
		"Agent instructions require inline content or an absolute file path",
	);
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

function validateIdentity(def: AgentDefinition): void {
	validateAgentId(def.id);
	if (def.domain !== undefined) {
		validateAgentId(def.domain, "Agent domain");
		if (def.domain.includes("/") || def.id.includes("/"))
			throw new Error(
				"Agent domain requires a single-segment id and domain; omit domain for a pre-qualified id",
			);
	}
}

function rejectLegacyMemoryExtensions(def: AgentDefinition): void {
	for (const name of def.extensions ?? []) {
		if (name === "agent-memory" || name === "architecture-memory")
			throw new Error(
				`Agent extension "${name}" is obsolete; remove it and declare memory.${name === "agent-memory" ? "authored" : "architecture"} explicitly`,
			);
	}
}

/** Shepherd-proposed migration policy for file-loaded declarations; user acceptance pending. */
export function validateLoadedAgentDefinition(def: AgentDefinition): void {
	validateIdentity(def);
	rejectLegacyMemoryExtensions(def);
	if (def.memory === undefined && !def.capabilities?.includes("framework-base"))
		throw new Error(
			`Agent "${def.id}" needs explicit memory grants (use memory: {} to decline) or the framework-base capability; legacy defaults are not inferred`,
		);
}

/** Validate new declaration inputs before loading providers or requesting a model. */
export function validateAgentDefinition(def: AgentDefinition): void {
	validateIdentity(def);
	rejectLegacyMemoryExtensions(def);
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
		!qualifyAgentId(def.id, def.domain).includes("/")
	)
		throw new Error("Knowledge proposal writer must be a qualified agent id");
}
