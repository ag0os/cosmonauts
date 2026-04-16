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

	it("orders plan-and-tdd as planner -> tdd-planner -> task-manager -> tdd-coordinator", () => {
		const stages = getWorkflowChain("plan-and-tdd").split(" -> ");
		expect(stages[0]).toBe("planner");
		expect(stages[1]).toBe("tdd-planner");
		expect(stages[2]).toBe("task-manager");
		expect(stages[3]).toBe("tdd-coordinator");
	});
});
