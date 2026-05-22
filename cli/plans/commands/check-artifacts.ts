import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Command } from "commander";
import {
	type ArtifactConformanceIssue,
	type ArtifactConformanceResult,
	checkBehaviorConformance,
} from "../../../lib/artifacts/index.ts";
import { validateSlug } from "../../../lib/plans/plan-manager.ts";
import { printCliError } from "../../shared/errors.ts";
import type { CliOutputMode, CliParseResult } from "../../shared/output.ts";
import { getOutputMode, printJson, printLines } from "../../shared/output.ts";

interface LoadedPlanArtifact {
	slug: string;
	path: string;
	markdown: string;
}

export function registerCheckArtifactsCommand(program: Command): void {
	program
		.command("check-artifacts")
		.description("Check plan behavior artifact conformance")
		.argument("<slug>", "Plan slug to check")
		.action(async (slug: string) => {
			const projectRoot = process.cwd();
			const globalOptions = program.opts();
			const mode = getOutputMode(globalOptions);

			const loaded = await loadPlanArtifact(projectRoot, slug);
			if (!loaded.ok) {
				printCliError(loaded.error, globalOptions, {
					prefix: "Error",
				});
				process.exit(1);
			}

			const result = checkBehaviorConformance({
				planMarkdown: loaded.value.markdown,
				planSlug: loaded.value.slug,
				planPath: loaded.value.path,
				projectRoot,
			});

			printArtifactConformanceResult(result, mode);
			if (!result.ok) {
				process.exit(1);
			}
		});
}

export async function loadPlanArtifact(
	projectRoot: string,
	slug: string,
): Promise<CliParseResult<LoadedPlanArtifact>> {
	try {
		validateSlug(slug);
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}

	const planPath = `missions/plans/${slug}/plan.md`;
	const absolutePlanPath = join(
		projectRoot,
		"missions",
		"plans",
		slug,
		"plan.md",
	);

	try {
		return {
			ok: true,
			value: {
				slug,
				path: planPath,
				markdown: await readFile(absolutePlanPath, "utf-8"),
			},
		};
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return {
				ok: false,
				error: `Plan not found: ${slug}`,
			};
		}

		return {
			ok: false,
			error: String(error),
		};
	}
}

export function renderArtifactConformanceResult(
	result: ArtifactConformanceResult,
	mode: CliOutputMode,
): unknown | string[] {
	if (mode === "json") {
		return result;
	}

	if (mode === "plain") {
		return renderPlainArtifactConformanceResult(result);
	}

	return renderHumanArtifactConformanceResult(result);
}

function printArtifactConformanceResult(
	result: ArtifactConformanceResult,
	mode: CliOutputMode,
): void {
	const rendered = renderArtifactConformanceResult(result, mode);
	if (mode === "json") {
		printJson(rendered);
		return;
	}

	printLines(rendered as string[]);
}

function renderPlainArtifactConformanceResult(
	result: ArtifactConformanceResult,
): string[] {
	const status = result.ok ? "ok" : "fail";
	const lines = [
		`${status} artifact-conformance ${result.planSlug} behaviors=${result.behaviors.length} issues=${result.issues.length}`,
	];

	for (const issue of result.issues) {
		lines.push(renderPlainIssue(issue));
	}

	return lines;
}

function renderHumanArtifactConformanceResult(
	result: ArtifactConformanceResult,
): string[] {
	const status = result.ok ? "passed" : "failed";
	const lines = [
		`Artifact conformance ${status} for ${result.planSlug}.`,
		`Behaviors: ${result.behaviors.length}`,
		`Issues: ${result.issues.length}`,
	];

	if (!result.ok) {
		lines.push("");
		for (const issue of result.issues) {
			lines.push(`- ${renderHumanIssue(issue)}`);
		}
	}

	return lines;
}

function renderPlainIssue(issue: ArtifactConformanceIssue): string {
	const parts = [
		`issue kind=${issue.kind}`,
		issue.behaviorId ? `behavior=${issue.behaviorId}` : undefined,
		issue.field ? `field=${issue.field}` : undefined,
		issue.line ? `line=${issue.line}` : undefined,
		issue.path ? `path=${issue.path}` : undefined,
		issue.marker ? `marker=${issue.marker}` : undefined,
		issue.expected ? `expected=${issue.expected}` : undefined,
		issue.actual ? `actual=${issue.actual}` : undefined,
		`message=${issue.message}`,
	];

	return parts.filter(isDefined).join(" ");
}

function renderHumanIssue(issue: ArtifactConformanceIssue): string {
	const evidence = [
		issue.behaviorId,
		issue.field,
		issue.line ? `line ${issue.line}` : undefined,
		issue.path,
	]
		.filter(isDefined)
		.join(" ");

	return evidence
		? `[${issue.kind}] ${evidence}: ${issue.message}`
		: `[${issue.kind}] ${issue.message}`;
}

function isDefined<T>(value: T | undefined): value is T {
	return value !== undefined;
}
