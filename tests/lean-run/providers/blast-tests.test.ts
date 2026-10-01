import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import type {
	ProviderProcessExecutor,
	ProviderProcessInvocation,
	ProviderProcessOutcome,
} from "../../../domains/shared/extensions/project-tools/process-runner.ts";
import type { FileGraph } from "../../../lib/architecture-map/index.ts";
import {
	type BlastTestsData,
	type BlastTestsProviderOptions,
	createBlastTestsProvider,
} from "../../../lib/lean-run/providers/blast-tests.ts";
import {
	requiredSignalGap,
	unavailableReason,
} from "../../../lib/lean-run/signal-availability.ts";
import type { Signal, SignalContext } from "../../../lib/lean-run/types.ts";
import { useTempDir } from "../../helpers/fs.ts";
import { stubContext } from "./context.ts";

const tmp = useTempDir("lean-blast-tests-");

const REPO_ROOT = resolve(import.meta.dirname, "../../..");

/** `src/sum.ts` is imported by `src/total.ts`; each has its own test. */
const GRAPH: FileGraph = {
	schemaVersion: 1,
	projectHash: "project",
	graphHash: "graph",
	nodes: [
		{ path: "src/sum.ts", kind: "source", exports: [] },
		{ path: "src/total.ts", kind: "source", exports: [] },
		{ path: "tests/src/sum.test.ts", kind: "test", exports: [] },
		{ path: "tests/total.test.ts", kind: "test", exports: [] },
	],
	edges: [
		{ from: "src/total.ts", to: "src/sum.ts", typeOnly: false },
		{ from: "tests/src/sum.test.ts", to: "src/sum.ts", typeOnly: false },
		{ from: "tests/total.test.ts", to: "src/total.ts", typeOnly: false },
	],
} as unknown as FileGraph;

const DIRECT = "tests/src/sum.test.ts";
const TRANSITIVE = "tests/total.test.ts";

function blastRadius(
	tests: readonly string[],
	graph: string = "current",
): Signal {
	return {
		kind: "blast-radius",
		status: "info",
		summary: "Blast radius",
		data: {
			graph,
			radius: {
				changed: ["src/sum.ts"],
				dependents: ["src/total.ts"],
				tests,
				hubs: [],
				truncated: false,
			},
		},
		reenter: false,
	};
}

function context(overrides: Partial<SignalContext> = {}): SignalContext {
	return stubContext({
		worktree: tmp.path,
		changedFiles: ["src/sum.ts"],
		budget: { tokens: 0, timeMs: 600_000 },
		priorSignals: [blastRadius([DIRECT, TRANSITIVE])],
		...overrides,
	});
}

async function writeFiles(files: Record<string, string>): Promise<void> {
	for (const [path, content] of Object.entries(files)) {
		await mkdir(join(tmp.path, path, ".."), { recursive: true });
		await writeFile(join(tmp.path, path), content);
	}
}

/** The fixture's two spec files and a package.json with a test script. */
async function writeFixture(): Promise<void> {
	await writeFiles({
		"package.json": JSON.stringify({ scripts: { test: "vitest run" } }),
		[DIRECT]: "",
		[TRANSITIVE]: "",
	});
}

interface StubRunner {
	readonly run: ProviderProcessExecutor;
	readonly calls: {
		invocation: ProviderProcessInvocation;
		timeoutMs?: number;
	}[];
}

/**
 * What vitest 3.2.4's default reporter prints without a TTY (real captures
 * below), for a run of `passed` and `failed` files of one test each.
 */
function vitestOutput(files: {
	passed?: readonly string[];
	failed?: readonly string[];
}): string {
	const passed = files.passed ?? [];
	const failed = files.failed ?? [];
	const counts = [
		...(failed.length > 0 ? [`${failed.length} failed`] : []),
		...(passed.length > 0 ? [`${passed.length} passed`] : []),
	].join(" | ");
	const total = passed.length + failed.length;
	return [
		"",
		" RUN  v3.2.4 /repo",
		"",
		...passed.map((file) => ` ✓ ${file} (1 test) 3ms`),
		...failed.map((file) => ` ❯ ${file} (1 test | 1 failed) 4ms`),
		"",
		` Test Files  ${counts} (${total})`,
		`      Tests  ${counts} (${total})`,
		"   Start at  16:40:12",
		"   Duration  293ms (transform 28ms, setup 0ms, collect 28ms, tests 7ms, environment 1ms, prepare 129ms)",
		"",
	].join("\n");
}

/** A real vitest 3.2.4 capture: two files listed, the config's `include` excluded `e2e/x.test.ts`. */
const VITEST_ONE_OF_TWO = `
 RUN  v3.2.4 /repo

 ✓ tests/src/sum.test.ts (2 tests) 1ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  16:40:13
   Duration  267ms (transform 18ms, setup 0ms, collect 10ms, tests 1ms, environment 0ms, prepare 45ms)
`;

