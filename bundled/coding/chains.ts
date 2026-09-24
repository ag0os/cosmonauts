import type { NamedChain } from "../../lib/chains/types.ts";

/** Default named chains for the coding domain. */
export const chains: NamedChain[] = [
	{
		name: "plan-and-build",
		description:
			"Full pipeline with adversarial plan review, implementation, and a findings report",
		chain:
			"planner -> plan-reviewer -> planner -> task-manager -> coordinator -> integration-verifier -> quality-manager",
	},
	{
		name: "implement",
		description:
			"Implementation from an existing plan, ending with a findings report",
		chain:
			"task-manager -> coordinator -> integration-verifier -> quality-manager",
	},
	{
		name: "verify",
		description: "Review existing changes and produce a findings report",
		chain: "quality-manager",
	},
	{
		name: "spec-and-build",
		description:
			"Interactive spec capture, adversarial plan review, implementation, and a findings report",
		chain:
			"spec-writer -> planner -> plan-reviewer -> planner -> task-manager -> coordinator -> integration-verifier -> quality-manager",
	},
	{
		name: "adapt",
		description:
			"Adapt a feature from a reference codebase, implement the plan, and produce a findings report",
		chain:
			"planner -> task-manager -> coordinator -> integration-verifier -> quality-manager",
	},
];

export default chains;
