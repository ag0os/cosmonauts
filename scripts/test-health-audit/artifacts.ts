import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
	access,
	mkdir,
	open,
	readFile,
	rename,
	unlink,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { AUDIT_VOCABULARY, type TestSurface } from "./schema.ts";

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9._-]+$/;
export interface EpochManifest {
	readonly schemaVersion: 1;
	readonly methodVersion: string;
	readonly epochId: string;
	readonly evaluatedRevision: string;
	readonly createdAt: string;
	readonly materialInputs: readonly {
		readonly path: string;
		readonly sha256: string;
	}[];
	readonly commandDefinitions: readonly {
		readonly id: string;
		readonly surface: TestSurface;
		readonly argv: readonly string[];
		readonly cwd?: string;
		readonly configFile?: string;
		readonly filters?: readonly string[];
	}[];
	readonly sourceCensusDigest: string;
}
export interface AuditIndex {
	readonly currentEpochId: string;
	readonly epochIds: readonly string[];
}

interface CalibrationObligation {
	dimensionConclusions: string[] | "unconstrained";
	evidenceBases: string[] | "unconstrained";
	reasonCodes: string[] | "unconstrained";
	portfolioEffect: string;
	constraints: string[];
}

export const CALIBRATION_CONTROL_OBLIGATIONS = {
	"N-001": obligation(
		"unconstrained",
		"unconstrained",
		["missing composition root"],
		"unprotected",
		["fixture contributors retained", "shipped composition-root cell missing"],
	),
	"N-002": obligation(
		["contractAlignment:misaligned"],
		"unconstrained",
		["wrong-side expectation"],
		"unconstrained",
		[
			"excluded from guardrail evidence until corrected against ratified authority",
		],
	),
	"N-003": obligation(
		"unconstrained",
		"unconstrained",
		["missing consumer seam"],
		"partially-protected",
		[
			"producer contribution remains producer-only",
			"survived mutation not counted",
		],
	),
	"N-004": obligation(
		["faultSensitivity:probe-survived"],
		"unconstrained",
		["mock-supplied outcome"],
		"unconstrained",
		["probe-confirmed requires a rerun with other doubles non-contributing"],
	),
	"N-005": obligation(
		"unconstrained",
		"unconstrained",
		["missing caller or alternate path"],
		"partially-protected",
		["path-parity gap explicit"],
	),
	"N-006": obligation(
		"unconstrained",
		"unconstrained",
		"unconstrained",
		"unprotected",
		[
			"fixture contact cannot substitute for shipped adapter or composition evidence",
		],
	),
	"N-007": obligation(
		"unconstrained",
		"unconstrained",
		["missing caller or alternate path"],
		"unresolved",
		["every caller requires fix-or-justification evidence"],
	),
	"N-008": obligation(
		"unconstrained",
		"unconstrained",
		"unconstrained",
		"partially-protected",
		["only observed axis protected", "unobserved axes remain explicit gaps"],
	),
	"N-009": obligation(
		"unconstrained",
		"unconstrained",
		"unconstrained",
		"partially-protected",
		[
			"error axis separate",
			"success or proxy axis separate",
			"confirmation or republication axis separate",
		],
	),
	"N-010": obligation(
		"unconstrained",
		"unconstrained",
		"unconstrained",
		"unconstrained",
		[
			"excluded-from-runtime-guardrail-evidence",
			"roadmap:observational-memory-adoption",
			"remediation:none",
		],
	),
	"N-011": obligation(
		"unconstrained",
		"unconstrained",
		"unconstrained",
		"partially-protected",
		[
			"timeout budget is engineering-quality evidence only",
			"descendant exit observation may contribute cleanup evidence",
		],
	),
	"X-001": obligation(
		["execution:undiscovered"],
		["observed"],
		["undiscovered or filtered test"],
		"unprotected",
		["never clean"],
	),
	"X-002": obligation(
		"unconstrained",
		["blocked"],
		["collection or execution error", "assessment blind spot"],
		"unresolved",
		["no clean conclusion"],
	),
	"X-003": obligation(
		"unconstrained",
		["missing", "blocked"],
		["assessment blind spot"],
		"unresolved",
		[
			"recognized subset cannot certify completeness",
			"disposition:repair-required-tooling",
			"disposition:limitation-accepted forbidden",
		],
	),
	"X-004": obligation(
		["contractAlignment:unresolved"],
		"unconstrained",
		"unconstrained",
		"unresolved",
		["no test or portfolio claim inferred"],
	),
	"X-005": obligation(
		["contractAlignment:partially-aligned"],
		"unconstrained",
		"unconstrained",
		"partially-protected",
		[
			"omitted material property remains an explicit gap",
			"authority may instead require unresolved",
		],
	),
	"P-001": obligation(
		["grounding:direct-production", "realism:isolated-real-unit"],
		"unconstrained",
		"unconstrained",
		"unconstrained",
		["focused production-function unit retained without composition penalty"],
	),
	"P-002": obligation(
		["grounding:mediated-production"],
		"unconstrained",
		"unconstrained",
		"unconstrained",
		["event mediation is not weakness"],
	),
	"P-003": obligation(
		["grounding:shipped-artifact"],
		"unconstrained",
		"unconstrained",
		"unconstrained",
		["artifact contract needs no composition-depth promotion"],
	),
	"P-004": obligation(
		"unconstrained",
		"unconstrained",
		"unconstrained",
		"unconstrained",
		["configuration is a legitimate SUT", "synthetic config limits explicit"],
	),
	"P-005": obligation(
		"unconstrained",
		"unconstrained",
		"unconstrained",
		"unconstrained",
		[
			"CLI output is observable",
			"renderer coverage contributes only at renderer seam",
		],
	),
	"P-006": obligation(
		["realism:simulated-boundary", "realism:integrated-subsystem"],
		"unconstrained",
		"unconstrained",
		"unconstrained",
		[
			"simulated subprocess and real process observation are distinct legitimate roles",
			"only real process observation proves cleanup",
		],
	),
	"P-007": obligation(
		"unconstrained",
		"unconstrained",
		"unconstrained",
		"unconstrained",
		["persisted state is a legitimate SUT", "durability limits explicit"],
	),
	"P-008": obligation(
		["realism:integrated-subsystem"],
		"unconstrained",
		"unconstrained",
		"unconstrained",
		["recovery contributor not demoted for setup depth"],
	),
	"P-009": obligation(
		"unconstrained",
		"unconstrained",
		"unconstrained",
		"unconstrained",
		["concurrency risk protected when observation and determinism established"],
	),
	"P-010": obligation(
		["realism:composition-root"],
		"unconstrained",
		"unconstrained",
		"unconstrained",
		["copied real corpus limit explicit", "dry-run limit explicit"],
	),
} as const satisfies Record<string, CalibrationObligation>;