/** A real vitest 3.2.4 capture: `--passWithNoTests` and a listed file the config excludes. */
const VITEST_PASS_WITH_NO_TESTS = `
 RUN  v3.2.4 /repo

No test files found, exiting with code 0

filter: e2e/x.test.ts
include: tests/**/*.test.ts
exclude:  **/node_modules/**, **/dist/**, **/cypress/**, **/.{idea,git,cache,output,temp}/**, **/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*
`;

/** A real vitest 3.2.4 capture: the listed file's only test is skipped. */
const VITEST_ALL_SKIPPED = `
 RUN  v3.2.4 /repo

 ↓ tests/src/sum.test.ts (1 test | 1 skipped)

 Test Files  1 skipped (1)
      Tests  1 skipped (1)
   Start at  16:40:14
   Duration  279ms (transform 19ms, setup 0ms, collect 16ms, tests 0ms, environment 0ms, prepare 46ms)
`;

/**
 * A real vitest 3.2.4 capture (file names mapped to this suite's): the
 * config includes only `pkg/**`, so for the listed `tests/src/sum.test.ts`
 * vitest's substring filter ran `pkg/tests/src/sum.test.ts` instead.
 */
const VITEST_RAN_ANOTHER_FILE = `
 RUN  v3.2.4 /repo

 ✓ pkg/tests/src/sum.test.ts (1 test) 1ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  17:31:37
   Duration  435ms (transform 29ms, setup 0ms, collect 14ms, tests 1ms, environment 0ms, prepare 144ms)
`;

/**
 * A real vitest 3.2.4 capture (file names mapped to this suite's): two
 * `projects` that both include only `tests/**`, with `tests/src/sum.test.ts`
 * and `e2e/x.test.ts` listed.
 */
const VITEST_PROJECTS = `
 RUN  v3.2.4 /repo

 ✓ |unit| tests/src/sum.test.ts (1 test) 1ms
 ✓ |again| tests/src/sum.test.ts (1 test) 1ms

 Test Files  2 passed (2)
      Tests  2 passed (2)
   Start at  17:31:38
   Duration  642ms (transform 26ms, setup 0ms, collect 25ms, tests 2ms, environment 0ms, prepare 245ms)
`;

/**
 * A real vitest 3.2.4 capture from a test script that ignores its
 * arguments and runs every file its config includes.
 */
const VITEST_IGNORED_ARGUMENTS = `
 RUN  v3.2.4 /repo

 ✓ tests/other2.test.ts (1 test) 103ms
 ✓ tests/other1.test.ts (1 test) 1ms

 Test Files  2 passed (2)
      Tests  2 passed (2)
   Start at  17:31:39
   Duration  636ms (transform 24ms, setup 0ms, collect 31ms, tests 105ms, environment 0ms, prepare 205ms)
`;

/**
 * A real vitest 3.2.4 capture with `--reporter=dot`: the one listed file
 * ran, and the reporter names no file.
 */
const VITEST_DOT_REPORTER = `
 RUN  v3.2.4 /repo

·

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  18:53:42
   Duration  255ms (transform 18ms, setup 0ms, collect 12ms, tests 1ms, environment 0ms, prepare 69ms)
`;

const NAMED_NO_FILES =
	"the test runner named no files; blast-tests needs a reporter that names files (vitest default or verbose, not dot)";

type StubOutcome =
	| ProviderProcessOutcome
	| ((invocation: ProviderProcessInvocation) => ProviderProcessOutcome);

/** The listed files after `--`. */
function listedIn(invocation: ProviderProcessInvocation): string[] {
	return invocation.args.slice(invocation.args.indexOf("--") + 1);
}

/** Exits `code` with vitest's output for the files it was given: all pass on 0, all fail otherwise. */
function exited(code: number): StubOutcome {
	return (invocation) => {
		const files = listedIn(invocation);
		return {
			kind: "code-exit",
			code,
			stdout: vitestOutput(code === 0 ? { passed: files } : { failed: files }),
			stderr: "",
		};
	};
}

function printed(code: number, stdout: string): ProviderProcessOutcome {
	return { kind: "code-exit", code, stdout, stderr: "" };
}

function stubRunner(
	outcomes: readonly StubOutcome[] = [exited(0)],
): StubRunner {
	const calls: StubRunner["calls"] = [];
	return {
		calls,
		run: async (invocation, _signal, options) => {
			calls.push({ invocation, timeoutMs: options?.timeoutMs });
			const outcome =
				outcomes[calls.length - 1] ?? outcomes.at(-1) ?? exited(0);
			return typeof outcome === "function" ? outcome(invocation) : outcome;
		},
	};
}

