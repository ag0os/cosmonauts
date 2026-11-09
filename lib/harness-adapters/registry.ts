import { join } from "node:path";
import { getHarnessTarget } from "./target-registry.ts";
import type {
	HarnessAsset,
	HarnessAssetAdapter,
	HarnessScope,
	HarnessTargetId,
	ImplementedHarnessTarget,
	MaterializedAssetKind,
	ResolvedHarnessAssetTarget,
	ResolvedHarnessTargetDirectory,
	ScopeRoots,
	SyncMode,
} from "./types.ts";

export * from "./target-registry.ts";

interface RuntimeSkillDescriptorOptions {
	readonly name: string;
	readonly sourceRootId: string;
	readonly sourceRoot: string;
	readonly sourcePath: string;
	readonly logicalPath: string;
}

interface ResolveHarnessTargetDirectoryOptions {
	readonly targetId: HarnessTargetId;
	readonly scope: HarnessScope;
	readonly kind: MaterializedAssetKind;
	readonly roots: ScopeRoots;
}

interface ResolveHarnessAssetTargetOptions {
	readonly targetId: HarnessTargetId;
	readonly asset: HarnessAsset;
	readonly roots: ScopeRoots;
	readonly scope?: HarnessScope;
	readonly requestedMode?: SyncMode;
}

export function createRuntimeSkillDescriptor(
	options: RuntimeSkillDescriptorOptions,
): HarnessAsset {
	return {
		assetId: `skill:${options.name}`,
		kind: "skill",
		ownership: { kind: "project" },
		sourceRootId: options.sourceRootId,
		sourceRoot: options.sourceRoot,
		sourcePath: options.sourcePath,
		logicalPath: options.logicalPath,
		outputIdentity: options.name,
		defaultScope: "project",
	};
}

export function resolveHarnessTargetDirectory(
	options: ResolveHarnessTargetDirectoryOptions,
): ResolvedHarnessTargetDirectory {
	const target = requireImplementedTarget(options.targetId);
	const adapter = requireAdapter(target, options.kind);
	const base =
		options.scope === "personal"
			? options.roots.homeRoot
			: options.roots.projectRoot;
	const ownerRoot = join(base, target.ownerDirectory);

	return {
		targetId: target.id,
		scope: options.scope,
		kind: adapter.kind,
		ownerRoot,
		targetDirectory: join(ownerRoot, adapter.directory),
		transform: adapter.transform,
		supportedModes: adapter.supportedModes,
		supportedLinkShapes: adapter.supportedLinkShapes,
	};
}

export function resolveHarnessAssetTarget(
	options: ResolveHarnessAssetTargetOptions,
): ResolvedHarnessAssetTarget {
	const target = requireImplementedTarget(options.targetId);
	const adapter = requireAdapter(target, options.asset.kind);
	assertSupportedMode(options.asset, adapter, options.requestedMode);
	const resolved = resolveHarnessTargetDirectory({
		targetId: target.id,
		scope: options.scope ?? options.asset.defaultScope,
		kind: options.asset.kind,
		roots: options.roots,
	});

	return {
		...resolved,
		assetId: options.asset.assetId,
		targetPath: join(resolved.targetDirectory, options.asset.outputIdentity),
		...(options.requestedMode ? { requestedMode: options.requestedMode } : {}),
	};
}

function requireImplementedTarget(
	targetId: HarnessTargetId,
): ImplementedHarnessTarget {
	const target = getHarnessTarget(targetId);
	if (!target) {
		throw new Error(`Harness target "${targetId}" is not registered.`);
	}
	if (target.status !== "implemented") {
		throw new Error(
			`Harness target "${targetId}" is declared but unimplemented.`,
		);
	}
	return target;
}

function requireAdapter(
	target: ImplementedHarnessTarget,
	kind: MaterializedAssetKind,
): HarnessAssetAdapter {
	const adapter = target.adapters.find((candidate) => candidate.kind === kind);
	if (!adapter) {
		throw new Error(
			`Harness target "${target.id}" does not support asset kind "${kind}".`,
		);
	}
	return adapter;
}

function assertSupportedMode(
	asset: HarnessAsset,
	adapter: HarnessAssetAdapter,
	requestedMode: SyncMode | undefined,
): void {
	if (!requestedMode) return;
	if (!adapter.supportedModes.includes(requestedMode)) {
		const noun = adapter.supportedModes.length === 1 ? "mode" : "modes";
		throw new Error(
			`Asset "${asset.assetId}" does not support requested mode "${requestedMode}"; supported ${noun}: ${adapter.supportedModes.join(", ")}.`,
		);
	}
	if (
		requestedMode === "link" &&
		(isNonPathSource(asset.sourceRoot) || isNonPathSource(asset.sourcePath))
	) {
		throw new Error(
			`Asset "${asset.assetId}" cannot use link mode because links require a local filesystem source path.`,
		);
	}
}

function isNonPathSource(value: string): boolean {
	return /^(?:[a-z][a-z0-9+.-]*:|git@)/i.test(value);
}
