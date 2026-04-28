import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PROMPT_PATH = new URL(
	"../../bundled/coding/coding/prompts/task-manager.md",
	import.meta.url,
);

async function readPrompt() {
	return readFile(PROMPT_PATH, "utf-8");
}

describe("task-manager prompt", () => {
	it("detects TDD plans by ## Behaviors and preserves the non-TDD path", async () => {
		const content = await readPrompt();

		expect(content).toContain(
			"If the approved plan contains a `## Behaviors` section, treat it as a TDD plan and apply the TDD expansion rules below.",
		);
		expect(content).toContain(
			"If the plan does not contain `## Behaviors`, do not use the TDD expansion.",
		);
		expect(content).toContain(
			"Follow the normal single-task-per-scope-item decomposition for the plan's scope items.",
		);
	});

	it("expands each behavior into four ordered phase tasks with captured-ID dependencies", async () => {
		const content = await readPrompt();
		const expectedPhaseOrder = [
			"1. `<base>-red` -- labels include `phase:red`, no dependencies. Capture the returned task ID as `id_red`.",
			"  2. `<base>-red-verify` -- labels include `phase:red-verify`, `dependencies: [id_red]`. Capture the returned task ID as `id_red_verify`.",
			"  3. `<base>-green` -- labels include `phase:green`, `dependencies: [id_red_verify]`. Capture the returned task ID as `id_green`.",
			"  4. `<base>-refactor` -- labels include `phase:refactor`, `dependencies: [id_green]`.",
		].join("\n");

		expect(content).toContain(expectedPhaseOrder);
		expect(content).toContain(
			"Wire dependencies only from the captured `task_create` IDs.",
		);
		expect(content).toContain(
			"Never use task titles as dependencies, and never create forward references.",
		);
	});

	it("replaces parent behavior tasks and defines the phase content split", async () => {
		const content = await readPrompt();

		expect(content).toContain(
			"Do not create a parent behavior task. The four phase tasks replace it entirely.",
		);
		expect(content).toContain(
			"`<base>-red` carries the behavior statement and a `## Test Targets` section describing the tests to author.",
		);
		expect(content).toContain(
			"`<base>-red-verify` carries a `## Test Targets` section plus one failure claim per test target using the verifier named-test claim shape.",
		);
		expect(content).toContain(
			"`<base>-green` carries `## Test Targets` and `## Implementation Pointers`, and states that the listed targets must now pass.",
		);
		expect(content).toContain(
			"`<base>-refactor` carries the green target list that must remain passing, plus both `## Test Targets` and `## Implementation Pointers`.",
		);
	});

	it("requires the expected file-set sections on each phase task", async () => {
		const content = await readPrompt();

		expect(content).toContain(
			"`-red` and `-red-verify` must include `## Test Targets`.",
		);
		expect(content).toContain(
			"`-green` and `-refactor` must include both `## Test Targets` and `## Implementation Pointers`.",
		);
	});
});
