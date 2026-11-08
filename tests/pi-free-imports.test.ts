/**
 * The independent analysis and runtime modules reach no `@earendil-works/*` package, at runtime or through
 * type-only imports. Synthetic fixtures also pin optional dynamic-backend exceptions.
 */

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import { useTempDir } from "./helpers/fs.ts";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const PI_FREE_ROOTS = [
	"lib/envelope",
	"lib/code-health",
	"lib/architecture-map",
	"lib/analysis",
	"lib/agent-packages",
	"lib/config",
	"lib/durable-runtime",
] as const;
const PI_PACKAGE = /^@earendil-works\//;

interface ImportEdge {
	readonly specifier: string;
	readonly dynamic: boolean;
}

function listTypeScriptFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return listTypeScriptFiles(path);
		return path.endsWith(".ts") ? [path] : [];
	});
}

/** Every import, re-export, type-only imports and dynamic-import expressions in a file. */
function importEdges(file: string): ImportEdge[] {
	const source = ts.createSourceFile(
		file,
		readFileSync(file, "utf8"),
		ts.ScriptTarget.Latest,
		true,
	);
	const edges: ImportEdge[] = [];

	const addLiteral = (node: ts.Node | undefined, dynamic = false): void => {
		if (node && ts.isStringLiteralLike(node))
			edges.push({ specifier: node.text, dynamic });
	};
	const visit = (node: ts.Node): void => {
		if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
			addLiteral(node.moduleSpecifier);
		else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
			addLiteral(node.argument.literal);
		else if (
			ts.isCallExpression(node) &&
			node.expression.kind === ts.SyntaxKind.ImportKeyword
		)
			addLiteral(node.arguments[0], true);
		ts.forEachChild(node, visit);
	};
	visit(source);
	return edges;
}

function resolveRelative(from: string, specifier: string): string | undefined {
	const base = resolve(dirname(from), specifier);
	return [base, `${base}.ts`, join(base, "index.ts")].find(
		(candidate) => existsSync(candidate) && statSync(candidate).isFile(),
	);
}

interface WalkOptions {
	readonly root: string;
	/** Directories whose files start the walk, relative to `root`. */
	readonly from: readonly string[];
	/** The one Pi module a dynamic `import()` may reach, relative to `root`. */
	readonly piBackend: string;
}

/** Each Pi package or static Pi-backend import reached, as an import chain. */
function piReachingChains(options: WalkOptions): string[] {
	const piBackend = resolve(options.root, options.piBackend);
	const parents = new Map<string, string | undefined>();
	const queue = options.from
		.flatMap((dir) => listTypeScriptFiles(resolve(options.root, dir)))
		.filter((file) => file !== piBackend);
	for (const file of queue) parents.set(file, undefined);

	const chainTo = (file: string, target: string): string => {
		const chain = [target];
		for (let at: string | undefined = file; at; at = parents.get(at))
			chain.unshift(relative(options.root, at));
		return chain.join(" -> ");
	};

	const chains: string[] = [];

	const follow = (file: string, { specifier, dynamic }: ImportEdge): void => {
		if (PI_PACKAGE.test(specifier)) {
			chains.push(chainTo(file, specifier));
			return;
		}
		if (!specifier.startsWith(".")) return;
		const target = resolveRelative(file, specifier);
		if (target === piBackend) {
			if (!dynamic) chains.push(chainTo(file, options.piBackend));
			return;
		}
		if (!target || parents.has(target)) return;
		parents.set(target, file);
		queue.push(target);
	};
	for (const file of queue) {
		for (const edge of importEdges(file)) follow(file, edge);
	}

	return chains;
}

const fixture = useTempDir("pi-free-imports-");

function writeFixture(files: Record<string, string>): void {
	for (const [path, content] of Object.entries(files)) {
		const file = join(fixture.path, path);
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, content);
	}
}

describe("Pi-free check-CLI modules", () => {
	test("reach no Pi package at runtime or through types", () => {
		expect(
			piReachingChains({
				root: REPO_ROOT,
				from: PI_FREE_ROOTS,
				piBackend: "", // No production exception; the project directory is never a module.
			}),
		).toEqual([]);
	});

	test("the walk follows type-only imports, re-exports and import() types to a Pi package", () => {
		writeFixture({
			"free/a.ts":
				'import type { B } from "../shared/b.ts";\nexport type A = B;\n',
			"shared/b.ts": 'export type { C as B } from "./c.ts";\n',
			"shared/c.ts":
				'export type C = import("@earendil-works/pi-ai").Model<never>;\n',
		});

		expect(
			piReachingChains({
				root: fixture.path,
				from: ["free"],
				piBackend: "free/pi.ts",
			}),
		).toEqual([
			"free/a.ts -> shared/b.ts -> shared/c.ts -> @earendil-works/pi-ai",
		]);
	});

	test("the walk allows only a dynamic import() of the Pi backend", () => {
		writeFixture({
			"free/lazy.ts": 'export const load = () => import("./pi.ts");\n',
			"free/eager.ts": 'export { run } from "./pi.ts";\n',
			"free/pi.ts": 'export { run } from "@earendil-works/pi-coding-agent";\n',
		});

		expect(
			piReachingChains({
				root: fixture.path,
				from: ["free"],
				piBackend: "free/pi.ts",
			}),
		).toEqual(["free/eager.ts -> free/pi.ts"]);
	});
});
