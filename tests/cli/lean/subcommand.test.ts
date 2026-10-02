/**
 * Tests for cli/lean/subcommand.ts: `cosmonauts lean check` on fixture
 * plans, and `lean build` / `lean review` as thin callers of an injected
 * runBuild / runReview.
 */

import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createLeanProgram } from "../../../cli/lean/subcommand.ts";
import type {
	RunBuildOptions,
	RunReviewOptions,
} from "../../../lib/lean-run/run-build.ts";
import type {
	BuilderBackend,
	LeanBackendKind,
	RunRecord,
	RunStatus,
} from "../../../lib/lean-run/types.ts";
import { captureCliOutput } from "../../helpers/cli.ts";
import { useTempDir } from "../../helpers/fs.ts";

const tmp = useTempDir("cli-lean-");

const PROJECT: Readonly<Record<string, string>> = {
	"package.json": JSON.stringify({ type: "module" }),
	"tsconfig.json": JSON.stringify({
		compilerOptions: { module: "NodeNext", noEmit: true, strict: true },
	}),
	"src/greet.ts": 'export const greet = (): string => "hi";\n',
	"src/name.ts": 'export const name = "lean";\n',
};

const GOOD_PLAN = `# Greet by name

## Approach
Greet with the name.

## Touches
- \`src/greet.ts\` — uses the name

## Reuses
- \`src/name.ts\` — the name

## Behaviors
- B-1: user / \`greet()\` / sees "hi lean"

## Risks
- none

## Diagram
\`\`\`mermaid
graph TD; greet-->name
\`\`\`
`;

async function writeFiles(files: Readonly<Record<string, string>>) {
	for (const [path, content] of Object.entries(files)) {
		await mkdir(dirname(join(tmp.path, path)), { recursive: true });
		await writeFile(join(tmp.path, path), content);
	}
}

let output: ReturnType<typeof captureCliOutput> | undefined;

afterEach(() => {
	output?.restore();
	output = undefined;
});

async function run(
	argv: string[],
	overrides: Parameters<typeof createLeanProgram>[0] = {},
) {
	const exitCodes: number[] = [];
	const program = createLeanProgram({
		cwd: tmp.path,
		setExitCode: (code) => exitCodes.push(code),
		...overrides,
	});
	for (const command of [program, ...program.commands]) command.exitOverride();
	output = captureCliOutput();
	await program.parseAsync(argv, { from: "user" });
	const result = {
		stdout: output.stdout(),
		stderr: output.stderr(),
		exitCode: exitCodes.at(-1),
	};
	output.restore();
	output = undefined;
	return result;
}

async function checkJson(plan: string) {
	await writeFiles({ ...PROJECT, "plan.md": plan });
	const result = await run(["check", "plan.md", "--json"]);
	return { ...result, report: JSON.parse(result.stdout) };
}

