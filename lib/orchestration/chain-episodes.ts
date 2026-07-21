import { randomUUID } from "node:crypto";
import { recordEpisode } from "../memory/episode.ts";
import { getFirstExecutableStages } from "./chain-steps.ts";
import type { ChainConfig } from "./types.ts";

export type ChainEpisodeOutcome =
	| "started"
	| "succeeded"
	| "failed"
	| "aborted";

export interface ChainEpisodeLifecycle {
	readonly projectRoot: string;
	readonly source: string;
	readonly subjectId: string;
	readonly reportWarning: ChainConfig["reportEpisodeWarning"];
}

export function createInlineChainEpisodeLifecycle(
	config: ChainConfig,
): ChainEpisodeLifecycle {
	return createChainEpisodeLifecycle(config, `chain-${randomUUID()}`);
}

export function createDurableChainEpisodeLifecycle(
	config: ChainConfig,
	runId: string,
): ChainEpisodeLifecycle {
	return createChainEpisodeLifecycle(config, runId);
}

export async function recordChainEpisode(
	lifecycle: ChainEpisodeLifecycle,
	outcome: ChainEpisodeOutcome,
	details?: string,
): Promise<void> {
	await recordEpisode({
		projectRoot: lifecycle.projectRoot,
		event: {
			scope: "project",
			source: lifecycle.source,
			action: "chain.run",
			outcome,
			subject: { kind: "chain", id: lifecycle.subjectId },
			summary: chainEpisodeSummary(lifecycle.subjectId, outcome),
			...(details ? { details } : {}),
		},
		reportWarning: lifecycle.reportWarning,
	});
}

export function chainTerminalOutcome(
	success: boolean,
	aborted: boolean,
): Exclude<ChainEpisodeOutcome, "started"> {
	if (aborted) return "aborted";
	return success ? "succeeded" : "failed";
}

function createChainEpisodeLifecycle(
	config: ChainConfig,
	subjectId: string,
): ChainEpisodeLifecycle {
	return {
		projectRoot: config.projectRoot,
		source: resolveChainEpisodeSource(config),
		subjectId,
		reportWarning: config.reportEpisodeWarning,
	};
}

function resolveChainEpisodeSource(config: ChainConfig): string {
	const firstStage = getFirstExecutableStages(config.steps)[0];
	if (!firstStage) return "cosmonauts/chain";

	const frozenSource = firstStage.agentReference?.resolved.qualifiedId;
	if (frozenSource) return frozenSource;

	try {
		return (
			config.registry.resolveReference(firstStage.name, config.domainContext)
				?.reference.resolved.qualifiedId ?? firstStage.name
		);
	} catch {
		return firstStage.name;
	}
}

function chainEpisodeSummary(
	subjectId: string,
	outcome: ChainEpisodeOutcome,
): string {
	switch (outcome) {
		case "started":
			return `Started chain run "${subjectId}".`;
		case "succeeded":
			return `Chain run "${subjectId}" completed successfully.`;
		case "failed":
			return `Chain run "${subjectId}" failed.`;
		case "aborted":
			return `Chain run "${subjectId}" was aborted.`;
	}
}
