/**
 * Tests for the agent-switch extension (/agent command).
 *
 * Covers: argument validation (QC-008/QC-012), cancellation cleanup
 * (QC-010), session_start notification, and argument completions.
 */

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
	clearPendingSwitch,
	consumePendingSwitch,
	setSharedRegistry,
} from "../../lib/interactive/agent-switch.ts";

// ============================================================================
// Hoisted mocks
// ============================================================================

const mocks = vi.hoisted(() => ({
	extractAgentId: vi.fn(),
}));

vi.mock("../../lib/agents/runtime-identity.ts", () => ({
	extractAgentIdFromSystemPrompt: mocks.extractAgentId,
}));

import agentSwitchExtension from "../../domains/shared/extensions/agent-switch/index.ts";

// ============================================================================
// Helpers
// ============================================================================

interface RegisteredCommand {
	description: string;
	handler: (args: string, ctx: CommandContext) => Promise<void>;
	getArgumentCompletions?: (
		prefix: string,
	) => Promise<{ value: string; label: string }[] | null>;
}

interface CommandContext {
	cwd: string;
	newSession: (options?: {
		parentSession?: string;
		setup?: (sm: unknown) => Promise<void>;
	}) => Promise<{ cancelled: boolean }>;
	ui: {
		notify: (message: string, level: string) => void;
		select: (prompt: string, options: string[]) => Promise<string | null>;
	};
	sessionManager: {
		getSessionFile: () => string | undefined;
		getBranch: () => unknown[];
	};
	getSystemPrompt: () => string;
	model?: { name?: string; id?: string };
}

type EventHandler = (event: unknown, ctx: CommandContext) => void;

function createMockPi() {
	const commands = new Map<string, RegisteredCommand>();
	const events = new Map<string, EventHandler[]>();

	return {
		registerCommand(name: string, cmd: RegisteredCommand) {
			commands.set(name, cmd);
		},
		on(event: string, handler: EventHandler) {
			const handlers = events.get(event) ?? [];
			handlers.push(handler);
			events.set(event, handlers);
		},
		getCommand(name: string) {
			return commands.get(name);
		},
		emitEvent(event: string, eventData: unknown, ctx: CommandContext) {
			for (const handler of events.get(event) ?? []) {
				handler(eventData, ctx);
			}
		},
	};
}

function getAgentCommand(pi: ReturnType<typeof createMockPi>) {
	const cmd = pi.getCommand("agent");
	if (!cmd) throw new Error("agent command not registered");
	return cmd;
}

function createMockCtx(
	overrides: Partial<CommandContext> = {},
): CommandContext {
	return {
		cwd: "/tmp/test-project",
		newSession: vi.fn().mockResolvedValue({ cancelled: false }),
		ui: {
			notify: vi.fn(),
			select: vi.fn().mockResolvedValue(null),
		},
		sessionManager: {
			getSessionFile: () => "/tmp/sessions/test-session.jsonl",
			getBranch: () => [],
		},
		getSystemPrompt: () => "test prompt",
		model: { name: "Claude Sonnet", id: "claude-sonnet-4-20250514" },
		...overrides,
	};
}

function setupSharedRegistry(agentIds: string[], domainContext?: string) {
	const resolveInContext = (id: string, ctx?: string) => {
		if (agentIds.includes(id)) {
			return { id };
		}
		if (!id.includes("/") && ctx && agentIds.includes(`${ctx}/${id}`)) {
			return { id: `${ctx}/${id}` };
		}
		if (!id.includes("/")) {
			const matches = agentIds.filter(
				(candidate) => candidate === id || candidate.endsWith(`/${id}`),
			);
			if (matches.length === 1) {
				return { id: matches[0] };
			}
		}
		throw new Error(`Unknown agent ID "${id}"`);
	};

	const registry = {
		has: vi.fn((id: string, ctx?: string) => {
			try {
				resolveInContext(id, ctx);
				return true;
			} catch {
				return false;
			}
		}),
		listIds: vi.fn(() => agentIds),
		resolve: vi.fn(resolveInContext),
	};

	setSharedRegistry(registry as never, domainContext);
	return registry;
}

// ============================================================================
// Tests
// ============================================================================

