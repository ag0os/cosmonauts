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
import { unavailableReason } from "../../../lib/lean-run/signal-availability.ts";
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

function exited(code: number): ProviderProcessOutcome {
	return { kind: "code-exit", code, stdout: `exit ${code}`, stderr: "" };
}

function stubRunner(
	outcomes: readonly ProviderProcessOutcome[] = [exited(0)],
): StubRunner {
	const calls: StubRunner["calls"] = [];
	return {
		calls,
		run: async (invocation, _signal, options) => {
			calls.push({ invocation, timeoutMs: options?.timeoutMs });
			return outcomes[calls.length - 1] ?? outcomes.at(-1) ?? exited(0);
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
				return exited(1);
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
	])("is unavailable when %s", async (_name, priorSignals, summary) => {
		await writeFixture();
		const runner = stubRunner();

		const signal = await provider(runner).run(context({ priorSignals }));

		expect(runner.calls).toHaveLength(0);
		expect(signal).toEqual({
			kind: "blast-tests",
			status: "info",
			summary,
			data: { reason: summary, skipped: true, unavailable: true },
			reenter: false,
		});
	});

	test.each([
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
	])("is info when %s", async (_name, priorSignals, summary) => {
		await writeFixture();
		const runner = stubRunner();

		const signal = await provider(runner).run(context({ priorSignals }));

		expect(runner.calls).toHaveLength(0);
		expect(signal).toEqual({
			kind: "blast-tests",
			status: "info",
			summary,
			data: { reason: summary, skipped: true },
			reenter: false,
		});
	});

	test("is info when the radius lists no tests", async () => {
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
		expect(unavailableReason(signal)).toBeUndefined();
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

	test("is skipped info when the project's config excludes every listed file", async () => {
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
			tier1: [excluded],
			runs: [{ tier: 1, tests: [excluded], verdict: "not-run", exitCode: 1 }],
		});
		expect(dataOf(signal).runs?.[0]?.outputTail).toContain(
			"No test files found",
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
});
