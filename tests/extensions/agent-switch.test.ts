/**
 * Tests for the agent-switch extension (/agent and /handoff commands).
 *
 * Covers: argument validation (QC-008/QC-012), cancellation cleanup
 * (QC-010), session_start notification, argument completions,
 * and /handoff context summarization flow.
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
	waitForIdle: () => Promise<void>;
	isIdle: () => boolean;
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

interface MockPi {
	registerCommand(name: string, cmd: RegisteredCommand): void;
	on(event: string, handler: EventHandler): void;
	getCommand(name: string): RegisteredCommand | undefined;
	emitEvent(event: string, eventData: unknown, ctx: CommandContext): void;
	sendUserMessage: ReturnType<typeof vi.fn>;
}

function createMockPi(): MockPi {
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
		sendUserMessage: vi.fn(),
	};
}

function getCommand(pi: MockPi, name: string) {
	const cmd = pi.getCommand(name);
	if (!cmd) throw new Error(`${name} command not registered`);
	return cmd;
}

function createMockCtx(
	overrides: Partial<CommandContext> = {},
): CommandContext {
	return {
		cwd: "/tmp/test-project",
		newSession: vi.fn().mockResolvedValue({ cancelled: false }),
		waitForIdle: vi.fn().mockResolvedValue(undefined),
		isIdle: vi.fn().mockReturnValue(false),
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

function clearRegistrySlot() {
	const REGISTRY_KEY = Symbol.for("cosmonauts:agent-registry");
	(globalThis as Record<symbol, unknown>)[REGISTRY_KEY] = undefined;
}

// ============================================================================
// Tests: /agent command
// ============================================================================

describe("agent-switch extension", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearPendingSwitch();
	});

	test("registers both /agent and /handoff commands", () => {
		const pi = createMockPi();
		agentSwitchExtension(pi as never);
		expect(pi.getCommand("agent")).toBeDefined();
		expect(pi.getCommand("handoff")).toBeDefined();
	});

	describe("/agent with valid ID", () => {
		test("validates ID and calls newSession without setup", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			const registry = setupSharedRegistry(["planner", "worker", "cosmo"]);

			const ctx = createMockCtx();
			await getCommand(pi, "agent").handler("planner", ctx);

			expect(registry.resolve).toHaveBeenCalledWith("planner", undefined);
			expect(ctx.newSession).toHaveBeenCalledWith(
				expect.objectContaining({
					parentSession: "/tmp/sessions/test-session.jsonl",
					setup: undefined,
				}),
			);
		});

		test("uses runtime domain context during validation (QC-012)", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			const registry = setupSharedRegistry(
				["coding/planner", "coding/worker"],
				"coding",
			);

			const ctx = createMockCtx();
			await getCommand(pi, "agent").handler("planner", ctx);

			expect(registry.resolve).toHaveBeenCalledWith("planner", "coding");
			expect(ctx.newSession).toHaveBeenCalled();
		});
	});

	describe("/agent with unknown ID", () => {
		test("notifies error and skips newSession (QC-008)", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			setupSharedRegistry(["planner", "worker"]);

			const ctx = createMockCtx();
			await getCommand(pi, "agent").handler("nonexistent", ctx);

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
			clearRegistrySlot();
			const pi = createMockPi();
			agentSwitchExtension(pi as never);

			const ctx = createMockCtx();
			await getCommand(pi, "agent").handler("planner", ctx);

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
			await getCommand(pi, "agent").handler("planner", ctx);

			expect(consumePendingSwitch()).toBeUndefined();
		});

		test("clears pending switch when newSession throws", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			setupSharedRegistry(["planner"]);

			const ctx = createMockCtx({
				newSession: vi.fn().mockRejectedValue(new Error("session error")),
			});
			await getCommand(pi, "agent").handler("planner", ctx);

			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("session error"),
				"error",
			);
			expect(consumePendingSwitch()).toBeUndefined();
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
			await getCommand(pi, "agent").handler("", ctx);

			expect(ctx.ui.select).toHaveBeenCalledWith("Select agent", [
				"planner",
				"worker",
				"cosmo",
			]);
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
			await getCommand(pi, "agent").handler("", ctx);

			expect(ctx.newSession).not.toHaveBeenCalled();
			expect(consumePendingSwitch()).toBeUndefined();
		});
	});

	// ========================================================================
	// /handoff command
	// ========================================================================

	describe("/handoff with valid ID", () => {
		test("sends summarization prompt and waits for completion", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			setupSharedRegistry(["planner"]);
			mocks.extractAgentId.mockReturnValue("cosmo");

			// Simulate: sendUserMessage makes agent busy, then waitForIdle
			// resolves once the agent finishes the summary turn.
			let idle = true;
			const ctx = createMockCtx({
				sessionManager: {
					getSessionFile: () => "/tmp/sessions/cosmo.jsonl",
					getBranch: () => [
						{
							type: "message",
							message: {
								role: "assistant",
								content: [
									{
										type: "text",
										text: "Summary: we decided on JWT auth.",
									},
								],
							},
						},
					],
				},
				isIdle: (() => idle) as () => boolean,
				waitForIdle: vi.fn().mockImplementation(async () => {
					idle = true;
				}),
			});

			// sendUserMessage triggers the agent, making it non-idle
			pi.sendUserMessage.mockImplementation(() => {
				idle = false;
			});

			await getCommand(pi, "handoff").handler("planner", ctx);

			expect(pi.sendUserMessage).toHaveBeenCalledWith(
				expect.stringContaining("Summarize this conversation"),
				{ deliverAs: "followUp" },
			);
			expect(ctx.waitForIdle).toHaveBeenCalled();
		});

		test("waits for agent to become busy then idle before switching", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			setupSharedRegistry(["planner"]);
			mocks.extractAgentId.mockReturnValue("cosmo");

			// Track the order of operations to verify sequencing
			const callOrder: string[] = [];
			let idle = true;

			const ctx = createMockCtx({
				sessionManager: {
					getSessionFile: () => "/tmp/sessions/cosmo.jsonl",
					getBranch: () => [
						{
							type: "message",
							message: {
								role: "assistant",
								content: [{ type: "text", text: "Summary after streaming." }],
							},
						},
					],
				},
				isIdle: (() => idle) as () => boolean,
				waitForIdle: vi.fn().mockImplementation(async () => {
					callOrder.push("waitForIdle");
					idle = true;
				}),
				newSession: vi.fn().mockImplementation(async () => {
					callOrder.push("newSession");
					return { cancelled: false };
				}),
			});

			// sendUserMessage makes agent busy (non-idle)
			pi.sendUserMessage.mockImplementation(() => {
				callOrder.push("sendUserMessage");
				idle = false;
			});

			await getCommand(pi, "handoff").handler("planner", ctx);

			// Verify: prompt sent → wait for idle → switch
			expect(callOrder).toEqual([
				"sendUserMessage",
				"waitForIdle",
				"newSession",
			]);
			expect(ctx.newSession).toHaveBeenCalledWith(
				expect.objectContaining({
					setup: expect.any(Function),
				}),
			);
		});

		test("injects handoff brief with agent source into new session", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			setupSharedRegistry(["planner"]);
			mocks.extractAgentId.mockReturnValue("cosmo");

			let capturedSetup: ((sm: unknown) => Promise<void>) | undefined;
			const ctx = createMockCtx({
				sessionManager: {
					getSessionFile: () => "/tmp/sessions/cosmo.jsonl",
					getBranch: () => [
						{
							type: "message",
							message: {
								role: "assistant",
								content: [
									{ type: "text", text: "We chose JWT with refresh tokens." },
								],
							},
						},
					],
				},
				newSession: vi.fn().mockImplementation(async (opts) => {
					capturedSetup = opts?.setup;
					return { cancelled: false };
				}),
			});

			await getCommand(pi, "handoff").handler("planner", ctx);

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
			// Should contain the agent's summary
			const text = mockSm.appendMessage.mock.calls[0]?.[0]?.content?.[0]?.text;
			expect(text).toContain("JWT with refresh tokens");
		});

		test("fails fast when the summary turn never starts", async () => {
			vi.useFakeTimers();
			try {
				const pi = createMockPi();
				agentSwitchExtension(pi as never);
				setupSharedRegistry(["planner"]);

				const ctx = createMockCtx({
					isIdle: vi.fn().mockReturnValue(true),
					waitForIdle: vi.fn().mockResolvedValue(undefined),
					sessionManager: {
						getSessionFile: () => "/tmp/sessions/test.jsonl",
						getBranch: () => [
							{
								type: "message",
								message: {
									role: "assistant",
									content: [{ type: "text", text: "Earlier assistant reply." }],
								},
							},
						],
					},
				});

				const handoffPromise = getCommand(pi, "handoff").handler(
					"planner",
					ctx,
				);
				await vi.advanceTimersByTimeAsync(500);
				await handoffPromise;

				expect(ctx.waitForIdle).not.toHaveBeenCalled();
				expect(ctx.ui.notify).toHaveBeenCalledWith(
					expect.stringContaining("without context"),
					"warning",
				);
				expect(ctx.newSession).toHaveBeenCalledWith(
					expect.objectContaining({ setup: undefined }),
				);
			} finally {
				vi.useRealTimers();
			}
		});

		test("switches without context when summary is empty", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			setupSharedRegistry(["planner"]);

			const ctx = createMockCtx({
				sessionManager: {
					getSessionFile: () => "/tmp/sessions/test.jsonl",
					getBranch: () => [],
				},
			});

			await getCommand(pi, "handoff").handler("planner", ctx);

			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("without context"),
				"warning",
			);
			expect(ctx.newSession).toHaveBeenCalledWith(
				expect.objectContaining({ setup: undefined }),
			);
		});
	});

	describe("/handoff with no arguments", () => {
		test("shows selector then proceeds with handoff", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			setupSharedRegistry(["planner", "worker"]);

			const ctx = createMockCtx({
				ui: {
					notify: vi.fn(),
					select: vi.fn().mockResolvedValue("planner"),
				},
				sessionManager: {
					getSessionFile: () => "/tmp/sessions/test.jsonl",
					getBranch: () => [
						{
							type: "message",
							message: {
								role: "assistant",
								content: [{ type: "text", text: "A summary." }],
							},
						},
					],
				},
			});

			await getCommand(pi, "handoff").handler("", ctx);

			expect(ctx.ui.select).toHaveBeenCalled();
			expect(pi.sendUserMessage).toHaveBeenCalled();
			expect(ctx.newSession).toHaveBeenCalled();
		});
	});

	// ========================================================================
	// session_start notification
	// ========================================================================

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

	// ========================================================================
	// Argument completions (shared by both commands)
	// ========================================================================

	describe("argument completions", () => {
		test("returns matching agent IDs for prefix", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			setupSharedRegistry(["planner", "plan-reviewer", "worker", "cosmo"]);

			const completions = await getCommand(
				pi,
				"agent",
			).getArgumentCompletions?.("plan");

			expect(completions).toEqual([
				{ value: "planner", label: "planner" },
				{ value: "plan-reviewer", label: "plan-reviewer" },
			]);
		});

		test("returns null when no matches", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			setupSharedRegistry(["planner", "worker"]);

			const completions = await getCommand(
				pi,
				"agent",
			).getArgumentCompletions?.("xyz");
			expect(completions).toBeNull();
		});

		test("returns null when no shared registry", async () => {
			clearRegistrySlot();
			const pi = createMockPi();
			agentSwitchExtension(pi as never);

			const completions = await getCommand(
				pi,
				"agent",
			).getArgumentCompletions?.("plan");
			expect(completions).toBeNull();
		});

		test("/handoff shares the same completions", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			setupSharedRegistry(["planner", "worker"]);

			const completions = await getCommand(
				pi,
				"handoff",
			).getArgumentCompletions?.("plan");
			expect(completions).toEqual([{ value: "planner", label: "planner" }]);
		});
	});
});
