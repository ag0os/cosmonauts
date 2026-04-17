import { describe, expect, it } from "vitest";
import workflows from "../../bundled/coding/coding/workflows.ts";

function getWorkflowChain(name: string): string {
	const workflow = workflows.find((candidate) => candidate.name === name);
	expect(workflow).toBeDefined();
	return workflow?.chain ?? "";
}

describe("coding domain workflows", () => {
	it("places integration-verifier immediately before quality-manager in every plan-driven build workflow", () => {
		for (const name of [
			"plan-and-build",
			"reviewed-plan-and-build",
			"panel-reviewed-plan-and-build",
			"implement",
			"tdd",
			"reviewed-tdd",
			"plan-and-tdd",
			"spec-and-build",
			"spec-and-tdd",
			"reviewed-spec-and-tdd",
			"adapt",
		]) {
			const stages = getWorkflowChain(name).split(" -> ");
			const verifierIndex = stages.indexOf("integration-verifier");

			expect(verifierIndex).toBeGreaterThan(-1);
			expect(stages[verifierIndex + 1]).toBe("quality-manager");
			expect(
				stages.filter((stage) => stage === "integration-verifier"),
			).toHaveLength(1);
		}
	});

	it("keeps verify as the only workflow without integration-verifier", () => {
		for (const name of ["verify"]) {
			expect(getWorkflowChain(name)).not.toContain("integration-verifier");
		}
	});

	it("documents the planless remediation fallback on verify", () => {
		const verify = workflows.find((candidate) => candidate.name === "verify");
		expect(verify?.description).toContain("fixer-only remediation");
		expect(verify?.chain).toBe("quality-manager");
	});

	it("orders tdd-planner before task-manager in every TDD workflow that contains both", () => {
		for (const name of [
			"tdd",
			"reviewed-tdd",
			"plan-and-tdd",
			"spec-and-tdd",
			"reviewed-spec-and-tdd",
		]) {
			const stages = getWorkflowChain(name).split(" -> ");
			const tddPlannerIndex = stages.indexOf("tdd-planner");
			const taskManagerIndex = stages.indexOf("task-manager");

			if (tddPlannerIndex !== -1 && taskManagerIndex !== -1) {
				expect(tddPlannerIndex).toBeLessThan(taskManagerIndex);
			} else {
				expect(tddPlannerIndex).toBeGreaterThan(-1);
				expect(taskManagerIndex).toBeGreaterThan(-1);
			}
		}
	});
});
