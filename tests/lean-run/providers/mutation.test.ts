/**
 * Tests for the scoped mutation provider (lib/lean-run/providers/mutation.ts):
 * report aggregation, test tiering and the deny-list, and the provider end to
 * end against a stand-in Stryker that writes a canned report.
 *
 * The real-Stryker acceptance cases (the f2d6242c sample and a fully killed
 * temp project) take about 10 s together; the sample case skips when that
 * commit is not in the local history, as in a shallow clone.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
	chmod,
	mkdir,
	readFile,
	realpath,
	symlink,
	writeFile,
} from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { FileGraph } from "../../../lib/architecture-map/types.ts";
import {
	type ChangedFunctionRange,
	createMutationProvider,
	mutateArguments,
	summarizeMutationReport,
} from "../../../lib/lean-run/providers/mutation.ts";
import {
	type CoverageInput,
	coveringTests,
	DEFAULT_SANDBOX_UNSAFE_TESTS,
	isSandboxUnsafeTest,
	mirroredTestPath,
	selectMutationTests,
	type TestSelectionInput,
	untestableFiles,
} from "../../../lib/lean-run/providers/mutation-tests.ts";
import { unavailableReason } from "../../../lib/lean-run/signal-availability.ts";
import type { Signal, SignalContext } from "../../../lib/lean-run/types.ts";
import type {
	ChildRunOutcome,
	RunChildOptions,
} from "../../../lib/process/run-child.ts";
import { runChild } from "../../../lib/process/run-child.ts";
import { useTempDir } from "../../helpers/fs.ts";

const REPOSITORY_ROOT = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../../..",
);

interface MutantSpec {
	readonly id: string;
	readonly status: string;
	readonly line: number;
	readonly coveredBy?: readonly string[];
	readonly killedBy?: readonly string[];
}

function mutant(spec: MutantSpec): Record<string, unknown> {
	return {
		id: spec.id,
		mutatorName: "ConditionalExpression",
		replacement: "true",
		status: spec.status,
		coveredBy: spec.coveredBy ?? [],
		killedBy: spec.killedBy ?? [],
		location: {
			start: { line: spec.line, column: 3 },
			end: { line: spec.line, column: 20 },
		},
	};
}

function report(
	files: Record<string, readonly MutantSpec[]>,
	testFiles: Record<string, readonly string[]> = {},
): Record<string, unknown> {
	return {
		schemaVersion: "1.0",
		thresholds: { high: 80, low: 60 },
		files: Object.fromEntries(
			Object.entries(files).map(([path, mutants]) => [
				path,
				{ language: "typescript", source: "", mutants: mutants.map(mutant) },
			]),
		),
		testFiles: Object.fromEntries(
			Object.entries(testFiles).map(([path, ids]) => [
				path,
				{ tests: ids.map((id) => ({ id, name: `test ${id}` })) },
			]),
		),
	};
}

const OUTER: ChangedFunctionRange = {
	file: "lib/calc.ts",
	name: "outer",
	startLine: 10,
	endLine: 30,
};
const INNER: ChangedFunctionRange = {
	file: "lib/calc.ts",
	name: "<arrow>",
	startLine: 15,
	endLine: 20,
};

describe("summarizeMutationReport", () => {
	test("counts a survivor inside a changed function against that function", () => {
		const summary = summarizeMutationReport(
			report({ "lib/calc.ts": [{ id: "1", status: "Survived", line: 12 }] }),
			[OUTER],
		);

		expect(summary.functions[0]).toMatchObject({ survived: 1, mutants: 1 });
		expect(summary.functions[0]?.survivors).toEqual([
			{
				id: "1",
				mutator: "ConditionalExpression",
				replacement: "true",
				startLine: 12,
				endLine: 12,
			},
		]);
	});

	test("keeps a survivor outside every changed function out of the in-range counts", () => {
		const summary = summarizeMutationReport(
			report({ "lib/calc.ts": [{ id: "1", status: "Survived", line: 40 }] }),
			[OUTER],
		);

		expect(summary.inRange.survived).toBe(0);
		expect(summary.outsideRange).toMatchObject({ survived: 1, mutants: 1 });
	});

	test("counts a timeout as a separate detected outcome, not a survivor", () => {
		const summary = summarizeMutationReport(
			report({ "lib/calc.ts": [{ id: "1", status: "Timeout", line: 12 }] }),
			[OUTER],
		);

		expect(summary.inRange).toMatchObject({ timeout: 1, survived: 0 });
	});

	test("reports NoCoverage mutants apart from survivors", () => {
		const summary = summarizeMutationReport(
			report({ "lib/calc.ts": [{ id: "1", status: "NoCoverage", line: 12 }] }),
			[OUTER],
		);

		expect(summary.inRange).toMatchObject({ noCoverage: 1, survived: 0 });
		expect(summary.functions[0]?.uncovered.map((entry) => entry.id)).toEqual([
			"1",
		]);
	});

	test("does not count Ignored mutants", () => {
		const summary = summarizeMutationReport(
			report({ "lib/calc.ts": [{ id: "1", status: "Ignored", line: 12 }] }),
			[OUTER],
		);

		expect(summary.inRange.mutants).toBe(0);
	});

	test("attributes a mutant to the innermost changed function that holds it", () => {
		const summary = summarizeMutationReport(
			report({ "lib/calc.ts": [{ id: "1", status: "Killed", line: 16 }] }),
			[OUTER, INNER],
		);

		expect(summary.functions.map((fn) => fn.killed)).toEqual([0, 1]);
	});

	test("blames neither of two test files that both killed the same mutant", () => {
		const summary = summarizeMutationReport(
			report(
				{
					"lib/calc.ts": [
						{
							id: "1",
							status: "Killed",
							line: 12,
							coveredBy: ["0", "1"],
							killedBy: ["0", "1"],
						},
					],
				},
				{ "tests/a.test.ts": ["0"], "tests/b.test.ts": ["1"] },
			),
			[OUTER],
		);

		expect(summary.testFilesKillingNothing).toEqual([]);
	});

	test("lists a test file that covered in-range mutants but detected none", () => {
		const summary = summarizeMutationReport(
			report(
				{
					"lib/calc.ts": [
						{
							id: "1",
							status: "Killed",
							line: 12,
							coveredBy: ["0", "1"],
							killedBy: ["0"],
						},
						{ id: "2", status: "Survived", line: 13, coveredBy: ["1"] },
					],
				},
				{ "tests/strong.test.ts": ["0"], "tests/weak.test.ts": ["1"] },
			),
			[OUTER],
		);

		expect(summary.testFilesKillingNothing).toEqual(["tests/weak.test.ts"]);
	});

	test("does not blame a test file whose covered mutant timed out", () => {
		const summary = summarizeMutationReport(
			report(
				{
					"lib/calc.ts": [
						{ id: "1", status: "Timeout", line: 12, coveredBy: ["0"] },
					],
				},
				{ "tests/calc.test.ts": ["0"] },
			),
			[OUTER],
		);

		expect(summary.testFilesKillingNothing).toEqual([]);
	});

	test("makes absolute report paths relative to the project root", () => {
		const summary = summarizeMutationReport(
			report({
				"/work/lib/calc.ts": [{ id: "1", status: "Killed", line: 12 }],
			}),
			[OUTER],
			{ projectRoot: "/work" },
		);

		expect(summary.inRange.killed).toBe(1);
	});

	test("rejects a value that is not a Stryker report", () => {
		expect(() => summarizeMutationReport({ mutants: [] }, [OUTER])).toThrow(
			"not a Stryker mutation report",
		);
	});
});

describe("mutateArguments", () => {
	test("merges nested ranges in one file into one Stryker range", () => {
		expect(mutateArguments([INNER, OUTER])).toEqual(["lib/calc.ts:10-30"]);
	});

	test("keeps disjoint ranges and files apart", () => {
		expect(
			mutateArguments([
				{ file: "lib/b.ts", name: "b", startLine: 1, endLine: 3 },
				{ file: "lib/a.ts", name: "a2", startLine: 9, endLine: 12 },
				{ file: "lib/a.ts", name: "a1", startLine: 1, endLine: 4 },
			]),
		).toEqual(["lib/a.ts:1-4", "lib/a.ts:9-12", "lib/b.ts:1-3"]);
	});
});

function graph(
	nodes: Record<string, "source" | "test">,
	edges: readonly [from: string, to: string, typeOnly?: boolean][],
): FileGraph {
	return {
		schemaVersion: 1,
		projectHash: "p",
		graphHash: "g",
		nodes: Object.entries(nodes).map(([path, kind]) => ({
			path,
			kind,
			exports: [],
		})),
		edges: edges.map(([from, to, typeOnly]) => ({
			from,
			to,
			weight: 1,
			typeOnly: typeOnly ?? false,
		})),
	};
}

const GRAPH = graph(
	{
		"lib/calc.ts": "source",
		"lib/user.ts": "source",
		"lib/types-only.ts": "source",
		"tests/calc-direct.test.ts": "test",
		"tests/user.test.ts": "test",
		"tests/user-extra.test.ts": "test",
		"tests/types-only.test.ts": "test",
	},
	[
		["tests/calc-direct.test.ts", "lib/calc.ts"],
		["lib/user.ts", "lib/calc.ts"],
		["lib/types-only.ts", "lib/calc.ts", true],
		["tests/user-extra.test.ts", "lib/user.ts"],
		["tests/types-only.test.ts", "lib/types-only.ts"],
	],
);

function selection(overrides: Partial<TestSelectionInput> = {}) {
	return selectMutationTests({
		sourceFiles: ["lib/calc.ts"],
		changedFiles: ["lib/calc.ts"],
		graph: GRAPH,
		includeTier2: true,
		maxTests: 10,
		exists: () => true,
		isDenied: () => false,
		...overrides,
	});
}

describe("selectMutationTests", () => {
	test("puts the mirrored test and direct test importers in tier 1", () => {
		expect(selection().tier1).toEqual([
			"tests/calc.test.ts",
			"tests/calc-direct.test.ts",
		]);
	});

	test("puts changed spec files first in tier 1", () => {
		const tests = selection({
			changedFiles: ["lib/calc.ts", "tests/new.test.ts"],
		});

		expect(tests.tier1).toEqual([
			"tests/new.test.ts",
			"tests/calc.test.ts",
			"tests/calc-direct.test.ts",
		]);
	});

	test("never selects a changed helper or fixture under tests/", () => {
		const tests = selection({
			changedFiles: [
				"lib/calc.ts",
				"tests/helpers.ts",
				"tests/fixtures/a.json",
			],
			blastRadiusTests: ["tests/helpers/fs.ts"],
		});

		expect(tests.selected).not.toContain("tests/helpers.ts");
		expect(tests.selected).not.toContain("tests/fixtures/a.json");
		expect(tests.selected).not.toContain("tests/helpers/fs.ts");
	});

	test("puts blast-radius tests in tier 2 after the importers' tests", () => {
		const tests = selection({
			blastRadiusTests: ["tests/blast.test.ts", "tests/calc.test.ts"],
		});

		expect(tests.tier1).toEqual([
			"tests/calc.test.ts",
			"tests/calc-direct.test.ts",
		]);
		expect(tests.tier2).toEqual([
			"tests/user.test.ts",
			"tests/user-extra.test.ts",
			"tests/blast.test.ts",
		]);
	});

	describe("with a blast radius of fifty tests", () => {
		const blastRadiusTests = Array.from(
			{ length: 50 },
			(_, index) => `tests/wide/t${String(index).padStart(2, "0")}.test.ts`,
		);

		test("keeps tier 1 to the changed file's own tests when the budget excludes tier 2", () => {
			const tests = selection({
				blastRadiusTests,
				includeTier2: false,
				maxTests: 20,
			});

			expect(tests.selected).toEqual([
				"tests/calc.test.ts",
				"tests/calc-direct.test.ts",
			]);
			expect(tests.skipped).toHaveLength(52);
		});

		test("caps the whole selection at maxTests when tier 2 runs", () => {
			const tests = selection({ blastRadiusTests, maxTests: 20 });

			expect(tests.tier1).toHaveLength(2);
			expect(tests.tier2.slice(0, 2)).toEqual([
				"tests/user.test.ts",
				"tests/user-extra.test.ts",
			]);
			expect(tests.selected).toHaveLength(20);
			expect(tests.skipped).toHaveLength(34);
		});
	});

	test("falls back to mirrored tests alone without a graph", () => {
		const tests = selection({ graph: undefined });

		expect(tests.selected).toEqual(["tests/calc.test.ts"]);
	});

	test("puts tests of runtime source importers in tier 2, skipping type-only ones", () => {
		expect(selection().tier2).toEqual([
			"tests/user.test.ts",
			"tests/user-extra.test.ts",
		]);
	});

	test("leaves tier 2 empty when the budget does not allow it", () => {
		const tests = selection({ includeTier2: false });

		expect(tests.tier2).toEqual([]);
		expect(tests.skipped).toEqual([
			"tests/user.test.ts",
			"tests/user-extra.test.ts",
		]);
	});

	test("caps tier 2 at maxTests and reports the rest as skipped", () => {
		const tests = selection({ maxTests: 3 });

		expect(tests.selected).toHaveLength(3);
		expect(tests.skipped).toEqual(["tests/user-extra.test.ts"]);
	});

	test("caps tier 1 at maxTests too and reports the rest as skipped", () => {
		const tests = selection({ maxTests: 1 });

		expect(tests.selected).toEqual(["tests/calc.test.ts"]);
		expect(tests.skipped).toEqual([
			"tests/calc-direct.test.ts",
			"tests/user.test.ts",
			"tests/user-extra.test.ts",
		]);
	});

	test("drops test files that do not exist", () => {
		const tests = selection({
			exists: (path) => path !== "tests/calc.test.ts",
		});

		expect(tests.tier1).toEqual(["tests/calc-direct.test.ts"]);
	});

	test("removes denied tests from both tiers and reports them", () => {
		const denied = new Set(["tests/calc-direct.test.ts", "tests/user.test.ts"]);
		const tests = selection({ isDenied: (path) => denied.has(path) });

		expect(tests.selected).toEqual([
			"tests/calc.test.ts",
			"tests/user-extra.test.ts",
		]);
		expect(tests.denied).toEqual([
			"tests/calc-direct.test.ts",
			"tests/user.test.ts",
		]);
	});
});

describe("isSandboxUnsafeTest", () => {
	// Assembled so this file does not match the clone pattern itself.
	const cloneCall = [
		"execFileSync(",
		'"git", ["',
		"cl",
		"one",
		'", root])',
	].join("");

	test("flags a deny-listed path", () => {
		expect(
			isSandboxUnsafeTest({
				path: "tests/a.test.ts",
				content: "",
				denyList: ["tests/a.test.ts"],
			}),
		).toBe(true);
	});

	test("flags a test that clones a repository", () => {
		expect(
			isSandboxUnsafeTest({
				path: "tests/a.test.ts",
				content: cloneCall,
				denyList: [],
			}),
		).toBe(true);
	});

	test("flags a test that adds a git worktree", () => {
		const worktreeAdd = ['gitIn(root, "work', 'tree", "a', 'dd", path)'].join(
			"",
		);

		expect(
			isSandboxUnsafeTest({
				path: "tests/a.test.ts",
				content: worktreeAdd,
				denyList: [],
			}),
		).toBe(true);
	});

	test("matches a deny-list entry ending in * as a prefix", () => {
		expect(
			isSandboxUnsafeTest({
				path: "tests/config/biome-extra.test.ts",
				content: "",
				denyList: ["tests/config/biome*"],
			}),
		).toBe(true);
	});

	test("denies the tests that run git against their own checkout by default", () => {
		const denied = [
			"tests/orchestration/quality-review-repository-pins.test.ts",
			"tests/config/biome.test.ts",
			"tests/lean-run/providers/mutation.test.ts",
		].filter((path) =>
			isSandboxUnsafeTest({
				path,
				content: "",
				denyList: DEFAULT_SANDBOX_UNSAFE_TESTS,
			}),
		);

		expect(denied).toHaveLength(3);
	});

	test("accepts a test that does neither", () => {
		expect(
			isSandboxUnsafeTest({
				path: "tests/a.test.ts",
				content: 'expect(add(1, 2)).toBe(3); // "before any cloning"',
				denyList: [],
			}),
		).toBe(false);
	});

	describe("with git aimed at a temp fixture", () => {
		const worktreeAdd = ['git("work', 'tree", "a', 'dd", "--detach", target);'];
		const fixture = [
			'const root = await mkdtemp(join(tmpdir(), "repo-"));',
			'const git = (...args) => execFileSync("git", args, { cwd: root });',
			'git("init", "-q");',
			worktreeAdd.join(""),
		].join("\n");

		test("accepts a test that initializes a temp fixture and launches git only with a cwd", () => {
			expect(
				isSandboxUnsafeTest({
					path: "tests/a.test.ts",
					content: fixture,
					denyList: [],
				}),
			).toBe(false);
		});

		test("accepts a fixture made through the useTempDir helper", () => {
			const content = [
				'const tmp = useTempDir("changed-functions-");',
				"function git(...args: string[]): string {",
				'\treturn execFileSync("git", args, {',
				"\t\tcwd: tmp.path,",
				'\t\tencoding: "utf8",',
				"\t});",
				"}",
				'git("init", "-q");',
				worktreeAdd.join(""),
			].join("\n");

			expect(
				isSandboxUnsafeTest({ path: "tests/a.test.ts", content, denyList: [] }),
			).toBe(false);
		});

		test("accepts git's -C as the explicit working directory", () => {
			const content = [
				'const root = await mkdtemp(join(tmpdir(), "repo-"));',
				'execFileSync("git", ["-C", root, "init"]);',
				[
					'execFileSync("git", ["-C", root, "work',
					'tree", "a',
					'dd", t]);',
				].join(""),
			].join("\n");

			expect(
				isSandboxUnsafeTest({ path: "tests/a.test.ts", content, denyList: [] }),
			).toBe(false);
		});

		// From the Stryker sandbox, this adds a worktree to the live checkout.
		test("flags a worktree add whose git launch names no working directory", () => {
			const content = [
				'const fixture = await mkdtemp(join(tmpdir(), "repo-"));',
				'execFileSync("git", ["init", "-q"], { cwd: fixture });',
				[
					'execFileSync("git", ["work',
					'tree", "a',
					'dd", "--detach", fixture]);',
				].join(""),
			].join("\n");

			expect(
				isSandboxUnsafeTest({ path: "tests/a.test.ts", content, denyList: [] }),
			).toBe(true);
		});

		test("flags a fixture the test never initializes as a repository", () => {
			const content = fixture.replace('git("init", "-q");', "");

			expect(
				isSandboxUnsafeTest({ path: "tests/a.test.ts", content, denyList: [] }),
			).toBe(true);
		});

		test("flags a test that runs git only through a helper it imports", () => {
			const content = [
				'import { gitIn } from "../helpers/git.ts";',
				'const root = await mkdtemp(join(tmpdir(), "repo-"));',
				'gitIn(root, "init");',
				['gitIn(root, "work', 'tree", "a', 'dd", target);'].join(""),
			].join("\n");

			expect(
				isSandboxUnsafeTest({ path: "tests/a.test.ts", content, denyList: [] }),
			).toBe(true);
		});

		test("flags it when the test also names the checkout it lives in", () => {
			for (const root of [
				"process.cwd()",
				"process.env.PWD",
				'resolve(".")',
				"fileURLToPath(import.meta.url)",
				"__dirname",
			]) {
				expect(
					isSandboxUnsafeTest({
						path: "tests/a.test.ts",
						content: `${fixture}\nconst here = ${root};`,
						denyList: [],
					}),
				).toBe(true);
			}
		});

		test("still flags a deny-listed path", () => {
			expect(
				isSandboxUnsafeTest({
					path: "tests/a.test.ts",
					content: fixture,
					denyList: ["tests/a.test.ts"],
				}),
			).toBe(true);
		});

		test("accepts the fixture tests in this repository, the resolver test live run 1 denied among them", async () => {
			const paths = [
				"tests/code-health/changed-functions.test.ts",
				"tests/lean-run/base-sha.test.ts",
				"tests/lean-run/run-build.test.ts",
				"tests/orchestration/quality-review-workspace.test.ts",
			];
			const unsafe: string[] = [];
			for (const path of paths) {
				const content = await readFile(join(REPOSITORY_ROOT, path), "utf8");
				if (
					isSandboxUnsafeTest({
						path,
						content,
						denyList: DEFAULT_SANDBOX_UNSAFE_TESTS,
					})
				)
					unsafe.push(path);
			}

			expect(unsafe).toEqual([]);
		});
	});
});

describe("untestableFiles", () => {
	function coverage(overrides: Partial<CoverageInput> = {}): CoverageInput {
		return {
			sourceFiles: ["lib/calc.ts"],
			graph: GRAPH,
			exists: () => true,
			isDenied: () => false,
			...overrides,
		};
	}

	// tests/user-extra.test.ts reaches lib/calc.ts only through lib/user.ts.
	test("covers a file with its mirrored test and direct test importers only", () => {
		expect(coveringTests("lib/calc.ts", coverage())).toEqual([
			"tests/calc-direct.test.ts",
			"tests/calc.test.ts",
		]);
	});

	test("lists a file whose every covering test is denied, with those tests", () => {
		expect(untestableFiles(coverage({ isDenied: () => true }))).toEqual([
			{
				file: "lib/calc.ts",
				covering: ["tests/calc-direct.test.ts", "tests/calc.test.ts"],
			},
		]);
	});

	test("lists a file whose only direct test is denied, though an indirect importer's test is not", () => {
		const isDenied = (path: string) => path === "tests/calc-direct.test.ts";

		expect(
			untestableFiles(
				coverage({
					exists: (path) => path !== "tests/calc.test.ts",
					isDenied,
				}),
			),
		).toEqual([
			{ file: "lib/calc.ts", covering: ["tests/calc-direct.test.ts"] },
		]);
	});

	test("does not list a file with one direct test that can still run", () => {
		const isDenied = (path: string) => path !== "tests/calc-direct.test.ts";

		expect(untestableFiles(coverage({ isDenied }))).toEqual([]);
	});

	test("does not list a file with no covering test at all", () => {
		expect(
			untestableFiles(coverage({ exists: () => false, isDenied: () => true })),
		).toEqual([]);
	});
});

describe("mirroredTestPath", () => {
	test("drops the lib/ root", () => {
		expect(mirroredTestPath("lib/driver/runtime-helpers.ts")).toBe(
			"tests/driver/runtime-helpers.test.ts",
		);
	});

	test("keeps any other root", () => {
		expect(mirroredTestPath("cli/drive/run.ts")).toBe(
			"tests/cli/drive/run.test.ts",
		);
	});
});

const CALC_BASE = [
	"export function add(a: number, b: number): number {",
	"\treturn a + b;",
	"}",
	"",
	"export function double(value: number): number {",
	"\treturn value * 2;",
	"}",
	"",
].join("\n");

// The edit changes the file's size: git trusts a same-size file whose stat
// matches the index, and the edit lands within the second of the commit.
const CALC_CHANGED = CALC_BASE.replace(
	"\treturn a + b;",
	"\tconst sum = a + b;\n\treturn sum;",
);

const CALC_TEST = [
	'import { expect, test } from "vitest";',
	'import { add, double } from "../lib/calc.ts";',
	"",
	'test("adds", () => {',
	"\texpect(add(2, 3)).toBe(5);",
	"});",
	"",
	'test("doubles", () => {',
	"\texpect(double(4)).toBe(8);",
	"});",
	"",
].join("\n");

function context(
	worktree: string,
	overrides: Partial<SignalContext> = {},
): SignalContext {
	return {
		worktree,
		baseSha: "HEAD",
		plan: {
			title: "t",
			approach: "",
			touches: [],
			reuses: [],
			behaviors: [],
			risks: [],
			raw: "",
		},
		envelope: { outcome: "done" },
		changedFiles: ["lib/calc.ts"],
		budget: { tokens: 0, timeMs: 60_000 },
		runDir: join(worktree, ".run"),
		...overrides,
	};
}

function gitIn(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8" });
}

/** A two-function project committed at HEAD, with `add` edited in the working tree. */
async function initCalcProject(root: string): Promise<void> {
	gitIn(root, "init", "-q", "-b", "main");
	gitIn(root, "config", "user.name", "Test");
	gitIn(root, "config", "user.email", "test@example.com");
	gitIn(root, "config", "commit.gpgsign", "false");
	await mkdir(join(root, "lib"));
	await mkdir(join(root, "tests"));
	await writeFile(join(root, "lib/calc.ts"), CALC_BASE);
	await writeFile(join(root, "tests/calc.test.ts"), CALC_TEST);
	gitIn(root, "add", "-A");
	gitIn(root, "commit", "-q", "--no-verify", "-m", "calc");
	await writeFile(join(root, "lib/calc.ts"), CALC_CHANGED);
}

