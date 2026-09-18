import { readFile } from "node:fs/promises";
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
} from "./artifacts.ts";
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
	readonly reassessUnitIds: readonly string[];
	readonly carriedProfileCount: number;
	readonly reasons: Readonly<Record<string, string>>;
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
 * run. A carried profile keeps its reasoning but never its observation: if the
 * declaration's cases are not all present in the new run, the judgment does not
 * transfer and the unit goes back for assessment.
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
	for (const [surface, modules] of observations) {
		const cases = modules.get(moduleId);
		if (!cases) {
			discoveryBySurface[surface] = "not-collected";
			continue;
		}
		const states = caseNames.map((name) => cases.get(name));
		if (states.some((state) => state === undefined)) return undefined;
		discoveryBySurface[surface] = states.some((state) => state === "failed")
			? "failed"
			: toRuntimeState(states[0]);
	}
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

async function refreshMaterialInputs(
	profile: TestEvidenceProfile,
	projectRoot: string,
	predecessorEpochId: string,
	epochId: string,
): Promise<TestEvidenceProfile["materialInputs"] | undefined> {
	const refreshed: TestEvidenceProfile["materialInputs"][number][] = [];
	for (const input of profile.materialInputs) {
		if (input.inputKind !== REFRESHED_INPUT_KIND) {
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

	const predecessor = await readEpochProfiles(auditRoot, predecessorEpochId);
	const observations = await readSurfaceObservations(auditRoot, manifest);
	const queue = await readProfileWorkQueue(auditRoot);
	const observedAt = new Date().toISOString();

	const carriedUnitIds: string[] = [];
	const reassessUnitIds: string[] = [];
	const reasons: Record<string, string> = {};
	let carriedProfileCount = 0;

	for (const unit of queue.units) {
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
			const rewritten = rewriteEpochReferences(
				{ ...prior, materialInputs, runtime },
				predecessorEpochId,
				manifest.epochId,
			);
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
		carriedUnitIds.push(unit.id);
		carriedProfileCount += carried.length;
	}

	return {
		predecessorEpochId,
		carriedUnitIds,
		reassessUnitIds,
		carriedProfileCount,
		reasons,
	};
}