export interface CalibrationControl {
	id: string;
	polarity: "negative" | "external" | "positive";
	sources: { path: string; identity: string }[];
	expected: CalibrationObligation;
	actual: CalibrationObligation;
	assessor: {
		kind: string;
		id: string;
		model: string;
		modelVersion: string;
		assessedAt: string;
		consultedAuthorities: string[];
	};
	reviewed: boolean;
	counterexamples: string[];
	result: "pass" | "miss";
}

export interface CalibrationRecord {
	schemaVersion: number;
	epochId: string;
	methodDigest: string;
	status: "pass" | "miss";
	profileAcceptance: "licensed" | "blocked";
	run: { scope: string; controlIds: string[] };
	controls: CalibrationControl[];
	amendment?: {
		kind: "method" | "schema";
		predecessorEpochId: string;
		predecessorMethodDigest: string;
		affectedEvidenceInvalidated: boolean;
		preservedMisses: { epochId: string; controlId: string; issue: string }[];
	};
}

export interface CalibrationValidation {
	readonly valid: boolean;
	readonly status: "pass" | "miss";
	readonly profileAcceptance: "licensed" | "blocked";
	readonly issues: readonly string[];
}

function obligation(
	dimensionConclusions: string[] | "unconstrained",
	evidenceBases: string[] | "unconstrained",
	reasonCodes: string[] | "unconstrained",
	portfolioEffect: string,
	constraints: string[],
): CalibrationObligation {
	return {
		dimensionConclusions,
		evidenceBases,
		reasonCodes,
		portfolioEffect,
		constraints,
	};
}

