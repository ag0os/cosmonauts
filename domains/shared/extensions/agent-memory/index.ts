import { homedir } from "node:os";
import { join, relative, sep } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { extractAgentIdFromSystemPrompt } from "../../../../lib/agents/runtime-identity.ts";
import {
	canonicalizePlaybookName,
	createMarkdownMemoryStore,
	type MemoryKind,
	type MemoryRecordDraft,
	type MemoryRetrieveResult,
	type MemoryScopeName,
	type MemoryStore,
	type MemoryWriteResult,
	PROFILE_DESCRIPTION,
	PROFILE_TITLE,
} from "../../../../lib/memory/index.ts";

const COSMO_AGENT_ID = "main/cosmo";
const AGENT_MEMORY_CONTEXT_TYPE = "agent-memory-context";
const SOURCE = COSMO_AGENT_ID;
const DEFAULT_RECALL_LIMIT = 5;
const MAX_RECALL_LIMIT = 20;
const INDEX_RETRIEVAL_LIMIT = 50;
const INDEX_INJECTION_MAX_BYTES = 12_000;

const AuthoredTypeLiterals = [
	Type.Literal("note"),
	Type.Literal("profile"),
	Type.Literal("playbook"),
];
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
	readonly type?: unknown;
	readonly content?: unknown;
	readonly title?: unknown;
	readonly description?: unknown;
	readonly tags?: unknown;
	readonly scope?: unknown;
	readonly kind?: unknown;
	readonly changeSummary?: unknown;
	readonly confirmUpdate?: unknown;
}

type RememberRequest =
	| {
			readonly type: "note";
			readonly content: string;
			readonly title: string;
			readonly description: string;
			readonly tags: readonly string[];
			readonly scope: Exclude<MemoryScopeName, "session">;
			readonly kind: MemoryKind;
	  }
	| {
			readonly type: "profile";
			readonly content: string;
			readonly tags: readonly string[];
			readonly scope: "user";
			readonly kind: "semantic";
			readonly changeSummary: string;
	  }
	| {
			readonly type: "playbook";
			readonly content: string;
			readonly title: string;
			readonly description: string;
			readonly tags: readonly string[];
			readonly scope: Exclude<MemoryScopeName, "session">;
			readonly kind: "procedural";
			readonly confirmUpdate: boolean;
	  };

type ParseRememberResult =
	| { readonly ok: true; readonly request: RememberRequest }
	| { readonly ok: false; readonly reason: string };

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
				type: Type.Optional(
					Type.Union(AuthoredTypeLiterals, {
						description: "note, profile, or playbook; omitted means note.",
					}),
				),
				content: Type.String({
					description:
						"Body to save; profiles require the complete desired profile body.",
				}),
				title: Type.Optional(
					Type.String({ description: "Note title or required playbook name." }),
				),
				description: Type.Optional(
					Type.String({ description: "Short note or playbook description." }),
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
				changeSummary: Type.Optional(
					Type.String({
						description: "Required visible summary of a profile change.",
					}),
				),
				confirmUpdate: Type.Optional(
					Type.Boolean({
						description:
							"Set true only after confirming an existing playbook update.",
					}),
				),
			}),
			executionMode: "sequential",
			execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
				if (!auth.authorized) return unauthorizedResult();
				const parsed = parseRememberParams(params as RememberParams);
				if (!parsed.ok) return invalidRememberResult(parsed.reason);
				const projectRoot = getCwd(ctx);
				return remember({
					request: parsed.request,
					store: createStore({ ctx, userCosmonautsRoot, now, storeFactory }),
					now,
					projectRoot,
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

		pi.on("before_agent_start", async (event, ctx) => {
			auth.authorized =
				extractAgentIdFromSystemPrompt(getSystemPrompt(event)) ===
				COSMO_AGENT_ID;
			if (!auth.authorized) return;

			const projectRoot = getOptionalCwd(ctx);
			if (!projectRoot) return;
			const result = await retrieveMemoryIndex({
				store: createStore({
					ctx: { cwd: projectRoot },
					userCosmonautsRoot,
					now,
					storeFactory,
				}),
				projectRoot,
			});
			if (result.records.length === 0) return;

			return {
				message: {
					customType: AGENT_MEMORY_CONTEXT_TYPE,
					content: buildIndexContext({
						records: result.records,
						projectRoot,
						userCosmonautsRoot,
					}),
					display: false,
				},
			};
		});

		const onContext = pi.on as unknown as (
			event: "context",
			handler: (event: unknown) => Promise<unknown>,
		) => void;
		onContext("context", async (event) => {
			return {
				messages: getMessages(event).filter((message) => {
					const msg = message as { customType?: string };
					return msg.customType !== AGENT_MEMORY_CONTEXT_TYPE;
				}),
			};
		});
	};
}

