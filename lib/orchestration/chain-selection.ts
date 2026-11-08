import type { NamedChain } from "../chains/types.ts";
import { parseChain } from "./chain-parser.ts";
import type { ChainStep } from "./types.ts";

/** The host collection, never spelling, decides whether a name declares a chain. */
export function selectChain(
	input: string,
	chains: readonly NamedChain[],
	defaultEpisodes = false,
): { steps: ChainStep[]; episodes: boolean } {
	const declared = chains.find((chain) => chain.name === input);
	if (
		declared &&
		(typeof declared.chain === "string") === Array.isArray(declared.stages)
	)
		throw new Error(
			`Chain "${declared.name}" requires exactly one of chain or stages.`,
		);
	const steps = declared?.stages
		? structuredCloneStages(declared.stages)
		: parseChain(declared?.chain ?? input);
	return { steps, episodes: declared?.episodes ?? defaultEpisodes };
}
function structuredCloneStages(steps: readonly ChainStep[]): ChainStep[] {
	return steps.map((step) =>
		"kind" in step
			? {
					...step,
					stages: step.stages.map((stage) => ({
						...stage,
					})) as typeof step.stages,
				}
			: { ...step },
	);
}
