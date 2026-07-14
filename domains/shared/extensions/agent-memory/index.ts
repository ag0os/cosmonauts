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
	PROFILE_WRITE_MAX_BYTES,
} from "../../../../lib/memory/index.ts";

const COSMO_AGENT_ID = "main/cosmo";
const AGENT_MEMORY_CONTEXT_TYPE = "agent-memory-context";
const SOURCE = COSMO_AGENT_ID;
const DEFAULT_RECALL_LIMIT = 5;
const MAX_RECALL_LIMIT = 20;
const INDEX_RETRIEVAL_LIMIT = 50;
const INDEX_INJECTION_MAX_BYTES = 12_000;
// Record bodies are bounded on write, but human-edited frontmatter values are not.
// Clamp each rendered metadata value so profile framing can never consume the budget.
const PROFILE_METADATA_VALUE_MAX_BYTES = 512;
// Warnings name the offending file and reason. They are the only signal a user
// gets that a record silently vanished, so they must reach visible text — the
// model never sees tool-result details, and injected context has no details at
// all. Bound them so an adversarial store cannot flood a budgeted message.
const MAX_VISIBLE_WARNINGS = 5;
const AUTHORED_RECORD_TYPES = ["note", "profile", "playbook"] as const;

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
			description:
				"Save an explicit note, user profile, or playbook to agent memory.",
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
			description:
				"Search authored agent-memory records: notes, the user profile, and playbooks.",
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
			const result = await retrieveMemoryContext({
				store: createStore({
					ctx: { cwd: projectRoot },
					userCosmonautsRoot,
					now,
					storeFactory,
				}),
				projectRoot,
			});
			if (result.records.length === 0 && result.warnings.length === 0) return;
			const content = buildMemoryContext({
				records: result.records,
				warnings: result.warnings,
				projectRoot,
				userCosmonautsRoot,
			});
			if (!content) return;

			return {
				message: {
					customType: AGENT_MEMORY_CONTEXT_TYPE,
					content,
					display: false,
				},
			};
		});

		const onContext = pi.on as unknown as (
			event: "context",
			handler: (event: unknown) => Promise<unknown>,
		) => void;
		onContext("context", async (event) => {
			const messages = getMessages(event);
			if (!auth.authorized) {
				return {
					messages: messages.filter((message) => {
						const msg = message as { customType?: string };
						return msg.customType !== AGENT_MEMORY_CONTEXT_TYPE;
					}),
				};
			}
			const newestMemoryIndex = messages.findLastIndex((message) => {
				const msg = message as { customType?: string };
				return msg.customType === AGENT_MEMORY_CONTEXT_TYPE;
			});
			return {
				messages: messages.filter((message, index) => {
					const msg = message as { customType?: string };
					return (
						msg.customType !== AGENT_MEMORY_CONTEXT_TYPE ||
						index === newestMemoryIndex
					);
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
		{ text: query, recordTypes: AUTHORED_RECORD_TYPES },
	);
	const pinnedProfiles = result.records.filter(
		(record) => record.type === "profile",
	);
	const boundedRecords = result.records
		.filter((record) => record.type !== "profile")
		.slice(0, limit);
	return renderRecallResult({
		result: { ...result, records: [...pinnedProfiles, ...boundedRecords] },
		query,
		limit,
		projectRoot: options.projectRoot,
		userCosmonautsRoot: options.userCosmonautsRoot,
	});
}

async function retrieveMemoryContext(options: {
	readonly store: MemoryStore;
	readonly projectRoot: string;
}): Promise<MemoryRetrieveResult> {
	return options.store.retrieve(
		{ projectRoot: options.projectRoot, scopes: ["project", "user"] },
		{
			text: "",
			recordTypes: AUTHORED_RECORD_TYPES,
		},
	);
}

function buildMemoryContext(options: {
	readonly records: MemoryRetrieveResult["records"];
	readonly warnings: MemoryRetrieveResult["warnings"];
	readonly projectRoot: string;
	readonly userCosmonautsRoot: string;
}): string | undefined {
	const profiles = options.records
		.filter((record) => record.type === "profile")
		.toSorted(compareContextRecords);
	const profile = profiles[0];
	const indexRecords = options.records
		.filter((record) => record.type === "note" || record.type === "playbook")
		.toSorted(compareContextRecords)
		.slice(0, INDEX_RETRIEVAL_LIMIT);
	const warningsSection = formatContextWarnings({
		warnings: options.warnings,
		projectRoot: options.projectRoot,
		userCosmonautsRoot: options.userCosmonautsRoot,
	});
	if (!profile && indexRecords.length === 0 && !warningsSection) {
		return undefined;
	}

	const contextHeader = `${[
		"Agent memory index context",
		"Current disk authored memory for this Cosmo turn.",
		"",
	].join("\n")}${warningsSection}`;
	if (!profile && indexRecords.length === 0) {
		const warningsOnly = `${contextHeader}Use recall(query) for full authored memory record details.\n`;
		return byteLength(warningsOnly) <= INDEX_INJECTION_MAX_BYTES
			? warningsOnly
			: truncateUtf8(warningsOnly, INDEX_INJECTION_MAX_BYTES);
	}
	const profileSection = profile
		? formatProfileContext({
				record: profile,
				projectRoot: options.projectRoot,
				userCosmonautsRoot: options.userCosmonautsRoot,
			})
		: "";
	if (indexRecords.length === 0) {
		const profileOnly = `${contextHeader}${profileSection}`;
		if (byteLength(profileOnly) <= INDEX_INJECTION_MAX_BYTES)
			return profileOnly;
		return truncateWithFooter({
			header: contextHeader,
			content: profileSection,
			maxBytes: INDEX_INJECTION_MAX_BYTES,
			footerForBytes: (includedBytes) =>
				`\n[Memory context truncated. Truncated profile section from ${byteLength(
					profileSection,
				)} UTF-8 bytes to ${includedBytes} bytes. Use recall(query) for full authored memory record details.]`,
		});
	}

	const indexHeader = [
		"## Authored memory index",
		`Up to ${INDEX_RETRIEVAL_LIMIT} most recent project/user notes and playbooks, ordered by timestamp then path.`,
		"This section contains compact metadata only, not record bodies.",
		"Use recall(query) for full authored memory record details before relying on an entry.",
		"",
	].join("\n");
	const indexBody = `${indexRecords
		.map((record) =>
			formatIndexRecord({
				record,
				projectRoot: options.projectRoot,
				userCosmonautsRoot: options.userCosmonautsRoot,
			}),
		)
		.join("\n")}\n`;
	const header = `${contextHeader}${profileSection}${indexHeader}`;
	const complete = `${header}${indexBody}`;
	if (byteLength(complete) <= INDEX_INJECTION_MAX_BYTES) return complete;

	return truncateWithFooter({
		header,
		content: indexBody,
		maxBytes: INDEX_INJECTION_MAX_BYTES,
		footerForBytes: (includedBytes) =>
			`\n[Memory index truncated. Truncated memory index from ${byteLength(
				indexBody,
			)} UTF-8 bytes to ${includedBytes} bytes. Use recall(query) for full authored memory record details.]`,
	});
}

function formatProfileContext(options: {
	readonly record: MemoryRetrieveResult["records"][number];
	readonly projectRoot: string;
	readonly userCosmonautsRoot: string;
}): string {
	const originalBytes = byteLength(options.record.content);
	const excerpt = truncateUtf8(options.record.content, PROFILE_WRITE_MAX_BYTES);
	const includedBytes = byteLength(excerpt);
	const humanPath = humanReadablePath({
		path: options.record.path,
		projectRoot: options.projectRoot,
		userCosmonautsRoot: options.userCosmonautsRoot,
	});
	const truncationNotice =
		originalBytes > PROFILE_WRITE_MAX_BYTES
			? [
					`[Profile truncated: original body ${originalBytes} UTF-8 bytes; included ${includedBytes} bytes.`,
					`path: ${clampMetadataValue(humanPath)}`,
					"Use recall(query) with profile-matching text to retrieve the complete profile.",
					"Do not update the profile from this excerpt; first call recall(query) for the full body.]",
				].join("\n")
			: "";
	return [
		"## User profile",
		excerpt,
		"",
		"Profile metadata:",
		`type: ${clampMetadataValue(options.record.type)}`,
		`scope: ${clampMetadataValue(options.record.scope)}`,
		`kind: ${clampMetadataValue(options.record.kind ?? "unknown")}`,
		`timestamp: ${clampMetadataValue(options.record.timestamp)}`,
		`path: ${clampMetadataValue(humanPath)}`,
		truncationNotice,
		"",
	]
		.filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
		.join("\n");
}

function compareContextRecords(
	a: MemoryRetrieveResult["records"][number],
	b: MemoryRetrieveResult["records"][number],
): number {
	return b.timestamp.localeCompare(a.timestamp) || a.path.localeCompare(b.path);
}

function formatIndexRecord(options: {
	readonly record: MemoryRetrieveResult["records"][number];
	readonly projectRoot: string;
	readonly userCosmonautsRoot: string;
}): string {
	return [
		`- type: ${options.record.type}`,
		`  ${options.record.type === "playbook" ? "name" : "title"}: ${options.record.title}`,
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
	if (
		options.result.kind === "unsupported" &&
		options.draft.type === "profile" &&
		byteLength(options.draft.content) > PROFILE_WRITE_MAX_BYTES
	) {
		return textResult(
			`Could not replace the user profile${pathText}: ${options.result.reason} Shorten the complete profile to ${PROFILE_WRITE_MAX_BYTES} UTF-8 bytes or fewer, or provide a shorter intentional complete replacement. The existing profile was preserved.`,
			details,
		);
	}
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

	const warningText = formatRecallWarnings({
		warnings: options.result.warnings,
		projectRoot: options.projectRoot,
		userCosmonautsRoot: options.userCosmonautsRoot,
	});

	if (records.length === 0) {
		return textResult(
			[
				`No authored memory records matched "${options.query}". Searched scopes: ${
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
			`Found ${records.length} authored memory record${
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

interface WarningFormatOptions {
	readonly warnings: MemoryRetrieveResult["warnings"];
	readonly projectRoot: string;
	readonly userCosmonautsRoot: string;
}

function formatWarningLines(options: WarningFormatOptions): string[] {
	const visible = options.warnings.slice(0, MAX_VISIBLE_WARNINGS);
	const lines = visible.map((warning) => {
		const location = warning.path
			? `${humanReadablePath({
					path: warning.path,
					projectRoot: options.projectRoot,
					userCosmonautsRoot: options.userCosmonautsRoot,
				})}: `
			: "";
		return clampMetadataValue(`- ${location}${warning.message}`);
	});
	const hidden = options.warnings.length - visible.length;
	if (hidden > 0) lines.push(`(+${hidden} more)`);
	return lines;
}

function formatRecallWarnings(
	options: WarningFormatOptions,
): string | undefined {
	const count = options.warnings.length;
	if (count === 0) return undefined;
	return [
		`Warning: ${count} authored memory record${
			count === 1 ? " was" : "s were"
		} skipped because ${count === 1 ? "it" : "they"} could not be read:`,
		...formatWarningLines(options),
	].join("\n");
}

function formatContextWarnings(options: WarningFormatOptions): string {
	const count = options.warnings.length;
	if (count === 0) return "";
	return `${[
		"## Memory warnings",
		`${count} authored memory record${count === 1 ? "" : "s"} on disk could not be read and ${
			count === 1 ? "is" : "are"
		} missing from this context:`,
		...formatWarningLines(options),
		"",
	].join("\n")}\n`;
}

function formatRecallRecord(record: RenderedRecallRecord): string {
	return [
		`## Authored memory record: ${record.title}`,
		`type: ${record.type}`,
		`${record.type === "playbook" ? "name" : "title"}: ${record.title}`,
		`scope: ${record.scope}`,
		`kind: ${record.kind ?? "unknown"}`,
		`timestamp: ${record.timestamp}`,
		`description: ${record.description}`,
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

	// Framing plus reserved notices alone exceed the budget. Clamp the framing rather
	// than throwing: a turn must still receive an honest, budget-conforming message.
	const headerBudget = Math.max(0, options.maxBytes - byteLength(footer));
	const clamped = `${truncateUtf8(options.header, headerBudget)}${footer}`;
	return byteLength(clamped) <= options.maxBytes
		? clamped
		: truncateUtf8(clamped, options.maxBytes);
}

function clampMetadataValue(value: string): string {
	if (byteLength(value) <= PROFILE_METADATA_VALUE_MAX_BYTES) return value;
	return `${truncateUtf8(value, PROFILE_METADATA_VALUE_MAX_BYTES)} [value truncated]`;
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