export default function agentMemoryExtension(pi: ExtensionAPI): void {
	createAgentMemoryExtension()(pi);
}

async function remember(options: {
	readonly request: RememberRequest;
	readonly store: MemoryStore;
	readonly now: () => Date;
	readonly projectRoot: string;
	readonly userCosmonautsRoot: string;
}): Promise<ReturnType<typeof textResult>> {
	const timestamp = options.now().toISOString();
	switch (options.request.type) {
		case "note": {
			const draft = rememberDraft({ request: options.request, timestamp });
			return renderRememberResult({
				result: await options.store.write(draft),
				draft,
				operation: "saved",
				projectRoot: options.projectRoot,
				userCosmonautsRoot: options.userCosmonautsRoot,
			});
		}
		case "profile": {
			const existing = await options.store.retrieve(
				{ projectRoot: options.projectRoot, scopes: ["user"] },
				{ text: "", recordTypes: ["profile"] },
			);
			const draft = rememberDraft({ request: options.request, timestamp });
			return renderRememberResult({
				result: await options.store.write(draft),
				draft,
				operation: existing.records.length > 0 ? "updated" : "created",
				changeSummary: options.request.changeSummary,
				projectRoot: options.projectRoot,
				userCosmonautsRoot: options.userCosmonautsRoot,
			});
		}
		case "playbook": {
			const existing = await options.store.retrieve(
				{ projectRoot: options.projectRoot, scopes: [options.request.scope] },
				{ text: "", recordTypes: ["playbook"] },
			);
			const canonicalTitle = canonicalizePlaybookName(options.request.title);
			const matches = existing.records.filter(
				(record) => canonicalizePlaybookName(record.title) === canonicalTitle,
			);
			const collision = matches.length === 1 ? matches[0] : undefined;
			if (collision && !options.request.confirmUpdate) {
				return playbookConfirmationRequired({
					existing: collision,
					requestedTitle: options.request.title,
					projectRoot: options.projectRoot,
					userCosmonautsRoot: options.userCosmonautsRoot,
				});
			}

			const draft = rememberDraft({ request: options.request, timestamp });
			return renderRememberResult({
				result: await options.store.write(draft),
				draft,
				operation: collision ? "updated" : "created",
				projectRoot: options.projectRoot,
				userCosmonautsRoot: options.userCosmonautsRoot,
			});
		}
	}
}

