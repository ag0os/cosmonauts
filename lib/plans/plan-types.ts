/**
 * Core type definitions for forge-plans
 * Plan management types for the Cosmonauts project
 */

// ============================================================================
// Enums and Type Aliases
// ============================================================================

/**
 * Plan status values representing lifecycle states
 */
export type PlanStatus = "active" | "completed";

// ============================================================================
// Core Interfaces
// ============================================================================

/**
 * Main Plan interface representing a plan in the system
 */
export interface Plan {
	/** Directory name slug, e.g. "auth-system" */
	slug: string;
	/** Human-readable plan title */
	title: string;
	/** Current lifecycle status */
	status: PlanStatus;
	/** Timestamp when plan was created */
	createdAt: Date;
	/** Timestamp when plan was last updated */
	updatedAt: Date;
	/** Raw markdown body from plan.md */
	body: string;
	/** Raw markdown body from spec.md, if it exists */
	spec?: string;
}

// ============================================================================
// Input Interfaces
// ============================================================================

/**
 * Input for creating a new plan
 * slug and title are required; other fields are optional
 */
export interface PlanCreateInput {
	/** Directory name slug, e.g. "auth-system" */
	slug: string;
	/** Human-readable plan title */
	title: string;
	/** Optional description that becomes the body of plan.md */
	description?: string;
	/** If provided, creates spec.md with this content */
	spec?: string;
}

/**
 * Input for updating an existing plan
 * All fields are optional; only provided fields will be updated
 */
export interface PlanUpdateInput {
	/** Update title */
	title?: string;
	/** Update status */
	status?: PlanStatus;
}

// ============================================================================
// Summary Interfaces
// ============================================================================

/**
 * Plan summary with associated task count
 */
export interface PlanSummary {
	/** Directory name slug */
	slug: string;
	/** Human-readable plan title */
	title: string;
	/** Current lifecycle status */
	status: PlanStatus;
	/** Timestamp when plan was created */
	createdAt: Date;
	/** Timestamp when plan was last updated */
	updatedAt: Date;
	/** Count of tasks with plan:<slug> label */
	taskCount: number;
}
