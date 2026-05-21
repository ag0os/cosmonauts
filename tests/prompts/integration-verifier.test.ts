import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PROMPT_PATH = new URL(
	"../../bundled/coding/coding/prompts/integration-verifier.md",
	import.meta.url,
);

describe("integration-verifier prompt", () => {
	it("defines a no-slug skipped path without inventing a report location", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain(
			"otherwise you write no repository file and return a skipped summary",
		);
		expect(content).toContain(
			"If zero distinct plan labels are present, do not write a report file; return a skipped summary.",
		);
		expect(content).toContain(
			"If multiple distinct plan labels are present, do not write a report file; return a skipped summary.",
		);
		expect(content).toContain("the report path is `none`");
		expect(content).toContain(
			"If no unique slug exists, do not write any repository file.",
		);
	});

	// @cosmo-behavior plan:artifact-format-redesign#B-019
	it("audits architecture context boundary model behavior seams and abstract gate rows when declared", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain("`## Architecture Context`");
		expect(content).toContain("linked `missions/architecture/<slug>.md`");
		expect(content).toContain("`## Boundary Model`");
		expect(content).toContain("behavior seams");
		expect(content).toContain("abstract Quality Contract rows");
		expect(content).toContain(
			"Treat only declared architecture context, linked records, boundary rules, behavior seams, and gate rows as contracts.",
		);
		expect(content).toContain("Do not infer missing boundaries");
		expect(content).toContain("Gate kind");
		expect(content).toContain("Tier");
		expect(content).toContain("Binding state");
	});
});
