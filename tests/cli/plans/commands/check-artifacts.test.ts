import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { registerCheckArtifactsCommand } from "../../../../cli/plans/commands/check-artifacts.ts";
import { PlanManager } from "../../../../lib/plans/plan-manager.ts";
import {
	createCommandProgram,
	createCommandTestContext,
	ProcessExitError,
} from "../../../helpers/cli.ts";

describe("plan check-artifacts command", () => {
	it("prints successful conformance output in human plain and json modes", async () => {
		for (const mode of ["human", "plain", "json"] as const) {
			const result = await runPlanCheckArtifactsCommand(
				modeArgs(mode, "passing-plan"),
				async (projectRoot) => {
					await writePlanWithBody(
						projectRoot,
						"passing-plan",
						planMarkdown({ cites: "D-001" }),
					);
				},
			);

			expect(result.stderr).toBe("");
			expect(result.exitCalls).toEqual([]);

			if (mode === "json") {
				expect(JSON.parse(result.stdout)).toEqual({
					ok: true,
					planSlug: "passing-plan",
					planPath: "missions/plans/passing-plan/plan.md",
					issues: [],
				});
			} else if (mode === "plain") {
				expect(result.stdout).toBe(
					"ok plan-conformance passing-plan issues=0\n",
				);
			} else {
				expect(result.stdout).toBe(
					"Plan conformance passed for passing-plan.\nIssues: 0\n",
				);
			}
		}
	});

	it("prints conformance failures in human plain and json modes and exits non-zero", async () => {
		for (const mode of ["human", "plain", "json"] as const) {
			const result = await runPlanCheckArtifactsCommand(
				modeArgs(mode, "failing-plan"),
				async (projectRoot) => {
					await writePlanWithBody(
						projectRoot,
						"failing-plan",
						planMarkdown({ cites: "D-099" }),
					);
				},
			);

			expect(result.stderr).toBe("");
			expect(result.exitCalls).toEqual([1]);

			if (mode === "json") {
				expect(JSON.parse(result.stdout)).toMatchObject({
					ok: false,
					planSlug: "failing-plan",
					issues: [{ kind: "unresolved-decision-citation", actual: "D-099" }],
				});
			} else if (mode === "plain") {
				expect(result.stdout).toContain(
					"fail plan-conformance failing-plan issues=1\n",
				);
				expect(result.stdout).toContain(
					"issue kind=unresolved-decision-citation line=",
				);
				expect(result.stdout).toContain("actual=D-099");
			} else {
				expect(result.stdout).toContain(
					"Plan conformance failed for failing-plan.",
				);
				expect(result.stdout).toContain("Issues: 1");
				expect(result.stdout).toContain(
					"- [unresolved-decision-citation] line ",
				);
			}
		}
	});

	it("reports invalid slug and missing plan diagnostics before reading any plan", async () => {
		const invalidSlug = await runPlanCheckArtifactsCommand([
			"--json",
			"check-artifacts",
			"../bad",
		]);
		expect(JSON.parse(invalidSlug.stdout)).toEqual({
			error: "Invalid plan slug (path traversal): ../bad",
		});
		expect(invalidSlug.stderr).toBe("");
		expect(invalidSlug.exitCalls).toEqual([1]);

		for (const mode of ["human", "plain", "json"] as const) {
			const result = await runPlanCheckArtifactsCommand(
				modeArgs(mode, "absent-everywhere"),
			);

			expect(result.exitCalls).toEqual([1]);
			if (mode === "json") {
				expect(JSON.parse(result.stdout)).toEqual({
					error: "Plan not found: absent-everywhere",
				});
				expect(result.stderr).toBe("");
			} else {
				expect(result.stdout).toBe("");
				expect(result.stderr).toBe(
					"Error: Plan not found: absent-everywhere\n",
				);
			}
		}
	});

	it("resolves an archived plan and reports its archive path", async () => {
		const result = await runPlanCheckArtifactsCommand(
			modeArgs("json", "archived-only"),
			async (projectRoot) => {
				await writeArchivedPlan(
					projectRoot,
					"archived-only",
					planMarkdown({ cites: "D-001" }),
				);
			},
		);

		expect(result.stderr).toBe("");
		expect(result.exitCalls).toEqual([]);
		expect(JSON.parse(result.stdout)).toMatchObject({
			ok: true,
			planSlug: "archived-only",
			planPath: "missions/archive/plans/archived-only/plan.md",
			issues: [],
		});
	});

	// An active plan still wins, so a re-opened slug is never checked against
	// the stale archived copy.
	it("prefers the active plan when a slug exists in both locations", async () => {
		const result = await runPlanCheckArtifactsCommand(
			modeArgs("json", "both-locations"),
			async (projectRoot) => {
				await writePlanWithBody(
					projectRoot,
					"both-locations",
					planMarkdown({ cites: "D-001" }),
				);
				await writeArchivedPlan(
					projectRoot,
					"both-locations",
					planMarkdown({ cites: "D-999" }),
				);
			},
		);

		expect(result.exitCalls).toEqual([]);
		expect(JSON.parse(result.stdout)).toMatchObject({
			ok: true,
			planPath: "missions/plans/both-locations/plan.md",
			issues: [],
		});
	});
});

interface PlanCheckArtifactsCommandResult {
	stdout: string;
	stderr: string;
	exitCalls: readonly number[];
}

async function runPlanCheckArtifactsCommand(
	args: readonly string[],
	setup?: (projectRoot: string) => Promise<void>,
): Promise<PlanCheckArtifactsCommandResult> {
	const context = await createCommandTestContext(
		"plan-check-artifacts-command-test-",
	);
	try {
		await setup?.(context.tempDir);
		try {
			await createCommandProgram(registerCheckArtifactsCommand).parseAsync([
				"node",
				"test",
				...args,
			]);
		} catch (error) {
			if (!(error instanceof ProcessExitError)) {
				throw error;
			}
		}

		return {
			stdout: context.output.stdout(),
			stderr: context.output.stderr(),
			exitCalls: [...context.exit.calls()],
		};
	} finally {
		await context.restore();
	}
}

function modeArgs(mode: "human" | "plain" | "json", slug: string): string[] {
	if (mode === "json") {
		return ["--json", "check-artifacts", slug];
	}
	if (mode === "plain") {
		return ["--plain", "check-artifacts", slug];
	}
	return ["check-artifacts", slug];
}

async function writePlanWithBody(
	projectRoot: string,
	slug: string,
	body: string,
): Promise<void> {
	const manager = new PlanManager(projectRoot);
	await manager.createPlan({
		slug,
		title: slug,
		description: body,
	});
}

async function writeArchivedPlan(
	projectRoot: string,
	slug: string,
	body: string,
): Promise<void> {
	const archivedPlanPath = join(
		projectRoot,
		"missions",
		"archive",
		"plans",
		slug,
		"plan.md",
	);
	await mkdir(dirname(archivedPlanPath), { recursive: true });
	await writeFile(archivedPlanPath, body, "utf-8");
}

function planMarkdown({ cites }: { cites: string }): string {
	return `## Decision Log

- **D-001 - Only decision**
  - Decision: keep it
  - Decided by: planner-proposed, 2026-07-28

## Overview

The implementation relies on ${cites}.

## Behaviors

### B-001 - A behavior
`;
}
