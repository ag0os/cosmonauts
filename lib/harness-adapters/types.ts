/** Canonical identities understood by the harness registry. */
export type HarnessTargetId = "claude" | "codex" | "open-code";

/** Canonical targets with materialization adapters in this release. */
export type ImplementedHarnessTargetId = "claude" | "codex";

export type HarnessScope = "project" | "personal";
export type HarnessAssetKind = "skill" | "command" | "agent-package";
export type MaterializedAssetKind = "skill" | "command";
export type SyncMode = "copy" | "link";
export type SyncStatus =
	| "missing"
	| "current"
	| "source-ahead"
	| "locally-edited";

export type AssetOwnership =
	| { readonly kind: "project" }
	| { readonly kind: "authority"; readonly authorityId: "cosmonauts/core" };

export interface ScopeRoots {
	readonly projectRoot: string;
	readonly homeRoot: string;
}

/**
 * Stable source identity for an asset. `sourcePath` is always a source path,
 * never an exported owner-root path.
 */
export interface HarnessAsset {
	readonly assetId: string;
	readonly kind: MaterializedAssetKind;
	readonly ownership: AssetOwnership;
	readonly sourceRootId: string;
	readonly sourceRoot: string;
	readonly sourcePath: string;
	readonly logicalPath: string;
	readonly outputIdentity: string;
	readonly defaultScope: HarnessScope;
	readonly generatedInputs?: "cosmonauts-inventory";
}

export type HarnessTransform = "identity" | "claude-command";

export interface HarnessAssetAdapter {
	readonly kind: MaterializedAssetKind;
	readonly directory: string;
	readonly transform: HarnessTransform;
	readonly supportedModes: readonly SyncMode[];
}

export interface HarnessPackageCompatibility {
	readonly canonicalDefinitionKey: "claude" | "codex";
	readonly definitionKeys: readonly string[];
	readonly serializedTarget: "claude-cli" | "codex";
	readonly packageIdSuffix: "claude-cli" | "codex";
}

export interface ImplementedHarnessTarget {
	readonly id: ImplementedHarnessTargetId;
	readonly status: "implemented";
	readonly ownerDirectory: string;
	readonly adapters: readonly HarnessAssetAdapter[];
	readonly packageCompatibility: HarnessPackageCompatibility;
}

export interface DeclaredHarnessTarget {
	readonly id: Exclude<HarnessTargetId, ImplementedHarnessTargetId>;
	readonly status: "declared";
	readonly adapters: readonly [];
}

export type HarnessTargetDescriptor =
	| ImplementedHarnessTarget
	| DeclaredHarnessTarget;

export interface ResolvedHarnessTargetDirectory {
	readonly targetId: ImplementedHarnessTargetId;
	readonly scope: HarnessScope;
	readonly kind: MaterializedAssetKind;
	readonly ownerRoot: string;
	readonly targetDirectory: string;
	readonly transform: HarnessTransform;
	readonly supportedModes: readonly SyncMode[];
}

export interface ResolvedHarnessAssetTarget
	extends ResolvedHarnessTargetDirectory {
	readonly assetId: string;
	readonly targetPath: string;
	readonly requestedMode?: SyncMode;
}
