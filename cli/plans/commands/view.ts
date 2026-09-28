import type { Command } from "commander";
import type { Plan } from "../../../lib/plans/plan-types.ts";
import { createPlanManagers, failPlanCommand } from "./support.ts";

function formatDate(date: Date): string {
	const datePart = date.toISOString().split("T")[0];
	return datePart ?? date.toISOString();
}

function outputPlain(plan: Plan, taskCount: number): void {
	console.log(`slug=${plan.slug}`);
	console.log(`title=${plan.title}`);
	console.log(`status=${plan.status}`);
	console.log(`created=${plan.createdAt.toISOString()}`);
	console.log(`updated=${plan.updatedAt.toISOString()}`);
	console.log(`taskCount=${taskCount}`);
	if (plan.body) {
		console.log(`body=${plan.body.replace(/\n/g, "\\n")}`);
	}
	if (plan.spec) {
		console.log(`spec=${plan.spec.replace(/\n/g, "\\n")}`);
	}
}

function outputFormatted(plan: Plan, taskCount: number): void {
	const headerText = `${plan.slug}: ${plan.title}`;
	console.log(headerText);
	console.log("\u2501".repeat(Math.min(headerText.length + 2, 60)));
	console.log();

	console.log(`Status: ${plan.status}`);
	console.log(`Tasks: ${taskCount}`);
	console.log(`Created: ${formatDate(plan.createdAt)}`);
	console.log(`Updated: ${formatDate(plan.updatedAt)}`);

	if (plan.body) {
		console.log();
		console.log("Description:");
		for (const line of plan.body.split("\n")) {
			console.log(`  ${line}`);
		}
	}

	if (plan.spec) {
		console.log();
		console.log("Spec:");
		for (const line of plan.spec.split("\n")) {
			console.log(`  ${line}`);
		}
	}
}

export function registerViewCommand(program: Command): void {
	program
		.command("view")
		.alias("show")
		.description("View a plan")
		.argument("<slug>", "Plan slug to view")
		.action(async (slug) => {
			const projectRoot = process.cwd();
			const globalOptions = program.opts();

			const { planManager, taskManager } = createPlanManagers(projectRoot);

			try {
				const summary = await planManager.getPlanSummary(slug, taskManager);

				if (!summary) {
					failPlanCommand({
						message: `Plan not found: ${slug}`,
						json: globalOptions.json,
						consolePrefix: "Error: ",
					});
				}

				const plan = await planManager.getPlan(slug);
				if (!plan) {
					failPlanCommand({
						message: `Plan not found: ${slug}`,
						json: globalOptions.json,
						consolePrefix: "Error: ",
					});
				}

				if (globalOptions.json) {
					console.log(
						JSON.stringify({ ...plan, taskCount: summary.taskCount }, null, 2),
					);
				} else if (globalOptions.plain) {
					outputPlain(plan, summary.taskCount);
				} else {
					outputFormatted(plan, summary.taskCount);
				}
			} catch (error) {
				failPlanCommand({
					message: `Error viewing plan: ${error}`,
					json: globalOptions.json,
				});
			}
		});
}
