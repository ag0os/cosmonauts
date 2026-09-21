import { describe, expect, test } from "vitest";
import {
	AUDIT_VOCABULARY,
	validatePortfolioConclusion,
	validateRatificationPacket,
	validateTestEvidenceProfile,
} from "../../../scripts/test-health-audit/schema.ts";

const SHA = "a".repeat(64);

function evidence(path = "lib/example.ts", kind = "source-span") {
	return { kind, path, span: { startLine: 1, endLine: 2 } };
}

function agentValue(value: unknown, basis = "reasoned") {
	return {
		value,
		lane: "agent-assessed-judgment",
		basis,
		assessor: {
			kind: "agent",
			id: "test-health-assessor",
			model: "openai-codex/gpt-5",
			modelVersion: "2026-09-16",
			assessedAt: "2026-09-16T18:00:00.000Z",
			consultedAuthorities: [
				{
					kind: "authority-document",
					path: "missions/plans/test-health-audit/spec.md",
					locator: "AC-005",
				},
			],
		},
		evidence: [evidence()],
		counterevidence: [],
		uncertainty: [],
		overrides: [],
	};
}

function collectorValue(value: unknown) {
	return {
		value,
		lane: "objective-observation",
		basis: "observed",
		assessor: {
			kind: "collector",
			id: "vitest-reporter",
			version: "1.0.0",
			observedAt: "2026-09-16T18:00:00.000Z",
		},
		evidence: [evidence("tests/example.test.ts")],
		counterevidence: [],
		uncertainty: [],
		overrides: [],
	};
}

function profile(
	options: {
		sutKind?: string;
		grounding?: string;
		realism?: string;
		claimStatus?: string;
		authority?: unknown[];
		authorityConflict?: boolean;
	} = {},
) {
	const sutKind = options.sutKind ?? "production-function";
	const sutPath =
		sutKind === "production-function"
			? "lib/example.ts"
			: `fixtures/${sutKind}`;
	const sut = {
		kind: sutKind === "production-function" ? "source-span" : "artifact",
		path: sutPath,
		...(sutKind === "production-function"
			? { span: { startLine: 1, endLine: 20 } }
			: {}),
		sutKind,
	};
	const materialInput = {
		path: sutPath,
		inputKind: "system-under-test",
		sutKind,
		scope: sutKind === "production-function" ? "declaration-span" : "file",
		...(sutKind === "production-function"
			? { span: { startLine: 1, endLine: 20 } }
			: {}),
		sha256: SHA,
	};

	return {
		schemaVersion: 1,
		id: `profile-${sutKind}`,
		source: {
			path: "tests/example.test.ts",
			line: 10,
			title: "protects one behavior",
			ordinal: 1,
			workUnitId: "unit-001",
		},
		runtime: collectorValue({
			discoveryBySurface: {
				normal: "passed",
				watch: "passed",
				coverage: "passed",
				repeat: "passed",
				shuffle: "passed",
				isolation: "passed",
			},
			caseNames: ["protects one behavior"],
			caseCount: 1,
		}),
		role: agentValue("unit"),
		claim: agentValue({
			status: options.claimStatus ?? "identified",
			text: "the declared behavior is preserved",
			authority: options.authority ?? [
				{
					kind: "authority-document",
					path: "missions/plans/test-health-audit/spec.md",
					locator: "AC-005",
				},
			],
			...(options.authorityConflict === undefined
				? {}
				: { authorityConflict: options.authorityConflict }),
		}),
		chain: agentValue({
			assertions: [evidence("tests/example.test.ts")],
			observations: [evidence("tests/example.test.ts")],
			systemsUnderTest: [sut],
			limitations: [],
		}),
		dimensions: {
			execution: agentValue("executed", "observed"),
			grounding: agentValue(
				options.grounding ??
					(sutKind.startsWith("shipped-")
						? "shipped-artifact"
						: "mediated-production"),
			),
			contractAlignment: agentValue("aligned"),
			faultSensitivity: agentValue("reasoned"),
			realism: agentValue(options.realism ?? "integrated-subsystem"),
			determinism: agentValue("stable", "observed"),
			engineeringQuality: agentValue("sound"),
		},
		reasonCodes: agentValue([]),
		portfolioContributions: agentValue([
			{
				inventoryId: "behavior-001",
				boundary: "producer",
				defectAxes: ["value-propagation"],
			},
		]),
		disposition: agentValue("retain"),
		materialInputs: [
			materialInput,
			{
				path: "vitest.config.ts",
				inputKind: "runner",
				scope: "file",
				sha256: SHA,
			},
		],
	};
}

