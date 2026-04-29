import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { archivePlan } from "../../../../lib/plans/archive.ts";
import { PlanManager } from "../../../../lib/plans/plan-manager.ts";
import { TaskManager } from "../../../../lib/tasks/task-manager.ts";

const PlanStatusLiterals = [Type.Literal("active"), Type.Literal("completed")];

function createPlanManagers(cwd: string): {
	manager: PlanManager;
	taskManager: TaskManager;
} {
	return {
		manager: new PlanManager(cwd),
		taskManager: new TaskManager(cwd),
	};
}

export default function plansExtension(pi: ExtensionAPI) {
	// plan_create
	pi.registerTool({
		name: "plan_create",
		label: "Create Plan",
		description: "Create a new plan with optional description and spec",
		parameters: Type.Object({
			slug: Type.String({
				description: "Directory name slug, e.g. 'auth-system'",
			}),
			title: Type.String({ description: "Human-readable plan title" }),
			description: Type.Optional(
				Type.String({
					description: "Plan description (becomes body of plan.md)",
				}),
			),
			spec: Type.Optional(
				Type.String({
					description: "Spec content (creates spec.md if provided)",
				}),
			),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const manager = new PlanManager(ctx.cwd);
			const plan = await manager.createPlan({
				slug: params.slug,
				title: params.title,
				description: params.description,
				spec: params.spec,
			});
			const lines: string[] = [
				`Created plan: ${plan.slug}`,
				`Title: ${plan.title}`,
				`Status: ${plan.status}`,
			];
			if (plan.body) lines.push(`Description: ${plan.body}`);
			if (plan.spec) lines.push("Spec: included");
			return {
				content: [{ type: "text" as const, text: lines.join("\n") }],
				details: plan,
			};
		},
	});

	// plan_list
	pi.registerTool({
		name: "plan_list",
		label: "List Plans",
		description: "List plans with optional status filter",
		parameters: Type.Object({
			status: Type.Optional(
				Type.Union(PlanStatusLiterals, {
					description: "Filter by plan status",
				}),
			),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const { manager, taskManager } = createPlanManagers(ctx.cwd);
			const plans = await manager.listPlans(params.status);
			const summaries = await Promise.all(
				plans.map((p) => manager.getPlanSummary(p.slug, taskManager)),
			);
			const lines = summaries
				.filter((s): s is NonNullable<typeof s> => s !== null)
				.map(
					(s) =>
						`${s.slug} | ${s.status} | ${s.title} | ${s.taskCount} task(s)`,
				);
			return {
				content: [
					{
						type: "text" as const,
						text: lines.length > 0 ? lines.join("\n") : "No plans found",
					},
				],
				details: summaries.filter((s) => s !== null),
			};
		},
	});

	// plan_view
	pi.registerTool({
		name: "plan_view",
		label: "View Plan",
		description:
			"View a plan's full content, frontmatter state, and associated task summary",
		parameters: Type.Object({
			slug: Type.String({ description: "Plan slug (directory name)" }),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const { manager, taskManager } = createPlanManagers(ctx.cwd);
			const plan = await manager.getPlan(params.slug);
			if (!plan) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Plan not found: ${params.slug}`,
						},
					],
					details: null,
				};
			}
			const summary = await manager.getPlanSummary(params.slug, taskManager);
			const lines: string[] = [
				`${plan.slug}: ${plan.title}`,
				`Status: ${plan.status}`,
				`Tasks: ${summary?.taskCount ?? 0}`,
			];
			if (plan.behaviorsReviewPending !== undefined) {
				lines.push(`Behaviors review pending: ${plan.behaviorsReviewPending}`);
			}
			if (plan.body) {
				lines.push(`\nDescription:\n${plan.body}`);
			}
			if (plan.spec) {
				lines.push(`\nSpec:\n${plan.spec}`);
			}
			return {
				content: [{ type: "text" as const, text: lines.join("\n") }],
				details: { plan, summary },
			};
		},
	});

	// plan_edit
	pi.registerTool({
		name: "plan_edit",
		label: "Edit Plan",
		description:
			"Update an existing plan's title, status, body (description), spec content, or behaviorsReviewPending flag. All fields are optional — only provided fields are updated.",
		parameters: Type.Object({
			slug: Type.String({ description: "Plan slug to edit" }),
			title: Type.Optional(Type.String({ description: "New plan title" })),
			status: Type.Optional(
				Type.Union(PlanStatusLiterals, { description: "New plan status" }),
			),
			body: Type.Optional(
				Type.String({
					description:
						"New plan body/description (replaces existing content in plan.md)",
				}),
			),
			behaviorsReviewPending: Type.Optional(
				Type.Boolean({
					description:
						"Set or clear the pending behavior-review revision flag in plan frontmatter",
				}),
			),
			spec: Type.Optional(
				Type.String({
					description:
						"New spec content (replaces existing spec.md, or creates it)",
				}),
			),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const { slug, ...updates } = params;
			// Check at least one field is provided
			if (
				updates.title === undefined &&
				updates.status === undefined &&
				updates.body === undefined &&
				updates.behaviorsReviewPending === undefined &&
				updates.spec === undefined
			) {
				return {
					content: [
						{
							type: "text" as const,
							text: "No fields to update. Provide at least one of: title, status, body, behaviorsReviewPending, spec.",
						},
					],
					details: null,
				};
			}
			const manager = new PlanManager(ctx.cwd);
			const plan = await manager.updatePlan(slug, updates);
			const changed = [
				updates.title !== undefined ? "title" : null,
				updates.status !== undefined ? "status" : null,
				updates.body !== undefined ? "body" : null,
				updates.behaviorsReviewPending !== undefined
					? "behaviorsReviewPending"
					: null,
				updates.spec !== undefined ? "spec" : null,
			]
				.filter(Boolean)
				.join(", ");
			return {
				content: [
					{
						type: "text" as const,
						text: `Updated plan "${plan.slug}" (${changed})\nTitle: ${plan.title}\nStatus: ${plan.status}`,
					},
				],
				details: plan,
			};
		},
	});

	// plan_archive
	pi.registerTool({
		name: "plan_archive",
		label: "Archive Plan",
		description:
			"Archive a completed plan and its associated tasks to missions/archive/. Creates memory/ directory. Rejects if tasks are not all Done.",
		parameters: Type.Object({
			slug: Type.String({ description: "Plan slug to archive" }),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const planManager = new PlanManager(ctx.cwd);
			const taskManager = new TaskManager(ctx.cwd);
			const result = await archivePlan(
				ctx.cwd,
				params.slug,
				planManager,
				taskManager,
			);

			const text = [
				`Archived plan "${result.planSlug}"`,
				`Plan moved to: ${result.archivedPlanPath}`,
				`Tasks archived: ${result.archivedTaskFiles.length}`,
				result.archivedTaskFiles.length > 0
					? result.archivedTaskFiles.map((f) => `  - ${f}`).join("\n")
					: "",
				result.memoryDirEnsured ? "memory/ directory ensured" : "",
			]
				.filter(Boolean)
				.join("\n");

			return {
				content: [{ type: "text" as const, text }],
				details: result,
			};
		},
	});
}
