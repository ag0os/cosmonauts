import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	digestMaterialInput,
	prepareProfileWorkQueue,
} from "../../../scripts/test-health-audit/artifacts.ts";
import { carryForwardProfileUnits } from "../../../scripts/test-health-audit/carry-forward.ts";
import { sourceCensusDigest } from "../../../scripts/test-health-audit/census.ts";
import type { TestEvidenceProfile } from "../../../scripts/test-health-audit/schema.ts";
import { collectSourceText } from "../../../scripts/test-health-audit/source-census.ts";

const ASSESSED_AT = "2026-09-17T13:00:00.000Z";
const SOURCE_PATH = "tests/carried.test.ts";
const SOURCE_TEXT =
	'import { test } from "vitest";\n' +
	'test("first case", () => {});\n' +
	'test("second case", () => {});\n';

function assessed(
	value: unknown,
	lane: "objective-observation" | "agent-assessed-judgment",
) {
	return {
		value,
		lane,
		basis: lane === "objective-observation" ? "observed" : "reasoned",
		assessor:
			lane === "objective-observation"
				? {
						kind: "collector",
						id: "vitest-reporter",
						version: "1",
						observedAt: ASSESSED_AT,
					}
				: {
						kind: "agent",
						id: "profile-assessor",
						model: "openai-codex",
						modelVersion: "gpt-5",
						assessedAt: ASSESSED_AT,
						consultedAuthorities: [
							{ kind: "authority-document", path: "docs/contract.md" },
						],
					},
		evidence: [
			{
				kind: "source-span",
				path: SOURCE_PATH,
				span: { startLine: 1, endLine: 1 },
			},
		],
		counterevidence: [],
		uncertainty: [],
		overrides: [],
	};
}

const COMMANDS = [
	{ id: "normal", surface: "normal", argv: ["bun", "run", "test"] },
] as const;

function reporterPayload(projectRoot: string, caseNames: readonly string[]) {
	return JSON.stringify({
		command: "bun run test",
		modules: [
			{
				moduleId: join(projectRoot, SOURCE_PATH),
				state: "passed",
				cases: caseNames.map((fullName) => ({ fullName, state: "passed" })),
			},
		],
	});
}

