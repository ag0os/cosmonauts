import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const projectRoot = resolve(".");
const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function fixture(owner = "plan:future-work") {
	const root = mkdtempSync(join(tmpdir(), "reachability-"));
	roots.push(root);
	for (const dir of [
		"lib",
		"cli",
		"missions/architecture",
		"missions/plans/future-work",
	])
		mkdirSync(join(root, dir), { recursive: true });
	writeFileSync(
		join(root, "package.json"),
		'{"type":"module","bin":{"fixture":"bin/fixture"}}',
	);
	writeFileSync(join(root, "lib/public.ts"), "export const publicValue = 1;\n");
	writeFileSync(join(root, "lib/staged.ts"), "export const stagedValue = 1;\n");
	writeFileSync(join(root, "lib/orphan.ts"), "export const orphanValue = 1;\n");
	writeFileSync(join(root, "cli/main.ts"), "export const main = 1;\n");
	mkdirSync(join(root, "bin"), { recursive: true });
	writeFileSync(
		join(root, "bin/fixture"),
		'#!/usr/bin/env bun\nimport "../cli/main.ts";\n',
	);
	writeFileSync(
		join(root, "fallow.toml"),
		'entry = ["lib/public.ts", "lib/staged.ts"]\n',
	);
	writeFileSync(
		join(root, "missions/architecture/staged-code.toml"),
		`public = ["lib/public.ts"]\n[[staged]]\npath = "lib/staged.ts"\nowner = "${owner}"\n`,
	);
	writeFileSync(
		join(root, "missions/plans/future-work/plan.md"),
		"---\nstatus: active\n---\n",
	);
	return { root };
}

function write(root: string, path: string, content: string) {
	mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, path), content);
}

function run(root: string) {
	return spawnSync("bun", ["run", "check:reachability", root], {
		cwd: projectRoot,
		encoding: "utf8",
	});
}

