import { createHash } from "node:crypto";
import matter from "gray-matter";
import type {
	KnowledgeProposalIdentity,
	MemoryRecordDraft,
	MemoryScopeName,
	RetrievedMemoryRecord,
} from "./types.ts";

export const KNOWLEDGE_RECORD_TYPES = [
	"decision",
	"trade-off",
	"gotcha",
	"convention",
] as const;

export type KnowledgeRecordType = (typeof KNOWLEDGE_RECORD_TYPES)[number];

export interface KnowledgeProvenance {
	readonly writer: string;
	readonly source: string;
	readonly date: string;
}

export interface KnowledgeRecordFields {
	readonly type: KnowledgeRecordType;
	readonly title: string;
	readonly description: string;
	readonly resource: string;
	readonly tags: readonly string[];
	readonly timestamp: string;
	readonly scope: Exclude<MemoryScopeName, "session">;
	readonly kind: "semantic";
	readonly writer?: string;
	readonly source?: string;
	readonly date?: string;
	readonly content: string;
}

export interface KnowledgeProposalIdentityInput {
	readonly planSlug: string;
	readonly type: KnowledgeRecordType;
	readonly title: string;
	readonly description: string;
	readonly content: string;
	readonly tags: readonly string[];
	readonly source: string;
	readonly writer: string;
	readonly sourceDate?: string;
}

export interface DerivedKnowledgeProposalIdentity {
	readonly type: KnowledgeRecordType;
	readonly title: string;
	readonly description: string;
	readonly content: string;
	readonly source: string;
	readonly resource: string;
	readonly writer: string;
	readonly tags: readonly string[];
	readonly proposalIdentity: KnowledgeProposalIdentity;
}

type ParseKnowledgeRecordResult =
	| { readonly ok: true; readonly record: KnowledgeRecordFields }
	| { readonly ok: false; readonly message: string };

type NormalizeKnowledgeProposalResult =
	| {
			readonly ok: true;
			readonly record: KnowledgeRecordFields & KnowledgeProvenance;
			readonly proposalIdentity: KnowledgeProposalIdentity;
	  }
	| { readonly ok: false; readonly message: string };

export function isKnowledgeRecordType(
	value: unknown,
): value is KnowledgeRecordType {
	return KNOWLEDGE_RECORD_TYPES.includes(value as KnowledgeRecordType);
}

export function parseHumanKnowledgeRecord(options: {
	readonly raw: string;
	readonly physicalResource: string;
	readonly physicalScope: Exclude<MemoryScopeName, "session">;
	readonly mtime: Date;
}): ParseKnowledgeRecordResult {
	const parsed = matter(options.raw);
	const data = parsed.data;
	if (!isKnowledgeRecordType(data.type)) {
		return {
			ok: false,
			message: `Knowledge record type ${JSON.stringify(data.type)} is not one of decision, trade-off, gotcha, or convention.`,
		};
	}

	const title = optionalNonEmptyString(data.title);
	if (!title.ok) return invalidField("title");
	const description = optionalNonEmptyString(data.description);
	if (!description.ok) return invalidField("description");
	const resource = optionalNonEmptyString(data.resource);
	if (!resource.ok) return invalidField("resource");
	if (
		resource.value !== undefined &&
		(!isSafePosixRelativePath(resource.value) ||
			(resource.value !== options.physicalResource &&
				resource.value !== `knowledge/${options.physicalResource}`))
	) {
		return {
			ok: false,
			message:
				"Knowledge record resource must match its safe physical path relative to the selected knowledge root.",
		};
	}

	const tags = normalizeOptionalTags(data.tags);
	if (!tags.ok) return invalidField("tags");
	const timestamp = normalizeOptionalDate(data.timestamp);
	if (!timestamp.ok) return invalidField("timestamp");
	if (data.scope !== undefined && data.scope !== options.physicalScope) {
		return {
			ok: false,
			message: `Knowledge record scope ${String(data.scope)} does not match ${options.physicalScope} store.`,
		};
	}
	if (data.kind !== undefined && data.kind !== "semantic") {
		return {
			ok: false,
			message: "Knowledge records must use semantic memory kind.",
		};
	}

	const writer = optionalNonEmptyString(data.writer);
	if (!writer.ok) return invalidField("writer");
	const source = optionalNonEmptyString(data.source);
	if (!source.ok) return invalidField("source");
	const date = normalizeOptionalDate(data.date);
	if (!date.ok) return invalidField("date");
	const content = parsed.content.trim();
	const normalizedTitle =
		title.value ?? firstH1(content) ?? filenameStem(options.physicalResource);

	return {
		ok: true,
		record: {
			type: data.type,
			title: normalizedTitle,
			description:
				description.value ?? firstBodyParagraph(content) ?? normalizedTitle,
			resource: resource.value ?? options.physicalResource,
			tags: tags.value ?? [],
			timestamp: timestamp.value ?? options.mtime.toISOString(),
			scope: options.physicalScope,
			kind: "semantic",
			...(writer.value === undefined ? {} : { writer: writer.value }),
			...(source.value === undefined ? {} : { source: source.value }),
			...(date.value === undefined ? {} : { date: date.value }),
			content,
		},
	};
}

