export const AUDIT_VOCABULARY = {
	evidenceBases: [
		"observed",
		"probe-confirmed",
		"reasoned",
		"missing",
		"blocked",
	],
	assessmentLanes: ["objective-observation", "agent-assessed-judgment"],
	testSurfaces: [
		"normal",
		"watch",
		"coverage",
		"repeat",
		"shuffle",
		"isolation",
	],
	runtimeStates: [
		"collected",
		"passed",
		"failed",
		"skipped",
		"todo",
		"not-collected",
		"errored",
	],
	testRoles: [
		"unit",
		"seam/component",
		"artifact contract",
		"CLI/subprocess",
		"persistence",
		"recovery",
		"concurrency",
		"other",
	],
	claimStatuses: ["identified", "no-meaningful-claim", "unresolved"],
	sutKinds: [
		"production-function",
		"shipped-file",
		"shipped-prompt",
		"configuration",
		"cli-output",
		"subprocess",
		"event",
		"persisted-state",
		"composition-root",
	],
	executionConclusions: [
		"executed",
		"skipped",
		"todo",
		"undiscovered",
		"errored",
		"unknown",
	],
	groundingConclusions: [
		"direct-production",
		"shipped-artifact",
		"mediated-production",
		"test-local",
		"unresolved",
	],
	contractAlignmentConclusions: [
		"aligned",
		"partially-aligned",
		"misaligned",
		"unresolved",
	],
	faultSensitivityConclusions: [
		"probe-confirmed",
		"reasoned",
		"probe-survived",
		"unassessed",
	],
	realismConclusions: [
		"composition-root",
		"integrated-subsystem",
		"isolated-real-unit",
		"simulated-boundary",
		"test-only",
		"unresolved",
	],
	determinismConclusions: ["stable", "conditional", "flaky", "unassessed"],
	engineeringQualityConclusions: [
		"sound",
		"concern",
		"defective",
		"unassessed",
	],
	reasonCodes: [
		"test-local assertion",
		"mock-supplied outcome",
		"wrong-side expectation",
		"missing consumer seam",
		"missing composition root",
		"missing caller or alternate path",
		"undiscovered or filtered test",
		"collection or execution error",
		"skipped or todo protection",
		"conditional or unreachable assertion",
		"contract authority unresolved",
		"realistic defect survived",
		"nondeterministic outcome",
		"assessment blind spot",
	],
	portfolioConclusions: [
		"protected",
		"partially-protected",
		"unprotected",
		"unresolved",
	],
	dispositions: ["retain", "strengthen", "replace", "remove", "investigate"],
} as const;

export type EvidenceBasis = (typeof AUDIT_VOCABULARY.evidenceBases)[number];
export type AssessmentLane = (typeof AUDIT_VOCABULARY.assessmentLanes)[number];
export type TestSurface = (typeof AUDIT_VOCABULARY.testSurfaces)[number];
export type RuntimeState = (typeof AUDIT_VOCABULARY.runtimeStates)[number];
export type TestRole = (typeof AUDIT_VOCABULARY.testRoles)[number];
export type ClaimStatus = (typeof AUDIT_VOCABULARY.claimStatuses)[number];
export type SystemUnderTestKind = (typeof AUDIT_VOCABULARY.sutKinds)[number];
export type ExecutionConclusion =
	(typeof AUDIT_VOCABULARY.executionConclusions)[number];
export type GroundingConclusion =
	(typeof AUDIT_VOCABULARY.groundingConclusions)[number];
export type ContractAlignmentConclusion =
	(typeof AUDIT_VOCABULARY.contractAlignmentConclusions)[number];
export type FaultSensitivityConclusion =
	(typeof AUDIT_VOCABULARY.faultSensitivityConclusions)[number];
export type RealismConclusion =
	(typeof AUDIT_VOCABULARY.realismConclusions)[number];
export type DeterminismConclusion =
	(typeof AUDIT_VOCABULARY.determinismConclusions)[number];
export type EngineeringQualityConclusion =
	(typeof AUDIT_VOCABULARY.engineeringQualityConclusions)[number];