const INVENTORY_BOUNDARIES = [
	"producer",
	"consumer",
	"adapter",
	"persisted-state",
	"event",
	"alternate-path",
	"composition-root",
] as const;
const INVENTORY_AXES = ["path", "caller", "defect"] as const;
const REQUIRED_INVENTORY_EVIDENCE = [
	"package-public-surfaces",
	"cli-surfaces",
	"domain-surfaces",
	"shipped-artifacts",
	"shipped-contracts",
	"active-architecture-decisions",
	"incident-risk-records",
] as const;
const REQUIRED_INVENTORY_EXCLUSIONS = [
	"census-identities",
	"test-files",
	"behavior-markers",
	"coverage-output",
] as const;
const INVENTORY_CRITICALITIES = ["critical", "high", "medium", "low"];
const BOUNDARY_APPLICABILITY = ["applicable", "not-applicable", "unavailable"];
const SOURCE_KINDS = [
	"shipped-surface",
	"shipped-artifact",
	"shipped-contract",
	"architecture-decision",
	"incident-risk-record",
];

export function validateBehaviorRiskInventory(
	input: unknown,
	currentEpochId: string,
): { readonly valid: boolean; readonly issues: readonly string[] } {
	const issues: string[] = [];
	if (!isRecord(input))
		return { valid: false, issues: ["inventory must be an object"] };
	if (input.schemaVersion !== 1) issues.push("schemaVersion must equal 1");
	if (input.epochId !== currentEpochId)
		issues.push(`epochId must match current epoch ${currentEpochId}`);
	if (input.status !== "frozen") issues.push("status must equal frozen");
	if (input.heuristicJudgmentsActivateCi !== false)
		issues.push("heuristic inventory judgments must remain evidence-only");
	validateInventorySourceLog(input.sourceLog, issues);
	validateInventoryEntries(input.entries, issues);
	validateInventoryFreeze(input.freeze, input.sourceLog, input.entries, issues);
	return { valid: issues.length === 0, issues };
}

function validateInventorySourceLog(input: unknown, issues: string[]): void {
	if (!isRecord(input)) {
		issues.push("sourceLog must be an object");
		return;
	}
	if (input.lane !== "objective-observation")
		issues.push("sourceLog must use objective-observation lane");
	const restricted = input.restrictedEvidence;
	if (!isRecord(restricted)) {
		issues.push("sourceLog.restrictedEvidence must be an object");
	} else {
		checkExactSet(
			restricted.excluded,
			REQUIRED_INVENTORY_EXCLUSIONS,
			"sourceLog.restrictedEvidence.excluded",
			issues,
		);
		checkContainsSet(
			restricted.included,
			REQUIRED_INVENTORY_EVIDENCE,
			"sourceLog.restrictedEvidence.included",
			issues,
		);
	}
	const groups = stringArray(input.enumeratedGroups);
	if (!groups || groups.length === 0 || new Set(groups).size !== groups.length)
		issues.push("sourceLog.enumeratedGroups must contain unique groups");
	const units = Array.isArray(input.workUnits) ? input.workUnits : undefined;
	if (!units || units.length === 0) {
		issues.push("sourceLog.workUnits must not be empty");
	} else {
		for (const [unitIndex, unit] of units.entries())
			validateInventoryWorkUnit(unit, unitIndex, groups ?? [], issues);
	}
	const statements = Array.isArray(input.positiveCoverageStatements)
		? input.positiveCoverageStatements
		: undefined;
	if (!statements) {
		issues.push("sourceLog.positiveCoverageStatements must be an array");
		return;
	}
	const coveredGroups: string[] = [];
	for (const [index, statement] of statements.entries()) {
		const path = `sourceLog.positiveCoverageStatements[${index}]`;
		if (!isRecord(statement)) {
			issues.push(`${path} must be an object`);
			continue;
		}
		if (!nonEmpty(statement.group)) issues.push(`${path}.group is required`);
		else coveredGroups.push(statement.group);
		if (!nonEmpty(statement.statement))
			issues.push(`${path}.statement is required`);
		const paths = stringArray(statement.sourcePaths);
		if (!paths || paths.length === 0)
			issues.push(`${path}.sourcePaths is required`);
		else
			for (const [sourceIndex, sourcePath] of paths.entries())
				if (isRestrictedAuthorityPath(sourcePath))
					issues.push(
						`${path}.sourcePaths[${sourceIndex}] must cite non-test authority`,
					);
	}
	if (
		!groups ||
		!sameSet(groups, coveredGroups) ||
		new Set(coveredGroups).size !== coveredGroups.length
	)
		issues.push(
			"sourceLog positive coverage statements must exactly cover enumerated groups",
		);
}

