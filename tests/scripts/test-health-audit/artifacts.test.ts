import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	CALIBRATION_CONTROL_OBLIGATIONS,
	parseCalibrationDocument,
	validateBehaviorRiskInventory,
	validateCalibrationRecord,
} from "../../../scripts/test-health-audit/artifacts.ts";

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
});