export type ReasonCode = (typeof AUDIT_VOCABULARY.reasonCodes)[number];
export type PortfolioConclusion =
	(typeof AUDIT_VOCABULARY.portfolioConclusions)[number];
export type Disposition = (typeof AUDIT_VOCABULARY.dispositions)[number];

export interface SourceSpan {
	readonly startLine: number;
	readonly endLine: number;
}

export interface EvidenceRef {
	readonly kind:
		| "source-span"
		| "command-output"
		| "artifact"
		| "authority-document"
		| "probe-record";
	readonly path: string;
	readonly span?: SourceSpan;
	readonly locator?: string;
	readonly quote?: string;
}

export interface SystemUnderTestRef extends EvidenceRef {
	readonly kind: "source-span" | "artifact";
	readonly sutKind: SystemUnderTestKind;
}

export type EvidenceDigest =
	| {
			readonly path: string;
			readonly inputKind: "test-declaration";
			readonly scope: "declaration-span";
			readonly span: SourceSpan;
			readonly sha256: string;
	  }
	| {
			readonly path: string;
			readonly inputKind: "system-under-test";
			readonly sutKind: SystemUnderTestKind;
			readonly scope: "declaration-span" | "file";
			readonly span?: SourceSpan;
			readonly sha256: string;
	  }
	| {
			readonly path: string;
			readonly inputKind:
				| "runner"
				| "config"
				| "setup"
				| "contract"
				| "method"
				| "schema"
				| "inventory-row"
				| "command";
			readonly scope: "file";
			readonly sha256: string;
	  };

export type Assessor =
	| {
			readonly kind: "collector";
			readonly id: string;
			readonly version: string;
			readonly observedAt: string;
	  }
	| {
			readonly kind: "agent";
			readonly id: string;
			readonly model: string;
			readonly modelVersion: string;
			readonly assessedAt: string;
			readonly consultedAuthorities: readonly EvidenceRef[];
	  }
	| {
			readonly kind: "human";
			readonly id: string;
			readonly reviewedAt: string;
	  };

export interface AssessmentOverride {
	readonly previousDigest: string;
	readonly reason: string;
	readonly assessor: string;
	readonly at: string;
}

export interface AssessedValue<T> {
	readonly value: T;
	readonly lane: AssessmentLane;
	readonly basis: EvidenceBasis;
	readonly assessor: Assessor;
	readonly evidence: readonly EvidenceRef[];
	readonly counterevidence: readonly EvidenceRef[];
	readonly uncertainty: readonly string[];
	readonly overrides: readonly AssessmentOverride[];
}

export interface PortfolioContribution {
	readonly inventoryId: string;
	readonly boundary: string;
	readonly defectAxes: readonly string[];
}

export interface TestEvidenceProfile {
	readonly schemaVersion: 1;
	readonly id: string;
	readonly source: {
		readonly path: string;
		readonly line: number;
		readonly title: string;
		readonly ordinal: number;
		readonly workUnitId: string;
	};
	readonly runtime: AssessedValue<{
		readonly discoveryBySurface: Readonly<Record<TestSurface, RuntimeState>>;
		readonly caseNames: readonly string[];
		readonly caseCount: number;
	}>;
	readonly role: AssessedValue<TestRole>;
	readonly claim: AssessedValue<{
		readonly status: ClaimStatus;
		readonly text: string;
		readonly authority: readonly EvidenceRef[];
		readonly authorityConflict?: boolean;
	}>;
	readonly chain: AssessedValue<{
		readonly assertions: readonly EvidenceRef[];
		readonly observations: readonly EvidenceRef[];
		readonly systemsUnderTest: readonly SystemUnderTestRef[];
		readonly limitations: readonly string[];
	}>;
	readonly dimensions: {
		readonly execution: AssessedValue<ExecutionConclusion>;
		readonly grounding: AssessedValue<GroundingConclusion>;
		readonly contractAlignment: AssessedValue<ContractAlignmentConclusion>;
		readonly faultSensitivity: AssessedValue<FaultSensitivityConclusion>;
		readonly realism: AssessedValue<RealismConclusion>;
		readonly determinism: AssessedValue<DeterminismConclusion>;
		readonly engineeringQuality: AssessedValue<EngineeringQualityConclusion>;
	};
	readonly reasonCodes: AssessedValue<readonly ReasonCode[]>;
	readonly portfolioContributions: AssessedValue<
		readonly PortfolioContribution[]
	>;
	readonly disposition: AssessedValue<Disposition>;
	readonly materialInputs: readonly EvidenceDigest[];
	readonly carriedFrom?: {
		readonly epochId: string;
		readonly profileDigest: string;
	};
}