/** A stand-in Stryker script: records its argv and env, then runs `body`. */
async function writeFake(
	dir: string,
	body: readonly string[],
): Promise<string> {
	const bin = join(dir, "fake-stryker.mjs");
	await writeFile(
		bin,
		[
			"#!/usr/bin/env node",
			'import { spawn, spawnSync } from "node:child_process";',
			'import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";',
			"const here = new URL('.', import.meta.url).pathname;",
			"mkdirSync('.stryker-tmp/sandbox-1', { recursive: true });",
			// What a test that runs git in the sandbox without a cwd would find.
			"const toplevel = spawnSync('git', ['rev-parse', '--show-toplevel'], {",
			"\tcwd: '.stryker-tmp/sandbox-1',",
			"\tencoding: 'utf8',",
			"});",
			"writeFileSync(here + 'call.json', JSON.stringify({",
			"\targs: process.argv.slice(2),",
			"\tpool: process.env.STRYKER_VITEST_POOL,",
			"\treport: process.env.STRYKER_JSON_REPORT,",
			"\tceiling: process.env.GIT_CEILING_DIRECTORIES,",
			"\tsandboxGit: { status: toplevel.status, stdout: toplevel.stdout },",
			"}));",
			...body,
			"",
		].join("\n"),
	);
	await chmod(bin, 0o755);
	return bin;
}

