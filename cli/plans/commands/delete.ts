import * as readline from "node:readline";
import type { Command } from "commander";
import { PlanManager } from "../../../lib/plans/plan-manager.ts";

async function promptConfirm(message: string): Promise<boolean> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		rl.question(`${message} (y/N): `, (answer) => {
			rl.close();
			const normalized = answer.trim().toLowerCase();
			resolve(normalized === "y" || normalized === "yes");
		});
	});
}

export function registerDeleteCommand(program: Command): void {
	program
		.command("delete")
		.alias("rm")
		.description("Delete a plan")
		.argument("<slug>", "Plan slug to delete")
		.option("-f, --force", "Skip confirmation prompt")
		// Temporary migration debt: delete command prompt and archive checks are inline.
		// fallow-ignore-next-line complexity
		.action(async (slug, options) => {
			const projectRoot = process.cwd();
			const globalOptions = program.opts();

			const manager = new PlanManager(projectRoot);

			try {
				const plan = await manager.getPlan(slug);

				if (!plan) {
					const errorMsg = `Plan not found: ${slug}`;
					if (globalOptions.json) {
						console.log(JSON.stringify({ error: errorMsg }, null, 2));
					} else {
						console.error(`Error: ${errorMsg}`);
					}
					process.exit(1);
				}

				if (!options.force) {
					const confirmed = await promptConfirm(
						`Delete plan "${plan.slug}: ${plan.title}"?`,
					);
					if (!confirmed) {
						if (globalOptions.json) {
							console.log(
								JSON.stringify({ cancelled: true, slug: plan.slug }, null, 2),
							);
						} else if (globalOptions.plain) {
							console.log("cancelled");
						} else {
							console.log("Deletion cancelled.");
						}
						return;
					}
				}

				await manager.deletePlan(slug);

				if (globalOptions.json) {
					console.log(
						JSON.stringify(
							{
								deleted: true,
								slug: plan.slug,
								title: plan.title,
							},
							null,
							2,
						),
					);
				} else if (globalOptions.plain) {
					console.log(`deleted ${plan.slug}`);
				} else {
					console.log(`Deleted plan ${plan.slug}: ${plan.title}`);
				}
			} catch (error) {
				const errorMsg = `Error deleting plan: ${error}`;
				if (globalOptions.json) {
					console.log(JSON.stringify({ error: errorMsg }, null, 2));
				} else {
					console.error(errorMsg);
				}
				process.exit(1);
			}
		});
}
