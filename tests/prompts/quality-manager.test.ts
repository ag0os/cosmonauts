import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import definition from "../../bundled/coding/agents/quality-manager.ts";

const PROMPT_PATH = new URL(
	"../../bundled/coding/prompts/quality-manager.md",
	import.meta.url,
);

async function readPrompt() {
	return readFile(PROMPT_PATH, "utf-8");
}

describe("quality-manager prompt", () => {
	// @cosmo-behavior plan:spec-plan-intent#B-010
	it("classifies remediations against ratified ground before routing", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain(
			"Classify against ratified ground before routing.",
		);
		expect(content).toContain(
			"A finding is evidence; its suggested fix is an alternative to weigh, not a mandate.",
		);
		expect(content).toContain("`references/deviation-protocol.md`");
		expect(content).toContain("decision-needed");
		expect(content).toContain(
			"never a `fixer` route and never a `review-fix` task",
		);
		expect(content).toContain("Split compound findings");
	});

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
		expect(content).toContain(
			"scope all changed-file lists, diffs, and detected-analysis-tool audit commands from that merge-base",
		);
		expect(content).toContain(
			"already merged integration history; treat them as outside the review scope and do not flag them as out-of-scope violations for the feature branch.",
		);

		// Critical Rule 2 now prefers the local base branch.
		expect(content).toContain(
			"**Always review against the local base branch (`main` or `master`) when it exists; fall back to `origin/main` only when no local base branch is available.**",
		);
		expect(content).not.toContain(
			"**Always review against `main` (or `origin/main` when available).**",
		);
		expect(content).toContain(
			"Do not review against stale `origin/main` when a local `main` or `master` exists, and do not report already-merged local-base history as a feature-branch scope violation.",
		);
	});

	it("pins feature-branch audits to the literal local merge-base SHA", async () => {
		const content = await readPrompt();

		expect(content).toContain(
			"include one audit claim for **feature-branch reviews only** (skip for working-tree reviews on the base branch). Append `--base <merge-base-sha>` to the tool's listed audit command, substituting the actual SHA resolved in step 2 (not the shell variable name).",
		);
		expect(content).toContain(
			"The verifier runs in a separate session with no shell state, so the command must have the value baked in.",
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

	it("parses legacy QC criteria into their existing verification tracks", async () => {
		const content = await readPrompt();

		expect(content).toContain(
			"The Quality Contract can appear in two formats. Support both in the same invocation:",
		);
		expect(content).toContain("1. **Legacy `QC-*` list entries.**");
		for (const field of [
			"**id** — the `QC-NNN` identifier",
			"**category** — one of `correctness`, `architecture`, `integration`, `behavior`",
			"**criterion** — the testable assertion",
			"**verification** — `verifier`, `reviewer`, or `manual`",
			"**command** — present only for `verifier` type",
		]) {
			expect(content).toContain(field);
		}
		expect(content).toContain(
			'log a warning (e.g., "Warning: could not parse QC entry — skipping") and continue.',
		);
		expect(content).toContain(
			"Hold the parsed legacy criteria in working state as three lists: `verifier_criteria`",
		);
		expect(content).toContain(
			"append one claim per entry in `verifier_criteria`",
		);
		expect(content).toContain(
			"the full `reviewer_criteria` list from step 2.5",
		);
		expect(content).toContain(
			"confirm all non-manual legacy contract criteria have passed",
		);
		expect(content).toContain(
			"`QC-NNN [manual]: requires human verification — <criterion text>`",
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
		expect(content).toContain(
			"`universal_gate_status` — one record per row with `Tier: universal`.",
		);
		expect(content).toContain(
			"`degraded_gates` — every `Tier: bindable` row with `Binding state: unbound`.",
		);
		expect(content).toContain(
			"Report these as unbound/not enforced, with the gate kind, threshold, and degradation notes. They are not silent passes and are not hard failures in this generic prompt contract.",
		);
		expect(content).toContain(
			"`protocol_pending_gates` — every `Tier: bindable` row with `Binding state: bound` but no usable `Protocol` value.",
		);
		expect(content).toContain(
			"Report these as protocol pending unless a legacy criterion (`QC-*`) or a detected project-native analysis tool separately supplies an executable claim for the same gate kind.",
		);
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

	it("carries stable finding ids through disposition lifecycle and sign-off", async () => {
		const content = await readPrompt();

		expect(content).toContain(
			"the durable record that carries every finding forward by id across rounds",
		);
		expect(content).toContain(
			"Each reviewer finding has a stable id (`F-###`), each integration finding (`I-###`), each failed contract criterion (`QC-###`), and specialist findings keep their own ids (`UR-###`, `SR-###`, etc.).",
		);
		expect(content).toContain(
			"`open` → `routed-to-fixer` / `routed-to-task` → `verified-resolved`",
		);
		expect(content).toContain(
			"The terminal dispositions are `verified-resolved`, `dismissed-low-confidence`, and `deferred`; `open` and `routed-*` are never terminal.",
		);
		expect(content).toContain(
			"every entry must hold a terminal disposition (`verified-resolved` / `dismissed-low-confidence` / `deferred`) before you exit",
		);
		expect(content).toContain(
			'A fresh re-review that simply returns "no findings" does NOT close a prior finding.',
		);
		expect(content).toContain(
			"A finding is resolved only when its specific fix is verified present",
		);
	});

	it("sweeps migration-shaped changes across runtime tests and docs", async () => {
		const content = await readPrompt();

		expect(content).toContain(
			"For any migration-shaped task or diff that moves or renames files, directories, exported symbols, commands, config keys, or hard-coded paths",
		);
		expect(content).toContain(
			"runtime source directories (`lib/`, `cli/`, `bin/`, `domains/`, `bundled/`, `scripts/`) plus `tests/`, `docs/`, and any other tracked references.",
		);
		expect(content).toContain(
			"Prioritize runtime source findings over tests/docs cleanup, and route stale runtime references as correctness blockers.",
		);
		expect(content).toContain(
			"otherwise add explicit verifier claims that grep/search for the old identifiers or paths named by the migration.",
		);
	});

	it("constrains auxiliary analysis remediation to the narrowest blocking fix", async () => {
		const content = await readPrompt();

		expect(content).toContain(
			"make the NARROWEST change that clears the specific flagged finding at the flagged location",
		);
		expect(content).toContain(
			"do NOT refactor passing code to satisfy a metric, and do NOT enlarge the diff beyond what the finding requires.",
		);
		expect(content).toContain(
			"Only act on auxiliary-tool findings that block a binding gate.",
		);
		expect(content).toContain(
			"never a broad refactor of already-passing code inside a remediation pass.",
		);
	});

	it("limits remediation to three rounds and exits with a failure summary", async () => {
		const content = await readPrompt();

		expect(content).toContain(
			"three remediation rounds, then escalate with a clear failure summary",
		);
		expect(content).toContain(
			"Run at most 3 quality rounds in a single invocation. If still failing, exit with a clear failure summary.",
		);
		expect(content).toContain(
			"If the round budget is exhausted with P0/P1 findings still non-terminal, do not force a stop: exit with a failure summary instead",
		);
		expect(content).toContain(
			"**Bound remediation loops to 3 rounds.** Escalate if not converging.",
		);
	});
});
