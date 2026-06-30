/**
 * ID Generator for tasks
 * Generates sequential task IDs with configurable prefix and zero-padding
 */

import type { ForgeTasksConfig } from "./task-types.ts";

/**
 * Default prefix used when none is specified in config
 */
const DEFAULT_PREFIX = "TASK";

/**
 * Parse the numeric part from a task ID
 * ID matching is case-insensitive
 *
 * @param id - The task ID to parse (e.g., "TASK-123", "task-1")
 * @param prefix - The expected prefix (e.g., "TASK")
 * @returns The numeric part as a number, or null if ID doesn't match format
 *
 * @example
 * parseIdNumber("TASK-123", "TASK") // => 123
 * parseIdNumber("task-1", "TASK") // => 1 (case-insensitive)
 * parseIdNumber("FEAT-5", "TASK") // => null (wrong prefix)
 * parseIdNumber("TASK-abc", "TASK") // => null (non-numeric)
 */
export function parseIdNumber(id: string, prefix: string): number | null {
	const trimmedId = id.trim();
	const trimmedPrefix = prefix.trim();

	// Build case-insensitive regex: ^PREFIX-(\d+)$
	const pattern = new RegExp(`^${escapeRegex(trimmedPrefix)}-(\\d+)$`, "i");

	const match = trimmedId.match(pattern);
	if (!match || !match[1]) {
		return null;
	}

	const num = Number.parseInt(match[1], 10);
	return Number.isNaN(num) ? null : num;
}

/**
 * Format a task ID with the given prefix, number, and optional zero-padding
 *
 * @param prefix - The ID prefix (e.g., "TASK", "FEAT")
 * @param number - The numeric part of the ID
 * @param zeroPadding - Optional number of digits for zero-padding
 * @returns Formatted ID string
 *
 * @example
 * formatId("TASK", 1) // => "TASK-1"
 * formatId("TASK", 1, 3) // => "TASK-001"
 * formatId("FEAT", 42, 4) // => "FEAT-0042"
 */
export function formatId(
	prefix: string,
	number: number,
	zeroPadding?: number,
): string {
	const trimmedPrefix = prefix.trim().toUpperCase();

	if (zeroPadding && zeroPadding > 0) {
		const paddedNumber = String(number).padStart(zeroPadding, "0");
		return `${trimmedPrefix}-${paddedNumber}`;
	}

	return `${trimmedPrefix}-${number}`;
}

/**
 * Generate the next sequential task ID based on existing IDs and config
 *
 * The ID number is determined by the highest matching ID number in the supplied
 * list. IDs are matched case-insensitively and other prefixes are ignored.
 *
 * @param config - ForgeTasksConfig containing prefix and zeroPadding settings
 * @param existingIds - Existing active and archived IDs to check for collisions
 * @returns Next sequential ID string
 *
 * @example
 * // No existing IDs
 * generateNextId({ prefix: "TASK" }, []) // => "TASK-1"
 *
 * // With existing active + archived IDs
 * generateNextId({ prefix: "TASK" }, ["TASK-1", "TASK-2"]) // => "TASK-3"
 *
 * // With zero-padding
 * generateNextId({ prefix: "TASK", zeroPadding: 3 }, ["TASK-010"]) // => "TASK-011"
 */
export function generateNextId(
	config: ForgeTasksConfig,
	existingIds: readonly string[],
): string {
	const prefix = config.prefix || DEFAULT_PREFIX;
	const zeroPadding = config.zeroPadding;

	const highestNumber = Math.max(0, ...extractIdNumbers(existingIds, prefix));
	const nextNumber = highestNumber + 1;

	return formatId(prefix, nextNumber, zeroPadding);
}

/**
 * Find all numeric IDs from a list of ID strings that match the given prefix
 *
 * @param ids - Array of ID strings to search
 * @param prefix - The ID prefix to match
 * @returns Array of numeric parts from matching task IDs
 *
 * @example
 * const ids = ["TASK-1", "TASK-5", "FEAT-3"];
 * extractIdNumbers(ids, "TASK") // => [1, 5]
 */
export function extractIdNumbers(
	ids: readonly string[],
	prefix: string,
): number[] {
	const numbers: number[] = [];

	for (const id of ids) {
		const num = parseIdNumber(id, prefix);
		if (num !== null) {
			numbers.push(num);
		}
	}

	return numbers;
}

/**
 * Check if an ID matches the expected format for the given prefix
 *
 * @param id - The ID to validate
 * @param prefix - The expected prefix
 * @returns true if the ID matches the format "{PREFIX}-{NUMBER}"
 *
 * @example
 * isValidId("TASK-123", "TASK") // => true
 * isValidId("task-1", "TASK") // => true (case-insensitive)
 * isValidId("TASK-abc", "TASK") // => false
 * isValidId("FEAT-1", "TASK") // => false
 */
export function isValidId(id: string, prefix: string): boolean {
	return parseIdNumber(id, prefix) !== null;
}

/**
 * Escape special regex characters in a string
 * Used internally for building regex patterns from prefix strings
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
