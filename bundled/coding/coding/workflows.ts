import type { WorkflowDefinition } from "../../../lib/workflows/types.ts";

/** Default workflows for the coding domain. */
export const workflows: WorkflowDefinition[] = [
	{
		name: "plan-and-build",
		description:
			"Full pipeline: design, task creation, implementation, and review",
		chain: "planner -> task-manager -> coordinator -> quality-manager",
	},
	{
		name: "reviewed-plan-and-build",
		description:
			"Full pipeline with adversarial plan review before task creation",
		chain:
			"planner -> plan-reviewer -> planner -> task-manager -> coordinator -> quality-manager",
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
	{
		name: "tdd",
		description:
			"Test-driven development: design behaviors, Red-Green-Refactor cycle, and review",
		chain: "tdd-planner -> task-manager -> tdd-coordinator -> quality-manager",
	},
	{
		name: "plan-and-tdd",
		description:
			"Architecture-first TDD: design the structure, create tasks with ACs, then enrich with testable behaviors and Red-Green-Refactor",
		chain:
			"planner -> task-manager -> tdd-planner -> tdd-coordinator -> quality-manager",
	},
	{
		name: "spec-and-build",
		description:
			"Full pipeline with interactive requirements capture: gather spec, design, implement, and review",
		chain:
			"spec-writer -> planner -> task-manager -> coordinator -> quality-manager",
	},
	{
		name: "spec-and-tdd",
		description:
			"Full pipeline with interactive requirements capture and TDD: gather spec, design, create tasks, enrich with behaviors, and Red-Green-Refactor",
		chain:
			"spec-writer -> planner -> task-manager -> tdd-planner -> tdd-coordinator -> quality-manager",
	},
	{
		name: "adapt",
		description:
			"Adapt a feature from a reference codebase: study reference, design adaptation plan, implement, and review",
		chain:
			"adaptation-planner -> task-manager -> coordinator -> quality-manager",
	},
];

export default workflows;
