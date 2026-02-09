/**
 * Core type definitions for forge-tasks
 * Task management types for the Claude Forge project
 */

// ============================================================================
// Enums and Type Aliases
// ============================================================================

/**
 * Task status values representing workflow states
 */
export type TaskStatus = "To Do" | "In Progress" | "Done" | "Blocked";

/**
 * Task priority levels
 */
export type TaskPriority = "high" | "medium" | "low";

// ============================================================================
// Core Interfaces
// ============================================================================

/**
 * Structured acceptance criterion with index, text, and completion state
 */
export interface AcceptanceCriterion {
	/** 1-based index of the criterion */
	index: number;
	/** Text description of the criterion */
	text: string;
	/** Whether the criterion has been met */
	checked: boolean;
}

/**
 * Main Task interface representing a task in the system
 */
export interface Task {
	/** Unique identifier (e.g., "TASK-001") */
	id: string;
	/** Task title/summary */
	title: string;
	/** Current workflow status */
	status: TaskStatus;
	/** Optional priority level */
	priority?: TaskPriority;
	/** Optional assignee identifier */
	assignee?: string;
	/** Timestamp when task was created */
	createdAt: Date;
	/** Timestamp when task was last updated */
	updatedAt: Date;
	/** Optional due date */
	dueDate?: Date;
	/** Labels/tags for categorization */
	labels: string[];
	/** IDs of tasks this task depends on */
	dependencies: string[];
	/** Detailed task description */
	description?: string;
	/** Implementation plan/approach */
	implementationPlan?: string;
	/** Notes from implementation */
	implementationNotes?: string;
	/** Structured acceptance criteria */
	acceptanceCriteria: AcceptanceCriterion[];
	/** Raw markdown content (read-only, for serialization) */
	rawContent?: string;
}

// ============================================================================
// Input Interfaces
// ============================================================================

/**
 * Input for creating a new task
 * Only title is required; other fields have sensible defaults
 */
export interface TaskCreateInput {
	/** Task title (required) */
	title: string;
	/** Optional description */
	description?: string;
	/** Optional priority (defaults to config default or undefined) */
	priority?: TaskPriority;
	/** Optional assignee */
	assignee?: string;
	/** Optional due date */
	dueDate?: Date;
	/** Optional labels */
	labels?: string[];
	/** Optional dependency task IDs */
	dependencies?: string[];
	/** Optional acceptance criteria as strings (will be converted to AcceptanceCriterion) */
	acceptanceCriteria?: string[];
	/** Optional parent task ID for subtasks */
	parent?: string;
}

/**
 * Input for updating an existing task
 * All fields are optional; only provided fields will be updated
 */
export interface TaskUpdateInput {
	/** Update title */
	title?: string;
	/** Update status */
	status?: TaskStatus;
	/** Update priority */
	priority?: TaskPriority;
	/** Update assignee */
	assignee?: string;
	/** Update due date */
	dueDate?: Date;
	/** Replace all labels */
	labels?: string[];
	/** Replace all dependencies */
	dependencies?: string[];
	/** Update description */
	description?: string;
	/** Update implementation plan */
	implementationPlan?: string;
	/** Update implementation notes */
	implementationNotes?: string;
	/** Replace all acceptance criteria */
	acceptanceCriteria?: AcceptanceCriterion[];
}

// ============================================================================
// Filter and Query Interfaces
// ============================================================================

/**
 * Filter options for listing tasks
 */
export interface TaskListFilter {
	/** Filter by status (single or multiple) */
	status?: TaskStatus | TaskStatus[];
	/** Filter by priority (single or multiple) */
	priority?: TaskPriority | TaskPriority[];
	/** Filter by assignee */
	assignee?: string;
	/** Filter by label (tasks must have this label) */
	label?: string;
	/** Filter to tasks with no dependencies (ready to work on) */
	hasNoDependencies?: boolean;
}

// ============================================================================
// Configuration Interfaces
// ============================================================================

/**
 * Configuration for forge-tasks system
 */
export interface ForgeTasksConfig {
	/** Optional project name for display */
	projectName?: string;
	/** Prefix for task IDs (default: "TASK") */
	prefix: string;
	/** Number of digits for zero-padded IDs (e.g., 3 = "001") */
	zeroPadding?: number;
	/** Default priority for new tasks */
	defaultPriority?: TaskPriority;
	/** Default labels to apply to new tasks */
	defaultLabels?: string[];
	/** Last used ID number (persisted to survive archiving tasks) */
	lastIdNumber?: number;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: ForgeTasksConfig = {
	prefix: "TASK",
	zeroPadding: 3,
};
