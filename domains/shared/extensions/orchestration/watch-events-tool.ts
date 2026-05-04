import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { tailEvents } from "../../../../lib/driver/event-stream.ts";

export function registerWatchEventsTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "watch_events",
		label: "Watch Driver Events",
		description: "Read driver events from a run JSONL log with cursor support.",
		parameters: Type.Object({
			planSlug: Type.String({ description: "Plan slug for the driver run" }),
			runId: Type.String({ description: "Driver run ID" }),
			since: Type.Optional(
				Type.Number({
					description: "Cursor line number returned by watch_events",
				}),
			),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const eventLogPath = join(
				ctx.cwd,
				"missions",
				"sessions",
				params.planSlug,
				"runs",
				params.runId,
				"events.jsonl",
			);
			const result = await tailEvents(eventLogPath, params.since ?? 0);

			return {
				...result,
				content: [
					{
						type: "text" as const,
						text: `Read ${result.events.length} driver event(s); cursor ${result.cursor}`,
					},
				],
				details: result,
			};
		},
	});
}
