/**
 * Tests for planVersusActual and touchesPath.
 * Covers the three sets, directory and glob entries, the envelope/diff union,
 * list markers, and path normalization.
 */

import { describe, expect, test } from "vitest";
import {
	planVersusActual,
	touchesPath,
} from "../../../lib/lean-run/graph/plan-vs-actual.ts";

describe("planVersusActual", () => {
	test("splits actual files into planned and unplanned and lists untouched entries", () => {
		expect(
			planVersusActual({
				plan: { touches: ["lib/a.ts", "lib/b.ts"] },
				touched: ["lib/a.ts"],
				diffFiles: ["lib/a.ts", "lib/extra.ts"],
			}),
		).toEqual({
			planned: ["lib/a.ts"],
			unplanned: ["lib/extra.ts"],
			untouched: ["lib/b.ts"],
		});
	});

	test("treats actual as the union of envelope touched and the diff", () => {
		const result = planVersusActual({
			plan: { touches: ["lib/a.ts", "lib/b.ts"] },
			touched: ["lib/a.ts"],
			diffFiles: ["lib/b.ts"],
		});
		expect(result.planned).toEqual(["lib/a.ts", "lib/b.ts"]);
		expect(result.untouched).toEqual([]);
	});

	test("matches files beneath a directory entry", () => {
		expect(
			planVersusActual({
				plan: { touches: ["lib/lean-run/graph/", "lib/other"] },
				touched: [],
				diffFiles: ["lib/lean-run/graph/mermaid.ts", "lib/lean-run/types.ts"],
			}),
		).toEqual({
			planned: ["lib/lean-run/graph/mermaid.ts"],
			unplanned: ["lib/lean-run/types.ts"],
			untouched: ["lib/other"],
		});
	});

	test("does not match a sibling that only shares a name prefix", () => {
		const result = planVersusActual({
			plan: { touches: ["lib/lean"] },
			touched: [],
			diffFiles: ["lib/lean-run/types.ts"],
		});
		expect(result.unplanned).toEqual(["lib/lean-run/types.ts"]);
	});

	test("normalizes ./ prefixes, backslashes and duplicates", () => {
		expect(
			planVersusActual({
				plan: { touches: ["./lib/a.ts"] },
				touched: ["lib\\a.ts", "./lib/x.ts"],
				diffFiles: ["lib/a.ts", "lib/x.ts"],
			}),
		).toEqual({
			planned: ["lib/a.ts"],
			unplanned: ["lib/x.ts"],
			untouched: [],
		});
	});

	test("reads the path out of Touches lines that carry a reason", () => {
		const result = planVersusActual({
			plan: {
				touches: ["`lib/a.ts` — add the walker", "lib/b.ts: new export"],
			},
			touched: ["lib/a.ts", "lib/b.ts"],
			diffFiles: [],
		});
		expect(result.planned).toEqual(["lib/a.ts", "lib/b.ts"]);
	});

	test("matches files against a ** glob entry", () => {
		expect(
			planVersusActual({
				plan: { touches: ["lib/lean-run/**"] },
				touched: [],
				diffFiles: ["lib/lean-run/graph/x.ts", "lib/other.ts"],
			}),
		).toEqual({
			planned: ["lib/lean-run/graph/x.ts"],
			unplanned: ["lib/other.ts"],
			untouched: [],
		});
	});

	test("keeps a * glob entry within one directory", () => {
		const result = planVersusActual({
			plan: { touches: ["tests/lean-run/*.test.ts"] },
			touched: [],
			diffFiles: ["tests/lean-run/a.test.ts", "tests/lean-run/graph/b.test.ts"],
		});
		expect(result.planned).toEqual(["tests/lean-run/a.test.ts"]);
		expect(result.unplanned).toEqual(["tests/lean-run/graph/b.test.ts"]);
	});

	test("lists a glob entry no file matches as untouched", () => {
		const result = planVersusActual({
			plan: { touches: ["docs/**/*.md"] },
			touched: [],
			diffFiles: ["lib/a.ts"],
		});
		expect(result.untouched).toEqual(["docs/**/*.md"]);
	});
});

describe("touchesPath", () => {
	test("prefers a backticked span", () => {
		expect(touchesPath("rework `./lib/x/` for the new seam")).toBe("lib/x");
	});

	test("falls back to the first word without trailing punctuation", () => {
		expect(touchesPath("  lib/y.ts, because")).toBe("lib/y.ts");
	});

	test.each([
		["- lib/a.ts — reason", "lib/a.ts"],
		["* lib/a.ts", "lib/a.ts"],
		["1. lib/a.ts", "lib/a.ts"],
		["12) lib/a.ts: why", "lib/a.ts"],
	])("drops the list marker in %j", (entry, expected) => {
		expect(touchesPath(entry)).toBe(expected);
	});

	test("keeps a glob that starts with **", () => {
		expect(touchesPath("**/fixtures/*.json")).toBe("**/fixtures/*.json");
	});
});
