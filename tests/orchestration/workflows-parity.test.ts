import { describe, expect, it } from "vitest";
import workflows from "../../bundled/coding/coding/workflows.ts";
import { createDefaultProjectConfig } from "../../lib/config/defaults.ts";

function getBundledWorkflowChain(name: "tdd" | "spec-and-tdd"): string[] {
	const workflow = workflows.find((candidate) => candidate.name === name);
	expect(workflow).toBeDefined();
	return workflow?.chain.split(" -> ") ?? [];
}

function getDefaultWorkflowChain(name: "tdd" | "spec-and-tdd"): string[] {
	const workflow = createDefaultProjectConfig().workflows?.[name];
	expect(workflow).toBeDefined();
	return workflow?.chain.split(" -> ") ?? [];
}

describe("workflow parity", () => {
	for (const name of ["tdd", "spec-and-tdd"] as const) {
		it(`keeps ${name} identical between bundled and default workflow sources`, () => {
			expect(getDefaultWorkflowChain(name)).toEqual(
				getBundledWorkflowChain(name),
			);
		});
	}
});
