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
} from "@mariozechner/pi-coding-agent";
import { extractAgentIdFromSystemPrompt } from "../../../../lib/agents/runtime-identity.ts";
import {
	clearPendingSwitch,
	getSharedRegistry,
	setPendingSwitch,
} from "../../../../lib/interactive/agent-switch.ts";

export default function agentSwitchExtension(pi: ExtensionAPI): void {
	async function switchToAgent(
		agentId: string,
		ctx: ExtensionCommandContext,
	): Promise<void> {
		ctx.ui.notify(
			`Starting a new session as \`${agentId}\`. Current conversation will not be preserved.`,
			"warning",
		);
		setPendingSwitch(agentId);
		try {
			const result = await ctx.newSession();
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
