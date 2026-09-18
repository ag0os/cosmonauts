import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	BASELINE_CONDITIONS,
	buildProfileWorkQueue,
	CALIBRATION_CONTROL_OBLIGATIONS,
	CANDIDATE_BUNDLES,
	canonicalCandidateDigest,
	digestMaterialInput,
	evaluateBaseline,
	openAuditEpoch,
	parseBaselineDocument,
	parseCalibrationDocument,
	parseGateRecommendationsDocument,
	publishProfileUnit,
	validateBaselineDocument,
	validateBehaviorRiskInventory,
	validateCalibrationRecord,
	validateCandidateBundles,
	validateEpochProvenance,
	validateGateRecommendations,
	validateProfileEpoch,
	validateRemediationLedger,
} from "../../../scripts/test-health-audit/artifacts.ts";
import {
	commandCensusDigest,
	sourceCensusDigest,
} from "../../../scripts/test-health-audit/census.ts";
import { runCli } from "../../../scripts/test-health-audit/cli.ts";
import { dispatchProfileUnits } from "../../../scripts/test-health-audit/dispatch.ts";
import { validatePortfolioEvidence } from "../../../scripts/test-health-audit/portfolio.ts";
import type { TestEvidenceProfile } from "../../../scripts/test-health-audit/schema.ts";
import { collectSourceText } from "../../../scripts/test-health-audit/source-census.ts";

const assessor = {
	kind: "agent",
	id: "inventory-assessor-a",
	model: "codex",
	modelVersion: "gpt-5",
	assessedAt: "2026-09-17T12:00:00.000Z",
	consultedAuthorities: [
		{ kind: "authority-document", path: "docs/orchestration.md" },
	],
} as const;

function sha256(value: unknown): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

const FIXTURE_EPOCH = "epoch-fixture";
const CALIBRATION_FIXTURE_PATH = join(
	process.cwd(),
	"scripts/test-health-audit/fixtures/calibration.md",
);

/**
 * A committed snapshot of a valid calibration record. Seeding the negative cases
 * from a live epoch coupled this suite to audit bookkeeping, so a fresh epoch
 * turned it red and the audit then collected its own reflection. The snapshot
 * only moves when CALIBRATION_CONTROL_OBLIGATIONS does, which is a code change.
 */
async function calibrationFixture(): Promise<
	ReturnType<typeof parseCalibrationDocument>
> {
	return parseCalibrationDocument(
		await readFile(CALIBRATION_FIXTURE_PATH, "utf8"),
	);
}

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
						observedAt: "2026-09-17T13:00:00.000Z",
					}
				: {
						kind: "agent",
						id: "profile-assessor",
						model: "openai-codex",
						modelVersion: "gpt-5",
						assessedAt: "2026-09-17T13:00:00.000Z",
						consultedAuthorities: [
							{ kind: "authority-document", path: "docs/contract.md" },
						],
					},
		evidence: [
			{
				kind: "source-span",
				path: "tests/profile-units.test.ts",
				span: { startLine: 1, endLine: 1 },
			},
		],
		counterevidence: [],
		uncertainty: [],
		overrides: [],
	};
}

function inventoryFixture(): Record<string, unknown> {
	const sourceLog = {
		lane: "objective-observation",
		restrictedEvidence: {
			excluded: [
				"census-identities",
				"test-files",
				"behavior-markers",
				"coverage-output",
			],
			included: [
				"package-public-surfaces",
				"cli-surfaces",
				"domain-surfaces",
				"shipped-artifacts",
				"shipped-contracts",
				"active-architecture-decisions",
				"incident-risk-records",
			],
		},
		enumeratedGroups: ["cli", "orchestration-contract"],
		workUnits: [
			{
				id: "unit-cli",
				assignedGroups: ["cli", "orchestration-contract"],
				sources: [
					{
						path: "cli/run/subcommand.ts",
						kind: "shipped-surface",
						sha256: "a".repeat(64),
					},
					{
						path: "docs/orchestration.md",
						kind: "shipped-contract",
						sha256: "b".repeat(64),
					},
				],
				consultedAuthorities: ["docs/orchestration.md"],
				incidentalCitationsNotOpened: [
					{
						authorityPath: "docs/orchestration.md",
						statement: "Incidental test citations were not opened or recorded.",
					},
				],
			},
		],
		positiveCoverageStatements: [
			{
				group: "cli",
				statement: "All current run command entry points were enumerated.",
				sourcePaths: ["cli/run/subcommand.ts"],
			},
			{
				group: "orchestration-contract",
				statement: "The shipped orchestration contract was consulted.",
				sourcePaths: ["docs/orchestration.md"],
			},
		],
	};
	const entries = [
		{
			id: "BRI-001",
			title: "Durable run lifecycle",
			contract: {
				value: "A detached run preserves terminal state and observable events.",
				rationale: "This is the shipped run contract.",
				lane: "agent-assessed-judgment",
				basis: "reasoned",
				ciEffect: "evidence-only",
				assessor,
			},
			authorities: [
				{
					kind: "authority-document",
					path: "docs/orchestration.md",
					locator: "Durable execution",
				},
			],
			criticality: {
				value: "critical",
				consequence: "A lost terminal state can duplicate irreversible work.",
				rationale: "Durability failure can corrupt run ownership.",
				lane: "agent-assessed-judgment",
				basis: "reasoned",
				ciEffect: "evidence-only",
				assessor,
			},
			boundaries: Object.fromEntries(
				[
					"producer",
					"consumer",
					"adapter",
					"persisted-state",
					"event",
					"alternate-path",
					"composition-root",
				].map((boundary) => [
					boundary,
					{
						value: boundary === "producer" ? "applicable" : "not-applicable",
						rationale: `${boundary} was assessed against the contract.`,
						lane: "agent-assessed-judgment",
						basis: "reasoned",
						ciEffect: "evidence-only",
						assessor,
					},
				]),
			),
			axes: {
				path: judgment(["inline", "detached"]),
				caller: judgment(["CLI run", "Drive scheduler"]),
				defect: judgment(["terminal state lost", "event omitted"]),
			},
		},
	];
	return {
		schemaVersion: 1,
		epochId: "epoch-1",
		status: "frozen",
		heuristicJudgmentsActivateCi: false,
		sourceLog,
		entries,
		freeze: {
			algorithm: "sha256",
			sourceLogDigest: sha256(sourceLog),
			inventoryDigest: sha256(entries),
			frozenAt: "2026-09-17T12:30:00.000Z",
			successorEpochRequiredForChanges: true,
		},
	};
}

function judgment(value: readonly string[]): Record<string, unknown> {
	return {
		value,
		rationale: "The authority exposes these distinct failure dimensions.",
		lane: "agent-assessed-judgment",
		basis: "reasoned",
		ciEffect: "evidence-only",
		assessor,
	};
}

function firstRecord(value: unknown): Record<string, unknown> {
	if (!Array.isArray(value) || value.length === 0 || !value[0])
		throw new Error("fixture array must contain one record");
	return value[0] as Record<string, unknown>;
}