describe("agent-switch extension", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearPendingSwitch();
	});

	test("registers /agent command", () => {
		const pi = createMockPi();
		agentSwitchExtension(pi as never);
		expect(pi.getCommand("agent")).toBeDefined();
		expect(pi.getCommand("agent")?.description).toContain("Switch");
	});

	describe("/agent with valid ID", () => {
		test("validates ID and calls newSession", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			const registry = setupSharedRegistry(["planner", "worker", "cosmo"]);

			const ctx = createMockCtx();
			const cmd = getAgentCommand(pi);
			await cmd.handler("planner", ctx);

			expect(registry.resolve).toHaveBeenCalledWith("planner", undefined);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("planner"),
				"info",
			);
			expect(ctx.newSession).toHaveBeenCalled();
		});

		test("uses runtime domain context during validation (QC-012)", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			const registry = setupSharedRegistry(
				["coding/planner", "coding/worker"],
				"coding",
			);

			const ctx = createMockCtx();
			const cmd = getAgentCommand(pi);
			await cmd.handler("planner", ctx);

			expect(registry.resolve).toHaveBeenCalledWith("planner", "coding");
			expect(ctx.newSession).toHaveBeenCalled();
		});
	});

	describe("/agent with unknown ID", () => {
		test("notifies error and skips newSession (QC-008)", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			const registry = setupSharedRegistry(["planner", "worker"]);

			const ctx = createMockCtx();
			const cmd = getAgentCommand(pi);
			await cmd.handler("nonexistent", ctx);

			expect(registry.resolve).toHaveBeenCalledWith("nonexistent", undefined);
			expect(ctx.newSession).not.toHaveBeenCalled();
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining('Unknown agent ID "nonexistent"'),
				"error",
			);
			expect(consumePendingSwitch()).toBeUndefined();
		});
	});

	describe("/agent without shared registry", () => {
		test("notifies error when no registry is available", async () => {
			// Clear the shared registry by setting it to a known state
			// then accessing without setup
			const REGISTRY_KEY = Symbol.for("cosmonauts:agent-registry");
			(globalThis as Record<symbol, unknown>)[REGISTRY_KEY] = undefined;

			const pi = createMockPi();
			agentSwitchExtension(pi as never);

			const ctx = createMockCtx();
			const cmd = getAgentCommand(pi);
			await cmd.handler("planner", ctx);

			expect(ctx.newSession).not.toHaveBeenCalled();
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("not available"),
				"error",
			);
		});
	});

	describe("cancellation cleanup (QC-010)", () => {
		test("clears pending switch when newSession is cancelled", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			setupSharedRegistry(["planner"]);

			const ctx = createMockCtx({
				newSession: vi.fn().mockResolvedValue({ cancelled: true }),
			});
			const cmd = getAgentCommand(pi);
			await cmd.handler("planner", ctx);

			// Pending switch should be cleared after cancellation
			expect(consumePendingSwitch()).toBeUndefined();
		});

		test("clears pending switch when newSession throws", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			setupSharedRegistry(["planner"]);

			const ctx = createMockCtx({
				newSession: vi.fn().mockRejectedValue(new Error("session error")),
			});
			const cmd = getAgentCommand(pi);
			await cmd.handler("planner", ctx);

			// Should show error notification
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("session error"),
				"error",
			);
			// Pending switch should be cleaned up
			expect(consumePendingSwitch()).toBeUndefined();
		});
	});

	describe("context handoff", () => {
		test("passes parentSession and setup callback to newSession", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			setupSharedRegistry(["planner"]);
			mocks.extractAgentId.mockReturnValue("cosmo");

			const ctx = createMockCtx({
				sessionManager: {
					getSessionFile: () => "/tmp/sessions/cosmo-123.jsonl",
					getBranch: () => [
						{
							type: "message",
							message: {
								role: "user",
								content: "design an auth system",
							},
						},
						{
							type: "message",
							message: {
								role: "assistant",
								content: [
									{ type: "text", text: "I suggest using JWT tokens." },
								],
							},
						},
					],
				},
			});
			const cmd = getAgentCommand(pi);
			await cmd.handler("planner", ctx);

			expect(ctx.newSession).toHaveBeenCalledWith(
				expect.objectContaining({
					parentSession: "/tmp/sessions/cosmo-123.jsonl",
					setup: expect.any(Function),
				}),
			);
		});

		test("setup callback appends handoff brief as user message", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			setupSharedRegistry(["planner"]);
			mocks.extractAgentId.mockReturnValue("cosmo");

			let capturedSetup: ((sm: unknown) => Promise<void>) | undefined;
			const ctx = createMockCtx({
				sessionManager: {
					getSessionFile: () => "/tmp/sessions/test.jsonl",
					getBranch: () => [
						{
							type: "message",
							message: { role: "user", content: "hello" },
						},
						{
							type: "message",
							message: {
								role: "assistant",
								content: [{ type: "text", text: "hi there" }],
							},
						},
					],
				},
				newSession: vi.fn().mockImplementation(async (opts) => {
					capturedSetup = opts?.setup;
					return { cancelled: false };
				}),
			});

			const cmd = getAgentCommand(pi);
			await cmd.handler("planner", ctx);

			expect(capturedSetup).toBeDefined();
			const mockSm = { appendMessage: vi.fn() };
			await capturedSetup?.(mockSm);

			expect(mockSm.appendMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					role: "user",
					content: [
						expect.objectContaining({
							type: "text",
							text: expect.stringContaining("cosmo"),
						}),
					],
				}),
			);
		});

		test("skips setup when session has no conversation", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			setupSharedRegistry(["planner"]);

			const ctx = createMockCtx({
				sessionManager: {
					getSessionFile: () => "/tmp/sessions/test.jsonl",
					getBranch: () => [],
				},
			});
			const cmd = getAgentCommand(pi);
			await cmd.handler("planner", ctx);

			expect(ctx.newSession).toHaveBeenCalledWith(
				expect.objectContaining({
					parentSession: "/tmp/sessions/test.jsonl",
					setup: undefined,
				}),
			);
		});
	});

	describe("/agent with no arguments", () => {
		test("shows interactive selector", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			setupSharedRegistry(["planner", "worker", "cosmo"]);

			const ctx = createMockCtx({
				ui: {
					notify: vi.fn(),
					select: vi.fn().mockResolvedValue("worker"),
				},
			});
			const cmd = getAgentCommand(pi);
			await cmd.handler("", ctx);

			expect(ctx.ui.select).toHaveBeenCalledWith("Select agent", [
				"planner",
				"worker",
				"cosmo",
			]);
			// Selected "worker" → should proceed with switch
			expect(ctx.newSession).toHaveBeenCalled();
		});

		test("does nothing when selector is dismissed", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			setupSharedRegistry(["planner", "worker"]);

			const ctx = createMockCtx({
				ui: {
					notify: vi.fn(),
					select: vi.fn().mockResolvedValue(null),
				},
			});
			const cmd = getAgentCommand(pi);
			await cmd.handler("", ctx);

			expect(ctx.newSession).not.toHaveBeenCalled();
			expect(consumePendingSwitch()).toBeUndefined();
		});
	});

	describe("session_start event", () => {
		test("shows status notification with agent ID and model", () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			mocks.extractAgentId.mockReturnValue("coding/planner");

			const ctx = createMockCtx();
			pi.emitEvent("session_start", {}, ctx);

			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("coding/planner"),
				"info",
			);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("Claude Sonnet"),
				"info",
			);
		});

		test("skips notification when no agent ID in prompt", () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			mocks.extractAgentId.mockReturnValue(undefined);

			const ctx = createMockCtx();
			pi.emitEvent("session_start", {}, ctx);

			expect(ctx.ui.notify).not.toHaveBeenCalled();
		});
	});

	describe("argument completions", () => {
		test("returns matching agent IDs for prefix", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			setupSharedRegistry(["planner", "plan-reviewer", "worker", "cosmo"]);

			const cmd = getAgentCommand(pi);
			const completions = await cmd.getArgumentCompletions?.("plan");

			expect(completions).toEqual([
				{ value: "planner", label: "planner" },
				{ value: "plan-reviewer", label: "plan-reviewer" },
			]);
		});

		test("returns null when no matches", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			setupSharedRegistry(["planner", "worker"]);

			const cmd = getAgentCommand(pi);
			const completions = await cmd.getArgumentCompletions?.("xyz");
			expect(completions).toBeNull();
		});

		test("returns null when no shared registry", async () => {
			const REGISTRY_KEY = Symbol.for("cosmonauts:agent-registry");
			(globalThis as Record<symbol, unknown>)[REGISTRY_KEY] = undefined;

			const pi = createMockPi();
			agentSwitchExtension(pi as never);

			const cmd = getAgentCommand(pi);
			const completions = await cmd.getArgumentCompletions?.("plan");
			expect(completions).toBeNull();
		});
	});
});
