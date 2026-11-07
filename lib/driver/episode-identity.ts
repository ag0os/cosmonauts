import { createHash, randomUUID } from "node:crypto";
import { validateAgentId } from "../agents/declaration.ts";
import { qualifyRole, splitRole } from "../agents/qualified-role.ts";
import {
	loadProjectConfig,
	resolveEpisodicLogConfig,
} from "../config/loader.ts";
import {
	resolveSpawnAgent,
	type SpawnAgentResolution,
} from "../orchestration/spawn-resolution.ts";
import type { CosmonautsRuntime } from "../runtime.ts";
import type { DriverRunSpec } from "./types.ts";

export type DriveEpisodeIdentity = Required<
	Pick<DriverRunSpec, "episodeAttemptId" | "episodeSource">
>;

interface ParsedDriveEpisodeSource {
	role: string | undefined;
	agentId: string;
}

export async function isDriveEpisodeCaptureEnabled(
	projectRoot: string,
): Promise<boolean> {
	try {
		return resolveEpisodicLogConfig(await loadProjectConfig(projectRoot))
			.enabled;
	} catch (error) {
		reportDriveEpisodeLaunchWarning(error);
		return false;
	}
}

/** Resolve execution independently of episode permission. Never choose a different frozen actor. */
export function resolveDriveWorker(
	runtime: Pick<
		CosmonautsRuntime,
		"agentRegistry" | "domainContext" | "workerAgent"
	>,
	frozenSource?: string,
): SpawnAgentResolution | undefined {
	const workerAgent = requireDriveWorkerAgent(runtime);
	if (!frozenSource)
		return resolveSpawnAgent(runtime.agentRegistry, {
			role: workerAgent,
			domainContext: runtime.domainContext,
		});
	const parsed = parseDriveEpisodeSource(frozenSource);
	if (!parsed || !isFrozenDriveEpisodeWorkerSource(frozenSource, workerAgent))
		return undefined;
	const definition = runtime.agentRegistry.getResolvedTarget(
		frozenSource,
		runtime.domainContext,
	);
	if (!definition) return undefined;
	if (!parsed.role) return { definition, qualifiedId: frozenSource };
	const worker = splitRole(workerAgent);
	const requestedDomain = worker.domain ?? runtime.domainContext ?? parsed.role;
	return {
		definition,
		qualifiedId: frozenSource,
		reference: {
			requested: {
				role: requestedDomain,
				agentId: worker.id,
				qualifiedId: qualifyRole(worker.id, requestedDomain),
			},
			resolved: {
				role: parsed.role,
				agentId: parsed.agentId,
				qualifiedId: frozenSource,
			},
			binding: {
				role: requestedDomain,
				domainId: parsed.role,
				source: "default",
			},
		},
	};
}

export function resolveDriveEpisodeWorker(
	runtime: Pick<
		CosmonautsRuntime,
		"agentRegistry" | "domainContext" | "workerAgent"
	>,
): SpawnAgentResolution | undefined {
	return episodeWorkerResolution(runtime);
}
function episodeWorkerResolution(
	runtime: Pick<
		CosmonautsRuntime,
		"agentRegistry" | "domainContext" | "workerAgent"
	>,
	frozenSource?: string,
): SpawnAgentResolution | undefined {
	try {
		const resolution = resolveDriveWorker(runtime, frozenSource);
		if (resolution?.definition.memory?.episodes) return resolution;
		reportDriveEpisodeLaunchWarning(
			`Declared worker ${JSON.stringify(frozenSource ?? runtime.workerAgent)} is unavailable or has no episodes grant`,
		);
	} catch (error) {
		reportDriveEpisodeLaunchWarning(error);
	}
	return undefined;
}

export function isFrozenDriveEpisodeWorkerSource(
	episodeSource: string,
	workerAgent: string,
): boolean {
	const parsed = parseDriveEpisodeSource(episodeSource);
	return parsed?.agentId === splitRole(workerAgent).id;
}

export function resolveFrozenDriveEpisodeWorker(
	runtime: Pick<
		CosmonautsRuntime,
		"agentRegistry" | "domainContext" | "workerAgent"
	>,
	episodeSource: string,
): SpawnAgentResolution | undefined {
	return episodeWorkerResolution(runtime, episodeSource);
}

function parseDriveEpisodeSource(
	episodeSource: string,
): ParsedDriveEpisodeSource | undefined {
	try {
		validateAgentId(episodeSource, "Frozen Drive source");
	} catch {
		return undefined;
	}
	const parsed = splitRole(episodeSource);
	return { role: parsed.domain, agentId: parsed.id };
}

export function mintDriveEpisodeIdentity(
	episodeSource: string,
): DriveEpisodeIdentity {
	return {
		episodeSource,
		episodeAttemptId: `attempt-${randomUUID()}`,
	};
}

const TERMINAL_RESUME_ATTEMPT_NAMESPACE =
	"cosmonauts:drive:terminal-only-resume:v1";

export function deriveDriveEpisodeAttemptId(runId: string): string {
	const digest = createHash("sha256")
		.update(TERMINAL_RESUME_ATTEMPT_NAMESPACE)
		.update("\0")
		.update(runId)
		.digest("hex");
	return `attempt-${digest}`;
}

/** Match recordEpisode's bounded-stderr posture so a large/leaky detail can't flood logs (SR-004). */
const MAX_LAUNCH_WARNING_DETAIL = 500;

export function reportDriveEpisodeLaunchWarning(reason: unknown): void {
	const raw = reason instanceof Error ? reason.message : String(reason);
	const detail =
		raw.length > MAX_LAUNCH_WARNING_DETAIL
			? `${raw.slice(0, MAX_LAUNCH_WARNING_DETAIL)}…`
			: raw;
	try {
		process.stderr.write(
			`[warning] Drive episode capture skipped: ${detail || "worker resolution failed"}.\n`,
		);
	} catch {
		// Identity capture and its warning are both non-load-bearing.
	}
}

/** Execution requires an explicitly declared worker; episode paths catch this as a nonfatal skip. */
export function requireDriveWorkerAgent(
	runtime: Pick<CosmonautsRuntime, "workerAgent">,
): string {
	if (!runtime.workerAgent)
		throw new Error("Drive requires workerAgent from the consumer runtime.");
	return runtime.workerAgent;
}