/** Writes `canned` where the provider reads the report and exits 0. */
async function fakeStryker(dir: string, canned: unknown): Promise<string> {
	await writeFile(join(dir, "canned.json"), JSON.stringify(canned));
	return writeFake(dir, [
		"copyFileSync(here + 'canned.json', process.env.STRYKER_JSON_REPORT);",
	]);
}

/**
 * Ignores SIGTERM and never exits; its `sleep` child shares its process group.
 * Writes the child's pid to `pids.json` once both are running.
 */
async function hangingStryker(dir: string): Promise<string> {
	return writeFake(dir, [
		"process.on('SIGTERM', () => {});",
		"const child = spawn('sleep', ['300'], { stdio: 'ignore' });",
		"writeFileSync(here + 'pids.json', JSON.stringify({ child: child.pid }));",
		"setInterval(() => {}, 1000);",
	]);
}

interface FakeCall {
	readonly args: string[];
	readonly pool: string;
	readonly report: string;
	readonly ceiling: string;
	readonly sandboxGit: { readonly status: number; readonly stdout: string };
}

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

async function waitFor(
	check: () => boolean,
	timeoutMs = 2_000,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (!check()) {
		if (Date.now() > deadline) return false;
		await new Promise((settle) => setTimeout(settle, 25));
	}
	return true;
}

