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
			"If there is no unique active plan slug, write no repository file and return a skipped summary.",
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
});
