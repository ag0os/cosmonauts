import matter from "gray-matter";
import {
	type AuthoredRecordType,
	canonicalizePlaybookName,
} from "./authored-records.ts";
import { parseEpisodeTagEnvelope } from "./episodic-records.ts";
import {
	MEMORY_KINDS,
	type MemoryKind,
	type MemoryScopeName,
} from "./types.ts";

interface OkfRecordFields {
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

export interface AuthoredNoteInput extends OkfRecordFields {
	readonly type: "note";
}

export interface AuthoredProfileInput extends OkfRecordFields {
	readonly type: "profile";
	readonly scope: "user";
	readonly kind: "semantic";
}

export interface AuthoredPlaybookInput extends OkfRecordFields {
	readonly type: "playbook";
	readonly kind: "procedural";
}

export type AuthoredRecordInput =
	| AuthoredNoteInput
	| AuthoredProfileInput
	| AuthoredPlaybookInput;

export interface EpisodeRecordInput extends OkfRecordFields {
	readonly type: "episode";
	readonly kind: "episodic";
}

type ParseAuthoredRecordResult =
	| { readonly ok: true; readonly record: AuthoredRecordInput }
	| { readonly ok: false; readonly message: string };

type ParseEpisodeRecordResult =
	| { readonly ok: true; readonly record: EpisodeRecordInput }
	| { readonly ok: false; readonly message: string };

export function renderAuthoredRecord(record: AuthoredRecordInput): string {
	return renderOkfRecord(record);
}

export function renderEpisodeRecord(record: EpisodeRecordInput): string {
	return renderOkfRecord(record);
}

function renderOkfRecord(
	record: AuthoredRecordInput | EpisodeRecordInput,
): string {
	return matter.stringify(record.content, {
		type: record.type,
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

export function parseEpisodeOkfRecord(options: {
	readonly raw: string;
	readonly expectedScope: Exclude<MemoryScopeName, "session">;
}): ParseEpisodeRecordResult {
	const parsed = parseOkfRecordFields({ ...options, expectedType: "episode" });
	if (!parsed.ok) return parsed;
	if (parsed.record.kind !== "episodic") {
		return {
			ok: false,
			message: "Episode records must use episodic memory kind.",
		};
	}
	if (!parsed.record.source?.trim()) {
		return {
			ok: false,
			message: "Episode records require a non-empty source.",
		};
	}
	if (!parseEpisodeTagEnvelope(parsed.record.tags)) {
		return {
			ok: false,
			message:
				"Episode records require valid action, outcome, and subject tags (and a payload for wake records).",
		};
	}
	return {
		ok: true,
		record: {
			...parsed.record,
			type: "episode",
			kind: "episodic",
			source: parsed.record.source,
		},
	};
}

export function parseAuthoredRecord(options: {
	readonly raw: string;
	readonly expectedScope: Exclude<MemoryScopeName, "session">;
	readonly expectedType: AuthoredRecordType;
}): ParseAuthoredRecordResult {
	const parsed = parseOkfRecordFields(options);
	if (!parsed.ok) return parsed;
	const common = parsed.record;

	switch (options.expectedType) {
		case "note":
			return {
				ok: true,
				record: { ...common, type: "note", kind: common.kind },
			};
		case "profile":
			if (options.expectedScope !== "user") {
				return {
					ok: false,
					message: "Profile records are only supported in the user store.",
				};
			}
			if (common.kind !== "semantic") {
				return {
					ok: false,
					message: "Profile records must use semantic memory kind.",
				};
			}
			return {
				ok: true,
				record: {
					...common,
					type: "profile",
					scope: "user",
					kind: "semantic",
				},
			};
		case "playbook":
			if (common.kind !== "procedural") {
				return {
					ok: false,
					message: "Playbook records must use procedural memory kind.",
				};
			}
			if (!canonicalizePlaybookName(common.title)) {
				return {
					ok: false,
					message: "Playbook title has an empty canonical key.",
				};
			}
			return {
				ok: true,
				record: { ...common, type: "playbook", kind: "procedural" },
			};
	}
}

function parseOkfRecordFields(options: {
	readonly raw: string;
	readonly expectedScope: Exclude<MemoryScopeName, "session">;
	readonly expectedType: AuthoredRecordType | "episode";
}):
	| { readonly ok: true; readonly record: OkfRecordFields }
	| { readonly ok: false; readonly message: string } {
	const parsed = matter(options.raw);
	const data = parsed.data;
	if (
		typeof data.type !== "string" ||
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

	if (data.type !== options.expectedType) {
		return {
			ok: false,
			message: `Memory record type ${data.type} is not valid in the ${options.expectedType} location.`,
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