describe("reachability command", () => {
	test("reports an unimported lib module while accepting public and live staged roots", () => {
		const { root } = fixture();
		const result = run(root);
		expect(result.status).toBe(1);
		expect(result.stdout).toContain("lib/orphan.ts");
		expect(result.stdout).not.toContain("lib/staged.ts");
	});

	test("rejects an archived staged owner through the command", () => {
		const { root } = fixture();
		rmSync(join(root, "missions/plans/future-work"), { recursive: true });
		mkdirSync(join(root, "missions/archive/plans/future-work"), {
			recursive: true,
		});
		writeFileSync(
			join(root, "missions/archive/plans/future-work/plan.md"),
			"---\nstatus: completed\n---\n",
		);
		const result = run(root);
		expect(result.status).toBe(1);
		expect(result.stdout).toContain("plan:future-work");
		expect(result.stdout).toContain("archived or absent");
	});

	test("rejects an absent staged owner through the command", () => {
		const { root } = fixture("plan:does-not-exist");
		const result = run(root);
		expect(result.stdout).toContain(
			"staged owner archived or absent: lib/staged.ts -> plan:does-not-exist",
		);
	});

	test("accepts an exact roadmap heading as a staged owner", () => {
		const { root } = fixture("roadmap:Future work");
		writeFileSync(join(root, "ROADMAP.md"), "## Ideas\n\n### Future work\n");
		const result = run(root);
		expect(result.stdout).not.toContain("staged owner archived or absent");
		expect(result.stdout).toContain("unreachable: lib/orphan.ts");
	});

	test("does not treat a type-only import as runtime reachability", () => {
		const { root } = fixture();
		writeFileSync(
			join(root, "lib/run-loop.ts"),
			"export interface Loop { id: string }\nexport function run() { return 1; }\n",
		);
		writeFileSync(
			join(root, "cli/main.ts"),
			'import type { Loop } from "../lib/run-loop.ts";\nexport const id: Loop = { id: "one" };\n',
		);
		const result = run(root);
		expect(result.stdout).toContain("unreachable: lib/run-loop.ts");
	});

	test("does not treat a CLI module that no bin entry reaches as a root", () => {
		const { root } = fixture();
		writeFileSync(
			join(root, "lib/only-dead-cli.ts"),
			"export function used() { return 1; }\n",
		);
		writeFileSync(
			join(root, "cli/dead-command.ts"),
			'import { used } from "../lib/only-dead-cli.ts";\nexport const x = used();\n',
		);
		const result = run(root);
		expect(result.stdout).toContain("unreachable: lib/only-dead-cli.ts");
	});

	test("rejects an entry outside the public and staged declarations", () => {
		const { root } = fixture();
		writeFileSync(
			join(root, "fallow.toml"),
			'entry = ["lib/public.ts", "lib/staged.ts", "lib/orphan.ts"]\n',
		);
		const result = run(root);
		expect(result.status).toBe(1);
		expect(result.stdout).toContain("undeclared entry: lib/orphan.ts");
	});

	test("rejects a declared staged path absent from Fallow entry", () => {
		const { root } = fixture();
		writeFileSync(join(root, "fallow.toml"), 'entry = ["lib/public.ts"]\n');
		const result = run(root);
		expect(result.stdout).toContain("missing entry: lib/staged.ts");
	});
	test("rejects a staged owner whose plan is still present but completed", () => {
		const { root } = fixture();
		writeFileSync(
			join(root, "missions/plans/future-work/plan.md"),
			"---\nstatus: completed\n---\n",
		);
		const result = run(root);
		expect(result.stdout).toContain(
			"staged owner archived or absent: lib/staged.ts -> plan:future-work",
		);
	});

	test("reaches a lib module through a bin script and the CLI module it imports", () => {
		const { root } = fixture();
		write(root, "lib/cli-dep.ts", "export function dep() { return 1; }\n");
		write(
			root,
			"cli/main.ts",
			'import { dep } from "../lib/cli-dep.ts";\nexport const main = dep();\n',
		);
		const result = run(root);
		expect(result.stdout).toContain("unreachable: lib/orphan.ts");
		expect(result.stdout).not.toContain("lib/cli-dep.ts");
	});

	test("reaches a lib module named as a bun build --compile entry in package scripts", () => {
		const { root } = fixture();
		write(
			root,
			"package.json",
			JSON.stringify({
				type: "module",
				bin: { fixture: "bin/fixture" },
				scripts: {
					compile: "bun build --compile lib/step.ts --outfile bin/step",
				},
			}),
		);
		write(root, "lib/step.ts", "export function step() { return 1; }\n");
		const result = run(root);
		expect(result.stdout).toContain("unreachable: lib/orphan.ts");
		expect(result.stdout).not.toContain("lib/step.ts");
	});

	test("reaches a module named by a runnerModule property", () => {
		const { root } = fixture();
		write(
			root,
			"lib/public.ts",
			'export const runner = { runnerModule: "./runner.ts" };\n',
		);
		write(root, "lib/runner.ts", "export function runIt() { return 1; }\n");
		const result = run(root);
		expect(result.stdout).toContain("unreachable: lib/orphan.ts");
		expect(result.stdout).not.toContain("lib/runner.ts");
	});

	test("reaches a lib module through a dynamic import", () => {
		const { root } = fixture();
		write(root, "lib/lazy.ts", "export function lazy() { return 1; }\n");
		write(
			root,
			"cli/main.ts",
			'export async function main() { return import("../lib/lazy.ts"); }\n',
		);
		const result = run(root);
		expect(result.stdout).toContain("unreachable: lib/orphan.ts");
		expect(result.stdout).not.toContain("lib/lazy.ts");
	});

	test("reaches a lib module through a domain agent definition", () => {
		const { root } = fixture();
		write(root, "lib/agent-dep.ts", "export const agentDep = 1;\n");
		write(
			root,
			"domains/example/agents/helper.ts",
			'import { agentDep } from "../../../lib/agent-dep.ts";\nexport default { id: agentDep };\n',
		);
		const result = run(root);
		expect(result.stdout).toContain("unreachable: lib/orphan.ts");
		expect(result.stdout).not.toContain("lib/agent-dep.ts");
	});

	test("reaches a lib module through a domain extension entry", () => {
		const { root } = fixture();
		write(root, "lib/extension-dep.ts", "export const extensionDep = 1;\n");
		write(
			root,
			"domains/example/extensions/tools/index.ts",
			'import { extensionDep } from "../../../../lib/extension-dep.ts";\nexport default () => extensionDep;\n',
		);
		const result = run(root);
		expect(result.stdout).toContain("unreachable: lib/orphan.ts");
		expect(result.stdout).not.toContain("lib/extension-dep.ts");
	});

	test("reaches lib modules through a domain manifest and its chains", () => {
		const { root } = fixture();
		write(root, "lib/manifest-dep.ts", "export const manifestDep = 1;\n");
		write(root, "lib/chains-dep.ts", "export const chainsDep = 1;\n");
		write(
			root,
			"domains/example/domain.ts",
			'import { manifestDep } from "../../lib/manifest-dep.ts";\nexport default { id: manifestDep };\n',
		);
		write(
			root,
			"domains/example/chains.ts",
			'import { chainsDep } from "../../lib/chains-dep.ts";\nexport default [chainsDep];\n',
		);
		const result = run(root);
		expect(result.stdout).toContain("unreachable: lib/orphan.ts");
		expect(result.stdout).not.toContain("lib/manifest-dep.ts");
		expect(result.stdout).not.toContain("lib/chains-dep.ts");
	});

	test("does not report an unreached module that holds only types", () => {
		const { root } = fixture();
		write(
			root,
			"lib/shapes.ts",
			"export interface Shape { id: string }\nexport type Id = string;\n",
		);
		const result = run(root);
		expect(result.stdout).toContain("unreachable: lib/orphan.ts");
		expect(result.stdout).not.toContain("lib/shapes.ts");
	});
});
