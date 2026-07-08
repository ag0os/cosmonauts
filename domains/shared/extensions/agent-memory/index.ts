import { homedir } from "node:os";
import { join, relative, sep } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { extractAgentIdFromSystemPrompt } from "../../../../lib/agents/runtime-identity.ts";
import {
	createMarkdownMemoryStore,
	type MemoryKind,
	type MemoryRecordDraft,
	type MemoryRetrieveResult,
	type MemoryScopeName,
	type MemoryStore,
	type MemoryWriteResult,
} from "../../../../lib/memory/index.ts";

const COSMO_AGENT_ID = "main/cosmo";
const SOURCE = COSMO_AGENT_ID;
const DEFAULT_RECALL_LIMIT = 5;
const MAX_RECALL_LIMIT = 20;

const ScopeLiterals = [Type.Literal("project"), Type.Literal("user")];
const KindLiterals = [
	Type.Literal("semantic"),
	Type.Literal("procedural"),
	Type.Literal("episodic"),
];

export interface AgentMemoryStoreFactoryOptions {
	readonly projectRoot: string;
	readonly userCosmonautsRoot: string;
	readonly now: () => Date;
}

export interface AgentMemoryExtensionDeps {
	readonly userCosmonautsRoot?: string;
	readonly storeFactory?: (
		options: AgentMemoryStoreFactoryOptions,
	) => MemoryStore;
	readonly now?: () => Date;
}

interface AuthorizationState {
	authorized: boolean;
}

interface RememberParams {
	readonly content?: unknown;
	readonly title?: unknown;
	readonly description?: unknown;
	readonly tags?: unknown;
	readonly scope?: unknown;
	readonly kind?: unknown;
}

interface RecallParams {
	readonly query?: unknown;
	readonly limit?: unknown;
}

interface RenderedRecallRecord {
	readonly type: string;
	readonly title: string;
	readonly description: string;
	readonly scope: MemoryScopeName;
	readonly kind?: MemoryKind;
	readonly tags: readonly string[];
	readonly timestamp: string;
	readonly path: string;
	readonly humanPath: string;
	readonly content: string;
}

function textResult(
	text: string,
	details: unknown,
): {
	content: { type: "text"; text: string }[];
	details: unknown;
} {
	return {
		content: [{ type: "text", text }],
		details,
	};
}

export function createAgentMemoryExtension(
	deps: AgentMemoryExtensionDeps = {},
): (pi: ExtensionAPI) => void {
	const userCosmonautsRoot =
		deps.userCosmonautsRoot ?? join(homedir(), ".cosmonauts");
	const now = deps.now ?? (() => new Date());
	const storeFactory =
		deps.storeFactory ??
		((options: AgentMemoryStoreFactoryOptions) =>
			createMarkdownMemoryStore(options));

	return function agentMemoryExtension(pi: ExtensionAPI): void {
		const auth: AuthorizationState = { authorized: false };

		pi.registerTool({
			name: "remember",
			label: "Remember",
			description: "Save an explicit note to agent memory.",
			parameters: Type.Object({
				content: Type.String({ description: "Note body to save." }),
				title: Type.Optional(Type.String({ description: "Note title." })),
				description: Type.Optional(
					Type.String({ description: "Short note description." }),
				),
				tags: Type.Optional(
					Type.Array(Type.String(), { description: "Note tags." }),
				),
				scope: Type.Optional(
					Type.Union(ScopeLiterals, { description: "project or user." }),
				),
				kind: Type.Optional(
					Type.Union(KindLiterals, {
						description: "semantic, procedural, or episodic.",
					}),
				),
			}),
			execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
				if (!auth.authorized) return unauthorizedResult();
				return remember({
					params: params as RememberParams,
					store: createStore({ ctx, userCosmonautsRoot, now, storeFactory }),
					now,
					projectRoot: getCwd(ctx),
					userCosmonautsRoot,
				});
			},
		});

		pi.registerTool({
			name: "recall",
			label: "Recall",
			description: "Search authored agent-memory notes.",
			parameters: Type.Object({
				query: Type.String({ description: "Text to search for." }),
				limit: Type.Optional(
					Type.Integer({
						description: "Maximum notes to return; capped at 20.",
						minimum: 1,
					}),
				),
			}),
			execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
				if (!auth.authorized) return unauthorizedResult();
				return recall({
					params: params as RecallParams,
					store: createStore({ ctx, userCosmonautsRoot, now, storeFactory }),
					projectRoot: getCwd(ctx),
					userCosmonautsRoot,
				});
			},
		});

		pi.on("session_start", async () => {
			auth.authorized = false;
		});

		pi.on("session_shutdown", async () => {
			auth.authorized = false;
		});

		pi.on("before_agent_start", async (event) => {
			auth.authorized =
				extractAgentIdFromSystemPrompt(getSystemPrompt(event)) ===
				COSMO_AGENT_ID;
		});
	};
}

