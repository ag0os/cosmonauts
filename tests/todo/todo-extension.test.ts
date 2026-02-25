/**
 * Tests for the todo extension.
 * Uses a mock ExtensionAPI to capture registered tools and event handlers,
 * then tests them directly.
 */

import { beforeEach, describe, expect, test } from "vitest";

// Minimal mock of Pi's ExtensionAPI — captures registrations
interface RegisteredTool {
	name: string;
	execute: (...args: unknown[]) => Promise<unknown>;
}

type EventHandler = (event: unknown, ctx: unknown) => Promise<unknown>;

function createMockPi() {
	const tools = new Map<string, RegisteredTool>();
	const events = new Map<string, EventHandler[]>();
	const entries: { customType: string; data: unknown }[] = [];

	return {
		tools,
		events,
		entries,

		registerTool(def: {
			name: string;
			execute: (...args: unknown[]) => Promise<unknown>;
		}) {
			tools.set(def.name, def);
		},

		on(event: string, handler: EventHandler) {
			if (!events.has(event)) events.set(event, []);
			events.get(event)!.push(handler);
		},

		appendEntry(customType: string, data: unknown) {
			entries.push({ customType, data });
		},

		// Helpers to invoke tools/events in tests
		async callTool(name: string, params: unknown) {
			const tool = tools.get(name);
			if (!tool) throw new Error(`Tool not found: ${name}`);
			return tool.execute("call-id", params, undefined, undefined, {
				cwd: "/tmp",
			});
		},

		async fireEvent(name: string, event: unknown = {}, ctx: unknown = {}) {
			const handlers = events.get(name) ?? [];
			let result: unknown;
			for (const handler of handlers) {
				result = await handler(event, ctx);
			}
			return result;
		},
	};
}

// Import and initialize the extension
async function setupExtension() {
	const { default: todoExtension } = await import(
		"../../extensions/todo/index.ts"
	);
	const pi = createMockPi();
	todoExtension(pi as never);
	return pi;
}

