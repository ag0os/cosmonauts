import type { AgentRegistry } from "../../lib/agents/resolver.ts";
import { normalizeChain } from "../../lib/orchestration/chain-normalization.ts";
import { parseChain } from "../../lib/orchestration/chain-parser.ts";
import type { ChainAdapter } from "../../lib/orchestration/types.ts";
import { consumerChainAdapter } from "../fixtures/library-consumer/policies.ts";

/** Retained orchestration fixtures explicitly select synthetic consumer policy. */
export function withConsumerChain<T extends object>(
	options: T,
): T & { chainAdapter: ChainAdapter; episodes: boolean } {
	return { chainAdapter: consumerChainAdapter, episodes: true, ...options };
}

export function parseConsumerChain(
	expression: string,
	registry: AgentRegistry,
	domainContext?: string,
	requesterDomain = domainContext,
): import("../../lib/orchestration/types.ts").ChainStep[] {
	const normalized = normalizeChain(
		withConsumerChain({
			steps: parseChain(expression),
			registry,
			domainContext,
			requesterDomain,
			projectRoot: "/tmp",
		}),
	);
	if (!normalized.ok)
		throw new Error(normalized.errors.map((error) => error.message).join("\n"));
	const declaration = (
		stage: import("../../lib/orchestration/types.ts").ChainStage,
	) => ({
		name: stage.name,
		loop: stage.loop,
		...(stage.agentReference ? { agentReference: stage.agentReference } : {}),
	});
	return normalized.stages.map((step) =>
		"kind" in step
			? { ...step, stages: step.stages.map(declaration) as typeof step.stages }
			: declaration(step),
	);
}
