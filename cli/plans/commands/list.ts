import type { Command } from "commander";
import { PlanManager } from "../../../lib/plans/plan-manager.ts";
import type { PlanStatus, PlanSummary } from "../../../lib/plans/plan-types.ts";
import { TaskManager } from "../../../lib/tasks/task-manager.ts";
import { printCliError } from "../../shared/errors.ts";
import type { CliOutputMode, CliParseResult } from "../../shared/output.ts";
import {
	getOutputMode,
	printJson,
	printLines,
	renderTable,
} from "../../shared/output.ts";

const VALID_STATUSES: ReadonlySet<string> = new Set(["active", "completed"]);

interface PlanListCliOptions {
	status?: string;
}

export function registerListCommand(program: Command): void {
	program
		.command("list")
		.alias("ls")
		.description("List all plans")
		.option("-s, --status <status>", "Filter by status: active, completed")
		.action(async (options: PlanListCliOptions) => {
			const projectRoot = process.cwd();
			const globalOptions = program.opts();
			const mode = getOutputMode(globalOptions);

			const planManager = new PlanManager(projectRoot);
			const taskManager = new TaskManager(projectRoot);
			const status = parsePlanStatusFilter(options.status);

			if (!status.ok) {
				printCliError(status.error, globalOptions);
				process.exit(1);
			}

			try {
				const summaries = await loadPlanSummaries(
					planManager,
					taskManager,
					status.value,
				);
				printPlanSummaries(summaries, mode);
			} catch (error) {
				printCliError(String(error), globalOptions, {
					prefix: "Error listing plans",
				});
				process.exit(1);
			}
		});
}

export function parsePlanStatusFilter(
	status: string | undefined,
): CliParseResult<PlanStatus | undefined> {
	if (!status) {
		return { ok: true, value: undefined };
	}

	if (!VALID_STATUSES.has(status)) {
		return {
			ok: false,
			error: `Invalid status: ${status}. Must be one of: active, completed`,
		};
	}

	return { ok: true, value: status as PlanStatus };
}

export async function loadPlanSummaries(
	planManager: PlanManager,
	taskManager: TaskManager,
	status?: PlanStatus,
): Promise<PlanSummary[]> {
	const plans = await planManager.listPlans(status);
	const summaries = await Promise.all(
		plans.map((plan) => planManager.getPlanSummary(plan.slug, taskManager)),
	);

	return summaries.filter(isPlanSummary);
}

export function renderPlanSummaries(
	summaries: readonly PlanSummary[],
	mode: CliOutputMode,
): unknown | string[] {
	if (mode === "json") {
		return summaries;
	}

	if (mode === "plain") {
		return summaries.map(renderPlanSummaryRow);
	}

	if (summaries.length === 0) {
		return ["No plans found"];
	}

	return renderPlanSummaryTable(summaries);
}

function printPlanSummaries(
	summaries: readonly PlanSummary[],
	mode: CliOutputMode,
): void {
	const rendered = renderPlanSummaries(summaries, mode);
	if (mode === "json") {
		printJson(rendered);
		return;
	}

	printLines(rendered as string[]);
}

function renderPlanSummaryRow(summary: PlanSummary): string {
	return `${summary.slug} | ${summary.status} | ${summary.taskCount} tasks | ${summary.title}`;
}

function renderPlanSummaryTable(summaries: readonly PlanSummary[]): string[] {
	return renderTable(summaries, [
		{
			header: "SLUG",
			width: (rows) =>
				Math.max(6, ...rows.map((summary) => summary.slug.length)),
			render: (summary) => summary.slug,
		},
		{
			header: "STATUS",
			width: () => 11,
			render: (summary) => summary.status,
		},
		{
			header: "TASKS",
			width: () => 7,
			render: (summary) => String(summary.taskCount),
		},
		{
			header: "TITLE",
			width: (rows) =>
				Math.max(
					...rows.map((summary) => summary.title.length),
					"TITLE".length,
				),
			render: (summary) => summary.title,
		},
	]);
}

function isPlanSummary(summary: PlanSummary | null): summary is PlanSummary {
	return summary !== null;
}
