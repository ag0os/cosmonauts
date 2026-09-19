import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	readCurrentEpochManifest,
	validateBehaviorRiskInventory,
} from "./artifacts.ts";
import {
	AUDIT_VOCABULARY,
	type TestEvidenceProfile,
	validateTestEvidenceProfile,
} from "./schema.ts";

const AXIS_KINDS = ["boundary", "path", "caller", "defect"] as const;
const CELL_STATES = ["protected", "contributing", "gap", "unavailable"];
const PROBE_STATUSES = ["not-required", "required", "confirmed", "blocked"];

type AxisKind = (typeof AXIS_KINDS)[number];

export interface PortfolioAxisCell {
	readonly name: string;
	readonly state: "protected" | "contributing" | "gap" | "unavailable";
	readonly profileIds: readonly string[];
	readonly evidenceBases: readonly string[];
	readonly gaps: readonly string[];
	readonly uncertainty: readonly string[];
}

export interface PortfolioEvidenceEntry {
	readonly inventoryId: string;
	readonly title: string;
	readonly criticality: string;
	readonly conclusion:
		| "protected"
		| "partially-protected"
		| "unprotected"
		| "unresolved";
	readonly requiredAxes: Readonly<Record<AxisKind, readonly string[]>>;
	readonly axes: Readonly<Record<AxisKind, readonly PortfolioAxisCell[]>>;
	readonly probe: {
		readonly required: boolean;
		readonly requirementId: string;
		readonly status: "not-required" | "required" | "confirmed" | "blocked";
		readonly profileIds: readonly string[];
		readonly probeRefs: readonly string[];
		readonly reasons: readonly string[];
	};
	readonly gaps: readonly string[];
	readonly uncertainty: readonly string[];
}

export interface PortfolioEvidenceRecord {
	readonly schemaVersion: 1;
	readonly epochId: string;
	readonly entries: readonly PortfolioEvidenceEntry[];
}

interface InventoryEntry {
	id: string;
	title: string;
	claim?: { value?: string };
	criticality: { value: string };
	boundaries: Record<string, { value: string }>;
	axes: Record<"path" | "caller" | "defect", { value: string[] }>;
}

export function validatePortfolioEvidence(input: unknown): {
	readonly valid: boolean;
	readonly issues: readonly string[];
} {
	const issues: string[] = [];
	if (!isRecord(input)) return invalid("portfolio evidence must be an object");
	if (input.schemaVersion !== 1) issues.push("schemaVersion must equal 1");
	if (!nonEmpty(input.epochId)) issues.push("epochId is required");
	if (!Array.isArray(input.entries) || input.entries.length === 0) {
		issues.push("entries must be a non-empty array");
		return result(issues);
	}
	input.entries.forEach((entry, index) => {
		validatePortfolioEntry(entry, index, issues);
	});
	return result(issues);
}

