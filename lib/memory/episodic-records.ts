import type { MemoryRecordDraft, RetrievedMemoryRecord } from "./types.ts";

export const EPISODE_ACTIONS = [
	"chain.run",
	"drive.run",
	"plan.created",
	"plan.status-changed",
	"task.created",
	"task.status-changed",
	"memory.saved",
	"autonomy.wake",
] as const;

export type EpisodeAction = (typeof EPISODE_ACTIONS)[number];

export interface EpisodeReference {
	readonly kind: string;
	readonly id: string;
}

export interface EpisodeEvent {
	readonly scope: "project" | "user";
	readonly source: string;
	readonly action: EpisodeAction;
	readonly outcome: string;
	readonly subject: EpisodeReference;
	readonly payload?: EpisodeReference;
	readonly summary: string;
	readonly details?: string;
	readonly tags?: readonly string[];
	readonly timestamp?: string;
}

export interface EpisodeRecordMetadata {
	readonly action: EpisodeAction;
	readonly outcome: string;
	readonly subject: EpisodeReference;
	readonly payload?: EpisodeReference;
	readonly writer?: "cosmonauts";
}

const RESERVED_TAG_PREFIXES = [
	"action:",
	"outcome:",
	"subject:",
	"payload:",
	"writer:",
] as const;
const TOKEN_PATTERN = /^[a-z0-9][a-z0-9._-]*$/u;
const MACHINE_WRITER_TAG = "writer:cosmonauts";

export function isEpisodeAction(value: unknown): value is EpisodeAction {
	return EPISODE_ACTIONS.includes(value as EpisodeAction);
}

export function createEpisodeRecord(
	event: EpisodeEvent,
	timestamp: string = event.timestamp ?? "",
): MemoryRecordDraft {
	validateEvent(event, timestamp);

	const subjectTag = referenceTag("subject", event.subject);
	const payloadTag = event.payload
		? referenceTag("payload", event.payload)
		: undefined;
	const tags = [
		...(event.tags ?? []).filter((tag) => !isReservedTag(tag)),
		`action:${event.action}`,
		`outcome:${event.outcome}`,
		subjectTag,
		...(payloadTag ? [payloadTag] : []),
		MACHINE_WRITER_TAG,
	];
	const subject = displayReference(event.subject);
	const payload = event.payload ? displayReference(event.payload) : undefined;
	const body = [
		`Timestamp: ${timestamp}`,
		`Actor: ${event.source.trim()}`,
		`Action: ${event.action}`,
		`Outcome: ${event.outcome}`,
		`Subject: ${subject}`,
		...(payload ? [`Payload: ${payload}`] : []),
		"",
		event.summary.trim(),
		...(event.details?.trim() ? ["", event.details.trim()] : []),
	].join("\n");

	return {
		type: "episode",
		scope: event.scope,
		kind: "episodic",
		title: event.summary.trim(),
		description: `${event.action} ${event.outcome} for ${subject}.`,
		content: body,
		tags,
		timestamp,
		source: event.source.trim(),
	};
}

export function parseEpisodeRecord(
	record: RetrievedMemoryRecord,
): EpisodeRecordMetadata | undefined {
	if (
		record.type !== "episode" ||
		record.kind !== "episodic" ||
		(record.scope !== "project" && record.scope !== "user") ||
		!record.source?.trim()
	) {
		return undefined;
	}
	return parseEpisodeTagEnvelope(record.tags);
}

/**
 * Validate and parse the reserved action/outcome/subject (and optional payload)
 * tag envelope shared by every episode. Returns `undefined` when the envelope is
 * malformed. Used by both `parseEpisodeRecord` (retrieval metadata) and the OKF
 * store parse arm, so a store-level read rejects and warns on the same envelope
 * the public metadata parser rejects.
 */