function provider(
	runner: StubRunner,
	options: Partial<BlastTestsProviderOptions> = {},
) {
	return createBlastTestsProvider({
		runProcess: runner.run,
		loadGraph: async () => GRAPH,
		...options,
	});
}

function dataOf(signal: Signal): BlastTestsData {
	return signal.data as BlastTestsData;
}

describe("blast-tests provider with an injected runner", () => {
	test("runs the direct tests, then the transitive ones, through the project's test script", async () => {
		await writeFixture();
		const runner = stubRunner();

		const signal = await provider(runner).run(context());

		expect(runner.calls.map((call) => call.invocation)).toEqual([
			{
				executablePath: "bun",
				args: ["run", "test", "--", DIRECT],
				cwd: tmp.path,
			},
			{
				executablePath: "bun",
				args: ["run", "test", "--", TRANSITIVE],
				cwd: tmp.path,
			},
		]);
		expect(signal).toMatchObject({
			kind: "blast-tests",
			status: "pass",
			summary: "2 blast-radius tests passed",
			reenter: false,
		});
		expect(dataOf(signal)).toMatchObject({
			command: "bun run test --",
			tier1: [DIRECT],
			tier2: [TRANSITIVE],
			runs: [
				{ tier: 1, tests: [DIRECT], verdict: "passed", exitCode: 0 },
				{ tier: 2, tests: [TRANSITIVE], verdict: "passed", exitCode: 0 },
			],
			notRun: [],
			maxTests: 40,
			timeoutMs: 300_000,
		});
		expect(dataOf(signal).durationMs).toBeGreaterThanOrEqual(0);
	});

	test("bounds each run by the time left of the cap", async () => {
		await writeFixture();
		const runner = stubRunner();

		await provider(runner, { timeoutMs: 120_000, tier2MinMs: 0 }).run(
			context({ budget: { tokens: 0, timeMs: 90_000 } }),
		);

		for (const call of runner.calls) {
			expect(call.timeoutMs).toBeGreaterThan(80_000);
			expect(call.timeoutMs).toBeLessThanOrEqual(90_000);
		}
	});

	test("fails and re-enters when a listed test fails twice, and leaves tier 2 unrun", async () => {
		await writeFixture();
		const runner = stubRunner([exited(1)]);

		const signal = await provider(runner).run(context());

		expect(runner.calls.map((call) => call.invocation.args.at(-1))).toEqual([
			DIRECT,
			DIRECT,
		]);
		expect(signal).toMatchObject({
			status: "fail",
			summary: `tier 1 failed (exit 1): ${DIRECT}`,
			reenter: true,
		});
		expect(dataOf(signal).runs?.[0]?.attempts).toMatchObject([
			{ verdict: "failed", exitCode: 1 },
			{ verdict: "failed", exitCode: 1 },
		]);
		expect(dataOf(signal).notRun).toEqual([
			{ tests: [TRANSITIVE], reason: "tier 1 failed" },
		]);
	});

	test("passes when a failed tier passes on its second run, and records both runs", async () => {
		await writeFixture();
		const runner = stubRunner([exited(1), exited(0), exited(0)]);

		const signal = await provider(runner).run(context());

		expect(runner.calls).toHaveLength(3);
		expect(signal).toMatchObject({
			status: "pass",
			summary:
				"2 blast-radius tests passed; passed on a second run after failing once: tier 1",
			reenter: false,
		});
		expect(dataOf(signal).runs).toMatchObject([
			{
				tier: 1,
				verdict: "passed",
				exitCode: 0,
				attempts: [
					{ verdict: "failed", exitCode: 1 },
					{ verdict: "passed", exitCode: 0 },
				],
			},
			{ tier: 2, verdict: "passed" },
		]);
		expect(dataOf(signal).runs?.[1]?.attempts).toBeUndefined();
	});

	test("keeps the first failure when the second run cannot start", async () => {
		await writeFixture();
		const controller = new AbortController();
		const runner: StubRunner = {
			calls: [],
			run: async (invocation) => {
				runner.calls.push({ invocation });
				controller.abort();
				return printed(1, vitestOutput({ failed: listedIn(invocation) }));
			},
		};

		const signal = await provider(runner).run(
			context({ signal: controller.signal }),
		);

		expect(runner.calls).toHaveLength(1);
		expect(signal).toMatchObject({ status: "fail", reenter: true });
		expect(dataOf(signal).runs?.[0]).toMatchObject({
			verdict: "failed",
			exitCode: 1,
			attempts: [
				{ verdict: "failed", exitCode: 1 },
				{ verdict: "not-run", outcome: "aborted" },
			],
		});
	});

	test.each([
		["vitest on stderr", "", "No test files found, exiting with code 1"],
		["vitest on stdout", "No test files found, exiting with code 1", ""],
		["jest", "", "No tests found, exiting with code 1"],
		[
			"vitest in colour",
			"",
			"\u001b[31mNo test files found, exiting with code 1\n\u001b[39m",
		],
	])("is info, not fail, when the runner selects none of a tier's files (%s)", async (_name, stdout, stderr) => {
		await writeFixture();
		const runner = stubRunner([
			{ kind: "code-exit", code: 1, stdout, stderr },
			exited(0),
		]);

		const signal = await provider(runner).run(context());

		expect(runner.calls.map((call) => call.invocation.args.at(-1))).toEqual([
			DIRECT,
			TRANSITIVE,
		]);
		expect(signal).toMatchObject({
			status: "info",
			summary: `1 blast-radius tests passed; tier 1 not run: the test runner selected none of the listed files: ${DIRECT}`,
			reenter: false,
		});
		expect(dataOf(signal).runs?.[0]).toMatchObject({
			verdict: "not-run",
			reason: "the test runner selected none of the listed files",
			exitCode: 1,
		});
	});

	test.each([
		[
			"inside a line of an assertion diff",
			'- Expected: "x"\n+ Received: "No test files found, exiting with code 1"\n',
		],
		[
			"as a whole line beside a vitest run summary",
			"No tests found, exiting with code 1\n Test Files  1 failed (1)\n",
		],
		[
			"as a whole line beside a jest run summary",
			"No tests found, exiting with code 1\nTest Suites: 1 failed, 1 total\n",
		],
	])("fails when a failing run's output carries the nothing-selected text %s", async (_name, stdout) => {
		await writeFixture();
		const runner = stubRunner([
			{ kind: "code-exit", code: 1, stdout, stderr: "" },
		]);

		const signal = await provider(runner).run(context());

		expect(signal).toMatchObject({ status: "fail", reenter: true });
		expect(dataOf(signal).runs?.[0]).toMatchObject({ verdict: "failed" });
	});

	test("fails on a test that verification ran too", async () => {
		await writeFixture();
		const verify: Signal = {
			kind: "verify",
			status: "pass",
			summary: "3 passed",
			data: { commands: [] },
			reenter: false,
		};
		const runner = stubRunner([exited(0), exited(1)]);

		const signal = await provider(runner).run(
			context({ priorSignals: [verify, blastRadius([DIRECT, TRANSITIVE])] }),
		);

		expect(signal).toMatchObject({ status: "fail", reenter: true });
	});

	test("skips tier 2 when too little time is left after tier 1", async () => {
		await writeFixture();
		const runner = stubRunner();

		const signal = await provider(runner, {
			timeoutMs: 30_000,
			tier2MinMs: 60_000,
		}).run(context());

		expect(runner.calls).toHaveLength(1);
		expect(signal).toMatchObject({ status: "info", reenter: false });
		expect(signal.summary).toMatch(
			/^1 blast-radius tests passed; 1 not run: time: \d+ ms left, tier 2 needs 60000 ms$/u,
		);
		expect(dataOf(signal).skipped).toBeUndefined();
	});

	test("runs at most maxTests, tier 1 first, and reports the rest as info", async () => {
		await writeFixture();
		const runner = stubRunner();

		const signal = await provider(runner, { maxTests: 1 }).run(context());

		expect(runner.calls.map((call) => call.invocation.args.at(-1))).toEqual([
			DIRECT,
		]);
		expect(signal).toMatchObject({
			status: "info",
			summary:
				"1 blast-radius tests passed; 1 not run: over the test count cap",
			reenter: false,
		});
		expect(dataOf(signal).notRun).toEqual([
			{ tests: [TRANSITIVE], reason: "over the test count cap" },
		]);
	});

	test("is info, never fail, when the run is cut short by the time cap", async () => {
		await writeFixture();
		const runner = stubRunner([
			{
				kind: "timeout",
				reason: "timed out",
				timeoutMs: 1,
				stdout: "",
				stderr: "",
			},
		]);

		const signal = await provider(runner).run(context());

		expect(signal).toMatchObject({
			status: "info",
			summary:
				"0 blast-radius tests passed; tier 1 did not finish (timeout); 1 not run: tier 1 did not run",
			reenter: false,
		});
		expect(dataOf(signal).skipped).toBe(true);
	});

	test("falls back to the mirrored test for tier 1 when the graph cannot be loaded", async () => {
		await writeFixture();
		const runner = stubRunner();

		const signal = await provider(runner, {
			loadGraph: async () => {
				throw new Error("corrupt");
			},
		}).run(context());

		expect(dataOf(signal)).toMatchObject({
			tier1: [DIRECT],
			tier2: [TRANSITIVE],
		});
	});

	test("uses a configured command", async () => {
		await writeFixture();
		const runner = stubRunner();

		await provider(runner, {
			command: { executable: "npx", args: ["vitest", "run"] },
		}).run(context());

		expect(runner.calls[0]?.invocation).toMatchObject({
			executablePath: "npx",
			args: ["vitest", "run", DIRECT],
		});
	});
});