function validatePortfolioEntry(
	input: unknown,
	index: number,
	issues: string[],
): void {
	const path = `entries[${index}]`;
	if (!isRecord(input)) {
		issues.push(`${path} must be an object`);
		return;
	}
	for (const field of ["inventoryId", "title", "criticality"])
		if (!nonEmpty(input[field])) issues.push(`${path}.${field} is required`);
	if (
		!AUDIT_VOCABULARY.portfolioConclusions.includes(input.conclusion as never)
	)
		issues.push(`${path}.conclusion is invalid`);
	if (!isRecord(input.requiredAxes))
		issues.push(`${path}.requiredAxes must be an object`);
	if (!isRecord(input.axes)) issues.push(`${path}.axes must be an object`);
	for (const kind of AXIS_KINDS) {
		const required = isRecord(input.requiredAxes)
			? stringArray(input.requiredAxes[kind])
			: undefined;
		if (!required || required.length === 0 || !isUnique(required)) {
			issues.push(`${path}.requiredAxes.${kind} must contain unique names`);
			continue;
		}
		const cells =
			isRecord(input.axes) && Array.isArray(input.axes[kind])
				? input.axes[kind]
				: undefined;
		if (!cells) {
			issues.push(`${path}.axes.${kind} must be an array`);
			continue;
		}
		const names = cells.flatMap((cell) =>
			isRecord(cell) && nonEmpty(cell.name) ? [cell.name] : [],
		);
		for (const name of required)
			if (!names.includes(name))
				issues.push(
					`${path}.axes.${kind} is missing risk-required axis ${name}`,
				);
		for (const name of names)
			if (!required.includes(name))
				issues.push(`${path}.axes.${kind} contains undeclared axis ${name}`);
		if (!isUnique(names))
			issues.push(`${path}.axes.${kind} must contain each axis exactly once`);
		cells.forEach((cell, cellIndex) => {
			validatePortfolioCell(cell, `${path}.axes.${kind}[${cellIndex}]`, issues);
		});
	}
	validateProbe(input.probe, path, input.conclusion, issues);
	const gaps = stringArray(input.gaps);
	const uncertainty = stringArray(input.uncertainty);
	if (!gaps) issues.push(`${path}.gaps must be an array of strings`);
	if (!uncertainty)
		issues.push(`${path}.uncertainty must be an array of strings`);
	if (input.conclusion !== "protected") return;
	if ((gaps?.length ?? 0) > 0 || (uncertainty?.length ?? 0) > 0)
		issues.push(`${path} cannot be protected while gaps or uncertainty remain`);
	if (!isRecord(input.axes)) return;
	for (const kind of AXIS_KINDS)
		for (const cell of Array.isArray(input.axes[kind]) ? input.axes[kind] : [])
			if (isRecord(cell) && cell.state !== "protected")
				issues.push(
					`${path} cannot be protected while ${kind} axis ${String(cell.name)} is ${String(cell.state)}`,
				);
}

function validatePortfolioCell(
	input: unknown,
	path: string,
	issues: string[],
): void {
	if (!isRecord(input)) {
		issues.push(`${path} must be an object`);
		return;
	}
	if (!nonEmpty(input.name)) issues.push(`${path}.name is required`);
	if (!CELL_STATES.includes(String(input.state)))
		issues.push(`${path}.state is invalid`);
	const profileIds = stringArray(input.profileIds);
	const bases = stringArray(input.evidenceBases);
	const gaps = stringArray(input.gaps);
	const uncertainty = stringArray(input.uncertainty);
	if (!profileIds)
		issues.push(`${path}.profileIds must be an array of strings`);
	if (!bases || bases.length === 0)
		issues.push(`${path}.evidenceBases must not be empty`);
	else if (
		bases.some(
			(basis) => !AUDIT_VOCABULARY.evidenceBases.includes(basis as never),
		)
	)
		issues.push(`${path}.evidenceBases contains an invalid value`);
	if (!gaps) issues.push(`${path}.gaps must be an array of strings`);
	if (!uncertainty)
		issues.push(`${path}.uncertainty must be an array of strings`);
	if (
		(input.state === "protected" || input.state === "contributing") &&
		profileIds?.length === 0
	)
		issues.push(`${path}.profileIds must not be empty for ${input.state}`);
	if (
		(input.state === "gap" || input.state === "unavailable") &&
		(gaps?.length ?? 0) === 0 &&
		(uncertainty?.length ?? 0) === 0
	)
		issues.push(`${path} must keep its gap or uncertainty visible`);
	if (
		input.state === "protected" &&
		bases?.some((basis) => ["missing", "blocked", "reasoned"].includes(basis))
	)
		issues.push(
			`${path} cannot be protected by missing, blocked, or reasoned evidence`,
		);
}

function validateProbe(
	input: unknown,
	entryPath: string,
	conclusion: unknown,
	issues: string[],
): void {
	const path = `${entryPath}.probe`;
	if (!isRecord(input)) {
		issues.push(`${path} must be an object`);
		return;
	}
	if (typeof input.required !== "boolean")
		issues.push(`${path}.required must be a boolean`);
	if (!nonEmpty(input.requirementId))
		issues.push(`${path}.requirementId is required`);
	if (!PROBE_STATUSES.includes(String(input.status)))
		issues.push(`${path}.status is invalid`);
	for (const field of ["profileIds", "probeRefs", "reasons"])
		if (!stringArray(input[field]))
			issues.push(`${path}.${field} must be an array of strings`);
	if (
		conclusion === "protected" &&
		input.required === true &&
		(input.status !== "confirmed" || stringArray(input.probeRefs)?.length === 0)
	)
		issues.push(
			`${entryPath} cannot be protected while required probe ${String(input.requirementId)} is ${String(input.status)}`,
		);
}

