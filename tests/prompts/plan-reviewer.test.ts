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
	// @cosmo-behavior plan:spec-plan-intent#B-011
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

	// @cosmo-behavior plan:artifact-format-redesign#B-016
	it("reviews full plans against the canonical work artifact contract", async () => {
		const content = await readPrompt();

		expect(content).toContain(
			"For non-trivial planned feature/refactor reviews, load `/skill:work-artifacts`",
		);
		expect(content).toContain("`references/workflow-tiers.md`");
		expect(content).toContain("`references/plan-format.md`");
		expect(content).toContain("`references/architecture-format.md`");
		expect(content).toContain("`references/behavior-spine.md`");
		expect(content).toContain("`references/gate-contracts.md`");
		expect(content).toContain("behavior IDs");
		expect(content).toContain("`@cosmo-behavior plan:<slug>#B-###` markers");
		expect(content).toContain("source `AC-###` links");
		expect(content).toContain("seams");
		expect(content).toContain("named tests");
		expect(content).toContain("design is derived from the behavior spine");
		expect(content).toContain("architecture record is useful");
		expect(content).toContain("`## Architecture Context`");
		expect(content).toContain("ordered abstract gate ladder");
		expect(content).toContain("without concrete tool-name or command columns");
		expect(content).toContain(
			"Do not require artifact-contract findings for direct fixes, tactical bugfixes, or work where the artifact contract is not in scope.",
		);
		expect(content).not.toMatch(/\b(vitest|biome|fallow|tsc)\b/i);
	});

	// @cosmo-behavior plan:planning-system-hardening#B-009
	it("writes findings to the next free round file and never overwrites", async () => {
		const content = await readPrompt();

		expect(content).toContain("lowest unused `review-<n>.md`");
		expect(content).toContain(
			"Treat a legacy `review.md` as round 1 when allocating",
		);
		expect(content).toContain("Never overwrite an existing review round");
	});

	// @cosmo-behavior plan:planning-system-hardening#B-006
	it("requires a per-dimension coverage ledger with explicit none", async () => {
		const content = await readPrompt();

		expect(content).toContain("## Coverage Ledger");
		expect(content).toContain("one entry for every review dimension");
		expect(content).toContain("what was checked");
		expect(content).toContain("findings or explicit `none`");
		expect(content).toContain("status: unchecked");
	});

	// @cosmo-behavior plan:planning-system-hardening#B-007
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

	// @cosmo-behavior plan:planning-system-hardening#B-008
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
