import type { Command } from "commander";
import { PlanManager } from "../../../lib/plans/plan-manager.ts";
import type { PlanStatus } from "../../../lib/plans/plan-types.ts";
import { TaskManager } from "../../../lib/tasks/task-manager.ts";

const VALID_STATUSES: ReadonlySet<string> = new Set(["active", "completed"]);

export function registerCommand(program: Command): void {
	program
		.command("list")
		.alias("ls")
		.description("List all plans")
		.option("-s, --status <status>", "Filter by status: active, completed")
		.action(async (options) => {
			const projectRoot = process.cwd();
			const globalOptions = program.opts();

			const planManager = new PlanManager(projectRoot);
			const taskManager = new TaskManager(projectRoot);

			if (options.status && !VALID_STATUSES.has(options.status)) {
				const errorMsg = `Invalid status: ${options.status}. Must be one of: active, completed`;
				if (globalOptions.json) {
					console.log(JSON.stringify({ error: errorMsg }, null, 2));
				} else {
					console.error(errorMsg);
				}
				process.exit(1);
			}

			try {
				const statusFilter = options.status as PlanStatus | undefined;
				const plans = await planManager.listPlans(statusFilter);

				// Get summaries with task counts
				const summaries = await Promise.all(
					plans.map((p) => planManager.getPlanSummary(p.slug, taskManager)),
				);

				if (globalOptions.json) {
					console.log(JSON.stringify(summaries, null, 2));
				} else if (globalOptions.plain) {
					for (const summary of summaries) {
						if (summary) {
							console.log(
								`${summary.slug} | ${summary.status} | ${summary.taskCount} tasks | ${summary.title}`,
							);
						}
					}
				} else {
					if (summaries.length === 0) {
						console.log("No plans found");
						return;
					}

					const slugWidth = Math.max(
						6,
						...summaries.map((s) => s?.slug.length ?? 0),
					);
					const statusWidth = 11;
					const tasksWidth = 7;

					const header = [
						"SLUG".padEnd(slugWidth),
						"STATUS".padEnd(statusWidth),
						"TASKS".padEnd(tasksWidth),
						"TITLE",
					].join("  ");
					console.log(header);

					for (const summary of summaries) {
						if (summary) {
							const slug = summary.slug.padEnd(slugWidth);
							const status = summary.status.padEnd(statusWidth);
							const tasks = String(summary.taskCount).padEnd(tasksWidth);
							console.log(`${slug}  ${status}  ${tasks}  ${summary.title}`);
						}
					}
				}
			} catch (error) {
				if (globalOptions.json) {
					console.log(JSON.stringify({ error: String(error) }, null, 2));
				} else {
					console.error(`Error listing plans: ${error}`);
				}
				process.exit(1);
			}
		});
}