describe("test health audit artifacts", () => {
	// @cosmo-behavior plan:test-health-audit#B-004
	it("requires one fresh complete profile per identity and safely subdivides oversized files across resumable units", async () => {
		const root = await mkdtemp(join(tmpdir(), "audit-profile-units-"));
		try {
			const auditRoot = join(root, "audit");
			const projectRoot = join(root, "project");
			const sourceText =
				'import { test } from "vitest";\n' +
				Array.from(
					{ length: 401 },
					(_, index) =>
						`test("case ${String(index + 1).padStart(2, "0")}", () => {});`,
				).join("\n");
			const source = collectSourceText(
				"tests/profile-units.test.ts",
				sourceText,
			);
			const sourceDigest = sourceCensusDigest([source]);
			await mkdir(join(auditRoot, "epochs", "epoch-1"), { recursive: true });
			await mkdir(join(projectRoot, "tests"), { recursive: true });
			await mkdir(join(projectRoot, "docs"), { recursive: true });
			await writeFile(
				join(projectRoot, "tests", "profile-units.test.ts"),
				sourceText,
			);
			await writeFile(join(projectRoot, "docs", "contract.md"), "# Contract\n");
			for (const [path, content] of [
				["method.md", "method v1\n"],
				["schema.json", '{"version":1}\n'],
				["inventory-row.json", '{"id":"BRI-001"}\n'],
				["runner.mjs", "export default {};\n"],
				["vitest.config.ts", "export default {};\n"],
				["tests/setup.ts", "export {};\n"],
				["command.json", '{"argv":["bun","run","test"]}\n'],
			] as const) {
				await mkdir(join(projectRoot, path, ".."), { recursive: true });
				await writeFile(join(projectRoot, path), content);
			}
			await writeFile(
				join(auditRoot, "index.json"),
				JSON.stringify({
					currentEpochId: "epoch-1",
					epochIds: ["epoch-0", "epoch-1"],
				}),
			);
			await writeFile(
				join(auditRoot, "epochs", "epoch-1", "manifest.json"),
				JSON.stringify({
					schemaVersion: 1,
					methodVersion: "1",
					epochId: "epoch-1",
					evaluatedRevision: "abc123",
					createdAt: "2026-09-17T12:00:00.000Z",
					materialInputs: [],
					commandDefinitions: [],
					sourceCensusDigest: sourceDigest,
				}),
			);
			await writeFile(
				join(auditRoot, "epochs", "epoch-1", "source-census.json"),
				JSON.stringify([source]),
			);
			await writeFile(
				join(auditRoot, "epochs", "epoch-1", "suite-integrity.json"),
				JSON.stringify({
					sourceCensusDigest: sourceDigest,
					commandCensusDigest: commandCensusDigest([]),
				}),
			);

			expect(await runCli(["--audit-root", auditRoot, "prepare-units"])).toBe(
				0,
			);
			const queue = JSON.parse(
				await readFile(
					join(auditRoot, "epochs", "epoch-1", "work-units.json"),
					"utf8",
				),
			) as {
				execution: { backend: string; maxConcurrent: number };
				units: Array<{
					id: string;
					identities: typeof source.declarations;
					fileContexts: Array<{ path: string; digest: string }>;
				}>;
			};
			expect(queue.units?.map((unit) => unit.identities?.length)).toEqual([
				50, 50, 50, 50, 50, 50, 50, 50, 1,
			]);
			expect(queue.execution).toMatchObject({
				backend: "driver-process",
				maxConcurrent: 8,
			});
			expect(queue.units[0]?.fileContexts).toEqual(
				queue.units[1]?.fileContexts,
			);
			expect(queue.units[0]?.fileContexts).toEqual([
				{ path: source.path, digest: source.fileContextDigest },
			]);

			const contractDigest = await digestMaterialInput(projectRoot, {
				path: "docs/contract.md",
				inputKind: "contract",
				scope: "file",
			});
			const profilesByUnit = new Map<string, TestEvidenceProfile[]>();
			for (const unit of queue.units) {
				const profiles: TestEvidenceProfile[] = [];
				for (const identity of unit.identities) {
					const declarationDigest = await digestMaterialInput(projectRoot, {
						path: identity.path,
						inputKind: "test-declaration",
						scope: "declaration-span",
						span: { startLine: identity.line, endLine: identity.endLine },
					});
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
						runtime: assessed(
							{
								discoveryBySurface: {
									normal: "passed",
									watch: "passed",
									coverage: "passed",
									repeat: "passed",
									shuffle: "passed",
									isolation: "passed",
								},
								caseNames: [identity.title],
								caseCount: 1,
							},
							"objective-observation",
						),
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
										span: {
											startLine: identity.line,
											endLine: identity.endLine,
										},
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
							grounding: assessed(
								"shipped-artifact",
								"agent-assessed-judgment",
							),
							contractAlignment: assessed("aligned", "agent-assessed-judgment"),
							faultSensitivity: assessed("reasoned", "agent-assessed-judgment"),
							realism: assessed(
								"integrated-subsystem",
								"agent-assessed-judgment",
							),
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
								sha256: declarationDigest,
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
						],
					} as TestEvidenceProfile);
				}
				profilesByUnit.set(unit.id, profiles);
				await publishProfileUnit({
					root: auditRoot,
					projectRoot,
					unitId: unit.id,
					assessorId: "profile-assessor",
					processId: 4242,
					processStartedAt: "2026-09-17T13:00:00.000Z",
					processEndedAt: "2026-09-17T13:00:00.125Z",
					durationMs: 125,
					peakRssBytes: 64 * 1024 * 1024,
					profiles,
				});
			}

			expect(await validateProfileEpoch(auditRoot, projectRoot)).toMatchObject({
				valid: true,
				complete: true,
				pendingUnitIds: [],
				profiles: expect.arrayContaining([
					expect.objectContaining({ id: source.declarations[0]?.id }),
				]),
			});

			const invokedUnitIds: string[] = [];
			const promptBodies: string[] = [];
			const resampledWaves: number[] = [];
			let failedUnitId: string | undefined;
			let haltedUnitId: string | undefined;
			let expectDiscardedCandidateForUnit: string | undefined;
			let supplyAgentCost = false;
			const failedAttempts = new Set<string>();
			const backend = {
				name: "codex",
				capabilities: { canCommit: false, isolatedFromHostSource: true },
				async run(invocation: { taskId: string; promptPath: string }) {
					invokedUnitIds.push(invocation.taskId);
					promptBodies.push(await readFile(invocation.promptPath, "utf8"));
					if (invocation.taskId === expectDiscardedCandidateForUnit) {
						await expect(
							readFile(
								join(
									auditRoot,
									"epochs",
									"epoch-1",
									"dispatch",
									`${invocation.taskId}.profiles.json`,
								),
								"utf8",
							),
						).rejects.toMatchObject({ code: "ENOENT" });
						expectDiscardedCandidateForUnit = undefined;
					}
					if (invocation.taskId === haltedUnitId) {
						await writeFile(
							join(
								auditRoot,
								"epochs",
								"epoch-1",
								"dispatch",
								`${invocation.taskId}.profiles.json`,
							),
							JSON.stringify({
								assessorId: "profile-assessor",
								halt: {
									kind: "ratified-ground-collision",
									question:
										"Should the ratified plan or the ratified architecture record govern this contract?",
									collidingAuthorities: [
										{
											kind: "authority-document",
											path: "missions/plans/test-health-audit/plan.md",
											locator: "D-034",
										},
										{
											kind: "authority-document",
											path: "missions/architecture/test-health.md",
											locator: "Contract",
										},
									],
								},
							}),
						);
						return {
							exitCode: 0,
							stdout: "ratified-ground collision recorded",
							durationMs: 5,
							processMetrics: {
								processId: 5000 + invokedUnitIds.length,
								peakRssBytes: 32 * 1024 * 1024,
							},
						};
					}
					if (
						invocation.taskId === failedUnitId &&
						!failedAttempts.has(invocation.taskId)
					) {
						failedAttempts.add(invocation.taskId);
						return {
							exitCode: 137,
							stdout: "killed",
							durationMs: 5,
							processMetrics: {
								processId: 5000 + invokedUnitIds.length,
								peakRssBytes: 32 * 1024 * 1024,
							},
						};
					}
					await writeFile(
						join(
							auditRoot,
							"epochs",
							"epoch-1",
							"dispatch",
							`${invocation.taskId}.profiles.json`,
						),
						JSON.stringify({
							assessorId: "profile-assessor",
							...(supplyAgentCost
								? { durationMs: 5, peakRssBytes: 32 * 1024 * 1024 }
								: {}),
							profiles: profilesByUnit.get(invocation.taskId) ?? [],
						}),
					);
					return {
						exitCode: 0,
						stdout: "assessed",
						durationMs: 5,
						processMetrics: {
							processId: 5000 + invokedUnitIds.length,
							peakRssBytes: 32 * 1024 * 1024,
						},
					};
				},
			};
			const resampleControls = async (wave: number) => {
				resampledWaves.push(wave);
				return { status: "pass" as const, controlIds: ["N-001", "X-001"] };
			};
			const dispatchOptions = (root: string) =>
				({
					auditRoot: root,
					projectRoot,
					backend,
					resampleControls,
				}) as Parameters<typeof dispatchProfileUnits>[0];
			const lastUnit = queue.units.at(-1);
			if (!lastUnit) throw new Error("profile queue is empty");
			await rm(
				join(
					auditRoot,
					"epochs",
					"epoch-1",
					"profiles",
					`${lastUnit.id}.ndjson`,
				),
			);
			let routedDispatchRoot: string | undefined;
			expect(
				await runCli(["--audit-root", auditRoot, "dispatch"], {
					dispatch: async (root) => {
						routedDispatchRoot = root;
						await dispatchProfileUnits(dispatchOptions(root));
					},
				}),
			).toBe(0);
			expect(routedDispatchRoot).toBe(auditRoot);
			expect(invokedUnitIds).toEqual([lastUnit.id]);
			expect(promptBodies[0]).toContain(JSON.stringify(lastUnit.identities));
			expect(promptBodies[0]).toContain(JSON.stringify(lastUnit.fileContexts));
			expect(promptBodies[0]).not.toMatch(
				/durationMs|peakRssBytes|publish-unit/,
			);
			expect(resampledWaves).toEqual([1]);
			const controlWave = JSON.parse(
				await readFile(
					join(
						auditRoot,
						"epochs",
						"epoch-1",
						"control-waves",
						"wave-0001.json",
					),
					"utf8",
				),
			) as Record<string, unknown>;
			expect(controlWave).toMatchObject({ wave: 1, status: "pass" });
			await rm(
				join(
					auditRoot,
					"epochs",
					"epoch-1",
					"profiles",
					`${lastUnit.id}.ndjson`,
				),
			);
			supplyAgentCost = true;
			await expect(
				dispatchProfileUnits(dispatchOptions(auditRoot)),
			).rejects.toThrow(/agent-supplied cost fields/);
			expect(await validateProfileEpoch(auditRoot, projectRoot)).toMatchObject({
				pendingUnitIds: [lastUnit.id],
			});
			supplyAgentCost = false;
			expectDiscardedCandidateForUnit = lastUnit.id;
			await dispatchProfileUnits(dispatchOptions(auditRoot));
			expect(expectDiscardedCandidateForUnit).toBeUndefined();
			const persistedControlPath = join(
				auditRoot,
				"epochs",
				"epoch-1",
				"control-waves",
				"wave-0002.json",
			);
			const passingControl = JSON.parse(
				await readFile(persistedControlPath, "utf8"),
			) as Record<string, unknown>;
			await writeFile(
				persistedControlPath,
				JSON.stringify({
					...passingControl,
					status: "miss",
					issues: ["N-001 regressed"],
				}),
			);
			const callsBeforeRegression = invokedUnitIds.length;
			await expect(
				dispatchProfileUnits(dispatchOptions(auditRoot)),
			).rejects.toThrow(/control-wave evidence.*regression/);
			expect(invokedUnitIds).toHaveLength(callsBeforeRegression);
			await writeFile(persistedControlPath, JSON.stringify(passingControl));
			let publishArguments: readonly string[] = [];
			expect(
				await runCli(
					[
						"--audit-root",
						auditRoot,
						"publish-unit",
						"--unit",
						lastUnit.id,
						"--input",
						"candidate.json",
					],
					{
						publishUnit: async (...args) => {
							publishArguments = args;
						},
					},
				),
			).toBe(0);
			expect(publishArguments).toEqual([
				auditRoot,
				lastUnit.id,
				"candidate.json",
			]);

			for (const unit of queue.units)
				await rm(
					join(auditRoot, "epochs", "epoch-1", "profiles", `${unit.id}.ndjson`),
				);
			invokedUnitIds.length = 0;
			failedUnitId = lastUnit.id;
			await expect(
				dispatchProfileUnits(dispatchOptions(auditRoot)),
			).rejects.toThrow(lastUnit.id);
			expect(await validateProfileEpoch(auditRoot, projectRoot)).toMatchObject({
				completedUnitIds: queue.units.slice(0, -1).map((unit) => unit.id),
				pendingUnitIds: [lastUnit.id],
			});
			invokedUnitIds.length = 0;
			await dispatchProfileUnits(dispatchOptions(auditRoot));
			expect(invokedUnitIds).toEqual([lastUnit.id]);
			expect(await validateProfileEpoch(auditRoot, projectRoot)).toMatchObject({
				valid: true,
				complete: true,
				pendingUnitIds: [],
			});

			for (const unit of queue.units)
				await rm(
					join(auditRoot, "epochs", "epoch-1", "profiles", `${unit.id}.ndjson`),
				);
			invokedUnitIds.length = 0;
			haltedUnitId = queue.units[0]?.id;
			if (!haltedUnitId) throw new Error("profile queue is empty");
			await expect(
				dispatchProfileUnits(dispatchOptions(auditRoot)),
			).rejects.toThrow(/drained.*ratified-ground collision/i);
			expect(invokedUnitIds.slice().sort()).toEqual(
				queue.units.map((unit) => unit.id).sort(),
			);
			const haltedEpoch = await validateProfileEpoch(auditRoot, projectRoot);
			expect(haltedEpoch).toMatchObject({
				valid: true,
				complete: false,
				pendingUnitIds: [],
				haltedUnitIds: [haltedUnitId],
				completedUnitIds: queue.units.slice(1).map((unit) => unit.id),
			});
			const haltShard = await readFile(
				join(
					auditRoot,
					"epochs",
					"epoch-1",
					"profiles",
					`${haltedUnitId}.halted.ndjson`,
				),
				"utf8",
			);
			const haltRecord = JSON.parse(haltShard.trim()) as Record<
				string,
				unknown
			>;
			expect(haltRecord).toMatchObject({
				recordType: "profile-unit-halt",
				unitId: haltedUnitId,
				halt: {
					kind: "ratified-ground-collision",
					question: expect.stringMatching(/ratified plan/),
					collidingAuthorities: [{}, {}],
				},
				measurementSource: "dispatcher",
			});
			const callsAfterDrain = invokedUnitIds.length;
			await expect(
				dispatchProfileUnits(dispatchOptions(auditRoot)),
			).rejects.toThrow(/drained.*ratified-ground collision/i);
			expect(invokedUnitIds).toHaveLength(callsAfterDrain);
			await writeFile(
				join(
					auditRoot,
					"epochs",
					"epoch-1",
					"profiles",
					`${haltedUnitId}.halted.ndjson`,
				),
				`${JSON.stringify({
					...haltRecord,
					halt: { ...(haltRecord.halt as object), question: "" },
				})}\n`,
			);
			expect(await validateProfileEpoch(auditRoot, projectRoot)).toMatchObject({
				valid: false,
				pendingUnitIds: [haltedUnitId],
				issues: expect.arrayContaining([
					expect.stringMatching(/drafted question/),
				]),
			});
			await writeFile(
				join(
					auditRoot,
					"epochs",
					"epoch-1",
					"profiles",
					`${haltedUnitId}.halted.ndjson`,
				),
				haltShard,
			);

			await rm(
				join(
					auditRoot,
					"epochs",
					"epoch-1",
					"profiles",
					`${haltedUnitId}.halted.ndjson`,
				),
			);
			haltedUnitId = undefined;
			await dispatchProfileUnits(dispatchOptions(auditRoot));

			const firstShard = join(
				auditRoot,
				"epochs",
				"epoch-1",
				"profiles",
				`${queue.units[0]?.id}.ndjson`,
			);
			const validShard = await readFile(firstShard, "utf8");
			const shardRecords = validShard
				.trimEnd()
				.split("\n")
				.map((line) => JSON.parse(line) as Record<string, unknown>);
			await writeFile(
				firstShard,
				`${[shardRecords[0], ...shardRecords.slice(1, -1)].map((record) => JSON.stringify(record)).join("\n")}\n`,
			);
			expect(
				(await validateProfileEpoch(auditRoot, projectRoot)).issues,
			).toEqual(
				expect.arrayContaining([
					expect.stringMatching(/each assigned identity exactly once/),
				]),
			);
			await writeFile(firstShard, validShard);

			await writeFile(
				firstShard,
				`${[...shardRecords, shardRecords[1]].map((record) => JSON.stringify(record)).join("\n")}\n`,
			);
			expect(
				(await validateProfileEpoch(auditRoot, projectRoot)).issues,
			).toEqual(
				expect.arrayContaining([
					expect.stringMatching(/each assigned identity exactly once/),
				]),
			);
			await writeFile(firstShard, validShard);

			const excessiveCaseRecords = structuredClone(shardRecords);
			const excessiveCaseProfile = excessiveCaseRecords[1] as {
				runtime: { value: { caseCount: number; caseNames: string[] } };
			};
			excessiveCaseProfile.runtime.value.caseCount = 2;
			excessiveCaseProfile.runtime.value.caseNames = [
				source.declarations[0]?.title ?? "case 01",
				"generated extra case",
			];
			await writeFile(
				firstShard,
				`${excessiveCaseRecords.map((record) => JSON.stringify(record)).join("\n")}\n`,
			);
			expect(
				(await validateProfileEpoch(auditRoot, projectRoot)).issues,
			).toEqual(
				expect.arrayContaining([
					expect.stringMatching(/caseCount 2 exceeds source parameterCount 1/),
				]),
			);
			await writeFile(firstShard, validShard);

			const siblingCaseRecords = structuredClone(shardRecords);
			const siblingCaseProfile = siblingCaseRecords[1] as {
				runtime: { value: { caseCount: number; caseNames: string[] } };
			};
			siblingCaseProfile.runtime.value.caseNames = [
				source.declarations[50]?.title ?? "case 51",
			];
			await writeFile(
				firstShard,
				`${siblingCaseRecords.map((record) => JSON.stringify(record)).join("\n")}\n`,
			);
			expect(
				(await validateProfileEpoch(auditRoot, projectRoot)).issues,
			).toEqual(
				expect.arrayContaining([
					expect.stringMatching(
						/runtime case .*case 51.* belongs to another literal-titled declaration/,
					),
				]),
			);
			await writeFile(firstShard, validShard);

			const headerWithoutMetrics = { ...shardRecords[0] };
			delete headerWithoutMetrics.durationMs;
			delete headerWithoutMetrics.peakRssBytes;
			delete headerWithoutMetrics.processId;
			delete headerWithoutMetrics.processBackend;
			delete headerWithoutMetrics.assessorId;
			delete headerWithoutMetrics.measurementSource;
			delete headerWithoutMetrics.processStartedAt;
			delete headerWithoutMetrics.processEndedAt;
			await writeFile(
				firstShard,
				`${[headerWithoutMetrics, ...shardRecords.slice(1)].map((record) => JSON.stringify(record)).join("\n")}\n`,
			);
			expect(
				(await validateProfileEpoch(auditRoot, projectRoot)).issues,
			).toEqual(
				expect.arrayContaining([
					expect.stringMatching(/durationMs/),
					expect.stringMatching(/peakRssBytes/),
					expect.stringMatching(/processId/),
					expect.stringMatching(/processBackend/),
					expect.stringMatching(/assessorId/),
					expect.stringMatching(/measurementSource/),
					expect.stringMatching(/process lifetime/),
				]),
			);
			await writeFile(firstShard, validShard);

			const fabricatedDuration = {
				...shardRecords[0],
				durationMs: 20,
				processStartedAt: "2026-09-17T13:00:00.000Z",
				processEndedAt: "2026-09-17T13:02:00.000Z",
			};
			await writeFile(
				firstShard,
				`${[fabricatedDuration, ...shardRecords.slice(1)].map((record) => JSON.stringify(record)).join("\n")}\n`,
			);
			expect(
				(await validateProfileEpoch(auditRoot, projectRoot)).issues,
			).toEqual(
				expect.arrayContaining([expect.stringMatching(/process lifetime/)]),
			);
			await writeFile(firstShard, validShard);

			await writeFile(firstShard, "{malformed\n");
			expect(
				(await validateProfileEpoch(auditRoot, projectRoot)).issues,
			).toEqual(expect.arrayContaining([expect.stringMatching(/JSON/)]));
			await writeFile(firstShard, validShard);

			const carriedRecords = validShard
				.trimEnd()
				.split("\n")
				.map((line) => JSON.parse(line) as Record<string, unknown>);
			const carried = carriedRecords[1] as unknown as TestEvidenceProfile & {
				materialInputs: Array<Record<string, unknown>>;
				carriedFrom?: { epochId: string; profileDigest: string };
			};
			const predecessor = structuredClone(carried) as TestEvidenceProfile;
			for (const [inputKind, path] of [
				["method", "method.md"],
				["schema", "schema.json"],
				["inventory-row", "inventory-row.json"],
				["runner", "runner.mjs"],
				["config", "vitest.config.ts"],
				["setup", "tests/setup.ts"],
				["command", "command.json"],
			] as const) {
				carried.materialInputs.push({
					path,
					inputKind,
					scope: "file",
					sha256: await digestMaterialInput(projectRoot, {
						path,
						inputKind,
						scope: "file",
					}),
				});
			}
			carried.carriedFrom = {
				epochId: "epoch-0",
				profileDigest: sha256(predecessor),
			};
			await mkdir(join(auditRoot, "epochs", "epoch-0", "profiles"), {
				recursive: true,
			});
			await writeFile(
				join(auditRoot, "epochs", "epoch-0", "profiles", "prior.ndjson"),
				`${JSON.stringify({ recordType: "profile-unit" })}\n${JSON.stringify(predecessor)}\n`,
			);
			await writeFile(
				firstShard,
				`${carriedRecords.map((record) => JSON.stringify(record)).join("\n")}\n`,
			);
			expect(await validateProfileEpoch(auditRoot, projectRoot)).toMatchObject({
				valid: true,
				complete: true,
			});
			const completeCarriedShard = await readFile(firstShard, "utf8");
			const omittedProofRecords = completeCarriedShard
				.trimEnd()
				.split("\n")
				.map((line) => JSON.parse(line) as Record<string, unknown>);
			const omittedProfile = omittedProofRecords[1] as {
				materialInputs: Array<{ inputKind?: string }>;
			};
			omittedProfile.materialInputs = omittedProfile.materialInputs.filter(
				(input) => input.inputKind !== "command",
			);
			await writeFile(
				firstShard,
				`${omittedProofRecords.map((record) => JSON.stringify(record)).join("\n")}\n`,
			);
			expect(
				(await validateProfileEpoch(auditRoot, projectRoot)).issues,
			).toEqual(
				expect.arrayContaining([
					expect.stringMatching(/carried profile omits command input proof/),
				]),
			);
			await writeFile(firstShard, completeCarriedShard);

			await writeFile(
				join(projectRoot, "tests", "profile-units.test.ts"),
				`${sourceText}\n// unrelated edit outside every cited declaration\n`,
			);
			expect(await validateProfileEpoch(auditRoot, projectRoot)).toMatchObject({
				valid: true,
				complete: true,
			});
			await writeFile(
				join(projectRoot, "vitest.config.ts"),
				"export default { changed: true };\n",
			);
			expect(
				(await validateProfileEpoch(auditRoot, projectRoot)).issues,
			).toEqual(
				expect.arrayContaining([
					expect.stringMatching(/stale material input vitest\.config\.ts/),
				]),
			);
			await writeFile(
				join(projectRoot, "vitest.config.ts"),
				"export default {};\n",
			);
			await writeFile(
				join(projectRoot, "tests", "setup.ts"),
				"export const changed = true;\n",
			);
			expect(
				(await validateProfileEpoch(auditRoot, projectRoot)).issues,
			).toEqual(
				expect.arrayContaining([
					expect.stringMatching(/stale material input tests\/setup\.ts/),
				]),
			);

			const nineFiles = Array.from({ length: 9 }, (_, index) => ({
				path: `tests/file-${index}.test.ts`,
				declarations: [
					{
						id: `identity-${index}`,
						path: `tests/file-${index}.test.ts`,
						title: `case ${index}`,
						titleTemplate: `case ${index}`,
						ordinal: 1,
						line: 1,
						endLine: 1,
						parameterCount: 1,
					},
				],
			}));
			expect(buildProfileWorkQueue("epoch-1", nineFiles).units).toHaveLength(2);
			expect(
				buildProfileWorkQueue("epoch-1", [
					{
						path: "tests/huge.test.ts",
						declarations: [
							{
								id: "huge",
								path: "tests/huge.test.ts",
								title: "one indivisible test",
								titleTemplate: "one indivisible test",
								ordinal: 1,
								line: 1,
								endLine: 3000,
								parameterCount: 1,
							},
						],
					},
				]).units[0],
			).toMatchObject({ relevantSourceLines: 3000 });

			const queuePath = join(auditRoot, "epochs", "epoch-1", "work-units.json");
			const censusPath = join(
				auditRoot,
				"epochs",
				"epoch-1",
				"source-census.json",
			);
			await writeFile(censusPath, "{malformed\n");
			await expect(
				dispatchProfileUnits({ auditRoot, projectRoot, backend }),
			).rejects.toThrow(censusPath);
			await writeFile(
				censusPath,
				JSON.stringify([
					{
						...source,
						declarations: source.declarations.map((identity, index) =>
							index === 0 ? { ...identity, title: "stale identity" } : identity,
						),
					},
				]),
			);
			await expect(
				dispatchProfileUnits({ auditRoot, projectRoot, backend }),
			).rejects.toThrow(/work-units\.json.*stale.*source-census\.json/);
			await writeFile(censusPath, JSON.stringify([source]));
			await rm(queuePath);
			await expect(
				dispatchProfileUnits({ auditRoot, projectRoot, backend }),
			).rejects.toThrow(queuePath);
			await rm(censusPath);
			expect(await runCli(["--audit-root", auditRoot, "prepare-units"])).toBe(
				1,
			);
			await expect(readFile(queuePath)).rejects.toMatchObject({
				code: "ENOENT",
			});

			await writeFile(censusPath, "{malformed\n");
			expect(await runCli(["--audit-root", auditRoot, "prepare-units"])).toBe(
				1,
			);
			await expect(readFile(queuePath)).rejects.toMatchObject({
				code: "ENOENT",
			});

			await writeFile(
				censusPath,
				JSON.stringify([
					{
						...source,
						declarations: source.declarations.map((identity, index) =>
							index === 0 ? { ...identity, title: "stale identity" } : identity,
						),
					},
				]),
			);
			expect(await runCli(["--audit-root", auditRoot, "prepare-units"])).toBe(
				1,
			);
			await expect(readFile(queuePath)).rejects.toMatchObject({
				code: "ENOENT",
			});

			await writeFile(censusPath, JSON.stringify([source]));
			await rm(join(auditRoot, "index.json"));
			expect(await runCli(["--audit-root", auditRoot, "prepare-units"])).toBe(
				1,
			);
			await expect(readFile(queuePath)).rejects.toMatchObject({
				code: "ENOENT",
			});

			await writeFile(join(auditRoot, "index.json"), "{}\n");
			expect(await runCli(["--audit-root", auditRoot, "prepare-units"])).toBe(
				1,
			);
			await expect(readFile(queuePath)).rejects.toMatchObject({
				code: "ENOENT",
			});

			await writeFile(
				join(auditRoot, "index.json"),
				JSON.stringify({
					currentEpochId: "epoch-0",
					epochIds: ["epoch-0", "epoch-1"],
				}),
			);
			expect(await runCli(["--audit-root", auditRoot, "prepare-units"])).toBe(
				1,
			);
			await expect(readFile(queuePath)).rejects.toMatchObject({
				code: "ENOENT",
			});
		} finally {
			await rm(root, { recursive: true });
		}
	});

	// @cosmo-behavior plan:test-health-audit#B-006
	it("rejects test-derived inventory and requires authority criticality boundaries and defect axes", () => {
		const valid = inventoryFixture();
		expect(validateBehaviorRiskInventory(valid, "epoch-1")).toEqual({
			valid: true,
			issues: [],
		});

		const testDerived = inventoryFixture();
		firstRecord(firstRecord(testDerived.entries).authorities).path =
			"tests/orchestration/run.test.ts";
		expect(
			validateBehaviorRiskInventory(testDerived, "epoch-1").issues,
		).toContain("entries[0].authorities[0].path must cite non-test authority");

		const incomplete = inventoryFixture();
		const incompleteEntry = firstRecord(incomplete.entries);
		delete (incompleteEntry.boundaries as Record<string, unknown>)[
			"composition-root"
		];
		(incompleteEntry.axes as { defect: Record<string, unknown> }).defect.value =
			[];
		expect(validateBehaviorRiskInventory(incomplete, "epoch-1").issues).toEqual(
			expect.arrayContaining([
				"entries[0].boundaries.composition-root is required",
				"entries[0].axes.defect.value must not be empty",
			]),
		);

		const uncovered = inventoryFixture();
		(
			(uncovered.sourceLog as Record<string, unknown>)
				.positiveCoverageStatements as Record<string, unknown>[]
		).pop();
		expect(
			validateBehaviorRiskInventory(uncovered, "epoch-1").issues,
		).toContain(
			"sourceLog positive coverage statements must exactly cover enumerated groups",
		);

		const stale = inventoryFixture();
		expect(validateBehaviorRiskInventory(stale, "epoch-2").issues).toContain(
			"epochId must match current epoch epoch-2",
		);
		(firstRecord(stale.entries).criticality as Record<string, unknown>).value =
			"low";
		expect(validateBehaviorRiskInventory(stale, "epoch-1").issues).toContain(
			"freeze.inventoryDigest does not match entries",
		);
	});

	// @cosmo-behavior plan:test-health-audit#B-007
	it("rejects protected portfolios with a missing risk-required boundary axis or probe", async () => {
		const evidence = {
			schemaVersion: 1,
			epochId: "epoch-1",
			entries: [
				{
					inventoryId: "BRI-001",
					title: "Durable run lifecycle",
					criticality: "critical",
					conclusion: "partially-protected",
					requiredAxes: {
						boundary: ["producer", "consumer"],
						path: ["inline"],
						caller: ["CLI run"],
						defect: ["terminal state lost"],
					},
					axes: {
						boundary: [
							{
								name: "producer",
								state: "contributing",
								profileIds: ["profile-producer"],
								evidenceBases: ["reasoned"],
								gaps: [],
								uncertainty: [],
							},
							{
								name: "consumer",
								state: "gap",
								profileIds: [],
								evidenceBases: ["missing"],
								gaps: ["No shipped consumer evidence."],
								uncertainty: [],
							},
						],
						path: [
							{
								name: "inline",
								state: "gap",
								profileIds: [],
								evidenceBases: ["missing"],
								gaps: ["Profiles do not enumerate path contributions."],
								uncertainty: [],
							},
						],
						caller: [
							{
								name: "CLI run",
								state: "gap",
								profileIds: [],
								evidenceBases: ["missing"],
								gaps: ["Profiles do not enumerate caller contributions."],
								uncertainty: [],
							},
						],
						defect: [
							{
								name: "terminal state lost",
								state: "contributing",
								profileIds: ["profile-producer"],
								evidenceBases: ["reasoned"],
								gaps: [],
								uncertainty: ["Fault sensitivity is reasoned only."],
							},
						],
					},
					probe: {
						required: true,
						requirementId: "PROBE-BRI-001",
						status: "required",
						profileIds: ["profile-producer"],
						probeRefs: [],
						reasons: ["critical portfolio"],
					},
					gaps: [
						"No shipped consumer evidence.",
						"Required probe PROBE-BRI-001 has not run.",
					],
					uncertainty: ["Fault sensitivity is reasoned only."],
				},
			],
		};
		expect(validatePortfolioEvidence(evidence)).toEqual({
			valid: true,
			issues: [],
		});

		const invalid = structuredClone(evidence);
		const invalidEntry = invalid.entries[0];
		if (!invalidEntry) throw new Error("portfolio fixture is empty");
		invalidEntry.conclusion = "protected";
		const producerCell = invalidEntry.axes.boundary[0];
		if (!producerCell) throw new Error("portfolio boundary fixture is empty");
		producerCell.state = "protected";
		invalidEntry.axes.boundary.pop();
		expect(validatePortfolioEvidence(invalid)).toMatchObject({
			valid: false,
			issues: expect.arrayContaining([
				"entries[0].axes.boundary is missing risk-required axis consumer",
				"entries[0].axes.boundary[0] cannot be protected by missing, blocked, or reasoned evidence",
				"entries[0] cannot be protected while required probe PROBE-BRI-001 is required",
			]),
		});
	});

	// @cosmo-behavior plan:test-health-audit#B-003
	it("rejects calibration with a missing control or any actual outcome that differs from its declared obligations", async () => {
		const valid = await calibrationFixture();
		expect(validateCalibrationRecord(valid, FIXTURE_EPOCH)).toEqual({
			valid: true,
			status: "pass",
			profileAcceptance: "licensed",
			issues: [],
		});

		const missing = structuredClone(valid);
		missing.controls.pop();
		expect(validateCalibrationRecord(missing, FIXTURE_EPOCH)).toMatchObject({
			valid: false,
			status: "miss",
			profileAcceptance: "blocked",
			issues: expect.arrayContaining([
				"controls must contain every declared control exactly once",
			]),
		});

		const mismatched = structuredClone(valid);
		mismatched.status = "pass";
		mismatched.profileAcceptance = "licensed";
		const mismatchedControl = mismatched.controls[0];
		if (!mismatchedControl) throw new Error("calibration fixture is empty");
		mismatchedControl.reviewed = true;
		mismatchedControl.actual.portfolioEffect = "protected";
		expect(validateCalibrationRecord(mismatched, FIXTURE_EPOCH)).toMatchObject({
			valid: false,
			status: "miss",
			profileAcceptance: "blocked",
			issues: expect.arrayContaining([
				"controls[N-001].actual must exactly match the declared obligation",
			]),
		});

		const counterexample = structuredClone(valid);
		const counterexampleControl = counterexample.controls[0];
		if (!counterexampleControl) throw new Error("calibration fixture is empty");
		counterexampleControl.counterexamples = [
			"The fixture-only suite was accepted as composition-root coverage.",
		];
		expect(
			validateCalibrationRecord(counterexample, FIXTURE_EPOCH),
		).toMatchObject({
			valid: false,
			status: "miss",
			profileAcceptance: "blocked",
			issues: expect.arrayContaining([
				"controls[N-001].counterexamples records a calibration miss",
			]),
		});

		const launderedLimitation = structuredClone(valid);
		const launderingControl = launderedLimitation.controls.find(
			(control) => control.id === "X-003",
		);
		if (!launderingControl)
			throw new Error("X-003 calibration control is missing");
		launderingControl.actual.constraints = [
			"recognized subset cannot certify completeness",
			"disposition:limitation-accepted",
		];
		expect(
			validateCalibrationRecord(launderedLimitation, FIXTURE_EPOCH),
		).toMatchObject({
			valid: false,
			status: "miss",
			profileAcceptance: "blocked",
			issues: expect.arrayContaining([
				"controls[X-003].actual must exactly match the declared obligation",
			]),
		});

		const amendedInPlace = structuredClone(valid);
		amendedInPlace.amendment = {
			kind: "method",
			predecessorEpochId: FIXTURE_EPOCH,
			predecessorMethodDigest: "a".repeat(64),
			affectedEvidenceInvalidated: true,
			preservedMisses: [
				{ epochId: FIXTURE_EPOCH, controlId: "N-001", issue: "miss" },
			],
		};
		expect(
			validateCalibrationRecord(amendedInPlace, FIXTURE_EPOCH),
		).toMatchObject({
			valid: false,
			issues: expect.arrayContaining([
				"a method/schema amendment must open a successor epoch",
			]),
		});

		const successor = structuredClone(valid);
		successor.epochId = "epoch-successor";
		successor.methodDigest = "b".repeat(64);
		successor.amendment = {
			kind: "method",
			predecessorEpochId: FIXTURE_EPOCH,
			predecessorMethodDigest: valid.methodDigest,
			affectedEvidenceInvalidated: true,
			preservedMisses: [
				{ epochId: FIXTURE_EPOCH, controlId: "N-001", issue: "miss" },
			],
		};
		expect(validateCalibrationRecord(successor, "epoch-successor")).toEqual({
			valid: true,
			status: "pass",
			profileAcceptance: "licensed",
			issues: [],
		});

		expect(Object.keys(CALIBRATION_CONTROL_OBLIGATIONS)).toHaveLength(26);
	});

	// @cosmo-behavior plan:test-health-audit#B-009
	it("requires authorized closure or guardrail exclusion and blocks unratified contract changes", async () => {
		const materialInputs = [
			"test",
			"system-under-test",
			"contract",
			"inventory",
			"method",
			"runner",
			"config",
			"setup",
		].map((inputKind, index) => ({
			path: `${inputKind}.txt`,
			inputKind,
			sha256: String(index).padStart(64, "a"),
		}));
		const closedRow = {
			id: "REM-001",
			inputIds: ["repair-suite-1"],
			affectedClaims: ["lock artifacts remain invisible to git status"],
			scope: {
				sourcePaths: ["lib/entity-file-lock.ts"],
				testPaths: ["tests/entity-file-lock.test.ts"],
			},
			authority: {
				status: "ratified",
				citations: [
					{
						path: "missions/archive/tasks/TASK-495.md",
						locator: "AC #4 and #6",
					},
				],
			},
			deviationClassification: "product-defect",
			beforeEvidence: ["red test observed the git-visible acquisition temp"],
			failingProof:
				"the in-flight acquisition temp ended in .tmp instead of .lock",
			action: {
				kind: "repair-production",
				changedPaths: [
					"lib/entity-file-lock.ts",
					"tests/entity-file-lock.test.ts",
				],
			},
			actionEvidence: ["acquisition temp now ends in .lock"],
			closureEvidence: ["focused test is green"],
			correctnessReruns: ["bun run test tests/entity-file-lock.test.ts"],
			probeReruns: ["not-applicable: no survived probe opened this row"],
			profileUpdates: ["profile-lock-temp was reassessed"],
			matrixUpdates: ["BRI-004 persisted-state cell refreshed"],
			outcome: "closed",
		};
		const valid = {
			schemaVersion: 1,
			epochId: "epoch-successor",
			predecessorEpochId: "epoch-predecessor",
			waveId: "wave-001",
			status: "complete",
			changedPaths: [
				"lib/entity-file-lock.ts",
				"tests/entity-file-lock.test.ts",
			],
			rows: [closedRow],
			successorEpoch: {
				epochId: "epoch-successor",
				manifestChanged: true,
				rehashedMaterialInputs: materialInputs,
				invalidatedProfileIds: ["profile-lock-temp"],
				reassessedProfileIds: ["profile-lock-temp"],
				carriedProfileIds: ["profile-unrelated"],
			},
		};
		const options = {
			requiredRepairInputIds: ["repair-suite-1"],
			requiredWeaknessInputIds: ["repair-suite-1"],
			requiredMaterialInputs: materialInputs,
		};
		expect(
			validateRemediationLedger(valid, "epoch-successor", options),
		).toEqual({ valid: true, issues: [] });

		const unratified = structuredClone(valid);
		const unratifiedRow = firstRecord(unratified.rows);
		unratifiedRow.authority = { status: "absent", citations: [] };
		expect(
			validateRemediationLedger(unratified, "epoch-successor", options),
		).toMatchObject({
			valid: false,
			issues: expect.arrayContaining([
				"rows[0] cannot close a correction without ratified authority",
			]),
		});

		const open = structuredClone(valid);
		firstRecord(open.rows).outcome = "open";
		expect(
			validateRemediationLedger(open, "epoch-successor", options),
		).toMatchObject({ valid: false });

		const missingRepairInput = structuredClone(valid);
		firstRecord(missingRepairInput.rows).inputIds = [];
		expect(
			validateRemediationLedger(missingRepairInput, "epoch-successor", options),
		).toMatchObject({
			valid: false,
			issues: expect.arrayContaining([
				"repair-required input repair-suite-1 must be consumed exactly once",
			]),
		});
	});
});

