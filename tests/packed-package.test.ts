import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
	installPackedPackage,
	type PackedInstall,
	repoRoot,
} from "./helpers/packed-install.ts";

const exec = promisify(execFile);
let consumer = "";
let packed: PackedInstall;

beforeAll(async () => {
	consumer = await mkdtemp(join(tmpdir(), "packed-package-"));
	packed = await installPackedPackage(consumer);
	await mkdir(join(consumer, "home"));
}, 60_000);

afterAll(async () => {
	if (consumer) await rm(consumer, { recursive: true, force: true });
});

function consumerEnv(): NodeJS.ProcessEnv {
	return {
		...process.env,
		HOME: join(consumer, "home"),
		PI_CODING_AGENT_DIR: join(consumer, "home", ".pi", "agent"),
		PATH: `${packed.binDir}:${process.env.PATH ?? ""}`,
	};
}

async function cosmonauts(args: string[]) {
	return exec(join(packed.binDir, "cosmonauts"), args, {
		cwd: consumer,
		env: consumerEnv(),
		timeout: 30_000,
	});
}

/** Runs a module in the consumer under Bun with outbound fetch disabled. */
async function runInConsumer(name: string, source: string) {
	await writeFile(join(consumer, `${name}.ts`), source);
	await writeFile(
		join(consumer, `${name}.run.ts`),
		`globalThis.fetch = () => { throw new Error("NETWORK_FORBIDDEN"); };\nawait import("./${name}.ts");\n`,
	);
	return exec("bun", [`${name}.run.ts`], {
		cwd: consumer,
		env: consumerEnv(),
		timeout: 30_000,
	});
}

async function repoExports(): Promise<Record<string, string>> {
	const pkg = JSON.parse(
		await readFile(join(repoRoot, "package.json"), "utf8"),
	);
	return pkg.exports;
}

test("the tarball ships exactly the bin, the library and CLI source, the theme, the README and the manifest", async () => {
	const { stdout } = await exec("git", ["ls-files", "lib", "cli", "themes"], {
		cwd: repoRoot,
	});
	const expected = [
		...stdout.split("\n").filter((line) => line.length > 0),
		"README.md",
		"bin/cosmonauts",
		"package.json",
	].sort();
	expect(packed.files).toEqual(expected);
	for (const developerOnly of [
		"stryker.config.mjs",
		"patches/README.md",
		"bin/cosmonauts-drive-step",
	])
		expect(packed.files).not.toContain(developerOnly);
	expect(
		packed.files.filter((path) =>
			/^(tests|docs|missions|memory|knowledge|domains|bundled|scripts)\//.test(
				path,
			),
		),
	).toEqual([]);
});

