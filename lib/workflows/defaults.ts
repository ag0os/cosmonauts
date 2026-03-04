/**
 * Built-in workflow definitions.
 */

import type { WorkflowDefinition } from "./types.ts";

export const DEFAULT_WORKFLOWS: WorkflowDefinition[] = [
	{
		name: "plan-and-build",
		description: "Full pipeline: design, create tasks, implement",
		chain: "planner -> task-manager -> coordinator",
	},
	{
		name: "implement",
		description: "Create tasks from existing plan and implement",
		chain: "task-manager -> coordinator",
	},
];