export interface ValidationResult {
	readonly valid: boolean;
	readonly issues: readonly string[];
}

type RecordValue = Record<string, unknown>;
type ValueValidator = (value: unknown, path: string, issues: string[]) => void;

const EVIDENCE_KINDS = [
	"source-span",
	"command-output",
	"artifact",
	"authority-document",
	"probe-record",
] as const;
const MATERIAL_INPUT_KINDS = [
	"test-declaration",
	"system-under-test",
	"runner",
	"config",
	"setup",
	"contract",
	"method",
	"schema",
	"inventory-row",
	"command",
] as const;
const DIMENSION_VALIDATORS = {
	execution: enumValidator(AUDIT_VOCABULARY.executionConclusions),
	grounding: enumValidator(AUDIT_VOCABULARY.groundingConclusions),
	contractAlignment: enumValidator(
		AUDIT_VOCABULARY.contractAlignmentConclusions,
	),
	faultSensitivity: enumValidator(AUDIT_VOCABULARY.faultSensitivityConclusions),
	realism: enumValidator(AUDIT_VOCABULARY.realismConclusions),
	determinism: enumValidator(AUDIT_VOCABULARY.determinismConclusions),
	engineeringQuality: enumValidator(
		AUDIT_VOCABULARY.engineeringQualityConclusions,
	),
} as const;

export function validateTestEvidenceProfile(input: unknown): ValidationResult {
	const issues: string[] = [];
	if (!isRecord(input)) return invalid("profile must be an object");
	checkKeys(
		input,
		"profile",
		[
			"schemaVersion",
			"id",
			"source",
			"runtime",
			"role",
			"claim",
			"chain",
			"dimensions",
			"reasonCodes",
			"portfolioContributions",
			"disposition",
			"materialInputs",
		],
		["carriedFrom"],
		issues,
	);
	checkLiteral(input.schemaVersion, 1, "schemaVersion", issues);
	checkNonEmptyString(input.id, "id", issues);
	validateSource(input.source, "source", issues);
	validateAssessedValue(input.runtime, "runtime", issues, {
		lane: "objective-observation",
		value: validateRuntime,
	});
	validateAssessedValue(input.role, "role", issues, {
		lane: "agent-assessed-judgment",
		value: enumValidator(AUDIT_VOCABULARY.testRoles),
	});
	validateAssessedValue(input.claim, "claim", issues, {
		lane: "agent-assessed-judgment",
		value: validateClaim,
	});
	validateAssessedValue(input.chain, "chain", issues, {
		lane: "agent-assessed-judgment",
		value: validateChain,
	});
	validateDimensions(input.dimensions, "dimensions", issues);
	validateAssessedValue(input.reasonCodes, "reasonCodes", issues, {
		lane: "agent-assessed-judgment",
		value: arrayValidator(enumValidator(AUDIT_VOCABULARY.reasonCodes)),
	});
	validateAssessedValue(
		input.portfolioContributions,
		"portfolioContributions",
		issues,
		{
			lane: "agent-assessed-judgment",
			value: arrayValidator(validatePortfolioContribution),
		},
	);
	validateAssessedValue(input.disposition, "disposition", issues, {
		lane: "agent-assessed-judgment",
		value: enumValidator(AUDIT_VOCABULARY.dispositions),
	});
	validateClaimContributionConsistency(
		input.claim,
		input.portfolioContributions,
		issues,
	);
	validateMaterialInputs(input.materialInputs, input.chain, issues);
	if (input.carriedFrom !== undefined)
		validateCarriedFrom(input.carriedFrom, "carriedFrom", issues);
	return result(issues);
}

