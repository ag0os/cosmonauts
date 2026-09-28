import type { MemoryQuery, RetrievedMemoryRecord } from "./types.ts";

export function matchesMemoryQuery(options: {
	readonly record: RetrievedMemoryRecord;
	readonly query: MemoryQuery;
	readonly searchableText: string;
}): boolean {
	if (
		options.query.recordTypes &&
		options.query.recordTypes.length > 0 &&
		!options.query.recordTypes.includes(options.record.type)
	) {
		return false;
	}
	if (
		options.query.resource &&
		options.query.resource !== options.record.resource
	) {
		return false;
	}
	const text = options.query.text?.trim().toLowerCase();
	return !text || options.searchableText.toLowerCase().includes(text);
}
