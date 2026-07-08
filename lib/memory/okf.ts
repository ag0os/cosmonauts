import matter from "gray-matter";
import {
	MEMORY_KINDS,
	type MemoryKind,
	type MemoryScopeName,
} from "./types.ts";

const NOTE_TYPE = "note";

export interface AuthoredNoteInput {
	readonly title: string;
	readonly description: string;
	readonly resource: string;
	readonly tags: readonly string[];
	readonly timestamp: string;
	readonly scope: Exclude<MemoryScopeName, "session">;
	readonly kind: MemoryKind;
	readonly source?: string;
	readonly content: string;
}

export interface ParsedAuthoredNote extends AuthoredNoteInput {
	readonly type: "note";
}

export type ParseAuthoredNoteResult =
	| { readonly ok: true; readonly record: ParsedAuthoredNote }
	| { readonly ok: false; readonly message: string };

export function renderAuthoredNote(record: AuthoredNoteInput): string {
	return matter.stringify(record.content, {
		type: NOTE_TYPE,
		title: record.title,
		description: record.description,
		resource: record.resource,
		tags: [...record.tags],
		timestamp: record.timestamp,
		scope: record.scope,
		kind: record.kind,
		...(record.source ? { source: record.source } : {}),
	});
}

export function parseAuthoredNote(options: {
	readonly raw: string;
	readonly expectedScope: Exclude<MemoryScopeName, "session">;
}): ParseAuthoredNoteResult {
	const parsed = matter(options.raw);
	const data = parsed.data;
	if (
		data.type !== NOTE_TYPE ||
		typeof data.title !== "string" ||
		typeof data.description !== "string" ||
		typeof data.resource !== "string" ||
		!Array.isArray(data.tags) ||
		!data.tags.every((tag: unknown) => typeof tag === "string") ||
		typeof data.timestamp !== "string"
	) {
		return {
			ok: false,
			message: "Memory record is missing required OKF frontmatter.",
		};
	}

	if (data.scope !== options.expectedScope) {
		return {
			ok: false,
			message: `Memory record scope ${String(data.scope)} does not match ${options.expectedScope} store.`,
		};
	}

	if (!isMemoryKind(data.kind)) {
		return {
			ok: false,
			message: "Memory record has an invalid memory kind.",
		};
	}

	if (data.source !== undefined && typeof data.source !== "string") {
		return {
			ok: false,
			message: "Memory record has an invalid source.",
		};
	}

	return {
		ok: true,
		record: {
			type: NOTE_TYPE,
			title: data.title,
			description: data.description,
			resource: data.resource,
			tags: data.tags,
			timestamp: data.timestamp,
			scope: data.scope,
			kind: data.kind,
			source: data.source,
			content: parsed.content.trim(),
		},
	};
}

function isMemoryKind(value: unknown): value is MemoryKind {
	return MEMORY_KINDS.includes(value as MemoryKind);
}
