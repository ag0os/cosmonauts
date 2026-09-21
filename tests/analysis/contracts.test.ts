import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, test } from "vitest";
import type {
	AnalysisBinding,
	AnalysisGateCoverage,
	AnalysisResult,
	AnalysisTraceTarget,
} from "../../lib/analysis/index.ts";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(TEST_DIR, "../..");

describe("analysis core contracts", () => {
	test("declares evaluated gate coverage on every verdict bearing result", () => {
		expectTypeOf<Extract<AnalysisResult, { capability: "dead-code" }>>()
			.toHaveProperty("coverage")
			.toEqualTypeOf<AnalysisGateCoverage>();
		expectTypeOf<Extract<AnalysisResult, { capability: "duplication" }>>()
			.toHaveProperty("coverage")
			.toEqualTypeOf<AnalysisGateCoverage>();
		expectTypeOf<Extract<AnalysisResult, { capability: "complexity" }>>()
			.toHaveProperty("coverage")
			.toEqualTypeOf<AnalysisGateCoverage>();
		expectTypeOf<
			Extract<AnalysisResult, { capability: "boundary-conformance" }>
		>()
			.toHaveProperty("coverage")
			.toEqualTypeOf<AnalysisGateCoverage>();
		expectTypeOf<
			Extract<AnalysisResult, { capability: "changed-scope-audit" }>
		>()
			.toHaveProperty("coverage")
			.toEqualTypeOf<AnalysisGateCoverage>();

		expectTypeOf<readonly []>().not.toMatchTypeOf<AnalysisGateCoverage>();
		expectTypeOf<
			Extract<AnalysisResult, { capability: "trace" }>
		>().not.toHaveProperty("coverage");
		expectTypeOf<
			Extract<AnalysisResult, { capability: "fix-preview" }>
		>().not.toHaveProperty("coverage");
	});

	test("discriminates result verdicts and failed bindings", () => {
		expectTypeOf<
			Extract<AnalysisResult, { capability: "dead-code" }>["verdict"]
		>().toEqualTypeOf<"pass" | "fail">();
		expectTypeOf<
			Extract<AnalysisResult, { capability: "complexity" }>["metric"]
		>().toEqualTypeOf<"cyclomatic" | "cognitive" | "crap">();
		expectTypeOf<
			Extract<AnalysisResult, { capability: "trace" }>["verdict"]
		>().toEqualTypeOf<"not-applicable">();
		expectTypeOf<
			Extract<AnalysisResult, { capability: "fix-preview" }>["verdict"]
		>().toEqualTypeOf<"not-applicable">();
		expectTypeOf<
			Extract<AnalysisBinding, { state: "failed" }>["failure"]
		>().not.toBeNever();
		expectTypeOf<
			Extract<AnalysisBinding, { state: "unbound" }>
		>().not.toEqualTypeOf<Extract<AnalysisBinding, { state: "failed" }>>();
	});

	test("keeps provider-specific trace identity optional in the generic target union", () => {
		const targets = [
			{ kind: "symbol", symbol: "render" },
			{ kind: "symbol", symbol: "render", path: "src/render.ts" },
			{ kind: "file", path: "src/render.ts" },
			{ kind: "dependency", dependency: "typebox" },
			{
				kind: "duplicate-location",
				location: { path: "src/render.ts" },
			},
			{
				kind: "duplicate-location",
				location: { path: "src/render.ts", line: 12 },
			},
			{
				kind: "duplicate-location",
				location: { path: "src/render.ts", line: 12, column: 4 },
			},
		] as const satisfies readonly AnalysisTraceTarget[];

		expect(targets.map(({ kind }) => kind)).toEqual([
			"symbol",
			"symbol",
			"file",
			"dependency",
			"duplicate-location",
			"duplicate-location",
			"duplicate-location",
		]);
		expectTypeOf<
			Extract<AnalysisTraceTarget, { kind: "duplicate-location" }>["location"]
		>().toEqualTypeOf<{
			readonly path: string;
			readonly line?: number;
			readonly column?: number;
		}>();
	});

	test("keeps the analysis core independent from Pi and provider code", async () => {
		const coreDirectory = join(REPOSITORY_ROOT, "lib", "analysis");
		const sources = await readdir(coreDirectory);

		for (const source of sources.filter((path) => path.endsWith(".ts"))) {
			const content = await readFile(join(coreDirectory, source), "utf8");
			expect(content).not.toMatch(/from\s+["'][^"']*(?:pi-|fallow)/u);
			expect(content).not.toMatch(
				/domains\/shared\/extensions|project-tools|concrete provider/iu,
			);
		}
	});
});
