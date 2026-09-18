import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	digestMaterialInput,
	digestProfileRecord,
	type EpochManifest,
	publishCarriedProfileUnit,
	readAuditIndex,
	readCurrentEpochManifest,
	readEpochProfiles,
	readProfileWorkQueue,
	writeTextAtomic,
} from "./artifacts.ts";
import type { CensusFinding, FindingDisposition } from "./census.ts";
import type {
	RuntimeState,
	TestEvidenceProfile,
	TestSurface,
} from "./schema.ts";

/**
 * Material inputs naming the epoch's own manifest and raw outputs differ per
 * epoch by construction, so they are refreshed rather than compared. Every
 * other kind must rehash unchanged for a judgment to survive the transition
 * (`plan.md` D-013, TASK-701 AC #6).
 */
const REFRESHED_INPUT_KIND = "command";

export interface CarryForwardReport {
	readonly predecessorEpochId: string;
	readonly carriedUnitIds: readonly string[];
	/** Units the successor already held, left untouched by this run. */
	readonly retainedUnitIds: readonly string[];
	readonly reassessUnitIds: readonly string[];
	readonly carriedProfileCount: number;
	readonly carriedDeliverables: readonly string[];
	readonly reasons: Readonly<Record<string, string>>;
	readonly dispositions: DispositionCarryReport;
}

export interface DispositionCarryReport {
	/** Findings in this epoch that need an answer before the census is complete. */
	readonly answerableFindingCount: number;
	readonly carriedCount: number;
	/** Finding ids this epoch still has to answer, because no identical
	 * observation exists in the predecessor. */
	readonly unansweredFindingIds: readonly string[];
	/** Set when the successor already held its own dispositions. */
	readonly retained: boolean;
}

interface ReporterCase {
	readonly fullName?: string;
	readonly state?: string;
}

interface ReporterModule {
	readonly moduleId?: string;
	readonly cases?: readonly ReporterCase[];
}

type SurfaceObservation = ReadonlyMap<string, ReadonlyMap<string, string>>;

function toRuntimeState(state: string | undefined): RuntimeState {
	switch (state) {
		case "passed":
		case "failed":
		case "skipped":
		case "todo":
			return state;
		case "pending":
			return "collected";
		default:
			return "errored";
	}
}

async function readSurfaceObservations(
	auditRoot: string,
	manifest: EpochManifest,
): Promise<ReadonlyMap<TestSurface, SurfaceObservation>> {
	const rawDirectory = join(auditRoot, "epochs", manifest.epochId, "raw");
	const bySurface = new Map<TestSurface, Map<string, Map<string, string>>>();
	for (const definition of manifest.commandDefinitions) {
		let payload: { modules?: readonly ReporterModule[] };
		try {
			payload = JSON.parse(
				await readFile(
					join(rawDirectory, `${definition.id}.reporter.json`),
					"utf8",
				),
			) as { modules?: readonly ReporterModule[] };
		} catch {
			continue;
		}
		const surface = bySurface.get(definition.surface) ?? new Map();
		bySurface.set(definition.surface, surface);
		for (const module of payload.modules ?? []) {
			if (typeof module.moduleId !== "string") continue;
			const cases = surface.get(module.moduleId) ?? new Map<string, string>();
			surface.set(module.moduleId, cases);
			for (const testCase of module.cases ?? [])
				if (typeof testCase.fullName === "string")
					cases.set(testCase.fullName, String(testCase.state));
		}
	}
	return bySurface;
}

/**
 * Re-observes a carried declaration against the successor epoch's own suite
 * run. A carried profile keeps its reasoning but never its observation, so the
 * judgment transfers only when this epoch actually saw the declaration: at least
 * one surface must report it, and any surface that reports it must account for
 * every case.
 */
