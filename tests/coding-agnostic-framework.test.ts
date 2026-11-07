import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
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

/** LS-1 includes type-only imports and re-exports: content cannot define core types. */
function contentImports(file: string, text: string): string[] {
	const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
	const violations: string[] = [];
	const check = (node: ts.Node | undefined) => {
		if (!node || !ts.isStringLiteralLike(node)) return;
		if (!node.text.startsWith(".")) return;
		const target = relative(REPO_ROOT, resolve(dirname(file), node.text));
		if (target.startsWith("domains/") || target.startsWith("bundled/")) {
			violations.push(node.text);
		}
	};
	const visit = (node: ts.Node): void => {
		if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
			check(node.moduleSpecifier);
		} else if (
			ts.isImportTypeNode(node) &&
			ts.isLiteralTypeNode(node.argument)
		) {
			check(node.argument.literal);
		} else if (
			ts.isCallExpression(node) &&
			(node.expression.kind === ts.SyntaxKind.ImportKeyword ||
				(ts.isIdentifier(node.expression) &&
					node.expression.text === "require"))
		) {
			check(node.arguments[0]);
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return violations;
}

describe("library/content import boundary (LS-1)", () => {
	test("rejects content dependencies in library and CLI source", async () => {
		const files = (
			await Promise.all(
				SOURCE_ROOTS.map((root) => listTypeScriptFiles(join(REPO_ROOT, root))),
			)
		).flat();
		const violations = (
			await Promise.all(
				files.map(async (file) =>
					contentImports(file, await readFile(file, "utf8")).map(
						(specifier) => `${relative(REPO_ROOT, file)}: ${specifier}`,
					),
				),
			)
		).flat();
		expect(violations).toEqual([]);
	});

	test("detects content across import syntaxes while allowing library domain modules", () => {
		const file = join(REPO_ROOT, "lib", "example.ts");
		expect(
			contentImports(
				file,
				`import type { Definition } from "../domains/example/agent.ts";
export { agent } from "../bundled/example/agent.ts";
const extension = import("../domains/example/extension.ts");
type Content = import("../bundled/example/types.ts").Content;
const legacy = require("../domains/example/legacy.ts");
import { DomainResolver } from "./domains/resolver.ts";
// import "../domains/comment.ts";
const example = "../domains/prose.ts";`,
			),
		).toEqual([
			"../domains/example/agent.ts",
			"../bundled/example/agent.ts",
			"../domains/example/extension.ts",
			"../bundled/example/types.ts",
			"../domains/example/legacy.ts",
		]);
	});
});