export function validatePortfolioConclusion(input: unknown): ValidationResult {
	const issues: string[] = [];
	enumValidator(AUDIT_VOCABULARY.portfolioConclusions)(
		input,
		"portfolioConclusion",
		issues,
	);
	return result(issues);
}

export function validateEvidenceDigest(input: unknown): ValidationResult {
	const issues: string[] = [];
	validateEvidenceDigestAt(input, "evidenceDigest", issues);
	return result(issues);
}

export function validateRatificationPacket(input: unknown): ValidationResult {
	const issues: string[] = [];
	if (!isRecord(input)) return invalid("ratification packet must be an object");
	checkKeys(input, "ratificationPacket", ["assessments"], [], issues);
	if (!Array.isArray(input.assessments)) {
		issues.push("assessments must be an array");
	} else {
		input.assessments.forEach((assessment, index) => {
			validateAssessedValue(assessment, `assessments[${index}]`, issues, {
				lane: "agent-assessed-judgment",
				allowHuman: true,
				value: () => {},
			});
		});
	}
	return result(issues);
}

function validateSource(value: unknown, path: string, issues: string[]): void {
	if (!expectRecord(value, path, issues)) return;
	checkKeys(
		value,
		path,
		["path", "line", "title", "ordinal", "workUnitId"],
		[],
		issues,
	);
	checkNonEmptyString(value.path, `${path}.path`, issues);
	checkPositiveInteger(value.line, `${path}.line`, issues);
	checkNonEmptyString(value.title, `${path}.title`, issues);
	checkPositiveInteger(value.ordinal, `${path}.ordinal`, issues);
	checkNonEmptyString(value.workUnitId, `${path}.workUnitId`, issues);
}

function validateRuntime(value: unknown, path: string, issues: string[]): void {
	if (!expectRecord(value, path, issues)) return;
	checkKeys(
		value,
		path,
		["discoveryBySurface", "caseNames", "caseCount"],
		[],
		issues,
	);
	if (
		expectRecord(value.discoveryBySurface, `${path}.discoveryBySurface`, issues)
	) {
		checkKeys(
			value.discoveryBySurface,
			`${path}.discoveryBySurface`,
			AUDIT_VOCABULARY.testSurfaces,
			[],
			issues,
		);
		for (const [surface, state] of Object.entries(value.discoveryBySurface)) {
			if (!includes(AUDIT_VOCABULARY.testSurfaces, surface))
				issues.push(
					`${path}.discoveryBySurface has unsupported surface ${surface}`,
				);
			enumValidator(AUDIT_VOCABULARY.runtimeStates)(
				state,
				`${path}.discoveryBySurface.${surface}`,
				issues,
			);
		}
	}
	stringArrayValidator(value.caseNames, `${path}.caseNames`, issues);
	checkNonNegativeInteger(value.caseCount, `${path}.caseCount`, issues);
	if (
		Array.isArray(value.caseNames) &&
		value.caseCount !== value.caseNames.length
	)
		issues.push(`${path}.caseCount must equal caseNames length`);
}

function validateClaim(value: unknown, path: string, issues: string[]): void {
	if (!expectRecord(value, path, issues)) return;
	checkKeys(
		value,
		path,
		["status", "text", "authority"],
		["authorityConflict"],
		issues,
	);
	enumValidator(AUDIT_VOCABULARY.claimStatuses)(
		value.status,
		`${path}.status`,
		issues,
	);
	checkNonEmptyString(value.text, `${path}.text`, issues);
	validateAuthorityRefs(value.authority, `${path}.authority`, issues);
	if (
		value.authorityConflict !== undefined &&
		typeof value.authorityConflict !== "boolean"
	)
		issues.push(`${path}.authorityConflict must be a boolean`);
	const absent = Array.isArray(value.authority) && value.authority.length === 0;
	if (
		(absent || value.authorityConflict === true) &&
		value.status !== "unresolved"
	)
		issues.push(
			`${path}.status must be unresolved when contract authority is absent or conflicting`,
		);
}

