import { readdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
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

function isImportMeta(node: ts.Node): boolean {
	return (
		ts.isMetaProperty(node) &&
		node.keywordToken === ts.SyntaxKind.ImportKeyword &&
		node.name.text === "meta"
	);
}

function isModuleResolver(expression: ts.Expression): boolean {
	if (
		!ts.isPropertyAccessExpression(expression) ||
		expression.name.text !== "resolve"
	)
		return false;
	return (
		isImportMeta(expression.expression) ||
		(ts.isIdentifier(expression.expression) &&
			expression.expression.text === "require")
	);
}

function isModuleCall(expression: ts.Expression): boolean {
	return (
		expression.kind === ts.SyntaxKind.ImportKeyword ||
		(ts.isIdentifier(expression) && expression.text === "require") ||
		isModuleResolver(expression)
	);
}

function urlReference(node: ts.NewExpression): ts.Node | undefined {
	if (!ts.isIdentifier(node.expression) || node.expression.text !== "URL")
		return undefined;
	const base = node.arguments?.[1];
	if (
		!base ||
		!ts.isPropertyAccessExpression(base) ||
		base.name.text !== "url" ||
		!isImportMeta(base.expression)
	)
		return undefined;
	return node.arguments?.[0];
}

function declarationReference(node: ts.Node): ts.Node | undefined {
	if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
		return node.moduleSpecifier;
	if (
		ts.isImportEqualsDeclaration(node) &&
		ts.isExternalModuleReference(node.moduleReference)
	)
		return node.moduleReference.expression;
	if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
		return node.argument.literal;
	return undefined;
}

function referenceArgument(node: ts.Node): ts.Node | undefined {
	const declared = declarationReference(node);
	if (declared) return declared;
	if (ts.isCallExpression(node) && isModuleCall(node.expression))
		return node.arguments[0];
	if (ts.isNewExpression(node)) return urlReference(node);
	return undefined;
}

function isContentSpecifier(file: string, specifier: string): boolean {
	// Bare content roots and self-package paths must not bypass the filesystem guard.
	if (/^(?:cosmonauts\/)?(?:domains|bundled)(?:\/|$)/.test(specifier))
		return true;
	let path: string;
	if (specifier.startsWith("file:")) path = fileURLToPath(specifier);
	else if (specifier.startsWith(".") || isAbsolute(specifier))
		path = resolve(dirname(file), specifier);
	else return false;
	const target = relative(REPO_ROOT, path);
	return /^(?:domains|bundled)(?:\/|$)/.test(target);
}

/** LS-1 includes types, resolvers and module-relative URL resources. */
function contentImports(file: string, text: string): string[] {
	const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
	const violations: string[] = [];
	const visit = (node: ts.Node): void => {
		const argument = referenceArgument(node);
		if (
			argument &&
			ts.isStringLiteralLike(argument) &&
			isContentSpecifier(file, argument.text)
		)
			violations.push(argument.text);
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

test.each([
	[
		'const value = require.resolve("../domains/example/tool.ts");',
		"../domains/example/tool.ts",
	],
	[
		'const value = import.meta.resolve("../bundled/example/tool.ts");',
		"../bundled/example/tool.ts",
	],
	[
		'const value = new URL("../domains/example/prompt.md", import.meta.url);',
		"../domains/example/prompt.md",
	],
	[
		'import value = require("../bundled/example/value.ts");',
		"../bundled/example/value.ts",
	],
	[
		'import value from "cosmonauts/domains/example/agent.ts";',
		"cosmonauts/domains/example/agent.ts",
	],
	['export * from "bundled/example/agent.ts";', "bundled/example/agent.ts"],
	[
		`require.resolve(${JSON.stringify(join(REPO_ROOT, "domains/example/tool.ts"))});`,
		join(REPO_ROOT, "domains/example/tool.ts"),
	],
	[
		`import(${JSON.stringify(new URL("../domains/example/tool.ts", import.meta.url).href)});`,
		new URL("../domains/example/tool.ts", import.meta.url).href,
	],
])("detects additional content reference %s", (source, expected) => {
	expect(contentImports(join(REPO_ROOT, "lib/example.ts"), source)).toEqual([
		expected,
	]);
});

test("keeps library domain APIs and unrelated URLs or resolver calls valid", () => {
	expect(
		contentImports(
			join(REPO_ROOT, "lib/example.ts"),
			`
 import { DomainRegistry } from "cosmonauts/lib/domains/registry.ts";
 const a = require.resolve("./domains/registry.ts");
 const b = import.meta.resolve("./domains/resolver.ts");
 const c = new URL("./domains/schema.json", import.meta.url);
 const d = new URL("../domains/example.md", "https://example.com");
 const e = other.resolve("../domains/prose.ts");
 const f = {url: "../domains/prose.ts"};
 // require.resolve("../domains/comment.ts");
 `,
		),
	).toEqual([]);
});

// The library host paths consume neutral hooks; the review implementation remains content.
test("session host paths do not import review policy or name review actors", async () => {
	for (const path of [
		"lib/agents/session-assembly.ts",
		"lib/agents/session-policy.ts",
		"lib/orchestration/session-factory.ts",
		"lib/orchestration/agent-spawner.ts",
		"lib/extensions/orchestration/spawn-tool.ts",
		"lib/extensions/agent-switch/index.ts",
		"cli/session.ts",
	]) {
		const source = await readFile(join(REPO_ROOT, path), "utf8");
		expect(source, path).not.toMatch(
			/quality-review|qualityReview|coding\/(?:quality-manager|reviewer|security-reviewer|performance-reviewer|ux-reviewer)/,
		);
	}
});

// The remaining QM CLI dependencies retire with D2.
const CONTENT_IMPORT_EXCEPTIONS = [
	{
		from: "cli/main.ts",
		to: "lib/orchestration/quality-review-launch.ts",
		removal: "step6: delete QM CLI content",
	},
	{
		from: "cli/main.ts",
		to: "lib/orchestration/quality-review-run.ts",
		removal: "step6: delete QM CLI content",
	},
] as const;
function isContentCode(path: string): boolean {
	return /^(?:lib\/lean-run\/|cli\/lean\/|lib\/orchestration\/quality-review-)/.test(
		path,
	);
}
function contentCodeImports(file: string, text: string): string[] {
	const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
	const paths: string[] = [];
	const visit = (node: ts.Node): void => {
		const argument = referenceArgument(node);
		if (argument && ts.isStringLiteralLike(argument)) {
			const specifier = argument.text;
			const target = specifier.startsWith("cosmonauts/")
				? specifier.slice("cosmonauts/".length)
				: specifier.startsWith("file:")
					? relative(REPO_ROOT, fileURLToPath(specifier))
					: specifier.startsWith(".") || isAbsolute(specifier)
						? relative(REPO_ROOT, resolve(dirname(file), specifier))
						: undefined;
			if (target && isContentCode(target)) paths.push(target);
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return paths;
}
test("LS-2 rejects imports into lean/QM content outside the named step6 exceptions", async () => {
	const files = (
		await Promise.all(
			SOURCE_ROOTS.map((root) => listTypeScriptFiles(join(REPO_ROOT, root))),
		)
	).flat();
	const violations: string[] = [];
	const observed = new Set<string>();
	for (const file of files) {
		const from = relative(REPO_ROOT, file);
		if (isContentCode(from)) continue;
		for (const to of contentCodeImports(file, await readFile(file, "utf8"))) {
			if (
				CONTENT_IMPORT_EXCEPTIONS.some(
					(entry) => entry.from === from && entry.to === to,
				)
			)
				observed.add(`${from} -> ${to}`);
			else violations.push(`${from} -> ${to}`);
		}
	}
	expect(violations).toEqual([]);
	expect([...observed].sort()).toEqual(
		CONTENT_IMPORT_EXCEPTIONS.map(
			(entry) => `${entry.from} -> ${entry.to}`,
		).sort(),
	);
});
test("LS-2 sees type, dynamic and resolver imports into content", () => {
	const file = join(REPO_ROOT, "lib/example.ts");
	expect(
		contentCodeImports(
			file,
			`import type {T} from "./lean-run/types.ts"; import("./orchestration/quality-review-run.ts"); require.resolve("cosmonauts/lib/lean-run/index.ts");`,
		),
	).toEqual([
		"lib/lean-run/types.ts",
		"lib/orchestration/quality-review-run.ts",
		"lib/lean-run/index.ts",
	]);
});
