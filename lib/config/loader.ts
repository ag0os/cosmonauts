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
		skills?: readonly string[];
		skillPaths?: readonly string[];
		workflows?: ProjectConfig["workflows"];
	} = {};

	if (typeof obj.domain === "string") {
		config.domain = obj.domain;
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
		obj.workflows &&
		typeof obj.workflows === "object" &&
		!Array.isArray(obj.workflows)
	) {
		config.workflows = obj.workflows as ProjectConfig["workflows"];
	}

	return config;
}

/**
 * Scaffold `.cosmonauts/config.json` if it does not already exist.
 * Creates the directory and writes a default config with standard workflows.
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
