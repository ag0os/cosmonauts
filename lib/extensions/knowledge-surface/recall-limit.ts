const DEFAULT_RECALL_LIMIT = 5;
const MAX_RECALL_LIMIT = 20;

export function normalizeRecallLimit(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return DEFAULT_RECALL_LIMIT;
	}
	return Math.max(1, Math.min(MAX_RECALL_LIMIT, Math.trunc(value)));
}
