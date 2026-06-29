import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const SOURCE_ROOTS = ["lib", "cli"] as const;

const FORBIDDEN_CODING_DEFAULT_PATTERNS = [
	{
		label: "nullish coding fallback",
		pattern: /\?\?\s*["']coding["']/,
	},
	{
		label: "or coding fallback",
		pattern: /\|\|\s*["']coding["']/,
	},
	{
		label: "coding fallback prose",
		pattern: /\bfalls?\s+back\s+to\s+(?:the\s+)?["'`]?coding\b/i,
	},
	{
		label: "coding default prose",
		pattern: /\bdefaults?\s+to\s+(?:the\s+)?["'`]?coding\b/i,
	},
] as const;

async function listTypeScriptFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = await Promise.all(
		entries.map((entry) => {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) return listTypeScriptFiles(path);
			return path.endsWith(".ts") ? [path] : [];
		}),
	);
	return files.flat();
}

describe("coding-agnostic framework source defaults", () => {
	test("rejects framework coding domain defaults while preserving explicit carve-outs", async () => {
		// @cosmo-behavior plan:coding-agnostic-framework#B-009
		const sourceFiles = (
			await Promise.all(
				SOURCE_ROOTS.map((root) => listTypeScriptFiles(join(REPO_ROOT, root))),
			)
		).flat();
		const violations: string[] = [];

		for (const file of sourceFiles) {
			const source = await readFile(file, "utf-8");
			const lines = source.split(/\r?\n/);
			for (const [index, line] of lines.entries()) {
				for (const { label, pattern } of FORBIDDEN_CODING_DEFAULT_PATTERNS) {
					if (pattern.test(line)) {
						violations.push(
							`${relative(REPO_ROOT, file)}:${index + 1}: ${label}: ${line.trim()}`,
						);
					}
				}
			}
		}

		expect(violations).toEqual([]);
		expect(
			sourceFiles.some(
				(file) =>
					relative(REPO_ROOT, file) ===
					"lib/orchestration/definition-resolution.ts",
			),
		).toBe(true);
	});
});
