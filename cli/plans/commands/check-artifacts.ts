import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Command } from "commander";
import {
	checkPlanConformance,
	type PlanConformanceAdvisory,
	type PlanConformanceIssue,
	type PlanConformanceResult,
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
		.description("Check a plan's Decision Log citations and supersession dates")
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

			const result = checkPlanConformance({
				planMarkdown: loaded.value.markdown,
				planSlug: loaded.value.slug,
				planPath: loaded.value.path,
			});

			printPlanConformanceResult(result, mode);
			if (!result.ok) {
				process.exit(1);
			}
		});
}

/** Plan lifecycle locations, in resolution order. */
const PLAN_LOCATIONS = [
	["missions", "plans"],
	["missions", "archive", "plans"],
] as const;

async function loadPlanArtifact(
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

	for (const location of PLAN_LOCATIONS) {
		const segments = [...location, slug, "plan.md"];
		try {
			return {
				ok: true,
				value: {
					slug,
					path: segments.join("/"),
					markdown: await readFile(join(projectRoot, ...segments), "utf-8"),
				},
			};
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				return {
					ok: false,
					error: String(error),
				};
			}
		}
	}

	return {
		ok: false,
		error: `Plan not found: ${slug}`,
	};
}

export function renderPlanConformanceResult(
	result: PlanConformanceResult,
	mode: CliOutputMode,
): unknown | string[] {
	if (mode === "json") {
		return result;
	}

	if (mode === "plain") {
		return renderPlainPlanConformanceResult(result);
	}

	return renderHumanPlanConformanceResult(result);
}

function printPlanConformanceResult(
	result: PlanConformanceResult,
	mode: CliOutputMode,
): void {
	const rendered = renderPlanConformanceResult(result, mode);
	if (mode === "json") {
		printJson(rendered);
		return;
	}

	printLines(rendered as string[]);
}

function renderPlainPlanConformanceResult(
	result: PlanConformanceResult,
): string[] {
	const status = result.ok ? "ok" : "fail";
	const lines = [
		`${status} plan-conformance ${result.planSlug} behaviors=${result.behaviorCount} issues=${result.issues.length} advisories=${result.advisories.length}`,
	];

	for (const issue of result.issues) {
		lines.push(renderPlainIssue(issue));
	}
	for (const advisory of result.advisories) {
		lines.push(renderPlainAdvisory(advisory));
	}

	return lines.map(escapeTerminalControls);
}

function renderHumanPlanConformanceResult(
	result: PlanConformanceResult,
): string[] {
	const status = result.ok ? "passed" : "failed";
	const lines = [
		`Plan conformance ${status} for ${result.planSlug}.`,
		`Behaviors: ${result.behaviorCount}`,
		`Issues: ${result.issues.length}`,
		`Advisories: ${result.advisories.length}`,
	];

	if (!result.ok) {
		lines.push("");
		for (const issue of result.issues) {
			lines.push(`- ${renderHumanIssue(issue)}`);
		}
	}
	if (result.advisories.length > 0) {
		lines.push("", "Advisories:");
		for (const advisory of result.advisories) {
			lines.push(`- [${advisory.kind}] ${advisory.message}`);
		}
	}

	return lines.map(escapeTerminalControls);
}

function renderPlainIssue(issue: PlanConformanceIssue): string {
	const parts = [
		`issue kind=${issue.kind}`,
		issue.line ? `line=${issue.line}` : undefined,
		issue.actual ? `actual=${issue.actual}` : undefined,
		`message=${issue.message}`,
	];

	return parts.filter(isDefined).join(" ");
}

function renderPlainAdvisory(advisory: PlanConformanceAdvisory): string {
	return [
		`advisory kind=${advisory.kind}`,
		`count=${advisory.count}`,
		`guidance=${advisory.guidance}`,
		`message=${advisory.message}`,
	].join(" ");
}

function renderHumanIssue(issue: PlanConformanceIssue): string {
	return issue.line
		? `[${issue.kind}] line ${issue.line}: ${issue.message}`
		: `[${issue.kind}] ${issue.message}`;
}

function escapeTerminalControls(value: string): string {
	return Array.from(value, (character) => {
		const code = character.charCodeAt(0);
		if (code > 31 && (code < 127 || code > 159)) return character;
		return `\\u${code.toString(16).padStart(4, "0")}`;
	}).join("");
}

function isDefined<T>(value: T | undefined): value is T {
	return value !== undefined;
}
