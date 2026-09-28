import type { Command } from "commander";
import { archivePlan } from "../../../lib/plans/archive.ts";
import { createPlanManagers, failPlanCommand } from "./support.ts";

export function registerArchiveCommand(program: Command): void {
	program
		.command("archive")
		.description("Archive a completed plan and its tasks")
		.argument("<slug>", "Plan slug to archive")
		.action(async (slug) => {
			const projectRoot = process.cwd();
			const globalOptions = program.opts();

			const { planManager, taskManager } = createPlanManagers(projectRoot);

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
				failPlanCommand({
					message: `Error archiving plan: ${error}`,
					json: globalOptions.json,
				});
			}
		});
}
