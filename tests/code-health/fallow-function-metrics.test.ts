/**
 * Tests for lib/code-health/fallow-function-metrics.ts: narrowing Fallow's
 * `health --format json` findings into per-function metrics.
 */

import { describe, expect, test } from "vitest";
import { parseFallowHealthFunctions } from "../../lib/code-health/fallow-function-metrics.ts";

function report(findings: unknown[]): string {
	return JSON.stringify({ schema_version: 4, version: "2.54.2", findings });
}

const FINDING = {
	path: "src/sample.ts",
	name: "<arrow>",
	line: 12,
	col: 4,
	cyclomatic: 3,
	cognitive: 2,
	line_count: 5,
	crap: 6.5,
	coverage_tier: "none",
};

describe("parseFallowHealthFunctions", () => {
	test("maps a finding to an inclusive line range and its metrics", () => {
		expect(parseFallowHealthFunctions(report([FINDING]))).toEqual([
			{
				file: "src/sample.ts",
				name: "<arrow>",
				startLine: 12,
				endLine: 16,
				cyclomatic: 3,
				cognitive: 2,
				crap: 6.5,
			},
		]);
	});

	test("reports CRAP as null when Fallow omits it", () => {
		const { crap: _omitted, ...withoutCrap } = FINDING;

		expect(
			parseFallowHealthFunctions(report([withoutCrap]))[0]?.crap,
		).toBeNull();
	});

	test("rejects a finding with a non-numeric metric", () => {
		expect(() =>
			parseFallowHealthFunctions(report([{ ...FINDING, cyclomatic: "3" }])),
		).toThrow("fallow health finding 0 has an unexpected shape");
	});

	test("rejects output without a findings array", () => {
		expect(() => parseFallowHealthFunctions("{}")).toThrow(
			"fallow health JSON has no findings array",
		);
	});

	test("rejects output that is not JSON", () => {
		expect(() => parseFallowHealthFunctions("WARN something")).toThrow(
			"fallow health did not print JSON",
		);
	});
});
