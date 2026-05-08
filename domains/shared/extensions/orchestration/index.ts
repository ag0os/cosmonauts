import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";
import type {
	DriverActivityBusEvent,
	DriverEventBusEvent,
} from "../../../../lib/driver/event-stream.ts";
import {
	activityBus,
	registerSessionCleanup,
	unregisterSessionCleanup,
} from "../../../../lib/orchestration/activity-bus.ts";
import type { SpawnActivityEvent } from "../../../../lib/orchestration/message-bus.ts";
import { discoverFrameworkBundledPackageDirs } from "../../../../lib/packages/dev-bundled.ts";
import { CosmonautsRuntime } from "../../../../lib/runtime.ts";
import { registerChainTool } from "./chain-tool.ts";
import { registerDriverTool } from "./driver-tool.ts";
import { roleLabel } from "./rendering.ts";
import { registerSpawnTool } from "./spawn-tool.ts";
import { registerWatchEventsTool } from "./watch-events-tool.ts";

type LiveActivityMessage = Parameters<ExtensionAPI["sendMessage"]>[0];

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
			return new Text(theme.fg("muted", text), 0, 0);
		}
		const label = details.taskId
			? `${roleLabel(details.role)} (${details.taskId})`
			: roleLabel(details.role);
		const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
		box.addChild(
			new Text(theme.fg("muted", `  🔧 ${label}: ${details.summary}`), 0, 0),
		);
		return box;
	});

	// Throttle: track last emit time per spawnId, debounce at 1s
	const lastEmit = new Map<string, number>();
	const pendingLiveMessages: LiveActivityMessage[] = [];
	const THROTTLE_MS = 1000;
	const LIVE_MESSAGE_FLUSH_MS = 100;
	let liveMessageFlushTimer: ReturnType<typeof setTimeout> | undefined;

	// Activity bus subscription is scoped to the owning session.
	// We subscribe at session_start (when the session ID is known) and
	// register a cleanup callback so spawn-tool can tear it down when
	// the child session is disposed (Pi has no dispose-time event).
	let activityToken: ReturnType<typeof activityBus.subscribe> | undefined;
	let driverActivityToken: ReturnType<typeof activityBus.subscribe> | undefined;
	let driverEventToken: ReturnType<typeof activityBus.subscribe> | undefined;
	let boundSessionId: string | undefined;

	function teardownActivitySubscription() {
		if (activityToken !== undefined) {
			activityBus.unsubscribe(activityToken);
			activityToken = undefined;
		}
		if (driverActivityToken !== undefined) {
			activityBus.unsubscribe(driverActivityToken);
			driverActivityToken = undefined;
		}
		if (driverEventToken !== undefined) {
			activityBus.unsubscribe(driverEventToken);
			driverEventToken = undefined;
		}
		if (boundSessionId !== undefined) {
			unregisterSessionCleanup(boundSessionId);
			boundSessionId = undefined;
		}
		if (liveMessageFlushTimer !== undefined) {
			clearTimeout(liveMessageFlushTimer);
			liveMessageFlushTimer = undefined;
		}
		pendingLiveMessages.length = 0;
		lastEmit.clear();
	}

	pi.on("session_start", async (_event, ctx) => {
		// Tear down any prior subscription (e.g. session switch without dispose)
		teardownActivitySubscription();

		const sessionId = ctx.sessionManager.getSessionId();
		boundSessionId = sessionId;

		function flushLiveMessages() {
			liveMessageFlushTimer = undefined;
			if (!ctx.isIdle()) {
				scheduleLiveMessageFlush();
				return;
			}

			const messages = pendingLiveMessages.splice(0);
			for (const message of messages) {
				pi.sendMessage(message);
			}
		}

		function scheduleLiveMessageFlush() {
			if (liveMessageFlushTimer !== undefined) return;
			liveMessageFlushTimer = setTimeout(
				flushLiveMessages,
				LIVE_MESSAGE_FLUSH_MS,
			);
		}

		function sendLiveMessage(message: LiveActivityMessage) {
			if (ctx.isIdle()) {
				pi.sendMessage(message);
				return;
			}

			pendingLiveMessages.push(message);
			scheduleLiveMessageFlush();
		}

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

				sendLiveMessage({
					customType: "spawn-activity",
					content: `${label}: ${event.activity.summary}`,
					display: true,
					details: {
						role: event.role,
						taskId: event.taskId,
						summary: event.activity.summary,
					},
				});
			},
		);

		driverActivityToken = activityBus.subscribe<DriverActivityBusEvent>(
			"driver_activity",
			(event) => {
				if (event.parentSessionId !== sessionId) return;

				sendLiveMessage({
					customType: "driver-activity",
					content: formatDriverActivityMessage(event),
					display: true,
					details: event,
				});
			},
		);

		driverEventToken = activityBus.subscribe<DriverEventBusEvent>(
			"driver_event",
			(event) => {
				if (event.parentSessionId !== sessionId) return;

				sendLiveMessage({
					customType: "driver-event",
					content: formatDriverEventMessage(event),
					display: true,
					details: event,
				});
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
	registerDriverTool(pi, getRuntime);
	registerWatchEventsTool(pi);
}

function formatDriverActivityMessage(event: DriverActivityBusEvent): string {
	const prefix = `Driver ${event.runId} ${event.taskId}`;
	switch (event.activity.kind) {
		case "tool_start":
			return `${prefix}: ${event.activity.summary}`;
		case "tool_end":
			return `${prefix}: ${event.activity.toolName} ${event.activity.isError ? "failed" : "completed"}`;
		case "turn_start":
			return `${prefix}: turn started`;
		case "turn_end":
			return `${prefix}: turn ended`;
		case "compaction":
			return `${prefix}: compaction`;
	}
}

function formatDriverEventMessage(busEvent: DriverEventBusEvent): string {
	const event = busEvent.event;
	switch (event.type) {
		case "preflight":
			return `Driver ${event.runId} ${event.taskId}: preflight failed`;
		case "task_done":
			return `Driver ${event.runId} ${event.taskId}: done`;
		case "task_blocked":
			return `Driver ${event.runId} ${event.taskId}: blocked — ${event.reason}`;
		case "commit_made":
			return `Driver ${event.runId} ${event.taskId}: committed ${event.sha.slice(0, 12)}`;
		case "lock_warning":
			return `Driver ${event.runId}: ${event.reason}`;
		case "run_completed":
			return `Driver ${event.runId}: completed ${event.summary.done}/${event.summary.total}`;
		case "run_aborted":
			return `Driver ${event.runId}: aborted — ${event.reason}`;
		default:
			return `Driver ${busEvent.runId}: ${event.type}`;
	}
}
