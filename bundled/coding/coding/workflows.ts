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
		name: "tdd",
		description:
			"Full TDD pipeline with adversarial plan review: architecture, review, revise, behaviors, tasks, Red-Green-Refactor, and verification",
		chain:
			"planner -> plan-reviewer -> planner -> tdd-planner -> behavior-reviewer -> tdd-planner -> task-manager -> tdd-coordinator -> integration-verifier -> quality-manager",
	},
	{
		name: "spec-and-build",
		description:
			"Full pipeline with interactive spec capture and adversarial plan review",
		chain:
			"spec-writer -> planner -> plan-reviewer -> planner -> task-manager -> coordinator -> integration-verifier -> quality-manager",
	},
	{
		name: "spec-and-tdd",
		description:
			"Full TDD pipeline with interactive spec capture and adversarial plan review",
		chain:
			"spec-writer -> planner -> plan-reviewer -> planner -> tdd-planner -> behavior-reviewer -> tdd-planner -> task-manager -> tdd-coordinator -> integration-verifier -> quality-manager",
	},
	{
		name: "adapt",
		description:
			"Adapt a feature from a reference codebase: study reference, design adaptation plan, implement, and review",
		chain:
			"adaptation-planner -> task-manager -> coordinator -> integration-verifier -> quality-manager",
	},
];

export default workflows;