function observeRuntime(
	observations: ReadonlyMap<TestSurface, SurfaceObservation>,
	profile: TestEvidenceProfile,
	projectRoot: string,
	observedAt: string,
): TestEvidenceProfile["runtime"] | undefined {
	const moduleId = join(projectRoot, profile.source.path);
	const caseNames = profile.runtime.value.caseNames;
	const discoveryBySurface: Record<string, RuntimeState> = {};
	let observedAnywhere = false;
	for (const [surface, modules] of observations) {
		const cases = modules.get(moduleId);
		if (!cases) {
			discoveryBySurface[surface] = "not-collected";
			continue;
		}
		const states = caseNames.map((name) => cases.get(name));
		if (states.some((state) => state === undefined)) return undefined;
		observedAnywhere = true;
		discoveryBySurface[surface] = states.some((state) => state === "failed")
			? "failed"
			: toRuntimeState(states[0]);
	}
	// Every surface reporting `not-collected` is not a re-observation, it is the
	// absence of one. Carrying then stamps a fresh `observedAt` onto a judgment
	// nothing in this epoch actually saw.
	if (!observedAnywhere) return undefined;
	for (const surface of Object.keys(
		profile.runtime.value.discoveryBySurface,
	) as TestSurface[])
		if (!(surface in discoveryBySurface))
			discoveryBySurface[surface] = "not-collected";
	return {
		...profile.runtime,
		value: { ...profile.runtime.value, discoveryBySurface },
		assessor: { ...profile.runtime.assessor, observedAt },
	} as TestEvidenceProfile["runtime"];
}

// Every profile in a wave cites the same handful of epoch-scoped documents, and
// some run to megabytes. Digest them once per path instead of per profile.
const normalizedDigests = new Map<string, string | undefined>();

async function readNormalizedDigest(
	projectRoot: string,
	path: string,
	epochId: string,
): Promise<string | undefined> {
	const key = `${projectRoot}\u0000${path}\u0000${epochId}`;
	const cached = normalizedDigests.get(key);
	if (cached !== undefined || normalizedDigests.has(key)) return cached;
	let digest: string | undefined;
	try {
		digest = createHash("sha256")
			.update(
				(await readFile(join(projectRoot, path), "utf8"))
					.split(epochId)
					.join("<epoch>"),
			)
			.digest("hex");
	} catch {
		digest = undefined;
	}
	normalizedDigests.set(key, digest);
	return digest;
}

async function refreshMaterialInputs(
	profile: TestEvidenceProfile,
	projectRoot: string,
	predecessorEpochId: string,
	epochId: string,
): Promise<TestEvidenceProfile["materialInputs"] | undefined> {
	const refreshed: TestEvidenceProfile["materialInputs"][number][] = [];
	for (const input of profile.materialInputs) {
		const epochScoped = input.path.includes(predecessorEpochId);
		if (!epochScoped) {
			const current = await digestMaterialInput(projectRoot, input).catch(
				() => undefined,
			);
			if (current !== input.sha256) return undefined;
			refreshed.push(input);
			continue;
		}
		const path = input.path.split(predecessorEpochId).join(epochId);
		const sha256 = await digestMaterialInput(projectRoot, {
			...input,
			path,
		}).catch(() => undefined);
		if (sha256 === undefined) return undefined;
		// A command input is per-epoch by construction, so its digest legitimately
		// moves. Every other epoch-scoped input pins substance the judgment was
		// made against: the epoch label may be restamped, the content may not.
		if (input.inputKind !== REFRESHED_INPUT_KIND) {
			const [before, after] = await Promise.all([
				readNormalizedDigest(projectRoot, input.path, predecessorEpochId),
				readNormalizedDigest(projectRoot, path, epochId),
			]);
			if (before === undefined || before !== after) return undefined;
		}
		refreshed.push({ ...input, path, sha256 });
	}
	return refreshed;
}

function rewriteEpochReferences<T>(
	value: T,
	predecessorEpochId: string,
	epochId: string,
): T {
	if (Array.isArray(value))
		return value.map((entry) =>
			rewriteEpochReferences(entry, predecessorEpochId, epochId),
		) as unknown as T;
	if (value !== null && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(value as Record<string, unknown>))
			out[key] = rewriteEpochReferences(entry, predecessorEpochId, epochId);
		return out as T;
	}
	if (typeof value === "string")
		return value.split(predecessorEpochId).join(epochId) as unknown as T;
	return value;
}

