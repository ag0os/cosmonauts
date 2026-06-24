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
import type { ProjectConfig } from "./types.ts";

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

	return config;
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
