import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	FileRunStore,
	type RunStatusSummary,
	type RunWatchSummary,
	runStatus,
	runWatch,
} from "../../../../lib/durable-runtime/index.ts";

export function registerRunControlTools(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "run_status",
		label: "Run Status",
		description:
			"Read normalized durable runtime status for a run. This is an observation-only tool backed by the durable runtime controller.",
		parameters: Type.Object({
			scope: Type.String({
				description:
					"Durable run scope. For Drive runs, this is the plan slug.",
			}),
			runId: Type.String({ description: "Durable run ID" }),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const store = createRunStore(ctx.cwd);
			const summary = await runStatus(store, {
				scope: params.scope,
				runId: params.runId,
			});

			return {
				content: [
					{
						type: "text" as const,
						text: renderStatusText(params.scope, params.runId, summary),
					},
				],
				details: summary,
			};
		},
	});

	pi.registerTool({
		name: "run_watch",
		label: "Run Watch",
		description:
			"Read normalized durable runtime events for a run with sequence-cursor paging. This is an observation-only tool backed by the durable runtime controller.",
		parameters: Type.Object({
			scope: Type.String({
				description:
					"Durable run scope. For Drive runs, this is the plan slug.",
			}),
			runId: Type.String({ description: "Durable run ID" }),
			sinceSeq: Type.Optional(
				Type.Number({
					description:
						"Only return normalized events with sequence numbers greater than this cursor.",
				}),
			),
			limit: Type.Optional(
				Type.Number({
					description: "Maximum number of normalized events to return.",
				}),
			),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const store = createRunStore(ctx.cwd);
			const summary = await runWatch(
				store,
				{
					scope: params.scope,
					runId: params.runId,
				},
				{
					sinceSeq: params.sinceSeq,
					limit: params.limit,
				},
			);

			return {
				...summary,
				content: [
					{
						type: "text" as const,
						text: renderWatchText(summary),
					},
				],
				details: summary,
			};
		},
	});
}

function createRunStore(cwd: string): FileRunStore {
	return new FileRunStore({
		rootDir: join(cwd, "missions", "sessions"),
	});
}

function renderStatusText(
	scope: string,
	runId: string,
	summary: RunStatusSummary | undefined,
): string {
	if (!summary) {
		return `${scope}/${runId}: not found`;
	}

	const source =
		summary.eventStatus && summary.recordStatus !== summary.eventStatus
			? ` (${summary.statusSource}; record ${summary.recordStatus}, event ${summary.eventStatus})`
			: ` (${summary.statusSource})`;
	const diagnostics =
		summary.diagnostics.length > 0
			? `, diagnostics ${summary.diagnostics.length}`
			: "";
	return `${summary.scope}/${summary.runId}: ${summary.status}${source}${diagnostics}`;
}

function renderWatchText(summary: RunWatchSummary): string {
	const diagnostics =
		summary.diagnostics.length > 0
			? `; diagnostics ${summary.diagnostics.length}`
			: "";
	if (!summary.found) {
		return `${summary.scope}/${summary.runId}: not found; no normalized run events; cursor ${summary.cursor}${diagnostics}`;
	}
	if (summary.events.length === 0) {
		return `No new normalized run events; cursor ${summary.cursor}${diagnostics}`;
	}

	const lines = summary.events.map((event) => `- ${event.text}`);
	lines.push(`cursor ${summary.cursor}`);
	if (summary.diagnostics.length > 0) {
		lines.push(`diagnostics ${summary.diagnostics.length}`);
	}
	return lines.join("\n");
}
