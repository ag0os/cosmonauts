import type { Command } from "commander";
import { PlanManager } from "../../../lib/plans/plan-manager.ts";
import type { Plan } from "../../../lib/plans/plan-types.ts";
import { printCliError } from "../../shared/errors.ts";
import type { CliOutputMode, CliParseResult } from "../../shared/output.ts";
import { getOutputMode, printJson, printLines } from "../../shared/output.ts";
import { promptConfirm } from "../../shared/prompt.ts";

interface PlanDeleteCliOptions {
	force?: boolean;
}

export type PlanDeleteResult =
	| { status: "deleted"; plan: Plan }
	| { status: "cancelled"; plan: Plan };

export function registerDeleteCommand(program: Command): void {
	program
		.command("delete")
		.alias("rm")
		.description("Delete a plan")
		.argument("<slug>", "Plan slug to delete")
		.option("-f, --force", "Skip confirmation prompt")
		.action(async (slug: string, options: PlanDeleteCliOptions) => {
			const projectRoot = process.cwd();
			const globalOptions = program.opts();
			const mode = getOutputMode(globalOptions);

			const manager = new PlanManager(projectRoot);

			try {
				const plan = await loadPlanForDeletion(manager, slug);
				if (!plan.ok) {
					printCliError(plan.error, globalOptions, { prefix: "Error" });
					process.exit(1);
					return;
				}

				const confirmed = await confirmPlanDeletion(plan.value, options.force);
				if (!confirmed) {
					printPlanDeleteResult(
						{ status: "cancelled", plan: plan.value },
						mode,
					);
					return;
				}

				await manager.deletePlan(slug);
				printPlanDeleteResult({ status: "deleted", plan: plan.value }, mode);
			} catch (error) {
				printCliError(`Error deleting plan: ${String(error)}`, globalOptions);
				process.exit(1);
			}
		});
}

export async function loadPlanForDeletion(
	manager: PlanManager,
	slug: string,
): Promise<CliParseResult<Plan>> {
	const plan = await manager.getPlan(slug);

	if (!plan) {
		return { ok: false, error: `Plan not found: ${slug}` };
	}

	return { ok: true, value: plan };
}

export async function confirmPlanDeletion(
	plan: Plan,
	force = false,
): Promise<boolean> {
	if (force) {
		return true;
	}

	return promptConfirm(`Delete plan "${plan.slug}: ${plan.title}"?`);
}

export function renderPlanDeleteResult(
	result: PlanDeleteResult,
	mode: CliOutputMode,
): unknown | string[] {
	if (result.status === "cancelled") {
		return renderPlanDeleteCancellation(result.plan, mode);
	}

	return renderPlanDeleteSuccess(result.plan, mode);
}

function printPlanDeleteResult(
	result: PlanDeleteResult,
	mode: CliOutputMode,
): void {
	const rendered = renderPlanDeleteResult(result, mode);
	if (mode === "json") {
		printJson(rendered);
		return;
	}

	printLines(rendered as string[]);
}

function renderPlanDeleteCancellation(
	plan: Plan,
	mode: CliOutputMode,
): unknown | string[] {
	if (mode === "json") {
		return { cancelled: true, slug: plan.slug };
	}

	if (mode === "plain") {
		return ["cancelled"];
	}

	return ["Deletion cancelled."];
}

function renderPlanDeleteSuccess(
	plan: Plan,
	mode: CliOutputMode,
): unknown | string[] {
	if (mode === "json") {
		return {
			deleted: true,
			slug: plan.slug,
			title: plan.title,
		};
	}

	if (mode === "plain") {
		return [`deleted ${plan.slug}`];
	}

	return [`Deleted plan ${plan.slug}: ${plan.title}`];
}
