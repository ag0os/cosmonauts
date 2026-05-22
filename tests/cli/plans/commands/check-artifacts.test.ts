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
	// @cosmo-behavior plan:artifact-conformance-gate#B-009
	it("prints successful conformance output in human plain and json modes", async () => {
		for (const mode of ["human", "plain", "json"] as const) {
			const result = await runPlanCheckArtifactsCommand(
				modeArgs(mode, "passing-plan"),
				async (projectRoot) => {
					await writePlanWithBody(
						projectRoot,
						"passing-plan",
						behaviorPlanMarkdown({
							slug: "passing-plan",
							behaviorId: "B-009",
							testFile: "tests/passing.test.ts",
							testName:
								"prints successful conformance output in human plain and json modes",
						}),
					);
					await writeTestFile(
						projectRoot,
						"tests/passing.test.ts",
						"@cosmo-behavior plan:passing-plan#B-009",
					);
				},
			);

			expect(result.stderr).toBe("");
			expect(result.exitCalls).toEqual([]);

			if (mode === "json") {
				expect(JSON.parse(result.stdout)).toMatchObject({
					ok: true,
					planSlug: "passing-plan",
					planPath: "missions/plans/passing-plan/plan.md",
					issues: [],
					behaviors: [
						{
							behaviorId: "B-009",
							marker: "@cosmo-behavior plan:passing-plan#B-009",
							testFile: "tests/passing.test.ts",
							issues: [],
						},
					],
				});
			} else if (mode === "plain") {
				expect(result.stdout).toBe(
					"ok artifact-conformance passing-plan behaviors=1 issues=0\n",
				);
			} else {
				expect(result.stdout).toBe(
					"Artifact conformance passed for passing-plan.\nBehaviors: 1\nIssues: 0\n",
				);
			}
		}
	});

	// @cosmo-behavior plan:artifact-conformance-gate#B-010
	it("prints conformance failures in human plain and json modes and exits non-zero", async () => {
		for (const mode of ["human", "plain", "json"] as const) {
			const result = await runPlanCheckArtifactsCommand(
				modeArgs(mode, "failing-plan"),
				async (projectRoot) => {
					await writePlanWithBody(
						projectRoot,
						"failing-plan",
						behaviorPlanMarkdown({
							slug: "failing-plan",
							behaviorId: "B-010",
							marker: "@cosmo-behavior plan:failing-plan#B-099",
							testFile: "tests/failing.test.ts",
							testName:
								"prints conformance failures in human plain and json modes and exits non-zero",
						}),
					);
					await writeTestFile(
						projectRoot,
						"tests/failing.test.ts",
						"@cosmo-behavior plan:failing-plan#B-010",
					);
				},
			);

			expect(result.stderr).toBe("");
			expect(result.exitCalls).toEqual([1]);

			if (mode === "json") {
				expect(JSON.parse(result.stdout)).toMatchObject({
					ok: false,
					planSlug: "failing-plan",
					issues: [
						{
							kind: "invalid-marker",
							behaviorId: "B-010",
							field: "marker",
							expected: "@cosmo-behavior plan:failing-plan#B-010",
							actual: "@cosmo-behavior plan:failing-plan#B-099",
						},
					],
				});
			} else if (mode === "plain") {
				expect(result.stdout).toContain(
					"fail artifact-conformance failing-plan behaviors=1 issues=1\n",
				);
				expect(result.stdout).toContain(
					"issue kind=invalid-marker behavior=B-010 field=marker line=",
				);
				expect(result.stdout).toContain(
					"Behavior B-010 marker must exactly match @cosmo-behavior plan:failing-plan#B-010.",
				);
			} else {
				expect(result.stdout).toContain(
					"Artifact conformance failed for failing-plan.",
				);
				expect(result.stdout).toContain("Behaviors: 1");
				expect(result.stdout).toContain("Issues: 1");
				expect(result.stdout).toContain(
					"- [invalid-marker] B-010 marker line ",
				);
				expect(result.stdout).toContain(
					"Behavior B-010 marker must exactly match @cosmo-behavior plan:failing-plan#B-010.",
				);
			}
		}
	});

	// @cosmo-behavior plan:artifact-conformance-gate#B-011
	it("reports invalid slug and missing plan diagnostics before scanning artifacts", async () => {
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
				modeArgs(mode, "archived-only"),
				async (projectRoot) => {
					const archivedPlanPath = join(
						projectRoot,
						"missions",
						"archive",
						"plans",
						"archived-only",
						"plan.md",
					);
					await mkdir(dirname(archivedPlanPath), { recursive: true });
					await writeFile(
						archivedPlanPath,
						behaviorPlanMarkdown({
							slug: "archived-only",
							behaviorId: "B-011",
							testFile: "tests/archived.test.ts",
							testName:
								"reports invalid slug and missing plan diagnostics before scanning artifacts",
						}),
					);
				},
			);

			expect(result.exitCalls).toEqual([1]);
			if (mode === "json") {
				expect(JSON.parse(result.stdout)).toEqual({
					error: "Plan not found: archived-only",
				});
				expect(result.stderr).toBe("");
			} else {
				expect(result.stdout).toBe("");
				expect(result.stderr).toBe("Error: Plan not found: archived-only\n");
			}
		}
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

async function writeTestFile(
	projectRoot: string,
	path: string,
	content: string,
): Promise<void> {
	const filePath = join(projectRoot, path);
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, `${content}\n`, "utf-8");
}

function behaviorPlanMarkdown({
	slug,
	behaviorId,
	marker = `@cosmo-behavior plan:${slug}#${behaviorId}`,
	testFile,
	testName,
}: {
	slug: string;
	behaviorId: string;
	marker?: string;
	testFile: string;
	testName: string;
}): string {
	return `## Behaviors

### ${behaviorId} - CLI behavior
- Source: AC-009
- Context: The plan artifact checker is invoked from the CLI.
- Action: The command validates the requested plan artifact.
- Expected: It prints mode-specific conformance diagnostics.
- Seam: \`cli/plans/commands/check-artifacts.ts\`
- Test: \`${testFile}\` > \`${testName}\`
- Marker: \`${marker}\`
`;
}
