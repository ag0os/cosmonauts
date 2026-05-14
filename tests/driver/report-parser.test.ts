import { describe, expect, test } from "vitest";
import { parseReport } from "../../lib/driver/report-parser.ts";

const outcomeReports = ["success", "failure", "partial", "completed"] as const;

describe("report-parser", () => {
	test("parses fenced JSON reports", () => {
		const report = {
			outcome: "success",
			files: [
				{ path: "lib/driver/report-parser.ts", change: "created" },
				{ path: "tests/driver/report-parser.test.ts", change: "modified" },
			],
			verification: [
				{ command: "bun run test --grep report-parser", status: "pass" },
				{ command: "bun run typecheck", status: "not_run" },
			],
			notes: "Report parser implemented.",
			progress: { phase: 1, of: 2, remaining: "typecheck" },
		} as const;

		const stdout = `Agent output before the report.

\`\`\`json
${JSON.stringify(report, null, 2)}
\`\`\`

Agent output after the report.`;

		expect(parseReport(stdout)).toEqual(report);
	});

	test.each(
		outcomeReports,
	)("falls back to a minimal %s report from OUTCOME text", (outcome) => {
		const stdout = `No JSON report was emitted.
OUTCOME: ${outcome}
Done.`;

		expect(parseReport(stdout)).toEqual({
			outcome: outcome === "completed" ? "success" : outcome,
			files: [],
			verification: [],
		});
	});

	test("normalizes minimal completed JSON reports to success", () => {
		const stdout = `\`\`\`json
{"outcome":"completed"}
\`\`\``;

		expect(parseReport(stdout)).toEqual({
			outcome: "success",
			files: [],
			verification: [],
		});
	});

	test("parses loose outcome lines", () => {
		const stdout = "outcome: completed";

		expect(parseReport(stdout)).toEqual({
			outcome: "success",
			files: [],
			verification: [],
		});
	});

	test("returns unknown with raw stdout for unparseable input", () => {
		const stdout = "The task finished, but no structured report was emitted.";

		expect(parseReport(stdout)).toEqual({ outcome: "unknown", raw: stdout });
	});

	test("preserves progress for partial fenced JSON reports", () => {
		const report = {
			outcome: "partial",
			files: [{ path: "lib/driver/run-one-task.ts", change: "modified" }],
			verification: [{ command: "bun run test", status: "pass" }],
			progress: { phase: 2, of: 3, remaining: "commit handling" },
		} as const;

		const stdout = `\`\`\`json
${JSON.stringify(report)}
\`\`\``;

		expect(parseReport(stdout)).toEqual(report);
	});
});