function expectInvalid(input: unknown, issue: RegExp) {
	const result = validateTestEvidenceProfile(input);
	expect(result.valid).toBe(false);
	expect(result.issues.join("\n")).toMatch(issue);
}

describe("test health audit schema", () => {
	test("preserves seven dimensions all grounding forms and field-level assessment provenance without a score", () => {
		const legitimateForms = [
			["production-function", "direct-production", "isolated-real-unit"],
			["shipped-file", "shipped-artifact", "integrated-subsystem"],
			["shipped-prompt", "shipped-artifact", "simulated-boundary"],
			["configuration", "mediated-production", "simulated-boundary"],
			["cli-output", "mediated-production", "integrated-subsystem"],
			["subprocess", "mediated-production", "simulated-boundary"],
			["event", "mediated-production", "integrated-subsystem"],
			["persisted-state", "mediated-production", "integrated-subsystem"],
			["composition-root", "mediated-production", "composition-root"],
		] as const;

		for (const [sutKind, grounding, realism] of legitimateForms) {
			const result = validateTestEvidenceProfile(
				profile({ sutKind, grounding, realism }),
			);
			expect(result, sutKind).toEqual({ valid: true, issues: [] });
		}

		const invalidDimensions = structuredClone(profile()) as Record<
			string,
			unknown
		>;
		const dimensions = invalidDimensions.dimensions as Record<string, unknown>;
		delete dimensions.realism;
		expectInvalid(invalidDimensions, /dimensions\.realism/);
		expectInvalid(
			{ ...profile(), dimensions: agentValue("healthy") },
			/dimensions\.execution/,
		);

		for (const forbiddenField of [
			"score",
			"overallHealth",
			"verdict",
			"portfolioConclusion",
			"ciFailure",
		]) {
			const invalid = { ...profile(), [forbiddenField]: "healthy" };
			expectInvalid(invalid, new RegExp(forbiddenField));
		}

		const invalidVocabulary = structuredClone(profile()) as Record<
			string,
			unknown
		>;
		(
			(invalidVocabulary.dimensions as Record<string, unknown>)
				.grounding as Record<string, unknown>
		).value = "well-grounded";
		expectInvalid(invalidVocabulary, /dimensions\.grounding\.value/);

		const unsupportedSut = profile({ sutKind: "database-table" });
		expectInvalid(unsupportedSut, /sutKind/);
	});

	test("classifies false-confidence chains without automatically demoting mocks mediation or focused units", () => {
		const mockMasked = profile({
			sutKind: "event",
			grounding: "mediated-production",
			realism: "simulated-boundary",
		});
		mockMasked.reasonCodes = agentValue(["mock-supplied outcome"]);
		mockMasked.dimensions.faultSensitivity = agentValue("probe-survived");
		mockMasked.portfolioContributions = agentValue([]);
		mockMasked.disposition = agentValue("strengthen");

		const mediated = profile({
			sutKind: "composition-root",
			grounding: "mediated-production",
			realism: "composition-root",
		});
		const focusedUnit = profile({
			sutKind: "production-function",
			grounding: "direct-production",
			realism: "isolated-real-unit",
		});
		const sessionEvidence = profile({
			sutKind: "shipped-file",
			grounding: "shipped-artifact",
			realism: "test-only",
			claimStatus: "no-meaningful-claim",
		});
		sessionEvidence.source.path = [
			"tests/domains",
			["cod", "ing-agents.test.ts"].join(""),
		].join("/");
		sessionEvidence.source.title = "uses valid session values";
		sessionEvidence.claim = agentValue({
			status: "no-meaningful-claim",
			text: "AgentDefinition.session establishes no runtime persistence guardrail",
			authority: [
				{
					kind: "authority-document",
					path: "ROADMAP.md",
					locator: "observational-memory-adoption",
				},
			],
		});
		sessionEvidence.reasonCodes = agentValue(["missing consumer seam"]);
		sessionEvidence.portfolioContributions = agentValue([]);
		sessionEvidence.disposition = agentValue("investigate");
		(
			sessionEvidence.chain.value as { systemsUnderTest: unknown[] }
		).systemsUnderTest = [
			{
				kind: "artifact",
				path: "lib/agents/types.ts",
				locator: "AgentDefinition.session",
				sutKind: "shipped-file",
			},
		];
		sessionEvidence.materialInputs[0] = {
			path: "lib/agents/types.ts",
			inputKind: "system-under-test",
			sutKind: "shipped-file",
			scope: "file",
			sha256: SHA,
		};

		for (const candidate of [
			mockMasked,
			mediated,
			focusedUnit,
			sessionEvidence,
		]) {
			expect(validateTestEvidenceProfile(candidate)).toEqual({
				valid: true,
				issues: [],
			});
		}
	});

	test("enforces provenance lanes override shape and ratification-only human assessors", () => {
		const collectorJudgment = structuredClone(profile()) as unknown as Record<
			string,
			unknown
		>;
		collectorJudgment.role = collectorValue("unit");
		expectInvalid(collectorJudgment, /role.*agent-assessed-judgment/);

		const mismatchedLane = structuredClone(profile()) as unknown as Record<
			string,
			unknown
		>;
		mismatchedLane.runtime = agentValue("runtime");
		expectInvalid(mismatchedLane, /runtime.*objective-observation/);

		const humanProfile = structuredClone(profile());
		(humanProfile.disposition.assessor as unknown as Record<string, unknown>) =
			{
				kind: "human",
				id: "owner",
				reviewedAt: "2026-09-16T19:00:00.000Z",
			};
		expectInvalid(humanProfile, /human.*ratification/i);

		const packet = {
			assessments: [
				{
					...agentValue("established"),
					lane: "agent-assessed-judgment",
					assessor: {
						kind: "human",
						id: "owner",
						reviewedAt: "2026-09-16T19:00:00.000Z",
					},
				},
			],
		};
		expect(validateRatificationPacket(packet)).toEqual({
			valid: true,
			issues: [],
		});

		const malformedOverride = structuredClone(profile());
		(malformedOverride.disposition.overrides as unknown[]) = [
			{ previousDigest: SHA, assessor: "agent-1", at: "now" },
		];
		expectInvalid(malformedOverride, /overrides\[0\]\.reason/);

		for (const required of [
			"id",
			"model",
			"modelVersion",
			"assessedAt",
			"consultedAuthorities",
		]) {
			const incompleteAgent = structuredClone(profile());
			delete (incompleteAgent.role.assessor as Record<string, unknown>)[
				required
			];
			expectInvalid(
				incompleteAgent,
				new RegExp(`role\\.assessor\\.${required}`),
			);
		}

		for (const required of ["id", "version", "observedAt"]) {
			const incompleteCollector = structuredClone(profile());
			delete (incompleteCollector.runtime.assessor as Record<string, unknown>)[
				required
			];
			expectInvalid(
				incompleteCollector,
				new RegExp(`runtime\\.assessor\\.${required}`),
			);
		}
	});

	test("requires absent or conflicting authority to remain unresolved", () => {
		for (const candidate of [
			profile({ authority: [], claimStatus: "identified" }),
			profile({ authorityConflict: true, claimStatus: "identified" }),
		]) {
			expectInvalid(candidate, /claim.*unresolved/);
		}

		for (const candidate of [
			profile({ authority: [], claimStatus: "unresolved" }),
			profile({ authorityConflict: true, claimStatus: "unresolved" }),
		]) {
			expect(validateTestEvidenceProfile(candidate)).toEqual({
				valid: true,
				issues: [],
			});
		}

		const implementationAsAuthority = profile();
		implementationAsAuthority.claim = agentValue({
			status: "identified",
			text: "current behavior is treated as intended",
			authority: [evidence("lib/current-behavior.ts")],
		});
		expectInvalid(implementationAsAuthority, /not contract authority/);

		const disguisedTestAuthority = profile();
		disguisedTestAuthority.claim = agentValue({
			status: "identified",
			text: "the current test expectation is treated as intended",
			authority: [
				{
					kind: "authority-document",
					path: "tests/example.test.ts",
				},
			],
		});
		expectInvalid(
			disguisedTestAuthority,
			/test expectation as contract authority/,
		);

		const noClaimContribution = profile({ claimStatus: "no-meaningful-claim" });
		expectInvalid(noClaimContribution, /portfolioContributions.*empty/);
	});

	test("accepts only exact controlled vocabularies", () => {
		const mutations: Array<
			[string, (candidate: ReturnType<typeof profile>) => void]
		> = [
			[
				"role",
				(candidate) => {
					candidate.role.value = "integration";
				},
			],
			[
				"basis",
				(candidate) => {
					candidate.disposition.basis = "inferred";
				},
			],
			[
				"reasonCodes",
				(candidate) => {
					candidate.reasonCodes.value = ["too many mocks"];
				},
			],
			[
				"disposition",
				(candidate) => {
					candidate.disposition.value = "accept";
				},
			],
			[
				"claim.value.status",
				(candidate) => {
					(candidate.claim.value as Record<string, unknown>).status = "known";
				},
			],
		];

		for (const [field, mutate] of mutations) {
			const candidate = profile();
			mutate(candidate);
			expectInvalid(candidate, new RegExp(field.replace(".", "\\.")));
		}

		const dimensionVocabularies = {
			execution: AUDIT_VOCABULARY.executionConclusions,
			grounding: AUDIT_VOCABULARY.groundingConclusions,
			contractAlignment: AUDIT_VOCABULARY.contractAlignmentConclusions,
			faultSensitivity: AUDIT_VOCABULARY.faultSensitivityConclusions,
			realism: AUDIT_VOCABULARY.realismConclusions,
			determinism: AUDIT_VOCABULARY.determinismConclusions,
			engineeringQuality: AUDIT_VOCABULARY.engineeringQualityConclusions,
		} as const;
		for (const [dimension, values] of Object.entries(dimensionVocabularies)) {
			for (const value of values) {
				const candidate = profile();
				candidate.dimensions[
					dimension as keyof typeof candidate.dimensions
				].value = value;
				expect(
					validateTestEvidenceProfile(candidate).valid,
					`${dimension}:${value}`,
				).toBe(true);
			}
		}

		for (const basis of AUDIT_VOCABULARY.evidenceBases) {
			const candidate = profile();
			candidate.disposition.basis = basis;
			expect(
				validateTestEvidenceProfile(candidate).valid,
				`basis:${basis}`,
			).toBe(true);
		}
		for (const reason of AUDIT_VOCABULARY.reasonCodes) {
			const candidate = profile();
			candidate.reasonCodes.value = [reason];
			expect(
				validateTestEvidenceProfile(candidate).valid,
				`reason:${reason}`,
			).toBe(true);
		}
		for (const conclusion of AUDIT_VOCABULARY.portfolioConclusions) {
			expect(
				validatePortfolioConclusion(conclusion).valid,
				`portfolio:${conclusion}`,
			).toBe(true);
		}
		expect(validatePortfolioConclusion("healthy").valid).toBe(false);
		for (const disposition of AUDIT_VOCABULARY.dispositions) {
			const candidate = profile();
			candidate.disposition.value = disposition;
			expect(
				validateTestEvidenceProfile(candidate).valid,
				`disposition:${disposition}`,
			).toBe(true);
		}
		for (const status of AUDIT_VOCABULARY.claimStatuses) {
			const candidate = profile();
			(candidate.claim.value as Record<string, unknown>).status = status;
			if (status === "no-meaningful-claim") {
				candidate.portfolioContributions = agentValue([]);
			}
			expect(
				validateTestEvidenceProfile(candidate).valid,
				`claim:${status}`,
			).toBe(true);
		}
	});

	test("enforces declaration spans for production functions and file digests for whole-file inputs", () => {
		const fileScopedFunction = profile();
		fileScopedFunction.materialInputs[0] = {
			path: "lib/example.ts",
			inputKind: "system-under-test",
			sutKind: "production-function",
			scope: "file",
			sha256: SHA,
		};
		expectInvalid(fileScopedFunction, /materialInputs\[0\].*declaration-span/);

		for (const inputKind of [
			"runner",
			"config",
			"setup",
			"contract",
			"method",
			"schema",
			"inventory-row",
			"command",
		]) {
			const declarationScopedFile = profile();
			declarationScopedFile.materialInputs[1] = {
				path: `${inputKind}.ts`,
				inputKind,
				scope: "declaration-span",
				span: { startLine: 1, endLine: 2 },
				sha256: SHA,
			};
			expectInvalid(
				declarationScopedFile,
				new RegExp(`materialInputs\\[1\\].*${inputKind}.*file`),
			);
		}

		const fileScopedDeclaration = profile();
		fileScopedDeclaration.materialInputs.push({
			path: "tests/example.test.ts",
			inputKind: "test-declaration",
			scope: "file",
			sha256: SHA,
		} as never);
		expectInvalid(fileScopedDeclaration, /test-declaration.*declaration-span/);

		const missingSpan = profile();
		delete (missingSpan.materialInputs[0] as { span?: unknown }).span;
		expectInvalid(missingSpan, /materialInputs\[0\]\.span/);

		const extraSpan = profile({ sutKind: "shipped-file" });
		(extraSpan.materialInputs[0] as { span?: unknown }).span = {
			startLine: 1,
			endLine: 2,
		};
		expectInvalid(extraSpan, /materialInputs\[0\]\.span/);
	});
});