/** Every module specifier a source names: import/export declarations, `import =`, `import()`. */
function moduleSpecifiers(source: string): string[] {
	const found: string[] = [];
	const visit = (node: ts.Node): void => {
		if (
			(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
			node.moduleSpecifier &&
			ts.isStringLiteral(node.moduleSpecifier)
		)
			found.push(node.moduleSpecifier.text);
		else if (
			ts.isExternalModuleReference(node) &&
			ts.isStringLiteral(node.expression)
		)
			found.push(node.expression.text);
		else if (
			ts.isCallExpression(node) &&
			node.expression.kind === ts.SyntaxKind.ImportKeyword &&
			node.arguments[0] &&
			ts.isStringLiteralLike(node.arguments[0])
		)
			found.push(node.arguments[0].text);
		ts.forEachChild(node, visit);
	};
	visit(ts.createSourceFile("source.ts", source, ts.ScriptTarget.Latest));
	return found;
}

function undeclaredSpecifiers(
	source: string,
	dependencies: ReadonlySet<string>,
): string[] {
	return moduleSpecifiers(source).filter((specifier) => {
		if (specifier.startsWith(".") || specifier.startsWith("node:"))
			return false;
		const name = specifier.startsWith("@")
			? specifier.split("/").slice(0, 2).join("/")
			: (specifier.split("/")[0] ?? "");
		return !dependencies.has(name);
	});
}

test("the import check sees every module-specifier form and ignores strings", () => {
	const source = `import a from "a";
import type { b } from "b";
import c = require("c");
export * from "d";
export * as e from "e";
export { f } from "f";
export type { g } from "g";
await import("h");
const text = \`import x from "not-an-import"\`;
import "./relative.ts";
import "node:fs";
import "declared/sub";
import "@scope/declared/sub";
`;
	expect(moduleSpecifiers(source)).toEqual([
		"a",
		"b",
		"c",
		"d",
		"e",
		"f",
		"g",
		"h",
		"./relative.ts",
		"node:fs",
		"declared/sub",
		"@scope/declared/sub",
	]);
	expect(
		undeclaredSpecifiers(source, new Set(["declared", "@scope/declared"])),
	).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
});

test("shipped source imports only node: builtins, declared dependencies and relative paths", async () => {
	const pkg = JSON.parse(
		await readFile(join(packed.installed, "package.json"), "utf8"),
	);
	const dependencies = new Set(Object.keys(pkg.dependencies));
	const sources = packed.files.filter((file) =>
		/^(lib|cli)\/.*\.ts$/.test(file),
	);
	expect(sources.length).toBeGreaterThan(300);
	let scanned = 0;
	const undeclared: string[] = [];
	for (const path of sources) {
		const source = await readFile(join(packed.installed, path), "utf8");
		scanned += moduleSpecifiers(source).length;
		for (const specifier of undeclaredSpecifiers(source, dependencies))
			undeclared.push(`${path}: ${specifier}`);
	}
	expect(scanned).toBeGreaterThan(1000);
	expect(undeclared).toEqual([]);
});

describe("the installed bin", () => {
	test("prints its help", async () => {
		const { stdout } = await cosmonauts(["--help"]);
		expect(stdout).toContain("Usage: cosmonauts");
		expect(stdout).toContain(
			"Host for Cosmonauts agents, chains and domains you supply",
		);
	});

	test("says Drive needs an explicit envelope", async () => {
		const { stdout } = await cosmonauts(["run", "drive", "--help"]);
		expect(stdout.replace(/\s+/g, " ")).toContain(
			"Prompt envelope path (required; Cosmonauts ships no default envelope)",
		);
	});

	test.each([
		"--list-domains",
		"--list-agents",
	])("%s is empty with no content installed", async (flag) => {
		const { stdout, stderr } = await cosmonauts([flag, "--json"]);
		expect(stderr).toBe("");
		expect(JSON.parse(stdout)).toEqual([]);
	});

	test("an unknown agent names the empty available list", async () => {
		await expect(
			cosmonauts(["-a", "unknown", "--print", "hello"]),
		).rejects.toMatchObject({
			code: 1,
			stderr: expect.stringContaining(
				'Unknown agent ID "unknown". Available agents: (none)',
			),
		});
	});
});

test("every export of the installed package imports from the consumer", async () => {
	const installed = JSON.parse(
		await readFile(join(packed.installed, "package.json"), "utf8"),
	);
	expect(installed.exports).toEqual(await repoExports());
	const specifiers = Object.keys(installed.exports).map(
		(key) => `cosmonauts${key.slice(1)}`,
	);
	expect(specifiers).toHaveLength(54);
	const { stdout, stderr } = await runInConsumer(
		"import-all",
		`const failures = [];
for (const specifier of ${JSON.stringify(specifiers)}) {
	try { await import(specifier); } catch (error) { failures.push(specifier + ": " + error.message); }
}
console.log(JSON.stringify(failures));
`,
	);
	expect(stderr).toBe("");
	expect(JSON.parse(stdout)).toEqual([]);
});

test("the consumer resolves exports into the installed copy and rejects private paths", async () => {
	const consumerRequire = createRequire(join(consumer, "entry.js"));
	expect(consumerRequire.resolve("cosmonauts")).toContain(
		join("node_modules", "cosmonauts", "lib", "index.ts"),
	);
	for (const specifier of [
		"cosmonauts/lib/runtime-declarations.ts",
		"cosmonauts/lib/agents/session-assembly.ts",
		"cosmonauts/cli/main.ts",
		"cosmonauts/bin/cosmonauts",
		"cosmonauts/package.json",
	])
		expect(() => consumerRequire.resolve(specifier), specifier).toThrow(
			/not defined by "exports"/,
		);
});

interface ReadmeBlock {
	readonly lang: string;
	readonly body: string;
}

function readmeBlocks(readme: string): ReadmeBlock[] {
	return [...readme.matchAll(/^```(\w*)\n([\s\S]*?)^```$/gm)].map((match) => ({
		lang: match[1] ?? "",
		body: match[2] ?? "",
	}));
}

/** A ts block whose first line is `// <path>` is a file the reader writes. */
function writtenPath(block: ReadmeBlock): string | undefined {
	return block.body.match(/^\/\/ ([\w./-]+\.ts)\n/)?.[1];
}

describe("the README", () => {
	test("names only entry points the package exports, and every short one", async () => {
		const readme = await readFile(join(repoRoot, "README.md"), "utf8");
		const exportsMap = await repoExports();
		const named = new Set(
			[...readme.matchAll(/[`"](cosmonauts(?:\/[\w./-]*[\w])?)[`"]/g)].map(
				(match) => match[1] ?? "",
			),
		);
		for (const specifier of named)
			expect(exportsMap, specifier).toHaveProperty(
				`.${specifier.slice("cosmonauts".length)}`,
			);
		for (const key of Object.keys(exportsMap).filter(
			(key) => !key.startsWith("./lib/"),
		))
			expect(named, key).toContain(`cosmonauts${key.slice(1)}`);
	});

	test("every code block runs against the installed package", async () => {
		const readme = await readFile(join(repoRoot, "README.md"), "utf8");
		const blocks = readmeBlocks(readme);
		expect(blocks.map((block) => block.lang)).toEqual([
			"ts",
			"ts",
			"ts",
			"sh",
			"sh",
		]);
		for (const block of blocks.filter((block) => writtenPath(block))) {
			const path = join(consumer, writtenPath(block) ?? "");
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, block.body);
		}

		const programs = blocks.filter(
			(block) => block.lang === "ts" && !writtenPath(block),
		);
		expect(programs).toHaveLength(1);
		const program = await runInConsumer("readme-0", programs[0]?.body ?? "");
		expect(program.stderr).toBe("");
		expect(program.stdout).toContain('name: "notes/researcher"');
		for (const tool of ["read", "grep", "find", "ls", "remember", "recall"])
			expect(program.stdout).toContain(`"${tool}"`);

		let shellOutput = "";
		for (const block of blocks.filter((block) => block.lang === "sh"))
			for (const line of block.body.split("\n").filter(Boolean)) {
				const { stdout } = await exec("sh", ["-c", line], {
					cwd: consumer,
					env: consumerEnv(),
					timeout: 30_000,
				});
				shellOutput += stdout;
			}
		expect(shellOutput).toContain("ops  Operations helpers");
		expect(shellOutput).toContain("ops/helper  Answers operations questions");
		expect(shellOutput).toContain("You help with deployments.");
		expect(shellOutput).toContain("Created missions/tasks/");
		expect(shellOutput).toContain("No tasks found");
		expect(shellOutput).toContain("No plans found");
	}, 120_000);
});
