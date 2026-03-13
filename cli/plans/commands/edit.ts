import type { Command } from "commander";
import { PlanManager } from "../../../lib/plans/plan-manager.ts";
import type {
	PlanStatus,
	PlanUpdateInput,
} from "../../../lib/plans/plan-types.ts";

const VALID_STATUSES: ReadonlySet<string> = new Set(["active", "completed"]);

function processEscapedNewlines(value: string): string {
	return value.replace(/\\n/g, "\n");
}

export function registerCommand(program: Command): void {
	program
		.command("edit")
		.alias("update")
		.description("Edit a plan")
		.argument("<slug>", "Plan slug to edit")
		.option("-t, --title <title>", "Update title")
		.option("-s, --status <status>", "Update status: active, completed")
		.option("-b, --body <text>", "Update plan body/description")
		.option("--spec <text>", "Update spec content")
		.action(async (slug, options) => {
			const projectRoot = process.cwd();
			const globalOptions = program.opts();

			const manager = new PlanManager(projectRoot);

			if (options.status && !VALID_STATUSES.has(options.status)) {
				const errorMsg = `Invalid status: ${options.status}. Must be one of: active, completed`;
				if (globalOptions.json) {
					console.log(JSON.stringify({ error: errorMsg }, null, 2));
				} else {
					console.error(`Error: ${errorMsg}`);
				}
				process.exit(1);
			}

			const updateInput: PlanUpdateInput = {};
			const changes: string[] = [];

			if (options.title) {
				updateInput.title = options.title;
				changes.push("title");
			}
			if (options.status) {
				updateInput.status = options.status as PlanStatus;
				changes.push("status");
			}
			if (options.body) {
				updateInput.body = processEscapedNewlines(options.body);
				changes.push("body");
			}
			if (options.spec) {
				updateInput.spec = processEscapedNewlines(options.spec);
				changes.push("spec");
			}

			if (changes.length === 0) {
				const errorMsg =
					"No changes specified. Use --help to see available options.";
				if (globalOptions.json) {
					console.log(JSON.stringify({ error: errorMsg }, null, 2));
				} else {
					console.error(`Error: ${errorMsg}`);
				}
				process.exit(1);
			}

			try {
				const plan = await manager.updatePlan(slug, updateInput);

				if (globalOptions.json) {
					console.log(JSON.stringify(plan, null, 2));
				} else if (globalOptions.plain) {
					console.log(`updated ${plan.slug}`);
					for (const field of changes) {
						console.log(`${field}=updated`);
					}
				} else {
					console.log(`Updated plan ${plan.slug}: ${plan.title}`);
					console.log(`Changed: ${changes.join(", ")}`);
				}
			} catch (error) {
				const errorMsg = `Error updating plan: ${error}`;
				if (globalOptions.json) {
					console.log(JSON.stringify({ error: errorMsg }, null, 2));
				} else {
					console.error(errorMsg);
				}
				process.exit(1);
			}
		});
}
