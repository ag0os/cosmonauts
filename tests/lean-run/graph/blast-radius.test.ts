/**
 * Tests for blastRadius and isSpecFile.
 * Covers the reverse closure, stopping at the first spec file and passing
 * through helpers (ruling G-2), hub handling, the dependents cap, and
 * deterministic output.
 */

import { describe, expect, test } from "vitest";
import {
	blastRadius,
	isSpecFile,
} from "../../../lib/lean-run/graph/blast-radius.ts";
import { fixtureGraph, LAYERED_GRAPH } from "./fixtures.ts";

describe("blastRadius", () => {
	test("walks changed file to transitive dependents and their specs", () => {
		expect(
			blastRadius({ graph: LAYERED_GRAPH, changedFiles: ["lib/a.ts"] }),
		).toEqual({
			changed: ["lib/a.ts"],
			dependents: ["lib/b.ts", "lib/c.ts"],
			tests: ["tests/a.test.ts", "tests/b.test.ts", "tests/c.test.ts"],
			hubs: [],
			truncated: false,
		});
	});

	test("passes through a test helper to the specs that import it", () => {
		const result = blastRadius({
			graph: LAYERED_GRAPH,
			changedFiles: ["lib/b.ts"],
		});
		expect(result.tests).toContain("tests/b.test.ts");
		expect(result.tests).not.toContain("tests/helpers/b.ts");
	});

	test("does not expand past the first spec file reached", () => {
		const graph = fixtureGraph([
			["tests/x.test.ts", "lib/x.ts"],
			["tests/y.test.ts", "tests/x.test.ts"],
		]);
		expect(blastRadius({ graph, changedFiles: ["lib/x.ts"] }).tests).toEqual([
			"tests/x.test.ts",
		]);
	});

	test("lists a changed spec file as a test without expanding it", () => {
		const result = blastRadius({
			graph: LAYERED_GRAPH,
			changedFiles: ["tests/a.test.ts"],
		});
		expect(result).toMatchObject({
			dependents: [],
			tests: ["tests/a.test.ts"],
		});
	});

	test("walks a changed helper to its specs without listing the helper", () => {
		const result = blastRadius({
			graph: LAYERED_GRAPH,
			changedFiles: ["tests/helpers/b.ts"],
		});
		expect(result).toMatchObject({
			dependents: [],
			tests: ["tests/b.test.ts"],
		});
	});

	test("counts a changed spec file absent from the graph as a test", () => {
		expect(
			blastRadius({
				graph: LAYERED_GRAPH,
				changedFiles: ["tests/lean-run/new.test.ts"],
			}),
		).toMatchObject({ dependents: [], tests: ["tests/lean-run/new.test.ts"] });
	});

	test("adds the files of changed functions to the changed set", () => {
		const result = blastRadius({
			graph: LAYERED_GRAPH,
			changedFiles: [],
			changedFunctions: [{ file: "lib/unrelated.ts" }],
		});
		expect(result).toMatchObject({
			changed: ["lib/unrelated.ts"],
			tests: ["tests/unrelated.test.ts"],
		});
	});

	test("normalizes changed paths before walking", () => {
		const result = blastRadius({
			graph: LAYERED_GRAPH,
			changedFiles: ["./lib/unrelated.ts", "lib\\unrelated.ts"],
		});
		expect(result).toMatchObject({
			changed: ["lib/unrelated.ts"],
			tests: ["tests/unrelated.test.ts"],
		});
	});

	test("keeps a changed hub's direct tests and its direct dependents' tests, but expands no further", () => {
		const graph = fixtureGraph([
			["lib/one.ts", "lib/types.ts"],
			["lib/two.ts", "lib/types.ts"],
			["lib/three.ts", "lib/types.ts"],
			["tests/types.test.ts", "lib/types.ts"],
			["tests/one.test.ts", "lib/one.ts"],
			["lib/top.ts", "lib/one.ts"],
			["tests/top.test.ts", "lib/top.ts"],
		]);
		expect(
			blastRadius({ graph, changedFiles: ["lib/types.ts"], hubThreshold: 3 }),
		).toEqual({
			changed: ["lib/types.ts"],
			dependents: ["lib/one.ts", "lib/three.ts", "lib/two.ts"],
			tests: ["tests/one.test.ts", "tests/types.test.ts"],
			hubs: ["lib/types.ts"],
			truncated: true,
		});
	});

	test("keeps the tests of a changed hub with dozens of direct test importers", () => {
		const specs = Array.from(
			{ length: 42 },
			(_, index) =>
				`tests/driver/case-${String(index).padStart(2, "0")}.test.ts`,
		);
		const graph = fixtureGraph([
			...specs.map((spec) => [spec, "lib/driver/types.ts"] as const),
			["lib/driver/run.ts", "lib/driver/types.ts"],
			["tests/driver/run.test.ts", "lib/driver/run.ts"],
			["lib/cli/main.ts", "lib/driver/run.ts"],
			["tests/cli/main.test.ts", "lib/cli/main.ts"],
		]);
		expect(
			blastRadius({ graph, changedFiles: ["lib/driver/types.ts"] }),
		).toEqual({
			changed: ["lib/driver/types.ts"],
			dependents: ["lib/driver/run.ts"],
			tests: [...specs, "tests/driver/run.test.ts"].sort(),
			hubs: ["lib/driver/types.ts"],
			truncated: true,
		});
	});

	test("collects only the direct tests of a hub reached transitively", () => {
		const graph = fixtureGraph([
			["lib/mid.ts", "lib/base.ts"],
			["lib/x.ts", "lib/mid.ts"],
			["lib/y.ts", "lib/mid.ts"],
			["tests/mid.test.ts", "lib/mid.ts"],
		]);
		expect(
			blastRadius({ graph, changedFiles: ["lib/base.ts"], hubThreshold: 2 }),
		).toEqual({
			changed: ["lib/base.ts"],
			dependents: ["lib/mid.ts"],
			tests: ["tests/mid.test.ts"],
			hubs: ["lib/mid.ts"],
			truncated: true,
		});
	});

	test("caps dependents and flags the result as truncated", () => {
		const result = blastRadius({
			graph: LAYERED_GRAPH,
			changedFiles: ["lib/a.ts"],
			maxDependents: 1,
		});
		expect(result.dependents).toEqual(["lib/b.ts"]);
		expect(result.truncated).toBe(true);
	});

	test("keeps collecting test importers of reached files after the cap", () => {
		const result = blastRadius({
			graph: LAYERED_GRAPH,
			changedFiles: ["lib/a.ts"],
			maxDependents: 1,
		});
		expect(result.tests).toEqual(["tests/a.test.ts", "tests/b.test.ts"]);
	});

	test("returns the same output whatever the input and edge order", () => {
		const reversed = fixtureGraph(
			[...LAYERED_GRAPH.edges].reverse().map((edge) => [edge.from, edge.to]),
		);
		expect(
			blastRadius({ graph: reversed, changedFiles: ["lib/c.ts", "lib/a.ts"] }),
		).toEqual(
			blastRadius({
				graph: LAYERED_GRAPH,
				changedFiles: ["lib/a.ts", "lib/c.ts"],
			}),
		);
	});

	test("keeps a changed source file absent from the graph in the changed set", () => {
		expect(
			blastRadius({ graph: LAYERED_GRAPH, changedFiles: ["lib/new.ts"] }),
		).toEqual({
			changed: ["lib/new.ts"],
			dependents: [],
			tests: [],
			hubs: [],
			truncated: false,
		});
	});
});

describe("isSpecFile", () => {
	test.each([
		"tests/a.test.ts",
		"tests/b.spec.ts",
		"tests/c.test.tsx",
	])("accepts %s", (path) => {
		expect(isSpecFile(path)).toBe(true);
	});

	test.each([
		"tests/helpers/b.ts",
		"lib/a.ts",
		"tests/test.ts",
	])("rejects %s", (path) => {
		expect(isSpecFile(path)).toBe(false);
	});
});
