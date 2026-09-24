import { randomUUID } from "node:crypto";
import { recordEpisode } from "../memory/episode.ts";
import { getFirstExecutableStages } from "./chain-steps.ts";
import type { ChainConfig, ChainResult } from "./types.ts";

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

async function recordChainEpisode(
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

function chainTerminalOutcome(
	success: boolean,
	aborted: boolean,
): Exclude<ChainEpisodeOutcome, "started"> {
	if (aborted) return "aborted";
	return success ? "succeeded" : "failed";
}

/** Record the same lifecycle around either chain execution strategy. */
export async function withChainEpisode(
	config: ChainConfig,
	lifecycle: ChainEpisodeLifecycle,
	execute: () => Promise<ChainResult>,
): Promise<ChainResult> {
	await recordChainEpisode(lifecycle, "started");
	try {
		const result = await execute();
		await recordChainEpisode(
			lifecycle,
			chainTerminalOutcome(result.success, config.signal?.aborted === true),
			result.errors.length > 0 ? result.errors.join("\n") : undefined,
		);
		return result;
	} catch (error: unknown) {
		await recordChainEpisode(
			lifecycle,
			"failed",
			error instanceof Error ? error.message : String(error),
		);
		throw error;
	}
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
