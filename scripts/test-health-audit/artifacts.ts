import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
	access,
	mkdir,
	open,
	readdir,
	readFile,
	rename,
	unlink,
} from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import {
	AUDIT_VOCABULARY,
	type EvidenceDigest,
	type EvidenceRef,
	type TestEvidenceProfile,
	type TestSurface,
	validateTestEvidenceProfile,
} from "./schema.ts";

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

export interface ProfileCensusDeclaration {
	readonly id: string;
	readonly path: string;
	readonly title: string;
	readonly titleTemplate: string;
	readonly ordinal: number;
	readonly line: number;
	readonly endLine: number;
	readonly parameterCount: number | null;
}

export interface ProfileCensusFile {
	readonly path: string;
	readonly fileContextDigest?: string;
	readonly declarations: readonly ProfileCensusDeclaration[];
}

export interface ProfileWorkUnit {
	readonly id: string;
	readonly identities: readonly ProfileCensusDeclaration[];
	readonly relevantSourceLines: number;
	readonly sourceFiles: readonly string[];
	readonly fileContexts: readonly {
		readonly path: string;
		readonly digest: string;
	}[];
}

export interface ProfileWorkQueue {
	readonly schemaVersion: 1;
	readonly epochId: string;
	readonly execution: {
		readonly backend: "driver-process";
		readonly maxConcurrent: 8;
		readonly processIsolation: "one-os-process-per-unit";
		readonly controlsResampledBetweenWaves: true;
	};
	readonly limits: {
		readonly identities: 50;
		readonly relevantSourceLines: 2500;
		readonly sourceFiles: 8;
		readonly indivisibleTestException: true;
	};
	readonly units: readonly ProfileWorkUnit[];
}

export interface PublishedProfileUnit {
	readonly epochId: string;
	readonly unitId: string;
	readonly assessorId: string;
	readonly processId: number;
	readonly processBackend: "driver-process" | "carry-forward";
	readonly measurementSource: "dispatcher" | "carry-forward";
	readonly processStartedAt: string;
	readonly processEndedAt: string;
	readonly durationMs: number;
	readonly peakRssBytes: number;
	readonly profiles: readonly TestEvidenceProfile[];
}

export interface PublishedProfileUnitHalt {
	readonly epochId: string;
	readonly unitId: string;
	readonly assessorId: string;
	readonly processId: number;
	readonly processBackend: "driver-process";
	readonly measurementSource: "dispatcher";
	readonly processStartedAt: string;
	readonly processEndedAt: string;
	readonly durationMs: number;
	readonly peakRssBytes: number;
	readonly halt: {
		readonly kind: "ratified-ground-collision";
		readonly question: string;
		readonly collidingAuthorities: readonly EvidenceRef[];
	};
}

export interface ProfileEpochValidation {
	readonly valid: boolean;
	readonly complete: boolean;
	readonly pendingUnitIds: readonly string[];
	readonly completedUnitIds: readonly string[];
	readonly haltedUnitIds: readonly string[];
	readonly haltedUnits: readonly PublishedProfileUnitHalt[];
	readonly profiles: readonly TestEvidenceProfile[];
	readonly issues: readonly string[];
}

type MaterialInputDescriptor<T = EvidenceDigest> = T extends EvidenceDigest
	? Omit<T, "sha256">
	: never;

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

export interface RemediationLedgerValidationOptions {
	readonly requiredRepairInputIds?: readonly string[];
	readonly requiredWeaknessInputIds?: readonly string[];
	readonly requiredMaterialInputs?: readonly {
		readonly path: string;
		readonly inputKind: string;
		readonly sha256: string;
	}[];
	readonly baselineDocument?: string;
}

