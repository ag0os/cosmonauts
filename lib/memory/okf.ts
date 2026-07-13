import matter from "gray-matter";
import {
	type AuthoredRecordType,
	canonicalizePlaybookName,
} from "./authored-records.ts";
import {
	MEMORY_KINDS,
	type MemoryKind,
	type MemoryScopeName,
} from "./types.ts";

interface AuthoredRecordFields {
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

export interface AuthoredNoteInput extends AuthoredRecordFields {
	readonly type: "note";
}

export interface AuthoredProfileInput extends AuthoredRecordFields {
	readonly type: "profile";
	readonly scope: "user";
	readonly kind: "semantic";
}

export interface AuthoredPlaybookInput extends AuthoredRecordFields {
	readonly type: "playbook";
	readonly kind: "procedural";
}

export type AuthoredRecordInput =
	| AuthoredNoteInput
	| AuthoredProfileInput
	| AuthoredPlaybookInput;

type ParseAuthoredRecordResult =
	| { readonly ok: true; readonly record: AuthoredRecordInput }
	| { readonly ok: false; readonly message: string };

export function renderAuthoredRecord(record: AuthoredRecordInput): string {
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

export function parseAuthoredRecord(options: {
	readonly raw: string;
	readonly expectedScope: Exclude<MemoryScopeName, "session">;
	readonly expectedType: AuthoredRecordType;
}): ParseAuthoredRecordResult {
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

	const common = {
		title: data.title,
		description: data.description,
		resource: data.resource,
		tags: data.tags,
		timestamp: data.timestamp,
		scope: data.scope,
		source: data.source,
		content: parsed.content.trim(),
	};

	switch (options.expectedType) {
		case "note":
			return {
				ok: true,
				record: { ...common, type: "note", kind: data.kind },
			};
		case "profile":
			if (options.expectedScope !== "user") {
				return {
					ok: false,
					message: "Profile records are only supported in the user store.",
				};
			}
			if (data.kind !== "semantic") {
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
			if (data.kind !== "procedural") {
				return {
					ok: false,
					message: "Playbook records must use procedural memory kind.",
				};
			}
			if (!canonicalizePlaybookName(data.title)) {
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

function isMemoryKind(value: unknown): value is MemoryKind {
	return MEMORY_KINDS.includes(value as MemoryKind);
}
