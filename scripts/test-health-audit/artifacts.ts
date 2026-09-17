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
