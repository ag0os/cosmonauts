import type { ProjectConfig } from "./types.ts";

/**
 * Default project config written by `cosmonauts scaffold missions`.
 *
 * Intentionally omits the `skills` allowlist: when absent, session setup falls
 * back to each agent's declared skills rather than intersecting with a project
 * filter. An explicit `skills` list is an opt-in way to restrict further — not
 * a necessary base case.
 *
 * Workflows are synced to the current coding-domain defaults so users see them
 * in their config and can customize. Keep this table in lockstep with
 * `bundled/coding/coding/workflows.ts`.
 */
export function createDefaultProjectConfig(): ProjectConfig {
	return {
		workflows: {
			"plan-and-build": {
				description:
					"Full pipeline with adversarial plan review: design, review, revise, task creation, implementation, and verification",
				chain:
					"planner -> plan-reviewer -> planner -> task-manager -> coordinator -> integration-verifier -> quality-manager",
			},
			implement: {
				description:
					"Create tasks from existing plan, implement, and run merge-readiness quality gates",
				chain:
					"task-manager -> coordinator -> integration-verifier -> quality-manager",
			},
			verify: {
				description:
					"Run lint/format checks, clean-context review, and remediation on existing changes, falling back to fixer-only remediation when no active plan exists",
				chain: "quality-manager",
			},
			tdd: {
				description:
					"Full TDD pipeline with adversarial plan review: architecture, review, revise, behaviors, tasks, Red-Green-Refactor, and verification",
				chain:
					"planner -> plan-reviewer -> planner -> tdd-planner -> behavior-reviewer -> tdd-planner -> task-manager -> tdd-coordinator -> integration-verifier -> quality-manager",
			},
			"spec-and-build": {
				description:
					"Full pipeline with interactive spec capture and adversarial plan review",
				chain:
					"spec-writer -> planner -> plan-reviewer -> planner -> task-manager -> coordinator -> integration-verifier -> quality-manager",
			},
			"spec-and-tdd": {
				description:
					"Full TDD pipeline with interactive spec capture and adversarial plan review",
				chain:
					"spec-writer -> planner -> plan-reviewer -> planner -> tdd-planner -> behavior-reviewer -> tdd-planner -> task-manager -> tdd-coordinator -> integration-verifier -> quality-manager",
			},
			adapt: {
				description:
					"Adapt a feature from a reference codebase: study reference, design adaptation plan, implement, and review",
				chain:
					"adaptation-planner -> task-manager -> coordinator -> integration-verifier -> quality-manager",
			},
		},
	};
}
