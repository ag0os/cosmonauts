import { randomUUID } from "node:crypto";
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

export function resolveFrozenDriveEpisodeWorker(
	runtime: Pick<CosmonautsRuntime, "agentRegistry" | "domainContext">,
	episodeSource: string,
): SpawnAgentResolution | undefined {
	try {
		const [role, agentId, ...rest] = episodeSource.split("/");
		if (!role || !agentId || rest.length > 0) {
			throw new Error(
				`invalid frozen worker identity ${JSON.stringify(episodeSource)}`,
			);
		}
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

export function mintDriveEpisodeIdentity(
	episodeSource: string,
): DriveEpisodeIdentity {
	return {
		episodeSource,
		episodeAttemptId: `attempt-${randomUUID()}`,
	};
}

export function reportDriveEpisodeLaunchWarning(reason: unknown): void {
	const detail = reason instanceof Error ? reason.message : String(reason);
	try {
		process.stderr.write(
			`[warning] Drive episode capture skipped: ${detail || "worker resolution failed"}.\n`,
		);
	} catch {
		// Identity capture and its warning are both non-load-bearing.
	}
}
