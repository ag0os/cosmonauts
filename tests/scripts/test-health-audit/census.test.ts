import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
	openAuditEpoch,
	readAuditIndex,
	readCurrentEpochManifest,
} from "../../../scripts/test-health-audit/artifacts.ts";
import {
	commandCensusDigest,
	reconcileCensus,
	sourceCensusDigest,
} from "../../../scripts/test-health-audit/census.ts";
import {
	persistCensusArtifacts,
	readFindingDispositions,
	runCli,
} from "../../../scripts/test-health-audit/cli.ts";
import {
	AuditRuntimeReporter,
	capturePublicRun,
	type PublicRunInput,
} from "../../../scripts/test-health-audit/runtime-reporter.ts";
import { collectSourceText } from "../../../scripts/test-health-audit/source-census.ts";

const roots: string[] = [];
const SHA = "a".repeat(64);

afterEach(async () => {
	const { rm } = await import("node:fs/promises");
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true })),
	);
});

function runtime(overrides: Partial<PublicRunInput> = {}) {
	return capturePublicRun({
		command: { id: "normal", surface: "normal", argv: ["bun", "run", "test"] },
		root: "/repo",
		configFile: "/repo/vitest.config.ts",
		reason: "passed",
		exitCode: 0,
		modules: [],
		unhandledErrors: [],
		...overrides,
	});
}