function validateAuthorityRefs(
	value: unknown,
	path: string,
	issues: string[],
): void {
	if (!Array.isArray(value)) {
		issues.push(`${path} must be an array`);
		return;
	}
	value.forEach((entry, index) => {
		const entryPath = `${path}[${index}]`;
		validateEvidenceRef(entry, entryPath, issues);
		if (isRecord(entry) && entry.kind !== "authority-document") {
			issues.push(
				`${entryPath}.kind must be authority-document; current implementation and test expectations are not contract authority`,
			);
		}
		if (
			isRecord(entry) &&
			typeof entry.path === "string" &&
			isImplementationOrTestPath(entry.path)
		) {
			issues.push(
				`${entryPath}.path cannot use current implementation or a test expectation as contract authority`,
			);
		}
	});
}

function validateClaimContributionConsistency(
	claimValue: unknown,
	contributionsValue: unknown,
	issues: string[],
): void {
	const claim = assessedInnerValue(claimValue);
	const contributions = assessedInnerValue(contributionsValue);
	if (
		isRecord(claim) &&
		claim.status === "no-meaningful-claim" &&
		Array.isArray(contributions) &&
		contributions.length > 0
	) {
		issues.push(
			"portfolioContributions.value must be empty for a no-meaningful-claim profile",
		);
	}
}

function validateChain(value: unknown, path: string, issues: string[]): void {
	if (!expectRecord(value, path, issues)) return;
	checkKeys(
		value,
		path,
		["assertions", "observations", "systemsUnderTest", "limitations"],
		[],
		issues,
	);
	validateEvidenceRefs(value.assertions, `${path}.assertions`, issues);
	validateEvidenceRefs(value.observations, `${path}.observations`, issues);
	if (!Array.isArray(value.systemsUnderTest)) {
		issues.push(`${path}.systemsUnderTest must be an array`);
	} else {
		value.systemsUnderTest.forEach((sut, index) => {
			validateSystemUnderTest(
				sut,
				`${path}.systemsUnderTest[${index}]`,
				issues,
			);
		});
	}
	stringArrayValidator(value.limitations, `${path}.limitations`, issues);
}

function validateDimensions(
	value: unknown,
	path: string,
	issues: string[],
): void {
	if (!expectRecord(value, path, issues)) return;
	checkKeys(value, path, Object.keys(DIMENSION_VALIDATORS), [], issues);
	for (const [name, validator] of Object.entries(DIMENSION_VALIDATORS))
		validateAssessedValue(value[name], `${path}.${name}`, issues, {
			lane: "agent-assessed-judgment",
			value: validator,
		});
}

function validatePortfolioContribution(
	value: unknown,
	path: string,
	issues: string[],
): void {
	if (!expectRecord(value, path, issues)) return;
	checkKeys(value, path, ["inventoryId", "boundary", "defectAxes"], [], issues);
	checkNonEmptyString(value.inventoryId, `${path}.inventoryId`, issues);
	checkNonEmptyString(value.boundary, `${path}.boundary`, issues);
	stringArrayValidator(value.defectAxes, `${path}.defectAxes`, issues);
}

function validateAssessedValue(
	value: unknown,
	path: string,
	issues: string[],
	options: {
		readonly lane: AssessmentLane;
		readonly value: ValueValidator;
		readonly allowHuman?: boolean;
	},
): void {
	if (!expectRecord(value, path, issues)) return;
	checkKeys(
		value,
		path,
		[
			"value",
			"lane",
			"basis",
			"assessor",
			"evidence",
			"counterevidence",
			"uncertainty",
			"overrides",
		],
		[],
		issues,
	);
	options.value(value.value, `${path}.value`, issues);
	if (value.lane !== options.lane)
		issues.push(`${path}.lane must be ${options.lane}`);
	enumValidator(AUDIT_VOCABULARY.evidenceBases)(
		value.basis,
		`${path}.basis`,
		issues,
	);
	validateAssessor(value.assessor, `${path}.assessor`, issues, {
		lane: options.lane,
		allowHuman: options.allowHuman ?? false,
	});
	validateEvidenceRefs(value.evidence, `${path}.evidence`, issues);
	validateEvidenceRefs(
		value.counterevidence,
		`${path}.counterevidence`,
		issues,
	);
	stringArrayValidator(value.uncertainty, `${path}.uncertainty`, issues);
	validateOverrides(value.overrides, `${path}.overrides`, issues);
}