export function buildPortfolioEvidence(
	inventory: unknown,
	profiles: readonly TestEvidenceProfile[],
	currentEpochId: string,
): PortfolioEvidenceRecord {
	const inventoryValidation = validateBehaviorRiskInventory(
		inventory,
		currentEpochId,
	);
	if (!inventoryValidation.valid)
		throw new Error(
			`cannot join invalid behavior-risk inventory: ${inventoryValidation.issues.join("; ")}`,
		);
	const entries = (inventory as { entries: InventoryEntry[] }).entries;
	return {
		schemaVersion: 1,
		epochId: currentEpochId,
		entries: entries.map((entry) => buildPortfolioEntry(entry, profiles)),
	};
}

function buildPortfolioEntry(
	entry: InventoryEntry,
	profiles: readonly TestEvidenceProfile[],
): PortfolioEvidenceEntry {
	const contributions = profiles.flatMap((profile) =>
		profile.portfolioContributions.value
			.filter((contribution) => contribution.inventoryId === entry.id)
			.map((contribution) => ({ profile, contribution })),
	);
	const requiredAxes = {
		boundary: Object.entries(entry.boundaries)
			.filter(([, assessment]) => assessment.value !== "not-applicable")
			.map(([name]) => name),
		path: entry.axes.path.value,
		caller: entry.axes.caller.value,
		defect: entry.axes.defect.value,
	};
	const axes = {
		boundary: requiredAxes.boundary.map((name) =>
			buildCell(
				name,
				contributions
					.filter(({ contribution }) => contribution.boundary === name)
					.map(({ profile }) => profile),
				entry.boundaries[name]?.value === "unavailable",
				"boundary",
			),
		),
		path: requiredAxes.path.map((name) => buildCell(name, [], false, "path")),
		caller: requiredAxes.caller.map((name) =>
			buildCell(name, [], false, "caller"),
		),
		defect: requiredAxes.defect.map((name) =>
			buildCell(
				name,
				contributions
					.filter(({ contribution }) => contribution.defectAxes.includes(name))
					.map(({ profile }) => profile),
				false,
				"defect",
			),
		),
	};
	const probeReasons = unique([
		...(entry.criticality.value === "critical" ? ["critical portfolio"] : []),
		...(requiredAxes.boundary.some((boundary) =>
			[
				"consumer",
				"adapter",
				"persisted-state",
				"event",
				"alternate-path",
				"composition-root",
			].includes(boundary),
		)
			? ["shipped boundary claim"]
			: []),
		...(contributions.some(({ profile }) =>
			profile.reasonCodes.value.includes("mock-supplied outcome"),
		)
			? ["mock-maskable outcome"]
			: []),
	]);
	const requirementId = `PROBE-${entry.id}`;
	const cells = AXIS_KINDS.flatMap((kind) => axes[kind]);
	const gaps = unique([
		...cells.flatMap((cell) => cell.gaps),
		...(probeReasons.length > 0
			? [`Required probe ${requirementId} has not run.`]
			: []),
	]);
	const uncertainty = unique(cells.flatMap((cell) => cell.uncertainty));
	const conclusion =
		entry.claim?.value === "unresolved" ||
		cells.some((cell) => cell.state === "unavailable")
			? "unresolved"
			: contributions.length > 0
				? "partially-protected"
				: "unprotected";
	return {
		inventoryId: entry.id,
		title: entry.title,
		criticality: entry.criticality.value,
		conclusion,
		requiredAxes,
		axes,
		probe: {
			required: probeReasons.length > 0,
			requirementId,
			status: probeReasons.length > 0 ? "required" : "not-required",
			profileIds: unique(contributions.map(({ profile }) => profile.id)),
			probeRefs: [],
			reasons: probeReasons,
		},
		gaps,
		uncertainty,
	};
}

