/**
 * Packages public API
 * Re-exports all package types and manifest utilities
 */

export { loadManifest, validateManifest } from "./manifest.ts";
export { installPackage, uninstallPackage } from "./installer.ts";
export type { DomainMergeResult, InstallOptions, InstallResult } from "./installer.ts";
export {
	listInstalledPackages,
	packageExists,
	resolveStorePath,
} from "./store.ts";
export type {
	DomainSource,
	InstalledPackage,
	ManifestValidationError,
	ManifestValidationResult,
	PackageManifest,
	PackageScope,
} from "./types.ts";
