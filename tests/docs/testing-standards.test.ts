import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const DOC_PATH = new URL("../../docs/testing.md", import.meta.url);

describe("testing standards", () => {
	// @cosmo-behavior plan:spec-plan-intent#B-013
	it("states that planned behavior tests change only after the plan text they prove", async () => {
		const content = await readFile(DOC_PATH, "utf-8");

		expect(content).toContain("## Tests As Evidence");
		expect(content).toContain("only after the plan text it proves");
		expect(content).toContain("citing the decision that changed it");
		expect(content).toContain("without a recorded plan amendment — is drift");
		expect(content).toContain("deviation-protocol.md");
	});
});
