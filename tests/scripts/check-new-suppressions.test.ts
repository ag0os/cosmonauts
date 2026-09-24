import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";
import { scanSuppressions } from "../../lib/quality/suppression-policy.ts";

const script = resolve("scripts/check-new-suppressions.ts");
const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function git(root: string, ...args: string[]) {
	const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
	if (result.status !== 0) throw new Error(result.stderr);
	return result.stdout.trim();
}

function write(root: string, path: string, body: string) {
	mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, path), body);
}

function fixture() {
	const root = mkdtempSync(join(tmpdir(), "suppression-check-"));
	roots.push(root);
	git(root, "init", "-q");
	git(root, "config", "user.email", "test@example.com");
	git(root, "config", "user.name", "Test");
	write(root, "lib/a.ts", "export const value = 1;\n");
	write(
		root,
		".cosmonauts/suppression-exceptions.json",
		'{"version":1,"entries":[]}\n',
	);
	git(root, "add", ".");
	git(root, "commit", "-qm", "base");
	return root;
}

function run(root: string) {
	return spawnSync("bun", [script, "--root", root, "--base", "HEAD"], {
		encoding: "utf8",
	});
}

test.each([
	["triple-slash TypeScript", "lib/a.ts", "/// @ts-ignore\nunsafe();\n"],
	["JSDoc TypeScript", "lib/a.ts", "/** @ts-ignore */\nunsafe();\n"],
	["block TypeScript", "lib/a.ts", "/* @ts-expect-error */\nunsafe();\n"],
	[
		"JSX Biome",
		"lib/a.tsx",
		"const view = <div>{/* biome-ignore lint/style/noUnusedTemplateLiteral: reason */}text</div>;\n",
	],
	[
		"block ESLint",
		"lib/a.ts",
		"/* eslint-disable no-console */\nconsole.log(1);\n",
	],
])("script requires base registration for a %s directive", (_name, path, source) => {
	const root = fixture();
	write(root, path, source);
	const result = run(root);
	expect(result.status).toBe(1);
	expect(result.stdout).toContain(`${path}:1: unregistered`);
	write(
		root,
		".cosmonauts/suppression-exceptions.json",
		JSON.stringify({ version: 1, entries: scanSuppressions(path, source) }),
	);
	git(root, "add", ".cosmonauts/suppression-exceptions.json");
	git(root, "commit", "-qm", "authorize");
	expect(run(root).status).toBe(0);
});

test("script rejects a same-change exception because the base registry owns authorization", () => {
	const root = fixture();
	const source = "// @ts-expect-error intentional\nunsafe();\n";
	write(root, "lib/a.ts", source);
	write(
		root,
		".cosmonauts/suppression-exceptions.json",
		JSON.stringify({
			version: 1,
			entries: scanSuppressions("lib/a.ts", source),
		}),
	);
	const result = run(root);
	expect(result.status).toBe(1);
	expect(result.stdout).toContain("lib/a.ts:1");
});

test("script accepts an added directive only when registered in the base revision", () => {
	const root = fixture();
	const source = "// fallow-ignore-next-line complexity\nwork();\n";
	write(
		root,
		".cosmonauts/suppression-exceptions.json",
		JSON.stringify({
			version: 1,
			entries: scanSuppressions("lib/a.ts", source),
		}),
	);
	git(root, "add", ".");
	git(root, "commit", "-qm", "authorize");
	write(root, "lib/a.ts", source);
	const result = run(root);
	expect(result.status).toBe(0);
});

test("script rejects a changed target despite a base registered directive", () => {
	const root = fixture();
	const source = "// @ts-ignore\nold();\n";
	write(root, "lib/a.ts", source);
	write(
		root,
		".cosmonauts/suppression-exceptions.json",
		JSON.stringify({
			version: 1,
			entries: scanSuppressions("lib/a.ts", source),
		}),
	);
	git(root, "add", ".");
	git(root, "commit", "-qm", "authorize");
	write(root, "lib/a.ts", "// @ts-ignore\nnew();\n");
	const result = run(root);
	expect(result.status).toBe(1);
	expect(result.stdout).toContain("lib/a.ts:1");
});
