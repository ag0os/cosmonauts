import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

interface TodoItem {
	id: string;
	content: string;
	status: "pending" | "in_progress" | "completed";
}

export default function todoExtension(pi: ExtensionAPI): void {
	let items: TodoItem[] = [];

	function persistState(): void {
		pi.appendEntry("todo", { items });
	}

	function formatList(todos: TodoItem[]): string {
		if (todos.length === 0) return "No todos.";
		return todos
			.map((t) => {
				const marker =
					t.status === "completed"
						? "[x]"
						: t.status === "in_progress"
							? "[~]"
							: "[ ]";
				return `${marker} ${t.id}: ${t.content}`;
			})
			.join("\n");
	}

	// todo_read
	pi.registerTool({
		name: "todo_read",
		label: "Read Todos",
		description: "Read the current session todo list",
		parameters: Type.Object({}),
		execute: async () => {
			return {
				content: [{ type: "text" as const, text: formatList(items) }],
				details: items,
			};
		},
	});

	// todo_write
	pi.registerTool({
		name: "todo_write",
		label: "Write Todos",
		description:
			"Replace the session todo list with the provided items. Send the full list each time (not a partial update).",
		parameters: Type.Object({
			todos: Type.Array(
				Type.Object({
					id: Type.String({ description: "Short identifier (e.g. '1', 'a')" }),
					content: Type.String({
						description: "What needs to be done (imperative form)",
					}),
					status: Type.Unsafe<"pending" | "in_progress" | "completed">({
						type: "string",
						enum: ["pending", "in_progress", "completed"],
						description: "Task status",
					}),
				}),
				{ description: "The complete todo list (replaces existing)" },
			),
		}),
		execute: async (_toolCallId, params) => {
			items = params.todos;
			persistState();
			return {
				content: [{ type: "text" as const, text: formatList(items) }],
				details: items,
			};
		},
	});

	// Inject current todos before each agent turn (if non-empty)
	pi.on("before_agent_start", async () => {
		if (items.length === 0) return;
		const pending = items.filter((t) => t.status !== "completed");
		if (pending.length === 0) return;
		return {
			message: {
				customType: "todo-context",
				content: `Current session todos:\n${formatList(items)}`,
				display: false,
			},
		};
	});

	// Filter stale todo context from prior turns
	pi.on("context", async (event) => {
		return {
			messages: event.messages.filter((m) => {
				const msg = m as { customType?: string };
				return msg.customType !== "todo-context";
			}),
		};
	});

	// Restore state on session resume
	pi.on("session_start", async (_event, ctx) => {
		const entries = ctx.sessionManager.getEntries();
		const todoEntry = entries
			.filter(
				(e: { type: string; customType?: string }) =>
					e.type === "custom" && e.customType === "todo",
			)
			.pop() as { data?: { items?: TodoItem[] } } | undefined;

		if (todoEntry?.data?.items) {
			items = todoEntry.data.items;
		}
	});
}