export default function agentMemoryExtension(pi: ExtensionAPI): void {
	createAgentMemoryExtension()(pi);
}

async function remember(options: {
	readonly params: RememberParams;
	readonly store: MemoryStore;
	readonly now: () => Date;
	readonly projectRoot: string;
	readonly userCosmonautsRoot: string;
}): Promise<ReturnType<typeof textResult>> {
	const content = normalizeString(options.params.content);
	if (!content) {
		return textResult("Remember requires non-empty content.", {
			status: "invalid_request",
			reason: "content must be a non-empty string",
		});
	}

	const title =
		normalizeString(options.params.title) ?? defaultTitleFromContent(content);
	const scope = normalizeScope(options.params.scope);
	const kind = normalizeKind(options.params.kind);
	const timestamp = options.now().toISOString();
	const draft: MemoryRecordDraft = {
		type: "note",
		scope,
		kind,
		title,
		description: normalizeString(options.params.description) ?? title,
		content,
		tags: normalizeTags(options.params.tags),
		timestamp,
		source: SOURCE,
	};

	const result = await options.store.write(draft);
	return renderRememberResult({
		result,
		draft,
		projectRoot: options.projectRoot,
		userCosmonautsRoot: options.userCosmonautsRoot,
	});
}

async function recall(options: {
	readonly params: RecallParams;
	readonly store: MemoryStore;
	readonly projectRoot: string;
	readonly userCosmonautsRoot: string;
}): Promise<ReturnType<typeof textResult>> {
	const query = normalizeString(options.params.query);
	if (!query) {
		return textResult("Recall requires non-empty query text.", {
			status: "invalid_request",
			reason: "query must be a non-empty string",
		});
	}

	const limit = normalizeLimit(options.params.limit);
	const result = await options.store.retrieve(
		{ projectRoot: options.projectRoot, scopes: ["project", "user"] },
		{ text: query, recordTypes: ["note"], limit },
	);
	return renderRecallResult({
		result,
		query,
		limit,
		projectRoot: options.projectRoot,
		userCosmonautsRoot: options.userCosmonautsRoot,
	});
}

function renderRememberResult(options: {
	readonly result: MemoryWriteResult;
	readonly draft: MemoryRecordDraft;
	readonly projectRoot: string;
	readonly userCosmonautsRoot: string;
}): ReturnType<typeof textResult> {
	if (options.result.kind === "written") {
		const humanPath = humanReadablePath({
			path: options.result.path,
			projectRoot: options.projectRoot,
			userCosmonautsRoot: options.userCosmonautsRoot,
		});
		return textResult(
			`Saved "${options.result.record.title}" to ${options.result.record.scope} memory: ${humanPath}`,
			{
				status: "saved",
				title: options.result.record.title,
				scope: options.result.record.scope,
				kind: options.result.record.kind,
				tags: options.result.record.tags,
				timestamp: options.result.record.timestamp,
				path: options.result.path,
				humanPath,
			},
		);
	}

	const details = {
		status: options.result.kind === "failed" ? "failed" : "unsupported",
		title: options.draft.title,
		scope: options.draft.scope,
		kind: options.draft.kind,
		path: options.result.kind === "failed" ? options.result.path : undefined,
		reason: options.result.reason,
	};
	return textResult(
		`Could not save "${options.draft.title}" to ${options.draft.scope} memory: ${options.result.reason}`,
		details,
	);
}

