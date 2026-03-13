import type { Command } from "commander";
import { archivePlan } from "../../../lib/plans/archive.ts";
import { PlanManager } from "../../../lib/plans/plan-manager.ts";
import { TaskManager } from "../../../lib/tasks/task-manager.ts";

export function registerCommand(program: Command): void {
	program
		.command("archive")
		.description("Archive a completed plan and its tasks")
		.argument("<slug>", "Plan slug to archive")
		.action(async (slug) => {
			const projectRoot = process.cwd();
			const globalOptions = program.opts();

			const planManager = new PlanManager(projectRoot);
			const taskManager = new TaskManager(projectRoot);

			try {
				const result = await archivePlan(
					projectRoot,
					slug,
					planManager,
					taskManager,
				);

				if (globalOptions.json) {
					console.log(JSON.stringify(result, null, 2));
				} else if (globalOptions.plain) {
					console.log(`archived ${result.planSlug}`);
					console.log(`plan=${result.archivedPlanPath}`);
					console.log(`tasks=${result.archivedTaskFiles.length}`);
				} else {
					console.log(`Archived plan ${result.planSlug}`);
					console.log(`  Plan moved to: ${result.archivedPlanPath}`);
					if (result.archivedTaskFiles.length > 0) {
						console.log(
							`  Archived ${result.archivedTaskFiles.length} task(s)`,
						);
					}
				}
			} catch (error) {
				const errorMsg = `Error archiving plan: ${error}`;
				if (globalOptions.json) {
					console.log(JSON.stringify({ error: errorMsg }, null, 2));
				} else {
					console.error(errorMsg);
				}
				process.exit(1);
			}
		});
}
