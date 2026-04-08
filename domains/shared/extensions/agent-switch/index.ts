/**
 * Agent-switch extension — registers the /agent command.
 *
 * Allows switching between Cosmonauts agent personas by starting a new Pi
 * session configured for the target agent. The pending switch is stored in a
 * globalThis slot (lib/interactive/agent-switch.ts) so the CLI's session setup
 * can pick up the target agent ID.
 *
 * Agent validation uses the shared registry set by the CLI at startup, ensuring
 * the extension validates against the same agent set the factory resolves from
 * (including --domain and --plugin-dir overrides).
 */

import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	SessionManager,
} from "@mariozechner/pi-coding-agent";
import { extractAgentIdFromSystemPrompt } from "../../../../lib/agents/runtime-identity.ts";
import {
	clearPendingSwitch,
	getSharedRegistry,
	setPendingSwitch,
} from "../../../../lib/interactive/agent-switch.ts";

/** Maximum number of recent user/assistant message pairs to carry forward. */
const MAX_HANDOFF_PAIRS = 5;

/**
 * Build a context handoff brief from the current session's recent conversation.
 * Extracts the last N user/assistant exchanges and formats them as a readable summary.
 */
function buildHandoffBrief(
	sessionManager: ExtensionContext["sessionManager"],
	sourceAgentId: string | undefined,
): string | undefined {
	const branch = sessionManager.getBranch();
	if (branch.length === 0) return undefined;

	// Extract message entries with user/assistant roles
	const messages: { role: string; text: string }[] = [];
	for (const entry of branch) {
		if (entry.type !== "message") continue;
		const msg = entry.message;
		if (msg.role === "user") {
			const text =
				typeof msg.content === "string"
					? msg.content
					: msg.content
							.filter(
								(c: { type: string }) =>
									c.type === "text" || c.type === "custom_message",
							)
							.map((c: { type: string; text?: string; content?: string }) =>
								c.type === "text" ? c.text : c.content,
							)
							.filter(Boolean)
							.join("\n");
			if (text.trim()) messages.push({ role: "user", text: text.trim() });
		} else if (msg.role === "assistant") {
			const text = msg.content
				.filter((c: { type: string }) => c.type === "text")
				.map((c: { type: string; text?: string }) => c.text)
				.filter(Boolean)
				.join("\n");
			if (text.trim()) messages.push({ role: "assistant", text: text.trim() });
		}
	}

	if (messages.length === 0) return undefined;

	// Take the last N pairs (user + assistant = 2 entries per pair)
	const tail = messages.slice(-(MAX_HANDOFF_PAIRS * 2));

	const source = sourceAgentId ? ` (agent: ${sourceAgentId})` : "";
	const lines = [
		`Continuing from a previous session${source}. Here is the recent conversation context:`,
		"",
	];
	for (const msg of tail) {
		const label = msg.role === "user" ? "User" : "Assistant";
		lines.push(`**${label}**: ${msg.text}`, "");
	}
	lines.push(
		"Use this context to understand what was discussed. The user may refer to decisions or topics from above.",
	);
	return lines.join("\n");
}

export default function agentSwitchExtension(pi: ExtensionAPI): void {
	async function switchToAgent(
		agentId: string,
		ctx: ExtensionCommandContext,
	): Promise<void> {
		ctx.ui.notify(
			`Switching to \`${agentId}\`. Conversation context will be carried forward.`,
			"info",
		);

		// Capture context before teardown
		const parentSessionFile = ctx.sessionManager.getSessionFile();
		const sourceAgentId = extractAgentIdFromSystemPrompt(ctx.getSystemPrompt());
		const handoffBrief = buildHandoffBrief(ctx.sessionManager, sourceAgentId);

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

	pi.registerCommand("agent", {
		description: "Switch to a different Cosmonauts agent",
		getArgumentCompletions: async (prefix) => {
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
		},
		handler: async (args, ctx) => {
			const shared = getSharedRegistry();
			if (!shared) {
				ctx.ui.notify(
					"Agent switching is not available (no registry).",
					"error",
				);
				return;
			}
			const { registry, domainContext } = shared;
			const agentId = args.trim();

			if (agentId) {
				try {
					registry.resolve(agentId, domainContext);
				} catch (error: unknown) {
					const message =
						error instanceof Error ? error.message : String(error);
					ctx.ui.notify(message, "error");
					return;
				}
				await switchToAgent(agentId, ctx);
			} else {
				// No argument: show interactive selector.
				const ids = registry.listIds();
				const selected = await ctx.ui.select("Select agent", ids);
				if (selected) {
					await switchToAgent(selected, ctx);
				}
			}
		},
	});

	pi.on("session_start", (_event, ctx) => {
		const agentId = extractAgentIdFromSystemPrompt(ctx.getSystemPrompt());
		if (!agentId) return;
		const modelName = ctx.model?.name ?? ctx.model?.id ?? "unknown";
		ctx.ui.notify(`Switched to \`${agentId}\` (${modelName})`, "info");
	});
}