describe("test health audit epoch provenance", () => {
	const roots: string[] = [];
	afterEach(async () => {
		for (const root of roots.splice(0)) await rm(root, { recursive: true });
	});

	const DIGEST = "a".repeat(64);

	function manifest(epochId: string) {
		return {
			schemaVersion: 1,
			methodVersion: "1",
			epochId,
			evaluatedRevision: "abc123",
			createdAt: "2026-09-17T15:00:00.000Z",
			materialInputs: [{ path: "vitest.config.ts", sha256: DIGEST }],
			commandDefinitions: [
				{ id: "normal", surface: "normal", argv: ["bun", "run", "test"] },
			],
			sourceCensusDigest: DIGEST,
		} as const;
	}

	function header(epochId: string, overrides: Record<string, unknown> = {}) {
		return {
			recordType: "profile-unit",
			epochId,
			unitId: "unit-1",
			assessorId: "assessor-1",
			processId: 4242,
			processBackend: "driver-process",
			measurementSource: "dispatcher",
			processStartedAt: "2026-09-17T15:10:00.000Z",
			processEndedAt: "2026-09-17T15:12:00.000Z",
			durationMs: 120000,
			peakRssBytes: 1024,
			...overrides,
		};
	}

	function profile(epochId: string, overrides: Record<string, unknown> = {}) {
		return {
			id: "b".repeat(64),
			disposition: { value: "retain", assessedAt: "2026-09-17T15:11:00.000Z" },
			materialInputs: [
				{
					path: `missions/x/audit/epochs/${epochId}/manifest.json`,
					sha256: DIGEST,
				},
			],
			...overrides,
		};
	}

	async function seed(
		root: string,
		epochId: string,
		records: readonly unknown[],
		rawBody: string,
	) {
		await openAuditEpoch(root, manifest(epochId));
		const epoch = join(root, "epochs", epochId);
		await mkdir(join(epoch, "profiles"), { recursive: true });
		await mkdir(join(epoch, "raw"), { recursive: true });
		await writeFile(
			join(epoch, "profiles", "unit-1.ndjson"),
			`${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
		);
		await writeFile(join(epoch, "raw", "normal.json"), rawBody);
	}

	async function provenanceOf(
		build: (root: string) => Promise<void>,
	): Promise<string[]> {
		const root = await mkdtemp(join(tmpdir(), "audit-provenance-"));
		roots.push(root);
		await build(root);
		return await validateEpochProvenance(root, manifest("epoch-2"));
	}

	it("rejects a successor unit that reuses a predecessor's process identity", async () => {
		const issues = await provenanceOf(async (root) => {
			await seed(root, "epoch-1", [header("epoch-1")], '{"run":1}');
			await seed(
				root,
				"epoch-2",
				[header("epoch-2"), profile("epoch-2", { id: "c".repeat(64) })],
				'{"run":2}',
			);
		});
		expect(issues).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/unit-1: unit reuses the process identity/),
			]),
		);
	});

	it("rejects a profile identical to a predecessor that omits carriedFrom", async () => {
		const issues = await provenanceOf(async (root) => {
			await seed(
				root,
				"epoch-1",
				[header("epoch-1"), profile("epoch-1")],
				'{"run":1}',
			);
			await seed(
				root,
				"epoch-2",
				[
					header("epoch-2", { processId: 99, peakRssBytes: 2048 }),
					profile("epoch-2", {
						disposition: {
							value: "retain",
							assessedAt: "2026-09-18T01:30:00.000Z",
						},
					}),
				],
				'{"run":2}',
			);
		});
		expect(issues).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/does not declare carriedFrom/),
			]),
		);
	});

	it("accepts the same judgment when it declares carriedFrom", async () => {
		const issues = await provenanceOf(async (root) => {
			await seed(
				root,
				"epoch-1",
				[header("epoch-1"), profile("epoch-1")],
				'{"run":1}',
			);
			await seed(
				root,
				"epoch-2",
				[
					header("epoch-2", { processId: 99, peakRssBytes: 2048 }),
					profile("epoch-2", {
						carriedFrom: { epochId: "epoch-1", profileDigest: DIGEST },
					}),
				],
				'{"run":2}',
			);
		});
		expect(issues).toEqual([]);
	});

	it("rejects raw command output copied from a predecessor epoch", async () => {
		const issues = await provenanceOf(async (root) => {
			await seed(root, "epoch-1", [header("epoch-1")], '{"run":"same"}');
			await seed(
				root,
				"epoch-2",
				[header("epoch-2", { processId: 99, peakRssBytes: 2048 })],
				'{"run":"same"}',
			);
		});
		expect(issues).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/raw\/normal\.json is byte-identical to epoch-1/),
			]),
		);
	});

	it("reports no provenance issue for a genuinely distinct successor", async () => {
		const issues = await provenanceOf(async (root) => {
			await seed(
				root,
				"epoch-1",
				[header("epoch-1"), profile("epoch-1")],
				'{"run":1}',
			);
			await seed(
				root,
				"epoch-2",
				[
					header("epoch-2", { processId: 99, peakRssBytes: 2048 }),
					profile("epoch-2", { disposition: { value: "strengthen" } }),
				],
				'{"run":2}',
			);
		});
		expect(issues).toEqual([]);
	});
	// @cosmo-behavior plan:test-health-audit#B-010
	it("validates all ten bundles in one epoch and forbids heuristic CI activation or active-plan coupling", () => {
		const epochId = "epoch-candidate";
		const methodDigest = "b".repeat(64);
		const bundleFiles = CANDIDATE_BUNDLES.flatMap((bundle) => bundle.files);
		const shard = "profiles/profile-unit-0001-abcdef012345.ndjson";
		const complete = {
			epochId,
			files: [...bundleFiles, shard],
			method: { path: "docs/test-health-audit.md", sha256: methodDigest },
			profileUnitFiles: [shard],
		};
		expect(validateCandidateBundles(complete)).toMatchObject({
			valid: true,
			missingBundleIds: [],
		});

		// A bundle short of one file is a partial set, not a candidate.
		const withoutGapRegister = validateCandidateBundles({
			...complete,
			files: complete.files.filter((file) => file !== "gap-register.md"),
		});
		expect(withoutGapRegister.valid).toBe(false);
		expect(withoutGapRegister.missingBundleIds).toEqual([4]);
		expect(
			validateCandidateBundles({ ...complete, method: undefined }),
		).toMatchObject({ valid: false, missingBundleIds: [1] });
		expect(
			validateCandidateBundles({ ...complete, profileUnitFiles: [] }).issues,
		).toContain("bundle 3 must contain at least one profile unit shard");

		// The bundles are addressed relative to an epoch directory, so a fixture
		// root works and the validator outlives this plan's own audit directory.
		for (const file of bundleFiles) {
			expect(file.startsWith("/")).toBe(false);
			expect(file).not.toContain("missions/plans");
		}

		const recommendations = {
			schemaVersion: 1,
			epochId,
			items: [
				{
					id: "GATE-001",
					check: "source census reconciles against runtime discovery",
					label: "objective-candidate",
					calibrationCitations: ["calibration.md control N-001"],
					limitations: ["watch surface observes only the initial cycle"],
					activation: "none",
					enforcedInCi: false,
				},
				{
					id: "GATE-002",
					check: "assessed grounding conclusions stay stable between waves",
					label: "agent-assessed-heuristic",
					calibrationCitations: ["calibration.md control X-004"],
					limitations: ["agent judgment is reasoned, not observed"],
					activation: "none",
					enforcedInCi: false,
				},
			],
			orderedQualityContract: [
				{ order: 1, gate: "correctness", bindingState: "bound" },
				{ order: 2, gate: "artifact-conformance", bindingState: "bound" },
				{
					order: 3,
					gate: "mutation",
					tier: "bindable",
					bindingState: "unbound",
				},
			],
			roadmapCrossLinks: [
				{ slug: "behavioral-regression", implemented: false },
				{ slug: "deliverable-completeness-gates", implemented: false },
			],
		};
		expect(validateGateRecommendations(recommendations, epochId)).toMatchObject(
			{ valid: true },
		);
		expect(
			parseGateRecommendationsDocument(
				`# Gate recommendations\n\n\`\`\`json gate-recommendations\n${JSON.stringify(recommendations)}\n\`\`\`\n`,
			),
		).toMatchObject({ epochId });

		const activated = validateGateRecommendations(
			{
				...recommendations,
				items: [
					{ ...recommendations.items[1], activation: "ci", enforcedInCi: true },
				],
			},
			epochId,
		);
		expect(activated.valid).toBe(false);
		expect(activated.issues).toContain(
			"items[0].activation must equal none; this plan activates no gate",
		);
		expect(activated.issues).toContain("items[0].enforcedInCi must be false");

		expect(
			validateGateRecommendations(
				{ ...recommendations, roadmapCrossLinks: [] },
				epochId,
			).issues,
		).toEqual([
			"roadmapCrossLinks must cross-link behavioral-regression",
			"roadmapCrossLinks must cross-link deliverable-completeness-gates",
		]);
		expect(
			validateGateRecommendations(
				{
					...recommendations,
					items: [
						{
							...recommendations.items[0],
							id: "GATE-003",
							check: "start the project-health-audit static sweep",
						},
					],
				},
				epochId,
			).issues,
		).toContain("items[0] must not expand into project-health-audit");
		expect(
			validateGateRecommendations(
				{
					...recommendations,
					orderedQualityContract: [
						{ order: 1, gate: "mutation", bindingState: "bound" },
						{ order: 2, gate: "correctness", bindingState: "bound" },
						{
							order: 3,
							gate: "artifact-conformance",
							tier: "bindable",
							bindingState: "unbound",
						},
					],
				},
				epochId,
			).valid,
		).toBe(false);

		// The digest the owner ratifies must not cover the document carrying
		// their own later decision.
		const digestInput = {
			evaluatedRevision: "a".repeat(40),
			materialInputs: [
				{
					path: "tests/one.test.ts",
					inputKind: "test",
					sha256: "1".repeat(64),
				},
				{
					path: "lib/one.ts",
					inputKind: "system-under-test",
					sha256: "2".repeat(64),
				},
			],
			bundleDigests: [
				{ bundleId: 2, file: "suite-integrity.json", sha256: "3".repeat(64) },
				{
					bundleId: 9,
					file: "gate-recommendations.md",
					sha256: "4".repeat(64),
				},
			],
			baselineConditions: [
				{ id: 1, status: "met" },
				{ id: 2, status: "met" },
			],
		};
		const digest = canonicalCandidateDigest(digestInput);
		expect(digest).toMatch(/^[a-f0-9]{64}$/u);
		expect(
			canonicalCandidateDigest({
				...digestInput,
				materialInputs: [...digestInput.materialInputs].reverse(),
				bundleDigests: [...digestInput.bundleDigests].reverse(),
			}),
		).toBe(digest);
		expect(
			canonicalCandidateDigest({
				...digestInput,
				baselineConditions: [
					{ id: 1, status: "met" },
					{ id: 2, status: "not-met" },
				],
			}),
		).not.toBe(digest);
		expect(() =>
			canonicalCandidateDigest({
				...digestInput,
				bundleDigests: [
					...digestInput.bundleDigests,
					{ bundleId: 10, file: "baseline.md", sha256: "5".repeat(64) },
				],
			}),
		).toThrow(/must exclude bundle 10/u);
	});

	// @cosmo-behavior plan:test-health-audit#B-011
	it("accepts established only for eight met conditions and a non-circular exact owner ratification", () => {
		const evaluatedRevision = "c".repeat(40);
		const candidateEvidenceDigest = "d".repeat(64);
		const metConditions = BASELINE_CONDITIONS.filter(
			(condition) => condition.id !== 8,
		).map((condition) => ({
			id: condition.id,
			status: "met" as const,
			reasons: [],
		}));
		const base = {
			epochId: "epoch-candidate",
			evaluatedRevision,
			candidateEvidenceDigest,
			conditions: metConditions,
			residualUncertaintyIds: ["RU-001", "RU-002"],
		};
		const ownerBlock = {
			decision: "established",
			ratifiedBy: "project owner",
			evaluatedRevision,
			candidateEvidenceDigest,
			acceptedUncertaintyIds: ["RU-001", "RU-002"],
		};

		// Automation's ceiling: every evidence row met still reads not established.
		const eligible = evaluateBaseline(base);
		expect(eligible).toMatchObject({
			verdict: "not established",
			eligibility: "eligible-for-ratification",
			failingConditionIds: [8],
		});
		expect(eligible.rows).toHaveLength(8);
		expect(eligible.rows.at(-1)).toMatchObject({ id: 8, status: "not-met" });

		expect(
			evaluateBaseline({ ...base, ownerRatification: ownerBlock }),
		).toMatchObject({
			verdict: "established",
			eligibility: "ratified",
			failingConditionIds: [],
		});

		// One failed evidence row is never waived by an owner decision.
		const blocked = evaluateBaseline({
			...base,
			conditions: metConditions.map((row) =>
				row.id === 4 ? { ...row, status: "blocked" as const } : row,
			),
			ownerRatification: ownerBlock,
		});
		expect(blocked).toMatchObject({
			verdict: "not established",
			eligibility: "not-eligible",
		});
		expect(blocked.failingConditionIds).toContain(4);

		for (const [label, block] of [
			["revision", { ...ownerBlock, evaluatedRevision: "e".repeat(40) }],
			["digest", { ...ownerBlock, candidateEvidenceDigest: "f".repeat(64) }],
			["uncertainty", { ...ownerBlock, acceptedUncertaintyIds: ["RU-001"] }],
			["decision", { ...ownerBlock, decision: "accepted" }],
		] as const) {
			const stale = evaluateBaseline({ ...base, ownerRatification: block });
			expect(stale.verdict, label).toBe("not established");
			expect(stale.eligibility, label).toBe("eligible-for-ratification");
		}

		// Condition 8 is the owner's act; automation cannot supply it as evidence.
		expect(
			evaluateBaseline({
				...base,
				conditions: [...metConditions, { id: 8, status: "met", reasons: [] }],
			}).issues,
		).toContain(
			"condition 8 is the owner's act and cannot be supplied as evidence",
		);
		expect(evaluateBaseline({ ...base, conditions: [] }).eligibility).toBe(
			"not-eligible",
		);

		const record = {
			schemaVersion: 1,
			epochId: "epoch-candidate",
			evaluatedRevision,
			candidateEvidenceDigest,
			verdict: "not established",
			eligibility: "eligible-for-ratification",
			conditions: eligible.rows,
		};
		const document = `# Test health baseline\n\n\`\`\`json baseline\n${JSON.stringify(record)}\n\`\`\`\n\n## Ratification packet\n\nQ-001 remains unresolved.\n`;
		expect(parseBaselineDocument(document)).toMatchObject({
			verdict: "not established",
		});
		expect(
			validateBaselineDocument(document, record, {
				epochId: "epoch-candidate",
				evaluatedRevision,
				candidateEvidenceDigest,
				packetQuestionIds: ["Q-001"],
			}),
		).toMatchObject({ valid: true });
		expect(
			validateBaselineDocument(document, record, {
				epochId: "epoch-candidate",
				evaluatedRevision,
				candidateEvidenceDigest,
				packetQuestionIds: ["Q-002"],
			}).issues,
		).toContain("unresolved question Q-002 must appear in the packet");
		expect(
			validateBaselineDocument(
				`${document}\n## Ratification packet\n`,
				record,
				{
					epochId: "epoch-candidate",
					evaluatedRevision,
					candidateEvidenceDigest,
					packetQuestionIds: [],
				},
			).issues,
		).toContain(
			"baseline must contain exactly one Ratification packet section",
		);
		expect(
			validateBaselineDocument(
				document,
				{ ...record, score: 92 },
				{
					epochId: "epoch-candidate",
					evaluatedRevision,
					candidateEvidenceDigest,
					packetQuestionIds: [],
				},
			).issues,
		).toContain("baseline must not carry a score field");
		expect(
			validateBaselineDocument(
				document,
				{ ...record, candidateEvidenceDigest: "0".repeat(64) },
				{
					epochId: "epoch-candidate",
					evaluatedRevision,
					candidateEvidenceDigest,
					packetQuestionIds: [],
				},
			).issues,
		).toContain("candidateEvidenceDigest must recompute over current evidence");
	});
});