function validateInventoryWorkUnit(
	input: unknown,
	index: number,
	groups: readonly string[],
	issues: string[],
): void {
	const path = `sourceLog.workUnits[${index}]`;
	if (!isRecord(input)) {
		issues.push(`${path} must be an object`);
		return;
	}
	if (!nonEmpty(input.id)) issues.push(`${path}.id is required`);
	const assignedGroups = stringArray(input.assignedGroups);
	if (!assignedGroups || assignedGroups.length === 0)
		issues.push(`${path}.assignedGroups is required`);
	else if (assignedGroups.some((group) => !groups.includes(group)))
		issues.push(`${path}.assignedGroups must be enumerated`);
	const sources = Array.isArray(input.sources) ? input.sources : undefined;
	if (!sources || sources.length === 0)
		issues.push(`${path}.sources is required`);
	else
		for (const [sourceIndex, source] of sources.entries()) {
			const sourcePath = `${path}.sources[${sourceIndex}]`;
			if (!isRecord(source)) {
				issues.push(`${sourcePath} must be an object`);
				continue;
			}
			if (
				!nonEmpty(source.path) ||
				isRestrictedAuthorityPath(String(source.path))
			)
				issues.push(`${sourcePath}.path must cite non-test authority`);
			if (!SOURCE_KINDS.includes(String(source.kind)))
				issues.push(`${sourcePath}.kind is invalid`);
			if (!SHA256.test(String(source.sha256)))
				issues.push(`${sourcePath}.sha256 must be sha256`);
		}
	const consulted = stringArray(input.consultedAuthorities);
	if (!consulted || consulted.length === 0)
		issues.push(`${path}.consultedAuthorities is required`);
	else if (consulted.some(isRestrictedAuthorityPath))
		issues.push(`${path}.consultedAuthorities must cite non-test authority`);
	const skipped = input.incidentalCitationsNotOpened;
	if (!Array.isArray(skipped))
		issues.push(`${path}.incidentalCitationsNotOpened is required`);
	else
		for (const [citationIndex, citation] of skipped.entries()) {
			const citationPath = `${path}.incidentalCitationsNotOpened[${citationIndex}]`;
			if (
				!isRecord(citation) ||
				!nonEmpty(citation.authorityPath) ||
				isRestrictedAuthorityPath(String(citation.authorityPath))
			)
				issues.push(
					`${citationPath}.authorityPath must cite non-test authority`,
				);
			if (!isRecord(citation) || !nonEmpty(citation.statement))
				issues.push(`${citationPath}.statement is required`);
		}
}

