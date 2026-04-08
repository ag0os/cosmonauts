/**
 * Agent-switch extension — registers the /agent command.
 *
 * Allows switching between Cosmonauts agent personas by starting a new Pi
 * session configured for the target agent. The pending switch is stored in a
 * globalThis slot (lib/interactive/agent-switch.ts) so the CLI's session setup
 * can pick up the target agent ID.
 */

import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { extractAgentIdFromSystemPrompt } from "../../../../lib/agents/runtime-identity.ts";
import {
	clearPendingSwitch,
	setPendingSwitch,
} from "../../../../lib/interactive/agent-switch.ts";
import { discoverFrameworkBundledPackageDirs } from "../../../../lib/packages/dev-bundled.ts";
import { CosmonautsRuntime } from "../../../../lib/runtime.ts";

export default function agentSwitchExtension(pi: ExtensionAPI): void {
	const runtimeCache = new Map<string, Promise<CosmonautsRuntime>>();
	const frameworkRoot = resolve(
		fileURLToPath(import.meta.url),
		"..",
		"..",
		"..",
		"..",
		"..",
	);
	const domainsDir = join(frameworkRoot, "domains");
	const bundledDirsPromise = discoverFrameworkBundledPackageDirs(frameworkRoot);

	function getRuntime(cwd: string): Promise<CosmonautsRuntime> {
		let promise = runtimeCache.get(cwd);
		if (!promise) {
			promise = bundledDirsPromise
				.then((bundledDirs) =>
					CosmonautsRuntime.create({
						builtinDomainsDir: domainsDir,
						projectRoot: cwd,
						bundledDirs,
					}),
				)
				.catch((error: unknown) => {
					runtimeCache.delete(cwd);
					throw error;
				});
			runtimeCache.set(cwd, promise);
		}
		return promise;
	}

	// Tracks the most-recent cwd so getArgumentCompletions can bootstrap
	// the runtime without having access to the command context.
	let lastCwd: string | undefined;

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
			const cwd = lastCwd ?? process.cwd();
			try {
				const runtime = await getRuntime(cwd);
				const ids = runtime.agentRegistry.listIds();
				const filtered = ids.filter((id) => id.startsWith(prefix));
				return filtered.length > 0
					? filtered.map((id) => ({ value: id, label: id }))
					: null;
			} catch {
				return null;
			}
		},
		handler: async (args, ctx) => {
			const agentId = args.trim();
			const runtime = await getRuntime(ctx.cwd);
			const registry = runtime.agentRegistry;

			if (agentId) {
				// With argument: defer final validation to CLI runtime session creation.
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
		lastCwd = ctx.cwd;
		const agentId = extractAgentIdFromSystemPrompt(ctx.getSystemPrompt());
		if (!agentId) return;
		const modelName = ctx.model?.name ?? ctx.model?.id ?? "unknown";
		ctx.ui.notify(`Switched to \`${agentId}\` (${modelName})`, "info");
	});
}
