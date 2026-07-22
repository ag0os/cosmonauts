import { createHash, randomUUID } from "node:crypto";
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
	role: string;
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

export function resolveDriveEpisodeWorker(
	runtime: Pick<CosmonautsRuntime, "agentRegistry" | "domainContext">,
): SpawnAgentResolution | undefined {
	try {
		const resolution = resolveSpawnAgent(runtime.agentRegistry, {
			role: "coding/worker",
			domainContext: runtime.domainContext,
			agentReference: undefined,
		});
		if (resolution) return resolution;
		reportDriveEpisodeLaunchWarning(
			`worker did not resolve in domain context ${JSON.stringify(runtime.domainContext)}`,
		);
	} catch (error) {
		reportDriveEpisodeLaunchWarning(error);
	}
	return undefined;
}

export function isFrozenDriveEpisodeWorkerSource(
	episodeSource: string,
): boolean {
	const parsed = parseDriveEpisodeSource(episodeSource);
	return parsed?.agentId === "worker";
}

export function resolveFrozenDriveEpisodeWorker(
	runtime: Pick<CosmonautsRuntime, "agentRegistry" | "domainContext">,
	episodeSource: string,
): SpawnAgentResolution | undefined {
	try {
		const parsed = parseDriveEpisodeSource(episodeSource);
		if (!parsed) {
			throw new Error(
				`invalid frozen worker identity ${JSON.stringify(episodeSource)}`,
			);
		}
		const { role, agentId } = parsed;
		const reference = {
			requested: {
				role: "coding",
				agentId,
				qualifiedId: `coding/${agentId}`,
			},
			resolved: { role, agentId, qualifiedId: episodeSource },
			binding: { role: "coding", domainId: role, source: "default" as const },
		};
		const resolution = resolveSpawnAgent(runtime.agentRegistry, {
			role: reference.requested.qualifiedId,
			domainContext: runtime.domainContext,
			agentReference: reference,
		});
		if (resolution) return resolution;
		reportDriveEpisodeLaunchWarning(
			`frozen worker ${JSON.stringify(episodeSource)} is unavailable`,
		);
	} catch (error) {
		reportDriveEpisodeLaunchWarning(error);
	}
	return undefined;
}

function parseDriveEpisodeSource(
	episodeSource: string,
): ParsedDriveEpisodeSource | undefined {
	const [role, agentId, ...rest] = episodeSource.split("/");
	if (!role || !agentId || rest.length > 0) {
		return undefined;
	}
	return { role, agentId };
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
