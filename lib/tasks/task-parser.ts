/**
 * Task parser for forge-tasks
 * Parses markdown files with YAML frontmatter into Task objects
 */

import matter from "gray-matter";
import type {
	AcceptanceCriterion,
	Task,
	TaskPriority,
	TaskStatus,
} from "./task-types.ts";

// ============================================================================
// Constants
// ============================================================================

const AC_BEGIN_MARKER = "<!-- AC:BEGIN -->";
const AC_END_MARKER = "<!-- AC:END -->";

const VALID_STATUSES: TaskStatus[] = [
	"To Do",
	"In Progress",
	"Done",
	"Blocked",
];
const VALID_PRIORITIES: TaskPriority[] = ["high", "medium", "low"];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize line endings to LF for consistent parsing
 */
function normalizeLineEndings(content: string): string {
	return content.replace(/\r\n/g, "\n");
}

/**
 * Parse a date value from frontmatter
 * Handles Date objects, ISO strings, and various date formats
 */
function parseDate(value: unknown): Date | undefined {
	if (!value) return undefined;

	if (value instanceof Date) {
		return value;
	}

	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) return undefined;

		const parsed = new Date(trimmed);
		if (!Number.isNaN(parsed.getTime())) {
			return parsed;
		}
	}

	return undefined;
}

/**
 * Parse a date value, returning current date if parsing fails
 */
function parseDateWithDefault(value: unknown, defaultDate: Date): Date {
	return parseDate(value) ?? defaultDate;
}

/**
 * Validate and normalize task status
 */
function parseStatus(value: unknown): TaskStatus {
	if (!value) return "To Do";

	const str = String(value).trim();

	// Check for exact match first
	if (VALID_STATUSES.includes(str as TaskStatus)) {
		return str as TaskStatus;
	}

	// Case-insensitive match
	const lower = str.toLowerCase();
	for (const status of VALID_STATUSES) {
		if (status.toLowerCase() === lower) {
			return status;
		}
	}

	// Default to "To Do" for invalid values
	return "To Do";
}

/**
 * Validate and normalize task priority
 */
function parsePriority(value: unknown): TaskPriority | undefined {
	if (!value) return undefined;

	const str = String(value).toLowerCase().trim();
	if (VALID_PRIORITIES.includes(str as TaskPriority)) {
		return str as TaskPriority;
	}

	return undefined;
}

/**
 * Parse an array field from frontmatter
 * Handles both array and single string values
 */
function parseStringArray(value: unknown): string[] {
	if (!value) return [];

	if (Array.isArray(value)) {
		return value.map(String).filter((s) => s.trim() !== "");
	}

	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed ? [trimmed] : [];
	}

	return [];
}

/**
 * Remove AC markers and their content from a string
 */
function stripAcBlocks(content: string): string {
	const acRegex = new RegExp(
		`${escapeRegex(AC_BEGIN_MARKER)}[\\s\\S]*?${escapeRegex(AC_END_MARKER)}`,
		"g",
	);
	return content.replace(acRegex, "").trim();
}

/**
 * Extract a section from markdown content by header name
 * Returns the content between the header and the next header (or end of content)
 * Note: AC blocks are stripped from the section content to prevent duplication
 */
