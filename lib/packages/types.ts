/**
 * Core type definitions for the package system
 */

// ============================================================================
// Package Scope
// ============================================================================

/**
 * Installation scope for a package.
 * - "user": installed globally for the current user
 * - "project": installed locally within a project
 */
export type PackageScope = "user" | "project";

// ============================================================================
// Domain Source
// ============================================================================

/**
 * Describes a domain contributed by a package.
 * The path is relative to the package root directory.
 */
export interface DomainSource {
	/** Domain identifier (e.g., "coding", "devops") */
	name: string;
	/** Relative path within the package to the domain directory */
	path: string;
}

// ============================================================================
// Package Manifest
// ============================================================================

/**
 * Parsed representation of a cosmonauts.json manifest file.
 * All required fields are present and validated.
 */
export interface PackageManifest {
	/** Package name — lowercase alphanumeric with hyphens/underscores, optionally scoped (@org/name) */
	name: string;
	/** Semantic version string (e.g., "1.0.0") */
	version: string;
	/** Human-readable description of the package */
	description: string;
	/** Domains provided by this package */
	domains: DomainSource[];
}

// ============================================================================
// Installed Package
// ============================================================================

/**
 * A package manifest combined with installation metadata.
 */
export interface InstalledPackage {
	/** Parsed and validated manifest */
	manifest: PackageManifest;
	/** Absolute path to the package installation directory */
	installPath: string;
	/** Whether installed globally (user) or locally (project) */
	scope: PackageScope;
	/** Timestamp when the package was installed */
	installedAt: Date;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * A typed validation error for a specific manifest field.
 */
export type ManifestValidationError =
	| { field: "name"; reason: "missing" | "invalid-format" }
	| { field: "version"; reason: "missing" }
	| { field: "description"; reason: "missing" }
	| { field: "domains"; reason: "missing" | "empty" | "invalid-entry" };

/**
 * Result of validating a raw manifest object.
 */
export type ManifestValidationResult =
	| { valid: true; manifest: PackageManifest }
	| { valid: false; errors: ManifestValidationError[] };
