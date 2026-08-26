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
	/** Additional names reserved by one asset in the output collision namespace. */
	readonly reservedNames?: readonly string[];
}

export type SkillCandidateShape = "directory" | "flat-wrapper";

/** Plain export-discovery row; it carries no runtime or loader objects. */
export interface SkillCandidate {
	readonly name: string;
	readonly description: string;
	readonly domain: string;
	readonly dirPath: string;
	readonly sourceRootId: string;
	readonly sourceRoot: string;
	readonly sourcePath: string;
	readonly logicalPath: string;
	readonly outputIdentity: string;
	readonly flatteningRule: "frontmatter-name";
	readonly targetShape: SkillCandidateShape;
}

export type SourceHealthIssueKind =
	| "availability"
	| "read"
	| "permission"
	| "io"
	| "parse";

export interface SourceHealthIssue {
	readonly kind: SourceHealthIssueKind;
	readonly path: string;
	readonly message: string;
	readonly code?: string;
}

/** Health for one declared discovery root. */
export interface SourceHealthRow {
	readonly sourceRootId: string;
	readonly sourceRoot: string;
	readonly domain: string;
	readonly status: "complete" | "incomplete";
	readonly issues: readonly SourceHealthIssue[];
}

export interface ChainInventoryRow {
	readonly name: string;
	readonly description: string;
	readonly expression: string;
}

export interface SkillInventoryRow {
	readonly name: string;
	readonly domain: string;
	readonly description: string;
}

export interface HarnessPathRow {
	readonly target: ImplementedHarnessTargetId;
	readonly kind: MaterializedAssetKind;
	readonly project: string;
	readonly personal: string;
}

export interface RuntimeInventorySnapshot {
	readonly chains: readonly ChainInventoryRow[];
	readonly effectiveSkills: readonly SkillInventoryRow[];
	readonly candidates: readonly SkillCandidate[];
	readonly sourceHealth: readonly SourceHealthRow[];
	readonly paths: readonly HarnessPathRow[];
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
