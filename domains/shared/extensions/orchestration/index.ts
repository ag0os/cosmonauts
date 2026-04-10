import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";
import {
	activityBus,
	registerSessionCleanup,
	unregisterSessionCleanup,
} from "../../../../lib/orchestration/activity-bus.ts";
import type { SpawnActivityEvent } from "../../../../lib/orchestration/message-bus.ts";
import { discoverFrameworkBundledPackageDirs } from "../../../../lib/packages/dev-bundled.ts";
import { CosmonautsRuntime } from "../../../../lib/runtime.ts";
import { registerChainTool } from "./chain-tool.ts";
import { roleLabel } from "./rendering.ts";
import { registerSpawnTool } from "./spawn-tool.ts";

export default function orchestrationExtension(pi: ExtensionAPI) {
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

	// ── Spawn activity rendering ──────────────────────────────────────────

	// Custom renderer for spawn-activity messages in the TUI
	pi.registerMessageRenderer("spawn-activity", (message, _opts, theme) => {
		const details = message.details as
			| { role: string; taskId?: string; summary: string }
			| undefined;
		if (!details) {
			const text =
				typeof message.content === "string" ? message.content : "(activity)";
			return new Text(theme.fg("dim", text), 0, 0);
		}
		const label = details.taskId
			? `${roleLabel(details.role)} (${details.taskId})`
			: roleLabel(details.role);
		const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
		box.addChild(
			new Text(theme.fg("dim", `  🔧 ${label}: ${details.summary}`), 0, 0),
		);
		return box;
	});

	// Throttle: track last emit time per spawnId, debounce at 1s
	const lastEmit = new Map<string, number>();
	const THROTTLE_MS = 1000;

	// Activity bus subscription is scoped to the owning session.
	// We subscribe at session_start (when the session ID is known) and
	// register a cleanup callback so spawn-tool can tear it down when
	// the child session is disposed (Pi has no dispose-time event).
	let activityToken: ReturnType<typeof activityBus.subscribe> | undefined;
	let boundSessionId: string | undefined;

	function teardownActivitySubscription() {
		if (activityToken !== undefined) {
			activityBus.unsubscribe(activityToken);
			activityToken = undefined;
		}
		if (boundSessionId !== undefined) {
			unregisterSessionCleanup(boundSessionId);
			boundSessionId = undefined;
		}
		lastEmit.clear();
	}

	pi.on("session_start", async (_event, ctx) => {
		// Tear down any prior subscription (e.g. session switch without dispose)
		teardownActivitySubscription();

		const sessionId = ctx.sessionManager.getSessionId();
		boundSessionId = sessionId;

		// Register cleanup so spawn-tool can tear us down on session.dispose()
		registerSessionCleanup(sessionId, teardownActivitySubscription);

		activityToken = activityBus.subscribe<SpawnActivityEvent>(
			"spawn_activity",
			(event) => {
				// Only forward events from spawns owned by this session
				if (event.parentSessionId !== sessionId) return;

				// Only surface tool_start events to avoid flooding
				if (event.activity.kind !== "tool_start") return;

				const now = Date.now();
				const last = lastEmit.get(event.spawnId) ?? 0;
				if (now - last < THROTTLE_MS) return;
				lastEmit.set(event.spawnId, now);

				const label = event.taskId
					? `${roleLabel(event.role)} (${event.taskId})`
					: roleLabel(event.role);

				pi.sendMessage(
					{
						customType: "spawn-activity",
						content: `${label}: ${event.activity.summary}`,
						display: true,
						details: {
							role: event.role,
							taskId: event.taskId,
							summary: event.activity.summary,
						},
					},
					{ deliverAs: "nextTurn" },
				);
			},
		);
	});

	// Clean up on process exit as a safety net
	pi.on("session_shutdown", async () => {
		teardownActivitySubscription();
	});

	// ── Tool registration ─────────────────────────────────────────────────

	registerChainTool(pi, getRuntime);
	registerSpawnTool(pi, getRuntime);
}