function buildCell(
	name: string,
	profiles: readonly TestEvidenceProfile[],
	unavailable: boolean,
	kind: AxisKind,
): PortfolioAxisCell {
	const profileIds = unique(profiles.map((profile) => profile.id));
	const bases = unique(
		profiles.flatMap((profile) => [
			profile.portfolioContributions.basis,
			profile.dimensions.faultSensitivity.basis,
		]),
	);
	const uncertainty = unique(
		profiles.flatMap((profile) => [
			...profile.portfolioContributions.uncertainty,
			...profile.dimensions.faultSensitivity.uncertainty,
			...profile.chain.value.limitations,
		]),
	);
	if (unavailable)
		return {
			name,
			state: "unavailable",
			profileIds,
			evidenceBases: unique([...bases, "missing"]),
			gaps: [`Inventory authority marks ${kind} axis ${name} unavailable.`],
			uncertainty,
		};
	if (profileIds.length === 0)
		return {
			name,
			state: "gap",
			profileIds: [],
			evidenceBases: ["missing"],
			gaps: [
				kind === "path" || kind === "caller"
					? `Profiles do not enumerate ${kind} contributions for ${name}; no parity is inferred.`
					: `No profile contributes exact ${kind} evidence for ${name}.`,
			],
			uncertainty: [],
		};
	const unavailableBases = bases.filter((basis) =>
		["missing", "blocked"].includes(basis),
	);
	if (unavailableBases.length > 0)
		return {
			name,
			state: "gap",
			profileIds,
			evidenceBases: bases,
			gaps: [
				`Exact ${kind} evidence for ${name} includes unavailable basis: ${unavailableBases.join(", ")}.`,
			],
			uncertainty,
		};
	return {
		name,
		state: "contributing",
		profileIds,
		evidenceBases: bases,
		gaps: bases.includes("reasoned")
			? [
					`Exact ${kind} evidence for ${name} is reasoned and not probe-confirmed.`,
				]
			: [],
		uncertainty,
	};
}

/**
 * Joins the current epoch's own inventory, profiles and probe records into the
 * two portfolio documents, without writing them. Publishing and checking a
 * published document both go through this, so what `validate` compares against
 * is the same derivation the publisher performed rather than a second
 * implementation of it.
 */
export async function derivePortfolioEvidence(auditRoot: string): Promise<{
	readonly record: PortfolioEvidenceRecord;
	readonly matrix: string;
	readonly gapRegister: string;
}> {
	const manifest = await readCurrentEpochManifest(auditRoot);
	const epochDirectory = join(auditRoot, "epochs", manifest.epochId);
	const [inventory, profiles] = await Promise.all([
		readJson(join(epochDirectory, "behavior-risk-inventory.json")),
		readCertifiedProfiles(epochDirectory, manifest.epochId),
	]);
	const record = applyProbeEvidence(
		buildPortfolioEvidence(inventory, profiles, manifest.epochId),
		await readProbeEvidence(epochDirectory),
	);
	return { record, ...renderPortfolioEvidenceDocuments(record) };
}

export async function publishPortfolioEvidence(
	auditRoot: string,
): Promise<PortfolioEvidenceRecord> {
	const manifest = await readCurrentEpochManifest(auditRoot);
	const epochDirectory = join(auditRoot, "epochs", manifest.epochId);
	const derived = await derivePortfolioEvidence(auditRoot);
	await Promise.all([
		writeAtomic(
			join(epochDirectory, "behavior-risk-matrix.md"),
			derived.matrix,
		),
		writeAtomic(join(epochDirectory, "gap-register.md"), derived.gapRegister),
	]);
	return derived.record;
}

interface PublishedProbeEvidence {
	readonly probeId?: unknown;
	readonly outcome?: unknown;
	readonly limitation?: unknown;
}