describe("lean check", () => {
	test("reports a good plan ok with exit 0", async () => {
		const { report, exitCode } = await checkJson(GOOD_PLAN);

		expect(report).toEqual({
			plan: "plan.md",
			ok: true,
			title: "Greet by name",
			emptySections: [],
			pathWarnings: [],
			behaviorProblems: [],
			graph: "available",
		});
		expect(exitCode).toBe(0);
	});

	test("names empty and missing sections and exits 1", async () => {
		const plan = GOOD_PLAN.replace("Greet with the name.", "").replace(
			/## Diagram[\s\S]*$/u,
			"",
		);

		const { report, exitCode } = await checkJson(plan);

		expect(report.emptySections).toEqual(["Approach", "Diagram"]);
		expect(report.ok).toBe(false);
		expect(exitCode).toBe(1);
	});

	test("reports a behavior line missing a part and exits 1", async () => {
		const plan = GOOD_PLAN.replace(
			'- B-1: user / `greet()` / sees "hi lean"',
			"- B-1: user / `greet()`",
		);

		const { report, exitCode } = await checkJson(plan);

		expect(report.behaviorProblems).toEqual([
			'B-1: missing outcome (want "B-1: observer / entry point / outcome")',
		]);
		expect(exitCode).toBe(1);
	});

	test("stays ok with prose and a wrapped continuation in Behaviors", async () => {
		const plan = GOOD_PLAN.replace(
			'- B-1: user / `greet()` / sees "hi lean"',
			'Each behavior is observable from the shell.\n- B-1: user / `greet()` / sees\n  "hi lean"',
		);

		const { report, exitCode } = await checkJson(plan);

		expect(report.behaviorProblems).toEqual([]);
		expect(report.ok).toBe(true);
		expect(exitCode).toBe(0);
	});

	test("reports a Behaviors bullet the host drops next to a valid one and exits 1", async () => {
		const plan = GOOD_PLAN.replace(
			'- B-1: user / `greet()` / sees "hi lean"',
			'- B-1: user / `greet()` / sees "hi lean"\n- operator / api / sees bad',
		);

		const { report, exitCode } = await checkJson(plan);

		expect(report.emptySections).toEqual([]);
		expect(report.behaviorProblems).toEqual([
			"not a behavior line (parsePlan drops it): - operator / api / sees bad",
		]);
		expect(report.ok).toBe(false);
		expect(exitCode).toBe(1);
	});

	test("warns on a path the graph cannot show but stays ok", async () => {
		const plan = GOOD_PLAN.replace(
			"- `src/greet.ts` — uses the name",
			"- `src/greet.ts` — uses the name\n- `src/farewell.ts` — new",
		);

		const { report, exitCode } = await checkJson(plan);

		expect(report.pathWarnings).toEqual([
			"plan path not found (new file?): src/farewell.ts",
		]);
		expect(report.ok).toBe(true);
		expect(exitCode).toBe(0);
	});

	test("reports the graph unavailable and still checks the plan", async () => {
		await writeFiles({
			"plan.md": GOOD_PLAN.replace("Greet with the name.", ""),
		});

		const { stdout, exitCode } = await run(["check", "plan.md", "--json"]);
		const report = JSON.parse(stdout);

		expect(report.graph).toMatch(/^unavailable: .*TypeScript/u);
		expect(report.pathWarnings).toEqual([]);
		expect(report.emptySections).toEqual(["Approach"]);
		expect(exitCode).toBe(1);
	});

	test("prints short lines without --json", async () => {
		await writeFiles({
			...PROJECT,
			"plan.md": GOOD_PLAN.replace("Greet with the name.", ""),
		});

		const { stdout } = await run(["check", "plan.md"]);

		expect(stdout.trim().split("\n")).toEqual([
			"plan.md: not ok (Greet by name)",
			"empty section: Approach",
		]);
	});

	test("exits 1 with a message on stderr when the plan cannot be read", async () => {
		const { stdout, stderr, exitCode } = await run(["check", "missing.md"]);

		expect(stdout).toBe("");
		expect(stderr).toMatch(/^cannot read missing\.md: .*ENOENT/u);
		expect(exitCode).toBe(1);
	});

	test("prints one JSON error line and exits 1 when the plan cannot be read under --json", async () => {
		const { stdout, stderr, exitCode } = await run([
			"check",
			"missing.md",
			"--json",
		]);

		expect(stdout.split("\n")).toEqual([expect.any(String), ""]);
		expect(JSON.parse(stdout)).toEqual({
			error: expect.stringMatching(/^cannot read missing\.md: .*ENOENT/u),
		});
		expect(stderr).toBe("");
		expect(exitCode).toBe(1);
	});
});

const BACKEND: BuilderBackend = { kind: "pi", run: async () => ({ text: "" }) };
const REVIEWER: BuilderBackend = {
	kind: "pi",
	run: async () => ({ text: "" }),
};

function record(status: RunStatus, reason?: string): RunRecord {
	return {
		dir: "/project/missions/sessions/lean/runs/r-1",
		manifest: {
			id: "r-1",
			baseSha: "abc",
			planPath: "plan.md",
			backend: "pi",
			reentries: 0,
			snapshotRefs: [],
			status,
			...(reason === undefined ? {} : { reason }),
			createdAt: "2026-10-01T00:00:00.000Z",
		},
		envelopes: {},
		facts: { passes: [] },
		stats: [],
	};
}

