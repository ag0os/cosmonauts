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
// Package Domain
// ============================================================================

/**
 * A single domain entry declared in a package manifest.
 * The path is relative to the package root directory.
 */
export interface PackageDomain {
	/** Domain identifier (e.g., "coding", "devops") */
	name: string;
	/** Relative path within the package to the domain directory */
	path: string;
}

// ============================================================================
// Domain Source
// ============================================================================

/**
 * A resolved directory containing domain subdirectories, with origin tracking.
 * Produced by the package scanner and consumed by the domain loader.
 */
export interface DomainSource {
	/** Absolute path to the directory containing domain subdirectories. */
	domainsDir: string;
	/** Human-readable origin label for diagnostics (e.g. "builtin", "global:@org/pkg"). */
	origin: string;
	/** Precedence tier — lower number = lower precedence. Built-in=0, global=1, local=2, plugin=3. */
	precedence: number;
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
	domains: PackageDomain[];
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
