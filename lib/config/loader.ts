/**
 * Project config loader — reads `.cosmonauts/config.json`.
 *
 * Missing file → empty config (no error).
 * Invalid JSON → throws with descriptive message.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectConfig } from "./types.ts";

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
	} catch {
		return {}; // File doesn't exist — empty config
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
		skills?: readonly string[];
		workflows?: ProjectConfig["workflows"];
	} = {};

	if (Array.isArray(obj.skills)) {
		config.skills = obj.skills.filter(
			(s: unknown): s is string => typeof s === "string",
		);
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