function doubles(result: RunRecord) {
	const builds: RunBuildOptions[] = [];
	const reviews: RunReviewOptions[] = [];
	const kinds: [LeanBackendKind, string][] = [];
	return {
		builds,
		reviews,
		kinds,
		options: {
			providers: [],
			runBuild: vi.fn(async (options: RunBuildOptions) => {
				builds.push(options);
				return result;
			}),
			runReview: vi.fn(async (options: RunReviewOptions) => {
				reviews.push(options);
				return result;
			}),
			createBackends: async (kind: LeanBackendKind, root: string) => {
				kinds.push([kind, root]);
				return { builder: BACKEND, reviewer: REVIEWER };
			},
		},
	};
}

describe("lean build", () => {
	test("calls runBuild with the plan, spec and backend, and no required-signals or budget override", async () => {
		const { builds, kinds, options } = doubles(record("done"));

		await run(
			[
				"build",
				"--plan",
				"plan.md",
				"--spec",
				"spec.md",
				"--backend",
				"codex-cli",
			],
			options,
		);

		expect(kinds).toEqual([["codex-cli", tmp.path]]);
		expect(builds).toEqual([
			{
				projectRoot: tmp.path,
				planPath: "plan.md",
				specPath: "spec.md",
				backend: BACKEND,
				reviewerBackend: REVIEWER,
				providers: [],
				signal: expect.any(AbortSignal),
			},
		]);
	});

	test("defaults the backend to pi and passes no spec", async () => {
		const { builds, kinds, options } = doubles(record("done"));

		await run(["build", "--plan", "plan.md"], options);

		expect(kinds[0]?.[0]).toBe("pi");
		expect(builds[0]).not.toHaveProperty("specPath");
		expect(builds[0]).not.toHaveProperty("userMessages");
	});

	test("prints the run as JSON with a null reason and exits 0 when done", async () => {
		const { options } = doubles(record("done"));

		const { stdout, exitCode } = await run(
			["build", "--plan", "plan.md", "--json"],
			options,
		);

		expect(JSON.parse(stdout)).toEqual({
			runId: "r-1",
			status: "done",
			reason: null,
			summary: expect.any(String),
			runDir: "/project/missions/sessions/lean/runs/r-1",
		});
		expect(exitCode).toBe(0);
	});

	test("prints the record's reason and exits 1 when the run is not done", async () => {
		const { options } = doubles(record("blocked", "verify still failing"));

		const { stdout, exitCode } = await run(
			["build", "--plan", "plan.md", "--json"],
			options,
		);

		expect(JSON.parse(stdout)).toMatchObject({
			status: "blocked",
			reason: "verify still failing",
		});
		expect(exitCode).toBe(1);
	});

	test("passes clearStaleLock only when --clear-stale-lock is given", async () => {
		const { builds, options } = doubles(record("done"));

		await run(["build", "--plan", "plan.md", "--clear-stale-lock"], options);
		await run(["build", "--plan", "plan.md"], options);

		expect(builds[0]?.clearStaleLock).toBe(true);
		expect(builds[1]).not.toHaveProperty("clearStaleLock");
	});

	test("prints one JSON error line and exits 1 when runBuild throws under --json", async () => {
		const { options } = doubles(record("done"));
		const runBuild = async () => {
			throw new Error("plan.md: no such file");
		};

		const { stdout, exitCode } = await run(
			["build", "--plan", "plan.md", "--json"],
			{ ...options, runBuild },
		);

		expect(stdout).toBe('{"error":"plan.md: no such file"}\n');
		expect(exitCode).toBe(1);
	});

	test("lets a runBuild throw reach the caller without --json", async () => {
		const { options } = doubles(record("done"));
		const runBuild = async () => {
			throw new Error("plan.md: no such file");
		};

		await expect(
			run(["build", "--plan", "plan.md"], { ...options, runBuild }),
		).rejects.toThrow("plan.md: no such file");
	});

	test("prints a bad option as one JSON error line under --json", async () => {
		const { options } = doubles(record("done"));
		output = captureCliOutput();
		const program = createLeanProgram({ cwd: tmp.path, ...options });
		for (const command of [program, ...program.commands])
			command.exitOverride();

		await expect(
			program.parseAsync(
				["build", "--plan", "plan.md", "--backend", "nope", "--json"],
				{ from: "user" },
			),
		).rejects.toMatchObject({ exitCode: 1 });

		expect(JSON.parse(output.stdout()).error).toMatch(/'nope' is invalid/u);
		expect(output.stderr()).toBe("");
	});

	async function commanderFailure(argv: string[]) {
		const { options } = doubles(record("done"));
		output = captureCliOutput();
		const program = createLeanProgram({ cwd: tmp.path, ...options });
		for (const command of [program, ...program.commands])
			command.exitOverride();
		await expect(
			program.parseAsync(argv, { from: "user" }),
		).rejects.toMatchObject({ exitCode: 1 });
		return { stdout: output.stdout(), stderr: output.stderr() };
	}

	test.each([
		[
			"an option value",
			["build", "--plan", "--json", "--backend", "nope"],
			/'nope' is invalid/u,
		],
		["after --", ["check", "x.md", "--", "--json"], /too many arguments/u],
	])("prints a commander error as plain stderr when --json is %s", async (_, argv, error) => {
		const { stdout, stderr } = await commanderFailure(argv);

		expect(stdout).toBe("");
		expect(stderr).toMatch(error);
	});

	test("prints a commander error as JSON for a --json flag before --", async () => {
		const { stdout, stderr } = await commanderFailure([
			"check",
			"--json",
			"x.md",
			"--",
			"extra",
		]);

		expect(JSON.parse(stdout).error).toMatch(/too many arguments/u);
		expect(stderr).toBe("");
	});

	test("aborts the run's signal on SIGINT", async () => {
		const signals = new EventEmitter();
		const { options } = doubles(record("failed", "aborted"));
		let received: AbortSignal | undefined;
		const runBuild = async (build: RunBuildOptions) => {
			received = build.signal;
			signals.emit("SIGINT");
			return record("failed", "aborted");
		};

		await run(["build", "--plan", "plan.md"], {
			...options,
			runBuild,
			signals,
		});

		expect(received?.aborted).toBe(true);
		expect(signals.listenerCount("SIGINT")).toBe(0);
	});
});

