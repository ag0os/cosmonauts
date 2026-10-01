import type { NamedChain } from "../../lib/chains/types.ts";

/** Named chains for the lean domain. Stages use qualified ids so they never collide with coding's roles. */
export const chains: NamedChain[] = [
	{
		name: "build",
		description:
			"Implement a plan section or a direct fix, then review the change",
		chain: "lean/builder -> lean/code-reviewer",
	},
	{
		name: "review",
		description: "Review an existing change",
		chain: "lean/code-reviewer",
	},
];

export default chains;
