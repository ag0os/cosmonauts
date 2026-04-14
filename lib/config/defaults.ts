import type { ProjectConfig } from "./types.ts";

export function createDefaultProjectConfig(): ProjectConfig {
	return {
		skills: ["typescript", "engineering-principles"],
		workflows: {
			"plan-and-build": {
				description:
					"Full pipeline: design, create tasks, implement, and run merge-readiness quality gates",
				chain:
					"planner -> task-manager -> coordinator -> integration-verifier -> quality-manager",
			},
			implement: {
				description:
					"Create tasks from existing plan, implement, and run merge-readiness quality gates",
				chain: "task-manager -> coordinator -> quality-manager",
			},
			verify: {
				description:
					"Run lint/format checks, clean-context review, and remediation on existing changes, falling back to fixer-only remediation when no active plan exists",
				chain: "quality-manager",
			},
		},
	};
}
