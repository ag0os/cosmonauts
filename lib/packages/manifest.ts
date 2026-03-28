/**
 * Manifest I/O for the package system
 * Handles reading and validating cosmonauts.json files
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
	ManifestValidationError,
	ManifestValidationResult,
	PackageDomain,
	PackageManifest,
} from "./types.ts";

// ============================================================================
// Constants
// ============================================================================

const MANIFEST_FILE = "cosmonauts.json";

/**
 * Valid package name pattern:
 * - Optional @scope/ prefix (e.g., @org/name)
 * - Lowercase letters, digits, hyphens, underscores
 * - Must start with a letter or digit after optional scope
 */
const PACKAGE_NAME_RE = /^(?:@[a-z0-9_-]+\/)?[a-z0-9][a-z0-9_-]*$/;

// ============================================================================
// Public API
// ============================================================================

/**
 * Read and parse cosmonauts.json from a directory.
 * Does not validate the manifest — call validateManifest() for that.
 *
 * @param dirPath - Absolute path to the directory containing cosmonauts.json
 * @returns The raw parsed JSON as an unknown value
 * @throws If the file cannot be read or is not valid JSON
 */
export async function loadManifest(dirPath: string): Promise<unknown> {
	const filePath = join(dirPath, MANIFEST_FILE);
	const content = await readFile(filePath, "utf-8");
	return JSON.parse(content) as unknown;
}

/**
 * Validate a raw parsed manifest object.
 * Returns a typed result with either the validated PackageManifest or a list of errors.
 *
 * Validates:
 * - name: required, must match package name format
 * - version: required string
 * - description: required string
 * - domains: required non-empty array of {name, path} entries
 *
 * @param raw - The unknown value to validate (typically from loadManifest)
 */
export function validateManifest(raw: unknown): ManifestValidationResult {
	const errors: ManifestValidationError[] = [];

	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		// Cannot extract any fields — report all required fields as missing
		errors.push({ field: "name", reason: "missing" });
		errors.push({ field: "version", reason: "missing" });
		errors.push({ field: "description", reason: "missing" });
		errors.push({ field: "domains", reason: "missing" });
		return { valid: false, errors };
	}

	const obj = raw as Record<string, unknown>;

	// Validate name
	if (obj.name === undefined || obj.name === null || obj.name === "") {
		errors.push({ field: "name", reason: "missing" });
	} else if (typeof obj.name !== "string" || !PACKAGE_NAME_RE.test(obj.name)) {
		errors.push({ field: "name", reason: "invalid-format" });
	}

	// Validate version
	if (!obj.version || typeof obj.version !== "string") {
		errors.push({ field: "version", reason: "missing" });
	}

	// Validate description
	if (!obj.description || typeof obj.description !== "string") {
		errors.push({ field: "description", reason: "missing" });
	}

	// Validate domains
	if (obj.domains === undefined || obj.domains === null) {
		errors.push({ field: "domains", reason: "missing" });
	} else if (!Array.isArray(obj.domains)) {
		errors.push({ field: "domains", reason: "invalid-entry" });
	} else if (obj.domains.length === 0) {
		errors.push({ field: "domains", reason: "empty" });
	} else {
		const allValid = obj.domains.every(
			(d) =>
				typeof d === "object" &&
				d !== null &&
				typeof (d as Record<string, unknown>).name === "string" &&
				typeof (d as Record<string, unknown>).path === "string",
		);
		if (!allValid) {
			errors.push({ field: "domains", reason: "invalid-entry" });
		}
	}

	if (errors.length > 0) {
		return { valid: false, errors };
	}

	const manifest: PackageManifest = {
		name: obj.name as string,
		version: obj.version as string,
		description: obj.description as string,
		domains: obj.domains as PackageDomain[],
	};

	return { valid: true, manifest };
}
