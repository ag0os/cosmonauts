import type { Command } from "commander";
import { PlanManager } from "../../../lib/plans/plan-manager.ts";
import type {
	Plan,
	PlanStatus,
	PlanUpdateInput,
} from "../../../lib/plans/plan-types.ts";
import { printCliError } from "../../shared/errors.ts";
import type { CliOutputMode, CliParseResult } from "../../shared/output.ts";
import { getOutputMode, printJson, printLines } from "../../shared/output.ts";

const VALID_STATUSES: ReadonlySet<string> = new Set(["active", "completed"]);

interface PlanEditCliOptions {
	title?: string;
	status?: string;
	body?: string;
	spec?: string;
}

function processEscapedNewlines(value: string): string {
	return value.replace(/\\n/g, "\n");
}

export function registerEditCommand(program: Command): void {
	program
		.command("edit")
		.alias("update")
		.description("Edit a plan")
		.argument("<slug>", "Plan slug to edit")
		.option("-t, --title <title>", "Update title")
		.option("-s, --status <status>", "Update status: active, completed")
		.option("-b, --body <text>", "Update plan body/description")
		.option("--spec <text>", "Update spec content")
		.action(async (slug: string, options: PlanEditCliOptions) => {
			const projectRoot = process.cwd();
			const globalOptions = program.opts();
			const mode = getOutputMode(globalOptions);

			const manager = new PlanManager(projectRoot);

			const update = buildPlanUpdate(options);
			if (!update.ok) {
				printCliError(update.error, globalOptions, { prefix: "Error" });
				process.exit(1);
				return;
			}

			try {
				const plan = await manager.updatePlan(slug, update.value.updateInput);
				const rendered = renderPlanEditSuccess(
					plan,
					update.value.changedFields,
					mode,
				);

				if (mode === "json") {
					printJson(rendered);
				} else {
					printLines(rendered as string[]);
				}
			} catch (error) {
				printCliError(`Error updating plan: ${String(error)}`, globalOptions);
				process.exit(1);
			}
		});
}

export function buildPlanUpdate(options: PlanEditCliOptions): CliParseResult<{
	updateInput: PlanUpdateInput;
	changedFields: string[];
}> {
	if (options.status && !VALID_STATUSES.has(options.status)) {
		return {
			ok: false,
			error: `Invalid status: ${options.status}. Must be one of: active, completed`,
		};
	}

	const updateInput: PlanUpdateInput = {};
	const changedFields: string[] = [];

	if (options.title) {
		updateInput.title = options.title;
		changedFields.push("title");
	}
	if (options.status) {
		updateInput.status = options.status as PlanStatus;
		changedFields.push("status");
	}
	if (options.body) {
		updateInput.body = processEscapedNewlines(options.body);
		changedFields.push("body");
	}
	if (options.spec) {
		updateInput.spec = processEscapedNewlines(options.spec);
		changedFields.push("spec");
	}

	if (changedFields.length === 0) {
		return {
			ok: false,
			error: "No changes specified. Use --help to see available options.",
		};
	}

	return { ok: true, value: { updateInput, changedFields } };
}

export function renderPlanEditSuccess(
	plan: Plan,
	changedFields: readonly string[],
	mode: CliOutputMode,
): unknown | string[] {
	if (mode === "json") {
		return plan;
	}

	if (mode === "plain") {
		return [
			`updated ${plan.slug}`,
			...changedFields.map((field) => `${field}=updated`),
		];
	}

	return [
		`Updated plan ${plan.slug}: ${plan.title}`,
		`Changed: ${changedFields.join(", ")}`,
	];
}
