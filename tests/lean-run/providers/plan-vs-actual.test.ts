/**
 * Tests for planVersusActualProvider.
 * An info signal that never re-enters, built from the plan, the envelope's
 * touched list and the changed files.
 */

import { describe, expect, test } from "vitest";
import { parsePlan } from "../../../lib/lean-run/plan.ts";
import { planVersusActualProvider } from "../../../lib/lean-run/providers/plan-vs-actual.ts";
import { stubContext } from "./context.ts";

describe("planVersusActualProvider", () => {
	test("reports the three sets as an info signal that does not re-enter", async () => {
		const base = stubContext();
		const signal = await planVersusActualProvider.run(
			stubContext({
				plan: { ...base.plan, touches: ["`lib/a.ts` — reason", "lib/b.ts"] },
				envelope: { outcome: "done", touched: ["lib/a.ts"] },
				changedFiles: ["lib/a.ts", "lib/extra.ts"],
			}),
		);
		expect(signal).toEqual({
			kind: "plan-vs-actual",
			status: "info",
			summary: "Plan versus actual: 1 planned, 1 unplanned, 1 untouched.",
			data: {
				planned: ["lib/a.ts"],
				unplanned: ["lib/extra.ts"],
				untouched: ["lib/b.ts"],
			},
			reenter: false,
		});
	});

	test("says a direct request has no plan instead of calling every file unplanned", async () => {
		const base = stubContext();
		const signal = await planVersusActualProvider.run(
			stubContext({
				tier: "direct",
				plan: { ...base.plan, touches: ["lib/a.ts"] },
				envelope: { outcome: "done", touched: ["lib/a.ts"] },
				changedFiles: ["lib/a.ts", "tests/a.test.ts"],
			}),
		);
		expect(signal).toEqual({
			kind: "plan-vs-actual",
			status: "info",
			summary: "Plan versus actual: direct tier: no plan; 2 changed.",
			data: {
				planned: [],
				unplanned: [],
				untouched: [],
				changed: ["lib/a.ts", "tests/a.test.ts"],
			},
			reenter: false,
		});
	});

	test("compares a review run's files against the plan it came with", async () => {
		const base = stubContext();
		const signal = await planVersusActualProvider.run(
			stubContext({
				tier: "plan",
				plan: { ...base.plan, touches: ["lib/a.ts"] },
				changedFiles: ["lib/a.ts"],
			}),
		);
		expect(signal.summary).toBe(
			"Plan versus actual: 1 planned, 0 unplanned, 0 untouched.",
		);
	});

	test("treats a missing envelope touched list as empty", async () => {
		const signal = await planVersusActualProvider.run(
			stubContext({ changedFiles: ["lib/a.ts"] }),
		);
		expect(signal.data).toEqual({
			planned: [],
			unplanned: ["lib/a.ts"],
			untouched: [],
		});
	});
});

describe("planVersusActualProvider reading the plan text", () => {
	function runPlan(markdown: string, changedFiles: string[]) {
		return planVersusActualProvider.run(
			stubContext({
				plan: parsePlan(markdown),
				envelope: { outcome: "done" },
				changedFiles,
			}),
		);
	}

	test("counts a changed file named only in Reuses as unplanned", async () => {
		const signal = await runPlan(
			"# P\n\n## Touches\n- `cli/x.ts`\n\n## Reuses\n- `lib/y.ts`\n",
			["cli/x.ts", "lib/y.ts"],
		);
		expect(signal.data).toEqual({
			planned: ["cli/x.ts"],
			unplanned: ["lib/y.ts"],
			untouched: [],
		});
	});

	test.each([
		"Risks",
		"Behaviors",
		"Contract",
		"Notes",
	])("counts a changed file named only in %s as unplanned", async (section) => {
		const signal = await runPlan(
			`# P\n\n## Touches\n- \`cli/x.ts\`\n\n## ${section}\n- \`lib/y.ts\`\n`,
			["cli/x.ts", "lib/y.ts"],
		);
		expect(signal.data).toEqual({
			planned: ["cli/x.ts"],
			unplanned: ["lib/y.ts"],
			untouched: [],
		});
	});

	test("never lists a path named only in Approach as untouched", async () => {
		const signal = await runPlan(
			"# P\n\n## Approach\nRead `lib/z.ts` first.\n\n## Touches\n- `cli/x.ts`\n",
			["cli/x.ts"],
		);
		expect(signal.data).toEqual({
			planned: ["cli/x.ts"],
			unplanned: [],
			untouched: [],
		});
	});

	test("does not let a directory or glob named in Approach cover the files under it", async () => {
		const signal = await runPlan(
			"# P\n\n## Approach\nWork in `lib/dir/` and `tests/*.test.ts`.\n\n## Touches\n- `cli/x.ts`\n",
			["cli/x.ts", "lib/dir/a.ts", "tests/a.test.ts"],
		);
		expect(signal.data).toEqual({
			planned: ["cli/x.ts"],
			unplanned: ["lib/dir/a.ts", "tests/a.test.ts"],
			untouched: [],
		});
	});

	test("keeps a changed file unplanned when Approach names it and Reuses lists it", async () => {
		const signal = await runPlan(
			"# P\n\n## Approach\nDo not touch `lib/run.ts`.\n\n## Touches\n- `cli/x.ts`\n\n## Reuses\n- `lib/run.ts`\n",
			["cli/x.ts", "lib/run.ts"],
		);
		expect(signal.data).toEqual({
			planned: ["cli/x.ts"],
			unplanned: ["lib/run.ts"],
			untouched: [],
		});
	});

	test("keeps a Touches path planned when Reuses names it too", async () => {
		const signal = await runPlan(
			"# P\n\n## Touches\n- `cli/x.ts`\n\n## Reuses\n- `cli/x.ts`\n",
			["cli/x.ts"],
		);
		expect(signal.data).toEqual({
			planned: ["cli/x.ts"],
			unplanned: [],
			untouched: [],
		});
	});

	test("counts a changed file named in backticks in Approach as planned", async () => {
		const signal = await runPlan(
			"# P\n\n## Approach\nKeep notes in `missions/lean/x/notes.md`:\n\n## Touches\n- `cli/x.ts`\n",
			["cli/x.ts", "missions/lean/x/notes.md"],
		);
		expect(signal).toEqual({
			kind: "plan-vs-actual",
			status: "info",
			summary: "Plan versus actual: 2 planned, 0 unplanned, 0 untouched.",
			data: {
				planned: ["cli/x.ts", "missions/lean/x/notes.md"],
				unplanned: [],
				untouched: [],
			},
			reenter: false,
		});
	});

	test("counts a changed file named bare in Approach, with a directory and an extension, as planned", async () => {
		const signal = await runPlan(
			"# P\n\n## Approach\nKeep notes in missions/lean/x/notes.md.\n\n## Touches\n- `cli/x.ts`\n",
			["cli/x.ts", "missions/lean/x/notes.md"],
		);
		expect(signal.data).toEqual({
			planned: ["cli/x.ts", "missions/lean/x/notes.md"],
			unplanned: [],
			untouched: [],
		});
	});

	test("reads an Approach path with ./ or a :line suffix as the file", async () => {
		const signal = await runPlan(
			"# P\n\n## Approach\nMirror `./lib/a.ts` and `lib/b.ts:12-30`.\n\n## Touches\n- `cli/x.ts`\n",
			["cli/x.ts", "lib/a.ts", "lib/b.ts"],
		);
		expect(signal.data).toEqual({
			planned: ["cli/x.ts", "lib/a.ts", "lib/b.ts"],
			unplanned: [],
			untouched: [],
		});
	});
});
