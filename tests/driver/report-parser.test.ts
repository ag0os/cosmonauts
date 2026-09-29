import { describe, expect, test } from "vitest";
import { parseReport } from "../../lib/driver/report-parser.ts";

const outcomeReports = ["success", "failure", "partial", "completed"] as const;

describe("report-parser", () => {
	test("treats a blocked outcome line conflicting with fenced success as blocked", () => {
		const raw =
			'```json\n{"outcome":"success","notes":"Need a decision"}\n```\noutcome: blocked';
		expect(parseReport(raw)).toMatchObject({
			outcome: "blocked",
			notes: "Need a decision",
			raw,
		});
	});
	test("retains raw output on a non-blocked disagreement", () => {
		const raw = '```json\n{"outcome":"failure"}\n```\noutcome: success';
		expect(parseReport(raw)).toEqual({ outcome: "unknown", raw });
	});
	test("honors a blocked fenced report despite a conflicting success line", () => {
		const raw =
			'```json\n{"outcome":"blocked","notes":"Need input"}\n```\noutcome: success';
		expect(parseReport(raw)).toMatchObject({
			outcome: "blocked",
			notes: "Need input",
			raw,
		});
	});
	test("does not accept success when two fenced reports disagree", () => {
		const raw =
			'```json\n{"outcome":"success"}\n```\n```json\n{"outcome":"blocked"}\n```';
		expect(parseReport(raw)).toMatchObject({ outcome: "blocked", raw });
	});
	test("uses the last outcome line when a worker ends with a human stop", () => {
		const raw =
			"Earlier example: outcome: success\noutcome: success\nNeed a decision\noutcome: blocked";
		expect(parseReport(raw)).toMatchObject({ outcome: "blocked", raw });
	});
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

	test("retains raw stdout and notes for a blocked fenced report", () => {
		const stdout =
			'before\n```json\n{"outcome":"blocked","notes":"Need human input"}\n```\nafter';
		expect(parseReport(stdout)).toMatchObject({
			outcome: "blocked",
			notes: "Need human input",
			raw: stdout,
		});
	});

	test("retains raw stdout for a blocked outcome line", () => {
		const stdout = "Need human input\noutcome: blocked";
		expect(parseReport(stdout)).toMatchObject({
			outcome: "blocked",
			raw: stdout,
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
