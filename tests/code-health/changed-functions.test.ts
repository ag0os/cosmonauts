/**
 * Tests for lib/code-health/changed-functions.ts against a real two-commit git
 * fixture and the pinned Fallow binary. Commit 1 holds a legacy function that
 * is already over the absolute cyclomatic limit and a simple function; commit 2
 * raises the simple function's complexity and adds a new one.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
	chmod,
	mkdir,
	readFile,
	rename,
	rm,
	utimes,
	writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import { resolveChangedFunctions } from "../../lib/code-health/changed-functions.ts";
import { resolveFallowExecutable } from "../../lib/code-health/fallow-function-metrics.ts";
import { useTempDir } from "../helpers/fs.ts";

const LEGACY = [
	"export function legacy(input: number): number {",
	"\tlet total = 0;",
	...Array.from(
		{ length: 21 },
		(_, index) => `\tif (input > ${index}) total += ${index};`,
	),
	"\treturn total;",
	"}",
];
const SIMPLE = [
	"export function simple(value: number): number {",
	"\treturn value + 1;",
	"}",
];
const SIMPLE_RAISED = [
	"export function simple(value: number): number {",
	"\tif (value > 10) {",
	"\t\treturn value;",
	"\t}",
	"\treturn value + 1;",
	"}",
];
const ADDED = [
	"export function added(flag: boolean): string {",
	'\treturn flag ? "yes" : "no";',
	"}",
];

function source(...blocks: readonly string[][]): string {
	return `${blocks.map((block) => block.join("\n")).join("\n\n")}\n`;
}

// Line numbers in the commit-2 file: legacy 1-25, simple 27-32, added 34-36.
const SAMPLE = "src/sample.ts";

const tmp = useTempDir("changed-functions-");
const plants = useTempDir("changed-functions-plants-");

function git(...args: string[]): string {
	return execFileSync("git", args, { cwd: tmp.path, encoding: "utf8" });
}

async function writeSource(path: string, content: string): Promise<void> {
	await mkdir(join(tmp.path, "src"), { recursive: true });
	await writeFile(join(tmp.path, path), content);
}

async function commit(message: string): Promise<void> {
	git("add", "-A");
	git("commit", "-q", "--no-verify", "-m", message);
}

function worktreePaths(): string[] {
	return git("worktree", "list", "--porcelain")
		.split("\n")
		.filter((line) => line.startsWith("worktree "))
		.map((line) => line.slice("worktree ".length));
}

/** Register a base worktree the way the resolver names one for `pid`. */
function plantBaseWorktree(pid: number): string {
	const checkout = join(
		plants.path,
		`cosmonauts-changed-functions-${pid}-abc123`,
		"base",
	);
	git("worktree", "add", "--detach", "--quiet", checkout, "HEAD");
	return checkout;
}

function deadPid(): number {
	const { pid } = spawnSync("true");
	if (pid === undefined) throw new Error("could not spawn a process");
	return pid;
}

/** A Fallow wrapper that logs its directory and fails in the base checkout. */
async function fallowFailingInBase(log: string): Promise<string> {
	const wrapper = join(plants.path, "fallow-failing-in-base");
	await writeFile(
		wrapper,
		[
			"#!/bin/sh",
			`pwd -P >> '${log}'`,
			'case "$(pwd -P)" in */cosmonauts-changed-functions-*) exit 3;; esac',
			`exec '${await resolveFallowExecutable()}' "$@"`,
			"",
		].join("\n"),
	);
	await chmod(wrapper, 0o755);
	return wrapper;
}

function resolveAgainst(base: string, file?: string) {
	return resolveChangedFunctions({
		cwd: tmp.path,
		base,
		...(file === undefined ? {} : { file }),
	});
}

