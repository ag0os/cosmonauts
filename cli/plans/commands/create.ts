import type { Command } from "commander";
import { PlanManager } from "../../../lib/plans/plan-manager.ts";
import type { PlanCreateInput } from "../../../lib/plans/plan-types.ts";

export function registerCommand(program: Command): void {
	program
		.command("create")
		.description("Create a new plan")
		.requiredOption("--slug <slug>", "Plan slug (lowercase, hyphenated)")
		.requiredOption("--title <title>", "Plan title")
		.option("--description <text>", "Plan description (becomes plan.md body)")
		.option("--spec <text>", "Spec content (creates spec.md)")
		.action(async (options) => {
			const projectRoot = process.cwd();
			const globalOptions = program.opts();

			const manager = new PlanManager(projectRoot);

			const input: PlanCreateInput = {
				slug: options.slug,
				title: options.title,
				description: options.description,
				spec: options.spec,
			};

			try {
				const plan = await manager.createPlan(input);

				if (globalOptions.json) {
					console.log(JSON.stringify(plan, null, 2));
				} else if (globalOptions.plain) {
					console.log(plan.slug);
				} else {
					console.log(`Created plan ${plan.slug}: ${plan.title}`);
				}
			} catch (error) {
				if (globalOptions.json) {
					console.log(JSON.stringify({ error: String(error) }, null, 2));
				} else {
					console.error(`Error creating plan: ${error}`);
				}
				process.exit(1);
			}
		});
}