function validateInventoryEntries(input: unknown, issues: string[]): void {
	if (!Array.isArray(input) || input.length === 0) {
		issues.push("entries must not be empty");
		return;
	}
	for (const [index, entry] of input.entries()) {
		const path = `entries[${index}]`;
		if (!isRecord(entry)) {
			issues.push(`${path} must be an object`);
			continue;
		}
		if (!nonEmpty(entry.id)) issues.push(`${path}.id is required`);
		if (!nonEmpty(entry.title)) issues.push(`${path}.title is required`);
		validateInventoryJudgment(
			entry.contract,
			`${path}.contract`,
			issues,
			(value) => nonEmpty(value),
		);
		validateInventoryAuthorities(
			entry.authorities,
			`${path}.authorities`,
			issues,
		);
		validateInventoryJudgment(
			entry.criticality,
			`${path}.criticality`,
			issues,
			(value) => INVENTORY_CRITICALITIES.includes(String(value)),
			true,
		);
		if (!isRecord(entry.boundaries))
			issues.push(`${path}.boundaries must be an object`);
		else
			for (const boundary of INVENTORY_BOUNDARIES) {
				if (!(boundary in entry.boundaries))
					issues.push(`${path}.boundaries.${boundary} is required`);
				else
					validateInventoryJudgment(
						entry.boundaries[boundary],
						`${path}.boundaries.${boundary}`,
						issues,
						(value) => BOUNDARY_APPLICABILITY.includes(String(value)),
					);
			}
		if (!isRecord(entry.axes)) issues.push(`${path}.axes must be an object`);
		else
			for (const axis of INVENTORY_AXES) {
				if (!(axis in entry.axes))
					issues.push(`${path}.axes.${axis} is required`);
				else
					validateInventoryJudgment(
						entry.axes[axis],
						`${path}.axes.${axis}`,
						issues,
						(value) =>
							Array.isArray(value) && value.length > 0 && value.every(nonEmpty),
					);
			}
	}
}

function validateInventoryAuthorities(
	input: unknown,
	path: string,
	issues: string[],
): void {
	if (!Array.isArray(input) || input.length === 0) {
		issues.push(`${path} must not be empty`);
		return;
	}
	for (const [index, authority] of input.entries()) {
		const authorityPath = `${path}[${index}]`;
		if (!isRecord(authority)) {
			issues.push(`${authorityPath} must be an object`);
			continue;
		}
		if (
			!nonEmpty(authority.path) ||
			isRestrictedAuthorityPath(String(authority.path))
		)
			issues.push(`${authorityPath}.path must cite non-test authority`);
		if (!nonEmpty(authority.kind))
			issues.push(`${authorityPath}.kind is required`);
		if (!nonEmpty(authority.locator))
			issues.push(`${authorityPath}.locator is required`);
		else if (authority.locator.includes("@cosmo-behavior"))
			issues.push(`${authorityPath}.locator must not cite a behavior marker`);
	}
}

function validateInventoryJudgment(
	input: unknown,
	path: string,
	issues: string[],
	validValue: (value: unknown) => boolean,
	requireConsequence = false,
): void {
	if (!isRecord(input)) {
		issues.push(`${path} must be an object`);
		return;
	}
	if (!validValue(input.value)) {
		if (Array.isArray(input.value) && input.value.length === 0)
			issues.push(`${path}.value must not be empty`);
		else issues.push(`${path}.value is invalid`);
	}
	if (!nonEmpty(input.rationale)) issues.push(`${path}.rationale is required`);
	if (requireConsequence && !nonEmpty(input.consequence))
		issues.push(`${path}.consequence is required`);
	if (input.lane !== "agent-assessed-judgment")
		issues.push(`${path}.lane must be agent-assessed-judgment`);
	if (input.basis !== "reasoned") issues.push(`${path}.basis must be reasoned`);
	if (input.ciEffect !== "evidence-only")
		issues.push(`${path}.ciEffect must be evidence-only`);
	validateInventoryAssessor(input.assessor, `${path}.assessor`, issues);
}

function validateInventoryAssessor(
	input: unknown,
	path: string,
	issues: string[],
): void {
	if (!isRecord(input)) {
		issues.push(`${path} must be an object`);
		return;
	}
	for (const field of ["id", "model", "modelVersion", "assessedAt"])
		if (!nonEmpty(input[field])) issues.push(`${path}.${field} is required`);
	if (input.kind !== "agent") issues.push(`${path}.kind must be agent`);
	const authorities = input.consultedAuthorities;
	if (!Array.isArray(authorities) || authorities.length === 0) {
		issues.push(`${path}.consultedAuthorities must not be empty`);
		return;
	}
	for (const [index, authority] of authorities.entries())
		if (
			!isRecord(authority) ||
			!nonEmpty(authority.path) ||
			isRestrictedAuthorityPath(String(authority.path))
		)
			issues.push(
				`${path}.consultedAuthorities[${index}] must cite non-test authority`,
			);
}