function rememberDraft(options: {
	readonly request: RememberRequest;
	readonly timestamp: string;
}): MemoryRecordDraft {
	switch (options.request.type) {
		case "note":
			return {
				type: "note",
				scope: options.request.scope,
				kind: options.request.kind,
				title: options.request.title,
				description: options.request.description,
				content: options.request.content,
				tags: options.request.tags,
				timestamp: options.timestamp,
				source: SOURCE,
			};
		case "profile":
			return {
				type: "profile",
				scope: "user",
				kind: "semantic",
				title: PROFILE_TITLE,
				description: PROFILE_DESCRIPTION,
				content: options.request.content,
				tags: options.request.tags,
				timestamp: options.timestamp,
				source: SOURCE,
			};
		case "playbook":
			return {
				type: "playbook",
				scope: options.request.scope,
				kind: "procedural",
				title: options.request.title,
				description: options.request.description,
				content: options.request.content,
				tags: options.request.tags,
				timestamp: options.timestamp,
				source: SOURCE,
			};
	}
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

async function retrieveMemoryIndex(options: {
	readonly store: MemoryStore;
	readonly projectRoot: string;
}): Promise<MemoryRetrieveResult> {
	return options.store.retrieve(
		{ projectRoot: options.projectRoot, scopes: ["project", "user"] },
		{
			text: "",
			recordTypes: ["note"],
			limit: INDEX_RETRIEVAL_LIMIT,
		},
	);
}

function buildIndexContext(options: {
	readonly records: MemoryRetrieveResult["records"];
	readonly projectRoot: string;
	readonly userCosmonautsRoot: string;
}): string {
	const header = [
		"Agent memory index context",
		`Current disk index of up to ${INDEX_RETRIEVAL_LIMIT} most recent authored project/user memory notes.`,
		"This context lists compact metadata only, not full note bodies.",
		"Use recall(query) for full note details before relying on a memory.",
		"",
	].join("\n");
	const body = options.records.map((record) =>
		formatIndexRecord({
			record,
			projectRoot: options.projectRoot,
			userCosmonautsRoot: options.userCosmonautsRoot,
		}),
	);
	const index = `${body.join("\n")}\n`;
	const complete = `${header}${index}`;
	if (byteLength(complete) <= INDEX_INJECTION_MAX_BYTES) return complete;

	return truncateWithFooter({
		header,
		content: index,
		maxBytes: INDEX_INJECTION_MAX_BYTES,
		footerForBytes: (includedBytes) =>
			`\n\n[Truncated memory index from ${byteLength(
				index,
			)} UTF-8 bytes to ${includedBytes} bytes. Use recall(query) for full note details.]`,
	});
}

function formatIndexRecord(options: {
	readonly record: MemoryRetrieveResult["records"][number];
	readonly projectRoot: string;
	readonly userCosmonautsRoot: string;
}): string {
	return [
		`- title: ${options.record.title}`,
		`  scope: ${options.record.scope}`,
		`  kind: ${options.record.kind ?? "unknown"}`,
		`  timestamp: ${options.record.timestamp}`,
		`  description: ${options.record.description}`,
		`  path: ${humanReadablePath({
			path: options.record.path,
			projectRoot: options.projectRoot,
			userCosmonautsRoot: options.userCosmonautsRoot,
		})}`,
	].join("\n");
}

function renderRememberResult(options: {
	readonly result: MemoryWriteResult;
	readonly draft: MemoryRecordDraft;
	readonly operation: "saved" | "created" | "updated";
	readonly changeSummary?: string;
	readonly projectRoot: string;
	readonly userCosmonautsRoot: string;
}): ReturnType<typeof textResult> {
	if (options.result.kind === "written") {
		const humanPath = humanReadablePath({
			path: options.result.path,
			projectRoot: options.projectRoot,
			userCosmonautsRoot: options.userCosmonautsRoot,
		});
		const details = {
			status: options.operation,
			type: options.result.record.type,
			title: options.result.record.title,
			scope: options.result.record.scope,
			kind: options.result.record.kind,
			tags: options.result.record.tags,
			timestamp: options.result.record.timestamp,
			path: options.result.path,
			humanPath,
			...(options.changeSummary
				? { changeSummary: options.changeSummary }
				: {}),
		};
		if (options.operation === "saved") {
			return textResult(
				`Saved "${options.result.record.title}" to ${options.result.record.scope} memory: ${humanPath}`,
				details,
			);
		}

		const action = options.operation === "updated" ? "Updated" : "Created";
		const changeSummary = options.changeSummary
			? `\nChange summary: ${options.changeSummary}`
			: "";
		return textResult(
			`${action} ${options.result.record.type} "${options.result.record.title}" in ${options.result.record.scope} memory: ${humanPath}${changeSummary}`,
			details,
		);
	}

	const humanPath =
		options.result.kind === "failed" && options.result.path
			? humanReadablePath({
					path: options.result.path,
					projectRoot: options.projectRoot,
					userCosmonautsRoot: options.userCosmonautsRoot,
				})
			: undefined;
	const details = {
		status: options.result.kind === "failed" ? "failed" : "unsupported",
		type: options.draft.type,
		title: options.draft.title,
		scope: options.draft.scope,
		kind: options.draft.kind,
		path: options.result.kind === "failed" ? options.result.path : undefined,
		humanPath,
		reason: options.result.reason,
	};
	const pathText = humanPath ? ` at ${humanPath}` : "";
	return textResult(
		`Could not save ${options.draft.type} "${options.draft.title}" to ${options.draft.scope} memory${pathText}: ${options.result.reason}`,
		details,
	);
}

function playbookConfirmationRequired(options: {
	readonly existing: MemoryRetrieveResult["records"][number];
	readonly requestedTitle: string;
	readonly projectRoot: string;
	readonly userCosmonautsRoot: string;
}): ReturnType<typeof textResult> {
	const humanPath = humanReadablePath({
		path: options.existing.path,
		projectRoot: options.projectRoot,
		userCosmonautsRoot: options.userCosmonautsRoot,
	});
	return textResult(
		`Playbook "${options.existing.title}" already exists in ${options.existing.scope} memory at ${humanPath}. Confirm the update and call remember again with confirmUpdate: true, choose another name, or decline.`,
		{
			status: "confirmation_required",
			type: "playbook",
			title: options.existing.title,
			requestedTitle: options.requestedTitle,
			scope: options.existing.scope,
			path: options.existing.path,
			humanPath,
		},
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

	const warningText = formatRecallWarnings(options.result.warnings.length);

	if (records.length === 0) {
		return textResult(
			[
				`No authored memory notes matched "${options.query}". Searched scopes: ${
					options.result.searchedScopes.join(", ") || "none"
				}.`,
				warningText,
			]
				.filter(Boolean)
				.join("\n"),
			{ status: "no_match", ...baseDetails },
		);
	}

	return textResult(
		[
			`Found ${records.length} authored memory note${
				records.length === 1 ? "" : "s"
			} for "${options.query}".`,
			warningText,
			"",
			...records.map(formatRecallRecord),
		]
			.filter(Boolean)
			.join("\n"),
		{ status: "matched", ...baseDetails },
	);
}

function formatRecallWarnings(count: number): string | undefined {
	if (count === 0) return undefined;
	return `Warning: ${count} memory note${
		count === 1 ? " was" : "s were"
	} skipped because it could not be read; see details.warnings.`;
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

function invalidRememberResult(reason: string): ReturnType<typeof textResult> {
	const text =
		reason === "content must be a non-empty string"
			? "Remember requires non-empty content."
			: `Remember request is invalid: ${reason}`;
	return textResult(text, {
		status: "invalid_request",
		reason,
	});
}

function parseRememberParams(params: RememberParams): ParseRememberResult {
	const type = params.type ?? "note";
	if (type !== "note" && type !== "profile" && type !== "playbook") {
		return invalidRemember(`unsupported type ${JSON.stringify(type)}`);
	}
	const content = normalizeString(params.content);
	if (!content) {
		return invalidRemember("content must be a non-empty string");
	}

	switch (type) {
		case "note": {
			if (params.changeSummary !== undefined) {
				return invalidRemember("changeSummary is only supported for profiles");
			}
			if (params.confirmUpdate !== undefined) {
				return invalidRemember("confirmUpdate is only supported for playbooks");
			}
			const title =
				normalizeString(params.title) ?? defaultTitleFromContent(content);
			return {
				ok: true,
				request: {
					type: "note",
					content,
					title,
					description: normalizeString(params.description) ?? title,
					tags: normalizeTags(params.tags),
					scope: normalizeScope(params.scope),
					kind: normalizeKind(params.kind),
				},
			};
		}
		case "profile": {
			const changeSummary = normalizeString(params.changeSummary);
			if (!changeSummary) {
				return invalidRemember(
					"profile changeSummary must be a non-empty string",
				);
			}
			if (params.scope !== undefined && params.scope !== "user") {
				return invalidRemember("profiles require user scope");
			}
			if (params.kind !== undefined && params.kind !== "semantic") {
				return invalidRemember("profiles require semantic memory kind");
			}
			if (params.confirmUpdate !== undefined) {
				return invalidRemember("confirmUpdate is only supported for playbooks");
			}
			return {
				ok: true,
				request: {
					type: "profile",
					content,
					tags: normalizeTags(params.tags),
					scope: "user",
					kind: "semantic",
					changeSummary,
				},
			};
		}
		case "playbook": {
			const title = normalizeString(params.title);
			if (!title) {
				return invalidRemember("playbook title must be a non-empty string");
			}
			if (params.scope !== "project" && params.scope !== "user") {
				return invalidRemember(
					"playbooks require an explicit project or user scope",
				);
			}
			if (params.kind !== undefined && params.kind !== "procedural") {
				return invalidRemember("playbooks require procedural memory kind");
			}
			if (params.changeSummary !== undefined) {
				return invalidRemember("changeSummary is only supported for profiles");
			}
			if (
				params.confirmUpdate !== undefined &&
				typeof params.confirmUpdate !== "boolean"
			) {
				return invalidRemember("confirmUpdate must be a boolean");
			}
			return {
				ok: true,
				request: {
					type: "playbook",
					content,
					title,
					description: normalizeString(params.description) ?? title,
					tags: normalizeTags(params.tags),
					scope: params.scope,
					kind: "procedural",
					confirmUpdate: params.confirmUpdate === true,
				},
			};
		}
	}
}

function invalidRemember(reason: string): ParseRememberResult {
	return { ok: false, reason };
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

function getOptionalCwd(ctx: unknown): string | undefined {
	return valueFromObject(ctx, "cwd");
}

function getMessages(event: unknown): unknown[] {
	if (event && typeof event === "object" && "messages" in event) {
		const messages = (event as { messages?: unknown }).messages;
		if (Array.isArray(messages)) return messages;
	}
	return [];
}

function valueFromObject(value: unknown, key: string): string | undefined {
	if (value && typeof value === "object" && key in value) {
		const field = (value as Record<string, unknown>)[key];
		return typeof field === "string" ? field : undefined;
	}
	return undefined;
}

function byteLength(value: string): number {
	return Buffer.byteLength(value, "utf-8");
}

function truncateWithFooter(options: {
	readonly header: string;
	readonly content: string;
	readonly maxBytes: number;
	readonly footerForBytes: (includedBytes: number) => string;
}): string {
	let footer = options.footerForBytes(0);
	let excerpt = "";
	for (let attempt = 0; attempt < 10; attempt += 1) {
		const excerptBudget = Math.max(
			0,
			options.maxBytes - byteLength(options.header) - byteLength(footer),
		);
		excerpt = truncateUtf8(options.content, excerptBudget);
		const nextFooter = options.footerForBytes(byteLength(excerpt));
		if (nextFooter === footer) break;
		footer = nextFooter;
	}

	while (
		byteLength(`${options.header}${excerpt}${footer}`) > options.maxBytes &&
		excerpt.length > 0
	) {
		excerpt = truncateUtf8(options.content, byteLength(excerpt) - 1);
		footer = options.footerForBytes(byteLength(excerpt));
	}

	const rendered = `${options.header}${excerpt}${footer}`;
	if (byteLength(rendered) <= options.maxBytes) return rendered;
	return truncateUtf8(rendered, options.maxBytes);
}

function truncateUtf8(value: string, maxBytes: number): string {
	if (maxBytes <= 0) return "";
	if (byteLength(value) <= maxBytes) return value;

	let used = 0;
	let result = "";
	for (const char of value) {
		const charBytes = byteLength(char);
		if (used + charBytes > maxBytes) break;
		result += char;
		used += charBytes;
	}
	return result;
}