async function childPid(dir: string): Promise<number> {
	const pids = JSON.parse(await readFile(join(dir, "pids.json"), "utf8")) as {
		child: number;
	};
	return pids.child;
}

async function readCall(dir: string): Promise<FakeCall> {
	return JSON.parse(await readFile(join(dir, "call.json"), "utf8")) as FakeCall;
}

function argAfter(call: FakeCall, flag: string): string | undefined {
	return call.args[call.args.indexOf(flag) + 1];
}

describe(
	"createMutationProvider with a stand-in Stryker",
	{
		timeout: 60_000,
	},
	() => {
		const project = useTempDir("lean-mutation-project-");
		const tools = useTempDir("lean-mutation-tools-");

		beforeEach(async () => {
			await initCalcProject(project.path);
		});

		async function runWith(
			canned: unknown,
			overrides: Partial<SignalContext> = {},
		): Promise<Signal> {
			const strykerBin = await fakeStryker(tools.path, canned);
			return createMutationProvider({ strykerBin }).run(
				context(project.path, overrides),
			);
		}

		test("fails and re-enters when a mutant survives inside the changed function", async () => {
			const signal = await runWith(
				report({
					"lib/calc.ts": [
						{ id: "1", status: "Killed", line: 2 },
						{ id: "2", status: "Survived", line: 2 },
					],
				}),
			);

			expect(signal).toMatchObject({
				kind: "mutation",
				status: "fail",
				reenter: true,
			});
		});

		test("passes without re-entry when the only survivor is outside changed functions", async () => {
			const signal = await runWith(
				report({
					"lib/calc.ts": [
						{ id: "1", status: "Killed", line: 2 },
						{ id: "2", status: "Survived", line: 7 },
					],
				}),
			);

			expect(signal).toMatchObject({ status: "pass", reenter: false });
		});

		test("passes when the changed function's mutants are killed or timed out", async () => {
			const signal = await runWith(
				report({
					"lib/calc.ts": [
						{ id: "1", status: "Killed", line: 2 },
						{ id: "2", status: "Timeout", line: 2 },
					],
				}),
			);

			expect(signal).toMatchObject({ status: "pass", reenter: false });
		});

		// CALC_CHANGED rewrites line 2 of `add` (lines 1-4) into lines 2-3.
		test("reports survivors only on unchanged lines of a changed function as info", async () => {
			const signal = await runWith(
				report({
					"lib/calc.ts": [
						{ id: "1", status: "Killed", line: 2 },
						{ id: "2", status: "Survived", line: 1 },
					],
				}),
			);

			expect(signal).toMatchObject({
				status: "info",
				reenter: false,
				data: {
					survivorsOutsideDiff: [
						{ file: "lib/calc.ts", function: "add", id: "2", startLine: 1 },
					],
				},
			});
			expect(signal.summary).toMatch(
				/^1 mutants survived, all on unchanged lines of changed functions/u,
			);
		});

		test("re-enters on a survivor inside a hunk and lists the unchanged-line ones apart", async () => {
			const signal = await runWith(
				report({
					"lib/calc.ts": [
						{ id: "1", status: "Survived", line: 3 },
						{ id: "2", status: "Survived", line: 1 },
					],
				}),
			);

			expect(signal).toMatchObject({ status: "fail", reenter: true });
			expect(signal.summary).toMatch(
				/^1 mutants survived on changed lines of changed functions \(1 more on unchanged lines\)/u,
			);
			const data = signal.data as { survivorsOutsideDiff: { id: string }[] };
			expect(data.survivorsOutsideDiff.map((entry) => entry.id)).toEqual(["2"]);
		});

		test("reports info without running Stryker when every covering test is sandbox-unsafe", async () => {
			const strykerBin = await fakeStryker(tools.path, report({}));

			const signal = await createMutationProvider({
				strykerBin,
				denyListTests: ["tests/calc.test.ts"],
			}).run(context(project.path));

			expect(signal).toMatchObject({
				status: "info",
				reenter: false,
				summary: "untestable under mutation: covering tests are sandbox-unsafe",
				data: {
					denied: ["tests/calc.test.ts"],
					untestable: [
						{ file: "lib/calc.ts", covering: ["tests/calc.test.ts"] },
					],
				},
			});
			expect(existsSync(join(tools.path, "call.json"))).toBe(false);
		});

		test("runs a covering test whose worktree commands target a temp fixture", async () => {
			await writeFile(
				join(project.path, "tests/calc.test.ts"),
				[
					CALC_TEST,
					'const fixture = await mkdtemp(join(tmpdir(), "calc-"));',
					'const git = (...args) => execFileSync("git", args, { cwd: fixture });',
					'git("init", "-q");',
					['git("work', 'tree", "a', 'dd", "--detach", target);'].join(""),
				].join("\n"),
			);

			await runWith(report({ "lib/calc.ts": [] }));

			const call = await readCall(tools.path);
			expect(argAfter(call, "--testFiles")).toBe("tests/calc.test.ts");
		});

		test("reports untestable when only a blast-radius test outside the file's own tests could run", async () => {
			await writeFile(join(project.path, "tests/app.test.ts"), "");
			const strykerBin = await fakeStryker(tools.path, report({}));
			const blast: Signal = {
				kind: "blast-radius",
				status: "info",
				summary: "",
				data: { graph: "fresh", radius: { tests: ["tests/app.test.ts"] } },
				reenter: false,
			};

			const signal = await createMutationProvider({
				strykerBin,
				denyListTests: ["tests/calc.test.ts"],
			}).run(context(project.path, { priorSignals: [blast] }));

			expect(signal).toMatchObject({
				status: "info",
				reenter: false,
				summary: "untestable under mutation: covering tests are sandbox-unsafe",
				data: {
					untestable: [
						{ file: "lib/calc.ts", covering: ["tests/calc.test.ts"] },
					],
				},
			});
			expect(existsSync(join(tools.path, "call.json"))).toBe(false);
		});

		test("reports info when no mutant in changed functions was covered", async () => {
			const signal = await runWith(
				report({ "lib/calc.ts": [{ id: "1", status: "NoCoverage", line: 2 }] }),
			);

			expect(signal).toMatchObject({ status: "info", reenter: false });
		});

		test("mutates only the changed function's lines and runs its mirrored test in a forks pool", async () => {
			await runWith(report({ "lib/calc.ts": [] }));
			const call = await readCall(tools.path);

			expect(argAfter(call, "--mutate")).toBe("lib/calc.ts:1-4");
			expect(argAfter(call, "--testFiles")).toBe("tests/calc.test.ts");
			expect(call.pool).toBe("forks");
		});

		test("stops git in Stryker's sandbox from finding the checkout around it", async () => {
			await runWith(report({ "lib/calc.ts": [] }));
			const call = await readCall(tools.path);

			expect(call.ceiling.split(delimiter)[0]).toBe(
				join(await realpath(project.path), ".stryker-tmp"),
			);
			expect(call.sandboxGit.status).not.toBe(0);
			expect(call.sandboxGit.stdout).toBe("");
		});

		describe("with a prior blast-radius signal of fifty tests", () => {
			const wide = Array.from(
				{ length: 50 },
				(_, index) => `tests/wide/t${String(index).padStart(2, "0")}.test.ts`,
			);
			const blast: Signal = {
				kind: "blast-radius",
				status: "info",
				summary: "",
				data: { graph: "fresh", radius: { tests: wide } },
				reenter: false,
			};

			beforeEach(async () => {
				await mkdir(join(project.path, "tests/wide"));
				for (const path of wide) await writeFile(join(project.path, path), "");
			});

			test("runs only the changed file's own tests under a short budget", async () => {
				const signal = await runWith(report({ "lib/calc.ts": [] }), {
					priorSignals: [blast],
				} as Partial<SignalContext>);
				const call = await readCall(tools.path);

				expect(argAfter(call, "--testFiles")).toBe("tests/calc.test.ts");
				expect(
					(signal.data as { tests: { skipped: string[] } }).tests.skipped,
				).toHaveLength(50);
			});

			test("adds blast-radius tests up to maxTests when the budget allows tier 2", async () => {
				await runWith(report({ "lib/calc.ts": [] }), {
					priorSignals: [blast],
					budget: { tokens: 0, timeMs: 200_000 },
				} as Partial<SignalContext>);
				const call = await readCall(tools.path);
				const testFiles = argAfter(call, "--testFiles")?.split(",") ?? [];

				expect(testFiles).toHaveLength(20);
				expect(testFiles.slice(0, 2)).toEqual([
					"tests/calc.test.ts",
					"tests/wide/t00.test.ts",
				]);
			});
		});

		test("reports no tests selected without running Stryker when only a helper is left", async () => {
			gitIn(project.path, "rm", "-q", "tests/calc.test.ts");
			await mkdir(join(project.path, "tests"), { recursive: true });
			await writeFile(join(project.path, "tests/helpers.ts"), "export {};\n");

			const signal = await runWith(report({}), {
				changedFiles: ["lib/calc.ts", "tests/helpers.ts"],
			});

			expect(signal).toMatchObject({ status: "info", reenter: false });
			expect(signal.summary).toContain("no tests selected");
			expect(existsSync(join(tools.path, "call.json"))).toBe(false);
		});

		test("runs Cosmonauts' config and reads the report from the run directory, whatever config the worktree has", async () => {
			await writeFile(
				join(project.path, "stryker.config.mjs"),
				"export default { jsonReporter: { fileName: 'mine.json' } };\n",
			);

			const signal = await runWith(report({ "lib/calc.ts": [] }));
			const call = await readCall(tools.path);
			const reportPath = join(
				project.path,
				".run",
				"mutation",
				"mutation.json",
			);

			expect(call.args.slice(0, 2)).toEqual([
				"run",
				join(REPOSITORY_ROOT, "stryker.config.mjs"),
			]);
			expect(call.report).toBe(reportPath);
			expect(signal.data).toMatchObject({ reportPath });
		});

		test("removes Stryker's sandbox after a run that exits non-zero", async () => {
			const strykerBin = await writeFake(tools.path, ["process.exit(1);"]);

			const signal = await createMutationProvider({ strykerBin }).run(
				context(project.path),
			);

			expect(signal).toMatchObject({ status: "info", reenter: false });
			expect(unavailableReason(signal)).toBe(
				"Stryker did not finish: exit code 1",
			);
			expect(existsSync(join(project.path, ".stryker-tmp"))).toBe(false);
		});

		test("reports a timeout as info and reaps the whole process group", async () => {
			const strykerBin = await hangingStryker(tools.path);

			// The timer starts before the stand-in has written pids.json (node
			// startup plus its git probe); under a loaded machine that took over
			// 1.5 s, so the timeout is long enough never to race it.
			const signal = await createMutationProvider({
				strykerBin,
				timeoutMs: 10_000,
				graceMs: 300,
			}).run(context(project.path));

			expect(signal).toMatchObject({ status: "info", reenter: false });
			expect(unavailableReason(signal)).toBe(
				"Stryker did not finish: timed out after 10000 ms",
			);
			const child = await childPid(tools.path);
			expect(await waitFor(() => !isAlive(child))).toBe(true);
			expect(existsSync(join(project.path, ".stryker-tmp"))).toBe(false);
		});

		test("reports an abort as info and reaps the whole process group", async () => {
			const strykerBin = await hangingStryker(tools.path);
			const controller = new AbortController();
			const pidsFile = join(tools.path, "pids.json");
			void waitFor(() => existsSync(pidsFile), 10_000).then(() =>
				controller.abort(),
			);

			const signal = await createMutationProvider({
				strykerBin,
				graceMs: 300,
			}).run(context(project.path, { signal: controller.signal }));

			expect(signal).toMatchObject({ status: "info", reenter: false });
			expect(unavailableReason(signal)).toBe("Stryker did not finish: aborted");
			const child = await childPid(tools.path);
			expect(await waitFor(() => !isAlive(child))).toBe(true);
			expect(existsSync(join(project.path, ".stryker-tmp"))).toBe(false);
		});

		test("runs Stryker through the child runner with both streams in one log", async () => {
			const strykerBin = await fakeStryker(tools.path, report({}));
			const calls: RunChildOptions[] = [];
			const recording = (
				options: RunChildOptions,
			): Promise<ChildRunOutcome> => {
				calls.push(options);
				return runChild(options);
			};

			const signal = await createMutationProvider({
				strykerBin,
				runChild: recording,
			}).run(context(project.path));

			expect(calls).toHaveLength(1);
			expect(calls[0]?.command).toBe(strykerBin);
			expect(calls[0]?.output.stdout).toBe(calls[0]?.output.stderr);
			expect(signal.data).toMatchObject({ logPath: calls[0]?.output.stdout });
		});

		test("records what survived Stryker's stop in the signal", async () => {
			const stopped = async (
				options: RunChildOptions,
			): Promise<ChildRunOutcome> => ({
				exit: { kind: "unobserved" },
				stopped: { kind: "timeout", timeoutMs: 10 },
				tree: { kind: "survived", reason: "group 42 still alive" },
				stdout: { path: options.output.stdout, bytes: 0, truncated: false },
				stderr: { path: options.output.stderr, bytes: 0, truncated: false },
				notes: [],
			});
			const strykerBin = await fakeStryker(tools.path, report({}));

			const signal = await createMutationProvider({
				strykerBin,
				runChild: stopped,
			}).run(context(project.path));

			expect(signal.summary).toContain("timed out after 10 ms");
			expect(signal.data).toMatchObject({
				survivedReap: "group 42 still alive",
			});
		});

		/** A stand-in runner: makes Stryker's sandbox, then ends as `ended` says. */
		function sandboxRun(
			ended: Pick<ChildRunOutcome, "exit" | "stopped" | "tree">,
			inSandbox?: (sandbox: string) => Promise<void>,
		) {
			return async (options: RunChildOptions): Promise<ChildRunOutcome> => {
				const sandbox = join(options.cwd, ".stryker-tmp");
				await mkdir(join(sandbox, "sandbox-1"), { recursive: true });
				await inSandbox?.(sandbox);
				return {
					...ended,
					stdout: { path: options.output.stdout, bytes: 0, truncated: false },
					stderr: { path: options.output.stderr, bytes: 0, truncated: false },
					notes: [],
				};
			};
		}

		test("keeps Stryker's sandbox, and says where, when its process tree survived", async () => {
			const strykerBin = await fakeStryker(tools.path, report({}));
			const sandbox = join(project.path, ".stryker-tmp");

			const signal = await createMutationProvider({
				strykerBin,
				runChild: sandboxRun({
					exit: { kind: "unobserved" },
					stopped: { kind: "aborted", reason: "stop" },
					tree: { kind: "survived", reason: "4242 (node vitest)" },
				}),
			}).run(context(project.path));

			expect(existsSync(sandbox)).toBe(true);
			expect(signal.data).toMatchObject({
				survivedReap: "4242 (node vitest)",
				sandboxKept: sandbox,
			});
			expect(signal.summary).toBe(
				`Stryker did not finish: aborted; Stryker's sandbox kept at ${sandbox}: its process tree survived`,
			);
			expect(unavailableReason(signal)).toBe("Stryker did not finish: aborted");
		});

		test("keeps Stryker's sandbox when its stopped tree could not be checked", async () => {
			const strykerBin = await fakeStryker(tools.path, report({}));

			const signal = await createMutationProvider({
				strykerBin,
				runChild: sandboxRun({
					exit: { kind: "code", code: 1 },
					stopped: { kind: "timeout", timeoutMs: 10 },
					tree: { kind: "unverified", reason: "taskkill /T exited 1" },
				}),
			}).run(context(project.path));

			expect(existsSync(join(project.path, ".stryker-tmp"))).toBe(true);
			expect(signal.data).toMatchObject({
				unverifiedReap: "taskkill /T exited 1",
			});
			expect(signal.summary).toContain("its process tree could not be checked");
		});

		test("removes the sandbox after a natural exit whose tree Windows cannot check", async () => {
			const strykerBin = await fakeStryker(tools.path, report({}));

			const signal = await createMutationProvider({
				strykerBin,
				runChild: sandboxRun({
					exit: { kind: "code", code: 1 },
					tree: { kind: "unverified", reason: "Windows cannot enumerate" },
				}),
			}).run(context(project.path));

			expect(existsSync(join(project.path, ".stryker-tmp"))).toBe(false);
			expect(signal.summary).toBe("Stryker did not finish: exit code 1");
		});

		test("records a failed sandbox removal instead of losing the run's facts", async () => {
			const strykerBin = await fakeStryker(tools.path, report({}));
			const locked = join(project.path, ".stryker-tmp", "locked");
			try {
				const signal = await createMutationProvider({
					strykerBin,
					runChild: sandboxRun(
						{
							exit: { kind: "code", code: 1 },
							tree: { kind: "gone", by: "exit" },
						},
						async () => {
							await mkdir(locked, { recursive: true });
							await writeFile(join(locked, "file"), "x");
							await chmod(locked, 0o500);
						},
					),
				}).run(context(project.path));

				expect(unavailableReason(signal)).toBe(
					"Stryker did not finish: exit code 1",
				);
				expect(signal.summary).toMatch(
					/^Stryker did not finish: exit code 1; Stryker's sandbox not removed: .*EACCES/u,
				);
				expect(signal.data).toMatchObject({
					sandboxRemoval: expect.stringContaining("EACCES"),
				});
			} finally {
				await chmod(locked, 0o700);
			}
		});

		test("reads the end of a Stryker log that passed the output cap", async () => {
			const strykerBin = await writeFake(tools.path, [
				"process.stdout.write('x'.repeat(200_000) + '\\n', () => {",
				"\tprocess.stderr.write('Error: the final reason Stryker gave\\n');",
				"\tprocess.exitCode = 1;",
				"});",
			]);
			const capped = (options: RunChildOptions) =>
				runChild({ ...options, outputCapBytes: 10_000 });

			const signal = await createMutationProvider({
				strykerBin,
				runChild: capped,
			}).run(context(project.path));

			expect(signal.data).toMatchObject({
				logTail: expect.stringContaining(
					"Error: the final reason Stryker gave",
				),
			});
		});

		test("stops Stryker with taskkill /T then /T /F on Windows before removing its sandbox", async () => {
			const strykerBin = await hangingStryker(tools.path);
			const controller = new AbortController();
			const events: string[] = [];
			const pidsFile = join(tools.path, "pids.json");
			void waitFor(() => existsSync(pidsFile), 10_000).then(() =>
				controller.abort(),
			);
			const onWindows = (options: RunChildOptions) =>
				runChild({
					...options,
					platform: "win32",
					graceMs: 100,
					taskkill: async (args) => {
						const sandbox = existsSync(join(project.path, ".stryker-tmp"));
						events.push(`${args.slice(2).join(" ")} sandbox=${sandbox}`);
						if (!args.includes("/F")) return 1;
						process.kill(Number(args[1]), "SIGKILL");
						process.kill(await childPid(tools.path), "SIGKILL");
						return 0;
					},
				});

			const signal = await createMutationProvider({
				strykerBin,
				runChild: onWindows,
			}).run(context(project.path, { signal: controller.signal }));

			expect(events).toEqual(["/T sandbox=true", "/T /F sandbox=true"]);
			expect(signal.summary).toContain("aborted");
			expect(existsSync(join(project.path, ".stryker-tmp"))).toBe(false);
		});

		test("passes with a summary when nothing changed", async () => {
			await writeFile(join(project.path, "lib/calc.ts"), CALC_BASE);

			const signal = await runWith(report({}));

			expect(signal).toMatchObject({
				status: "pass",
				summary: "no changed functions to mutate",
				reenter: false,
			});
			expect(unavailableReason(signal)).toBeUndefined();
		});

		test("reports info when no test exists for the changed function", async () => {
			gitIn(project.path, "rm", "-q", "tests/calc.test.ts");

			const signal = await runWith(report({}));

			expect(signal).toMatchObject({ status: "info", reenter: false });
			expect(signal.summary).toContain("no tests selected");
			expect(unavailableReason(signal)).toBeUndefined();
		});

		test.each([
			"missing",
			"unreadable",
		])("reports itself unavailable when no tests are selected and graph.json is %s", async (graph) => {
			gitIn(project.path, "rm", "-q", "tests/calc.test.ts");
			const strykerBin = await fakeStryker(tools.path, report({}));
			const blast: Signal = {
				kind: "blast-radius",
				status: "info",
				summary: "",
				data: { graph, unavailable: true, reason: "x" },
				reenter: false,
			};

			const signal = await createMutationProvider({ strykerBin }).run(
				context(project.path, { priorSignals: [blast] }),
			);

			expect(signal).toMatchObject({ status: "info", reenter: false });
			expect(unavailableReason(signal)).toBe(
				`no tests selected for the changed functions: graph.json is ${graph}`,
			);
			expect(existsSync(join(tools.path, "call.json"))).toBe(false);
		});

		test("reports itself unavailable instead of throwing when the Stryker binary is missing", async () => {
			const signal = await createMutationProvider({
				strykerBin: join(tools.path, "missing", "stryker"),
			}).run(context(project.path));

			expect(signal).toMatchObject({ status: "info", reenter: false });
			expect(unavailableReason(signal)).toContain("could not start");
		});

		test("reports itself unavailable when Stryker is not installed where it is resolved from", async () => {
			const signal = await createMutationProvider({
				strykerResolveFrom: join(tools.path, "resolve-from.mjs"),
			}).run(context(project.path));

			expect(signal).toMatchObject({
				status: "info",
				reenter: false,
				summary:
					"mutation signal unavailable: Stryker is not installed (@stryker-mutator/core)",
			});
			expect(unavailableReason(signal)).toBe(
				"Stryker is not installed (@stryker-mutator/core)",
			);
		});

		test("skips Stryker when this pass's verification did not pass", async () => {
			const verify: Signal = {
				kind: "verify",
				status: "fail",
				summary: "1 of 3 failed: bun run test (exit 1)",
				data: { commands: [] },
				reenter: true,
			};

			const signal = await runWith(report({ "lib/calc.ts": [] }), {
				priorSignals: [verify],
			});

			expect(signal).toEqual({
				kind: "mutation",
				status: "info",
				summary: "skipped: verification did not pass",
				data: {
					skipped: true,
					reason:
						"verification did not pass: 1 of 3 failed: bun run test (exit 1)",
				},
				reenter: false,
			});
			expect(existsSync(join(tools.path, "call.json"))).toBe(false);
		});

		test("skips Stryker when this pass's blast-radius tests failed", async () => {
			const verify: Signal = {
				kind: "verify",
				status: "pass",
				summary: "2 passed",
				data: { commands: [] },
				reenter: false,
			};
			const blastTests: Signal = {
				kind: "blast-tests",
				status: "fail",
				summary: "tier 1 failed (exit 1): tests/calc.test.ts",
				data: {},
				reenter: true,
			};

			const signal = await runWith(report({ "lib/calc.ts": [] }), {
				priorSignals: [verify, blastTests],
			});

			expect(signal).toEqual({
				kind: "mutation",
				status: "info",
				summary: "skipped: blast-radius tests failed",
				data: {
					skipped: true,
					reason:
						"blast-radius tests failed: tier 1 failed (exit 1): tests/calc.test.ts",
				},
				reenter: false,
			});
			expect(existsSync(join(tools.path, "call.json"))).toBe(false);
		});

		test("skips Stryker when verification could not run every check", async () => {
			const verify: Signal = {
				kind: "verify",
				status: "info",
				summary: "unverified: no verification commands configured",
				data: { commands: [], unverified: true, unavailable: true },
				reenter: false,
			};

			const signal = await runWith(report({ "lib/calc.ts": [] }), {
				priorSignals: [verify],
			});

			expect(signal.summary).toBe("skipped: verification did not pass");
			expect(existsSync(join(tools.path, "call.json"))).toBe(false);
		});

		test("runs Stryker when this pass's verification passed", async () => {
			const verify: Signal = {
				kind: "verify",
				status: "pass",
				summary: "3 passed",
				data: { commands: [] },
				reenter: false,
			};

			await runWith(report({ "lib/calc.ts": [] }), {
				priorSignals: [verify],
			});

			expect(existsSync(join(tools.path, "call.json"))).toBe(true);
		});

		test("reports itself unavailable instead of throwing for an unknown base revision", async () => {
			const signal = await createMutationProvider().run(
				context(project.path, { baseSha: "no-such-revision" }),
			);

			expect(signal).toMatchObject({
				status: "info",
				reenter: false,
				data: { unavailable: true },
			});
		});
	},
);

