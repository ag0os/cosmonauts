import type {
	AgentToolResult,
	ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	loadProjectConfig,
	resolveEpisodicLogConfig,
} from "../../config/index.ts";
import {
	combineMemoryRetrieval,
	KNOWLEDGE_RECORD_TYPES,
	type MemoryRecordDraft,
	type MemoryRetrievalRequest,
	type MemoryStore,
	type MemoryWriteResult,
} from "../../memory/index.ts";

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

export interface AuthoredRecallStoreOptions {
	readonly projectRoot: string;
	readonly episodeWarningThreshold?: number;
}

export interface KnowledgeRecallOptions {
	readonly createKnowledgeStore: (projectRoot: string) => MemoryStore;
	readonly createAuthoredStore?: (
		options: AuthoredRecallStoreOptions,
	) => MemoryStore;
	readonly loadConfig?: typeof loadProjectConfig;
}

export function createKnowledgeRecallHandler(
	options: KnowledgeRecallOptions,
): KnowledgeRecallHandler {
	return async (request) => {
		const query = request.query.trim();
		if (!query) {
			return textResult("Recall requires non-empty query text.", {
				status: "invalid_request",
				reason: "query must be a non-empty string",
			});
		}

		const requests: MemoryRetrievalRequest[] = [
			{
				key: "knowledge",
				store: options.createKnowledgeStore(request.projectRoot),
				scope: {
					projectRoot: request.projectRoot,
					scopes: ["project", "user"] as const,
				},
				query: { text: query, recordTypes: KNOWLEDGE_RECORD_TYPES },
			},
		];
		if (options.createAuthoredStore) {
			const settings = resolveEpisodicLogConfig(
				await (options.loadConfig ?? loadProjectConfig)(request.projectRoot),
			);
			requests.push({
				key: "memory",
				store: options.createAuthoredStore({
					projectRoot: request.projectRoot,
					...(settings.enabled
						? { episodeWarningThreshold: settings.warningThreshold }
						: {}),
				}),
				scope: {
					projectRoot: request.projectRoot,
					scopes: ["project", "user"] as const,
				},
				query: {
					text: query,
					recordTypes: settings.enabled
						? ["note", "profile", "playbook", "episode"]
						: ["note", "profile", "playbook"],
				},
			});
		}

		const result = await combineMemoryRetrieval({
			requests,
			limit: request.limit,
		});
		const records = result.records.map((record) => ({
			type: record.type,
			title: record.title,
			description: record.description,
			scope: record.scope,
			kind: record.kind,
			tags: record.tags,
			timestamp: record.timestamp,
			resource: record.resource,
			path: record.path,
			content: record.content,
			...(record.writer ? { writer: record.writer } : {}),
			...(record.source ? { source: record.source } : {}),
			...(record.date ? { date: record.date } : {}),
		}));
		const details = {
			status: records.length > 0 ? "matched" : "no_match",
			query,
			limit: request.limit,
			searchedScopes: result.searchedScopes,
			skippedScopes: result.skippedScopes,
			warnings: result.warnings,
			stats: result.stats,
			records,
		};
		if (records.length === 0) {
			return textResult(`No durable records matched "${query}".`, details);
		}
		return textResult(
			[
				`Found ${records.length} durable record${records.length === 1 ? "" : "s"} for "${query}".`,
				...records.map((record) =>
					[
						`## Durable record: ${record.title}`,
						`type: ${record.type}`,
						`scope: ${record.scope}`,
						`timestamp: ${record.timestamp}`,
						`resource: ${record.resource}`,
						"",
						record.content,
					].join("\n"),
				),
			].join("\n\n"),
			details,
		);
	};
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

/** Shared write seam used by the dedicated proposal adapter in the next slice. */
export function writeKnowledgeProposalThroughStore(options: {
	readonly store: MemoryStore;
	readonly draft: MemoryRecordDraft;
}): Promise<MemoryWriteResult> {
	return options.store.write(options.draft);
}

function textResult(
	text: string,
	details: Record<string, unknown>,
): AgentToolResult<Record<string, unknown>> {
	return {
		content: [{ type: "text", text }],
		details,
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
