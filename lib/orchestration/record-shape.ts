/**
 * Structural predicates shared by the chain-local review report parser and the
 * durable activity adapter. Both validate untrusted JSON-ish payloads against a
 * closed key set, so the checks live here rather than being restated in each.
 */

/** Narrow an unknown value to a plain (non-array) object. */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when `value` carries exactly `expectedKeys` — no missing, no extra. */
export function hasExactKeys(
	value: Record<string, unknown>,
	expectedKeys: readonly string[],
): boolean {
	const actualKeys = Object.keys(value).sort();
	const sortedExpectedKeys = [...expectedKeys].sort();
	return (
		actualKeys.length === sortedExpectedKeys.length &&
		actualKeys.every((key, index) => key === sortedExpectedKeys[index])
	);
}