describe("blast-tests provider counting only the tests the runner ran", () => {
	const OTHER = "tests/src/sum-edge.test.ts";
	const EXCLUDED = "e2e/x.test.ts";
	/** Three tier-1 tests: each imports the changed file. */
	const GRAPH3 = {
		...GRAPH,
		edges: [DIRECT, OTHER, EXCLUDED].map((from) => ({
			from,
			to: "src/sum.ts",
			typeOnly: false,
		})),
	} as unknown as FileGraph;

	async function tierOf(
		tests: readonly string[],
		outcome: StubOutcome,
	): Promise<Signal> {
		await writeFiles({
			"package.json": JSON.stringify({ scripts: { test: "vitest run" } }),
			...Object.fromEntries(tests.map((test) => [test, ""])),
		});
		return createBlastTestsProvider({
			runProcess: stubRunner([outcome]).run,
			loadGraph: async () => GRAPH3,
		}).run(context({ priorSignals: [blastRadius(tests)] }));
	}

	function requiredGap(signal: Signal): string | undefined {
		return requiredSignalGap({
			required: ["blast-tests"],
			signals: [signal],
			absentIsGap: true,
		});
	}

	test.each([
		[
			"vitest's passWithNoTests output",
			VITEST_PASS_WITH_NO_TESTS,
			"tier 1 not run: the test runner selected none of the listed files",
		],
		[
			"a summary of zero tests",
			" Test Files  0 passed (0)\n      Tests  0 passed (0)\n",
			"tier 1 not run: no tests executed (runner reported 0 test files)",
		],
		[
			"a summary of a file that ran zero tests",
			" Test Files  1 passed (1)\n      Tests  0 passed (0)\n",
			"tier 1 not run: no tests executed (runner reported 0 tests)",
		],
		[
			"a summary whose only test was skipped",
			VITEST_ALL_SKIPPED,
			"tier 1 not run: no tests executed (runner reported 0 test files)",
		],
		[
			"no run summary",
			"done\n",
			"tier 1 not run: no run summary in the test runner's output",
		],
	])("is unavailable, and a gap when required, on exit 0 with %s", async (_name, stdout, why) => {
		const signal = await tierOf([DIRECT], printed(0, stdout));

		expect(signal).toMatchObject({ status: "info", reenter: false });
		expect(signal.summary).toBe(
			`0 blast-radius tests passed; ${why}: ${DIRECT}`,
		);
		expect(unavailableReason(signal)).toBe(
			`no tests executed: ${why}: ${DIRECT}`,
		);
		expect(requiredGap(signal)).toBe(
			`unverified (blast-tests unavailable: no tests executed: ${why}: ${DIRECT})`,
		);
	});

	test("is unavailable when the runner cannot be spawned", async () => {
		const signal = await tierOf([DIRECT], {
			kind: "spawn-error",
			error: Object.assign(new Error("spawn bun ENOENT"), { code: "ENOENT" }),
			stdout: "",
			stderr: "",
		});

		expect(dataOf(signal).runs?.[0]).toMatchObject({
			verdict: "not-run",
			reason: "runner spawn error: spawn bun ENOENT",
		});
		expect(unavailableReason(signal)).toBe(
			`no tests executed: tier 1 not run: runner spawn error: spawn bun ENOENT: ${DIRECT}`,
		);
	});

	test("records the files the runner ran and lists the rest of the tier as not run", async () => {
		const signal = await tierOf(
			[DIRECT, OTHER, EXCLUDED],
			printed(0, vitestOutput({ passed: [DIRECT, OTHER] })),
		);

		expect(signal).toMatchObject({
			status: "info",
			summary:
				"2 blast-radius tests passed; 1 not run: the test runner did not run them",
		});
		expect(dataOf(signal).runs?.[0]).toMatchObject({
			tests: [DIRECT, OTHER, EXCLUDED],
			verdict: "passed",
			executed: [DIRECT, OTHER],
		});
		expect(dataOf(signal).notRun).toEqual([
			{ tests: [EXCLUDED], reason: "the test runner did not run them" },
		]);
		expect(unavailableReason(signal)).toBeUndefined();
		expect(requiredGap(signal)).toBeUndefined();
	});

	test("reads the files run from a real capture where the config excluded one", async () => {
		const signal = await tierOf(
			[DIRECT, EXCLUDED],
			printed(0, VITEST_ONE_OF_TWO),
		);

		expect(dataOf(signal).runs?.[0]?.executed).toEqual([DIRECT]);
		expect(dataOf(signal).notRun).toEqual([
			{ tests: [EXCLUDED], reason: "the test runner did not run them" },
		]);
		expect(signal.status).toBe("info");
	});

	test("does not count a listed file as run from a real dot-reporter capture that names no file", async () => {
		const signal = await tierOf([DIRECT], printed(0, VITEST_DOT_REPORTER));

		expect(dataOf(signal).runs?.[0]).toMatchObject({
			verdict: "not-run",
			reason: NAMED_NO_FILES,
		});
		expect(dataOf(signal).runs?.[0]?.executed).toBeUndefined();
		expect(signal.status).toBe("info");
		expect(requiredGap(signal)).toBe(
			`unverified (blast-tests unavailable: no tests executed: tier 1 not run: ${NAMED_NO_FILES}: ${DIRECT})`,
		);
	});

	test.each([
		[
			"as many files as listed",
			" Test Files  2 passed (2)\n      Tests  5 passed (5)\n",
		],
		[
			"fewer files than listed",
			" Test Files  1 passed (1)\n      Tests  1 passed (1)\n",
		],
	])("does not pass a tier when the runner ran %s without naming them", async (_name, stdout) => {
		const signal = await tierOf([DIRECT, OTHER], printed(0, stdout));

		expect(dataOf(signal).runs?.[0]).toMatchObject({
			verdict: "not-run",
			reason: NAMED_NO_FILES,
		});
		expect(requiredGap(signal)).toMatch(
			/^unverified \(blast-tests unavailable: /u,
		);
	});

	test.each([
		[
			"vitest's substring filter ran another file",
			[DIRECT],
			VITEST_RAN_ANOTHER_FILE,
			"1 other file",
		],
		[
			"the test script ignored its arguments",
			[EXCLUDED],
			VITEST_IGNORED_ARGUMENTS,
			"2 other files",
		],
	])("does not count listed files as run when %s", async (_name, tests, stdout, others) => {
		const signal = await tierOf(tests, printed(0, stdout));
		const why = `the test runner named none of the listed files (it named only ${others})`;

		expect(dataOf(signal).runs?.[0]).toMatchObject({
			verdict: "not-run",
			reason: why,
		});
		expect(requiredGap(signal)).toBe(
			`unverified (blast-tests unavailable: no tests executed: tier 1 not run: ${why}: ${tests.join(", ")})`,
		);
	});

	test("reads file names behind vitest's project labels", async () => {
		const signal = await tierOf(
			[DIRECT, EXCLUDED],
			printed(0, VITEST_PROJECTS),
		);

		expect(signal.status).toBe("info");
		expect(dataOf(signal).runs?.[0]?.executed).toEqual([DIRECT]);
		expect(dataOf(signal).notRun).toEqual([
			{ tests: [EXCLUDED], reason: "the test runner did not run them" },
		]);
		expect(requiredGap(signal)).toBeUndefined();
	});

	test("passes a tier the runner reports running whole", async () => {
		const signal = await tierOf(
			[DIRECT, OTHER],
			printed(0, vitestOutput({ passed: [OTHER, DIRECT] })),
		);

		expect(signal).toMatchObject({
			status: "pass",
			summary: "2 blast-radius tests passed",
		});
		expect(dataOf(signal).notRun).toEqual([]);
	});
});

describe("blast-tests provider when there is nothing to run", () => {
	test.each([
		[
			"graph.json is missing",
			[
				{
					...blastRadius([]),
					data: { graph: "missing" },
				},
			],
			"graph.json is missing; the blast-radius test list cannot be trusted",
		],
		[
			"graph.json is unreadable",
			[{ ...blastRadius([]), data: { graph: "unreadable", reason: "x" } }],
			"graph.json is unreadable; the blast-radius test list cannot be trusted",
		],
		[
			"no blast-radius signal ran",
			[] as Signal[],
			"no blast-radius signal ran in this pass",
		],
		[
			"graph.json is stale",
			[blastRadius([DIRECT], "stale")],
			"graph.json is stale; the blast-radius test list cannot be trusted",
		],
		[
			"graph.json freshness is unknown",
			[blastRadius([DIRECT], "unknown")],
			"graph.json is of unknown freshness; the blast-radius test list cannot be trusted",
		],
	])("is unavailable and skipped when %s", async (_name, priorSignals, summary) => {
		await writeFixture();
		const runner = stubRunner();

		const signal = await provider(runner).run(context({ priorSignals }));

		expect(runner.calls).toHaveLength(0);
		expect(signal).toEqual({
			kind: "blast-tests",
			status: "info",
			summary,
			data: { reason: `skipped: ${summary}`, skipped: true, unavailable: true },
			reenter: false,
		});
	});

	test("is unavailable when the radius lists no tests", async () => {
		await writeFixture();
		const runner = stubRunner();

		const signal = await provider(runner).run(
			context({ priorSignals: [blastRadius([])] }),
		);

		expect(runner.calls).toHaveLength(0);
		expect(signal).toMatchObject({
			status: "info",
			summary: "no tests in the blast radius",
		});
		expect(unavailableReason(signal)).toBe(
			"skipped: no tests in the blast radius",
		);
	});

	test("lists radius paths that are not spec files in the worktree as missing", async () => {
		await writeFixture();
		const runner = stubRunner();

		const signal = await provider(runner).run(
			context({
				priorSignals: [blastRadius(["tests/gone.test.ts", "tests/helper.ts"])],
			}),
		);

		expect(signal).toMatchObject({
			status: "info",
			summary: "no tests in the blast radius",
		});
		expect(dataOf(signal).missing).toEqual([
			"tests/gone.test.ts",
			"tests/helper.ts",
		]);
	});

	test("is unavailable when the project has no test script and no command is configured", async () => {
		await writeFiles({ [DIRECT]: "", [TRANSITIVE]: "" });
		const runner = stubRunner();

		const signal = await provider(runner).run(context());

		expect(runner.calls).toHaveLength(0);
		expect(signal).toMatchObject({
			status: "info",
			summary: "no test runner: package.json has no test script",
			reenter: false,
		});
		expect(unavailableReason(signal)).toBe(
			"no test runner: package.json has no test script",
		);
	});

	test("does not start a tier once the run is aborted", async () => {
		await writeFixture();
		const runner = stubRunner();
		const controller = new AbortController();
		controller.abort();

		const signal = await provider(runner).run(
			context({ signal: controller.signal }),
		);

		expect(runner.calls).toHaveLength(0);
		expect(signal).toMatchObject({ status: "info", reenter: false });
		expect(dataOf(signal).runs).toMatchObject([
			{ tier: 1, outcome: "aborted", verdict: "not-run" },
		]);
	});

	test("turns a throwing runner into an unavailable info", async () => {
		await writeFixture();
		const signal = await createBlastTestsProvider({
			loadGraph: async () => GRAPH,
			runProcess: async () => {
				throw new Error("spawn exploded");
			},
		}).run(context());

		expect(signal).toMatchObject({
			status: "info",
			summary: "blast-radius tests not run: spawn exploded",
			reenter: false,
		});
		expect(unavailableReason(signal)).toBe(
			"blast-radius tests not run: spawn exploded",
		);
	});
});

describe("blast-tests provider, real vitest run", { timeout: 60_000 }, () => {
	async function writeVitestFixture(failing: boolean): Promise<void> {
		await writeFiles({
			"package.json": JSON.stringify({
				type: "module",
				scripts: { test: "vitest run" },
			}),
			"src/sum.ts": "export const sum = (a: number, b: number) => a + b;\n",
			"src/total.ts":
				'import { sum } from "./sum.ts";\nexport const total = (xs: number[]) => xs.reduce(sum, 0);\n',
			[DIRECT]: [
				'import { expect, test } from "vitest";',
				'import { sum } from "../../src/sum.ts";',
				`test("adds", () => expect(sum(1, 2)).toBe(${failing ? 4 : 3}));`,
				"",
			].join("\n"),
			[TRANSITIVE]: [
				'import { expect, test } from "vitest";',
				'import { total } from "../src/total.ts";',
				'test("totals", () => expect(total([1, 2, 3])).toBe(6));',
				"",
			].join("\n"),
		});
		await symlink(
			join(REPO_ROOT, "node_modules"),
			join(tmp.path, "node_modules"),
		);
	}

	test("runs the listed tests with the project's runner and passes", async () => {
		await writeVitestFixture(false);

		const signal = await createBlastTestsProvider({
			loadGraph: async () => GRAPH,
			tier2MinMs: 0,
		}).run(context());

		expect(signal).toMatchObject({ status: "pass", reenter: false });
		expect(dataOf(signal).runs).toMatchObject([
			{ tier: 1, tests: [DIRECT], exitCode: 0 },
			{ tier: 2, tests: [TRANSITIVE], exitCode: 0 },
		]);
	});

	test("is unavailable when the project's config excludes every listed file", async () => {
		const excluded = "e2e/x.test.ts";
		await writeFiles({
			"package.json": JSON.stringify({
				type: "module",
				scripts: { test: "vitest run" },
			}),
			"vitest.config.ts": [
				'import { defineConfig } from "vitest/config";',
				'export default defineConfig({ test: { include: ["tests/**/*.test.ts"] } });',
				"",
			].join("\n"),
			[excluded]: 'import { test } from "vitest";\ntest("x", () => {});\n',
		});
		await symlink(
			join(REPO_ROOT, "node_modules"),
			join(tmp.path, "node_modules"),
		);
		const radius = blastRadius([excluded]);
		const priorSignals: Signal[] = [
			{
				...radius,
				data: {
					graph: "current",
					radius: { changed: [excluded], tests: [excluded] },
				},
			},
		];

		const signal = await createBlastTestsProvider({
			loadGraph: async () => undefined,
		}).run(context({ changedFiles: [excluded], priorSignals }));

		expect(signal).toMatchObject({
			status: "info",
			summary: `0 blast-radius tests passed; tier 1 not run: the test runner selected none of the listed files: ${excluded}`,
			reenter: false,
		});
		expect(dataOf(signal)).toMatchObject({
			skipped: true,
			unavailable: true,
			tier1: [excluded],
			runs: [{ tier: 1, tests: [excluded], verdict: "not-run", exitCode: 1 }],
		});
		expect(dataOf(signal).runs?.[0]?.outputTail).toContain(
			"No test files found",
		);
	});

	/** `tests/` is included; `e2e/x.test.ts` imports the changed file but the config excludes it. */
	async function writeMixedFixture(script: string): Promise<string> {
		const excluded = "e2e/x.test.ts";
		await writeVitestFixture(false);
		await writeFiles({
			"package.json": JSON.stringify({
				type: "module",
				scripts: { test: script },
			}),
			"vitest.config.ts": [
				'import { defineConfig } from "vitest/config";',
				'export default defineConfig({ test: { include: ["tests/**/*.test.ts"] } });',
				"",
			].join("\n"),
			[excluded]:
				'import { expect, test } from "vitest";\nimport { sum } from "../src/sum.ts";\ntest("x", () => expect(sum(1, 1)).toBe(2));\n',
		});
		return excluded;
	}

	function mixedRadius(tests: readonly string[]): Signal[] {
		return [
			{
				...blastRadius(tests),
				data: {
					graph: "current",
					radius: { changed: ["src/sum.ts"], tests },
				},
			},
		];
	}

	test("passes only for the files the runner ran when the config excludes one of a tier's files", async () => {
		const excluded = await writeMixedFixture("vitest run");
		const graph = {
			...GRAPH,
			edges: [DIRECT, excluded].map((from) => ({
				from,
				to: "src/sum.ts",
				typeOnly: false,
			})),
		} as unknown as FileGraph;

		const signal = await createBlastTestsProvider({
			loadGraph: async () => graph,
		}).run(context({ priorSignals: mixedRadius([DIRECT, excluded]) }));

		expect(signal).toMatchObject({
			status: "info",
			summary:
				"1 blast-radius tests passed; 1 not run: the test runner did not run them",
		});
		expect(dataOf(signal).runs).toMatchObject([
			{
				tier: 1,
				tests: [DIRECT, excluded],
				verdict: "passed",
				executed: [DIRECT],
				exitCode: 0,
			},
		]);
		expect(dataOf(signal).notRun).toEqual([
			{ tests: [excluded], reason: "the test runner did not run them" },
		]);
	});

	test("is unavailable when passWithNoTests exits 0 having run none of the listed files", async () => {
		const excluded = await writeMixedFixture("vitest run --passWithNoTests");

		const signal = await createBlastTestsProvider({
			loadGraph: async () => undefined,
		}).run(context({ priorSignals: mixedRadius([excluded]) }));

		expect(dataOf(signal).runs).toMatchObject([
			{
				verdict: "not-run",
				reason: "the test runner selected none of the listed files",
				exitCode: 0,
			},
		]);
		expect(unavailableReason(signal)).toBe(
			`no tests executed: tier 2 not run: the test runner selected none of the listed files: ${excluded}`,
		);
	});

	test("fails and re-enters when a listed test fails", async () => {
		await writeVitestFixture(true);

		const signal = await createBlastTestsProvider({
			loadGraph: async () => GRAPH,
		}).run(context());

		expect(signal).toMatchObject({ status: "fail", reenter: true });
		expect(dataOf(signal).runs?.[0]?.outputTail).toContain("adds");
	});

	test.each([
		[
			"in its assertion",
			'test("a", () => { expect("No test files found, exiting with code 1").toBe("x"); });',
		],
		[
			"in its own console output",
			'test("a", () => { console.log("No tests found, exiting with code 1"); expect(1).toBe(2); });',
		],
	])("fails and re-enters when a failing test prints the nothing-selected text %s", async (_name, body) => {
		await writeFiles({
			"package.json": JSON.stringify({
				type: "module",
				scripts: { test: "vitest run" },
			}),
			[DIRECT]: `import { expect, test } from "vitest";\n${body}\n`,
		});
		await symlink(
			join(REPO_ROOT, "node_modules"),
			join(tmp.path, "node_modules"),
		);

		const signal = await createBlastTestsProvider({
			loadGraph: async () => undefined,
		}).run(context({ priorSignals: [blastRadius([DIRECT])] }));

		expect(signal).toMatchObject({ status: "fail", reenter: true });
		expect(dataOf(signal).runs?.[0]).toMatchObject({
			tier: 1,
			tests: [DIRECT],
			verdict: "failed",
		});
		expect(dataOf(signal).runs?.[0]?.outputTail).toContain("Test Files");
	});
});
