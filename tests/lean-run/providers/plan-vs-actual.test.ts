/**
 * Tests for planVersusActualProvider.
 * An info signal that never re-enters, built from the plan, the envelope's
 * touched list and the changed files.
 */

import { describe, expect, test } from "vitest";
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
