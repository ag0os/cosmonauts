import type { NamedChain } from "../../lib/chains/types.ts";

/**
 * Named chains for the lean domain. Builds have no chain: the `lean_build`
 * tool is their only path, so host verification and the review loop always
 * run (ruling W3-OD-1). Stages use qualified ids so they never collide with
 * coding's roles.
 */
export const chains: NamedChain[] = [
	{
		name: "review",
		description: "Review an existing change",
		chain: "lean/code-reviewer",
	},
];

export default chains;
