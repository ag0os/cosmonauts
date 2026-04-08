/**
 * Agent-switch extension — registers /agent and /handoff commands.
 *
 * /agent <name>   — instant switch to a different agent. Clean break, no context.
 * /handoff <name> — asks the current agent to summarize the conversation, then
 *                   switches with that summary injected into the new session.
 *
 * Both use a globalThis slot (lib/interactive/agent-switch.ts) to signal the
 * pending agent ID to the CLI's session factory.
 *
 * Agent validation uses the shared registry set by the CLI at startup, ensuring
 * the extension validates against the same agent set the factory resolves from
 * (including --domain and --plugin-dir overrides).
 */

import type {
	ExtensionAPI,
	ExtensionCommandContext,
	SessionManager,
} from "@mariozechner/pi-coding-agent";
import { extractAgentIdFromSystemPrompt } from "../../../../lib/agents/runtime-identity.ts";
import {
	clearPendingSwitch,
	getSharedRegistry,
	setPendingSwitch,
} from "../../../../lib/interactive/agent-switch.ts";

const HANDOFF_PROMPT = `Summarize this conversation for handoff to a different agent. Be concise. Include:
- Key decisions made
- Approaches considered or rejected, and why
- Constraints or requirements identified
- What the user wants to do next

Format as a brief (under 300 words). Do not add preamble — start directly with the summary.`;

// ============================================================================
// Helpers
// ============================================================================

function getRegistryOrNotify(ctx: ExtensionCommandContext) {
	const shared = getSharedRegistry();
	if (!shared) {
		ctx.ui.notify("Agent switching is not available (no registry).", "error");
		return undefined;
	}
	return shared;
}

function resolveAgentOrNotify(
	agentId: string,
	ctx: ExtensionCommandContext,
): boolean {
	const shared = getRegistryOrNotify(ctx);
	if (!shared) return false;
	try {
		shared.registry.resolve(agentId, shared.domainContext);
		return true;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		ctx.ui.notify(message, "error");
		return false;
	}
}

async function selectAgentOrNotify(
	ctx: ExtensionCommandContext,
): Promise<string | undefined> {
	const shared = getRegistryOrNotify(ctx);
	if (!shared) return undefined;
	const ids = shared.registry.listIds();
	const selected = await ctx.ui.select("Select agent", ids);
	return selected ?? undefined;
}

/**
 * Extract the assistant's last text response from the current session branch.
 */
function getLastAssistantText(
	sessionManager: ExtensionCommandContext["sessionManager"],
): string | undefined {
	const branch = sessionManager.getBranch();
	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i];
		if (!entry) continue;
		if (entry.type !== "message") continue;
		const msg = entry.message;
		if (msg.role !== "assistant") continue;
		const text = msg.content
			.filter((c: { type: string }) => c.type === "text")
			.map((c: { type: string; text?: string }) => c.text)
			.filter(Boolean)
			.join("\n");
		if (text.trim()) return text.trim();
	}
	return undefined;
}

// ============================================================================
// Switch mechanics
// ============================================================================

async function performSwitch(
	agentId: string,
	ctx: ExtensionCommandContext,
	handoffBrief?: string,
): Promise<void> {
	const parentSessionFile = ctx.sessionManager.getSessionFile();

	setPendingSwitch(agentId);
	try {
		const result = await ctx.newSession({
			parentSession: parentSessionFile,
			setup: handoffBrief
				? async (sm: SessionManager) => {
						sm.appendMessage({
							role: "user",
							content: [{ type: "text", text: handoffBrief }],
							timestamp: Date.now(),
						});
					}
				: undefined,
		});
		if (result.cancelled) {
			clearPendingSwitch();
		}
	} catch (error: unknown) {
		clearPendingSwitch();
		const message = error instanceof Error ? error.message : String(error);
		ctx.ui.notify(`Agent switch failed: ${message}`, "error");
	}
}

// ============================================================================
// Extension
// ============================================================================

export default function agentSwitchExtension(pi: ExtensionAPI): void {
	// Shared completions handler for both commands
	const getArgumentCompletions = async (prefix: string) => {
		const shared = getSharedRegistry();
		if (!shared) return null;
		try {
			const ids = shared.registry.listIds();
			const filtered = ids.filter((id) => id.startsWith(prefix));
			return filtered.length > 0
				? filtered.map((id) => ({ value: id, label: id }))
				: null;
		} catch {
			return null;
		}
	};

	// /agent — instant switch, no context carried
	pi.registerCommand("agent", {
		description: "Switch to a different agent (clean break, no context)",
		getArgumentCompletions,
		handler: async (args, ctx) => {
			const agentId = args.trim();
			if (agentId) {
				if (!resolveAgentOrNotify(agentId, ctx)) return;
				ctx.ui.notify(`Switching to \`${agentId}\`.`, "info");
				await performSwitch(agentId, ctx);
			} else {
				const selected = await selectAgentOrNotify(ctx);
				if (selected) {
					ctx.ui.notify(`Switching to \`${selected}\`.`, "info");
					await performSwitch(selected, ctx);
				}
			}
		},
	});

	// /handoff — agent summarizes, then switches with context
	pi.registerCommand("handoff", {
		description:
			"Summarize conversation and hand off to a different agent with context",
		getArgumentCompletions,
		handler: async (args, ctx) => {
			const agentId = args.trim();
			let targetAgentId: string;
			if (agentId) {
				if (!resolveAgentOrNotify(agentId, ctx)) return;
				targetAgentId = agentId;
			} else {
				const selected = await selectAgentOrNotify(ctx);
				if (!selected) return;
				targetAgentId = selected;
			}

			ctx.ui.notify(
				`Preparing handoff to \`${targetAgentId}\`. Summarizing conversation...`,
				"info",
			);

			// Ask the current agent to produce a handoff summary
			pi.sendUserMessage(HANDOFF_PROMPT);
			await ctx.waitForIdle();

			// Extract the summary the agent just produced
			const summary = getLastAssistantText(ctx.sessionManager);
			if (!summary) {
				ctx.ui.notify(
					"Could not generate handoff summary. Switching without context.",
					"warning",
				);
			}

			const sourceAgentId = extractAgentIdFromSystemPrompt(
				ctx.getSystemPrompt(),
			);
			const source = sourceAgentId ? ` (from ${sourceAgentId})` : "";
			const handoffBrief = summary
				? `Handoff context${source}:\n\n${summary}\n\nThe user handed off this conversation to you. Use the context above to continue where the previous agent left off.`
				: undefined;

			await performSwitch(targetAgentId, ctx, handoffBrief);
		},
	});

	pi.on("session_start", (_event, ctx) => {
		const agentId = extractAgentIdFromSystemPrompt(ctx.getSystemPrompt());
		if (!agentId) return;
		const modelName = ctx.model?.name ?? ctx.model?.id ?? "unknown";
		ctx.ui.notify(`Switched to \`${agentId}\` (${modelName})`, "info");
	});
}
