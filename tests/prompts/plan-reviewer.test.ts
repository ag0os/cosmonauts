import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PROMPT_PATH = new URL(
	"../../bundled/coding/prompts/plan-reviewer.md",
	import.meta.url,
);

async function readPrompt() {
	return readFile(PROMPT_PATH, "utf-8");
}

describe("plan-reviewer prompt", () => {
	it("verifies intent presence and names ratified ground in findings", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain("**Verify the Intent section.**");
		expect(content).toContain(
			"a missing or unranked Intent section is a finding",
		);
		expect(content).toContain("**Name ratified ground.**");
		expect(content).toContain("escalates rather than patches");
		expect(content).toContain("`references/deviation-protocol.md`");
	});

	it("writes findings to the next free round file and never overwrites", async () => {
		const content = await readPrompt();

		expect(content).toContain("lowest unused `review-<n>.md`");
		expect(content).toContain(
			"Treat a legacy `review.md` as round 1 when allocating",
		);
		expect(content).toContain("Never overwrite an existing review round");
	});

	it("requires a per-dimension coverage ledger with explicit none", async () => {
		const content = await readPrompt();

		expect(content).toContain("## Coverage Ledger");
		expect(content).toContain("one entry for every review dimension");
		expect(content).toContain("what was checked");
		expect(content).toContain("findings or explicit `none`");
		expect(content).toContain("status: unchecked");
	});

	it("requires live read-only probing of wrapped external tools", async () => {
		const content = await readPrompt();

		expect(content).toContain("When a plan wraps an external tool");
		expect(content).toContain("live read-only invocations");
		expect(content).toContain(
			"exit codes, output envelopes, and claimed flags",
		);
		expect(content).toContain("rather than trusting documentation");
		expect(content).toContain(
			"cannot load or execute project-controlled configuration or plugins",
		);
		expect(content).toContain("explicitly consents");
		expect(content).toContain("approved sandbox");
		expect(content).toContain(
			"record the exact config/plugin execution limitation as `unchecked`",
		);
	});

	it("defines a scope and size dimension applying the plan guidance", async () => {
		const content = await readPrompt();

		expect(content).toContain("### 11. Scope and size");
		expect(content).toContain("at most 12 behaviors per plan");
		expect(content).toContain(
			"behavior clusters and Implementation Order stages as candidate task units",
		);
		expect(content).toContain("propose split seams");
	});
});