describe("test health audit carry-forward", () => {
	const roots: string[] = [];
	afterEach(async () => {
		for (const root of roots.splice(0)) await rm(root, { recursive: true });
	});

	async function fixture() {
		const root = await mkdtemp(join(tmpdir(), "audit-carry-"));
		roots.push(root);
		const projectRoot = join(root, "project");
		const auditRoot = join(projectRoot, "audit");
		const source = collectSourceText(SOURCE_PATH, SOURCE_TEXT);
		await mkdir(join(projectRoot, "tests"), { recursive: true });
		await mkdir(join(projectRoot, "docs"), { recursive: true });
		await writeFile(join(projectRoot, SOURCE_PATH), SOURCE_TEXT);
		await writeFile(join(projectRoot, "docs", "contract.md"), "# Contract\n");
		for (const [path, content] of [
			["method.md", "method v1\n"],
			["schema.json", '{"version":1}\n'],
			["inventory-row.json", '{"id":"BRI-001"}\n'],
			["runner.mjs", "export default {};\n"],
			["vitest.config.ts", "export default {};\n"],
			["tests/setup.ts", "export {};\n"],
		] as const) {
			await mkdir(join(projectRoot, path, ".."), { recursive: true });
			await writeFile(join(projectRoot, path), content);
		}

		for (const epochId of ["epoch-1", "epoch-2"]) {
			await mkdir(join(auditRoot, "epochs", epochId, "raw"), {
				recursive: true,
			});
			await writeFile(
				join(auditRoot, "epochs", epochId, "manifest.json"),
				JSON.stringify({
					schemaVersion: 1,
					methodVersion: "1",
					epochId,
					evaluatedRevision: "abc123",
					createdAt: "2026-09-17T12:00:00.000Z",
					materialInputs: [],
					commandDefinitions: COMMANDS,
					sourceCensusDigest: sourceCensusDigest([source]),
				}),
			);
			await writeFile(
				join(auditRoot, "epochs", epochId, "source-census.json"),
				JSON.stringify([source]),
			);
		}
		await writeFile(
			join(auditRoot, "index.json"),
			JSON.stringify({
				currentEpochId: "epoch-2",
				epochIds: ["epoch-1", "epoch-2"],
			}),
		);

		const queue = await prepareProfileWorkQueue(auditRoot, [source]);
		const unit = queue.units[0];
		if (!unit) throw new Error("fixture produced no work unit");
		const contractDigest = await digestMaterialInput(projectRoot, {
			path: "docs/contract.md",
			inputKind: "contract",
			scope: "file",
		});
		const profiles: TestEvidenceProfile[] = [];
		for (const identity of unit.identities)
			profiles.push({
				schemaVersion: 1,
				id: identity.id,
				source: {
					path: identity.path,
					line: identity.line,
					title: identity.title,
					ordinal: identity.ordinal,
					workUnitId: unit.id,
				},
				runtime: {
					...assessed(
						{
							discoveryBySurface: {
								normal: "passed",
								watch: "not-collected",
								coverage: "not-collected",
								repeat: "not-collected",
								shuffle: "not-collected",
								isolation: "not-collected",
							},
							caseNames: [identity.title],
							caseCount: 1,
						},
						"objective-observation",
					),
					evidence: [
						{
							kind: "command-output",
							path: "audit/epochs/epoch-1/raw/normal.reporter.json",
							locator: `normal:${identity.path}:${identity.title}`,
						},
					],
				},
				role: assessed("unit", "agent-assessed-judgment"),
				claim: assessed(
					{
						status: "identified",
						text: "the declared contract remains protected",
						authority: [
							{ kind: "authority-document", path: "docs/contract.md" },
						],
					},
					"agent-assessed-judgment",
				),
				chain: assessed(
					{
						assertions: [
							{
								kind: "source-span",
								path: identity.path,
								span: { startLine: identity.line, endLine: identity.endLine },
							},
						],
						observations: [],
						systemsUnderTest: [
							{
								kind: "artifact",
								path: "docs/contract.md",
								sutKind: "shipped-file",
							},
						],
						limitations: [],
					},
					"agent-assessed-judgment",
				),
				dimensions: {
					execution: assessed("executed", "agent-assessed-judgment"),
					grounding: assessed("shipped-artifact", "agent-assessed-judgment"),
					contractAlignment: assessed("aligned", "agent-assessed-judgment"),
					faultSensitivity: assessed("reasoned", "agent-assessed-judgment"),
					realism: assessed("integrated-subsystem", "agent-assessed-judgment"),
					determinism: assessed("stable", "agent-assessed-judgment"),
					engineeringQuality: assessed("sound", "agent-assessed-judgment"),
				},
				reasonCodes: assessed([], "agent-assessed-judgment"),
				portfolioContributions: assessed(
					[
						{
							inventoryId: "BRI-001",
							boundary: "producer",
							defectAxes: ["path"],
						},
					],
					"agent-assessed-judgment",
				),
				disposition: assessed("retain", "agent-assessed-judgment"),
				materialInputs: [
					{
						path: identity.path,
						inputKind: "test-declaration",
						scope: "declaration-span",
						span: { startLine: identity.line, endLine: identity.endLine },
						sha256: await digestMaterialInput(projectRoot, {
							path: identity.path,
							inputKind: "test-declaration",
							scope: "declaration-span",
							span: { startLine: identity.line, endLine: identity.endLine },
						}),
					},
					{
						path: "docs/contract.md",
						inputKind: "system-under-test",
						sutKind: "shipped-file",
						scope: "file",
						sha256: contractDigest,
					},
					{
						path: "docs/contract.md",
						inputKind: "contract",
						scope: "file",
						sha256: contractDigest,
					},
					...(await Promise.all(
						(
							[
								["method", "method.md"],
								["schema", "schema.json"],
								["inventory-row", "inventory-row.json"],
								["runner", "runner.mjs"],
								["config", "vitest.config.ts"],
								["setup", "tests/setup.ts"],
								// A command input names the epoch that produced it, so
								// carrying one must rewrite and rehash the path.
								["command", "audit/epochs/epoch-1/manifest.json"],
							] as const
						).map(async ([inputKind, path]) => ({
							path,
							inputKind,
							scope: "file" as const,
							sha256: await digestMaterialInput(projectRoot, {
								path,
								inputKind,
								scope: "file",
							}),
						})),
					)),
				],
			} as unknown as TestEvidenceProfile);

		await writeFile(
			join(auditRoot, "epochs", "epoch-1", "behavior-risk-inventory.json"),
			JSON.stringify({ epochId: "epoch-1", entries: [] }),
		);
		await writeFile(
			join(auditRoot, "epochs", "epoch-1", "gap-register.md"),
			"# Gaps for epoch-1\n",
		);
		await mkdir(join(auditRoot, "epochs", "epoch-1", "profiles"), {
			recursive: true,
		});
		await writeFile(
			join(auditRoot, "epochs", "epoch-1", "profiles", `${unit.id}.ndjson`),
			`${[
				{
					recordType: "profile-unit",
					schemaVersion: 1,
					epochId: "epoch-1",
					unitId: unit.id,
					assessorId: "profile-assessor",
					processId: 4242,
					processBackend: "driver-process",
					measurementSource: "dispatcher",
					processStartedAt: ASSESSED_AT,
					processEndedAt: "2026-09-17T13:02:00.000Z",
					durationMs: 120000,
					peakRssBytes: 1024,
				},
				...profiles,
			]
				.map((record) => JSON.stringify(record))
				.join("\n")}\n`,
		);

		const caseNames = unit.identities.map((identity) => identity.title);
		await writeFile(
			join(auditRoot, "epochs", "epoch-2", "raw", "normal.reporter.json"),
			reporterPayload(projectRoot, caseNames),
		);
		return { auditRoot, projectRoot, unitId: unit.id, caseNames };
	}

	async function carriedShard(auditRoot: string, unitId: string) {
		const lines = (
			await readFile(
				join(auditRoot, "epochs", "epoch-2", "profiles", `${unitId}.ndjson`),
				"utf8",
			)
		)
			.split("\n")
			.filter(Boolean);
		return lines.map((line) => JSON.parse(line) as Record<string, never>);
	}

	it("carries a unit whose inputs all rehash unchanged", async () => {
		const { auditRoot, projectRoot, unitId } = await fixture();
		const report = await carryForwardProfileUnits({ auditRoot, projectRoot });
		expect(report).toMatchObject({
			predecessorEpochId: "epoch-1",
			carriedUnitIds: [unitId],
			reassessUnitIds: [],
			carriedProfileCount: 2,
		});
	});

	it("marks every carried profile with the epoch it came from", async () => {
		const { auditRoot, projectRoot, unitId } = await fixture();
		await carryForwardProfileUnits({ auditRoot, projectRoot });
		const [, ...carried] = await carriedShard(auditRoot, unitId);
		expect(carried).toHaveLength(2);
		for (const profile of carried)
			expect(profile).toMatchObject({
				carriedFrom: { epochId: "epoch-1" },
			});
	});

	it("records a carried unit as carry-forward rather than dispatcher-measured", async () => {
		const { auditRoot, projectRoot, unitId } = await fixture();
		await carryForwardProfileUnits({ auditRoot, projectRoot });
		const [header] = await carriedShard(auditRoot, unitId);
		expect(header).toMatchObject({
			processBackend: "carry-forward",
			measurementSource: "carry-forward",
		});
	});

	it("keeps the original judgment timestamp but re-observes the runtime", async () => {
		const { auditRoot, projectRoot, unitId } = await fixture();
		await carryForwardProfileUnits({ auditRoot, projectRoot });
		const [, carried] = (await carriedShard(auditRoot, unitId)) as unknown as [
			unknown,
			TestEvidenceProfile,
		];
		expect(carried.disposition.assessor).toMatchObject({
			assessedAt: ASSESSED_AT,
		});
		const observedAt =
			carried.runtime.assessor.kind === "collector"
				? carried.runtime.assessor.observedAt
				: undefined;
		expect(Date.parse(observedAt ?? "")).toBeGreaterThan(
			Date.parse(ASSESSED_AT),
		);
	});

	it("refuses to carry a unit whose system under test changed", async () => {
		const { auditRoot, projectRoot, unitId } = await fixture();
		await writeFile(
			join(projectRoot, "docs", "contract.md"),
			"# Contract v2\n",
		);
		const report = await carryForwardProfileUnits({ auditRoot, projectRoot });
		expect(report.carriedUnitIds).toEqual([]);
		expect(report.reassessUnitIds).toEqual([unitId]);
		expect(report.reasons[unitId]).toMatch(/changed material input/);
	});

	it("refuses to carry a declaration the successor epoch did not re-observe", async () => {
		const { auditRoot, projectRoot, unitId, caseNames } = await fixture();
		await writeFile(
			join(auditRoot, "epochs", "epoch-2", "raw", "normal.reporter.json"),
			reporterPayload(projectRoot, caseNames.slice(0, 1)),
		);
		const report = await carryForwardProfileUnits({ auditRoot, projectRoot });
		expect(report.carriedUnitIds).toEqual([]);
		expect(report.reasons[unitId]).toMatch(/not re-observed/);
	});
	it("inherits the predecessor's deliverables, restamped for this epoch", async () => {
		const { auditRoot, projectRoot } = await fixture();
		const report = await carryForwardProfileUnits({ auditRoot, projectRoot });
		expect(report.carriedDeliverables).toContain(
			"behavior-risk-inventory.json",
		);
		const inherited = JSON.parse(
			await readFile(
				join(auditRoot, "epochs", "epoch-2", "behavior-risk-inventory.json"),
				"utf8",
			),
		) as { epochId: string };
		expect(inherited.epochId).toBe("epoch-2");
	});

	it("does not overwrite a deliverable the successor already has", async () => {
		const { auditRoot, projectRoot } = await fixture();
		const own = join(
			auditRoot,
			"epochs",
			"epoch-2",
			"behavior-risk-inventory.json",
		);
		await writeFile(
			own,
			JSON.stringify({ epochId: "epoch-2", entries: ["x"] }),
		);
		const report = await carryForwardProfileUnits({ auditRoot, projectRoot });
		expect(report.carriedDeliverables).not.toContain(
			"behavior-risk-inventory.json",
		);
		// The run must still carry the deliverable it did not already hold, or this
		// passes just as well when carrying is removed entirely.
		expect(report.carriedDeliverables).toContain("gap-register.md");
		expect(JSON.parse(await readFile(own, "utf8"))).toMatchObject({
			entries: ["x"],
		});
	});

	it("routes a unit the validator refuses to reassessment instead of failing", async () => {
		const { auditRoot, projectRoot, unitId } = await fixture();
		const shard = join(
			auditRoot,
			"epochs",
			"epoch-1",
			"profiles",
			`${unitId}.ndjson`,
		);
		const lines = (await readFile(shard, "utf8")).split("\n").filter(Boolean);
		const rewritten = lines.map((line, index) => {
			if (index === 0) return line;
			const profile = JSON.parse(line) as {
				materialInputs: { inputKind: string }[];
			};
			profile.materialInputs = profile.materialInputs.filter(
				(input) => input.inputKind !== "runner",
			);
			return JSON.stringify(profile);
		});
		await writeFile(shard, `${rewritten.join("\n")}\n`);
		const report = await carryForwardProfileUnits({ auditRoot, projectRoot });
		expect(report.carriedUnitIds).toEqual([]);
		expect(report.reassessUnitIds).toEqual([unitId]);
		expect(report.reasons[unitId]).toMatch(/omits runner input proof/);
	});
	it("cites this epoch's reporter output for the re-observed runtime", async () => {
		const { auditRoot, projectRoot, unitId } = await fixture();
		await carryForwardProfileUnits({ auditRoot, projectRoot });
		const [, carried] = (await carriedShard(auditRoot, unitId)) as unknown as [
			unknown,
			TestEvidenceProfile,
		];
		const paths = (carried.runtime.evidence ?? []).map(
			(evidence) => evidence.path,
		);
		expect(paths).toEqual(["audit/epochs/epoch-2/raw/normal.reporter.json"]);
	});
	it("refuses to carry when this epoch observed the declaration nowhere", async () => {
		const { auditRoot, projectRoot, unitId } = await fixture();
		await rm(
			join(auditRoot, "epochs", "epoch-2", "raw", "normal.reporter.json"),
		);
		const report = await carryForwardProfileUnits({ auditRoot, projectRoot });
		expect(report.carriedUnitIds).toEqual([]);
		expect(report.reassessUnitIds).toEqual([unitId]);
		expect(report.reasons[unitId]).toMatch(/not re-observed/);
	});

	it("refuses to carry a declaration absent from this epoch's run", async () => {
		const { auditRoot, projectRoot, unitId } = await fixture();
		await writeFile(
			join(auditRoot, "epochs", "epoch-2", "raw", "normal.reporter.json"),
			JSON.stringify({
				command: "bun run test",
				modules: [
					{ moduleId: join(projectRoot, "tests/other.test.ts"), cases: [] },
				],
			}),
		);
		const report = await carryForwardProfileUnits({ auditRoot, projectRoot });
		expect(report.carriedUnitIds).toEqual([]);
		expect(report.reasons[unitId]).toMatch(/not re-observed/);
	});

	it("leaves a shard the successor already holds untouched", async () => {
		const { auditRoot, projectRoot, unitId } = await fixture();
		await mkdir(join(auditRoot, "epochs", "epoch-2", "profiles"), {
			recursive: true,
		});
		const shard = join(
			auditRoot,
			"epochs",
			"epoch-2",
			"profiles",
			`${unitId}.ndjson`,
		);
		await writeFile(shard, '{"recordType":"fresh-assessment"}\n');
		const report = await carryForwardProfileUnits({ auditRoot, projectRoot });
		expect(report.retainedUnitIds).toEqual([unitId]);
		expect(report.carriedUnitIds).toEqual([]);
		expect(await readFile(shard, "utf8")).toBe(
			'{"recordType":"fresh-assessment"}\n',
		);
	});

	it("stops on an I/O failure rather than recording it as work to redo", async () => {
		const { auditRoot, projectRoot } = await fixture();
		await rm(join(auditRoot, "epochs", "epoch-2", "work-units.json"));
		await expect(
			carryForwardProfileUnits({ auditRoot, projectRoot }),
		).rejects.toThrow();
	});
});
