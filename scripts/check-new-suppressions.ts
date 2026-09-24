/** Check source suppressions against the registry in an explicit Git base revision. */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import {
	checkSuppressions,
	type Suppression,
	type SuppressionKey,
	scanSuppressions,
} from "../lib/quality/suppression-policy.ts";

const args = process.argv.slice(2);
function option(name: string): string | undefined {
	const index = args.indexOf(name);
	return index < 0 ? undefined : args[index + 1];
}
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

interface Registry {
	version: 1;
	entries: SuppressionKey[];
	equivalents?: Record<string, string>;
}

function parseRegistry(source: string | undefined): Registry {
	if (source === undefined) return { version: 1, entries: [] };
	const value: unknown = JSON.parse(source);
	if (typeof value !== "object" || value === null)
		throw new Error("invalid base suppression registry");
	const record = value as Record<string, unknown>;
	if (record.version !== 1 || !Array.isArray(record.entries))
		throw new Error("invalid base suppression registry version or entries");
	for (const entry of record.entries) {
		if (
			typeof entry !== "object" ||
			entry === null ||
			!["family", "path", "directive", "target"].every(
				(field) => typeof entry[field] === "string",
			)
		)
			throw new Error("invalid base suppression registry entry");
	}
	if (
		record.equivalents !== undefined &&
		(typeof record.equivalents !== "object" ||
			record.equivalents === null ||
			Object.values(record.equivalents).some(
				(item) => typeof item !== "string",
			))
	)
		throw new Error("invalid base suppression equivalents");
	return value as Registry;
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
				/\.(?:[cm]?[jt]sx?)$/.test(path) &&
				!isAbsolute(path) &&
				!path.split("/").includes(".."),
		);
	const failures: Suppression[] = [];
	for (const path of new Set(files)) {
		const full = join(root, path);
		if (!existsSync(full)) continue;
		const previous = scanSuppressions(
			path,
			baseFile(path) ?? "",
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
