import type {
	AgentToolResult,
	ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const DEFAULT_RECALL_LIMIT = 5;
const MAX_RECALL_LIMIT = 20;

export interface KnowledgeRecallRequest {
	readonly query: string;
	readonly limit: number;
	readonly projectRoot: string;
}

/** Stage 4 supplies the MemoryStore-backed implementation of this seam. */
export type KnowledgeRecallHandler = (
	request: KnowledgeRecallRequest,
) => Promise<AgentToolResult<Record<string, unknown>>>;

export function createEmptyKnowledgeRecallHandler(): KnowledgeRecallHandler {
	return async (request) => emptyKnowledgeRecallResult(request);
}

export function registerKnowledgeRecallTool(
	pi: ExtensionAPI,
	recallKnowledge: KnowledgeRecallHandler,
): void {
	pi.registerTool({
		name: "recall",
		label: "Recall",
		description: "Search durable project and user knowledge records.",
		parameters: Type.Object({
			query: Type.String({ description: "Text to search for." }),
			limit: Type.Optional(
				Type.Integer({
					description: "Maximum records to return; capped at 20.",
					minimum: 1,
				}),
			),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) =>
			recallKnowledge({
				query: normalizeQuery((params as { query?: unknown }).query),
				limit: normalizeLimit((params as { limit?: unknown }).limit),
				projectRoot: ctx.cwd,
			}),
	});
}

export function emptyKnowledgeRecallResult(
	request: KnowledgeRecallRequest,
): AgentToolResult<Record<string, unknown>> {
	return {
		content: [
			{
				type: "text",
				text: `No knowledge records matched "${request.query}".`,
			},
		],
		details: {
			status: "no_match",
			query: request.query,
			limit: request.limit,
			searchedScopes: ["project", "user"],
			skippedScopes: [],
			warnings: [],
			records: [],
		},
	};
}

function normalizeQuery(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function normalizeLimit(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return DEFAULT_RECALL_LIMIT;
	}
	return Math.max(1, Math.min(MAX_RECALL_LIMIT, Math.trunc(value)));
}
