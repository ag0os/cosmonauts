/**
 * Tests for summarizeRun, the one-line result the lead sees.
 */
import { describe, expect, test } from "vitest";
import { summarizeRun } from "../../lib/lean-run/summary.ts";
import type { RunRecord } from "../../lib/lean-run/types.ts";

function record(overrides: Partial<RunRecord["manifest"]>, reviewer?: object) {
	return {
		dir: "/d",
		manifest: {
			id: "r",
			baseSha: "abc",
			planPath: "p.md",
			backend: "pi",
			reentries: 1,
			snapshotRefs: [],
			status: "done",
			createdAt: "t",
			...overrides,
		},
		envelopes: reviewer ? { reviewer } : {},
		facts: { passes: [] },
		stats: [],
	} as RunRecord;
}

describe("summarizeRun", () => {
	test("reports the reviewer's verdict and finding counts for a done run", () => {
		const summary = summarizeRun(
			record(
				{},
				{
					outcome: "done",
					summary: "two issues",
					findings: [
						{ id: "F-1", severity: "high", file: "a", summary: "s", fix: "f" },
						{ id: "F-2", severity: "low", file: "b", summary: "s", fix: "f" },
					],
				},
			),
		);
		expect(summary).toBe("done: two issues; 2 finding(s), 1 high (1 re-entry)");
	});

	test("reports the re-review's verdict after a findings re-entry", () => {
		const summary = summarizeRun({
			...record({ reentries: 0, findingsReentries: 1 }),
			envelopes: {
				reviewer: {
					outcome: "done",
					findings: [
						{ id: "F-1", severity: "high", file: "a", summary: "s", fix: "f" },
					],
				},
				"reviewer-2": { outcome: "done", summary: "fixed" },
			},
		});
		expect(summary).toBe(
			"done: fixed; 0 finding(s), 0 high (0 re-entries, 1 findings re-entry)",
		);
	});

	test("reports the findings re-entry for a run that did not finish", () => {
		expect(
			summarizeRun(
				record({
					status: "blocked",
					reason: "reviewer-2 still reports 1 high or medium finding(s): F-3",
					findingsReentries: 1,
				}),
			),
		).toBe(
			"blocked: reviewer-2 still reports 1 high or medium finding(s): F-3 (1 re-entry, 1 findings re-entry)",
		);
	});

	test("reports zero findings when the reviewer listed none", () => {
		expect(summarizeRun(record({ reentries: 0 }, { outcome: "done" }))).toBe(
			"done: 0 finding(s), 0 high (0 re-entries)",
		);
	});

	test("reports the status and reason for a run that did not finish", () => {
		expect(summarizeRun(record({ status: "failed", reason: "boom" }))).toBe(
			"failed: boom (1 re-entry)",
		);
	});

	test("says so when an unfinished run has no reason", () => {
		expect(summarizeRun(record({ status: "running" }))).toBe(
			"running: no reason recorded (1 re-entry)",
		);
	});
});