function renderRecallResult(options: {
	readonly result: MemoryRetrieveResult;
	readonly query: string;
	readonly limit: number;
	readonly projectRoot: string;
	readonly userCosmonautsRoot: string;
}): ReturnType<typeof textResult> {
	const records: RenderedRecallRecord[] = options.result.records.map(
		(record) => ({
			type: record.type,
			title: record.title,
			description: record.description,
			scope: record.scope,
			kind: record.kind,
			tags: record.tags,
			timestamp: record.timestamp,
			path: record.path,
			humanPath: humanReadablePath({
				path: record.path,
				projectRoot: options.projectRoot,
				userCosmonautsRoot: options.userCosmonautsRoot,
			}),
			content: record.content,
		}),
	);
	const baseDetails = {
		query: options.query,
		limit: options.limit,
		searchedScopes: options.result.searchedScopes,
		skippedScopes: options.result.skippedScopes,
		warnings: options.result.warnings,
		records,
	};

	if (records.length === 0) {
		return textResult(
			`No authored memory notes matched "${options.query}". Searched scopes: ${
				options.result.searchedScopes.join(", ") || "none"
			}.`,
			{ status: "no_match", ...baseDetails },
		);
	}

	return textResult(
		[
			`Found ${records.length} authored memory note${
				records.length === 1 ? "" : "s"
			} for "${options.query}".`,
			"",
			...records.map(formatRecallRecord),
		].join("\n"),
		{ status: "matched", ...baseDetails },
	);
}

function formatRecallRecord(record: RenderedRecallRecord): string {
	return [
		`## ${record.title}`,
		`scope: ${record.scope}`,
		`kind: ${record.kind ?? "unknown"}`,
		`timestamp: ${record.timestamp}`,
		`path: ${record.humanPath}`,
		"",
		record.content,
	].join("\n");
}

function createStore(options: {
	readonly ctx: unknown;
	readonly userCosmonautsRoot: string;
	readonly now: () => Date;
	readonly storeFactory: (
		options: AgentMemoryStoreFactoryOptions,
	) => MemoryStore;
}): MemoryStore {
	return options.storeFactory({
		projectRoot: getCwd(options.ctx),
		userCosmonautsRoot: options.userCosmonautsRoot,
		now: options.now,
	});
}

function unauthorizedResult(): ReturnType<typeof textResult> {
	return textResult(
		"Agent memory is not authorized for the current agent turn.",
		{ status: "unauthorized", authorizedAgent: COSMO_AGENT_ID },
	);
}

function normalizeString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeTags(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((tag): tag is string => typeof tag === "string")
		.map((tag) => tag.trim())
		.filter((tag) => tag.length > 0);
}

function normalizeScope(value: unknown): Exclude<MemoryScopeName, "session"> {
	return value === "user" ? "user" : "project";
}

function normalizeKind(value: unknown): MemoryKind {
	if (value === "procedural" || value === "episodic") return value;
	return "semantic";
}

function normalizeLimit(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return DEFAULT_RECALL_LIMIT;
	}
	return Math.max(1, Math.min(MAX_RECALL_LIMIT, Math.trunc(value)));
}

function defaultTitleFromContent(content: string): string {
	return content.trim().split(/\r?\n/, 1)[0]?.trim().slice(0, 60) || "Untitled";
}

function humanReadablePath(options: {
	readonly path: string;
	readonly projectRoot: string;
	readonly userCosmonautsRoot: string;
}): string {
	if (isInsideRoot(options.path, options.projectRoot)) {
		return normalizePath(relative(options.projectRoot, options.path));
	}
	if (isInsideRoot(options.path, options.userCosmonautsRoot)) {
		return normalizePath(
			join(".cosmonauts", relative(options.userCosmonautsRoot, options.path)),
		);
	}
	return normalizePath(options.path);
}

function isInsideRoot(path: string, root: string): boolean {
	const relativePath = relative(root, path);
	return (
		relativePath === "" ||
		(!relativePath.startsWith("..") && !relativePath.startsWith(sep))
	);
}

function normalizePath(path: string): string {
	return path.split(sep).join("/");
}

function getSystemPrompt(event: unknown): string {
	return valueFromObject(event, "systemPrompt") ?? "";
}

function getCwd(ctx: unknown): string {
	const cwd = valueFromObject(ctx, "cwd");
	if (!cwd) throw new Error("Agent memory extension requires ctx.cwd.");
	return cwd;
}

function valueFromObject(value: unknown, key: string): string | undefined {
	if (value && typeof value === "object" && key in value) {
		const field = (value as Record<string, unknown>)[key];
		return typeof field === "string" ? field : undefined;
	}
	return undefined;
}