export function parseEpisodeTagEnvelope(
	tags: readonly string[],
): EpisodeRecordMetadata | undefined {
	const actionTag = singleTagValue(tags, "action:");
	const outcome = singleTagValue(tags, "outcome:");
	const subjectTag = singleTagValue(tags, "subject:");
	const payloadTag = optionalSingleTagValue(tags, "payload:");
	if (
		actionTag === undefined ||
		outcome === undefined ||
		subjectTag === undefined ||
		payloadTag === null ||
		!isEpisodeAction(actionTag) ||
		!isNormalizedToken(outcome)
	) {
		return undefined;
	}

	const subject = parseReference(subjectTag);
	const payload =
		payloadTag === undefined ? undefined : parseReference(payloadTag);
	if (!subject || (payloadTag !== undefined && !payload)) return undefined;
	if (actionTag === "autonomy.wake" && !payload) return undefined;

	return {
		action: actionTag,
		outcome,
		subject,
		...(payload ? { payload } : {}),
		...(tags.includes(MACHINE_WRITER_TAG)
			? { writer: "cosmonauts" as const }
			: {}),
	};
}

function validateEvent(event: EpisodeEvent, timestamp: string): void {
	if (!isEpisodeAction(event.action)) {
		throw new Error(`Unsupported episode action: ${String(event.action)}.`);
	}
	if (event.scope !== "project" && event.scope !== "user") {
		throw new Error("Episode scope must be project or user.");
	}
	if (!event.source.trim())
		throw new Error("Episode source must not be empty.");
	if (!isNormalizedToken(event.outcome)) {
		throw new Error("Episode outcome must be a normalized non-empty token.");
	}
	validateReference("subject", event.subject);
	if (event.payload) validateReference("payload", event.payload);
	if (event.action === "autonomy.wake" && !event.payload) {
		throw new Error("autonomy.wake requires a stable payload.");
	}
	if (!event.summary.trim())
		throw new Error("Episode summary must not be empty.");
	if (!timestamp || Number.isNaN(new Date(timestamp).valueOf())) {
		throw new Error("Episode timestamp must be a valid date-time string.");
	}
	if (event.tags && !event.tags.every((tag) => typeof tag === "string")) {
		throw new Error("Episode tags must be strings.");
	}
}

function validateReference(name: string, reference: EpisodeReference): void {
	if (!isNormalizedToken(reference.kind) || !reference.id.trim()) {
		throw new Error(
			`Episode ${name} requires a normalized kind and non-empty stable id.`,
		);
	}
}

function isNormalizedToken(value: string): boolean {
	return TOKEN_PATTERN.test(value);
}

function isReservedTag(tag: string): boolean {
	return RESERVED_TAG_PREFIXES.some((prefix) => tag.startsWith(prefix));
}

function referenceTag(prefix: "subject" | "payload", value: EpisodeReference) {
	return `${prefix}:${encodeURIComponent(value.kind)}:${encodeURIComponent(value.id.trim())}`;
}

function displayReference(value: EpisodeReference): string {
	return `${value.kind}:${value.id.trim()}`;
}

function singleTagValue(
	tags: readonly string[],
	prefix: string,
): string | undefined {
	const values = tags
		.filter((tag) => tag.startsWith(prefix))
		.map((tag) => tag.slice(prefix.length));
	return values.length === 1 ? values[0] : undefined;
}

function optionalSingleTagValue(
	tags: readonly string[],
	prefix: string,
): string | null | undefined {
	const values = tags
		.filter((tag) => tag.startsWith(prefix))
		.map((tag) => tag.slice(prefix.length));
	if (values.length > 1) return null;
	return values[0];
}

function parseReference(value: string): EpisodeReference | undefined {
	const separator = value.indexOf(":");
	if (separator < 1 || separator === value.length - 1) return undefined;
	try {
		const kind = decodeURIComponent(value.slice(0, separator));
		const id = decodeURIComponent(value.slice(separator + 1));
		if (!isNormalizedToken(kind) || !id.trim()) return undefined;
		return { kind, id };
	} catch {
		return undefined;
	}
}
