/**
 * Built-in workflow definitions.
 *
 * These provide sensible defaults so that `--workflow plan-and-build` (and
 * friends) work out-of-the-box on freshly initialized projects — no
 * `.cosmonauts/config.json` required.  Project-level config can still
 * override or extend these via the normal merge in `loader.ts`.
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
