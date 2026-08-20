import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { extractAgentIdFromSystemPrompt } from "../../agents/runtime-identity.ts";
import {
	allocateInjectionBudget,
	KNOWLEDGE_RECORD_TYPES,
	type MemoryRetrieveResult,
	type MemoryRetrieveStats,
	type MemoryStore,
} from "../../memory/index.ts";
import {
	type AgentMemoryAuthorizationState,
	renderAuthoredMemoryContext,
} from "../agent-memory/index.ts";
import {
	type ArchitectureMemoryAuthorizationState,
	renderArchitectureContext,
} from "../architecture-memory/index.ts";

const COMBINED_CONTEXT_TYPE = "cosmonauts-combined-context";
const LEGACY_CONTEXT_TYPES = new Set([
	"agent-memory-context",
	"architecture-map-context",
]);
const COMBINED_CONTEXT_MAX_BYTES = 24_000;
const INDEX_LIMIT = 50;

export interface CombinedContextOptions {
	readonly agentId: string;
	readonly authorizeAuthoredMemory: boolean;
	readonly authorizeArchitecture: boolean;
	readonly authoredAuthorization: AgentMemoryAuthorizationState;
	readonly architectureAuthorization: ArchitectureMemoryAuthorizationState;
	readonly userCosmonautsRoot: string;
	readonly createKnowledgeStore: (projectRoot: string) => MemoryStore;
	readonly createAuthoredStore: (projectRoot: string) => MemoryStore;
	readonly createArchitectureStore: (projectRoot: string) => MemoryStore;
}

export function registerCombinedContextHandler(
	pi: ExtensionAPI,
	options: CombinedContextOptions,
): void {
	pi.on("before_agent_start", async (event, ctx) => {
		const startedAt = performance.now();
		const eligible =
			extractAgentIdFromSystemPrompt(systemPrompt(event)) === options.agentId;
		options.authoredAuthorization.authorized =
			eligible && options.authorizeAuthoredMemory;
		options.architectureAuthorization.authorized =
			eligible && options.authorizeArchitecture;
		if (!eligible) return;

		const projectRoot = cwd(ctx);
		const pending: Array<
			Promise<{ key: ContextSectionKey; result: MemoryRetrieveResult }>
		> = [
			options
				.createKnowledgeStore(projectRoot)
				.retrieve(
					{ projectRoot, scopes: ["project", "user"] },
					{ text: "", recordTypes: KNOWLEDGE_RECORD_TYPES },
				)
				.then((result) => ({ key: "knowledge", result })),
		];
		if (options.authoredAuthorization.authorized) {
			pending.push(
				options
					.createAuthoredStore(projectRoot)
					.retrieve(
						{ projectRoot, scopes: ["project", "user"] },
						{
							text: "",
							recordTypes: ["note", "profile", "playbook"],
						},
					)
					.then((result) => ({ key: "memory", result })),
			);
		}
		if (options.architectureAuthorization.authorized) {
			pending.push(
				options
					.createArchitectureStore(projectRoot)
					.retrieve(
						{ projectRoot, scopes: ["project"] },
						{
							resource: undefined,
							recordTypes: ["code-structure-index", "code-structure-module"],
							limit: 1,
						},
					)
					.then((result) => ({ key: "architecture", result })),
			);
		}

		const retrieved = await Promise.all(pending);
		const results = Object.fromEntries(
			retrieved.map(({ key, result }) => [key, result]),
		) as Partial<Record<ContextSectionKey, MemoryRetrieveResult>>;
		const sections = [
			section(
				"memory",
				renderMemory(results.memory, options, projectRoot),
				"recall(query)",
			),
			section(
				"architecture",
				results.architecture
					? renderArchitectureContext(results.architecture)
					: undefined,
				"architecture_map_read",
			),
			section(
				"knowledge",
				renderKnowledgeContext(results.knowledge),
				"recall(query)",
			),
		].filter(
			(value): value is NonNullable<typeof value> => value !== undefined,
		);
		const allocated = allocateInjectionBudget({
			sections,
			maxBytes: COMBINED_CONTEXT_MAX_BYTES,
			prefix: "Combined durable context for the current turn.\n\n",
		});
		if (!allocated.content) return;

		const sectionDetails = Object.fromEntries(
			retrieved.map(({ key, result }) => [
				key,
				{
					stats: normalizeStats(result.stats),
					records: result.records.length,
					warnings: result.warnings.length,
					allocation: allocated.allocations[key],
				},
			]),
		);
		return {
			message: {
				customType: COMBINED_CONTEXT_TYPE,
				content: allocated.content,
				display: false,
				details: {
					sections: sectionDetails,
					aggregate: {
						filesScanned: retrieved.reduce(
							(total, { result }) => total + (result.stats?.filesScanned ?? 0),
							0,
						),
						bytesRead: retrieved.reduce(
							(total, { result }) => total + (result.stats?.bytesRead ?? 0),
							0,
						),
						durationMs: performance.now() - startedAt,
					},
				},
			},
		};
	});

	const onContext = pi.on as unknown as (
		event: "context",
		handler: (event: unknown) => Promise<unknown>,
	) => void;
	onContext("context", async (event) => {
		const messages = contextMessages(event);
		const newest = messages.findLastIndex(
			(message) => customType(message) === COMBINED_CONTEXT_TYPE,
		);
		return {
			messages: messages.filter(
				(message, index) =>
					(!LEGACY_CONTEXT_TYPES.has(customType(message) ?? "") &&
						customType(message) !== COMBINED_CONTEXT_TYPE) ||
					index === newest,
			),
		};
	});
}