export function deriveKnowledgeProposalIdentity(
	input: KnowledgeProposalIdentityInput,
): DerivedKnowledgeProposalIdentity {
	if (!isSafeSlug(input.planSlug)) {
		throw new Error(
			"Knowledge proposal planSlug must be a safe lowercase slug.",
		);
	}
	if (!isKnowledgeRecordType(input.type)) {
		throw new Error("Knowledge proposal type is not ratified.");
	}
	const title = requireNonEmpty(input.title, "title");
	const description = requireNonEmpty(input.description, "description");
	const content = requireNonEmpty(input.content, "content");
	const source = requireNonEmpty(input.source, "source");
	const writer = normalizeQualifiedWriter(input.writer);
	const tags = normalizeTags(input.tags);
	const sourceDate =
		input.sourceDate === undefined
			? undefined
			: canonicalDate(input.sourceDate, "sourceDate");
	const stable = JSON.stringify({
		planSlug: input.planSlug,
		type: input.type,
		title,
		description,
		content,
		tags,
		source,
		writer,
		sourceDate: sourceDate ?? null,
	});
	const key = createHash("sha256").update(stable).digest("hex").slice(0, 12);
	const fileName = `${input.type}-${slugify(title)}-${key}.md`;
	return {
		type: input.type,
		title,
		description,
		content,
		source,
		resource: `knowledge/${input.planSlug}/${fileName}`,
		writer,
		tags,
		proposalIdentity: {
			planSlug: input.planSlug,
			key,
			...(sourceDate === undefined ? {} : { sourceDate }),
		},
	};
}

export function normalizeKnowledgeProposal(
	draft: MemoryRecordDraft,
): NormalizeKnowledgeProposalResult {
	if (draft.scope !== "project") {
		return proposalInvalid("Knowledge proposals require project scope.");
	}
	if (draft.kind !== "semantic") {
		return proposalInvalid("Knowledge proposals require semantic memory kind.");
	}
	if (!isKnowledgeRecordType(draft.type)) {
		return proposalInvalid("Knowledge proposal type is not ratified.");
	}
	if (
		draft.resource === undefined ||
		draft.writer === undefined ||
		draft.source === undefined ||
		draft.date === undefined ||
		draft.timestamp === undefined ||
		draft.proposalIdentity === undefined
	) {
		return proposalInvalid(
			"Knowledge proposals require resource, writer, source, date, timestamp, and typed proposal identity.",
		);
	}

	try {
		const identity = deriveKnowledgeProposalIdentity({
			planSlug: draft.proposalIdentity.planSlug,
			type: draft.type,
			title: draft.title,
			description: draft.description,
			content: draft.content,
			tags: draft.tags,
			source: draft.source,
			writer: draft.writer,
			sourceDate: draft.proposalIdentity.sourceDate,
		});
		const timestamp = canonicalDate(draft.timestamp, "timestamp");
		const date = canonicalDate(draft.date, "date");
		if (timestamp !== draft.timestamp || date !== draft.date) {
			return proposalInvalid(
				"Knowledge proposal date and timestamp must be canonical UTC timestamps.",
			);
		}
		if (timestamp !== date) {
			return proposalInvalid(
				"Knowledge proposal date and timestamp must describe the same write clock.",
			);
		}
		if (
			identity.proposalIdentity.sourceDate !== undefined &&
			timestamp !== identity.proposalIdentity.sourceDate
		) {
			return proposalInvalid(
				"Source-dated knowledge proposals must use sourceDate for date and timestamp.",
			);
		}
		if (
			draft.resource !== identity.resource ||
			draft.proposalIdentity.key !== identity.proposalIdentity.key
		) {
			return proposalInvalid(
				"Knowledge proposal resource or key does not match its canonical stable identity.",
			);
		}
		if (
			draft.title !== draft.title.trim() ||
			draft.description !== draft.description.trim() ||
			draft.content !== draft.content.trim() ||
			draft.source !== draft.source.trim() ||
			draft.writer !== identity.writer ||
			!sameStrings(draft.tags, identity.tags)
		) {
			return proposalInvalid(
				"Knowledge proposal fields must be normalized before writing.",
			);
		}
		return {
			ok: true,
			record: {
				type: identity.type,
				title: identity.title,
				description: identity.description,
				resource: identity.resource,
				tags: identity.tags,
				timestamp,
				scope: "project",
				kind: "semantic",
				writer: identity.writer,
				source: identity.source,
				date,
				content: identity.content,
			},
			proposalIdentity: identity.proposalIdentity,
		};
	} catch (error: unknown) {
		return proposalInvalid(
			error instanceof Error ? error.message : String(error),
		);
	}
}

