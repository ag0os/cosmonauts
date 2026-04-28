import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PROMPT_PATH = new URL(
	"../../bundled/coding/coding/prompts/tdd-coordinator.md",
	import.meta.url,
);

async function readPrompt() {
	return readFile(PROMPT_PATH, "utf-8");
}

describe("tdd-coordinator prompt", () => {
	it("defines the invariant phase-to-agent map and blocks unknown phases", async () => {
		const content = await readPrompt();

		expect(content).toContain("- `phase:red` -> `test-writer`");
		expect(content).toContain("- `phase:red-verify` -> `verifier`");
		expect(content).toContain("- `phase:green` -> `implementer`");
		expect(content).toContain("- `phase:refactor` -> `refactorer`");
		expect(content).toContain(
			"If a task is missing a `phase:*` label or uses an unknown one, call `task_edit` to set it to `Blocked` and record the problem in `implementationNotes`.",
		);
		expect(content).toContain("Do not guess.");
	});

	it("computes readiness manually from scoped To Do tasks and dependency status", async () => {
		const content = await readPrompt();

		expect(content).toContain("List the scoped `To Do` phase tasks manually.");
		expect(content).toContain(
			"Resolve every dependency ID in `dependencies` with `task_view`.",
		);
		expect(content).toContain(
			"Treat the candidate as ready only when every dependency task has status `Done`.",
		);
		expect(content).toContain(
			'MUST NOT use `task_list(hasNoDependencies: true)` or `task_list(status: "To Do", hasNoDependencies: true)` for phase-task readiness.',
		);
		expect(content).toContain(
			"That helper only returns tasks with empty dependency arrays, so it can never surface ready `-red-verify`, `-green`, or `-refactor` tasks.",
		);
	});

	it("derives file sets from task sections and sequences overlapping ready work", async () => {
		const content = await readPrompt();

		expect(content).toContain(
			"derive a conservative file set from all `file:` entries in `## Test Targets` and `## Implementation Pointers`.",
		);
		expect(content).toContain(
			'- `## Test Targets` bullets: `- file: <path> | test: "descriptive test name"`',
		);
		expect(content).toContain(
			"- `## Implementation Pointers` bullets: `- file: <path> | reason: <why this file is touched>`",
		);
		expect(content).toContain(
			"If two ready tasks touch overlapping files, sequence them even when their dependency checks passed.",
		);
		expect(content).toContain(
			"Spawn only a non-conflicting wave; defer overlapping tasks until the earlier task completes.",
		);
	});

	it("fails closed on parse errors by blocking malformed phase tasks", async () => {
		const content = await readPrompt();

		expect(content).toContain(
			"If a required section is missing, set the task to `Blocked` with `implementationNotes: file-set parse failed: missing <section>`.",
		);
		expect(content).toContain(
			"If a bullet is malformed, set the task to `Blocked` with `implementationNotes: file-set parse failed: malformed bullet in <section>`.",
		);
		expect(content).toContain(
			"If parsing yields an empty file set, set the task to `Blocked` with `implementationNotes: file-set parse failed: empty file set`.",
		);
		expect(content).toContain(
			"Do not spawn malformed tasks, and do not leave them in `To Do`.",
		);
	});

	it("removes the old marker-driven state machine instructions", async () => {
		const content = await readPrompt();

		expect(content).not.toContain("RED-VERIFIED:");
		expect(content).not.toContain("select_next_phase");
		expect(content).not.toContain(
			"Check `implementationNotes` for `RED complete:`",
		);
		expect(content).not.toContain(
			'Call `task_list` with `status: "To Do"` and `hasNoDependencies: true` to find unblocked tasks.',
		);
	});
});