type ContextSectionKey = "memory" | "architecture" | "knowledge";

function renderMemory(
	result: MemoryRetrieveResult | undefined,
	options: CombinedContextOptions,
	projectRoot: string,
): string | undefined {
	if (!result) return undefined;
	return renderAuthoredMemoryContext({
		records: result.records,
		warnings: result.warnings,
		projectRoot,
		userCosmonautsRoot: options.userCosmonautsRoot,
		maxBytes: Number.MAX_SAFE_INTEGER,
	});
}

function renderKnowledgeContext(
	result: MemoryRetrieveResult | undefined,
): string | undefined {
	if (!result) return undefined;
	const records = result.records
		.toSorted(
			(left, right) =>
				right.timestamp.localeCompare(left.timestamp) ||
				left.path.localeCompare(right.path),
		)
		.slice(0, INDEX_LIMIT);
	if (records.length === 0 && result.warnings.length === 0) return undefined;
	return [
		"Knowledge index",
		`Up to ${INDEX_LIMIT} current project/user knowledge records, ordered by timestamp then path.`,
		"This section contains compact metadata only, not record bodies.",
		"Use recall(query) for complete knowledge record details.",
		...(result.warnings.length > 0
			? [
					"",
					"Knowledge warnings:",
					...result.warnings.map((warning) => `- ${warning.message}`),
				]
			: []),
		"",
		...records.map((record) =>
			[
				`- type: ${record.type}`,
				`  title: ${record.title}`,
				`  scope: ${record.scope}`,
				`  timestamp: ${record.timestamp}`,
				`  description: ${record.description}`,
				`  resource: ${record.resource}`,
			].join("\n"),
		),
	].join("\n");
}

function section(
	id: ContextSectionKey,
	content: string | undefined,
	detailTool: string,
): { id: ContextSectionKey; content: string; detailTool: string } | undefined {
	return content ? { id, content, detailTool } : undefined;
}

function normalizeStats(
	stats: MemoryRetrieveStats | undefined,
): MemoryRetrieveStats {
	return stats ?? { filesScanned: 0, bytesRead: 0, durationMs: 0 };
}

function systemPrompt(event: unknown): string {
	return stringField(event, "systemPrompt") ?? "";
}

function cwd(ctx: unknown): string {
	const value = stringField(ctx, "cwd");
	if (!value) throw new Error("Combined context requires ctx.cwd.");
	return value;
}

function stringField(value: unknown, key: string): string | undefined {
	if (!value || typeof value !== "object" || !(key in value)) return undefined;
	const field = (value as Record<string, unknown>)[key];
	return typeof field === "string" ? field : undefined;
}

function contextMessages(event: unknown): unknown[] {
	if (!event || typeof event !== "object" || !("messages" in event)) return [];
	const messages = (event as { messages?: unknown }).messages;
	return Array.isArray(messages) ? messages : [];
}

function customType(message: unknown): string | undefined {
	return stringField(message, "customType");
}