export function parseKnowledgeProposalOccupant(options: {
	readonly raw: string;
	readonly expected: KnowledgeRecordFields & KnowledgeProvenance;
	readonly proposalIdentity: KnowledgeProposalIdentity;
}): ParseKnowledgeRecordResult {
	const parsed = matter(options.raw);
	const data = parsed.data;
	if (
		!isKnowledgeRecordType(data.type) ||
		typeof data.title !== "string" ||
		typeof data.description !== "string" ||
		typeof data.resource !== "string" ||
		!Array.isArray(data.tags) ||
		!data.tags.every((tag: unknown) => typeof tag === "string") ||
		typeof data.timestamp !== "string" ||
		data.scope !== "project" ||
		data.kind !== "semantic" ||
		typeof data.writer !== "string" ||
		typeof data.source !== "string" ||
		typeof data.date !== "string"
	) {
		return {
			ok: false,
			message: "Existing proposal occupant is not a complete knowledge record.",
		};
	}

	let timestamp: string;
	let date: string;
	try {
		timestamp = canonicalDate(data.timestamp, "timestamp");
		date = canonicalDate(data.date, "date");
	} catch (error: unknown) {
		return {
			ok: false,
			message: error instanceof Error ? error.message : String(error),
		};
	}
	if (
		timestamp !== data.timestamp ||
		date !== data.date ||
		timestamp !== date
	) {
		return {
			ok: false,
			message: "Existing proposal occupant has noncanonical write clocks.",
		};
	}
	const record: KnowledgeRecordFields & KnowledgeProvenance = {
		type: data.type,
		title: data.title,
		description: data.description,
		resource: data.resource,
		tags: data.tags,
		timestamp,
		scope: "project",
		kind: "semantic",
		writer: data.writer,
		source: data.source,
		date,
		content: parsed.content.trim(),
	};
	const stableMatches =
		record.type === options.expected.type &&
		record.title === options.expected.title &&
		record.description === options.expected.description &&
		record.resource === options.expected.resource &&
		sameStrings(record.tags, options.expected.tags) &&
		record.writer === options.expected.writer &&
		record.source === options.expected.source &&
		record.content === options.expected.content;
	const clocksMatch =
		options.proposalIdentity.sourceDate === undefined ||
		(record.timestamp === options.expected.timestamp &&
			record.date === options.expected.date);
	if (!stableMatches || !clocksMatch) {
		return {
			ok: false,
			message: "Existing proposal occupant does not match the stable identity.",
		};
	}
	return { ok: true, record };
}

export function renderKnowledgeProposal(
	record: KnowledgeRecordFields & KnowledgeProvenance,
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
		writer: record.writer,
		source: record.source,
		date: record.date,
	});
}

