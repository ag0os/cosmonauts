import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PROMPT_PATH = new URL(
	"../../bundled/coding/coding/prompts/verifier.md",
	import.meta.url,
);

async function readPrompt() {
	return readFile(PROMPT_PATH, "utf-8");
}

describe("verifier prompt", () => {
	it("defines the named-test claim shape for phase:red-verify tasks", async () => {
		const content = await readPrompt();

		expect(content).toContain(
			"When the caller provides `phase:red-verify` claims",
		);
		expect(content).toContain("- test_file: tests/path/to/file.test.ts");
		expect(content).toContain('  test_name: "descriptive test name"');
		expect(content).toContain("  expected: fails-on-assertion");
		expect(content).toContain(
			"  command: bun run test -- tests/path/to/file.test.ts",
		);
	});

	it("defines exactly five observed_outcome classes for named-test red verification", async () => {
		const content = await readPrompt();
		const outcomeBlock = content.match(
			/- Classify `observed_outcome` as exactly one of:\n((?: {2}- `[^`]+`\n)+)/,
		);

		expect(outcomeBlock?.[1]).toBeDefined();
		if (!outcomeBlock?.[1]) {
			throw new Error("Missing observed_outcome block");
		}

		const outcomes = Array.from(
			outcomeBlock[1].matchAll(/`([^`]+)`/g),
			([, outcome]) => outcome,
		);

		expect(outcomes).toEqual([
			"assertion-failure",
			"test-error",
			"not-collected",
			"compile/startup-error",
			"passed",
		]);
	});

	it("states that only assertion-failure passes and all other named-test outcomes fail", async () => {
		const content = await readPrompt();

		expect(content).toContain(
			'A named-test claim passes only when `observed_outcome === "assertion-failure"`.',
		);
		expect(content).toContain(
			"If `observed_outcome` is `test-error`, `not-collected`, `compile/startup-error`, or `passed`, the claim fails.",
		);
	});

	it("extends named-test results with outcome classification fields", async () => {
		const content = await readPrompt();
		const namedTestResult = content.match(
			/- id: C-003[\s\S]*?notes: "<optional context>"/,
		)?.[0];

		expect(namedTestResult).toContain(
			'claim: "Test \\"descriptive test name\\" in tests/path/to/file.test.ts fails on assertion"',
		);
		expect(namedTestResult).toContain("test_file: tests/path/to/file.test.ts");
		expect(namedTestResult).toContain('test_name: "descriptive test name"');
		expect(namedTestResult).toContain(
			"observed_outcome: assertion-failure | test-error | not-collected | compile/startup-error | passed",
		);
		expect(namedTestResult).toContain(
			'failure_reason: "<why the named test produced that outcome>"',
		);
		expect(content).toContain(
			"For named-test `phase:red-verify` claims, include `test_file`, `test_name`, `observed_outcome`, and `failure_reason` alongside the existing `id`, `claim`, `result`, `evidence`, and `notes` fields.",
		);
	});
});