function extractSection(
	content: string,
	sectionTitle: string,
): string | undefined {
	const normalized = normalizeLineEndings(content);

	// Match the section header and capture content until next ## header or end
	const regex = new RegExp(
		`## ${escapeRegex(sectionTitle)}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`,
		"i",
	);

	const match = normalized.match(regex);
	if (!match?.[1]) return undefined;

	// Strip AC blocks from section content to prevent duplication on re-serialization
	const sectionContent = stripAcBlocks(match[1]);
	return sectionContent || undefined;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parse acceptance criteria from content between AC markers
 * Format: - [ ] #N Text or - [x] #N Text
 */
function parseAcceptanceCriteria(content: string): AcceptanceCriterion[] {
	const normalized = normalizeLineEndings(content);

	const beginIndex = normalized.indexOf(AC_BEGIN_MARKER);
	const endIndex = normalized.indexOf(AC_END_MARKER);

	// No markers found, try legacy format (just checkboxes in Acceptance Criteria section)
	if (beginIndex === -1 || endIndex === -1) {
		return parseLegacyAcceptanceCriteria(normalized);
	}

	const acContent = normalized.substring(
		beginIndex + AC_BEGIN_MARKER.length,
		endIndex,
	);

	const criteria: AcceptanceCriterion[] = [];
	const lines = acContent.split("\n").filter((line) => line.trim());

	for (const line of lines) {
		// Match: - [ ] #N Text or - [x] #N Text
		const match = line.match(/^- \[([ x])\] #(\d+) (.+)$/);
		if (match?.[1] && match?.[2] && match?.[3]) {
			criteria.push({
				checked: match[1] === "x",
				index: Number.parseInt(match[2], 10),
				text: match[3].trim(),
			});
		}
	}

	return criteria;
}

/**
 * Parse legacy acceptance criteria format (without AC markers)
 * Format: - [ ] Text or - [x] Text (auto-assigns indices)
 */
function parseLegacyAcceptanceCriteria(content: string): AcceptanceCriterion[] {
	const normalized = normalizeLineEndings(content);

	// Look for Acceptance Criteria section
	const sectionRegex = /## Acceptance Criteria\s*\n([\s\S]*?)(?=\n## |$)/i;
	const sectionMatch = normalized.match(sectionRegex);

	if (!sectionMatch?.[1]) return [];

	const sectionContent = sectionMatch[1];
	const criteria: AcceptanceCriterion[] = [];
	const lines = sectionContent.split("\n").filter((line) => line.trim());

	let index = 1;
	for (const line of lines) {
		// Match: - [ ] Text or - [x] Text (with optional #N prefix)
		const match = line.match(/^- \[([ x])\] (?:#\d+ )?(.+)$/);
		if (match?.[1] && match?.[2]) {
			criteria.push({
				checked: match[1] === "x",
				index: index++,
				text: match[2].trim(),
			});
		}
	}

	return criteria;
}

/**
 * Extract raw content that doesn't fit into recognized sections
 * This preserves any custom markdown content
 */
function extractRawContent(
	content: string,
	recognizedSections: string[],
): string | undefined {
	const normalized = normalizeLineEndings(content);

	// Remove frontmatter
	const frontmatterRegex = /^---\n[\s\S]*?\n---\n?/;
	let remaining = normalized.replace(frontmatterRegex, "");

	// Remove recognized sections
	for (const section of recognizedSections) {
		const sectionRegex = new RegExp(
			`## ${escapeRegex(section)}\\s*\\n[\\s\\S]*?(?=\\n## |$)`,
			"gi",
		);
		remaining = remaining.replace(sectionRegex, "");
	}

	// Remove AC markers and their content
	const acRegex = new RegExp(
		`${escapeRegex(AC_BEGIN_MARKER)}[\\s\\S]*?${escapeRegex(AC_END_MARKER)}`,
		"g",
	);
	remaining = remaining.replace(acRegex, "");

	// Clean up multiple newlines and trim
	remaining = remaining.replace(/\n{3,}/g, "\n\n").trim();

	return remaining || undefined;
}

// ============================================================================
// Main Parser Function
// ============================================================================

/**
 * Parse a markdown file content into a Task object
 *
 * @param content - The raw markdown content of the task file
 * @returns A fully parsed Task object
 *
 * @example
 * ```typescript
 * const content = `---
 * id: TASK-1
 * title: Implement feature
 * status: In Progress
 * ---
 *
 * ## Description
 *
 * This is the description.
 * `;
 *
 * const task = parseTask(content);
 * console.log(task.id); // "TASK-1"
 * console.log(task.status); // "In Progress"
 * ```
 */
export function parseTask(content: string): Task {
	const normalized = normalizeLineEndings(content);
	const now = new Date();

	// Parse frontmatter using gray-matter
	const parsed = matter(normalized);
	const frontmatter = parsed.data;
	const bodyContent = parsed.content.trim();

	// Extract sections from body content
	const description = extractSection(bodyContent, "Description");
	const implementationPlan = extractSection(bodyContent, "Implementation Plan");
	const implementationNotes = extractSection(
		bodyContent,
		"Implementation Notes",
	);

	// Parse acceptance criteria (from markers or legacy format)
	const acceptanceCriteria = parseAcceptanceCriteria(bodyContent);

	// Extract raw content (content that doesn't fit recognized patterns)
	const recognizedSections = [
		"Description",
		"Implementation Plan",
		"Implementation Notes",
		"Acceptance Criteria",
	];
	const rawContent = extractRawContent(normalized, recognizedSections);

	// Build the Task object
	const task: Task = {
		id: String(frontmatter.id || ""),
		title: String(frontmatter.title || ""),
		status: parseStatus(frontmatter.status),
		priority: parsePriority(frontmatter.priority),
		assignee: frontmatter.assignee ? String(frontmatter.assignee) : undefined,
		createdAt: parseDateWithDefault(frontmatter.createdAt, now),
		updatedAt: parseDateWithDefault(frontmatter.updatedAt, now),
		dueDate: parseDate(frontmatter.dueDate),
		labels: parseStringArray(frontmatter.labels),
		dependencies: parseStringArray(frontmatter.dependencies),
		description,
		implementationPlan,
		implementationNotes,
		acceptanceCriteria,
		rawContent,
	};

	return task;
}
