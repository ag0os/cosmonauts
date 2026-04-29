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
	const manifestObject = validateManifestObject(raw);
	if (!manifestObject.ok) {
		return { valid: false, errors: manifestObject.errors };
	}

	const obj = manifestObject.value;
	const errors = [
		validatePackageName(obj.name),
		validateRequiredString("version", obj.version),
		validateRequiredString("description", obj.description),
		validateDomainsField(obj.domains),
	].filter((error): error is ManifestValidationError => error !== undefined);

	if (errors.length > 0) {
		return { valid: false, errors };
	}

	return { valid: true, manifest: toPackageManifest(obj) };
}

type ManifestObjectValidationResult =
	| { ok: true; value: Record<string, unknown> }
	| { ok: false; errors: ManifestValidationError[] };

function validateManifestObject(raw: unknown): ManifestObjectValidationResult {
	if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
		return { ok: true, value: raw as Record<string, unknown> };
	}

	return {
		ok: false,
		errors: [
			{ field: "name", reason: "missing" },
			{ field: "version", reason: "missing" },
			{ field: "description", reason: "missing" },
			{ field: "domains", reason: "missing" },
		],
	};
}

function validatePackageName(
	value: unknown,
): ManifestValidationError | undefined {
	if (value === undefined || value === null || value === "") {
		return { field: "name", reason: "missing" };
	}

	if (typeof value !== "string" || !PACKAGE_NAME_RE.test(value)) {
		return { field: "name", reason: "invalid-format" };
	}
}

function validateRequiredString(
	field: "version" | "description",
	value: unknown,
): ManifestValidationError | undefined {
	if (value && typeof value === "string") {
		return undefined;
	}

	return field === "version"
		? { field: "version", reason: "missing" }
		: { field: "description", reason: "missing" };
}

function validateDomainsField(
	value: unknown,
): ManifestValidationError | undefined {
	if (value === undefined || value === null) {
		return { field: "domains", reason: "missing" };
	}

	if (!Array.isArray(value)) {
		return { field: "domains", reason: "invalid-entry" };
	}

	if (value.length === 0) {
		return { field: "domains", reason: "empty" };
	}

	if (!value.every(isPackageDomain)) {
		return { field: "domains", reason: "invalid-entry" };
	}
}

function isPackageDomain(value: unknown): value is PackageDomain {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const domain = value as Record<string, unknown>;
	return typeof domain.name === "string" && typeof domain.path === "string";
}

function toPackageManifest(obj: Record<string, unknown>): PackageManifest {
	return {
		name: obj.name as string,
		version: obj.version as string,
		description: obj.description as string,
		domains: obj.domains as PackageDomain[],
	};
}
