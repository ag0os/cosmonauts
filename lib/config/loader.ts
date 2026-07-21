/**
 * Project config loader — reads `.cosmonauts/config.json`.
 *
 * Missing file → empty config (no error).
 * Invalid JSON → throws with descriptive message.
 */

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createDefaultProjectConfig } from "./defaults.ts";
import type { ProjectConfig, ProjectEpisodicLogConfig } from "./types.ts";

export const EPISODE_WARNING_THRESHOLD_DEFAULT = 500;

export interface ResolvedEpisodicLogConfig {
	readonly enabled: boolean;
	readonly warningThreshold: number;
}

type MutableArchitectureMapConfig = {
	sourceRoots?: string[];
	moduleRoots?: string[];
	exclude?: string[];
	injectionMaxBytes?: number;
	narrative?: {
		enabled?: boolean;
		maxModulesPerRun?: number;
	};
};

/** Expand leading `~` or `~/` to the user's home directory. */
function expandTilde(p: string): string {
	if (p === "~") return homedir();
	if (p.startsWith("~/") || p.startsWith("~\\")) {
		return join(homedir(), p.slice(2));
	}
	return p;
}

const CONFIG_DIR = ".cosmonauts";
const CONFIG_FILE = "config.json";

/**
 * Load project configuration from `.cosmonauts/config.json`.
 * Returns an empty config if the file does not exist.
 * Throws if the file exists but contains invalid JSON.
 */
// fallow-ignore-next-line complexity
export async function loadProjectConfig(
	projectRoot: string,
): Promise<ProjectConfig> {
	const configPath = join(projectRoot, CONFIG_DIR, CONFIG_FILE);

	let raw: string;
	try {
		raw = await readFile(configPath, "utf-8");
	} catch (error: unknown) {
		// Missing config file is expected; other read failures should surface.
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			(error as NodeJS.ErrnoException).code === "ENOENT"
		) {
			return {};
		}
		throw error;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error(
			`Invalid JSON in ${configPath}. Expected a valid JSON object.`,
		);
	}

	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error(`Invalid config in ${configPath}. Expected a JSON object.`);
	}

	const obj = parsed as Record<string, unknown>;
	const config: {
		domain?: string;
		activeDomains?: readonly string[];
		domainBindings?: Readonly<Record<string, string>>;
		skills?: readonly string[];
		skillPaths?: readonly string[];
		chains?: ProjectConfig["chains"];
		architectureMap?: ProjectConfig["architectureMap"];
		episodicLog?: ProjectConfig["episodicLog"];
	} = {};

	if (typeof obj.domain === "string") {
		config.domain = obj.domain;
	}

	if (Array.isArray(obj.activeDomains)) {
		config.activeDomains = obj.activeDomains.filter(
			(s: unknown): s is string => typeof s === "string",
		);
	}

	if ("domainBindings" in obj) {
		if (
			typeof obj.domainBindings === "object" &&
			obj.domainBindings !== null &&
			!Array.isArray(obj.domainBindings)
		) {
			const domainBindings: Record<string, string> = {};
			for (const [role, target] of Object.entries(obj.domainBindings)) {
				if (
					role.length > 0 &&
					typeof target === "string" &&
					target.length > 0
				) {
					domainBindings[role] = target;
				} else {
					console.error(
						`[warning] Skipping malformed domainBindings entry ${JSON.stringify(role)}: expected a non-empty role and non-empty string target domain, got ${formatConfigValue(target)}.`,
					);
				}
			}
			config.domainBindings = domainBindings;
		} else {
			console.error(
				`[warning] Skipping malformed domainBindings: expected an object map like { "coding": "ruby-coding" }, got ${formatConfigValue(obj.domainBindings)}.`,
			);
		}
	}

	if (Array.isArray(obj.skills)) {
		config.skills = obj.skills.filter(
			(s: unknown): s is string => typeof s === "string",
		);
	}

	if (Array.isArray(obj.skillPaths)) {
		config.skillPaths = obj.skillPaths
			.filter((s: unknown): s is string => typeof s === "string")
			.map((p) => resolve(projectRoot, expandTilde(p)));
	}

	if (
		obj.chains &&
		typeof obj.chains === "object" &&
		!Array.isArray(obj.chains)
	) {
		config.chains = obj.chains as ProjectConfig["chains"];
	}

	if ("architectureMap" in obj) {
		config.architectureMap = parseArchitectureMapConfig(obj.architectureMap);
	}

	if ("episodicLog" in obj) {
		config.episodicLog = parseEpisodicLogConfig(obj.episodicLog);
	}

	return config;
}

export function resolveEpisodicLogConfig(
	config: Pick<ProjectConfig, "episodicLog">,
): ResolvedEpisodicLogConfig {
	return {
		enabled: config.episodicLog?.enabled === true,
		warningThreshold:
			config.episodicLog?.warningThreshold ?? EPISODE_WARNING_THRESHOLD_DEFAULT,
	};
}

function parseEpisodicLogConfig(
	value: unknown,
): ProjectEpisodicLogConfig | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		console.error(
			`[warning] Skipping malformed episodicLog: expected an object, got ${formatConfigValue(value)}.`,
		);
		return undefined;
	}

	const obj = value as Record<string, unknown>;
	const episodicLog: {
		enabled?: boolean;
		warningThreshold?: number;
	} = {};

	if ("enabled" in obj) {
		if (typeof obj.enabled === "boolean") {
			episodicLog.enabled = obj.enabled;
		} else {
			console.error(
				`[warning] Skipping malformed episodicLog.enabled: expected a boolean, got ${formatConfigValue(obj.enabled)}.`,
			);
		}
	}

	if ("warningThreshold" in obj) {
		if (
			typeof obj.warningThreshold === "number" &&
			Number.isSafeInteger(obj.warningThreshold) &&
			obj.warningThreshold > 0
		) {
			episodicLog.warningThreshold = obj.warningThreshold;
		} else {
			console.error(
				`[warning] Skipping malformed episodicLog.warningThreshold: expected a positive integer, got ${formatConfigValue(obj.warningThreshold)}.`,
			);
		}
	}

	return episodicLog;
}

