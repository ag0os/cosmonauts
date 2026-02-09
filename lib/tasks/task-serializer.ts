/**
 * Task serializer for forge-tasks
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
function buildBodyContent(task: Task): string {
	const sections: string[] = [];

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
		sections.push(`## Implementation Notes\n\n${task.implementationNotes}`);
	}

	// Raw content at the end (if any)
	if (task.rawContent) {
		sections.push(task.rawContent);
	}

	return sections.join("\n\n");
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
	const frontmatter = buildFrontmatter(task);
	const bodyContent = buildBodyContent(task);

	// Use gray-matter to stringify with frontmatter
	const serialized = matter.stringify(bodyContent, frontmatter);

	// Ensure there's a blank line between frontmatter and content
	// gray-matter.stringify adds content right after the closing ---
	// We want: ---\n\n## Description (with blank line)
	return serialized.replace(/^(---\n[\s\S]*?\n---)\n(?!\n)/, "$1\n\n");
}