function validateAssessor(
	value: unknown,
	path: string,
	issues: string[],
	options: { readonly lane: AssessmentLane; readonly allowHuman: boolean },
): void {
	if (!expectRecord(value, path, issues)) return;
	if (value.kind === "human") {
		checkKeys(value, path, ["kind", "id", "reviewedAt"], [], issues);
		checkNonEmptyString(value.id, `${path}.id`, issues);
		checkNonEmptyString(value.reviewedAt, `${path}.reviewedAt`, issues);
		if (!options.allowHuman)
			issues.push(
				`${path}: human assessors are accepted only in a ratification packet`,
			);
		return;
	}
	if (options.lane === "objective-observation") {
		if (value.kind !== "collector") {
			issues.push(`${path}.kind must be collector for objective-observation`);
			return;
		}
		checkKeys(value, path, ["kind", "id", "version", "observedAt"], [], issues);
		checkNonEmptyString(value.id, `${path}.id`, issues);
		checkNonEmptyString(value.version, `${path}.version`, issues);
		checkNonEmptyString(value.observedAt, `${path}.observedAt`, issues);
		return;
	}
	if (value.kind !== "agent") {
		issues.push(`${path}.kind must be agent for agent-assessed-judgment`);
		return;
	}
	checkKeys(
		value,
		path,
		[
			"kind",
			"id",
			"model",
			"modelVersion",
			"assessedAt",
			"consultedAuthorities",
		],
		[],
		issues,
	);
	checkNonEmptyString(value.id, `${path}.id`, issues);
	checkNonEmptyString(value.model, `${path}.model`, issues);
	checkNonEmptyString(value.modelVersion, `${path}.modelVersion`, issues);
	checkNonEmptyString(value.assessedAt, `${path}.assessedAt`, issues);
	validateEvidenceRefs(
		value.consultedAuthorities,
		`${path}.consultedAuthorities`,
		issues,
	);
}

function validateEvidenceRefs(
	value: unknown,
	path: string,
	issues: string[],
): void {
	if (!Array.isArray(value)) {
		issues.push(`${path} must be an array`);
		return;
	}
	value.forEach((entry, index) => {
		validateEvidenceRef(entry, `${path}[${index}]`, issues);
	});
}

function validateEvidenceRef(
	value: unknown,
	path: string,
	issues: string[],
): void {
	if (!expectRecord(value, path, issues)) return;
	checkKeys(
		value,
		path,
		["kind", "path"],
		["span", "locator", "quote"],
		issues,
	);
	enumValidator(EVIDENCE_KINDS)(value.kind, `${path}.kind`, issues);
	checkNonEmptyString(value.path, `${path}.path`, issues);
	if (value.span !== undefined)
		validateSpan(value.span, `${path}.span`, issues);
	optionalString(value.locator, `${path}.locator`, issues);
	optionalString(value.quote, `${path}.quote`, issues);
}

function validateSystemUnderTest(
	value: unknown,
	path: string,
	issues: string[],
): void {
	if (!expectRecord(value, path, issues)) return;
	checkKeys(
		value,
		path,
		["kind", "path", "sutKind"],
		["span", "locator", "quote"],
		issues,
	);
	enumValidator(["source-span", "artifact"] as const)(
		value.kind,
		`${path}.kind`,
		issues,
	);
	enumValidator(AUDIT_VOCABULARY.sutKinds)(
		value.sutKind,
		`${path}.sutKind`,
		issues,
	);
	checkNonEmptyString(value.path, `${path}.path`, issues);
	if (value.span !== undefined)
		validateSpan(value.span, `${path}.span`, issues);
	if (value.kind === "source-span" && value.span === undefined)
		issues.push(`${path}.span is required for source-span evidence`);
	optionalString(value.locator, `${path}.locator`, issues);
	optionalString(value.quote, `${path}.quote`, issues);
}

