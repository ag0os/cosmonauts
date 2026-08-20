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
	deriveKnowledgeProposalIdentity,
	KNOWLEDGE_RECORD_TYPES,
	type KnowledgeRecordType,
	type MemoryRecordDraft,
	type MemoryRetrievalRequest,
	type MemoryStore,
	type MemoryWriteResult,
} from "../../memory/index.ts";

const DEFAULT_RECALL_LIMIT = 5;
const MAX_RECALL_LIMIT = 20;
const QUALIFIED_DISTILLER_ID = "coding/distiller";
const KnowledgeTypeLiterals = KNOWLEDGE_RECORD_TYPES.map((type) =>
	Type.Literal(type),
);

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

interface KnowledgeProposalToolOptions {
	readonly createKnowledgeStore: (projectRoot: string) => MemoryStore;
	readonly now: () => Date;
}

interface KnowledgeProposalRequest {
	readonly planSlug: string;
	readonly type: KnowledgeRecordType;
	readonly title: string;
	readonly description: string;
	readonly content: string;
	readonly tags: readonly string[];
	readonly source: string;
	readonly sourceDate?: string;
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

export function registerKnowledgeProposalTool(
	pi: ExtensionAPI,
	options: KnowledgeProposalToolOptions,
): void {
	pi.registerTool({
		name: "propose_knowledge",
		label: "Propose Knowledge",
		description:
			"Write one attributable OKF knowledge proposal for later human review.",
		executionMode: "sequential",
		parameters: Type.Object(
			{
				planSlug: Type.String({ description: "Source plan slug." }),
				type: Type.Union(KnowledgeTypeLiterals, {
					description: "Ratified OKF knowledge type.",
				}),
				title: Type.String({ description: "Concise proposal title." }),
				description: Type.String({
					description: "One-sentence proposal summary.",
				}),
				content: Type.String({ description: "Self-contained proposal body." }),
				tags: Type.Array(Type.String(), {
					description: "Categorical proposal tags.",
				}),
				source: Type.String({
					description: "Specific source artifact for this proposal.",
				}),
				sourceDate: Type.Optional(
					Type.String({
						description:
							"Canonical source timestamp when the source supplies one.",
					}),
				),
				// Closed schema: the proposal tool carries no output authority, so an
				// unknown property — notably `path` or `resource` — must be rejected
				// rather than silently ignored (B-013).
			},
			{ additionalProperties: false },
		),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			let draft: MemoryRecordDraft;
			try {
				draft = deriveKnowledgeProposalDraft({
					request: parseKnowledgeProposalRequest(params),
					now: options.now,
				});
			} catch (error: unknown) {
				const reason = error instanceof Error ? error.message : String(error);
				return textResult(`Knowledge proposal request is invalid: ${reason}`, {
					status: "invalid_request",
					reason,
				});
			}

			const result = await writeKnowledgeProposalThroughStore({
				store: options.createKnowledgeStore(ctx.cwd),
				draft,
			});
			if (result.kind === "written") {
				return textResult(`Wrote knowledge proposal to ${result.path}.`, {
					status: "written",
					path: result.path,
					record: result.record,
				});
			}
			return textResult(
				`Knowledge proposal was not written: ${result.reason}`,
				{
					status: result.kind,
					reason: result.reason,
					...(result.kind === "failed" && result.path
						? { path: result.path }
						: {}),
				},
			);
		},
	});
}

/** Shared write seam used by the dedicated proposal adapter. */
export function writeKnowledgeProposalThroughStore(options: {
	readonly store: MemoryStore;
	readonly draft: MemoryRecordDraft;
}): Promise<MemoryWriteResult> {
	return options.store.write(options.draft);
}

function deriveKnowledgeProposalDraft(options: {
	readonly request: KnowledgeProposalRequest;
	readonly now: () => Date;
}): MemoryRecordDraft {
	const derived = deriveKnowledgeProposalIdentity({
		...options.request,
		writer: QUALIFIED_DISTILLER_ID,
	});
	const writeDate =
		derived.proposalIdentity.sourceDate ?? options.now().toISOString();
	return {
		type: derived.type,
		scope: "project",
		kind: "semantic",
		title: derived.title,
		description: derived.description,
		content: derived.content,
		tags: derived.tags,
		timestamp: writeDate,
		resource: derived.resource,
		writer: derived.writer,
		source: derived.source,
		date: writeDate,
		proposalIdentity: derived.proposalIdentity,
	};
}

function parseKnowledgeProposalRequest(
	value: unknown,
): KnowledgeProposalRequest {
	if (!value || typeof value !== "object") {
		throw new Error("proposal input must be an object");
	}
	const input = value as Record<string, unknown>;
	const type = input.type;
	if (
		typeof type !== "string" ||
		!KNOWLEDGE_RECORD_TYPES.includes(type as KnowledgeRecordType)
	) {
		throw new Error("type must be decision, trade-off, gotcha, or convention");
	}
	if (
		!Array.isArray(input.tags) ||
		!input.tags.every((tag) => typeof tag === "string")
	) {
		throw new Error("tags must be an array of strings");
	}
	if (input.sourceDate !== undefined && typeof input.sourceDate !== "string") {
		throw new Error("sourceDate must be a string when provided");
	}
	return {
		planSlug: requiredString(input.planSlug, "planSlug"),
		type: type as KnowledgeRecordType,
		title: requiredString(input.title, "title"),
		description: requiredString(input.description, "description"),
		content: requiredString(input.content, "content"),
		tags: input.tags,
		source: requiredString(input.source, "source"),
		...(input.sourceDate === undefined
			? {}
			: { sourceDate: input.sourceDate as string }),
	};
}

function requiredString(value: unknown, field: string): string {
	if (typeof value !== "string") throw new Error(`${field} must be a string`);
	return value;
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