function hasCommit(revision: string): boolean {
	try {
		gitIn(REPOSITORY_ROOT, "cat-file", "-e", `${revision}^{commit}`);
		return true;
	} catch {
		return false;
	}
}

/** Two runner processes keep the suite's load down; the default is half the cores. */
const realStryker = createMutationProvider({ concurrency: 2 });

describe(
	"createMutationProvider with real Stryker",
	{
		timeout: 180_000,
	},
	() => {
		const scratch = useTempDir("lean-mutation-it-");
		let sample: string | undefined;

		afterEach(() => {
			if (sample === undefined) return;
			gitIn(REPOSITORY_ROOT, "worktree", "remove", "--force", sample);
			sample = undefined;
		});

		test.runIf(hasCommit("f2d6242c"))(
			"reports the f2d6242c sample's eight survivors and re-enters",
			async () => {
				sample = join(scratch.path, "sample");
				gitIn(
					REPOSITORY_ROOT,
					"worktree",
					"add",
					"--detach",
					sample,
					"f2d6242c",
				);
				await symlink(
					join(REPOSITORY_ROOT, "node_modules"),
					join(sample, "node_modules"),
				);

				const signal = await realStryker.run(
					context(sample, {
						baseSha: "f2d6242c~1",
						changedFiles: [
							"lib/driver/runtime-helpers.ts",
							"tests/driver/worktree-snapshot.test.ts",
						],
						budget: { tokens: 0, timeMs: 120_000 },
						runDir: join(scratch.path, "run"),
					}),
				);
				const data = signal.data as {
					mutate: string[];
					tests: { selected: string[] };
					inRange: Record<string, number>;
				};

				expect(data.mutate).toEqual(["lib/driver/runtime-helpers.ts:276-342"]);
				expect(data.tests.selected).toEqual([
					"tests/driver/worktree-snapshot.test.ts",
				]);
				expect(data.inRange).toMatchObject({ mutants: 39, survived: 8 });
				expect(signal).toMatchObject({ status: "fail", reenter: true });
			},
		);

		test("passes and blames neither of two redundant test files that kill every mutant", async () => {
			const root = join(scratch.path, "calc");
			await mkdir(root);
			await initCalcProject(root);
			await writeFile(join(root, "tests/calc-copy.test.ts"), CALC_TEST);
			await writeFile(
				join(root, "vitest.config.ts"),
				'import { defineConfig } from "vitest/config";\nexport default defineConfig({});\n',
			);
			await symlink(
				join(REPOSITORY_ROOT, "node_modules"),
				join(root, "node_modules"),
			);

			const signal = await realStryker.run(
				context(root, {
					changedFiles: ["lib/calc.ts", "tests/calc-copy.test.ts"],
					runDir: join(scratch.path, "run"),
				}),
			);
			const data = signal.data as {
				tests: { selected: string[] };
				testFilesKillingNothing: string[];
			};

			expect(signal).toMatchObject({ status: "pass", reenter: false });
			expect(data.tests.selected).toEqual([
				"tests/calc-copy.test.ts",
				"tests/calc.test.ts",
			]);
			expect(data.testFilesKillingNothing).toEqual([]);
		});
	},
);
