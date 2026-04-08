/**
 * Tests for the agent-switch extension (/agent command).
 *
 * Covers: argument-based switch delegation (QC-012), cancellation cleanup
 * (QC-010), session_start notification, and argument completions.
 */

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
	clearPendingSwitch,
	consumePendingSwitch,
} from "../../lib/interactive/agent-switch.ts";

// ============================================================================
// Hoisted mocks
// ============================================================================

const mocks = vi.hoisted(() => ({
	runtimeCreate: vi.fn(),
	extractAgentId: vi.fn(),
}));

vi.mock("../../lib/runtime.ts", () => ({
	CosmonautsRuntime: {
		create: mocks.runtimeCreate,
	},
}));

vi.mock("../../lib/packages/dev-bundled.ts", () => ({
	discoverFrameworkBundledPackageDirs: () => Promise.resolve([]),
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
	newSession: () => Promise<{ cancelled: boolean }>;
	ui: {
		notify: (message: string, level: string) => void;
		select: (prompt: string, options: string[]) => Promise<string | null>;
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
		getSystemPrompt: () => "test prompt",
		model: { name: "Claude Sonnet", id: "claude-sonnet-4-20250514" },
		...overrides,
	};
}

function mockRuntime(agentIds: string[], domainContext?: string) {
	const registry = {
		has: vi.fn((id: string, _ctx?: string) => agentIds.includes(id)),
		listIds: vi.fn(() => agentIds),
		resolve: vi.fn(),
	};
	mocks.runtimeCreate.mockResolvedValue({
		agentRegistry: registry,
		domainContext,
	});
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
		test("sets pending switch and calls newSession", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			mockRuntime(["planner", "worker", "cosmo"]);

			const ctx = createMockCtx();
			const cmd = pi.getCommand("agent")!;
			await cmd.handler("planner", ctx);

			// Should have warned about conversation loss
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("planner"),
				"warning",
			);
			// Should have called newSession
			expect(ctx.newSession).toHaveBeenCalled();
			// Pending switch consumed by the time we check (newSession resolved)
			// but it was set before newSession was called
		});
	});

	describe("/agent with unknown ID (QC-012)", () => {
		test("defers validation to runtime and cleans pending switch on error", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			const registry = mockRuntime(["planner", "worker"]);

			const ctx = createMockCtx({
				newSession: vi
					.fn()
					.mockRejectedValue(new Error('Unknown agent ID "nonexistent"')),
			});
			const cmd = pi.getCommand("agent")!;
			await cmd.handler("nonexistent", ctx);

			expect(registry.has).not.toHaveBeenCalled();
			expect(ctx.newSession).toHaveBeenCalled();
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining(
					'Agent switch failed: Unknown agent ID "nonexistent"',
				),
				"error",
			);
			expect(consumePendingSwitch()).toBeUndefined();
		});
	});

	describe("cancellation cleanup (QC-010)", () => {
		test("clears pending switch when newSession is cancelled", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			mockRuntime(["planner"]);

			const ctx = createMockCtx({
				newSession: vi.fn().mockResolvedValue({ cancelled: true }),
			});
			const cmd = pi.getCommand("agent")!;
			await cmd.handler("planner", ctx);

			// Pending switch should be cleared after cancellation
			expect(consumePendingSwitch()).toBeUndefined();
		});

		test("clears pending switch when newSession throws", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			mockRuntime(["planner"]);

			const ctx = createMockCtx({
				newSession: vi.fn().mockRejectedValue(new Error("session error")),
			});
			const cmd = pi.getCommand("agent")!;
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

	describe("/agent with no arguments", () => {
		test("shows interactive selector", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			mockRuntime(["planner", "worker", "cosmo"]);

			const ctx = createMockCtx({
				ui: {
					notify: vi.fn(),
					select: vi.fn().mockResolvedValue("worker"),
				},
			});
			const cmd = pi.getCommand("agent")!;
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
			mockRuntime(["planner", "worker"]);

			const ctx = createMockCtx({
				ui: {
					notify: vi.fn(),
					select: vi.fn().mockResolvedValue(null),
				},
			});
			const cmd = pi.getCommand("agent")!;
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
			mockRuntime(["planner", "plan-reviewer", "worker", "cosmo"]);

			// Trigger session_start to set lastCwd
			mocks.extractAgentId.mockReturnValue("cosmo");
			pi.emitEvent("session_start", {}, createMockCtx());

			const cmd = pi.getCommand("agent")!;
			const completions = await cmd.getArgumentCompletions!("plan");

			expect(completions).toEqual([
				{ value: "planner", label: "planner" },
				{ value: "plan-reviewer", label: "plan-reviewer" },
			]);
		});

		test("returns null when no matches", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			mockRuntime(["planner", "worker"]);

			mocks.extractAgentId.mockReturnValue("cosmo");
			pi.emitEvent("session_start", {}, createMockCtx());

			const cmd = pi.getCommand("agent")!;
			const completions = await cmd.getArgumentCompletions!("xyz");
			expect(completions).toBeNull();
		});
	});
});