function validateInventoryFreeze(
	input: unknown,
	sourceLog: unknown,
	entries: unknown,
	issues: string[],
): void {
	if (!isRecord(input)) {
		issues.push("freeze must be an object");
		return;
	}
	if (input.algorithm !== "sha256")
		issues.push("freeze.algorithm must be sha256");
	if (input.sourceLogDigest !== digestJson(sourceLog))
		issues.push("freeze.sourceLogDigest does not match sourceLog");
	if (input.inventoryDigest !== digestJson(entries))
		issues.push("freeze.inventoryDigest does not match entries");
	if (!nonEmpty(input.frozenAt)) issues.push("freeze.frozenAt is required");
	if (input.successorEpochRequiredForChanges !== true)
		issues.push("freeze must require a successor epoch for changes");
}

function digestJson(input: unknown): string {
	return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function isRestrictedAuthorityPath(path: string): boolean {
	const normalized = path.replaceAll("\\", "/").toLowerCase();
	return (
		normalized.startsWith("tests/") ||
		normalized.includes("/tests/") ||
		normalized.includes("coverage") ||
		normalized.includes("source-census") ||
		normalized.includes("suite-integrity") ||
		normalized.includes("/raw/")
	);
}

function stringArray(input: unknown): string[] | undefined {
	return Array.isArray(input) && input.every(nonEmpty) ? input : undefined;
}

function checkExactSet(
	input: unknown,
	required: readonly string[],
	path: string,
	issues: string[],
): void {
	const values = stringArray(input);
	if (!values || !sameSet(values, required))
		issues.push(`${path} must contain the restricted evidence set`);
}

function checkContainsSet(
	input: unknown,
	required: readonly string[],
	path: string,
	issues: string[],
): void {
	const values = stringArray(input);
	if (!values || required.some((value) => !values.includes(value)))
		issues.push(`${path} must cover every required authority group`);
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
	return (
		left.length === right.length && left.every((value) => right.includes(value))
	);
}

export function parseCalibrationDocument(document: string): CalibrationRecord {
	const match = document.match(/```json calibration\n([\s\S]*?)\n```/u);
	if (!match?.[1])
		throw new Error("calibration document JSON block is missing");
	const parsed = JSON.parse(match[1]) as unknown;
	if (!isRecord(parsed))
		throw new Error("calibration record must be an object");
	return parsed as unknown as CalibrationRecord;
}

export function validateCalibrationRecord(
	input: CalibrationRecord,
	currentEpochId: string,
): CalibrationValidation {
	const issues: string[] = [];
	const requiredIds = Object.keys(CALIBRATION_CONTROL_OBLIGATIONS);
	if (!isRecord(input))
		return calibrationMiss(["calibration must be an object"]);
	if (input.schemaVersion !== 1) issues.push("schemaVersion must equal 1");
	if (input.epochId !== currentEpochId)
		issues.push(`epochId must match current epoch ${currentEpochId}`);
	if (!SHA256.test(input.methodDigest))
		issues.push("methodDigest must be sha256");
	if (
		!isRecord(input.run) ||
		input.run.scope !== "entire-corpus" ||
		!sameUniqueSet(input.run.controlIds, requiredIds)
	)
		issues.push("run must cover the entire declared calibration corpus");
	if (!Array.isArray(input.controls)) {
		issues.push("controls must be an array");
	} else {
		const actualIds = input.controls.map((control) => control.id);
		if (!sameUniqueSet(actualIds, requiredIds))
			issues.push("controls must contain every declared control exactly once");
		for (const control of input.controls)
			validateCalibrationControl(control, issues);
	}
	validateCalibrationAmendment(input, issues);
	if (issues.length > 0) return calibrationMiss(issues);
	if (input.status !== "pass") issues.push("status must equal pass");
	if (input.profileAcceptance !== "licensed")
		issues.push(
			"profileAcceptance must equal licensed after every control passes",
		);
	return issues.length > 0 ? calibrationMiss(issues) : calibrationPass();
}

function validateCalibrationControl(
	control: CalibrationControl,
	issues: string[],
): void {
	if (!isRecord(control)) {
		issues.push("control must be an object");
		return;
	}
	const declared =
		CALIBRATION_CONTROL_OBLIGATIONS[
			control.id as keyof typeof CALIBRATION_CONTROL_OBLIGATIONS
		];
	if (!declared) {
		issues.push(`controls[${String(control.id)}] is not declared`);
		return;
	}
	const path = `controls[${control.id}]`;
	const expectedPolarity = control.id.startsWith("N-")
		? "negative"
		: control.id.startsWith("X-")
			? "external"
			: "positive";
	if (control.polarity !== expectedPolarity)
		issues.push(`${path}.polarity must equal ${expectedPolarity}`);
	if (!sameJson(control.expected, declared))
		issues.push(
			`${path}.expected must exactly transcribe the declared obligation`,
		);
	if (!sameJson(control.actual, declared))
		issues.push(`${path}.actual must exactly match the declared obligation`);
	if (!Array.isArray(control.sources) || control.sources.length === 0) {
		issues.push(`${path}.sources must name an exact source identity`);
	} else {
		for (const [index, source] of control.sources.entries()) {
			if (
				!isRecord(source) ||
				!nonEmpty(source.path) ||
				!nonEmpty(source.identity)
			)
				issues.push(`${path}.sources[${index}] must name path and identity`);
		}
	}
	validateCalibrationAssessor(control.assessor, path, issues);
	if (control.counterexamples.length > 0)
		issues.push(`${path}.counterexamples records a calibration miss`);
	if (control.result !== "pass") issues.push(`${path}.result must equal pass`);
}

function validateCalibrationAssessor(
	assessor: CalibrationControl["assessor"],
	path: string,
	issues: string[],
): void {
	if (!isRecord(assessor)) {
		issues.push(`${path}.assessor must be an object`);
		return;
	}
	if (assessor.kind !== "agent")
		issues.push(`${path}.assessor.kind must be agent`);
	for (const field of ["id", "model", "modelVersion", "assessedAt"] as const)
		if (!nonEmpty(assessor[field]))
			issues.push(`${path}.assessor.${field} is required`);
	if (
		!Array.isArray(assessor.consultedAuthorities) ||
		assessor.consultedAuthorities.length === 0 ||
		!assessor.consultedAuthorities.every(nonEmpty)
	)
		issues.push(`${path}.assessor.consultedAuthorities must not be empty`);
}

function validateCalibrationAmendment(
	input: CalibrationRecord,
	issues: string[],
): void {
	if (input.amendment === undefined) return;
	const amendment = input.amendment;
	if (amendment.predecessorEpochId === input.epochId)
		issues.push("a method/schema amendment must open a successor epoch");
	if (
		!SHA256.test(amendment.predecessorMethodDigest) ||
		amendment.predecessorMethodDigest === input.methodDigest
	)
		issues.push("a method/schema amendment must change the method digest");
	if (amendment.affectedEvidenceInvalidated !== true)
		issues.push("a method/schema amendment must invalidate affected evidence");
	if (
		!Array.isArray(amendment.preservedMisses) ||
		amendment.preservedMisses.length === 0
	)
		issues.push("a method/schema amendment must preserve the prior miss");
}

function sameUniqueSet(
	left: readonly string[] | undefined,
	right: readonly string[],
): boolean {
	return (
		Array.isArray(left) &&
		new Set(left).size === left.length &&
		sameSet(left, right)
	);
}

function sameJson(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function calibrationPass(): CalibrationValidation {
	return {
		valid: true,
		status: "pass",
		profileAcceptance: "licensed",
		issues: [],
	};
}

function calibrationMiss(issues: readonly string[]): CalibrationValidation {
	return {
		valid: false,
		status: "miss",
		profileAcceptance: "blocked",
		issues,
	};
}

export async function openAuditEpoch(
	root: string,
	input: EpochManifest,
): Promise<void> {
	validateManifest(input);
	await ensureReadableDirectory(root);
	let prior: AuditIndex | undefined;
	try {
		prior = await readAuditIndex(root);
	} catch (error) {
		if (!isMissing(error)) throw error;
	}
	if (prior?.epochIds.includes(input.epochId))
		throw new Error(
			`epoch ${input.epochId} already exists and manifests are immutable`,
		);
	const manifestPath = join(root, "epochs", input.epochId, "manifest.json");
	await mkdir(join(root, "epochs"), { recursive: true });
	await mkdir(dirname(manifestPath), { recursive: false });
	const handle = await open(manifestPath, "wx");
	try {
		await handle.writeFile(`${JSON.stringify(input, null, 2)}\n`);
	} finally {
		await handle.close();
	}
	await writeIndexAtomic(root, {
		currentEpochId: input.epochId,
		epochIds: [...(prior?.epochIds ?? []), input.epochId],
	});
}
export async function readAuditIndex(root: string): Promise<AuditIndex> {
	await ensureReadableDirectory(root);
	const parsed = JSON.parse(
		await readFile(join(root, "index.json"), "utf8"),
	) as unknown;
	return validateIndex(parsed);
}
export async function readCurrentEpochManifest(
	root: string,
): Promise<EpochManifest> {
	const index = await readAuditIndex(root);
	const parsed = JSON.parse(
		await readFile(
			join(root, "epochs", index.currentEpochId, "manifest.json"),
			"utf8",
		),
	) as unknown;
	return validateManifest(parsed);
}
async function writeIndexAtomic(
	root: string,
	index: AuditIndex,
): Promise<void> {
	const temporary = join(root, `.index.json.${randomUUID()}.tmp`);
	try {
		const handle = await open(temporary, "wx");
		try {
			await handle.writeFile(`${JSON.stringify(index, null, 2)}\n`);
			await handle.sync();
		} finally {
			await handle.close();
		}
		await rename(temporary, join(root, "index.json"));
	} catch (error) {
		await unlink(temporary).catch(() => {});
		throw error;
	}
}
async function ensureReadableDirectory(root: string): Promise<void> {
	await access(root, constants.R_OK | constants.W_OK);
}
function validateManifest(input: unknown): EpochManifest {
	if (
		!isRecord(input) ||
		input.schemaVersion !== 1 ||
		!nonEmpty(input.methodVersion) ||
		!nonEmpty(input.epochId) ||
		!SAFE_ID.test(input.epochId) ||
		!nonEmpty(input.evaluatedRevision) ||
		!nonEmpty(input.createdAt) ||
		!SHA256.test(String(input.sourceCensusDigest)) ||
		!Array.isArray(input.materialInputs) ||
		!Array.isArray(input.commandDefinitions)
	)
		throw new Error("invalid epoch manifest");
	for (const item of input.materialInputs)
		if (
			!isRecord(item) ||
			!nonEmpty(item.path) ||
			!SHA256.test(String(item.sha256))
		)
			throw new Error("invalid epoch manifest material input");
	for (const command of input.commandDefinitions)
		if (
			!isRecord(command) ||
			!nonEmpty(command.id) ||
			!SAFE_ID.test(command.id) ||
			!AUDIT_VOCABULARY.testSurfaces.includes(command.surface as TestSurface) ||
			!Array.isArray(command.argv) ||
			command.argv.length === 0 ||
			!command.argv.every(nonEmpty)
		)
			throw new Error("invalid epoch manifest command definition");
	if (
		new Set(
			input.commandDefinitions.map((command) =>
				isRecord(command) ? command.id : undefined,
			),
		).size !== input.commandDefinitions.length
	)
		throw new Error("invalid epoch manifest duplicate command id");
	return input as unknown as EpochManifest;
}
function validateIndex(input: unknown): AuditIndex {
	if (
		!isRecord(input) ||
		!nonEmpty(input.currentEpochId) ||
		!SAFE_ID.test(input.currentEpochId) ||
		!Array.isArray(input.epochIds) ||
		!input.epochIds.every(nonEmpty) ||
		!input.epochIds.every((epochId) => SAFE_ID.test(epochId)) ||
		input.epochIds.at(-1) !== input.currentEpochId ||
		new Set(input.epochIds).size !== input.epochIds.length
	)
		throw new Error("invalid audit index");
	return input as unknown as AuditIndex;
}
function isRecord(input: unknown): input is Record<string, unknown> {
	return typeof input === "object" && input !== null && !Array.isArray(input);
}
function nonEmpty(input: unknown): input is string {
	return typeof input === "string" && input.length > 0;
}
function isMissing(error: unknown): boolean {
	return isRecord(error) && error.code === "ENOENT";
}
