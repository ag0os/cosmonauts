import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
	openAuditEpoch,
	readAuditIndex,
	readCurrentEpochManifest,
} from "../../../scripts/test-health-audit/artifacts.ts";
import { reconcileCensus } from "../../../scripts/test-health-audit/census.ts";
import { runCli } from "../../../scripts/test-health-audit/cli.ts";
import {
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
			censusDigest: SHA,
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