/**
 * A carried unit is still authored by whoever judged it. The carry process
 * supplies the measurement, never the reasoning, so the shard keeps the
 * original assessor's id — the validator's ownership rule then holds without
 * the carry process claiming work it did not do.
 */
function carriedAssessorId(
	profiles: readonly TestEvidenceProfile[],
): string | undefined {
	const owners = new Set<string>();
	for (const profile of profiles)
		for (const value of agentAssessedValues(profile)) {
			const isProbeOverride = (value.evidence ?? []).some(
				(evidence) => evidence.kind === "probe-record",
			);
			if (!isProbeOverride && value.assessor.kind === "agent")
				owners.add(value.assessor.id);
		}
	return owners.size === 1 ? [...owners][0] : undefined;
}

interface AgentAssessedValue {
	readonly assessor: { readonly kind: string; readonly id: string };
	readonly evidence?: readonly { readonly kind: string }[];
}

function agentAssessedValues(
	profile: TestEvidenceProfile,
): readonly AgentAssessedValue[] {
	const dimensions = Object.values(
		profile.dimensions as unknown as Record<string, AgentAssessedValue>,
	);
	return [
		profile.role,
		profile.claim,
		profile.chain,
		...dimensions,
		profile.reasonCodes,
		profile.portfolioContributions,
		profile.disposition,
	] as unknown as readonly AgentAssessedValue[];
}

/**
 * Deliverables a successor epoch inherits when the wave did not change them.
 * Profiles cite `behavior-risk-inventory.json` as an `inventory-row` input, so a
 * successor without it can carry nothing. Dispositions are deliberately absent:
 * they answer findings whose ids are content-derived, so they do not transfer.
 */
const CARRIED_DELIVERABLES = [
	"behavior-risk-inventory.json",
	"behavior-risk-matrix.md",
	"gap-register.md",
	"calibration.md",
	"probe-definitions.json",
	"probe-queue.json",
	"probes.jsonl",
	"probes.md",
	"residual-uncertainty.md",
	"gate-recommendations.md",
] as const;

async function hasPublishedShard(
	auditRoot: string,
	epochId: string,
	unitId: string,
): Promise<boolean> {
	const directory = join(auditRoot, "epochs", epochId, "profiles");
	for (const name of [`${unitId}.ndjson`, `${unitId}.halted.ndjson`])
		try {
			await readFile(join(directory, name), "utf8");
			return true;
		} catch {
			// absent, so this unit still needs a shard
		}
	return false;
}

async function carryDeliverables(
	auditRoot: string,
	predecessorEpochId: string,
	epochId: string,
): Promise<string[]> {
	const from = join(auditRoot, "epochs", predecessorEpochId);
	const to = join(auditRoot, "epochs", epochId);
	await mkdir(to, { recursive: true });
	const carried: string[] = [];
	for (const name of CARRIED_DELIVERABLES) {
		let source: string;
		try {
			source = await readFile(join(from, name), "utf8");
		} catch {
			continue;
		}
		try {
			await readFile(join(to, name), "utf8");
			continue;
		} catch {
			// not yet present in the successor, so inherit it
		}
		// The document names the epoch it describes, so restamp that label. Its
		// substance is unchanged, which is what carried profiles pin.
		await writeTextAtomic(
			join(to, name),
			source.split(predecessorEpochId).join(epochId),
		);
		carried.push(name);
	}
	return carried;
}

/**
 * Inherits census answers whose question is byte-identical. A finding id is a
 * sha256 over the finding's kind, command and detail, so an id shared with the
 * predecessor is the same observation restated by a fresh run — the same rule
 * that lets a profile carry when its material inputs rehash unchanged. The
 * content is compared as well as the id, so the guarantee is checked here
 * rather than inferred from how ids happen to be built.
 */
