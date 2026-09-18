import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	buildProfileWorkQueue,
	CALIBRATION_CONTROL_OBLIGATIONS,
	digestMaterialInput,
	parseCalibrationDocument,
	parseRemediationLedgerDocument,
	publishProfileUnit,
	validateBehaviorRiskInventory,
	validateCalibrationRecord,
	validateProfileEpoch,
	validateRemediationLedger,
} from "../../../scripts/test-health-audit/artifacts.ts";
import {
	commandCensusDigest,
	sourceCensusDigest,
} from "../../../scripts/test-health-audit/census.ts";
import { runCli } from "../../../scripts/test-health-audit/cli.ts";
import { dispatchProfileUnits } from "../../../scripts/test-health-audit/dispatch.ts";
import {
	validatePortfolioEvidence,
	validatePortfolioEvidenceDocuments,
} from "../../../scripts/test-health-audit/portfolio.ts";
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

		const auditRoot = join(
			process.cwd(),
			"missions/plans/test-health-audit/audit",
		);
		const index = JSON.parse(
			await readFile(join(auditRoot, "index.json"), "utf8"),
		) as { currentEpochId: string };
		const epochDirectory = join(auditRoot, "epochs", index.currentEpochId);
		const [matrix, gapRegister, inventory] = await Promise.all([
			readFile(join(epochDirectory, "behavior-risk-matrix.md"), "utf8"),
			readFile(join(epochDirectory, "gap-register.md"), "utf8"),
			readFile(
				join(epochDirectory, "behavior-risk-inventory.json"),
				"utf8",
			).then((value) => JSON.parse(value) as unknown),
		]);
		expect(
			validatePortfolioEvidenceDocuments({
				matrix,
				gapRegister,
				inventory,
				currentEpochId: index.currentEpochId,
			}),
		).toEqual({ valid: true, issues: [] });
	});

	// @cosmo-behavior plan:test-health-audit#B-003
	it("rejects calibration with a missing control or any actual outcome that differs from its declared obligations", async () => {
		const auditRoot = join(
			process.cwd(),
			"missions/plans/test-health-audit/audit",
		);
		const index = JSON.parse(
			await readFile(join(auditRoot, "index.json"), "utf8"),
		) as { currentEpochId: string };
		const document = await readFile(
			join(auditRoot, "epochs", index.currentEpochId, "calibration.md"),
			"utf8",
		);
		const valid = parseCalibrationDocument(document);
		expect(validateCalibrationRecord(valid, index.currentEpochId)).toEqual({
			valid: true,
			status: "pass",
			profileAcceptance: "licensed",
			issues: [],
		});
		for (const source of valid.controls.flatMap((control) => control.sources)) {
			if (!source.path.startsWith("tests/")) continue;
			const executableTitle = source.identity.split(" > ").at(-1);
			expect(
				await readFile(join(process.cwd(), source.path), "utf8"),
				source.identity,
			).toContain(executableTitle);
		}

		const missing = structuredClone(valid);
		missing.controls.pop();
		expect(
			validateCalibrationRecord(missing, index.currentEpochId),
		).toMatchObject({
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
		expect(
			validateCalibrationRecord(mismatched, index.currentEpochId),
		).toMatchObject({
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
			validateCalibrationRecord(counterexample, index.currentEpochId),
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
			validateCalibrationRecord(launderedLimitation, index.currentEpochId),
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
			predecessorEpochId: index.currentEpochId,
			predecessorMethodDigest: "a".repeat(64),
			affectedEvidenceInvalidated: true,
			preservedMisses: [
				{ epochId: index.currentEpochId, controlId: "N-001", issue: "miss" },
			],
		};
		expect(
			validateCalibrationRecord(amendedInPlace, index.currentEpochId),
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
			predecessorEpochId: index.currentEpochId,
			predecessorMethodDigest: valid.methodDigest,
			affectedEvidenceInvalidated: true,
			preservedMisses: [
				{ epochId: index.currentEpochId, controlId: "N-001", issue: "miss" },
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

		const auditRoot = join(
			process.cwd(),
			"missions/plans/test-health-audit/audit",
		);
		const index = JSON.parse(
			await readFile(join(auditRoot, "index.json"), "utf8"),
		) as { currentEpochId: string };
		const epochDirectory = join(auditRoot, "epochs", index.currentEpochId);
		const [ledgerDocument, baselineDocument, suiteIntegrity, manifest] =
			await Promise.all([
				readFile(join(epochDirectory, "remediation-ledger.md"), "utf8"),
				readFile(join(epochDirectory, "baseline.md"), "utf8"),
				readFile(join(epochDirectory, "suite-integrity.json"), "utf8").then(
					(value) =>
						JSON.parse(value) as { repairRequired?: { findingId: string }[] },
				),
				readFile(join(epochDirectory, "manifest.json"), "utf8").then(
					(value) =>
						JSON.parse(value) as {
							materialInputs: { path: string; sha256: string }[];
						},
				),
			]);
		const ledger = parseRemediationLedgerDocument(ledgerDocument);
		const actual = ledger as {
			successorEpoch: {
				rehashedMaterialInputs: {
					path: string;
					inputKind: string;
					sha256: string;
				}[];
			};
		};
		expect(
			validateRemediationLedger(ledger, index.currentEpochId, {
				requiredRepairInputIds: (suiteIntegrity.repairRequired ?? []).map(
					(row) => row.findingId,
				),
				requiredWeaknessInputIds: [
					...(suiteIntegrity.repairRequired ?? []).map((row) => row.findingId),
					"portfolio:BRI-010",
				],
				requiredMaterialInputs:
					actual.successorEpoch.rehashedMaterialInputs.filter((input) =>
						manifest.materialInputs.some((item) => item.path === input.path),
					),
				baselineDocument,
			}),
		).toEqual({ valid: true, issues: [] });
	});
});
