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

	test("says when a done run's processes were not confirmed gone", () => {
		const summary = summarizeRun(
			record(
				{ cleanupUnconfirmed: [41, 42] },
				{ outcome: "done", summary: "fine", findings: [] },
			),
		);
		expect(summary).toBe(
			"done: fine; 0 finding(s), 0 high (1 re-entry); cleanup unconfirmed (pids 41, 42), the run lock stays until they exit",
		);
	});

	test("names the detached process candidates of a done run", () => {
		const summary = summarizeRun(
			record(
				{
					detachedCandidates: [
						{ pid: 51, command: "perl -e daemon /tmp/clone/marker" },
					],
				},
				{ outcome: "done", summary: "fine", findings: [] },
			),
		);
		expect(summary).toBe(
			"done: fine; 0 finding(s), 0 high (1 re-entry); 1 detached process candidate(s) still name the builder clone, not confirmed gone: pids 51 (perl -e daemon /tmp/clone/marker) (see run.json)",
		);
	});

	test("names the detached process candidates of a run that did not finish", () => {
		const summary = summarizeRun(
			record({
				status: "failed",
				reason: "boom",
				detachedCandidates: [{ pid: 51, command: "sleep /tmp/clone" }],
			}),
		);
		expect(summary).toBe(
			"failed: boom (1 re-entry); 1 detached process candidate(s) still name the builder clone, not confirmed gone: pids 51 (sleep /tmp/clone) (see run.json)",
		);
	});

	test("names three detached candidates, counts the rest and truncates long commands", () => {
		const long = `node /tmp/clone/${"x".repeat(200)}`;
		const summary = summarizeRun(
			record({
				status: "failed",
				reason: "boom",
				detachedCandidates: [51, 52, 53, 54, 55].map((pid) => ({
					pid,
					command: long,
				})),
			}),
		);
		const cut = `${long.slice(0, 30)}...${long.slice(-47)}`;
		expect(summary).toBe(
			`failed: boom (1 re-entry); 5 detached process candidate(s) still name the builder clone, not confirmed gone: pids 51 (${cut}); 52 (${cut}); 53 (${cut}); and 2 more (see run.json)`,
		);
	});

	test("keeps the clone path that ends a long recorded command", () => {
		const clone = "/private/var/T/cosmonauts-lean-builder-Ab12/checkout";
		const summary = summarizeRun(
			record({
				status: "failed",
				reason: "boom",
				detachedCandidates: [
					{ pid: 51, command: `perl -e ${"y".repeat(150)}...${clone}...` },
				],
			}),
		);

		expect(summary).toContain("pids 51 (perl -e yyy");
		expect(summary).toContain("cosmonauts-lean-builder-Ab12/checkout...)");
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

	test("names the latest builder patch of a run that did not finish", () => {
		expect(
			summarizeRun(
				record({
					status: "blocked",
					reason: "verification did not pass",
					patches: [
						"runs/r/patches/builder-1.patch",
						"runs/r/patches/builder-2.patch",
					],
				}),
			),
		).toBe(
			"blocked: verification did not pass; builder patch not applied: runs/r/patches/builder-2.patch (1 re-entry)",
		);
	});

	test("does not repeat a patch the reason already names", () => {
		const reason =
			"builder patch did not apply to the worktree, which is unchanged: runs/r/patches/builder-1.patch";
		expect(
			summarizeRun(
				record({
					status: "blocked",
					reason,
					patches: ["runs/r/patches/builder-1.patch"],
				}),
			),
		).toBe(`blocked: ${reason} (1 re-entry)`);
	});

	test("says so when an unfinished run has no reason", () => {
		expect(summarizeRun(record({ status: "running" }))).toBe(
			"running: no reason recorded (1 re-entry)",
		);
	});
});