describe("test health audit census", () => {
	// @cosmo-behavior plan:test-health-audit#B-002
	test("reconciles all command surfaces and keeps unsupported or phase-unknown failures blocking", () => {
		const source = collectSourceText(
			"tests/fixture.test.ts",
			`import { describe as suite, it as spec, test as check, expect } from "vitest";
			 suite("outer", () => {
			   spec.each([[1], [2]])("parameter %s", (value) => expect(value).toBeTruthy());
			   check.skip("skipped", () => {});
			   check.todo("todo");
			   check.runIf(enabled)("conditional registration", () => expect(true).toBe(true));
			   check("conditional assertion", () => { if (enabled) expect(true).toBe(true); });
			 });
			 const dynamicTitle = "dynamic";
			 check(dynamicTitle, () => {});`,
		);

		expect(
			source.declarations.map((item) => [
				item.title,
				item.parameterCount,
				item.mode,
			]),
		).toEqual([
			["outer > parameter %s", 2, "run"],
			["outer > skipped", 1, "skip"],
			["outer > todo", 1, "todo"],
			["outer > conditional registration", 1, "conditional"],
			["outer > conditional assertion", 1, "run"],
		]);
		expect(source.declarations.at(-1)?.assertionCandidates).toEqual([
			expect.objectContaining({ conditional: true }),
		]);
		expect(source.limitations).toEqual([
			expect.objectContaining({ kind: "unsupported-syntax", basis: "blocked" }),
		]);

		const normal = runtime({
			modules: [
				{
					id: "module-1",
					moduleId: "/repo/tests/fixture.test.ts",
					state: "failed",
					errors: [{ name: "SyntaxError", message: "collection exploded" }],
					suites: [
						{
							id: "suite-1",
							name: "outer",
							fullName: "outer",
							state: "failed",
							errors: [],
						},
					],
					cases: [
						{
							id: "case-1",
							name: "parameter 1",
							fullName: "outer > parameter 1",
							state: "passed",
							errors: [],
						},
						{
							id: "case-2",
							name: "runtime only",
							fullName: "outer > runtime only",
							state: "failed",
							errors: [{ message: "beforeEach hook failed" }],
						},
						{
							id: "case-3",
							name: "skipped",
							fullName: "outer > skipped",
							state: "skipped",
							errors: [],
						},
					],
				},
			],
			hooks: [
				{
					name: "beforeEach",
					entityId: "case-2",
					entityType: "test",
					event: "end",
				},
			],
		});
		const watch = runtime({
			command: {
				id: "watch",
				surface: "watch",
				argv: ["bun", "run", "test:watch", "--", "--watch"],
			},
			filters: ["outer"],
		});
		const coverage = runtime({
			command: {
				id: "coverage",
				surface: "coverage",
				argv: ["bun", "run", "test:coverage"],
			},
			exitCode: 1,
			stderr: "Coverage for branches does not meet global threshold",
			modules: [
				{
					id: "coverage-module",
					moduleId: "/repo/tests/fixture.test.ts",
					state: "passed",
					errors: [],
					suites: [],
					cases: [
						{
							id: "p1",
							name: "parameter 1",
							fullName: "outer > parameter 1",
							state: "passed",
							errors: [],
						},
						{
							id: "p2",
							name: "parameter 2",
							fullName: "outer > parameter 2",
							state: "passed",
							errors: [],
						},
						{
							id: "s",
							name: "skipped",
							fullName: "outer > skipped",
							state: "skipped",
							errors: [],
						},
						{
							id: "t",
							name: "todo",
							fullName: "outer > todo",
							state: "skipped",
							errors: [],
						},
						{
							id: "cr",
							name: "conditional registration",
							fullName: "outer > conditional registration",
							state: "passed",
							errors: [],
						},
						{
							id: "ca",
							name: "conditional assertion",
							fullName: "outer > conditional assertion",
							state: "passed",
							errors: [],
						},
					],
				},
			],
		});
		const repeat = runtime({
			command: {
				id: "repeat",
				surface: "repeat",
				argv: ["bun", "run", "test"],
			},
			modules: [
				{
					id: "repeat-module",
					moduleId: "/repo/tests/fixture.test.ts",
					state: "failed",
					errors: [],
					suites: [],
					cases: [
						{
							id: "case-1",
							name: "parameter 1",
							fullName: "outer > parameter 1",
							state: "failed",
							errors: [{ message: "repeat failure" }],
						},
					],
				},
			],
		});
		const mismatched = runtime({
			command: {
				id: "unexpected",
				surface: "repeat",
				argv: ["bun", "run", "test"],
			},
		});

		expect(normal.errors).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					phase: "collection",
					phaseBasis: "observed",
				}),
				expect.objectContaining({
					phase: "unknown",
					phaseBasis: "blocked",
					publicPayload: { message: "beforeEach hook failed" },
				}),
			]),
		);
		const result = reconcileCensus({
			sources: [source],
			runs: [normal, watch, coverage, repeat, mismatched],
			expectedCommands: [
				{ id: "normal", surface: "normal" },
				{ id: "watch", surface: "watch" },
				{ id: "coverage", surface: "coverage" },
				{ id: "repeat", surface: "repeat" },
			],
		});

		expect(result.state).toBe("blocked");
		expect(result.clean).toBe(false);
		expect(result.findings.map((finding) => finding.kind)).toEqual(
			expect.arrayContaining([
				"source-only",
				"runtime-only",
				"parameter-count-mismatch",
				"filtered-selection",
				"unsupported-syntax",
				"collection-error",
				"unknown-error-phase",
				"command-mismatch",
				"outcome-mismatch",
			]),
		);
		expect(result.commandEvidence).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					commandId: "coverage",
					classification: "post-run-policy-exit",
				}),
			]),
		);
		expect(result.residualUncertainty.join("\n")).toMatch(
			/coverage.*non-zero/i,
		);
	});

	test("writes immutable manifests and advances only the atomically replaced index", async () => {
		const root = await mkdtemp(join(tmpdir(), "audit-epochs-"));
		roots.push(root);
		const first = {
			schemaVersion: 1 as const,
			methodVersion: "1",
			epochId: "epoch-1",
			evaluatedRevision: "abc123",
			createdAt: "2026-09-16T20:00:00.000Z",
			materialInputs: [{ path: "vitest.config.ts", sha256: SHA }],
			commandDefinitions: [
				{
					id: "normal",
					surface: "normal" as const,
					argv: ["bun", "run", "test"],
				},
			],
			sourceCensusDigest: SHA,
		};
		await openAuditEpoch(root, first);
		const manifestPath = join(root, "epochs", "epoch-1", "manifest.json");
		const before = await readFile(manifestPath, "utf8");
		await openAuditEpoch(root, {
			...first,
			epochId: "epoch-2",
			createdAt: "2026-09-16T21:00:00.000Z",
		});

		expect(await readAuditIndex(root)).toEqual({
			currentEpochId: "epoch-2",
			epochIds: ["epoch-1", "epoch-2"],
		});
		expect(await readFile(manifestPath, "utf8")).toBe(before);
		expect((await readCurrentEpochManifest(root)).epochId).toBe("epoch-2");
		await expect(openAuditEpoch(root, first)).rejects.toThrow(
			/immutable|already exists/i,
		);
	});

	test("reports declarations outside a filtered command as not-selected", () => {
		const selected = collectSourceText(
			"tests/selected.test.ts",
			'import { test } from "vitest"; test("selected case", () => {});',
		);
		const unselected = collectSourceText(
			"tests/unselected.test.ts",
			'import { test } from "vitest"; test("unselected case", () => {});',
		);
		const isolation = runtime({
			command: {
				id: "isolation",
				surface: "isolation",
				argv: ["bun", "run", "test", "tests/selected.test.ts"],
			},
			filters: ["tests/selected.test.ts"],
			modules: [
				{
					id: "selected-module",
					moduleId: "/repo/tests/selected.test.ts",
					state: "passed",
					errors: [],
					suites: [],
					cases: [
						{
							id: "selected-case",
							name: "selected case",
							fullName: "selected case",
							state: "passed",
							errors: [],
						},
					],
				},
			],
		});

		const result = reconcileCensus({
			sources: [selected, unselected],
			runs: [isolation],
			expectedCommands: [{ id: "isolation", surface: "isolation" }],
		});

		expect(result.findings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "not-selected",
					commandId: "isolation",
					detail: expect.stringContaining("unselected case"),
				}),
			]),
		);
		expect(
			result.findings.filter((finding) => finding.kind === "source-only"),
		).toEqual([]);
	});

	test("allows a fully green suite to be clean without complete hook events", () => {
		const source = collectSourceText(
			"tests/green.test.ts",
			'import { test } from "vitest"; test("green case", () => {});',
		);
		const green = runtime({
			modules: [
				{
					id: "green-module",
					moduleId: "/repo/tests/green.test.ts",
					state: "passed",
					errors: [],
					suites: [],
					cases: [
						{
							id: "green-case",
							name: "green case",
							fullName: "green case",
							state: "passed",
							errors: [],
						},
					],
				},
			],
			hooks: [
				{
					name: "beforeEach",
					entityId: "green-case",
					entityType: "test",
					event: "start",
				},
			],
		});

		const result = reconcileCensus({
			sources: [source],
			runs: [green],
			expectedCommands: [{ id: "normal", surface: "normal" }],
		});

		expect(result).toMatchObject({ state: "complete", clean: true });
		expect(
			result.findings.filter(
				(finding) => finding.kind === "hook-lifecycle-incomplete",
			),
		).toEqual([]);
	});

	test("keeps conditional candidates in the non-blocking heuristic lane", () => {
		const source = collectSourceText(
			"tests/conditional.test.ts",
			'import { test, expect } from "vitest"; test("candidate", () => { if (enabled) expect(true).toBe(true); });',
		);
		const green = runtime({
			modules: [
				{
					id: "conditional-module",
					moduleId: "/repo/tests/conditional.test.ts",
					state: "passed",
					errors: [],
					suites: [],
					cases: [
						{
							id: "conditional-case",
							name: "candidate",
							fullName: "candidate",
							state: "passed",
							errors: [],
						},
					],
				},
			],
		});

		const result = reconcileCensus({
			sources: [source],
			runs: [green],
			expectedCommands: [{ id: "normal", surface: "normal" }],
		});

		expect(result).toMatchObject({ state: "complete", clean: true });
		expect(result.findings).toContainEqual(
			expect.objectContaining({
				kind: "conditional-observation",
				lane: "agent-assessed-judgment",
				basis: "reasoned",
			}),
		);
	});

	test("counts nested multiline each literals and blocks dynamic parameter sets", () => {
		const source = collectSourceText(
			"tests/each.test.ts",
			`import { it, test } from "vitest";
			 it.each([
			   ["a", { nested: [1, 2] }],
			   ["c", { nested: [3, 4] }],
			 ])("literal %s", () => {});
			 it.each([["a"], ["b"]] satisfies readonly string[][])("satisfies %s", () => {});
			 it.each([["a"], ["b"]] as const)("as const %s", () => {});
			 it.each([["a"], ["b"]] as string[][])("as type %s", () => {});
			 it.each(<string[][]>[["a"], ["b"]])("angle assertion %s", () => {});
			 it.each((([["a"], ["b"]] as const) satisfies readonly string[][]))("nested wrappers %s", () => {});
			 test.each(cases)("identifier %s", () => {});
			 test.each([...cases])("spread %s", () => {});
			 test.each(makeCases())("call %s", () => {});`,
		);

		expect(
			source.declarations.map((declaration) => declaration.parameterCount),
		).toEqual([2, 2, 2, 2, 2, 2, null, null, null]);
		expect(source.limitations).toHaveLength(3);
		expect(
			source.limitations.every((limitation) => limitation.basis === "blocked"),
		).toBe(true);
	});

	test("uses recorded dispositions to account for findings without hiding them", () => {
		const source = collectSourceText(
			"tests/skipped.test.ts",
			'import { test } from "vitest"; test.skip("known skip", () => {});',
		);
		const skipped = runtime({
			modules: [
				{
					id: "skipped-module",
					moduleId: "/repo/tests/skipped.test.ts",
					state: "skipped",
					errors: [],
					suites: [],
					cases: [
						{
							id: "skipped-case",
							name: "known skip",
							fullName: "known skip",
							state: "skipped",
							errors: [],
						},
					],
				},
			],
		});
		const unresolved = reconcileCensus({
			sources: [source],
			runs: [skipped],
			expectedCommands: [{ id: "normal", surface: "normal" }],
		});
		expect(unresolved.state).toBe("incomplete");
		const dispositionIds = unresolved.findings
			.filter((finding) => finding.basis !== "reasoned")
			.map((finding) => finding.id);

		const accounted = reconcileCensus({
			sources: [source],
			runs: [skipped],
			expectedCommands: [{ id: "normal", surface: "normal" }],
			dispositions: dispositionIds.map((findingId) => ({
				findingId,
				disposition: "accounted-for",
				reasoning: "The assessing agent recorded the known limitation.",
				assessor: {
					kind: "agent",
					id: "test-health-assessor",
					model: "openai-codex/gpt-5",
					modelVersion: "2026-09-17",
					assessedAt: "2026-09-17T15:00:00.000Z",
					consultedAuthorities: [],
				},
			})),
		});

		expect(accounted).toMatchObject({ state: "complete", clean: true });
		expect(accounted.findings).toHaveLength(unresolved.findings.length);
		expect(accounted.findings.every((finding) => finding.accountedFor)).toBe(
			true,
		);
	});

	test("validates distinct repair dispositions and sourced accepted limitations", async () => {
		const root = await mkdtemp(join(tmpdir(), "audit-dispositions-"));
		roots.push(root);
		const assessor = {
			kind: "agent" as const,
			id: "test-health-assessor",
			model: "openai-codex/gpt-5",
			modelVersion: "2026-09-17",
			assessedAt: "2026-09-17T15:00:00.000Z",
			consultedAuthorities: [
				{
					kind: "source-span",
					path: "tests/example.test.ts",
					span: { startLine: 1, endLine: 4 },
				},
			],
		};
		const dispositions = [
			{
				findingId: "finding-1",
				disposition: "limitation-accepted" as const,
				reasoning: "The opened source contains a genuinely dynamic data set.",
				assessor,
			},
			{
				findingId: "finding-2",
				disposition: "repair-required-tooling" as const,
				reasoning: "The collector does not recognize supported syntax.",
				assessor,
			},
			{
				findingId: "finding-3",
				disposition: "repair-required-suite" as const,
				reasoning: "The suite has a real defect for later remediation.",
				assessor,
			},
		];
		await writeFile(
			join(root, "dispositions.json"),
			JSON.stringify(dispositions),
		);

		expect(await readFindingDispositions(root)).toEqual(dispositions);

		await writeFile(
			join(root, "dispositions.json"),
			JSON.stringify([
				{
					...dispositions[0],
					assessor: { ...assessor, consultedAuthorities: [] },
				},
			]),
			{ flag: "w" },
		);
		await expect(readFindingDispositions(root)).rejects.toThrow(
			/invalid dispositions\.json/,
		);
	});

	test("validates frozen source and post-run command digests independently", async () => {
		const root = await mkdtemp(join(tmpdir(), "audit-digests-"));
		roots.push(root);
		const source = collectSourceText(
			"tests/digest.test.ts",
			'import { test } from "vitest"; test("digest case", () => {});',
		);
		const run = runtime({
			modules: [
				{
					id: "digest-module",
					moduleId: "/repo/tests/digest.test.ts",
					state: "passed",
					errors: [],
					suites: [],
					cases: [
						{
							id: "digest-case",
							name: "digest case",
							fullName: "digest case",
							state: "passed",
							errors: [],
						},
					],
				},
			],
		});
		const sourceDigest = sourceCensusDigest([source]);
		const commandDigest = commandCensusDigest([run]);
		expect(commandDigest).not.toBe(sourceDigest);
		await openAuditEpoch(root, {
			schemaVersion: 1,
			methodVersion: "1",
			epochId: "epoch-1",
			evaluatedRevision: "abc123",
			createdAt: "2026-09-17T15:00:00.000Z",
			materialInputs: [{ path: "vitest.config.ts", sha256: SHA }],
			commandDefinitions: [
				{ id: "normal", surface: "normal", argv: ["bun", "run", "test"] },
			],
			sourceCensusDigest: sourceDigest,
		});
		const epoch = join(root, "epochs", "epoch-1");
		await mkdir(join(epoch, "raw"), { recursive: true });
		await writeFile(
			join(epoch, "source-census.json"),
			JSON.stringify([source]),
		);
		await writeFile(join(epoch, "raw", "normal.json"), JSON.stringify(run));
		await writeFile(
			join(epoch, "suite-integrity.json"),
			JSON.stringify({
				sourceCensusDigest: sourceDigest,
				commandCensusDigest: commandDigest,
			}),
		);

		expect(await runCli(["--audit-root", root, "validate"])).toBe(0);
		await writeFile(
			join(epoch, "suite-integrity.json"),
			JSON.stringify({
				sourceCensusDigest: sourceDigest,
				commandCensusDigest: SHA,
			}),
			{ flag: "w" },
		);
		expect(await runCli(["--audit-root", root, "validate"])).toBe(1);
	});

	test("classifies a coverage threshold exit from reporter evidence alone", () => {
		const source = collectSourceText(
			"tests/coverage.test.ts",
			'import { test } from "vitest"; test("declared case", () => {});',
		);
		const coverage = runtime({
			command: {
				id: "coverage",
				surface: "coverage",
				argv: ["bun", "run", "test:coverage"],
			},
			exitCode: 1,
			stderr: "Coverage for branches does not meet global threshold",
			modules: [],
		});

		const result = reconcileCensus({
			sources: [source],
			runs: [coverage],
			expectedCommands: [{ id: "coverage", surface: "coverage" }],
		});

		expect(result.findings.map((finding) => finding.kind)).toContain(
			"source-only",
		);
		expect(result.commandEvidence).toContainEqual(
			expect.objectContaining({
				commandId: "coverage",
				classification: "post-run-policy-exit",
			}),
		);
	});

	test("persists suite integrity JSON and Markdown with timing and watcher-start evidence", async () => {
		const root = await mkdtemp(join(tmpdir(), "audit-census-output-"));
		roots.push(root);
		const source = collectSourceText(
			"tests/watch.test.ts",
			'import { test } from "vitest"; test("watched case", () => {});',
		);
		const watch = runtime({
			command: {
				id: "watch",
				surface: "watch",
				argv: ["bun", "run", "test:watch", "--", "--watch"],
			},
			modules: [
				{
					id: "watch-module",
					moduleId: "/repo/tests/watch.test.ts",
					state: "passed",
					errors: [],
					suites: [],
					cases: [
						{
							id: "watch-case",
							name: "watched case",
							fullName: "watched case",
							state: "passed",
							errors: [],
						},
					],
				},
			],
			timing: {
				startedAt: "2026-09-17T14:00:00.000Z",
				endedAt: "2026-09-17T14:00:02.500Z",
				durationMs: 2_500,
			},
			watcherStart: {
				observedAt: "2026-09-17T14:00:00.000Z",
				scheduledFileCount: 1,
			},
		});
		const result = reconcileCensus({
			sources: [source],
			runs: [watch],
			expectedCommands: [{ id: "watch", surface: "watch" }],
		});

		await persistCensusArtifacts(
			root,
			[source],
			result,
			sourceCensusDigest([source]),
			commandCensusDigest([watch]),
		);

		const json = JSON.parse(
			await readFile(join(root, "suite-integrity.json"), "utf8"),
		) as {
			commandEvidence: Array<{
				timing?: { durationMs: number };
				watcherStart?: { scheduledFileCount: number };
			}>;
		};
		expect(json.commandEvidence[0]).toMatchObject({
			timing: { durationMs: 2_500 },
			watcherStart: { scheduledFileCount: 1 },
		});
		const markdown = await readFile(join(root, "suite-integrity.md"), "utf8");
		expect(markdown).toContain("# Suite integrity");
		expect(markdown).toContain("watch");
		expect(markdown).toContain("2500 ms");
		expect(markdown).toContain("watcher start observed");
	});

	test("reporter records public run timing and watch-cycle start evidence", async () => {
		const root = await mkdtemp(join(tmpdir(), "audit-reporter-"));
		roots.push(root);
		const reportPath = join(root, "reporter.json");
		const previous = {
			reportPath: process.env.COSMONAUTS_AUDIT_REPORT_PATH,
			command: process.env.COSMONAUTS_AUDIT_COMMAND,
			projectRoot: process.env.COSMONAUTS_AUDIT_PROJECT_ROOT,
		};
		process.env.COSMONAUTS_AUDIT_REPORT_PATH = reportPath;
		process.env.COSMONAUTS_AUDIT_COMMAND = JSON.stringify({
			id: "watch",
			surface: "watch",
			argv: ["bun", "run", "test:watch", "--", "--watch"],
		});
		process.env.COSMONAUTS_AUDIT_PROJECT_ROOT = "/repo";
		try {
			const reporter = new AuditRuntimeReporter();
			reporter.onTestRunStart([]);
			reporter.onTestRunEnd([], [], "passed");
			const evidence = JSON.parse(
				await readFile(reportPath, "utf8"),
			) as PublicRunInput;

			expect(evidence.timing).toEqual(
				expect.objectContaining({
					startedAt: expect.any(String),
					endedAt: expect.any(String),
					durationMs: expect.any(Number),
				}),
			);
			expect(evidence.watcherStart).toEqual(
				expect.objectContaining({
					observedAt: expect.any(String),
					scheduledFileCount: 0,
				}),
			);
		} finally {
			for (const [name, value] of Object.entries({
				COSMONAUTS_AUDIT_REPORT_PATH: previous.reportPath,
				COSMONAUTS_AUDIT_COMMAND: previous.command,
				COSMONAUTS_AUDIT_PROJECT_ROOT: previous.projectRoot,
			})) {
				if (value === undefined) delete process.env[name];
				else process.env[name] = value;
			}
		}
	});

	test("returns zero for recorded audit states and non-zero for untrustworthy tooling input", async () => {
		const root = await mkdtemp(join(tmpdir(), "audit-cli-"));
		roots.push(root);
		await mkdir(join(root, "epochs", "epoch-1"), { recursive: true });
		await writeFile(
			join(root, "index.json"),
			JSON.stringify({ currentEpochId: "epoch-1", epochIds: ["epoch-1"] }),
		);
		await writeFile(
			join(root, "epochs", "epoch-1", "manifest.json"),
			"not-json",
		);

		expect(await runCli(["--audit-root", root, "census"])).toBe(1);
		expect(
			await runCli(["--audit-root", root, "baseline"], {
				baseline: async () => "not established",
			}),
		).toBe(0);
		expect(
			await runCli(
				["--audit-root", root, "probe", "--confirm-probe", "probe-1"],
				{ probe: async (_root, id) => id === "probe-1" },
			),
		).toBe(0);
		expect(
			await runCli(["--audit-root", root, "prepare-units"], {
				prepareUnits: async () => "incomplete",
			}),
		).toBe(0);
		expect(
			await runCli(["--audit-root", root, "validate"], {
				validate: async () => true,
			}),
		).toBe(0);
		expect(
			await runCli(["--audit-root", join(root, "missing"), "census"]),
		).toBe(1);
	});
});
