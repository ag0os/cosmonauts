/**
 * Task serializer for tasks
 * Serializes Task objects to markdown files with YAML frontmatter
 */

import matter from "gray-matter";
import type { AcceptanceCriterion, Task } from "./task-types.ts";

// ============================================================================
// Constants
// ============================================================================

const AC_BEGIN_MARKER = "<!-- AC:BEGIN -->";
const AC_END_MARKER = "<!-- AC:END -->";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build YAML frontmatter object from Task
 * Only includes fields that have values
 */
function buildFrontmatter(task: Task): Record<string, unknown> {
	const frontmatter: Record<string, unknown> = {
		id: task.id,
		title: task.title,
		status: task.status,
	};

	// Optional fields - only include if they have values
	if (task.priority) {
		frontmatter.priority = task.priority;
	}

	if (task.assignee) {
		frontmatter.assignee = task.assignee;
	}

	// Always include labels and dependencies (even if empty arrays)
	frontmatter.labels = task.labels;
	frontmatter.dependencies = task.dependencies;

	if (task.dueDate) {
		frontmatter.dueDate = task.dueDate.toISOString();
	}

	// Always include timestamps as ISO strings
	frontmatter.createdAt = task.createdAt.toISOString();
	frontmatter.updatedAt = task.updatedAt.toISOString();

	return frontmatter;
}

/**
 * Serialize acceptance criteria to markdown format
 * Format: - [ ] #N text or - [x] #N text
 */
function serializeAcceptanceCriteria(criteria: AcceptanceCriterion[]): string {
	if (criteria.length === 0) {
		return "";
	}

	const lines = criteria.map((criterion) => {
		const checkbox = criterion.checked ? "[x]" : "[ ]";
		return `- ${checkbox} #${criterion.index} ${criterion.text}`;
	});

	return `${AC_BEGIN_MARKER}\n${lines.join("\n")}\n${AC_END_MARKER}`;
}

/** Serialized task text with the offsets where the serializer placed the notes. */
export interface SerializedTask {
	text: string;
	/**
	 * The notes section, from its heading to where the raw content begins (or
	 * the end of the text), including the separator before the raw content.
	 */
	notes?: { start: number; end: number };
}

interface BodyLayout {
	body: string;
	notesStart?: number;
	rawStart?: number;
}

/**
 * Build the markdown body content from Task sections
 *
 * Section order (matching the spec example):
 * 1. Description
 * 2. Implementation Plan
 * 3. Acceptance Criteria (AC markers)
 * 4. Implementation Notes (last section with ## header)
 * 5. Raw content
 *
 * Note: Implementation Notes is placed last because the parser's extractSection
 * captures content until the next ## header or end of content. AC markers don't
 * have headers, so they must come before Implementation Notes to parse correctly.
 */
function buildBodyContent(task: Task): BodyLayout {
	const sections: string[] = [];
	const layout: Omit<BodyLayout, "body"> = {};
	const offset = () =>
		sections.reduce((total, section) => total + section.length + 2, 0);

	// Description section
	if (task.description) {
		sections.push(`## Description\n\n${task.description}`);
	}

	// Implementation Plan section
	if (task.implementationPlan) {
		sections.push(`## Implementation Plan\n\n${task.implementationPlan}`);
	}

	// Acceptance Criteria (within markers) - placed before Implementation Notes
	// as shown in the spec example
	if (task.acceptanceCriteria.length > 0) {
		sections.push(serializeAcceptanceCriteria(task.acceptanceCriteria));
	}

	// Implementation Notes section (last ## section to avoid capturing AC markers)
	if (task.implementationNotes) {
		layout.notesStart = offset();
		sections.push(`## Implementation Notes\n\n${task.implementationNotes}`);
	}

	// Raw content at the end (if any)
	if (task.rawContent) {
		layout.rawStart = offset();
		sections.push(task.rawContent);
	}

	return { body: sections.join("\n\n"), ...layout };
}

// ============================================================================
// Main Serializer Function
// ============================================================================

/**
 * Serialize a Task object to a markdown string with YAML frontmatter
 *
 * @param task - The Task object to serialize
 * @returns A markdown string with YAML frontmatter
 *
 * @example
 * ```typescript
 * const task: Task = {
 *   id: "TASK-1",
 *   title: "Implement feature",
 *   status: "In Progress",
 *   priority: "high",
 *   labels: ["backend", "api"],
 *   dependencies: [],
 *   createdAt: new Date("2026-01-20T10:00:00.000Z"),
 *   updatedAt: new Date("2026-01-20T10:00:00.000Z"),
 *   description: "This is the description.",
 *   implementationPlan: "1. Step one\n2. Step two",
 *   acceptanceCriteria: [
 *     { index: 1, text: "Write tests", checked: false },
 *     { index: 2, text: "Implement logic", checked: true },
 *   ],
 *   implementationNotes: "Started work on this.",
 * };
 *
 * const markdown = serializeTask(task);
 * // Returns formatted markdown with YAML frontmatter
 * ```
 */
export function serializeTask(task: Task): string {
	return serializeTaskLayout(task).text;
}

/** Serialize a task and report where the notes section sits in the text. */
export function serializeTaskLayout(task: Task): SerializedTask {
	const frontmatter = buildFrontmatter(task);
	const { body, notesStart, rawStart } = buildBodyContent(task);

	// Pass a file object so gray-matter appends the body verbatim, never parsing it
	const serialized = matter.stringify({ content: body }, frontmatter);

	// Ensure there's a blank line between frontmatter and content
	// gray-matter.stringify adds content right after the closing ---
	// We want: ---\n\n## Description (with blank line)
	const text = serialized.replace(/^(---\n[\s\S]*?\n---)\n(?!\n)/, "$1\n\n");
	if (notesStart === undefined) return { text };

	// gray-matter ends the text with the body plus a newline if it lacked one
	const bodyStart = text.length - body.length - (body.endsWith("\n") ? 0 : 1);
	return {
		text,
		notes: {
			start: bodyStart + notesStart,
			end: rawStart === undefined ? text.length : bodyStart + rawStart,
		},
	};
}