describe("resolveChangedFunctions", { timeout: 60_000 }, () => {
	beforeEach(async () => {
		git("init", "-q", "-b", "main");
		git("config", "user.name", "Test");
		git("config", "user.email", "test@example.com");
		git("config", "commit.gpgsign", "false");
		await writeSource(SAMPLE, source(LEGACY, SIMPLE));
		await commit("legacy and simple");
		await writeSource(SAMPLE, source(LEGACY, SIMPLE_RAISED, ADDED));
		await commit("raise simple, add added");
	});

	test("lists exactly the functions inside changed hunks, with their line ranges", async () => {
		const report = await resolveAgainst("HEAD~1");

		expect(
			report.functions.map(({ file, name, startLine, endLine }) => ({
				file,
				name,
				startLine,
				endLine,
			})),
		).toEqual([
			{ file: SAMPLE, name: "simple", startLine: 27, endLine: 32 },
			{ file: SAMPLE, name: "added", startLine: 34, endLine: 36 },
		]);
	});

	test("omits an untouched legacy function even though it exceeds the absolute limit", async () => {
		const report = await resolveAgainst("HEAD~1");

		expect(report.functions.map((fn) => fn.name)).not.toContain("legacy");
	});

	test("flags a function whose complexity rose against its base metrics", async () => {
		const report = await resolveAgainst("HEAD~1");

		expect(report.functions[0]).toMatchObject({
			name: "simple",
			cyclomatic: 2,
			cognitive: 1,
			base: { cyclomatic: 1, cognitive: 0 },
			regressed: true,
		});
	});

	test("reports a new function without base metrics and not regressed", async () => {
		const report = await resolveAgainst("HEAD~1");

		expect(report.functions[1]).toMatchObject({
			name: "added",
			base: null,
			regressed: false,
		});
	});

	test("carries a CRAP score on both sides when Fallow estimates one", async () => {
		const report = await resolveAgainst("HEAD~1");

		expect(report.functions[0]?.crap).toEqual(expect.any(Number));
		expect(report.functions[0]?.base?.crap).toEqual(expect.any(Number));
	});

	test("does not flag an edit that leaves complexity unchanged", async () => {
		await writeSource(
			SAMPLE,
			source(LEGACY, SIMPLE_RAISED, [
				ADDED[0] as string,
				'\treturn flag ? "y" : "n";',
				"}",
			]),
		);

		const report = await resolveAgainst("HEAD");

		expect(report.functions).toEqual([
			expect.objectContaining({
				name: "added",
				base: expect.objectContaining({ cyclomatic: 2, cognitive: 1 }),
				regressed: false,
			}),
		]);
	});

	test("reports a touched legacy function without flagging complexity it already had", async () => {
		await writeSource(
			SAMPLE,
			source(
				LEGACY.map((line) => line.replace("total += 3;", "total += 30;")),
				SIMPLE_RAISED,
				ADDED,
			),
		);

		const report = await resolveAgainst("HEAD");

		expect(report.functions).toEqual([
			expect.objectContaining({
				name: "legacy",
				cyclomatic: 22,
				base: expect.objectContaining({ cyclomatic: 22 }),
				regressed: false,
			}),
		]);
	});

	test("matches repeated names such as <arrow> by position, not by name", async () => {
		const arrows = "src/arrows.ts";
		await writeSource(
			arrows,
			source(["[1].map((x) => x + 1);", "[2].map((y) => y * 2);"]),
		);
		await commit("two arrows");
		await writeSource(
			arrows,
			source([
				"// shifted",
				"[1].map((x) => x + 1);",
				"[2].map((y) => (y > 1 ? y * 2 : 0));",
			]),
		);

		const report = await resolveAgainst("HEAD", arrows);

		expect(report.functions).toEqual([
			expect.objectContaining({
				name: "<arrow>",
				startLine: 3,
				base: expect.objectContaining({ cyclomatic: 1 }),
				cyclomatic: 2,
				regressed: true,
			}),
		]);
	});

	test("sees a same-size edit made in the same second as the index write", async () => {
		// Pin the file and the index to one past second so git's racily-clean
		// recheck is the only thing that can notice the edit; ctime is ignored
		// so the test does not depend on how fast the setup runs.
		git("config", "core.trustctime", "false");
		const pinned = new Date(Date.now() - 3_600_000);
		const file = join(tmp.path, SAMPLE);
		const index = join(tmp.path, ".git", "index");
		await utimes(file, pinned, pinned);
		git("add", "-A");
		await utimes(index, pinned, pinned);
		await writeSource(
			SAMPLE,
			source(LEGACY, SIMPLE_RAISED, [
				"export function added(flag: boolean): string {",
				'\treturn flag ? "yes" : "nu";',
				"}",
			]),
		);
		await utimes(file, pinned, pinned);

		const report = await resolveAgainst("HEAD");

		expect(report.functions.map((fn) => fn.name)).toEqual(["added"]);
	});

	test("includes uncommitted working-tree edits", async () => {
		await writeSource(
			SAMPLE,
			source(
				LEGACY,
				[
					...SIMPLE_RAISED.slice(0, 4),
					"\tif (value < 0) {",
					"\t\treturn 0;",
					"\t}",
					...SIMPLE_RAISED.slice(4),
				],
				ADDED,
			),
		);

		const report = await resolveAgainst("HEAD");

		expect(report.functions).toEqual([
			expect.objectContaining({
				name: "simple",
				base: expect.objectContaining({ cyclomatic: 2 }),
				cyclomatic: 3,
				regressed: true,
			}),
		]);
	});

	test("pairs an untracked rename with its base and flags the regression", async () => {
		const renamed = "src/renamed.ts";
		await writeSource(
			renamed,
			source(
				LEGACY,
				[
					...SIMPLE_RAISED.slice(0, 4),
					"\tif (value < 0) {",
					"\t\treturn 0;",
					"\t}",
					...SIMPLE_RAISED.slice(4),
				],
				ADDED,
			),
		);
		await rm(join(tmp.path, SAMPLE));

		const report = await resolveAgainst("HEAD");

		expect(report.functions).toEqual([
			expect.objectContaining({
				file: renamed,
				name: "simple",
				base: expect.objectContaining({ cyclomatic: 2 }),
				cyclomatic: 3,
				regressed: true,
			}),
		]);
	});

	test("leaves the repository's index and status untouched", async () => {
		await rename(join(tmp.path, SAMPLE), join(tmp.path, "src/moved.ts"));
		await writeSource("src/other.ts", source(["export const other = 1;"]));
		const statusBefore = git("status", "--porcelain");
		const indexBefore = await readFile(join(tmp.path, ".git", "index"));

		await resolveAgainst("HEAD~1");

		expect(await readFile(join(tmp.path, ".git", "index"))).toEqual(
			indexBefore,
		);
		expect(git("status", "--porcelain")).toBe(statusBefore);
	});

	test("reports every function of an untracked file as new", async () => {
		await writeSource(
			"src/other.ts",
			source(["export const other = () => 1;"]),
		);

		const report = await resolveAgainst("HEAD");

		expect(report.functions).toEqual([
			expect.objectContaining({
				file: "src/other.ts",
				name: "other",
				base: null,
			}),
		]);
	});

	test("skips an untracked nested repository that has no commit", async () => {
		await mkdir(join(tmp.path, "vendor", "inner"), { recursive: true });
		execFileSync("git", ["init", "-q"], {
			cwd: join(tmp.path, "vendor", "inner"),
		});
		await writeFile(join(tmp.path, "vendor", "inner", "x.ts"), "export {};\n");
		await writeSource(
			"src/other.ts",
			source(["export const other = () => 1;"]),
		);

		const report = await resolveAgainst("HEAD");

		expect(report.functions.map((fn) => fn.file)).toEqual(["src/other.ts"]);
	});

	test("restricts the report to the requested file", async () => {
		await writeSource(
			"src/other.ts",
			source(["export const other = () => 1;"]),
		);

		const report = await resolveAgainst("HEAD~1", join(tmp.path, SAMPLE));

		expect(report.functions.map((fn) => fn.name)).toEqual(["simple", "added"]);
	});

	test("resolves a relative file against the working directory", async () => {
		const report = await resolveChangedFunctions({
			cwd: join(tmp.path, "src"),
			base: "HEAD~1",
			file: "sample.ts",
		});

		expect(report.functions).toHaveLength(2);
	});

	test("removes the temporary base worktree after the run", async () => {
		await resolveAgainst("HEAD~1");

		expect(
			git("worktree", "list", "--porcelain")
				.split("\n")
				.filter((line) => line.startsWith("worktree ")),
		).toHaveLength(1);
	});

	test("removes the base worktree when Fallow fails inside it", async () => {
		const log = join(plants.path, "fallow-dirs.log");

		await expect(
			resolveChangedFunctions({
				cwd: tmp.path,
				base: "HEAD~1",
				fallowExecutable: await fallowFailingInBase(log),
			}),
		).rejects.toThrow("fallow health failed");

		const baseCheckout = (await readFile(log, "utf8")).trim().split("\n")[1];
		expect(baseCheckout).toMatch(/cosmonauts-changed-functions-/);
		expect(existsSync(dirname(baseCheckout as string))).toBe(false);
		expect(worktreePaths()).toHaveLength(1);
	});

	test("sweeps a base worktree left behind by a dead process", async () => {
		const stale = plantBaseWorktree(deadPid());

		await resolveAgainst("HEAD");

		expect(worktreePaths()).toHaveLength(1);
		expect(existsSync(dirname(stale))).toBe(false);
	});

	test("keeps a base worktree whose process is still running", async () => {
		const live = plantBaseWorktree(process.pid);

		await resolveAgainst("HEAD");

		expect(worktreePaths()).toHaveLength(2);
		expect(existsSync(live)).toBe(true);
		git("worktree", "remove", "--force", live);
	});

	test("records the resolved base commit", async () => {
		const report = await resolveAgainst("HEAD~1");

		expect(report).toMatchObject({
			base: "HEAD~1",
			baseCommit: git("rev-parse", "HEAD~1").trim(),
		});
	});

	test("returns no functions when nothing changed", async () => {
		const report = await resolveAgainst("HEAD");

		expect(report.functions).toEqual([]);
	});

	test("rejects an unknown base revision", async () => {
		await expect(resolveAgainst("no-such-revision")).rejects.toThrow(
			"unknown base revision: no-such-revision",
		);
	});

	test("rejects a file outside the repository", async () => {
		await expect(resolveAgainst("HEAD~1", "../elsewhere.ts")).rejects.toThrow(
			"file is outside the repository",
		);
	});

	test("fails when the Fallow binary cannot run", async () => {
		await expect(
			resolveChangedFunctions({
				cwd: tmp.path,
				base: "HEAD~1",
				fallowExecutable: join(tmp.path, "missing-fallow"),
			}),
		).rejects.toThrow("fallow health failed");
	});
});