export function toRetrievedKnowledgeRecord(options: {
	readonly record: KnowledgeRecordFields;
	readonly path: string;
}): RetrievedMemoryRecord {
	return { ...options.record, path: options.path };
}

export function isSafePosixRelativePath(value: string): boolean {
	if (!value || value.startsWith("/") || value.includes("\\")) return false;
	const segments = value.split("/");
	return segments.every(
		(segment) => segment.length > 0 && segment !== "." && segment !== "..",
	);
}

function invalidField(field: string): ParseKnowledgeRecordResult {
	return {
		ok: false,
		message: `Knowledge record has invalid explicit ${field} metadata.`,
	};
}

function proposalInvalid(message: string): NormalizeKnowledgeProposalResult {
	return { ok: false, message };
}

function optionalNonEmptyString(
	value: unknown,
): { readonly ok: true; readonly value?: string } | { readonly ok: false } {
	if (value === undefined) return { ok: true };
	if (typeof value !== "string" || !value.trim()) return { ok: false };
	return { ok: true, value: value.trim() };
}

function normalizeOptionalTags(
	value: unknown,
):
	| { readonly ok: true; readonly value?: readonly string[] }
	| { readonly ok: false } {
	if (value === undefined) return { ok: true };
	if (!Array.isArray(value) || !value.every((tag) => typeof tag === "string")) {
		return { ok: false };
	}
	try {
		return { ok: true, value: normalizeTags(value) };
	} catch {
		return { ok: false };
	}
}

function normalizeOptionalDate(
	value: unknown,
): { readonly ok: true; readonly value?: string } | { readonly ok: false } {
	if (value === undefined) return { ok: true };
	if (!(typeof value === "string" || value instanceof Date))
		return { ok: false };
	try {
		return {
			ok: true,
			value:
				value instanceof Date
					? canonicalDate(value.toISOString(), "date")
					: canonicalDate(value, "date"),
		};
	} catch {
		return { ok: false };
	}
}

function canonicalDate(value: string, field: string): string {
	if (!value.trim()) throw new Error(`${field} must be a valid date.`);
	const parsed = new Date(value);
	if (Number.isNaN(parsed.valueOf())) {
		throw new Error(`${field} must be a valid date.`);
	}
	return parsed.toISOString();
}

function normalizeQualifiedWriter(value: string): string {
	const writer = requireNonEmpty(value, "writer").toLowerCase();
	if (!/^[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9_/-]*$/u.test(writer)) {
		throw new Error("Knowledge proposal writer must be a qualified agent id.");
	}
	return writer;
}

function normalizeTags(tags: readonly string[]): readonly string[] {
	const normalized = tags.map((tag) => requireNonEmpty(tag, "tag"));
	return [...new Set(normalized)].sort();
}

function requireNonEmpty(value: string, field: string): string {
	if (typeof value !== "string" || !value.trim()) {
		throw new Error(`Knowledge proposal ${field} must be non-empty.`);
	}
	return value.trim();
}

function firstH1(content: string): string | undefined {
	for (const line of content.split(/\r?\n/u)) {
		const match = /^#\s+(.+?)\s*$/u.exec(line);
		if (match?.[1]) return match[1].trim();
	}
	return undefined;
}

function firstBodyParagraph(content: string): string | undefined {
	for (const block of content.split(/(?:\r?\n){2,}/u)) {
		const normalized = block
			.split(/\r?\n/u)
			.map((line) => line.trim())
			.filter(Boolean)
			.join(" ");
		if (normalized && !normalized.startsWith("#")) return normalized;
	}
	return undefined;
}

function filenameStem(resource: string): string {
	const fileName = resource.slice(resource.lastIndexOf("/") + 1);
	return fileName.endsWith(".md") ? fileName.slice(0, -3) : fileName;
}

function isSafeSlug(value: string): boolean {
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value);
}

function slugify(value: string): string {
	const slug = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, "-")
		.replace(/^-+|-+$/gu, "");
	return slug || "knowledge-record";
}

function sameStrings(
	left: readonly string[],
	right: readonly string[],
): boolean {
	return (
		left.length === right.length && left.every((value, i) => value === right[i])
	);
}
