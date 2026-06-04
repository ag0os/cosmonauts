import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import definition from "../../bundled/coding/coding/agents/quality-manager.ts";

const PROMPT_PATH = new URL(
	"../../bundled/coding/coding/prompts/quality-manager.md",
	import.meta.url,
);

async function readPrompt() {
	return readFile(PROMPT_PATH, "utf-8");
}

describe("quality-manager prompt", () => {
	it("can spawn coordinator for task-driven remediation but not tdd-coordinator", () => {
		expect(definition.subagents).toContain("coordinator");
		expect(definition.subagents).not.toContain("tdd-coordinator");
	});

	it("resolves the review base local-first so origin-behind state does not widen the range", async () => {
		const content = await readPrompt();

		// Local base branch is resolved before origin/main, so a local main that
		// is ahead of origin/main (committed-but-not-pushed) stays the true fork
		// point and already-merged commits do not leak into the review range.
		const localMainIdx = content.indexOf(
			"- `main` (if it exists and is not the current branch)",
		);
		const masterIdx = content.indexOf("- `master` (same check)");
		const originIdx = content.indexOf(
			"- `origin/main` (if `git rev-parse --verify origin/main` succeeds)",
		);

		expect(localMainIdx).toBeGreaterThan(-1);
		expect(masterIdx).toBeGreaterThan(-1);
		expect(originIdx).toBeGreaterThan(-1);
		expect(localMainIdx).toBeLessThan(masterIdx);
		expect(masterIdx).toBeLessThan(originIdx);

		expect(content).toContain(
			"The local base branch (`main`, then `master`) is the feature's true fork point; `origin/main` can be behind it",
		);
		expect(content).toContain(
			"Fall back to `origin/main` only when no local base branch exists.",
		);

		// Critical Rule 2 now prefers the local base branch.
		expect(content).toContain(
			"**Always review against the local base branch (`main` or `master`) when it exists; fall back to `origin/main` only when no local base branch is available.**",
		);
		expect(content).not.toContain(
			"**Always review against `main` (or `origin/main` when available).**",
		);
	});

	it("routes integration findings through the existing remediation flow", async () => {
		const content = await readPrompt();

		expect(content).toContain(
			"missions/plans/<activePlanSlug>/integration-report.md",
		);
		expect(content).toContain(
			"Treat `integration_findings` exactly like reviewer findings",
		);
		expect(content).toContain(
			"If `overall: incorrect`, route the `I-###` findings in step 5",
		);
		expect(content).toContain("plan: activePlanSlug");
	});

	it("routes complex planned findings to a coordinator-driven review-fix task", async () => {
		const content = await readPrompt();

		expect(content).toContain(
			"Complex reviewer or integration findings on planned runs",
		);
		expect(content).toContain("create one remediation task via `task_create`");
		expect(content).toContain("labels `review-fix` and `review-round:<n>`");
		expect(content).toContain("pass `plan: activePlanSlug`");
		expect(content).toContain(
			'`chain_run(expression: "coordinator", prompt: "Process only tasks labeled review-round:<n>. Do not modify tasks without this label.", completionLabel: "review-round:<n>")`',
		);
	});

	it("falls back to fixer-only remediation on planless and verifier-native failures", async () => {
		const content = await readPrompt();

		expect(content).toContain("This is a planless review run");
		expect(content).toContain(
			"do not create remediation tasks, and route every otherwise-complex remediation item through `fixer` instead.",
		);
		expect(content).toContain(
			"Complex reviewer or integration findings on planless runs",
		);
		expect(content).toContain("**Verifier-native failures**:");
		expect(content).toContain("route to `fixer` for immediate remediation.");
		expect(content).toContain(
			"Do not create remediation tasks for verifier-native failures.",
		);
	});

	it("reruns integration verification after code-modifying remediation and accepts skipped reports", async () => {
		const content = await readPrompt();

		expect(content).toContain("spawn `integration-verifier`, then reread");
		expect(content).toContain(
			"This rerun trigger applies even when the remediation was not caused by integration findings.",
		);
		expect(content).toContain(
			"Confirm the latest integration report is `overall: correct` or `overall: skipped`.",
		);
		expect(content).toContain(
			"If `overall: skipped`, treat it as non-blocking",
		);
		expect(content).toContain(
			"any completed remediation tasks from `coordinator`",
		);
		expect(content).not.toContain("tdd-coordinator");
	});

	it("writes a durable plan-scoped final QM report before cleaning ephemeral reviews", async () => {
		const content = await readPrompt();

		expect(content).toContain(
			"write a durable final Quality Manager report to `missions/plans/<activePlanSlug>/qm.md`",
		);
		expect(content).toContain(
			"the plan-scoped merge-readiness record and must survive cleanup",
		);
		expect(content).toContain(
			"Do this before removing files from `missions/reviews/`.",
		);
		expect(content).toContain(
			"Remove all review report files from `missions/reviews/`",
		);
	});

	it("reports abstract Quality Contract gate ladders without replacing legacy QC criteria", async () => {
		// @cosmo-behavior plan:artifact-format-redesign#B-014
		const content = await readPrompt();

		expect(content).toContain(
			"detect it as an abstract gate ladder when its header row contains `Gate kind`, `Tier`, and `Binding state`",
		);
		expect(content).toContain("`gate_ladder_rows`");
		expect(content).toContain(
			"Do not warn that a ladder row is malformed merely because it lacks a `QC-*` id, `verification`, or `command` field.",
		);
		expect(content).toContain(
			"Universal gate rows map to sign-off checks or explicit manual verification when safe",
		);
		expect(content).toContain("`degraded_gates`");
		expect(content).toContain("unbound/not enforced");
		expect(content).toContain("`protocol_pending_gates`");
		expect(content).toContain("protocol pending");
		expect(content).toContain(
			"Legacy `verifier_criteria`, `reviewer_criteria`, and `manual_criteria` behavior is unchanged for old `QC-*` entries.",
		);
		expect(content).toContain(
			"Do not implement a deterministic gate enforcement engine in this prompt.",
		);
		expect(content).toContain("Universal gate status:");
		expect(content).toContain("Degraded bindable gates:");
		expect(content).toContain("Protocol-pending gates:");
		expect(content).toContain("Legacy manual criteria:");
	});
});
