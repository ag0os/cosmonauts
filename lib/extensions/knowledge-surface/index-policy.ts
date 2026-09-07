import type {
	KnowledgeIndexPressurePolicy,
	KnowledgeIndexRenderInput,
	RetrievedMemoryRecord,
} from "../../memory/index.ts";
import {
	renderInjectionTruncationFooter,
	utf8ByteLength,
} from "../../memory/injection-budget.ts";

export const COMBINED_CONTEXT_MAX_BYTES = 24_000;
export const KNOWLEDGE_INDEX_LIMIT = 50;
export const COMBINED_CONTEXT_PREFIX =
	"Combined durable context for the current turn.\n\n";
const COMBINED_CONTEXT_SEPARATOR = "\n\n";

export function renderKnowledgeIndex(
	input: KnowledgeIndexRenderInput,
): string | undefined {
	const visible = sortedVisibleRecords(input.records);
	if (visible.length === 0 && input.warnings.length === 0) return undefined;
	return [
		"Knowledge index",
		`Up to ${KNOWLEDGE_INDEX_LIMIT} current project/user knowledge records, ordered by timestamp then path.`,
		"This section contains compact metadata only, not record bodies.",
		"Use recall(query) for complete knowledge record details.",
		...(input.warnings.length > 0
			? [
					"",
					"Knowledge warnings:",
					...input.warnings.map((warning) => `- ${warning.message}`),
				]
			: []),
		"",
		...visible.map(renderKnowledgeIndexRow),
	].join("\n");
}

export function createKnowledgeIndexPressurePolicy(): KnowledgeIndexPressurePolicy {
	return {
		measure(input) {
			const rendered = renderKnowledgeIndex(input) ?? "";
			const renderedBytes = utf8ByteLength(rendered);
			const guaranteedBytes = guaranteedKnowledgeShareBytes();
			const rows = sortedVisibleRecords(input.records).map(
				renderKnowledgeIndexRow,
			);
			const largestRowBytes = rows.reduce(
				(maximum, row) => Math.max(maximum, utf8ByteLength(row)),
				0,
			);
			const headroomBytes =
				largestRowBytes === 0
					? 0
					: 1 +
						largestRowBytes +
						truncationFramingBytes({
							originalBytes: renderedBytes + 1 + largestRowBytes,
							guaranteedBytes,
						});
			return {
				kind: "measured",
				targetSatisfied:
					input.records.length <= KNOWLEDGE_INDEX_LIMIT &&
					renderedBytes + headroomBytes <= guaranteedBytes,
				recordCount: input.records.length,
				maxRecords: KNOWLEDGE_INDEX_LIMIT,
				renderedBytes,
				guaranteedBytes,
				headroomBytes,
			};
		},
	};
}

function renderKnowledgeIndexRow(record: RetrievedMemoryRecord): string {
	return [
		`- type: ${record.type}`,
		`  title: ${record.title}`,
		`  scope: ${record.scope}`,
		`  timestamp: ${record.timestamp}`,
		`  description: ${record.description}`,
		`  resource: ${record.resource}`,
	].join("\n");
}

function guaranteedKnowledgeShareBytes(): number {
	const framingBytes =
		utf8ByteLength(COMBINED_CONTEXT_PREFIX) +
		utf8ByteLength(COMBINED_CONTEXT_SEPARATOR) * 2;
	return Math.floor((COMBINED_CONTEXT_MAX_BYTES - framingBytes) / 3);
}

function sortedVisibleRecords(
	records: readonly RetrievedMemoryRecord[],
): readonly RetrievedMemoryRecord[] {
	return records
		.toSorted(
			(left, right) =>
				right.timestamp.localeCompare(left.timestamp) ||
				left.path.localeCompare(right.path),
		)
		.slice(0, KNOWLEDGE_INDEX_LIMIT);
}

function truncationFramingBytes(options: {
	readonly originalBytes: number;
	readonly guaranteedBytes: number;
}): number {
	const section = {
		id: "knowledge",
		content: "",
		detailTool: "recall(query)",
	};
	let includedBytes = options.guaranteedBytes;
	let footer = renderInjectionTruncationFooter(
		section,
		options.originalBytes,
		includedBytes,
	);
	for (let attempt = 0; attempt < 10; attempt += 1) {
		const nextIncluded = Math.max(
			0,
			options.guaranteedBytes - utf8ByteLength(footer),
		);
		const nextFooter = renderInjectionTruncationFooter(
			section,
			options.originalBytes,
			nextIncluded,
		);
		if (nextIncluded === includedBytes && nextFooter === footer) break;
		includedBytes = nextIncluded;
		footer = nextFooter;
	}
	return utf8ByteLength(footer);
}