export interface RemediationLedgerValidation {
	readonly valid: boolean;
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

export function parseRemediationLedgerDocument(document: string): unknown {
	const match = document.match(/```json remediation-ledger\n([\s\S]*?)\n```/u);
	if (!match?.[1]) throw new Error("remediation ledger JSON block is missing");
	return JSON.parse(match[1]) as unknown;
}

const REMEDIATION_OUTCOMES = [
	"closed",
	"excluded-from-guardrail",
	"unresolved",
] as const;
const REMEDIATION_REPAIR_ACTIONS = [
	"repair-production",
	"repair-test",
	"replace-test",
	"remove-test",
] as const;
const REMEDIATION_INPUT_KINDS = [
	"test",
	"system-under-test",
	"contract",
	"inventory",
	"method",
	"runner",
	"config",
	"setup",
] as const;

/** Validate the executable closure contract recorded by a remediation wave. */
export function validateRemediationLedger(
	input: unknown,
	currentEpochId: string,
	options: RemediationLedgerValidationOptions = {},
): RemediationLedgerValidation {
	const issues: string[] = [];
	if (!isRecord(input))
		return { valid: false, issues: ["remediation ledger must be an object"] };
	if (input.schemaVersion !== 1) issues.push("schemaVersion must equal 1");
	if (input.epochId !== currentEpochId)
		issues.push(`epochId must match current epoch ${currentEpochId}`);
	if (!nonEmpty(input.predecessorEpochId))
		issues.push("predecessorEpochId is required");
	else if (input.predecessorEpochId === currentEpochId)
		issues.push("a remediation wave must open one successor epoch");
	if (!nonEmpty(input.waveId)) issues.push("waveId is required");
	if (input.status !== "complete") issues.push("status must equal complete");

	const rows = Array.isArray(input.rows) ? input.rows : undefined;
	if (!rows || rows.length === 0) {
		issues.push("rows must contain every confirmed weakness");
	} else {
		for (const [index, row] of rows.entries())
			validateRemediationRow(row, index, options.baselineDocument, issues);
	}

	validateRepairInputConsumption(rows ?? [], options, issues);
	validateRemediationSuccessor(
		input.successorEpoch,
		currentEpochId,
		options,
		issues,
	);
	validateRemediationScope(input, rows ?? [], issues);
	return { valid: issues.length === 0, issues };
}

function validateRemediationRow(
	input: unknown,
	index: number,
	baselineDocument: string | undefined,
	issues: string[],
): void {
	const path = `rows[${index}]`;
	if (!isRecord(input)) {
		issues.push(`${path} must be an object`);
		return;
	}
	if (!nonEmpty(input.id)) issues.push(`${path}.id is required`);
	for (const field of [
		"affectedClaims",
		"beforeEvidence",
		"actionEvidence",
		"closureEvidence",
		"profileUpdates",
		"matrixUpdates",
	] as const) {
		if (!Array.isArray(input[field]) || input[field].length === 0)
			issues.push(`${path}.${field} must not be empty`);
	}
	if (!Array.isArray(input.probeReruns) || input.probeReruns.length === 0)
		issues.push(`${path}.probeReruns must not be empty`);
	if (!isRecord(input.scope)) issues.push(`${path}.scope is required`);
	else {
		const sourcePaths = stringArray(input.scope.sourcePaths) ?? [];
		const testPaths = stringArray(input.scope.testPaths) ?? [];
		if (sourcePaths.length + testPaths.length === 0)
			issues.push(`${path}.scope must name a source or test path`);
	}
	const outcome = String(input.outcome);
	if (!REMEDIATION_OUTCOMES.includes(outcome as never))
		issues.push(
			`${path}.outcome must be closed, excluded-from-guardrail, or unresolved`,
		);

	const authority = isRecord(input.authority) ? input.authority : undefined;
	if (!authority) issues.push(`${path}.authority is required`);
	const authorityStatus = String(authority?.status);
	const citations = Array.isArray(authority?.citations)
		? authority.citations
		: [];
	if (!nonEmpty(input.deviationClassification))
		issues.push(`${path}.deviationClassification is required`);
	if (authorityStatus === "ratified") {
		if (citations.length === 0)
			issues.push(`${path}.authority.citations must cite ratified authority`);
	} else if (
		authorityStatus !== "absent" &&
		authorityStatus !== "self-contradicting"
	) {
		issues.push(`${path}.authority.status is invalid`);
	}

	const action = isRecord(input.action) ? input.action : undefined;
	const actionKind = String(action?.kind);
	const changedPaths = stringArray(action?.changedPaths) ?? [];
	if (!action) issues.push(`${path}.action is required`);
	if (outcome === "closed") {
		if (authorityStatus !== "ratified")
			issues.push(
				`${path} cannot close a correction without ratified authority`,
			);
		if (!REMEDIATION_REPAIR_ACTIONS.includes(actionKind as never))
			issues.push(`${path}.action.kind must be an authorized repair action`);
		if (changedPaths.length === 0)
			issues.push(`${path}.action.changedPaths must name the repaired seam`);
		if (!nonEmpty(input.failingProof))
			issues.push(
				`${path}.failingProof is required before an authorized repair`,
			);
		if (
			!Array.isArray(input.correctnessReruns) ||
			input.correctnessReruns.length === 0
		)
			issues.push(`${path}.correctnessReruns must not be empty`);
	} else if (outcome === "excluded-from-guardrail") {
		if (actionKind !== "exclude-guardrail")
			issues.push(`${path}.action.kind must equal exclude-guardrail`);
	} else if (outcome === "unresolved") {
		if (authorityStatus === "ratified")
			issues.push(`${path} cannot be unresolved when authority is ratified`);
		if (actionKind !== "none" || changedPaths.length > 0)
			issues.push(
				`${path} unresolved authority must not change code or expectations`,
			);
		validatePacketQuestion(
			input.packetQuestion,
			path,
			baselineDocument,
			issues,
		);
	}
}

function validatePacketQuestion(
	input: unknown,
	path: string,
	baselineDocument: string | undefined,
	issues: string[],
): void {
	if (!isRecord(input) || !nonEmpty(input.id)) {
		issues.push(`${path}.packetQuestion is required for unresolved authority`);
		return;
	}
	if (!Array.isArray(input.options) || input.options.length < 2)
		issues.push(`${path}.packetQuestion.options must contain drafted options`);
	if (!nonEmpty(input.recommendation))
		issues.push(`${path}.packetQuestion.recommendation is required`);
	if (baselineDocument !== undefined) {
		const packetSections =
			baselineDocument.match(/^## Ratification packet$/gmu) ?? [];
		if (packetSections.length !== 1)
			issues.push(
				"baseline must contain exactly one Ratification packet section",
			);
		if (!baselineDocument.includes(String(input.id)))
			issues.push(`${path}.packetQuestion must be appended to baseline`);
		for (const option of stringArray(input.options) ?? [])
			if (!baselineDocument.includes(option))
				issues.push(
					`${path}.packetQuestion option must be appended to baseline`,
				);
		if (!baselineDocument.includes(String(input.recommendation)))
			issues.push(
				`${path}.packetQuestion recommendation must be appended to baseline`,
			);
	}
}

function validateRepairInputConsumption(
	rows: readonly unknown[],
	options: RemediationLedgerValidationOptions,
	issues: string[],
): void {
	const consumed = rows.flatMap((row) =>
		isRecord(row) ? (stringArray(row.inputIds) ?? []) : [],
	);
	for (const id of options.requiredRepairInputIds ?? []) {
		const count = consumed.filter((candidate) => candidate === id).length;
		if (count !== 1)
			issues.push(`repair-required input ${id} must be consumed exactly once`);
	}
	for (const id of options.requiredWeaknessInputIds ?? []) {
		const count = consumed.filter((candidate) => candidate === id).length;
		if (count !== 1)
			issues.push(`confirmed weakness ${id} must be consumed exactly once`);
	}
}

function validateRemediationSuccessor(
	input: unknown,
	currentEpochId: string,
	options: RemediationLedgerValidationOptions,
	issues: string[],
): void {
	if (!isRecord(input)) {
		issues.push("successorEpoch is required");
		return;
	}
	if (input.epochId !== currentEpochId)
		issues.push("successorEpoch.epochId must match the current epoch");
	if (input.manifestChanged !== true)
		issues.push("successorEpoch must use a new immutable manifest");
	const rehashed = Array.isArray(input.rehashedMaterialInputs)
		? input.rehashedMaterialInputs
		: [];
	for (const expected of options.requiredMaterialInputs ?? []) {
		const matches = rehashed.filter(
			(candidate) =>
				isRecord(candidate) &&
				candidate.path === expected.path &&
				candidate.inputKind === expected.inputKind &&
				candidate.sha256 === expected.sha256,
		);
		if (matches.length !== 1)
			issues.push(
				`material input ${expected.inputKind}:${expected.path} must be rehashed exactly once`,
			);
	}
	const kinds = new Set(
		rehashed.flatMap((candidate) =>
			isRecord(candidate) && nonEmpty(candidate.inputKind)
				? [String(candidate.inputKind)]
				: [],
		),
	);
	for (const kind of REMEDIATION_INPUT_KINDS)
		if (!kinds.has(kind))
			issues.push(`successorEpoch is missing rehashed ${kind} input evidence`);
	const invalidated = stringArray(input.invalidatedProfileIds) ?? [];
	const reassessed = stringArray(input.reassessedProfileIds) ?? [];
	if (!sameSet(invalidated, reassessed))
		issues.push("the union of invalidated profiles must be reassessed");
	const carried = stringArray(input.carriedProfileIds) ?? [];
	if (carried.some((id) => invalidated.includes(id)))
		issues.push("an invalidated profile cannot be carried");
}

function validateRemediationScope(
	ledger: Record<string, unknown>,
	rows: readonly unknown[],
	issues: string[],
): void {
	const authorized = new Set(
		rows.flatMap((row) => {
			if (!isRecord(row) || !isRecord(row.action)) return [];
			return stringArray(row.action.changedPaths) ?? [];
		}),
	);
	for (const path of stringArray(ledger.changedPaths) ?? [])
		if (!authorized.has(path))
			issues.push(`changed path ${path} is outside the ledger-authorized seam`);
	for (const forbidden of [
		"tests/domains/coding-agents.test.ts",
		"AgentDefinition.session",
	])
		if (authorized.has(forbidden))
			issues.push(
				`excluded remediation seam ${forbidden} must remain unmodified`,
			);
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

export function buildProfileWorkQueue(
	epochId: string,
	census: readonly ProfileCensusFile[],
): ProfileWorkQueue {
	if (!nonEmpty(epochId) || !SAFE_ID.test(epochId))
		throw new Error("invalid profile queue epoch id");
	const fileContextDigests = new Map(
		[...census]
			.sort((left, right) => left.path.localeCompare(right.path))
			.map((file) => [
				file.path,
				file.fileContextDigest && SHA256.test(file.fileContextDigest)
					? file.fileContextDigest
					: digestJson({ path: file.path, declarations: file.declarations }),
			]),
	);
	const identities = census
		.flatMap((file) => file.declarations)
		.slice()
		.sort(
			(left, right) =>
				left.path.localeCompare(right.path) ||
				left.line - right.line ||
				left.ordinal - right.ordinal ||
				left.id.localeCompare(right.id),
		);
	if (
		new Set(identities.map((identity) => identity.id)).size !==
		identities.length
	)
		throw new Error("source census contains duplicate profile identities");

	const groups: ProfileCensusDeclaration[][] = [];
	let current: ProfileCensusDeclaration[] = [];
	for (const identity of identities) {
		validateCensusDeclaration(identity);
		const candidate = [...current, identity];
		const lines = relevantLineCount(candidate);
		const files = new Set(candidate.map((item) => item.path)).size;
		if (
			current.length > 0 &&
			(candidate.length > 50 || lines > 2500 || files > 8)
		) {
			groups.push(current);
			current = [identity];
		} else {
			current = candidate;
		}
	}
	if (current.length > 0) groups.push(current);

	const units = groups.map((group, index): ProfileWorkUnit => {
		const sourceFiles = [...new Set(group.map((item) => item.path))].sort();
		return {
			id: `profile-unit-${String(index + 1).padStart(4, "0")}-${digestJson(group.map((item) => item.id)).slice(0, 12)}`,
			identities: group,
			relevantSourceLines: relevantLineCount(group),
			sourceFiles,
			fileContexts: sourceFiles.map((path) => ({
				path,
				digest: fileContextDigests.get(path) ?? digestJson(path),
			})),
		};
	});
	return {
		schemaVersion: 1,
		epochId,
		execution: {
			backend: "driver-process",
			maxConcurrent: 8,
			processIsolation: "one-os-process-per-unit",
			controlsResampledBetweenWaves: true,
		},
		limits: {
			identities: 50,
			relevantSourceLines: 2500,
			sourceFiles: 8,
			indivisibleTestException: true,
		},
		units,
	};
}

export async function prepareProfileWorkQueue(
	root: string,
	census: readonly ProfileCensusFile[],
): Promise<ProfileWorkQueue> {
	const manifest = await readCurrentEpochManifest(root);
	const queue = buildProfileWorkQueue(manifest.epochId, census);
	await writeJsonAtomic(
		join(root, "epochs", manifest.epochId, "work-units.json"),
		queue,
	);
	return queue;
}

export async function readProfileWorkQueue(
	root: string,
): Promise<ProfileWorkQueue> {
	const manifest = await readCurrentEpochManifest(root);
	const path = join(root, "epochs", manifest.epochId, "work-units.json");
	const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
	return validateProfileWorkQueue(parsed, manifest.epochId);
}

export async function publishCarriedProfileUnit(options: {
	readonly root: string;
	readonly projectRoot: string;
	readonly unitId: string;
	readonly assessorId: string;
	readonly processId: number;
	readonly processStartedAt: string;
	readonly processEndedAt: string;
	readonly durationMs: number;
	readonly peakRssBytes: number;
	readonly profiles: readonly TestEvidenceProfile[];
}): Promise<void> {
	await publishUnitShard(options, "carry-forward");
}

export function digestProfileRecord(profile: TestEvidenceProfile): string {
	return digestJson(profile);
}

export async function readEpochProfiles(
	root: string,
	epochId: string,
): Promise<ReadonlyMap<string, TestEvidenceProfile>> {
	const directory = join(root, "epochs", epochId, "profiles");
	const profiles = new Map<string, TestEvidenceProfile>();
	let names: string[] = [];
	try {
		names = await readdir(directory);
	} catch (error) {
		if (isMissing(error)) return profiles;
		throw error;
	}
	for (const name of names.filter((candidate) => candidate.endsWith(".ndjson")))
		for (const line of (await readFile(join(directory, name), "utf8"))
			.split(/\r?\n/)
			.filter(Boolean)
			.slice(1)) {
			const profile = JSON.parse(line) as TestEvidenceProfile;
			profiles.set(profile.id, profile);
		}
	return profiles;
}

export async function publishProfileUnit(options: {
	readonly root: string;
	readonly projectRoot: string;
	readonly unitId: string;
	readonly assessorId: string;
	readonly processId: number;
	readonly processStartedAt: string;
	readonly processEndedAt: string;
	readonly durationMs: number;
	readonly peakRssBytes: number;
	readonly profiles: readonly TestEvidenceProfile[];
}): Promise<void> {
	await publishUnitShard(options, "driver-process");
}

async function publishUnitShard(
	options: {
		readonly root: string;
		readonly projectRoot: string;
		readonly unitId: string;
		readonly assessorId: string;
		readonly processId: number;
		readonly processStartedAt: string;
		readonly processEndedAt: string;
		readonly durationMs: number;
		readonly peakRssBytes: number;
		readonly profiles: readonly TestEvidenceProfile[];
	},
	measurement: "driver-process" | "carry-forward",
): Promise<void> {
	const processBackend = measurement;
	const measurementSource =
		measurement === "carry-forward" ? "carry-forward" : "dispatcher";
	const manifest = await readCurrentEpochManifest(options.root);
	const queue = await readProfileWorkQueue(options.root);
	const unit = queue.units.find((candidate) => candidate.id === options.unitId);
	if (!unit) throw new Error(`unknown profile work unit ${options.unitId}`);
	const issues = await validatePublishedUnit(
		{
			epochId: manifest.epochId,
			unitId: options.unitId,
			assessorId: options.assessorId,
			processId: options.processId,
			processBackend,
			measurementSource,
			processStartedAt: options.processStartedAt,
			processEndedAt: options.processEndedAt,
			durationMs: options.durationMs,
			peakRssBytes: options.peakRssBytes,
			profiles: options.profiles,
		},
		unit,
		queue.units.flatMap((queuedUnit) => queuedUnit.identities),
		manifest,
		options.projectRoot,
		options.root,
	);
	if (issues.length > 0)
		throw new Error(
			`invalid profile unit ${options.unitId}: ${issues.join("; ")}`,
		);
	const directory = join(options.root, "epochs", manifest.epochId, "profiles");
	await mkdir(directory, { recursive: true });
	const path = join(directory, `${options.unitId}.ndjson`);
	const lines = [
		JSON.stringify({
			recordType: "profile-unit",
			schemaVersion: 1,
			epochId: manifest.epochId,
			unitId: options.unitId,
			assessorId: options.assessorId,
			processId: options.processId,
			processBackend,
			measurementSource,
			processStartedAt: options.processStartedAt,
			processEndedAt: options.processEndedAt,
			durationMs: options.durationMs,
			peakRssBytes: options.peakRssBytes,
		}),
		...options.profiles.map((profile) => JSON.stringify(profile)),
	];
	await writeTextAtomic(path, `${lines.join("\n")}\n`);
	await unlink(join(directory, `${options.unitId}.halted.ndjson`)).catch(
		ignoreMissing,
	);
}

export async function publishProfileUnitHalt(options: {
	readonly root: string;
	readonly unitId: string;
	readonly assessorId: string;
	readonly processId: number;
	readonly processStartedAt: string;
	readonly processEndedAt: string;
	readonly durationMs: number;
	readonly peakRssBytes: number;
	readonly halt: PublishedProfileUnitHalt["halt"];
}): Promise<void> {
	const manifest = await readCurrentEpochManifest(options.root);
	const queue = await readProfileWorkQueue(options.root);
	const unit = queue.units.find((candidate) => candidate.id === options.unitId);
	if (!unit) throw new Error(`unknown profile work unit ${options.unitId}`);
	const published: PublishedProfileUnitHalt = {
		epochId: manifest.epochId,
		unitId: options.unitId,
		assessorId: options.assessorId,
		processId: options.processId,
		processBackend: "driver-process",
		measurementSource: "dispatcher",
		processStartedAt: options.processStartedAt,
		processEndedAt: options.processEndedAt,
		durationMs: options.durationMs,
		peakRssBytes: options.peakRssBytes,
		halt: options.halt,
	};
	const issues = validatePublishedUnitHalt(published, unit, manifest);
	if (issues.length > 0)
		throw new Error(
			`invalid profile unit halt ${options.unitId}: ${issues.join("; ")}`,
		);
	const directory = join(options.root, "epochs", manifest.epochId, "profiles");
	await mkdir(directory, { recursive: true });
	await writeTextAtomic(
		join(directory, `${options.unitId}.halted.ndjson`),
		`${JSON.stringify({
			recordType: "profile-unit-halt",
			schemaVersion: 1,
			...published,
		})}\n`,
	);
	await unlink(join(directory, `${options.unitId}.ndjson`)).catch(
		ignoreMissing,
	);
}

export async function validateProfileEpoch(
	root: string,
	projectRoot: string,
): Promise<ProfileEpochValidation> {
	const manifest = await readCurrentEpochManifest(root);
	const queue = await readProfileWorkQueue(root);
	const profileDirectory = join(root, "epochs", manifest.epochId, "profiles");
	let names: string[] = [];
	try {
		names = await readdir(profileDirectory);
	} catch (error) {
		if (!isMissing(error)) throw error;
	}
	const issues: string[] = [];
	const completedUnitIds: string[] = [];
	const haltedUnitIds: string[] = [];
	const haltedUnits: PublishedProfileUnitHalt[] = [];
	const profiles: TestEvidenceProfile[] = [];
	const expectedNames = new Set(
		queue.units.flatMap((unit) => [
			`${unit.id}.ndjson`,
			`${unit.id}.halted.ndjson`,
		]),
	);
	for (const name of names.sort()) {
		if (!name.endsWith(".ndjson")) continue;
		if (!expectedNames.has(name)) {
			issues.push(
				`profiles/${name} does not belong to the current epoch queue`,
			);
			continue;
		}
		const halted = name.endsWith(".halted.ndjson");
		const unitId = name.slice(
			0,
			-(halted ? ".halted.ndjson" : ".ndjson").length,
		);
		const unit = queue.units.find((candidate) => candidate.id === unitId);
		if (!unit) continue;
		try {
			if (halted) {
				const published = await readPublishedUnitHalt(
					join(profileDirectory, name),
					manifest.epochId,
				);
				const unitIssues = validatePublishedUnitHalt(published, unit, manifest);
				if (unitIssues.length > 0) {
					issues.push(...unitIssues.map((issue) => `${unitId}: ${issue}`));
					continue;
				}
				haltedUnitIds.push(unitId);
				haltedUnits.push(published);
				continue;
			}
			const published = await readPublishedUnit(
				join(profileDirectory, name),
				manifest.epochId,
			);
			const unitIssues = await validatePublishedUnit(
				published,
				unit,
				queue.units.flatMap((queuedUnit) => queuedUnit.identities),
				manifest,
				projectRoot,
				root,
			);
			if (unitIssues.length > 0) {
				issues.push(...unitIssues.map((issue) => `${unitId}: ${issue}`));
				continue;
			}
			completedUnitIds.push(unitId);
			profiles.push(...published.profiles);
		} catch (error) {
			issues.push(
				`${unitId}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
	const duplicateTerminalIds = completedUnitIds.filter((unitId) =>
		haltedUnitIds.includes(unitId),
	);
	for (const unitId of duplicateTerminalIds)
		issues.push(`${unitId}: unit has both a profile shard and a halt shard`);
	const completedOnly = completedUnitIds.filter(
		(unitId) => !duplicateTerminalIds.includes(unitId),
	);
	const haltedOnly = haltedUnitIds.filter(
		(unitId) => !duplicateTerminalIds.includes(unitId),
	);
	const completed = new Set(completedOnly);
	const halted = new Set(haltedOnly);
	const pendingUnitIds = queue.units
		.map((unit) => unit.id)
		.filter((unitId) => !completed.has(unitId) && !halted.has(unitId));
	const expectedIdentities = queue.units.flatMap((unit) =>
		unit.identities.map((identity) => identity.id),
	);
	const actualIdentities = profiles.map((profile) => profile.id);
	if (
		pendingUnitIds.length === 0 &&
		haltedOnly.length === 0 &&
		(JSON.stringify(expectedIdentities.slice().sort()) !==
			JSON.stringify(actualIdentities.slice().sort()) ||
			new Set(actualIdentities).size !== actualIdentities.length)
	)
		issues.push(
			"current epoch must contain exactly one profile per auditable identity",
		);
	issues.push(...(await validateEpochProvenance(root, manifest)));
	return {
		valid: issues.length === 0,
		complete:
			pendingUnitIds.length === 0 &&
			haltedOnly.length === 0 &&
			issues.length === 0,
		pendingUnitIds,
		completedUnitIds: completedOnly,
		haltedUnitIds: haltedOnly,
		haltedUnits: haltedUnits.filter(
			(unit) => !duplicateTerminalIds.includes(unit.unitId),
		),
		profiles: profiles.filter(
			(profile) => !duplicateTerminalIds.includes(profile.source.workUnitId),
		),
		issues,
	};
}

export async function digestMaterialInput(
	projectRoot: string,
	input: MaterialInputDescriptor,
): Promise<string> {
	const path = safeProjectPath(projectRoot, input.path);
	const content = await readFile(path, "utf8");
	if (input.scope === "file")
		return createHash("sha256").update(content).digest("hex");
	const lines = content.split(/\r?\n/);
	const span = input.span;
	if (!span)
		throw new Error(`declaration-span input is missing a span: ${input.path}`);
	return createHash("sha256")
		.update(lines.slice(span.startLine - 1, span.endLine).join("\n"))
		.digest("hex");
}

function validateCensusDeclaration(identity: ProfileCensusDeclaration): void {
	if (
		!nonEmpty(identity.id) ||
		!nonEmpty(identity.path) ||
		!nonEmpty(identity.title) ||
		!nonEmpty(identity.titleTemplate) ||
		!Number.isInteger(identity.ordinal) ||
		identity.ordinal < 1 ||
		!Number.isInteger(identity.line) ||
		identity.line < 1 ||
		!Number.isInteger(identity.endLine) ||
		identity.endLine < identity.line ||
		(identity.parameterCount !== null &&
			(!Number.isInteger(identity.parameterCount) ||
				identity.parameterCount < 1))
	)
		throw new Error(`invalid source census declaration ${String(identity.id)}`);
}

function relevantLineCount(
	identities: readonly ProfileCensusDeclaration[],
): number {
	return identities.reduce(
		(total, identity) => total + identity.endLine - identity.line + 1,
		0,
	);
}

function validateProfileWorkQueue(
	input: unknown,
	epochId: string,
): ProfileWorkQueue {
	if (
		!isRecord(input) ||
		input.schemaVersion !== 1 ||
		input.epochId !== epochId
	)
		throw new Error("invalid or stale profile work queue");
	const execution = input.execution;
	const limits = input.limits;
	if (
		!isRecord(execution) ||
		execution.backend !== "driver-process" ||
		execution.maxConcurrent !== 8 ||
		execution.processIsolation !== "one-os-process-per-unit" ||
		execution.controlsResampledBetweenWaves !== true ||
		!isRecord(limits) ||
		limits.identities !== 50 ||
		limits.relevantSourceLines !== 2500 ||
		limits.sourceFiles !== 8 ||
		limits.indivisibleTestException !== true ||
		!Array.isArray(input.units)
	)
		throw new Error("invalid profile work queue contract");
	for (const unit of input.units) {
		if (
			!isRecord(unit) ||
			!nonEmpty(unit.id) ||
			!Array.isArray(unit.identities)
		)
			throw new Error("invalid profile work unit");
		const identities = unit.identities as unknown as ProfileCensusDeclaration[];
		identities.forEach(validateCensusDeclaration);
		const files = new Set(identities.map((identity) => identity.path));
		const sortedFiles = [...files].sort();
		const lines = relevantLineCount(identities);
		if (
			identities.length === 0 ||
			identities.length > 50 ||
			files.size > 8 ||
			(lines > 2500 && identities.length !== 1) ||
			unit.relevantSourceLines !== lines ||
			!Array.isArray(unit.sourceFiles) ||
			!Array.isArray(unit.fileContexts)
		)
			throw new Error(
				`profile work unit ${unit.id} exceeds or misstates its bounds`,
			);
		if (
			JSON.stringify(unit.sourceFiles) !== JSON.stringify(sortedFiles) ||
			unit.fileContexts.length !== sortedFiles.length ||
			!unit.fileContexts.every(
				(context, index) =>
					isRecord(context) &&
					context.path === sortedFiles[index] &&
					SHA256.test(String(context.digest)),
			)
		)
			throw new Error(`profile work unit ${unit.id} has invalid file context`);
	}
	const allIdentities = input.units.flatMap((unit) =>
		isRecord(unit) && Array.isArray(unit.identities)
			? unit.identities.map((identity) =>
					isRecord(identity) ? identity.id : undefined,
				)
			: [],
	);
	if (new Set(allIdentities).size !== allIdentities.length)
		throw new Error("profile work queue assigns an identity more than once");
	return input as unknown as ProfileWorkQueue;
}

async function readPublishedUnit(
	path: string,
	epochId: string,
): Promise<PublishedProfileUnit> {
	const records = (await readFile(path, "utf8"))
		.split(/\r?\n/)
		.filter((line) => line.length > 0)
		.map((line) => JSON.parse(line) as unknown);
	const header = records.shift();
	if (
		!isRecord(header) ||
		header.recordType !== "profile-unit" ||
		header.schemaVersion !== 1 ||
		header.epochId !== epochId ||
		!nonEmpty(header.unitId)
	)
		throw new Error("missing or malformed profile unit header");
	return {
		epochId,
		unitId: header.unitId,
		assessorId: String(header.assessorId ?? ""),
		processId: Number(header.processId),
		processBackend: String(
			header.processBackend,
		) as PublishedProfileUnit["processBackend"],
		measurementSource: String(
			header.measurementSource,
		) as PublishedProfileUnit["measurementSource"],
		processStartedAt: String(header.processStartedAt ?? ""),
		processEndedAt: String(header.processEndedAt ?? ""),
		durationMs: Number(header.durationMs),
		peakRssBytes: Number(header.peakRssBytes),
		profiles: records as TestEvidenceProfile[],
	};
}

async function readPublishedUnitHalt(
	path: string,
	epochId: string,
): Promise<PublishedProfileUnitHalt> {
	const records = (await readFile(path, "utf8"))
		.split(/\r?\n/)
		.filter((line) => line.length > 0)
		.map((line) => JSON.parse(line) as unknown);
	if (records.length !== 1 || !isRecord(records[0]))
		throw new Error("profile unit halt must contain exactly one record");
	const header = records[0];
	if (
		header.recordType !== "profile-unit-halt" ||
		header.schemaVersion !== 1 ||
		header.epochId !== epochId ||
		!nonEmpty(header.unitId)
	)
		throw new Error("missing or malformed profile unit halt header");
	return {
		epochId,
		unitId: header.unitId,
		assessorId: String(header.assessorId ?? ""),
		processId: Number(header.processId),
		processBackend: String(header.processBackend) as "driver-process",
		measurementSource: String(header.measurementSource) as "dispatcher",
		processStartedAt: String(header.processStartedAt ?? ""),
		processEndedAt: String(header.processEndedAt ?? ""),
		durationMs: Number(header.durationMs),
		peakRssBytes: Number(header.peakRssBytes),
		halt: header.halt as PublishedProfileUnitHalt["halt"],
	};
}

function validatePublishedUnitHalt(
	published: PublishedProfileUnitHalt,
	unit: ProfileWorkUnit,
	manifest: EpochManifest,
): string[] {
	const issues: string[] = [];
	if (published.epochId !== manifest.epochId)
		issues.push("unit epoch is stale");
	if (published.unitId !== unit.id)
		issues.push("unit id does not match shard path");
	if (!nonEmpty(published.assessorId)) issues.push("assessorId is required");
	if (!Number.isSafeInteger(published.processId) || published.processId < 1)
		issues.push("processId must identify the unit OS process");
	if (published.processBackend !== "driver-process")
		issues.push("processBackend must be driver-process");
	if (published.measurementSource !== "dispatcher")
		issues.push("measurementSource must be dispatcher");
	const processStartedAt = Date.parse(published.processStartedAt);
	const processEndedAt = Date.parse(published.processEndedAt);
	if (
		!Number.isFinite(processStartedAt) ||
		!Number.isFinite(processEndedAt) ||
		processEndedAt < processStartedAt ||
		published.durationMs !== processEndedAt - processStartedAt
	)
		issues.push(
			"durationMs must equal the dispatcher-observed process lifetime",
		);
	if (!Number.isFinite(published.durationMs) || published.durationMs < 0)
		issues.push("durationMs must be a non-negative wall-clock duration");
	if (
		!Number.isSafeInteger(published.peakRssBytes) ||
		published.peakRssBytes < 1
	)
		issues.push("peakRssBytes must be a positive integer");
	if (
		!isRecord(published.halt) ||
		published.halt.kind !== "ratified-ground-collision" ||
		!nonEmpty(published.halt.question) ||
		!Array.isArray(published.halt.collidingAuthorities) ||
		published.halt.collidingAuthorities.length < 2
	) {
		issues.push(
			"halt must record a drafted question and at least two colliding ratified authorities",
		);
		return issues;
	}
	for (const authority of published.halt.collidingAuthorities)
		if (
			!isRecord(authority) ||
			authority.kind !== "authority-document" ||
			!nonEmpty(authority.path) ||
			(!nonEmpty(authority.locator) && !nonEmpty(authority.quote))
		)
			issues.push(
				"each colliding authority must cite an authority-document path and locator or quote",
			);
	return issues;
}

async function validatePublishedUnit(
	published: PublishedProfileUnit,
	unit: ProfileWorkUnit,
	allIdentities: readonly ProfileCensusDeclaration[],
	manifest: EpochManifest,
	projectRoot: string,
	auditRoot: string,
): Promise<string[]> {
	const issues: string[] = [];
	if (published.epochId !== manifest.epochId)
		issues.push("unit epoch is stale");
	if (published.unitId !== unit.id)
		issues.push("unit id does not match shard path");
	if (!nonEmpty(published.assessorId)) issues.push("assessorId is required");
	if (!Number.isSafeInteger(published.processId) || published.processId < 1)
		issues.push("processId must identify the unit OS process");
	// A carried unit is measured by the carry process that wrote it, not by a
	// dispatcher. Saying so keeps the header truthful; the exemption is earned
	// only when every profile in the unit names the epoch it came from.
	const carriedUnit =
		published.profiles.length > 0 &&
		published.profiles.every((profile) => profile.carriedFrom !== undefined);
	const expectedBackend = carriedUnit ? "carry-forward" : "driver-process";
	const expectedSource = carriedUnit ? "carry-forward" : "dispatcher";
	if (published.processBackend !== expectedBackend)
		issues.push(`processBackend must be ${expectedBackend}`);
	if (published.measurementSource !== expectedSource)
		issues.push(`measurementSource must be ${expectedSource}`);
	const processStartedAt = Date.parse(published.processStartedAt);
	const processEndedAt = Date.parse(published.processEndedAt);
	if (
		!Number.isFinite(processStartedAt) ||
		!Number.isFinite(processEndedAt) ||
		processEndedAt < processStartedAt ||
		published.durationMs !== processEndedAt - processStartedAt
	)
		issues.push(
			"durationMs must equal the dispatcher-observed process lifetime",
		);
	if (!Number.isFinite(published.durationMs) || published.durationMs < 0)
		issues.push("durationMs must be a non-negative wall-clock duration");
	if (
		!Number.isSafeInteger(published.peakRssBytes) ||
		published.peakRssBytes < 1
	)
		issues.push("peakRssBytes must be a positive integer");
	const expected = new Map(
		unit.identities.map((identity) => [identity.id, identity]),
	);
	if (
		published.profiles.length !== expected.size ||
		new Set(published.profiles.map((profile) => profile.id)).size !==
			published.profiles.length
	)
		issues.push("unit must contain each assigned identity exactly once");
	for (const profile of published.profiles) {
		const schema = validateTestEvidenceProfile(profile);
		issues.push(...schema.issues.map((issue) => `${profile.id}: ${issue}`));
		const identity = expected.get(profile.id);
		if (!identity) {
			issues.push(`${profile.id}: identity is not assigned to unit`);
			continue;
		}
		if (
			profile.source.workUnitId !== unit.id ||
			profile.source.path !== identity.path ||
			profile.source.line !== identity.line ||
			profile.source.title !== identity.title ||
			profile.source.ordinal !== identity.ordinal
		)
			issues.push(`${profile.id}: source identity does not match the queue`);
		if (
			identity.parameterCount !== null &&
			profile.runtime.value.caseCount > identity.parameterCount
		)
			issues.push(
				`${profile.id}: runtime caseCount ${profile.runtime.value.caseCount} exceeds source parameterCount ${identity.parameterCount}`,
			);
		const literalSiblingTitles = allIdentities
			.filter(
				(sibling) =>
					sibling.id !== identity.id &&
					sibling.path === identity.path &&
					sibling.parameterCount === 1 &&
					!isParameterizedTitle(sibling.titleTemplate),
			)
			.map((sibling) => sibling.title);
		for (const caseName of profile.runtime.value.caseNames)
			if (literalSiblingTitles.includes(caseName))
				issues.push(
					`${profile.id}: runtime case ${JSON.stringify(caseName)} belongs to another literal-titled declaration`,
				);
		for (const assessedValue of agentAssessedValues(profile))
			if (
				assessedValue.assessor.kind !== "agent" ||
				(assessedValue.assessor.id !== published.assessorId &&
					!isValidatedProbeOverride(assessedValue))
			)
				issues.push(
					`${profile.id}: every agent-assessed field must be owned by unit assessor ${published.assessorId}`,
				);
		const declarationInputs = profile.materialInputs.filter(
			(input) => input.inputKind === "test-declaration",
		);
		const declarationInput = declarationInputs[0];
		if (
			declarationInputs.length !== 1 ||
			!declarationInput ||
			declarationInput.path !== identity.path ||
			declarationInput.scope !== "declaration-span" ||
			declarationInput.span.startLine !== identity.line ||
			declarationInput.span.endLine !== identity.endLine
		)
			issues.push(
				`${profile.id}: missing current test-declaration input proof`,
			);
		for (const sut of profile.chain.value.systemsUnderTest) {
			const expectedScope =
				sut.sutKind === "production-function" ? "declaration-span" : "file";
			if (
				!profile.materialInputs.some(
					(input) =>
						input.inputKind === "system-under-test" &&
						input.sutKind === sut.sutKind &&
						input.path === sut.path &&
						input.scope === expectedScope,
				)
			)
				issues.push(
					`${profile.id}: missing ${expectedScope} input proof for ${sut.sutKind} ${sut.path}`,
				);
		}
		for (const authority of profile.claim.value.authority)
			if (
				!profile.materialInputs.some(
					(input) =>
						input.inputKind === "contract" &&
						input.path === authority.path &&
						input.scope === "file",
				)
			)
				issues.push(
					`${profile.id}: missing whole-file contract input proof for ${authority.path}`,
				);
		for (const input of profile.materialInputs) {
			try {
				const current = await digestMaterialInput(projectRoot, input);
				if (current !== input.sha256)
					issues.push(`${profile.id}: stale material input ${input.path}`);
			} catch (error) {
				issues.push(
					`${profile.id}: cannot rehash material input ${input.path}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
		if (profile.carriedFrom) {
			for (const kind of [
				"test-declaration",
				"method",
				"schema",
				"inventory-row",
				"runner",
				"config",
				"setup",
				"command",
			] as const)
				if (!profile.materialInputs.some((input) => input.inputKind === kind))
					issues.push(
						`${profile.id}: carried profile omits ${kind} input proof`,
					);
			if (profile.carriedFrom.epochId === manifest.epochId)
				issues.push(`${profile.id}: carriedFrom must name a predecessor epoch`);
			if (!SHA256.test(profile.carriedFrom.profileDigest))
				issues.push(`${profile.id}: carriedFrom.profileDigest is invalid`);
			else {
				const predecessor = await findProfileInEpoch(
					auditRoot,
					profile.carriedFrom.epochId,
					profile.id,
				);
				if (!predecessor)
					issues.push(`${profile.id}: carried predecessor profile is missing`);
				else if (digestJson(predecessor) !== profile.carriedFrom.profileDigest)
					issues.push(
						`${profile.id}: carried predecessor profile digest does not match`,
					);
			}
			const observedAt =
				profile.runtime.assessor.kind === "collector"
					? profile.runtime.assessor.observedAt
					: undefined;
			if (
				typeof observedAt !== "string" ||
				Date.parse(observedAt) < Date.parse(manifest.createdAt)
			)
				issues.push(`${profile.id}: carried profile runtime was not refreshed`);
		}
	}
	return issues;
}

function isValidatedProbeOverride(
	assessedValue: ReturnType<typeof agentAssessedValues>[number],
): boolean {
	return (
		assessedValue.assessor.kind === "agent" &&
		assessedValue.evidence.some(
			(evidence) => evidence.kind === "probe-record",
		) &&
		assessedValue.overrides.some(
			(override) => override.assessor === assessedValue.assessor.id,
		)
	);
}

function isParameterizedTitle(title: string): boolean {
	return /%[sdifjo#%]|\$\w+/.test(title);
}

function agentAssessedValues(profile: TestEvidenceProfile) {
	return [
		profile.role,
		profile.claim,
		profile.chain,
		profile.dimensions.execution,
		profile.dimensions.grounding,
		profile.dimensions.contractAlignment,
		profile.dimensions.faultSensitivity,
		profile.dimensions.realism,
		profile.dimensions.determinism,
		profile.dimensions.engineeringQuality,
		profile.reasonCodes,
		profile.portfolioContributions,
		profile.disposition,
	];
}

interface EpochExecutionSnapshot {
	readonly units: ReadonlyMap<string, string>;
	readonly profiles: ReadonlyMap<
		string,
		{ readonly digest: string; readonly carried: boolean }
	>;
	readonly commandOutputs: ReadonlyMap<string, string>;
}

/**
 * Collapses the fields a forged epoch can cheaply restamp — `assessedAt` and
 * every embedded reference to the epoch's own id — so that a profile carried
 * over from a predecessor digests identically to its source.
 */
function executionLineageDigest(profile: unknown, epochId: string): string {
	const scrub = (node: unknown): unknown => {
		if (Array.isArray(node)) return node.map(scrub);
		if (node !== null && typeof node === "object") {
			const record = node as Record<string, unknown>;
			// An epoch's own manifest and raw outputs are cited as material inputs,
			// and their digests differ per epoch by construction. Dropping them lets
			// a carried judgment match the predecessor it was copied from.
			const epochScoped =
				typeof record.path === "string" &&
				record.path.replaceAll("\\", "/").includes("/audit/epochs/");
			const out: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(record)) {
				if (key === "assessedAt" || key === "carriedFrom") continue;
				if (epochScoped && key === "sha256") continue;
				out[key] = scrub(value);
			}
			return out;
		}
		if (typeof node === "string") return node.split(epochId).join("<epoch>");
		return node;
	};
	return digestJson(scrub(profile));
}

async function readEpochExecutionSnapshot(
	root: string,
	epochId: string,
	commandIds: readonly string[],
	// Only records a predecessor also holds can be copies, so digesting anything
	// else is wasted work on every checkpoint.
	candidates?: {
		readonly unitIds: ReadonlySet<string>;
		readonly profileIds: ReadonlySet<string>;
	},
): Promise<EpochExecutionSnapshot> {
	const units = new Map<string, string>();
	const profiles = new Map<string, { digest: string; carried: boolean }>();
	const commandOutputs = new Map<string, string>();
	const profileDirectory = join(root, "epochs", epochId, "profiles");
	let names: string[] = [];
	try {
		names = await readdir(profileDirectory);
	} catch (error) {
		if (!isMissing(error)) throw error;
	}
	for (const name of names.filter((candidate) =>
		candidate.endsWith(".ndjson"),
	)) {
		const lines = (await readFile(join(profileDirectory, name), "utf8"))
			.split(/\r?\n/)
			.filter(Boolean);
		const [headerLine] = lines;
		if (headerLine === undefined) continue;
		// A malformed shard is reported by the caller's own parse; provenance
		// simply has nothing to compare and must not mask that diagnosis.
		let parsed: readonly unknown[];
		try {
			parsed = lines.map((line) => JSON.parse(line) as unknown);
		} catch {
			continue;
		}
		const header = parsed[0] as {
			unitId?: string;
			processId?: number;
			processStartedAt?: string;
			processEndedAt?: string;
			peakRssBytes?: number;
		};
		if (
			typeof header.unitId === "string" &&
			(candidates?.unitIds.has(header.unitId) ?? true)
		)
			units.set(
				header.unitId,
				digestJson([
					header.processId,
					header.processStartedAt,
					header.processEndedAt,
					header.peakRssBytes,
				]),
			);
		for (const entry of parsed.slice(1)) {
			const profile = entry as {
				id?: string;
				carriedFrom?: unknown;
			};
			if (
				typeof profile.id === "string" &&
				(candidates?.profileIds.has(profile.id) ?? true)
			)
				profiles.set(profile.id, {
					digest: executionLineageDigest(profile, epochId),
					carried: profile.carriedFrom !== undefined,
				});
		}
	}
	const rawDirectory = join(root, "epochs", epochId, "raw");
	for (const commandId of commandIds)
		for (const suffix of [".json", ".reporter.json"]) {
			const file = `${commandId}${suffix}`;
			try {
				commandOutputs.set(
					file,
					createHash("sha256")
						.update(await readFile(join(rawDirectory, file)))
						.digest("hex"),
				);
			} catch (error) {
				if (!isMissing(error)) throw error;
			}
		}
	return { units, profiles, commandOutputs };
}

/**
 * Proves the current epoch actually executed rather than restamping a
 * predecessor. Every rule below is a physical impossibility for two distinct
 * executions, so a violation is falsified provenance rather than drift.
 */
export async function validateEpochProvenance(
	root: string,
	manifest: EpochManifest,
): Promise<string[]> {
	const index = await readAuditIndex(root);
	const position = index.epochIds.indexOf(manifest.epochId);
	const predecessors = index.epochIds.slice(
		0,
		position < 0 ? index.epochIds.length : position,
	);
	if (predecessors.length === 0) return [];
	const commandIds = manifest.commandDefinitions.map(
		(definition) => definition.id,
	);
	const priorSnapshots: [string, EpochExecutionSnapshot][] = [];
	for (const predecessorId of predecessors) {
		const prior = await readEpochExecutionSnapshot(
			root,
			predecessorId,
			commandIds,
		);
		if (
			prior.units.size > 0 ||
			prior.profiles.size > 0 ||
			prior.commandOutputs.size > 0
		)
			priorSnapshots.push([predecessorId, prior]);
	}
	// Nothing to have copied from, so the current epoch need not be digested.
	if (priorSnapshots.length === 0) return [];
	const current = await readEpochExecutionSnapshot(
		root,
		manifest.epochId,
		commandIds,
		{
			unitIds: new Set(
				priorSnapshots.flatMap(([, prior]) => [...prior.units.keys()]),
			),
			profileIds: new Set(
				priorSnapshots.flatMap(([, prior]) => [...prior.profiles.keys()]),
			),
		},
	);
	const issues: string[] = [];
	for (const [predecessorId, prior] of priorSnapshots) {
		for (const [unitId, digest] of current.units)
			if (prior.units.get(unitId) === digest)
				issues.push(
					`${unitId}: unit reuses the process identity and memory ceiling recorded in ${predecessorId}, which one execution cannot share with another`,
				);
		for (const [profileId, entry] of current.profiles) {
			if (entry.carried) continue;
			if (prior.profiles.get(profileId)?.digest === entry.digest)
				issues.push(
					`${profileId}: profile is identical to ${predecessorId} but does not declare carriedFrom`,
				);
		}
		for (const [file, digest] of current.commandOutputs)
			if (prior.commandOutputs.get(file) === digest)
				issues.push(
					`raw/${file} is byte-identical to ${predecessorId}, so the suite was not re-executed for this epoch`,
				);
	}
	return issues;
}

async function findProfileInEpoch(
	root: string,
	epochId: string,
	profileId: string,
): Promise<TestEvidenceProfile | undefined> {
	const index = await readAuditIndex(root);
	if (!index.epochIds.includes(epochId)) return undefined;
	const directory = join(root, "epochs", epochId, "profiles");
	let names: string[];
	try {
		names = await readdir(directory);
	} catch (error) {
		if (isMissing(error)) return undefined;
		throw error;
	}
	for (const name of names.filter((candidate) =>
		candidate.endsWith(".ndjson"),
	)) {
		const lines = (await readFile(join(directory, name), "utf8"))
			.split(/\r?\n/)
			.filter(Boolean)
			.slice(1);
		for (const line of lines) {
			const profile = JSON.parse(line) as TestEvidenceProfile;
			if (profile.id === profileId) return profile;
		}
	}
	return undefined;
}

function safeProjectPath(projectRoot: string, path: string): string {
	const absoluteRoot = resolve(projectRoot);
	const absolutePath = resolve(absoluteRoot, path);
	if (
		absolutePath !== absoluteRoot &&
		!absolutePath.startsWith(`${absoluteRoot}${sep}`)
	)
		throw new Error(`material input escapes project root: ${path}`);
	return absolutePath;
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
	await writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function writeTextAtomic(
	path: string,
	value: string,
): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temporary = join(
		dirname(path),
		`.${randomUUID()}.${path.split(sep).at(-1)}.tmp`,
	);
	try {
		const handle = await open(temporary, "wx");
		try {
			await handle.writeFile(value);
			await handle.sync();
		} finally {
			await handle.close();
		}
		await rename(temporary, path);
	} catch (error) {
		await unlink(temporary).catch(() => {});
		throw error;
	}
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

function ignoreMissing(error: unknown): void {
	if (!isMissing(error)) throw error;
}

/**
 * The spec's ten deliverable bundles (`plan.md` §7). A candidate epoch holds
 * every one of them, and bundles 1-9 are what the canonical digest covers —
 * `baseline.md` is excluded because it carries the owner block the digest must
 * not become self-referential over.
 */
export const CANDIDATE_BUNDLES = [
	{ id: 1, name: "method", files: [] },
	{
		id: 2,
		name: "suite-integrity",
		files: ["suite-integrity.json", "suite-integrity.md"],
	},
	{ id: 3, name: "profiles", files: ["profiles/index.json"] },
	{
		id: 4,
		name: "portfolio",
		files: ["behavior-risk-matrix.md", "gap-register.md"],
	},
	{ id: 5, name: "calibration", files: ["calibration.md"] },
	{ id: 6, name: "probes", files: ["probes.jsonl", "probes.md"] },
	{ id: 7, name: "remediation", files: ["remediation-ledger.md"] },
	{ id: 8, name: "residual-uncertainty", files: ["residual-uncertainty.md"] },
	{ id: 9, name: "gate-recommendations", files: ["gate-recommendations.md"] },
	{ id: 10, name: "baseline", files: ["baseline.md"] },
] as const;

export interface CandidateBundleInput {
	readonly epochId: string;
	/** Epoch-relative paths present on disk. */
	readonly files: readonly string[];
	/** Bundle 1 lives outside the epoch, so it is referenced by digest. */
	readonly method?: { readonly path: string; readonly sha256: string };
	/** Bundle 3 is only real when the index names at least one unit shard. */
	readonly profileUnitFiles: readonly string[];
}

export interface CandidateBundleValidation {
	readonly valid: boolean;
	readonly issues: readonly string[];
	readonly missingBundleIds: readonly number[];
}

/** Checks that one epoch holds all ten bundles rather than a partial set. */
export function validateCandidateBundles(
	input: CandidateBundleInput,
): CandidateBundleValidation {
	const issues: string[] = [];
	const present = new Set(input.files);
	const missing: number[] = [];

	if (!input.method || !SHA256.test(input.method.sha256 ?? "")) {
		issues.push("bundle 1 must reference the method document by sha256");
		missing.push(1);
	} else if (input.method.path !== METHOD_DOCUMENT_PATH)
		issues.push(
			`bundle 1 must reference ${METHOD_DOCUMENT_PATH}, not ${input.method.path}`,
		);

	for (const bundle of CANDIDATE_BUNDLES) {
		if (bundle.files.length === 0) continue;
		const absent = bundle.files.filter((file) => !present.has(file));
		if (absent.length === 0) continue;
		missing.push(bundle.id);
		for (const file of absent)
			issues.push(`bundle ${bundle.id} (${bundle.name}) is missing ${file}`);
	}

	if (input.profileUnitFiles.length === 0) {
		issues.push("bundle 3 must contain at least one profile unit shard");
		if (!missing.includes(3)) missing.push(3);
	}
	for (const file of input.profileUnitFiles)
		if (!present.has(file))
			issues.push(`bundle 3 names a missing profile shard ${file}`);

	return {
		valid: issues.length === 0,
		issues,
		missingBundleIds: [...missing].sort((left, right) => left - right),
	};
}

export const METHOD_DOCUMENT_PATH = "docs/test-health-audit.md";

export interface CanonicalCandidateDigestInput {
	readonly evaluatedRevision: string;
	readonly materialInputs: readonly {
		readonly path: string;
		readonly inputKind: string;
		readonly sha256: string;
	}[];
	/** Bundles 1-9 only; `baseline.md` is deliberately absent. */
	readonly bundleDigests: readonly {
		readonly bundleId: number;
		readonly file: string;
		readonly sha256: string;
	}[];
	readonly baselineConditions: readonly {
		readonly id: number;
		readonly status: string;
	}[];
}

/**
 * The digest the owner ratifies. It covers the evaluated revision, every
 * material input digest, bundles 1-9 and the canonical condition rows, and
 * nothing else — render timestamps, `index.json`'s current pointer and the
 * owner block that arrives in a later commit are all excluded, which is what
 * lets the same evidence recompute to the same value after ratification.
 */
export function canonicalCandidateDigest(
	input: CanonicalCandidateDigestInput,
): string {
	const forbidden = input.bundleDigests.filter(
		(entry) => entry.bundleId === 10,
	);
	if (forbidden.length > 0)
		throw new Error(
			"the canonical digest must exclude bundle 10 (baseline.md)",
		);
	return digestJson({
		evaluatedRevision: input.evaluatedRevision,
		materialInputs: [...input.materialInputs]
			.map((entry) => ({
				path: entry.path,
				inputKind: entry.inputKind,
				sha256: entry.sha256,
			}))
			.sort((left, right) =>
				`${left.inputKind}:${left.path}`.localeCompare(
					`${right.inputKind}:${right.path}`,
				),
			),
		bundleDigests: [...input.bundleDigests]
			.map((entry) => ({
				bundleId: entry.bundleId,
				file: entry.file,
				sha256: entry.sha256,
			}))
			.sort((left, right) => left.file.localeCompare(right.file)),
		baselineConditions: [...input.baselineConditions]
			.map((row) => ({ id: row.id, status: row.status }))
			.sort((left, right) => left.id - right.id),
	});
}

const GATE_RECOMMENDATION_LABELS = [
	"objective-candidate",
	"agent-assessed-heuristic",
] as const;

const REQUIRED_ROADMAP_CROSS_LINKS = [
	"behavioral-regression",
	"deliverable-completeness-gates",
] as const;

/**
 * Scope this plan may not expand into. A recommendation naming one of these is
 * the plan growing a second subject, which `spec.md` Out of scope forbids.
 */
const EXCLUDED_RECOMMENDATION_SUBJECTS = [
	"project-health-audit",
	"analysis-provider-expansion",
	"coverage-threshold",
] as const;

export function parseGateRecommendationsDocument(document: string): unknown {
	const match = document.match(
		/```json gate-recommendations\n([\s\S]*?)\n```/u,
	);
	if (!match?.[1])
		throw new Error("gate recommendations JSON block is missing");
	return JSON.parse(match[1]) as unknown;
}

export interface GateRecommendationValidation {
	readonly valid: boolean;
	readonly issues: readonly string[];
}

/**
 * Gate recommendations propose; they never activate. Every item declares which
 * lane it belongs to, cites the calibration evidence and limitations behind it,
 * and leaves enforcement off — the ordered Quality Contract row for mutation
 * stays bindable but unbound, which is the honest state of this plan.
 */
export function validateGateRecommendations(
	input: unknown,
	currentEpochId: string,
): GateRecommendationValidation {
	const issues: string[] = [];
	if (!isRecord(input))
		return { valid: false, issues: ["gate recommendations must be an object"] };
	if (input.schemaVersion !== 1) issues.push("schemaVersion must equal 1");
	if (input.epochId !== currentEpochId)
		issues.push(`epochId must match current epoch ${currentEpochId}`);

	const items = Array.isArray(input.items) ? input.items : undefined;
	if (!items || items.length === 0)
		issues.push("items must contain every recommendation");
	else
		for (const [index, item] of items.entries())
			validateGateRecommendationItem(item, index, issues);

	validateQualityContractOrder(input.orderedQualityContract, issues);

	const links = Array.isArray(input.roadmapCrossLinks)
		? input.roadmapCrossLinks
		: [];
	for (const slug of REQUIRED_ROADMAP_CROSS_LINKS) {
		const link = links.find(
			(candidate) => isRecord(candidate) && candidate.slug === slug,
		);
		if (!isRecord(link)) {
			issues.push(`roadmapCrossLinks must cross-link ${slug}`);
			continue;
		}
		if (link.implemented !== false)
			issues.push(`${slug} must be cross-linked without being implemented`);
	}
	return { valid: issues.length === 0, issues };
}

function validateGateRecommendationItem(
	input: unknown,
	index: number,
	issues: string[],
): void {
	const path = `items[${index}]`;
	if (!isRecord(input)) {
		issues.push(`${path} must be an object`);
		return;
	}
	if (!nonEmpty(input.id)) issues.push(`${path}.id is required`);
	if (!nonEmpty(input.check)) issues.push(`${path}.check is required`);
	const label = String(input.label);
	if (!GATE_RECOMMENDATION_LABELS.includes(label as never))
		issues.push(
			`${path}.label must be objective-candidate or agent-assessed-heuristic`,
		);
	for (const field of ["calibrationCitations", "limitations"] as const)
		if (!Array.isArray(input[field]) || input[field].length === 0)
			issues.push(`${path}.${field} must not be empty`);
	if (input.activation !== "none")
		issues.push(
			`${path}.activation must equal none; this plan activates no gate`,
		);
	if (input.enforcedInCi !== false)
		issues.push(`${path}.enforcedInCi must be false`);
	const subject = `${String(input.id)} ${String(input.check)}`.toLowerCase();
	for (const excluded of EXCLUDED_RECOMMENDATION_SUBJECTS)
		if (subject.includes(excluded))
			issues.push(`${path} must not expand into ${excluded}`);
}

const ORDERED_QUALITY_CONTRACT = [
	{ order: 1, gate: "correctness", bindingState: "bound" },
	{ order: 2, gate: "artifact-conformance", bindingState: "bound" },
	{ order: 3, gate: "mutation", bindingState: "unbound" },
] as const;

function validateQualityContractOrder(input: unknown, issues: string[]): void {
	const rows = Array.isArray(input) ? input : [];
	if (rows.length !== ORDERED_QUALITY_CONTRACT.length) {
		issues.push(
			"orderedQualityContract must restate the three ordered gate rows",
		);
		return;
	}
	for (const [index, expected] of ORDERED_QUALITY_CONTRACT.entries()) {
		const row = rows[index];
		if (
			!isRecord(row) ||
			row.order !== expected.order ||
			row.gate !== expected.gate ||
			row.bindingState !== expected.bindingState
		)
			issues.push(
				`orderedQualityContract[${index}] must be ${expected.gate} ${expected.bindingState}`,
			);
	}
	const mutation = rows[2];
	if (isRecord(mutation) && mutation.tier !== "bindable")
		issues.push("the mutation row must remain bindable but unbound");
}

/** The spec's exact eight baseline conditions, in order (`plan.md` §7). */
export const BASELINE_CONDITIONS = [
	{ id: 1, name: "complete-command-census" },
	{ id: 2, name: "explicit-dispositions" },
	{ id: 3, name: "no-counted-weak-guardrail" },
	{ id: 4, name: "critical-portfolios-protected" },
	{ id: 5, name: "confirmed-weaknesses-discharged" },
	{ id: 6, name: "required-probes-red-then-restored-green" },
	{ id: 7, name: "bounded-noncritical-uncertainty" },
	{ id: 8, name: "project-owner-ratification" },
] as const;

export type BaselineConditionStatus = "met" | "not-met" | "blocked";

export interface BaselineConditionRow {
	readonly id: number;
	readonly name: string;
	readonly status: BaselineConditionStatus;
	readonly reasons: readonly string[];
}

export interface OwnerRatificationBlock {
	readonly decision: string;
	readonly ratifiedBy: string;
	readonly evaluatedRevision: string;
	readonly candidateEvidenceDigest: string;
	readonly acceptedUncertaintyIds: readonly string[];
}

export interface BaselineEvaluationInput {
	readonly epochId: string;
	readonly evaluatedRevision: string;
	/** Recomputed from current evidence, never read back from the document. */
	readonly candidateEvidenceDigest: string;
	/** Conditions 1-7; condition 8 is derived from the owner block alone. */
	readonly conditions: readonly Omit<BaselineConditionRow, "name">[];
	readonly residualUncertaintyIds: readonly string[];
	readonly ownerRatification?: unknown;
}

export interface BaselineEvaluation {
	readonly verdict: "not established" | "established";
	readonly eligibility:
		| "not-eligible"
		| "eligible-for-ratification"
		| "ratified";
	readonly rows: readonly BaselineConditionRow[];
	readonly failingConditionIds: readonly number[];
	readonly issues: readonly string[];
}

/**
 * The automation boundary. Conditions 1-7 are evidence; condition 8 is a human
 * act this function can only observe. With every evidence row met and no owner
 * block the answer is `eligible-for-ratification` and the verdict stays `not
 * established` — automation has no path to `established`, which is the point.
 */
export function evaluateBaseline(
	input: BaselineEvaluationInput,
): BaselineEvaluation {
	const issues: string[] = [];
	const supplied = new Map(input.conditions.map((row) => [row.id, row]));
	if (supplied.has(8))
		issues.push(
			"condition 8 is the owner's act and cannot be supplied as evidence",
		);

	const rows: BaselineConditionRow[] = [];
	for (const condition of BASELINE_CONDITIONS) {
		if (condition.id === 8) continue;
		const row = supplied.get(condition.id);
		if (!row) {
			issues.push(`condition ${condition.id} was not evaluated`);
			rows.push({
				id: condition.id,
				name: condition.name,
				status: "blocked",
				reasons: ["no evidence was supplied for this condition"],
			});
			continue;
		}
		rows.push({
			id: condition.id,
			name: condition.name,
			status: row.status,
			reasons: row.reasons ?? [],
		});
	}

	const evidenceMet = rows.every((row) => row.status === "met");
	const ratification = readOwnerRatification(
		input.ownerRatification,
		input,
		issues,
	);
	const ownerRow: BaselineConditionRow = {
		id: 8,
		name: "project-owner-ratification",
		status: ratification.exact ? "met" : "not-met",
		reasons: ratification.reasons,
	};
	rows.push(ownerRow);

	const failingConditionIds = rows
		.filter((row) => row.status !== "met")
		.map((row) => row.id);

	if (!evidenceMet)
		return {
			verdict: "not established",
			eligibility: "not-eligible",
			rows,
			failingConditionIds,
			issues,
		};
	if (!ratification.present)
		return {
			verdict: "not established",
			eligibility: "eligible-for-ratification",
			rows,
			failingConditionIds,
			issues,
		};
	if (!ratification.exact)
		return {
			verdict: "not established",
			eligibility: "eligible-for-ratification",
			rows,
			failingConditionIds,
			issues,
		};
	return {
		verdict: "established",
		eligibility: "ratified",
		rows,
		failingConditionIds,
		issues,
	};
}

function readOwnerRatification(
	input: unknown,
	context: BaselineEvaluationInput,
	issues: string[],
): { present: boolean; exact: boolean; reasons: string[] } {
	if (input === undefined)
		return {
			present: false,
			exact: false,
			reasons: ["the project owner has not ratified this candidate"],
		};
	if (!isRecord(input)) {
		issues.push("ownerRatification must be an object");
		return {
			present: true,
			exact: false,
			reasons: ["the owner block is malformed"],
		};
	}
	const reasons: string[] = [];
	if (input.decision !== "established")
		reasons.push("the owner block does not record an established decision");
	if (!nonEmpty(input.ratifiedBy))
		reasons.push("the owner block does not name who ratified it");
	if (input.evaluatedRevision !== context.evaluatedRevision)
		reasons.push(
			`the owner ratified revision ${String(input.evaluatedRevision)}, not the evaluated ${context.evaluatedRevision}`,
		);
	if (input.candidateEvidenceDigest !== context.candidateEvidenceDigest)
		reasons.push(
			"the candidate digest recomputes to a different value, so the ratification is stale",
		);
	const accepted = Array.isArray(input.acceptedUncertaintyIds)
		? input.acceptedUncertaintyIds.map(String)
		: undefined;
	if (!accepted) reasons.push("the owner block accepts no uncertainty ids");
	else if (!sameSet(accepted, context.residualUncertaintyIds))
		reasons.push(
			"the accepted uncertainty ids differ from the residual-uncertainty register",
		);
	return { present: true, exact: reasons.length === 0, reasons };
}

export function parseBaselineDocument(document: string): unknown {
	const match = document.match(/```json baseline\n([\s\S]*?)\n```/u);
	if (!match?.[1]) throw new Error("baseline JSON block is missing");
	return JSON.parse(match[1]) as unknown;
}

export interface BaselineDocumentValidation {
	readonly valid: boolean;
	readonly issues: readonly string[];
}

/**
 * Checks the committed record rather than recomputing the decision. A score or
 * overall-health field is rejected outright: the spec's baseline is a set of
 * named reasons, and a single number would invite exactly the summary judgment
 * the audit exists to avoid.
 */
export function validateBaselineDocument(
	document: string,
	record: unknown,
	context: {
		readonly epochId: string;
		readonly evaluatedRevision: string;
		readonly candidateEvidenceDigest: string;
		readonly packetQuestionIds: readonly string[];
	},
): BaselineDocumentValidation {
	const issues: string[] = [];
	const packetSections = document.match(/^## Ratification packet$/gmu) ?? [];
	if (packetSections.length !== 1)
		issues.push(
			"baseline must contain exactly one Ratification packet section",
		);
	if (!isRecord(record))
		return { valid: false, issues: [...issues, "baseline must be an object"] };
	if (record.schemaVersion !== 1) issues.push("schemaVersion must equal 1");
	if (record.epochId !== context.epochId)
		issues.push(`epochId must match current epoch ${context.epochId}`);
	if (record.evaluatedRevision !== context.evaluatedRevision)
		issues.push("evaluatedRevision must name the committed evaluated revision");
	if (record.candidateEvidenceDigest !== context.candidateEvidenceDigest)
		issues.push("candidateEvidenceDigest must recompute over current evidence");
	for (const forbidden of ["score", "overallHealth", "healthScore"])
		if (forbidden in record)
			issues.push(`baseline must not carry a ${forbidden} field`);

	const rows = Array.isArray(record.conditions) ? record.conditions : [];
	if (rows.length !== BASELINE_CONDITIONS.length)
		issues.push("baseline must record all eight condition rows");
	for (const [index, expected] of BASELINE_CONDITIONS.entries()) {
		const row = rows[index];
		if (!isRecord(row) || row.id !== expected.id || row.name !== expected.name)
			issues.push(`conditions[${index}] must be ${expected.name}`);
	}
	if (record.verdict !== "not established" && record.verdict !== "established")
		issues.push("verdict must be not established or established");

	for (const id of context.packetQuestionIds)
		if (!document.includes(id))
			issues.push(`unresolved question ${id} must appear in the packet`);
	return { valid: issues.length === 0, issues };
}

/** Census finding kinds that condition 2 requires an explicit answer for. */
const DISPOSITION_REQUIRED_KINDS = [
	"skipped-or-todo",
	"conditional-observation",
	"runtime-skipped",
	"bounded-collector-limitation",
	"run-end-limitation",
	"filtered-selection",
] as const;

/**
 * Dimension conclusions that disqualify a test from being counted as guardrail
 * evidence: the assertion never reached production, it checks the wrong side of
 * a contract, or a realistic defect walked past it.
 */
const DISQUALIFYING_CONCLUSIONS = {
	grounding: "test-local",
	contractAlignment: "misaligned",
	faultSensitivity: "probe-survived",
} as const;

export interface BaselineEvidenceInput {
	readonly censusState: string;
	readonly findings: readonly {
		readonly id: string;
		readonly kind: string;
		readonly basis: string;
		readonly accountedFor: boolean;
	}[];
	readonly profiles: readonly TestEvidenceProfile[];
	readonly countedProfileIds: readonly string[];
	readonly portfolioEntries: readonly {
		readonly inventoryId: string;
		readonly criticality: string;
		readonly conclusion: string;
		readonly probe: { readonly required: boolean; readonly status: string };
	}[];
	readonly ledgerRows: readonly {
		readonly id: string;
		readonly outcome: string;
		readonly packetQuestion?: { readonly id?: unknown };
	}[];
	readonly probeRecords: readonly {
		readonly requirementId?: string;
		readonly outcome?: string;
		readonly expectedRed?: boolean;
		readonly restoredGreen?: boolean;
	}[];
	readonly residualUncertainty: readonly {
		readonly id: string;
		readonly criticality: string;
		readonly bounded: boolean;
		readonly documented: boolean;
	}[];
}

/**
 * Turns the epoch's evidence into conditions 1-7. Every row states why it
 * failed rather than only that it did, because a failing row returns to its
 * owning stage and the reason is what says which stage that is.
 */
export function deriveBaselineConditions(
	input: BaselineEvidenceInput,
): Omit<BaselineConditionRow, "name">[] {
	const counted = new Set(input.countedProfileIds);
	const weakGuardrails = input.profiles.flatMap((profile) => {
		if (!counted.has(profile.id)) return [];
		const dimensions = profile.dimensions as unknown as Record<
			string,
			{ value?: unknown }
		>;
		return Object.entries(DISQUALIFYING_CONCLUSIONS)
			.filter(([dimension, value]) => dimensions[dimension]?.value === value)
			.map(([dimension, value]) => `${profile.id}: ${dimension} is ${value}`);
	});

	const unanswered = input.findings.filter(
		(finding) =>
			DISPOSITION_REQUIRED_KINDS.includes(finding.kind as never) &&
			finding.basis !== "reasoned" &&
			!finding.accountedFor,
	);

	const unprotectedCritical = input.portfolioEntries.filter(
		(entry) =>
			entry.criticality === "critical" && entry.conclusion !== "protected",
	);

	const openRows = input.ledgerRows.filter(
		(row) =>
			!["closed", "excluded-from-guardrail", "unresolved"].includes(
				row.outcome,
			),
	);
	const unbatched = input.ledgerRows.filter(
		(row) => row.outcome === "unresolved" && !nonEmpty(row.packetQuestion?.id),
	);

	const requiredProbeIds = input.portfolioEntries
		.filter((entry) => entry.probe.required)
		.map((entry) => entry.inventoryId);
	const confirmedProbes = new Set(
		input.probeRecords
			.filter(
				(record) =>
					record.expectedRed === true && record.restoredGreen === true,
			)
			.map((record) => String(record.requirementId)),
	);
	const missingProbes = requiredProbeIds.filter(
		(id) => !confirmedProbes.has(id),
	);

	const unboundedUncertainty = input.residualUncertainty.filter(
		(entry) =>
			entry.criticality === "critical" || !entry.bounded || !entry.documented,
	);

	return [
		row(
			1,
			input.censusState === "complete",
			input.censusState === "complete"
				? []
				: [`the command census is ${input.censusState}`],
		),
		row(
			2,
			unanswered.length === 0,
			unanswered
				.slice(0, 20)
				.map((finding) => `${finding.kind} ${finding.id} has no disposition`),
		),
		row(3, weakGuardrails.length === 0, weakGuardrails.slice(0, 20)),
		row(
			4,
			unprotectedCritical.length === 0,
			unprotectedCritical.map(
				(entry) => `${entry.inventoryId} is ${entry.conclusion}, not protected`,
			),
		),
		row(5, openRows.length === 0 && unbatched.length === 0, [
			...openRows.map((r) => `${r.id} is ${r.outcome}`),
			...unbatched.map(
				(r) => `${r.id} is unresolved without a packet question`,
			),
		]),
		row(
			6,
			missingProbes.length === 0,
			missingProbes.map(
				(id) => `${id} requires a probe that was red then restored green`,
			),
		),
		row(
			7,
			unboundedUncertainty.length === 0,
			unboundedUncertainty.map(
				(entry) => `${entry.id} is not bounded, documented and noncritical`,
			),
		),
	];
}

function row(
	id: number,
	met: boolean,
	reasons: readonly string[],
): Omit<BaselineConditionRow, "name"> {
	return { id, status: met ? "met" : "not-met", reasons };
}

export interface ProfileIndexUnit {
	readonly unitId: string;
	readonly file: string;
	readonly profileIds: readonly string[];
	readonly sha256: string;
}

export interface ProfileIndex {
	readonly schemaVersion: 1;
	readonly epochId: string;
	readonly profileCount: number;
	readonly units: readonly ProfileIndexUnit[];
}

/**
 * Bundle 3's index. It is derived from the shards rather than maintained
 * alongside them, so it cannot drift into claiming a profile no shard holds;
 * each entry carries the shard digest that makes a later edit detectable.
 */
export async function publishProfileIndex(
	root: string,
	epochId: string,
): Promise<ProfileIndex> {
	const directory = join(root, "epochs", epochId, "profiles");
	let names: string[] = [];
	try {
		names = await readdir(directory);
	} catch (error) {
		if (!isMissing(error)) throw error;
	}
	const units: ProfileIndexUnit[] = [];
	let profileCount = 0;
	for (const name of names
		.filter((candidate) => candidate.endsWith(".ndjson"))
		.sort()) {
		const text = await readFile(join(directory, name), "utf8");
		const lines = text.split(/\r?\n/).filter(Boolean);
		const header = JSON.parse(lines[0] ?? "{}") as { unitId?: string };
		const profileIds = lines.slice(1).map((line) => {
			const profile = JSON.parse(line) as { id: string };
			return profile.id;
		});
		profileCount += profileIds.length;
		units.push({
			unitId: header.unitId ?? name.replace(/\.ndjson$/u, ""),
			file: `profiles/${name}`,
			profileIds,
			sha256: createHash("sha256").update(text).digest("hex"),
		});
	}
	const index: ProfileIndex = {
		schemaVersion: 1,
		epochId,
		profileCount,
		units,
	};
	await writeTextAtomic(
		join(directory, "index.json"),
		`${JSON.stringify(index, null, 2)}\n`,
	);
	return index;
}