function validateMaterialInputs(
	value: unknown,
	chainValue: unknown,
	issues: string[],
): void {
	if (!Array.isArray(value)) {
		issues.push("materialInputs must be an array");
		return;
	}
	value.forEach((entry, index) => {
		validateEvidenceDigestAt(entry, `materialInputs[${index}]`, issues);
	});
	const chain = assessedInnerValue(chainValue);
	const systems =
		isRecord(chain) && Array.isArray(chain.systemsUnderTest)
			? chain.systemsUnderTest
			: [];
	for (const sut of systems) {
		if (!isRecord(sut) || sut.sutKind !== "production-function") continue;
		const hasDigest = value.some(
			(digest) =>
				isRecord(digest) &&
				digest.inputKind === "system-under-test" &&
				digest.sutKind === "production-function" &&
				digest.path === sut.path &&
				digest.scope === "declaration-span",
		);
		if (!hasDigest)
			issues.push(
				`materialInputs must include a declaration-span digest for production-function ${String(sut.path)}`,
			);
	}
}

function validateEvidenceDigestAt(
	value: unknown,
	path: string,
	issues: string[],
): void {
	if (!expectRecord(value, path, issues)) return;
	const systemUnderTest = value.inputKind === "system-under-test";
	checkKeys(
		value,
		path,
		systemUnderTest
			? ["path", "inputKind", "sutKind", "scope", "sha256"]
			: ["path", "inputKind", "scope", "sha256"],
		["span"],
		issues,
	);
	checkNonEmptyString(value.path, `${path}.path`, issues);
	enumValidator(MATERIAL_INPUT_KINDS)(
		value.inputKind,
		`${path}.inputKind`,
		issues,
	);
	enumValidator(["declaration-span", "file"] as const)(
		value.scope,
		`${path}.scope`,
		issues,
	);
	if (typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256))
		issues.push(`${path}.sha256 must be a lowercase SHA-256 digest`);
	if (value.scope === "declaration-span") {
		if (value.span === undefined)
			issues.push(`${path}.span is required for declaration-span scope`);
		else validateSpan(value.span, `${path}.span`, issues);
	} else if (value.span !== undefined) {
		issues.push(`${path}.span is forbidden for file scope`);
	}
	if (systemUnderTest) {
		enumValidator(AUDIT_VOCABULARY.sutKinds)(
			value.sutKind,
			`${path}.sutKind`,
			issues,
		);
		if (
			value.sutKind === "production-function" &&
			value.scope !== "declaration-span"
		)
			issues.push(
				`${path} production-function inputs require declaration-span scope`,
			);
	} else if (value.inputKind === "test-declaration") {
		if (value.scope !== "declaration-span")
			issues.push(
				`${path} test-declaration inputs require declaration-span scope`,
			);
	} else if (
		includes(
			[
				"runner",
				"config",
				"setup",
				"contract",
				"method",
				"schema",
				"inventory-row",
				"command",
			] as const,
			value.inputKind,
		) &&
		value.scope !== "file"
	) {
		issues.push(`${path} ${String(value.inputKind)} inputs require file scope`);
	}
}

function validateOverrides(
	value: unknown,
	path: string,
	issues: string[],
): void {
	if (!Array.isArray(value)) {
		issues.push(`${path} must be an array`);
		return;
	}
	value.forEach((entry, index) => {
		const entryPath = `${path}[${index}]`;
		if (!expectRecord(entry, entryPath, issues)) return;
		checkKeys(
			entry,
			entryPath,
			["previousDigest", "reason", "assessor", "at"],
			[],
			issues,
		);
		checkNonEmptyString(
			entry.previousDigest,
			`${entryPath}.previousDigest`,
			issues,
		);
		checkNonEmptyString(entry.reason, `${entryPath}.reason`, issues);
		checkNonEmptyString(entry.assessor, `${entryPath}.assessor`, issues);
		checkNonEmptyString(entry.at, `${entryPath}.at`, issues);
	});
}

