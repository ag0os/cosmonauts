import type { WorkflowDefinition } from "../../../lib/workflows/types.ts";

/** Default workflows for the coding domain. */
export const workflows: WorkflowDefinition[] = [
	{
		name: "plan-and-build",
		description:
			"Full pipeline with adversarial plan review: design, review, revise, task creation, implementation, and verification",
		chain:
			"planner -> plan-reviewer -> planner -> task-manager -> coordinator -> integration-verifier -> quality-manager",
	},
	{
		name: "implement",
		description:
			"Implementation from existing plan: task creation, build, and verification",
		chain:
			"task-manager -> coordinator -> integration-verifier -> quality-manager",
	},
	{
		name: "verify",
		description:
			"Review and remediate existing changes, falling back to fixer-only remediation when no active plan exists",
		chain: "quality-manager",
	},
	{
		name: "spec-and-build",
		description:
			"Full pipeline with interactive spec capture and adversarial plan review",
		chain:
			"spec-writer -> planner -> plan-reviewer -> planner -> task-manager -> coordinator -> integration-verifier -> quality-manager",
	},
	{
		name: "adapt",
		description:
			"Adapt a feature from a reference codebase: the planner studies the reference codebase path and designs an adaptation plan, then implement and review",
		chain:
			"planner -> task-manager -> coordinator -> integration-verifier -> quality-manager",
	},
];

export default workflows;