describe("lean review", () => {
	test("passes clearStaleLock when --clear-stale-lock is given", async () => {
		const { reviews, options } = doubles(record("done"));

		await run(["review", "--clear-stale-lock"], options);

		expect(reviews[0]?.clearStaleLock).toBe(true);
	});

	test("calls runReview with the base, plan and reviewer and prints the findings", async () => {
		const done: RunRecord = {
			...record("done"),
			envelopes: {
				reviewer: {
					outcome: "done",
					summary: "one issue",
					findings: [
						{
							id: "F-1",
							severity: "medium",
							file: "src/x.ts:3",
							summary: "unchecked input",
							fix: "validate it",
						},
					],
				},
			},
		};
		const { reviews, options } = doubles(done);

		const { stdout, exitCode } = await run(
			["review", "--base", "main", "--plan", "plan.md", "--json"],
			options,
		);

		expect(reviews).toEqual([
			{
				projectRoot: tmp.path,
				base: "main",
				planPath: "plan.md",
				reviewerBackend: REVIEWER,
				signal: expect.any(AbortSignal),
			},
		]);
		const printed = JSON.parse(stdout);
		expect(Object.keys(printed)).toEqual([
			"runId",
			"status",
			"reason",
			"summary",
			"findings",
			"runDir",
		]);
		expect(printed.findings).toHaveLength(1);
		expect(exitCode).toBe(0);
	});
});

describe("bin/cosmonauts lean check", () => {
	const CLI = join(
		resolve(fileURLToPath(import.meta.url), "..", "..", "..", ".."),
		"bin",
		"cosmonauts",
	);

	test("prints the report as JSON from a real process", async () => {
		await writeFiles({ ...PROJECT, "plan.md": GOOD_PLAN });

		const { stdout } = await promisify(execFile)(
			"bun",
			[CLI, "lean", "check", "plan.md", "--json"],
			{ cwd: tmp.path, encoding: "utf-8" },
		);

		expect(JSON.parse(stdout)).toMatchObject({ plan: "plan.md", ok: true });
	});
});