export function applyProbeEvidence(
	record: PortfolioEvidenceRecord,
	probes: readonly PublishedProbeEvidence[],
): PortfolioEvidenceRecord {
	return {
		...record,
		entries: record.entries.map((entry) => {
			const probe = probes.find(
				(candidate) => candidate.probeId === entry.probe.requirementId,
			);
			if (!probe) return entry;
			const reference = `probes.jsonl#${entry.probe.requirementId}`;
			if (probe.outcome === "probe-confirmed") {
				const gaps = entry.gaps.filter(
					(gap) => !gap.includes(`Required probe ${entry.probe.requirementId}`),
				);
				const allProtected = AXIS_KINDS.every((kind) =>
					entry.axes[kind].every((axis) => axis.state === "protected"),
				);
				return {
					...entry,
					conclusion:
						allProtected && gaps.length === 0 && entry.uncertainty.length === 0
							? "protected"
							: entry.conclusion,
					probe: {
						...entry.probe,
						status: "confirmed",
						probeRefs: [reference],
					},
					gaps,
				};
			}
			const limitation =
				typeof probe.limitation === "string"
					? probe.limitation
					: "The realistic defect survived the claimed guardrail.";
			return {
				...entry,
				conclusion:
					entry.conclusion === "protected"
						? "partially-protected"
						: entry.conclusion,
				probe: {
					...entry.probe,
					status: "blocked",
					probeRefs: [reference],
				},
				gaps: unique([
					...entry.gaps.filter(
						(gap) =>
							!gap.includes(`Required probe ${entry.probe.requirementId}`),
					),
					`Probe ${entry.probe.requirementId} cannot protect this claim: ${limitation}`,
				]),
			};
		}),
	};
}

async function readProbeEvidence(
	epochDirectory: string,
): Promise<PublishedProbeEvidence[]> {
	try {
		return (await readFile(join(epochDirectory, "probes.jsonl"), "utf8"))
			.trim()
			.split(/\r?\n/u)
			.filter(Boolean)
			.map((line) => JSON.parse(line) as PublishedProbeEvidence);
	} catch (error) {
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			(error as { code?: unknown }).code === "ENOENT"
		)
			return [];
		throw error;
	}
}

async function readCertifiedProfiles(
	epochDirectory: string,
	epochId: string,
): Promise<TestEvidenceProfile[]> {
	const queue = (await readJson(join(epochDirectory, "work-units.json"))) as {
		units?: Array<{ id?: unknown; identities?: Array<{ id?: unknown }> }>;
	};
	if (!Array.isArray(queue.units) || queue.units.length === 0)
		throw new Error("current epoch work queue is missing or empty");
	const profiles: TestEvidenceProfile[] = [];
	for (const unit of queue.units) {
		if (!nonEmpty(unit.id) || !Array.isArray(unit.identities))
			throw new Error("current epoch work queue is malformed");
		const lines = (
			await readFile(
				join(epochDirectory, "profiles", `${unit.id}.ndjson`),
				"utf8",
			)
		)
			.trim()
			.split(/\r?\n/u)
			.map((line) => JSON.parse(line) as unknown);
		const header = lines.shift();
		// Every successor epoch carries the judgments whose material inputs rehash
		// unchanged, so most of its units are written by the carry process rather
		// than by a dispatcher. Both are certified. What this reader checks is the
		// one part of `validatePublishedUnit`'s contract a shard carries on its
		// face: the backend must agree with whether the unit's profiles name the
		// epoch they came from. The publisher checks far more at write time.
		const carried =
			isRecord(header) && header.processBackend === "carry-forward";
		if (
			!isRecord(header) ||
			header.recordType !== "profile-unit" ||
			header.epochId !== epochId ||
			header.unitId !== unit.id ||
			(!carried && header.processBackend !== "driver-process")
		)
			throw new Error(`${unit.id} does not have a valid certified unit header`);
		for (const [index, profile] of lines.entries()) {
			const validation = validateTestEvidenceProfile(profile);
			if (!validation.valid)
				throw new Error(
					`${unit.id} profile ${index} is invalid: ${validation.issues.join("; ")}`,
				);
			if (isRecord(profile) && (profile.carriedFrom !== undefined) !== carried)
				throw new Error(
					`${unit.id} profile ${index} does not match the unit's ${String(header.processBackend)} provenance`,
				);
			profiles.push(profile as TestEvidenceProfile);
		}
	}
	const expected = queue.units.flatMap((unit) =>
		(unit.identities ?? []).flatMap((identity) =>
			nonEmpty(identity.id) ? [identity.id] : [],
		),
	);
	const actual = profiles.map((profile) => profile.id);
	if (
		expected.length !== actual.length ||
		!isUnique(actual) ||
		!sameSet(expected, actual)
	)
		throw new Error(
			"current epoch must contain exactly one certified profile per frozen identity",
		);
	return profiles;
}

