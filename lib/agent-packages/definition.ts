import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import matter from "gray-matter";
import { qualifyRole } from "../agents/qualified-role.ts";
import type { AgentDefinition, AgentToolSet } from "../agents/types.ts";
import type {
	AgentPackageDefinition,
	ExternalRuntimeTarget,
	PackagePromptSource,
	PackageSkillSelection,
	PackageToolPolicy,
	SupportedExportTarget,
	TargetPackageOptions,
} from "./types.ts";

const REQUIRED_FIELDS = [
	"schemaVersion",
	"id",
	"description",
	"prompt",
	"tools",
	"skills",
	"projectContext",
	"targets",
] as const;

const TOOL_PRESETS = new Set<AgentToolSet>([
	"coding",
	"readonly",
	"verification",
	"none",
]);
const TARGETS = new Set<ExternalRuntimeTarget>([
	"claude-cli",
	"codex",
	"gemini-cli",
	"open-code",
]);

export async function loadAgentPackageDefinition(
	definitionPath: string,
): Promise<AgentPackageDefinition> {
	const raw = await readFile(definitionPath, "utf-8");
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Invalid agent package JSON in ${definitionPath}: ${message}`,
		);
	}

	return validateAgentPackageDefinition(parsed, { definitionPath });
}

function validateAgentPackageDefinition(
	value: unknown,
	options: { readonly definitionPath?: string } = {},
): AgentPackageDefinition {
	const object = requireObject(value, "definition");
	for (const field of REQUIRED_FIELDS) {
		if (!(field in object)) {
			throw new Error(
				`Agent package definition is missing required field "${field}"`,
			);
		}
	}

	if (object.schemaVersion !== 1) {
		throw new Error("schemaVersion must be 1");
	}

	const id = requireString(object.id, "id");
	const description = requireString(object.description, "description");
	const sourceAgent = optionalString(object.sourceAgent, "sourceAgent");
	const prompt = parsePrompt(object.prompt, options.definitionPath);
	const tools = parseTools(object.tools);
	const skills = parseSkills(object.skills);
	const projectContext = object.projectContext;
	if (projectContext !== "omit") {
		throw new Error('projectContext must be "omit" in Phase 1');
	}
	const targets = parseTargets(object.targets);

	if (prompt.kind === "source-agent" && !sourceAgent) {
		throw new Error('prompt.kind "source-agent": sourceAgent is required');
	}
	if (skills.mode === "source-agent" && !sourceAgent) {
		throw new Error('skills.mode "source-agent": sourceAgent is required');
	}

	return {
		schemaVersion: 1,
		id,
		description,
		...(sourceAgent ? { sourceAgent } : {}),
		prompt,
		tools,
		skills,
		projectContext,
		targets,
	};
}

export async function readPackagePrompt(
	prompt: PackagePromptSource,
): Promise<string> {
	if (prompt.kind === "inline") return prompt.content;
	if (prompt.kind === "file") {
		const raw = await readFile(prompt.path, "utf-8");
		return stripFrontmatter(raw);
	}
	throw new Error("Cannot read package prompt from source-agent prompt source");
}

export function definitionFromAgent(
	definition: AgentDefinition,
	target: SupportedExportTarget = "claude-cli",
): AgentPackageDefinition {
	const sourceAgent = qualifyRole(definition.id, definition.domain);
	return {
		schemaVersion: 1,
		id: `${sourceAgent.replaceAll("/", "-")}-${target}`,
		description: definition.description,
		sourceAgent,
		prompt: { kind: "source-agent" },
		tools: { preset: definition.tools },
		skills: { mode: "source-agent" },
		projectContext: "omit",
		targets: { [target]: {} },
	};
}

function parsePrompt(
	value: unknown,
	definitionPath: string | undefined,
): PackagePromptSource {
	const object = requireObject(value, "prompt");
	const kind = requireString(object.kind, "prompt.kind");

	if (kind === "source-agent") return { kind };
	if (kind === "inline") {
		return { kind, content: requireString(object.content, "prompt.content") };
	}
	if (kind === "file") {
		const path = requireString(object.path, "prompt.path");
		return {
			kind,
			path: resolveDefinitionPath(path, definitionPath),
		};
	}

	throw new Error('prompt.kind must be "source-agent", "file", or "inline"');
}

function parseTools(value: unknown): PackageToolPolicy {
	const object = requireObject(value, "tools");
	const preset = requireString(object.preset, "tools.preset");
	if (!isToolPreset(preset)) {
		throw new Error(
			'tools.preset must be "coding", "readonly", "verification", or "none"',
		);
	}
	const notes = optionalString(object.notes, "tools.notes");
	return notes ? { preset, notes } : { preset };
}

function parseSkills(value: unknown): PackageSkillSelection {
	const object = requireObject(value, "skills");
	const mode = requireString(object.mode, "skills.mode");
	if (mode === "none" || mode === "source-agent") return { mode };
	if (mode === "allowlist") {
		return {
			mode,
			names: requireStringArray(object.names, "skills.names"),
		};
	}
	throw new Error('skills.mode must be "none", "source-agent", or "allowlist"');
}

function parseTargets(
	value: unknown,
): Partial<Record<ExternalRuntimeTarget, TargetPackageOptions>> {
	const object = requireObject(value, "targets");
	const targets: Partial<Record<ExternalRuntimeTarget, TargetPackageOptions>> =
		{};

	for (const [target, options] of Object.entries(object)) {
		if (!isTarget(target)) {
			throw new Error(
				`targets contains unsupported target "${target}"; expected one of claude-cli, codex, gemini-cli, open-code`,
			);
		}
		targets[target] = parseTargetOptions(options, `targets.${target}`);
	}

	return targets;
}

function parseTargetOptions(
	value: unknown,
	field: string,
): TargetPackageOptions {
	const object = requireObject(value, field);
	const options: TargetPackageOptions = {};

	if ("promptMode" in object) {
		const promptMode = requireString(object.promptMode, `${field}.promptMode`);
		if (promptMode !== "append" && promptMode !== "replace") {
			throw new Error(`${field}.promptMode must be "append" or "replace"`);
		}
		Object.assign(options, { promptMode });
	}
	if ("skillDelivery" in object) {
		const skillDelivery = requireString(
			object.skillDelivery,
			`${field}.skillDelivery`,
		);
		if (skillDelivery !== "inline") {
			throw new Error(`${field}.skillDelivery must be "inline"`);
		}
		Object.assign(options, { skillDelivery });
	}
	if ("allowedTools" in object) {
		Object.assign(options, {
			allowedTools: requireStringArray(
				object.allowedTools,
				`${field}.allowedTools`,
			),
		});
	}

	return options;
}

function resolveDefinitionPath(
	path: string,
	definitionPath: string | undefined,
): string {
	if (isAbsolute(path)) {
		throw new Error(
			"prompt.path must be relative to the package definition directory",
		);
	}

	const root = definitionPath
		? dirname(resolve(definitionPath))
		: process.cwd();
	const resolved = resolve(root, path);
	const relativePath = relative(root, resolved);
	if (
		relativePath === "" ||
		(!isAbsolute(relativePath) &&
			relativePath !== ".." &&
			!relativePath.startsWith(`..${sep}`))
	) {
		return resolved;
	}

	throw new Error(
		"prompt.path must stay within the package definition directory",
	);
}

function requireObject(value: unknown, field: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${field} must be an object`);
	}
	return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`${field} must be a non-empty string`);
	}
	return value;
}

function optionalString(value: unknown, field: string): string | undefined {
	if (value === undefined) return undefined;
	return requireString(value, field);
}

function requireStringArray(value: unknown, field: string): readonly string[] {
	if (
		!Array.isArray(value) ||
		!value.every((item) => typeof item === "string")
	) {
		throw new Error(`${field} must be an array of strings`);
	}
	return value;
}

function isToolPreset(value: string): value is AgentToolSet {
	return TOOL_PRESETS.has(value as AgentToolSet);
}

function isTarget(value: string): value is ExternalRuntimeTarget {
	return TARGETS.has(value as ExternalRuntimeTarget);
}

function stripFrontmatter(raw: string): string {
	return matter(raw).content.trimStart();
}
