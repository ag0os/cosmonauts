import type { WorkflowDefinition } from "../../lib/workflows/types.ts";

/** Default workflows for the coding domain. */
export const workflows: WorkflowDefinition[] = [
	{
		name: "plan-and-build",
		description:
			"Full pipeline: design, task creation, implementation, and review",
		chain: "planner -> task-manager -> coordinator -> quality-manager",
	},
	{
		name: "implement",
		description:
			"Implementation from existing plan: task creation, build, and review",
		chain: "task-manager -> coordinator -> quality-manager",
	},
	{
		name: "verify",
		description: "Review and remediation of completed work",
		chain: "quality-manager",
	},
];

export default workflows;
