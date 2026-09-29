/**
 * Characterization of the import-form walk inside `scripts/check-reachability.ts`
 * (project-health-audit TASK-777). Each case drives the shipped command over a
 * throwaway project and pins whether the probe module is reported unreachable.
 */

import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const projectRoot = resolve(".");
const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function createProject(mainSource: string): string {
	const root = mkdtempSync(join(tmpdir(), "reachability-visit-"));
	roots.push(root);
	for (const dir of ["lib", "cli", "bin", "missions/architecture"])
		mkdirSync(join(root, dir), { recursive: true });
	writeFileSync(
		join(root, "package.json"),
		'{"type":"module","bin":{"fixture":"bin/fixture"}}',
	);
	writeFileSync(
		join(root, "bin/fixture"),
		'#!/usr/bin/env bun\nimport "../cli/main.ts";\n',
	);
	writeFileSync(join(root, "fallow.toml"), "entry = []\n");
	writeFileSync(
		join(root, "missions/architecture/staged-code.toml"),
		"public = []\n",
	);
	writeFileSync(
		join(root, "lib/probe.ts"),
		"export interface Shape { id: string }\nexport const probe = 1;\n",
	);
	writeFileSync(join(root, "cli/main.ts"), mainSource);
	return root;
}

function run(root: string) {
	return spawnSync("bun", ["scripts/check-reachability.ts", root], {
		cwd: projectRoot,
		encoding: "utf8",
	});
}

describe("reachability walk follows runtime import forms", () => {
	const reached: ReadonlyArray<readonly [string, string]> = [
		["a side-effect import", 'import "../lib/probe.ts";\n'],
		["a default import", 'import probe from "../lib/probe.ts";\nprobe;\n'],
		[
			"a namespace import",
			'import * as probe from "../lib/probe.ts";\nprobe;\n',
		],
		[
			"a named import mixing type and value elements",
			'import { type Shape, probe } from "../lib/probe.ts";\nprobe;\n',
		],
		[
			"a default import beside type-only names",
			'import probe, { type Shape } from "../lib/probe.ts";\nprobe;\n',
		],
		["an export-all declaration", 'export * from "../lib/probe.ts";\n'],
		["a namespace re-export", 'export * as probe from "../lib/probe.ts";\n'],
		[
			"a re-export mixing type and value elements",
			'export { type Shape, probe } from "../lib/probe.ts";\n',
		],
		["a require call", 'require("../lib/probe.ts");\n'],
		["a dynamic import", 'void import("../lib/probe.ts");\n'],
		[
			"a runnerModule string property",
			'export const config = { runnerModule: "../lib/probe.ts" };\n',
		],
		["an import resolved without its extension", 'import "../lib/probe";\n'],
	];

	test.each(reached)("reaches a module through %s", (_label, main) => {
		const result = run(createProject(main));

		expect(result.status).toBe(0);
		expect(result.stdout).not.toContain("unreachable");
		expect(result.stdout).toContain(
			"reachability: 1/1 runtime lib modules reached; 0 type-only lib modules exempt; 0 staged",
		);
	});
});

describe("reachability walk ignores non-runtime references", () => {
	const unreached: ReadonlyArray<readonly [string, string]> = [
		[
			"an import type declaration",
			'import type { Shape } from "../lib/probe.ts";\n',
		],
		["an import type default", 'import type Probe from "../lib/probe.ts";\n'],
		[
			"a named import of only type elements",
			'import { type Shape } from "../lib/probe.ts";\n',
		],
		[
			"an export type declaration",
			'export type { Shape } from "../lib/probe.ts";\n',
		],
		[
			"a re-export of only type elements",
			'export { type Shape } from "../lib/probe.ts";\n',
		],
		["an export type star", 'export type * from "../lib/probe.ts";\n'],
		["a bare package specifier", 'import "probe";\n'],
		["a require call with two arguments", 'require("../lib/probe.ts", {});\n'],
		[
			"a dynamic import of a non-literal",
			'const target = "../lib/probe.ts";\nvoid import(target);\n',
		],
		[
			"a runnerModule property that is not a string literal",
			"export const config = { runnerModule: 5 };\n",
		],
		[
			"a differently named string property",
			'export const config = { module: "../lib/probe.ts" };\n',
		],
		[
			"a relative import that resolves to nothing",
			'import "../lib/absent.ts";\n',
		],
	];

	test.each(unreached)("does not reach a module through %s", (_label, main) => {
		const result = run(createProject(main));

		expect(result.status).toBe(1);
		expect(result.stdout).toContain("unreachable: lib/probe.ts");
		expect(result.stdout).toContain(
			"reachability: 0/1 runtime lib modules reached; 0 type-only lib modules exempt; 0 staged",
		);
	});
});

describe("reachability walk transitivity", () => {
	test("follows imports through an intermediate lib module", () => {
		const root = createProject('import "../lib/middle.ts";\n');
		writeFileSync(
			join(root, "lib/middle.ts"),
			'import { probe } from "./probe.ts";\nexport const middle = probe;\n',
		);

		const result = run(root);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("2/2 runtime lib modules reached");
	});

	test("terminates on an import cycle and still reports the unreached module", () => {
		const root = createProject('import "../lib/left.ts";\n');
		writeFileSync(
			join(root, "lib/left.ts"),
			'import "./right.ts";\nexport const left = 1;\n',
		);
		writeFileSync(
			join(root, "lib/right.ts"),
			'import "./left.ts";\nexport const right = 1;\n',
		);

		const result = run(root);

		expect(result.status).toBe(1);
		expect(result.stdout).toContain("unreachable: lib/probe.ts");
		expect(result.stdout).not.toContain("unreachable: lib/left.ts");
		expect(result.stdout).not.toContain("unreachable: lib/right.ts");
		expect(result.stdout).toContain("2/3 runtime lib modules reached");
	});
});

describe("reachability verdict for the shipped repository", () => {
	test("reaches every runtime lib module under the committed staged-code registry", () => {
		const result = run(projectRoot);
		const registry = readFileSync(
			join(projectRoot, "missions/architecture/staged-code.toml"),
			"utf8",
		);
		const stagedRows = registry.match(/^\[\[staged\]\]/gm)?.length ?? 0;

		expect(result.status).toBe(0);
		expect(result.stdout).not.toContain("unreachable");
		expect(result.stdout.trim()).toMatch(
			new RegExp(
				`^reachability: (\\d+)/\\1 runtime lib modules reached; \\d+ type-only lib modules? exempt; ${stagedRows} staged$`,
			),
		);
	});
});
