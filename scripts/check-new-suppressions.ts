/** Check source suppressions against the registry in an explicit Git base revision. */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { cliOption } from "./cli-option.ts";
import {
	checkSuppressions,
	isSuppressionScanPath,
	type Suppression,
	type SuppressionKey,
	scanSuppressions,
} from "./suppression-policy.ts";

const args = process.argv.slice(2);
const option = (name: string) => cliOption(args, name);
const root = resolve(option("--root") ?? ".");
const base = option("--base");
if (
	!base ||
	base.startsWith("-") ||
	(args.includes("--root") && !option("--root"))
) {
	console.error(
		"Usage: bun scripts/check-new-suppressions.ts --base <revision> [--root <path>]",
	);
	process.exit(2);
}

function git(...arguments_: string[]): string {
	const result = spawnSync("git", arguments_, { cwd: root, encoding: "utf8" });
	if (result.status !== 0)
		throw new Error(`git ${arguments_.join(" ")}: ${result.stderr.trim()}`);
	return result.stdout;
}

function baseFile(path: string): string | undefined {
	if (git("ls-tree", "--name-only", base as string, "--", path).trim() !== path)
		return undefined;
	const result = spawnSync("git", ["show", `${base}:${path}`], {
		cwd: root,
		encoding: "utf8",
	});
	if (result.status === 0) return result.stdout;
	throw new Error(
		`unable to read ${path} from ${base}: ${result.stderr.trim()}`,
	);
}

/** Map each path renamed since the base to its base path. */
function renameOrigins(): Map<string, string> {
	const fields = git(
		"diff",
		"--name-status",
		"--find-renames",
		"--diff-filter=R",
		"--relative",
		"--no-ext-diff",
		"-z",
		base as string,
		"--",
	).split("\0");
	const origins = new Map<string, string>();
	for (let index = 0; index + 2 < fields.length; index += 3) {
		const origin = fields[index + 1] as string;
		if (isSuppressionScanPath(origin))
			origins.set(fields[index + 2] as string, origin);
	}
	return origins;
}

function previousSuppressions(
	path: string,
	origin: string,
	equivalents: Readonly<Record<string, string>> | undefined,
): Suppression[] {
	return scanSuppressions(origin, baseFile(origin) ?? "", equivalents).map(
		(item) => ({ ...item, path }),
	);
}

interface Registry {
	version: 1;
	entries: SuppressionKey[];
	equivalents?: Record<string, string>;
}

function parseRegistry(source: string | undefined): Registry {
	if (source === undefined) return { version: 1, entries: [] };
	const value: unknown = JSON.parse(source);
	validateRegistry(value);
	return value as Registry;
}

function validateRegistry(value: unknown): void {
	if (!isRecord(value)) throw new Error("invalid base suppression registry");
	if (!hasRegistryEntries(value))
		throw new Error("invalid base suppression registry version or entries");
	validateRegistryEntries(value.entries);
	validateRegistryEquivalents(value.equivalents);
}

function validateRegistryEntries(entries: unknown[]): void {
	if (!entries.every(isRegistryEntry))
		throw new Error("invalid base suppression registry entry");
}

function validateRegistryEquivalents(equivalents: unknown): void {
	if (!validEquivalents(equivalents))
		throw new Error("invalid base suppression equivalents");
}

function hasRegistryEntries(
	value: Record<string, unknown>,
): value is Record<string, unknown> & { entries: unknown[] } {
	return value.version === 1 && Array.isArray(value.entries);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRegistryEntry(value: unknown): boolean {
	return (
		isRecord(value) &&
		["family", "path", "directive", "target"].every(
			(field) => typeof value[field] === "string",
		)
	);
}

function validEquivalents(value: unknown): boolean {
	return (
		value === undefined ||
		(isRecord(value) &&
			Object.values(value).every((item) => typeof item === "string"))
	);
}

try {
	git("rev-parse", "--verify", `${base}^{commit}`);
	const registry = parseRegistry(
		baseFile(".cosmonauts/suppression-exceptions.json"),
	);
	const files = git(
		"ls-files",
		"--cached",
		"--others",
		"--exclude-standard",
		"-z",
	)
		.split("\0")
		.filter(
			(path) =>
				isSuppressionScanPath(path) &&
				!isAbsolute(path) &&
				!path.split("/").includes(".."),
		);
	const origins = renameOrigins();
	const failures: Suppression[] = [];
	for (const path of new Set(files)) {
		const full = join(root, path);
		if (!existsSync(full)) continue;
		const previous = previousSuppressions(
			path,
			origins.get(path) ?? path,
			registry.equivalents,
		);
		const current = scanSuppressions(
			path,
			readFileSync(full, "utf8"),
			registry.equivalents,
		);
		failures.push(...checkSuppressions(previous, current, registry.entries));
	}
	for (const item of failures)
		console.log(
			`${item.path}:${item.line}: unregistered ${item.family} directive`,
		);
	if (failures.length > 0) process.exitCode = 1;
	else console.log("suppression check passed");
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 2;
}
