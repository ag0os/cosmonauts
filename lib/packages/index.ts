/**
 * Packages public API
 * Re-exports all package types and manifest utilities
 */

export type { CatalogEntry } from "./catalog.ts";
export { getBundledCatalog, resolveCatalogEntry } from "./catalog.ts";
export type { EjectOptions, EjectResult } from "./eject.ts";
export { ejectDomain } from "./eject.ts";
export type {
	DomainMergeResult,
	InstallOptions,
	InstallResult,
} from "./installer.ts";
export { installPackage, uninstallPackage } from "./installer.ts";
export { loadManifest, validateManifest } from "./manifest.ts";
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
