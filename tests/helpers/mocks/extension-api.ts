/**
 * Canonical manual test double for Pi's ExtensionAPI.
 *
 * Captures registered tools, event handlers, and appended entries so
 * extension tests can inspect and invoke them without importing the
 * real Pi runtime.
 */

/** A tool registration captured by the mock. */
export interface RegisteredTool {
	name: string;
	execute: (...args: unknown[]) => Promise<unknown>;
}

type EventHandler = (event: unknown, ctx: unknown) => Promise<unknown>;

export interface MockPiOptions {
	/** Working directory passed to tool execute contexts. Defaults to "/tmp". */
	cwd?: string;
}

export interface MockPi {
	tools: Map<string, RegisteredTool>;
	events: Map<string, EventHandler[]>;
	entries: { customType: string; data: unknown }[];

	registerTool(def: RegisteredTool): void;
	on(event: string, handler: EventHandler): void;
	appendEntry(customType: string, data: unknown): void;

	/** Invoke a registered tool by name. */
	callTool(name: string, params: unknown): Promise<unknown>;

	/** Fire all handlers for an event, returning the last handler's result. */
	fireEvent(name: string, event?: unknown, ctx?: unknown): Promise<unknown>;
}

/**
 * Creates a minimal mock of Pi's ExtensionAPI.
 *
 * The returned object is castable to `never` when passed to extension
 * entry-point functions that expect the real API type.
 */
export function createMockPi(options?: MockPiOptions): MockPi {
	const cwd = options?.cwd ?? "/tmp";
	const tools = new Map<string, RegisteredTool>();
	const events = new Map<string, EventHandler[]>();
	const entries: { customType: string; data: unknown }[] = [];

	return {
		tools,
		events,
		entries,

		registerTool(def: RegisteredTool) {
			tools.set(def.name, def);
		},

		on(event: string, handler: EventHandler) {
			if (!events.has(event)) events.set(event, []);
			events.get(event)?.push(handler);
		},

		appendEntry(customType: string, data: unknown) {
			entries.push({ customType, data });
		},

		async callTool(name: string, params: unknown) {
			const tool = tools.get(name);
			if (!tool) throw new Error(`Tool not found: ${name}`);
			return tool.execute("call-id", params, undefined, undefined, { cwd });
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