function parseArchitectureMapConfig(
	value: unknown,
): ProjectConfig["architectureMap"] | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		console.error(
			`[warning] Skipping malformed architectureMap: expected an object, got ${formatConfigValue(value)}.`,
		);
		return undefined;
	}

	const obj = value as Record<string, unknown>;
	const architectureMap: MutableArchitectureMapConfig = {};

	const sourceRoots = parseStringArrayField(
		"architectureMap.sourceRoots",
		obj.sourceRoots,
	);
	if (sourceRoots) architectureMap.sourceRoots = sourceRoots;

	const moduleRoots = parseStringArrayField(
		"architectureMap.moduleRoots",
		obj.moduleRoots,
	);
	if (moduleRoots) architectureMap.moduleRoots = moduleRoots;

	const exclude = parseStringArrayField("architectureMap.exclude", obj.exclude);
	if (exclude) architectureMap.exclude = exclude;

	const injectionMaxBytes = parseOptionalFiniteNumberField(
		"architectureMap.injectionMaxBytes",
		obj,
		"injectionMaxBytes",
	);
	if (injectionMaxBytes !== undefined) {
		architectureMap.injectionMaxBytes = injectionMaxBytes;
	}

	const narrative = parseOptionalObjectField(
		"architectureMap.narrative",
		obj,
		"narrative",
	);
	if (narrative) {
		const parsedNarrative = parseArchitectureMapNarrative(narrative);
		if (parsedNarrative) architectureMap.narrative = parsedNarrative;
	}

	return architectureMap;
}

function parseOptionalFiniteNumberField(
	fieldName: string,
	obj: Record<string, unknown>,
	key: string,
): number | undefined {
	if (!(key in obj)) return undefined;
	const value = obj[key];
	if (typeof value === "number" && Number.isFinite(value)) return value;
	console.error(
		`[warning] Skipping malformed ${fieldName}: expected a finite number, got ${formatConfigValue(value)}.`,
	);
	return undefined;
}

function parseOptionalObjectField(
	fieldName: string,
	obj: Record<string, unknown>,
	key: string,
): object | undefined {
	if (!(key in obj)) return undefined;
	const value = obj[key];
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return value;
	}
	console.error(
		`[warning] Skipping malformed ${fieldName}: expected an object, got ${formatConfigValue(value)}.`,
	);
	return undefined;
}

function parseArchitectureMapNarrative(
	value: object,
): MutableArchitectureMapConfig["narrative"] | undefined {
	const obj = value as Record<string, unknown>;
	const narrative: NonNullable<MutableArchitectureMapConfig["narrative"]> = {};

	if ("enabled" in obj) {
		if (typeof obj.enabled === "boolean") {
			narrative.enabled = obj.enabled;
		} else {
			console.error(
				`[warning] Skipping malformed architectureMap.narrative.enabled: expected a boolean, got ${formatConfigValue(obj.enabled)}.`,
			);
		}
	}

	if ("maxModulesPerRun" in obj) {
		if (
			typeof obj.maxModulesPerRun === "number" &&
			Number.isFinite(obj.maxModulesPerRun)
		) {
			narrative.maxModulesPerRun = obj.maxModulesPerRun;
		} else {
			console.error(
				`[warning] Skipping malformed architectureMap.narrative.maxModulesPerRun: expected a finite number, got ${formatConfigValue(obj.maxModulesPerRun)}.`,
			);
		}
	}

	if (!("enabled" in narrative) && !("maxModulesPerRun" in narrative)) {
		return undefined;
	}

	return narrative;
}

function parseStringArrayField(
	fieldName: string,
	value: unknown,
): string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) {
		console.error(
			`[warning] Skipping malformed ${fieldName}: expected an array of strings, got ${formatConfigValue(value)}.`,
		);
		return undefined;
	}

	const strings: string[] = [];
	for (const entry of value) {
		if (typeof entry === "string") {
			strings.push(entry);
		} else {
			console.error(
				`[warning] Skipping malformed ${fieldName} entry: expected a string, got ${formatConfigValue(entry)}.`,
			);
		}
	}
	return strings;
}

function formatConfigValue(value: unknown): string {
	if (value === undefined) return "undefined";
	return JSON.stringify(value);
}

/**
 * Scaffold `.cosmonauts/config.json` if it does not already exist.
 * Creates the directory and writes a default config.
 *
 * Idempotent — safe to call multiple times. Never overwrites an existing file.
 *
 * @returns `true` if the file was created, `false` if it already existed.
 */
export async function scaffoldProjectConfig(
	projectRoot: string,
): Promise<boolean> {
	const configDir = join(projectRoot, CONFIG_DIR);
	const configPath = join(configDir, CONFIG_FILE);

	// Check if it already exists
	try {
		await access(configPath);
		return false; // Already exists — do not overwrite
	} catch {
		// Does not exist — proceed to create
	}

	await mkdir(configDir, { recursive: true });
	const content = JSON.stringify(createDefaultProjectConfig(), null, 2);
	await writeFile(configPath, `${content}\n`, "utf-8");
	return true;
}