function validateCarriedFrom(
	value: unknown,
	path: string,
	issues: string[],
): void {
	if (!expectRecord(value, path, issues)) return;
	checkKeys(value, path, ["epochId", "profileDigest"], [], issues);
	checkNonEmptyString(value.epochId, `${path}.epochId`, issues);
	checkNonEmptyString(value.profileDigest, `${path}.profileDigest`, issues);
}

function validateSpan(value: unknown, path: string, issues: string[]): void {
	if (!expectRecord(value, path, issues)) return;
	checkKeys(value, path, ["startLine", "endLine"], [], issues);
	checkPositiveInteger(value.startLine, `${path}.startLine`, issues);
	checkPositiveInteger(value.endLine, `${path}.endLine`, issues);
	if (
		typeof value.startLine === "number" &&
		typeof value.endLine === "number" &&
		value.endLine < value.startLine
	)
		issues.push(`${path}.endLine must be greater than or equal to startLine`);
}

function arrayValidator(itemValidator: ValueValidator): ValueValidator {
	return (value, path, issues) => {
		if (!Array.isArray(value)) {
			issues.push(`${path} must be an array`);
			return;
		}
		value.forEach((item, index) => {
			itemValidator(item, `${path}[${index}]`, issues);
		});
	};
}

function enumValidator<const T extends readonly string[]>(
	allowed: T,
): ValueValidator {
	return (value, path, issues) => {
		if (!includes(allowed, value))
			issues.push(`${path} must be one of: ${allowed.join(", ")}`);
	};
}

function stringArrayValidator(
	value: unknown,
	path: string,
	issues: string[],
): void {
	arrayValidator((entry, entryPath, entryIssues) =>
		checkNonEmptyString(entry, entryPath, entryIssues),
	)(value, path, issues);
}

function checkKeys(
	value: RecordValue,
	path: string,
	required: readonly string[],
	optional: readonly string[],
	issues: string[],
): void {
	const allowed = new Set([...required, ...optional]);
	for (const key of Object.keys(value))
		if (!allowed.has(key)) issues.push(`${joinPath(path, key)} is not allowed`);
	for (const key of required)
		if (!Object.hasOwn(value, key))
			issues.push(`${joinPath(path, key)} is required`);
}

function expectRecord(
	value: unknown,
	path: string,
	issues: string[],
): value is RecordValue {
	if (!isRecord(value)) {
		issues.push(`${path} must be an object`);
		return false;
	}
	return true;
}

function checkLiteral(
	value: unknown,
	expected: string | number,
	path: string,
	issues: string[],
): void {
	if (value !== expected) issues.push(`${path} must be ${expected}`);
}

function checkNonEmptyString(
	value: unknown,
	path: string,
	issues: string[],
): void {
	if (typeof value !== "string" || value.length === 0)
		issues.push(`${path} must be a non-empty string`);
}

function optionalString(value: unknown, path: string, issues: string[]): void {
	if (value !== undefined) checkNonEmptyString(value, path, issues);
}

function checkPositiveInteger(
	value: unknown,
	path: string,
	issues: string[],
): void {
	if (!Number.isInteger(value) || (value as number) < 1)
		issues.push(`${path} must be a positive integer`);
}

function checkNonNegativeInteger(
	value: unknown,
	path: string,
	issues: string[],
): void {
	if (!Number.isInteger(value) || (value as number) < 0)
		issues.push(`${path} must be a non-negative integer`);
}

function assessedInnerValue(value: unknown): unknown {
	return isRecord(value) ? value.value : undefined;
}

function joinPath(path: string, key: string): string {
	return path === "profile" ? key : `${path}.${key}`;
}

function includes(values: readonly unknown[], value: unknown): boolean {
	return values.includes(value);
}

function isRecord(value: unknown): value is RecordValue {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isImplementationOrTestPath(path: string): boolean {
	return /^(?:bundled|cli|domains|lib|scripts|tests)\//.test(path);
}

function invalid(issue: string): ValidationResult {
	return { valid: false, issues: [issue] };
}

function result(issues: string[]): ValidationResult {
	return { valid: issues.length === 0, issues };
}