export function renderPortfolioEvidenceDocuments(
	record: PortfolioEvidenceRecord,
): {
	readonly matrix: string;
	readonly gapRegister: string;
} {
	const validation = validatePortfolioEvidence(record);
	if (!validation.valid)
		throw new Error(
			`cannot render invalid portfolio evidence: ${validation.issues.join("; ")}`,
		);
	const summary = record.entries.map(
		(entry) =>
			`| ${entry.inventoryId} | ${cell(entry.title)} | ${entry.criticality} | ${entry.conclusion} | ${entry.probe.requirementId}: ${entry.probe.status} | ${entry.gaps.length} | ${entry.uncertainty.length} |`,
	);
	const matrixDetails = record.entries.flatMap((entry) => [
		`## ${entry.inventoryId} - ${entry.title}`,
		"",
		`Conclusion: **${entry.conclusion}**. Probe: \`${entry.probe.requirementId}\` is **${entry.probe.status}** (${entry.probe.reasons.join(", ") || "not required"}).`,
		"",
		"| Axis | Name | State | Evidence basis | Contributing profile IDs | Gaps | Uncertainty |",
		"|---|---|---|---|---|---|---|",
		...AXIS_KINDS.flatMap((kind) =>
			entry.axes[kind].map(
				(axis) =>
					`| ${kind} | ${cell(axis.name)} | ${axis.state} | ${axis.evidenceBases.join(", ")} | ${axis.profileIds.map((id) => `\`${id}\``).join("<br>") || "none"} | ${cell(axis.gaps.join("; ") || "none")} | ${cell(axis.uncertainty.join("; ") || "none")} |`,
			),
		),
		"",
	]);
	const gapDetails = record.entries.flatMap((entry) => [
		`## ${entry.inventoryId} - ${entry.title}`,
		"",
		`Conclusion: **${entry.conclusion}**.`,
		`Probe requirement: \`${entry.probe.requirementId}\` is **${entry.probe.status}**; references: ${entry.probe.probeRefs.join(", ") || "none"}.`,
		"",
		...entry.gaps.map((gap) => `- Gap: ${gap}`),
		...entry.uncertainty.map((item) => `- Uncertainty: ${item}`),
		...AXIS_KINDS.flatMap((kind) =>
			entry.axes[kind]
				.filter(
					(axis) =>
						axis.state !== "protected" ||
						axis.gaps.length > 0 ||
						axis.uncertainty.length > 0,
				)
				.map(
					(axis) =>
						`- ${kind} \`${axis.name}\`: ${axis.state}; basis ${axis.evidenceBases.join(", ")}; profiles ${axis.profileIds.join(", ") || "none"}; gaps ${axis.gaps.join("; ") || "none"}; uncertainty ${axis.uncertainty.join("; ") || "none"}.`,
				),
		),
		"",
	]);
	const evidenceBlock = [
		"```json portfolio-evidence",
		JSON.stringify(record, null, 2),
		"```",
		"",
	].join("\n");
	return {
		matrix: [
			"# Behavior-risk matrix",
			"",
			`Epoch: \`${record.epochId}\``,
			"",
			"Evidence is counted only for the exact named axis. A contribution on one boundary, path, caller, side, or defect does not close another. `contributing` means evidence exists but does not establish protection.",
			"",
			"| Inventory | Portfolio | Criticality | Conclusion | Probe | Gaps | Uncertainty |",
			"|---|---|---|---|---|---:|---:|",
			...summary,
			"",
			...matrixDetails,
			"## Machine-readable evidence",
			"",
			evidenceBlock,
		].join("\n"),
		gapRegister: [
			"# Gap register",
			"",
			`Epoch: \`${record.epochId}\``,
			"",
			"Missing, blocked, unavailable, and reasoned-only evidence stays visible here. No listed gap is rendered clean or protected.",
			"",
			...gapDetails,
			"## Machine-readable evidence",
			"",
			evidenceBlock,
		].join("\n"),
	};
}

