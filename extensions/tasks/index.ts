import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { TaskManager } from "../../lib/tasks/task-manager.ts";

export default function tasksExtension(pi: ExtensionAPI) {
	// task_create
	pi.registerTool({
		name: "task_create",
		label: "Create Task",
		description: "Create a new task in the task system",
		parameters: Type.Object({
			title: Type.String({ description: "Task title" }),
			description: Type.Optional(
				Type.String({ description: "Task description" }),
			),
			priority: Type.Optional(
				Type.Unsafe<"high" | "medium" | "low">({
					type: "string",
					enum: ["high", "medium", "low"],
					description: "Priority level",
				}),
			),
			assignee: Type.Optional(Type.String({ description: "Assignee name" })),
			labels: Type.Optional(
				Type.Array(Type.String(), { description: "Labels for categorization" }),
			),
			dependencies: Type.Optional(
				Type.Array(Type.String(), { description: "IDs of dependency tasks" }),
			),
			acceptanceCriteria: Type.Optional(
				Type.Array(Type.String(), {
					description: "Acceptance criteria as text strings",
				}),
			),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const manager = new TaskManager(ctx.cwd);
			const task = await manager.createTask(params);
			return {
				content: [
					{
						type: "text" as const,
						text: `Created task ${task.id}: ${task.title}`,
					},
				],
				details: task,
			};
		},
	});

	// task_list
	pi.registerTool({
		name: "task_list",
		label: "List Tasks",
		description: "List tasks with optional filters",
		parameters: Type.Object({
			status: Type.Optional(
				Type.Unsafe<"To Do" | "In Progress" | "Done" | "Blocked">({
					type: "string",
					enum: ["To Do", "In Progress", "Done", "Blocked"],
					description: "Filter by status",
				}),
			),
			priority: Type.Optional(
				Type.Unsafe<"high" | "medium" | "low">({
					type: "string",
					enum: ["high", "medium", "low"],
					description: "Filter by priority",
				}),
			),
			assignee: Type.Optional(
				Type.String({ description: "Filter by assignee" }),
			),
			label: Type.Optional(Type.String({ description: "Filter by label" })),
			hasNoDependencies: Type.Optional(
				Type.Boolean({ description: "Only show tasks with no dependencies" }),
			),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const manager = new TaskManager(ctx.cwd);
			const filter = Object.fromEntries(
				Object.entries(params).filter(([_, v]) => v !== undefined),
			);
			const tasks = await manager.listTasks(
				Object.keys(filter).length > 0 ? filter : undefined,
			);
			const lines = tasks.map(
				(t) => `${t.id} | ${t.status} | ${t.priority || "-"} | ${t.title}`,
			);
			return {
				content: [
					{
						type: "text" as const,
						text: lines.length > 0 ? lines.join("\n") : "No tasks found",
					},
				],
				details: tasks,
			};
		},
	});

	// task_view
	pi.registerTool({
		name: "task_view",
		label: "View Task",
		description: "View a single task by ID",
		parameters: Type.Object({
			taskId: Type.String({ description: "Task ID (e.g., TASK-001)" }),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const manager = new TaskManager(ctx.cwd);
			const task = await manager.getTask(params.taskId);
			if (!task) {
				return {
					content: [
						{ type: "text" as const, text: `Task not found: ${params.taskId}` },
					],
					details: null,
				};
			}
			const lines: string[] = [
				`${task.id}: ${task.title}`,
				`Status: ${task.status}`,
			];
			if (task.priority) lines.push(`Priority: ${task.priority}`);
			if (task.assignee) lines.push(`Assignee: ${task.assignee}`);
			if (task.labels.length > 0)
				lines.push(`Labels: ${task.labels.join(", ")}`);
			if (task.dependencies.length > 0)
				lines.push(`Dependencies: ${task.dependencies.join(", ")}`);
			if (task.description) lines.push(`\nDescription:\n${task.description}`);
			if (task.implementationPlan)
				lines.push(`\nImplementation Plan:\n${task.implementationPlan}`);
			if (task.acceptanceCriteria.length > 0) {
				lines.push("\nAcceptance Criteria:");
				for (const ac of task.acceptanceCriteria) {
					lines.push(`  ${ac.checked ? "[x]" : "[ ]"} #${ac.index} ${ac.text}`);
				}
			}
			if (task.implementationNotes)
				lines.push(`\nImplementation Notes:\n${task.implementationNotes}`);
			return {
				content: [{ type: "text" as const, text: lines.join("\n") }],
				details: task,
			};
		},
	});

	// task_edit
	pi.registerTool({
		name: "task_edit",
		label: "Edit Task",
		description: "Update an existing task",
		parameters: Type.Object({
			taskId: Type.String({ description: "Task ID to edit" }),
			title: Type.Optional(Type.String({ description: "New title" })),
			status: Type.Optional(
				Type.Unsafe<"To Do" | "In Progress" | "Done" | "Blocked">({
					type: "string",
					enum: ["To Do", "In Progress", "Done", "Blocked"],
					description: "New status",
				}),
			),
			priority: Type.Optional(
				Type.Unsafe<"high" | "medium" | "low">({
					type: "string",
					enum: ["high", "medium", "low"],
					description: "New priority",
				}),
			),
			assignee: Type.Optional(Type.String({ description: "New assignee" })),
			description: Type.Optional(
				Type.String({ description: "New description" }),
			),
			implementationPlan: Type.Optional(
				Type.String({ description: "New implementation plan" }),
			),
			implementationNotes: Type.Optional(
				Type.String({ description: "New implementation notes" }),
			),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const { taskId, ...updateFields } = params;
			const update = Object.fromEntries(
				Object.entries(updateFields).filter(([_, v]) => v !== undefined),
			);
			const manager = new TaskManager(ctx.cwd);
			const task = await manager.updateTask(taskId, update);
			return {
				content: [
					{
						type: "text" as const,
						text: `Updated task ${task.id}: ${task.title}`,
					},
				],
				details: task,
			};
		},
	});

	// task_search
	pi.registerTool({
		name: "task_search",
		label: "Search Tasks",
		description: "Search tasks by query string",
		parameters: Type.Object({
			query: Type.String({ description: "Search query" }),
			status: Type.Optional(
				Type.Unsafe<"To Do" | "In Progress" | "Done" | "Blocked">({
					type: "string",
					enum: ["To Do", "In Progress", "Done", "Blocked"],
					description: "Filter by status",
				}),
			),
			priority: Type.Optional(
				Type.Unsafe<"high" | "medium" | "low">({
					type: "string",
					enum: ["high", "medium", "low"],
					description: "Filter by priority",
				}),
			),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const { query, ...filterFields } = params;
			const filter = Object.fromEntries(
				Object.entries(filterFields).filter(([_, v]) => v !== undefined),
			);
			const manager = new TaskManager(ctx.cwd);
			const tasks = await manager.search(
				query,
				Object.keys(filter).length > 0 ? filter : undefined,
			);
			const lines = tasks.map(
				(t) => `${t.id} | ${t.status} | ${t.priority || "-"} | ${t.title}`,
			);
			return {
				content: [
					{
						type: "text" as const,
						text:
							lines.length > 0
								? `Found ${tasks.length} task(s):\n${lines.join("\n")}`
								: `No tasks found matching "${query}"`,
					},
				],
				details: tasks,
			};
		},
	});
}
