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
			"implement",
			"spec-and-build",
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

	it("keeps the adversarial plan-review loop before task creation in design workflows", () => {
		for (const name of ["plan-and-build", "spec-and-build"]) {
			const stages = getWorkflowChain(name).split(" -> ");
			const reviewerIndex = stages.indexOf("plan-reviewer");

			expect(reviewerIndex).toBeGreaterThan(0);
			expect(stages.slice(reviewerIndex - 1, reviewerIndex + 3)).toEqual([
				"planner",
				"plan-reviewer",
				"planner",
				"task-manager",
			]);
			expect(stages.filter((stage) => stage === "plan-reviewer")).toHaveLength(
				1,
			);
		}
	});

	it("uses a single planner adaptation pass for the adapt workflow", () => {
		const stages = getWorkflowChain("adapt").split(" -> ");

		expect(stages).toEqual([
			"planner",
			"task-manager",
			"coordinator",
			"integration-verifier",
			"quality-manager",
		]);
	});

	it("no longer exposes tdd or spec-and-tdd workflows", () => {
		const names = workflows.map((workflow) => workflow.name);
		expect(names).not.toContain("tdd");
		expect(names).not.toContain("spec-and-tdd");
	});
});