describe("todo extension", () => {
	let pi: Awaited<ReturnType<typeof setupExtension>>;

	beforeEach(async () => {
		pi = await setupExtension();
	});

	test("registers todo_read and todo_write tools", () => {
		expect(pi.tools.has("todo_read")).toBe(true);
		expect(pi.tools.has("todo_write")).toBe(true);
	});

	test("registers event handlers", () => {
		expect(pi.events.has("before_agent_start")).toBe(true);
		expect(pi.events.has("context")).toBe(true);
		expect(pi.events.has("session_start")).toBe(true);
	});

	describe("todo_read", () => {
		test("returns empty list initially", async () => {
			const result = (await pi.callTool("todo_read", {})) as {
				content: { text: string }[];
			};
			expect(result.content[0]!.text).toBe("No todos.");
		});

		test("returns items after todo_write", async () => {
			await pi.callTool("todo_write", {
				todos: [{ id: "1", content: "Do thing", status: "pending" }],
			});
			const result = (await pi.callTool("todo_read", {})) as {
				content: { text: string }[];
			};
			expect(result.content[0]!.text).toContain("[ ] 1: Do thing");
		});
	});

	describe("todo_write", () => {
		test("replaces entire list", async () => {
			await pi.callTool("todo_write", {
				todos: [
					{ id: "1", content: "First", status: "pending" },
					{ id: "2", content: "Second", status: "pending" },
				],
			});

			// Replace with different list
			await pi.callTool("todo_write", {
				todos: [{ id: "a", content: "Only item", status: "in_progress" }],
			});

			const result = (await pi.callTool("todo_read", {})) as {
				content: { text: string }[];
				details: unknown[];
			};
			expect(result.details).toHaveLength(1);
			expect(result.content[0]!.text).toContain("[~] a: Only item");
		});

		test("formats all statuses correctly", async () => {
			await pi.callTool("todo_write", {
				todos: [
					{ id: "1", content: "Pending", status: "pending" },
					{ id: "2", content: "Active", status: "in_progress" },
					{ id: "3", content: "Done", status: "completed" },
				],
			});

			const result = (await pi.callTool("todo_read", {})) as {
				content: { text: string }[];
			};
			const text = result.content[0]!.text;
			expect(text).toContain("[ ] 1: Pending");
			expect(text).toContain("[~] 2: Active");
			expect(text).toContain("[x] 3: Done");
		});

		test("persists state via appendEntry", async () => {
			await pi.callTool("todo_write", {
				todos: [{ id: "1", content: "Test", status: "pending" }],
			});

			expect(pi.entries).toHaveLength(1);
			expect(pi.entries[0]!.customType).toBe("todo");
			expect(pi.entries[0]!.data).toEqual({
				items: [{ id: "1", content: "Test", status: "pending" }],
			});
		});

		test("appends new entry on each write", async () => {
			await pi.callTool("todo_write", {
				todos: [{ id: "1", content: "First", status: "pending" }],
			});
			await pi.callTool("todo_write", {
				todos: [{ id: "1", content: "First", status: "completed" }],
			});

			expect(pi.entries).toHaveLength(2);
		});

		test("handles empty list", async () => {
			await pi.callTool("todo_write", {
				todos: [{ id: "1", content: "Something", status: "pending" }],
			});
			await pi.callTool("todo_write", { todos: [] });

			const result = (await pi.callTool("todo_read", {})) as {
				content: { text: string }[];
				details: unknown[];
			};
			expect(result.details).toHaveLength(0);
			expect(result.content[0]!.text).toBe("No todos.");
		});
	});

	describe("before_agent_start", () => {
		test("returns nothing when list is empty", async () => {
			const result = await pi.fireEvent("before_agent_start");
			expect(result).toBeUndefined();
		});

		test("returns nothing when all items are completed", async () => {
			await pi.callTool("todo_write", {
				todos: [{ id: "1", content: "Done thing", status: "completed" }],
			});
			const result = await pi.fireEvent("before_agent_start");
			expect(result).toBeUndefined();
		});

		test("injects context when pending items exist", async () => {
			await pi.callTool("todo_write", {
				todos: [{ id: "1", content: "Do thing", status: "pending" }],
			});
			const result = (await pi.fireEvent("before_agent_start")) as {
				message: { customType: string; content: string; display: boolean };
			};
			expect(result.message.customType).toBe("todo-context");
			expect(result.message.content).toContain("[ ] 1: Do thing");
			expect(result.message.display).toBe(false);
		});

		test("injects context when in_progress items exist", async () => {
			await pi.callTool("todo_write", {
				todos: [
					{ id: "1", content: "Done", status: "completed" },
					{ id: "2", content: "Working", status: "in_progress" },
				],
			});
			const result = (await pi.fireEvent("before_agent_start")) as {
				message: { content: string };
			};
			expect(result.message.content).toContain("[~] 2: Working");
		});
	});

	describe("context filtering", () => {
		test("filters out stale todo-context messages", async () => {
			const messages = [
				{ role: "user", content: "hello" },
				{ customType: "todo-context", content: "old todos" },
				{ role: "assistant", content: "response" },
			];
			const result = (await pi.fireEvent("context", { messages })) as {
				messages: unknown[];
			};
			expect(result.messages).toHaveLength(2);
			expect(result.messages).toEqual([
				{ role: "user", content: "hello" },
				{ role: "assistant", content: "response" },
			]);
		});

		test("keeps non-todo messages", async () => {
			const messages = [
				{ role: "user", content: "hello" },
				{ customType: "other-ext", content: "stuff" },
			];
			const result = (await pi.fireEvent("context", { messages })) as {
				messages: unknown[];
			};
			expect(result.messages).toHaveLength(2);
		});
	});

	describe("session_start (state restoration)", () => {
		test("restores state from session entries", async () => {
			const savedItems = [
				{ id: "1", content: "Restored", status: "in_progress" },
			];
			const ctx = {
				sessionManager: {
					getEntries: () => [
						{
							type: "custom",
							customType: "todo",
							data: { items: savedItems },
						},
					],
				},
			};
			await pi.fireEvent("session_start", {}, ctx);

			const result = (await pi.callTool("todo_read", {})) as {
				content: { text: string }[];
				details: unknown[];
			};
			expect(result.details).toEqual(savedItems);
		});

		test("uses last entry when multiple exist", async () => {
			const ctx = {
				sessionManager: {
					getEntries: () => [
						{
							type: "custom",
							customType: "todo",
							data: {
								items: [{ id: "1", content: "Old", status: "pending" }],
							},
						},
						{
							type: "custom",
							customType: "todo",
							data: {
								items: [{ id: "1", content: "New", status: "completed" }],
							},
						},
					],
				},
			};
			await pi.fireEvent("session_start", {}, ctx);

			const result = (await pi.callTool("todo_read", {})) as {
				details: { content: string }[];
			};
			expect(result.details[0]!.content).toBe("New");
		});

		test("ignores non-todo entries", async () => {
			const ctx = {
				sessionManager: {
					getEntries: () => [
						{
							type: "custom",
							customType: "other-extension",
							data: { items: [{ id: "1" }] },
						},
						{ type: "message", role: "user", content: "hello" },
					],
				},
			};
			await pi.fireEvent("session_start", {}, ctx);

			const result = (await pi.callTool("todo_read", {})) as {
				details: unknown[];
			};
			expect(result.details).toHaveLength(0);
		});

		test("handles empty session entries", async () => {
			const ctx = {
				sessionManager: { getEntries: () => [] },
			};
			await pi.fireEvent("session_start", {}, ctx);

			const result = (await pi.callTool("todo_read", {})) as {
				details: unknown[];
			};
			expect(result.details).toHaveLength(0);
		});
	});
});
