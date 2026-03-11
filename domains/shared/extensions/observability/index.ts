import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * Lightweight observability extension.
 * Wires up Pi lifecycle events and logs structured entries for diagnostics.
 */
export default function observabilityExtension(pi: ExtensionAPI): void {
	const sessionStart = Date.now();

	pi.on("turn_start", async (event) => {
		pi.appendEntry("observability", {
			event: "turn_start",
			turnIndex: event.turnIndex,
			timestamp: event.timestamp,
		});
	});

	pi.on("turn_end", async (event) => {
		pi.appendEntry("observability", {
			event: "turn_end",
			turnIndex: event.turnIndex,
			toolResultCount: event.toolResults.length,
		});
	});

	pi.on("tool_call", async (event) => {
		pi.appendEntry("observability", {
			event: "tool_call",
			toolCallId: event.toolCallId,
			toolName: event.toolName,
		});
	});

	pi.on("tool_execution_end", async (event) => {
		pi.appendEntry("observability", {
			event: "tool_execution_end",
			toolCallId: event.toolCallId,
			toolName: event.toolName,
			isError: event.isError,
		});
	});

	pi.on("session_shutdown", async () => {
		const durationMs = Date.now() - sessionStart;
		pi.appendEntry("observability", {
			event: "session_shutdown",
			durationMs,
		});
	});
}
