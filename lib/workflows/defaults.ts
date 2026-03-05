/**
 * Built-in workflow definitions.
 */

import type { WorkflowDefinition } from "./types.ts";

export const DEFAULT_WORKFLOWS: WorkflowDefinition[] = [
	{
		name: "plan-and-build",
		description:
			"Full pipeline: design, create tasks, implement, and run merge-readiness quality gates",
		chain: "planner -> task-manager -> coordinator -> quality-manager",
	},
	{
		name: "implement",
		description:
			"Create tasks from existing plan, implement, and run merge-readiness quality gates",
		chain: "task-manager -> coordinator -> quality-manager",
	},
	{
		name: "verify",
		description:
			"Run lint/format checks, clean-context review, and remediation on existing changes",
		chain: "quality-manager",
	},
];