async function carryDispositions(
	auditRoot: string,
	predecessorEpochId: string,
	epochId: string,
): Promise<DispositionCarryReport> {
	const current = await readCensusFindings(auditRoot, epochId);
	const answerable = current.filter((finding) => finding.basis !== "reasoned");
	const existing = await readJsonIfPresent(
		join(auditRoot, "epochs", epochId, "dispositions.json"),
	);
	if (existing !== undefined)
		return {
			answerableFindingCount: answerable.length,
			carriedCount: 0,
			unansweredFindingIds: [],
			retained: true,
		};

	const prior = await readCensusFindings(auditRoot, predecessorEpochId);
	const priorById = new Map(prior.map((finding) => [finding.id, finding]));
	const carried: FindingDisposition[] = [];
	const unanswered: string[] = [];
	for (const finding of answerable) {
		const source = priorById.get(finding.id);
		if (!source?.disposition || !sameObservation(source, finding)) {
			unanswered.push(finding.id);
			continue;
		}
		const { carriedFrom: _discard, ...judgment } = source.disposition;
		carried.push({
			...judgment,
			carriedFrom: {
				epochId: predecessorEpochId,
				dispositionDigest: digestDisposition(source.disposition),
			},
		});
	}
	if (carried.length > 0)
		await writeTextAtomic(
			join(auditRoot, "epochs", epochId, "dispositions.json"),
			`${JSON.stringify(carried, null, 2)}\n`,
		);
	return {
		answerableFindingCount: answerable.length,
		carriedCount: carried.length,
		unansweredFindingIds: unanswered,
		retained: false,
	};
}

function sameObservation(left: CensusFinding, right: CensusFinding): boolean {
	return (
		left.kind === right.kind &&
		(left.commandId ?? null) === (right.commandId ?? null) &&
		left.detail === right.detail
	);
}

function digestDisposition(disposition: FindingDisposition): string {
	const { carriedFrom: _discard, ...judgment } = disposition;
	return createHash("sha256").update(JSON.stringify(judgment)).digest("hex");
}

/**
 * An epoch without a census has no answers to give or to receive. That is a
 * real state — carry-forward also runs before the profile queue exists — so it
 * reports an empty set rather than failing. The report's counts are what make
 * a mis-ordered run visible.
 */
async function readCensusFindings(
	auditRoot: string,
	epochId: string,
): Promise<CensusFinding[]> {
	const path = join(auditRoot, "epochs", epochId, "suite-integrity.json");
	const parsed = await readJsonIfPresent(path);
	if (parsed === undefined) return [];
	const findings = (parsed as { findings?: unknown }).findings;
	if (!Array.isArray(findings)) throw new Error(`${path} is malformed`);
	return findings as CensusFinding[];
}

async function readJsonIfPresent(path: string): Promise<unknown> {
	try {
		return JSON.parse(await readFile(path, "utf8")) as unknown;
	} catch (error) {
		if (
			typeof error === "object" &&
			error !== null &&
			(error as { code?: unknown }).code === "ENOENT"
		)
			return undefined;
		throw error;
	}
}

/** Validator messages concatenate every issue; one is enough to explain a skip. */
function firstIssue(message: string): string {
	const body = message.replace(/^invalid profile unit [^:]+: /, "");
	const [first] = body.split("; ");
	return (first ?? body).replace(/^[0-9a-f]{64}: /, "");
}

