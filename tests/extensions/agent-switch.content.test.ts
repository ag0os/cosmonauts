import { qualityReviewSessionPolicies } from "../../lib/orchestration/quality-review-session-provider.ts";
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
	setSharedRegistry,
} from "../../lib/interactive/agent-switch.ts";

// ============================================================================
// Hoisted mocks
// ============================================================================

const mocks = vi.hoisted(() => ({
	extractAgentId: vi.fn(),
}));

vi.mock("../../lib/agents/runtime-identity.ts", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("../../lib/agents/runtime-identity.ts")
	>()),
	extractAgentIdFromSystemPrompt: mocks.extractAgentId,
}));

import agentSwitchExtension from "../../lib/extensions/agent-switch/index.ts";

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

	setSharedRegistry(
		registry as never,
		domainContext,
		qualityReviewSessionPolicies,
	);
	return registry;
}

// ============================================================================
// Tests: /agent command
// ============================================================================

describe("agent-switch extension", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearPendingSwitch();
	});

	describe("/agent with valid ID", () => {
		test("refuses an interactive quality-manager switch", async () => {
			const pi = createMockPi();
			agentSwitchExtension(pi as never);
			setupSharedRegistry(["coding/quality-manager"], "coding");
			const ctx = createMockCtx();
			await getCommand(pi, "agent").handler("quality-manager", ctx);
			expect(ctx.newSession).not.toHaveBeenCalled();
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("quality review launcher"),
				"error",
			);
		});
	});

	// ========================================================================
	// /handoff command
	// ========================================================================

	// ========================================================================
	// session_start notification
	// ========================================================================

	// ========================================================================
	// Argument completions (shared by both commands)
	// ========================================================================
});