export function parsePortfolioEvidenceDocument(
	document: string,
): PortfolioEvidenceRecord {
	const match = document.match(/```json portfolio-evidence\n([\s\S]*?)\n```/u);
	if (!match?.[1]) throw new Error("portfolio evidence JSON block is missing");
	return JSON.parse(match[1]) as PortfolioEvidenceRecord;
}

export function validatePortfolioEvidenceDocuments(options: {
	readonly matrix: string;
	readonly gapRegister: string;
	readonly inventory: unknown;
	readonly currentEpochId: string;
}): { readonly valid: boolean; readonly issues: readonly string[] } {
	const issues: string[] = [];
	let matrix: PortfolioEvidenceRecord;
	let gapRegister: PortfolioEvidenceRecord;
	try {
		matrix = parsePortfolioEvidenceDocument(options.matrix);
		gapRegister = parsePortfolioEvidenceDocument(options.gapRegister);
	} catch (error) {
		return { valid: false, issues: [String(error)] };
	}
	for (const [name, record] of [
		["behavior-risk-matrix.md", matrix],
		["gap-register.md", gapRegister],
	] as const) {
		const validation = validatePortfolioEvidence(record);
		issues.push(...validation.issues.map((issue) => `${name}: ${issue}`));
		if (record.epochId !== options.currentEpochId)
			issues.push(
				`${name}: epochId must match current epoch ${options.currentEpochId}`,
			);
	}
	if (JSON.stringify(matrix) !== JSON.stringify(gapRegister))
		issues.push("matrix and gap register machine-readable evidence must match");
	const inventoryValidation = validateBehaviorRiskInventory(
		options.inventory,
		options.currentEpochId,
	);
	issues.push(
		...inventoryValidation.issues.map((issue) => `inventory: ${issue}`),
	);
	if (!inventoryValidation.valid) return result(issues);
	const inventoryEntries = (options.inventory as { entries: InventoryEntry[] })
		.entries;
	if (
		JSON.stringify(inventoryEntries.map((entry) => entry.id)) !==
		JSON.stringify(matrix.entries.map((entry) => entry.inventoryId))
	)
		issues.push("portfolio entries must exactly match frozen inventory order");
	for (const [index, inventoryEntry] of inventoryEntries.entries()) {
		const portfolioEntry = matrix.entries[index];
		if (!portfolioEntry) continue;
		const expectedAxes = {
			boundary: Object.entries(inventoryEntry.boundaries)
				.filter(([, value]) => value.value !== "not-applicable")
				.map(([name]) => name),
			path: inventoryEntry.axes.path.value,
			caller: inventoryEntry.axes.caller.value,
			defect: inventoryEntry.axes.defect.value,
		};
		for (const kind of AXIS_KINDS)
			if (!sameSet(portfolioEntry.requiredAxes[kind], expectedAxes[kind]))
				issues.push(
					`entries[${index}].requiredAxes.${kind} must match frozen inventory`,
				);
	}
	return result(issues);
}

async function readJson(path: string): Promise<unknown> {
	return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function writeAtomic(path: string, value: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temporary = `${path}.${process.pid}.tmp`;
	await writeFile(temporary, value, { flag: "wx" });
	await rename(temporary, path);
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values)].sort();
}

function stringArray(input: unknown): string[] | undefined {
	return Array.isArray(input) && input.every(nonEmpty) ? input : undefined;
}

function isUnique(values: readonly string[]): boolean {
	return new Set(values).size === values.length;
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
	return (
		left.length === right.length && left.every((value) => right.includes(value))
	);
}

function nonEmpty(input: unknown): input is string {
	return typeof input === "string" && input.length > 0;
}

function isRecord(input: unknown): input is Record<string, unknown> {
	return typeof input === "object" && input !== null && !Array.isArray(input);
}

function result(issues: readonly string[]) {
	return { valid: issues.length === 0, issues };
}

function invalid(issue: string) {
	return { valid: false, issues: [issue] };
}

function cell(value: string): string {
	return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