export async function carryForwardProfileUnits(options: {
	readonly auditRoot: string;
	readonly projectRoot: string;
	readonly predecessorEpochId?: string;
}): Promise<CarryForwardReport> {
	const { auditRoot, projectRoot } = options;
	const manifest = await readCurrentEpochManifest(auditRoot);
	const index = await readAuditIndex(auditRoot);
	const position = index.epochIds.indexOf(manifest.epochId);
	const predecessorEpochId =
		options.predecessorEpochId ??
		(position > 0 ? index.epochIds[position - 1] : undefined);
	if (predecessorEpochId === undefined)
		throw new Error("carry-forward requires a predecessor epoch");

	const carriedDeliverables = await carryDeliverables(
		auditRoot,
		predecessorEpochId,
		manifest.epochId,
	);
	const dispositions = await carryDispositions(
		auditRoot,
		predecessorEpochId,
		manifest.epochId,
	);
	const predecessor = await readEpochProfiles(auditRoot, predecessorEpochId);
	const observations = await readSurfaceObservations(auditRoot, manifest);
	const queue = await readProfileWorkQueue(auditRoot);
	const observedAt = new Date().toISOString();

	const carriedUnitIds: string[] = [];
	const retainedUnitIds: string[] = [];
	const reassessUnitIds: string[] = [];
	const reasons: Record<string, string> = {};
	let carriedProfileCount = 0;

	for (const unit of queue.units) {
		// A shard already in the successor is either a fresh assessment or an
		// earlier carry. Either way it is newer evidence than the predecessor's,
		// so a rerun leaves it alone rather than replacing it with a copy.
		if (await hasPublishedShard(auditRoot, manifest.epochId, unit.id)) {
			retainedUnitIds.push(unit.id);
			continue;
		}
		const started = new Date();
		const carried: TestEvidenceProfile[] = [];
		let reason: string | undefined;
		for (const identity of unit.identities) {
			const prior = predecessor.get(identity.id);
			if (!prior) {
				reason = `identity ${identity.id} has no predecessor profile`;
				break;
			}
			const materialInputs = await refreshMaterialInputs(
				prior,
				projectRoot,
				predecessorEpochId,
				manifest.epochId,
			);
			if (!materialInputs) {
				reason = `identity ${identity.id} has a changed material input`;
				break;
			}
			const runtime = observeRuntime(
				observations,
				prior,
				projectRoot,
				observedAt,
			);
			if (!runtime) {
				reason = `identity ${identity.id} was not re-observed in this epoch`;
				break;
			}
			const rewritten = {
				...rewriteEpochReferences(prior, predecessorEpochId, manifest.epochId),
				materialInputs,
				// The re-observation is evidence from this epoch's run, so its
				// citations must name this epoch's reporter output. Carrying the
				// judgment while pointing at the predecessor's evidence would claim a
				// fresh observation the cited files cannot support.
				runtime: rewriteEpochReferences(
					runtime,
					predecessorEpochId,
					manifest.epochId,
				),
			};
			carried.push({
				...rewritten,
				carriedFrom: {
					epochId: predecessorEpochId,
					profileDigest: digestProfileRecord(prior),
				},
			} as TestEvidenceProfile);
		}
		if (reason !== undefined) {
			reassessUnitIds.push(unit.id);
			reasons[unit.id] = reason;
			continue;
		}
		const assessorId = carriedAssessorId(carried);
		if (assessorId === undefined) {
			reassessUnitIds.push(unit.id);
			reasons[unit.id] =
				"carried profiles do not share one assessing agent, so authorship cannot be preserved";
			continue;
		}
		const ended = new Date();
		try {
			await publishCarriedProfileUnit({
				root: auditRoot,
				projectRoot,
				unitId: unit.id,
				assessorId,
				processId: process.pid,
				processStartedAt: started.toISOString(),
				processEndedAt: ended.toISOString(),
				durationMs: ended.getTime() - started.getTime(),
				peakRssBytes: process.memoryUsage().rss,
				profiles: carried,
			});
		} catch (error) {
			// Carry-forward partitions work; it does not gate it. A unit the
			// validator refuses is simply one an agent must assess. An I/O failure
			// is not a judgment about the unit, so it stops the wave instead of
			// being recorded as work an agent should redo.
			const message = error instanceof Error ? error.message : String(error);
			if (!message.startsWith("invalid profile unit ")) throw error;
			reassessUnitIds.push(unit.id);
			reasons[unit.id] = firstIssue(message);
			continue;
		}
		carriedUnitIds.push(unit.id);
		carriedProfileCount += carried.length;
	}

	return {
		predecessorEpochId,
		carriedUnitIds,
		retainedUnitIds,
		reassessUnitIds,
		carriedProfileCount,
		carriedDeliverables,
		reasons,
		dispositions,
	};
}
