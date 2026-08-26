import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { COSMONAUTS_BUNDLE_RESERVED_NAMES } from "./inventory.ts";
import type {
	HarnessAsset,
	HarnessAssetAdapter,
	HarnessPackageCompatibility,
	HarnessScope,
	HarnessTargetDescriptor,
	HarnessTargetId,
	ImplementedHarnessTarget,
	ImplementedHarnessTargetId,
	MaterializedAssetKind,
	ResolvedHarnessAssetTarget,
	ResolvedHarnessTargetDirectory,
	ScopeRoots,
	SyncMode,
} from "./types.ts";

const SKILL_ADAPTER = {
	kind: "skill",
	directory: "skills",
	transform: "identity",
	supportedModes: ["copy", "link"],
} as const satisfies HarnessAssetAdapter;

const PACKAGE_ROOT = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
);

const HARNESS_TARGETS: readonly HarnessTargetDescriptor[] = [
	{
		id: "claude",
		status: "implemented",
		ownerDirectory: ".claude",
		adapters: [
			SKILL_ADAPTER,
			{
				kind: "command",
				directory: "commands",
				transform: "claude-command",
				supportedModes: ["copy"],
			},
		],
		packageCompatibility: {
			canonicalDefinitionKey: "claude",
			definitionKeys: ["claude", "claude-cli"],
			serializedTarget: "claude-cli",
			packageIdSuffix: "claude-cli",
		},
	},
	{
		id: "codex",
		status: "implemented",
		ownerDirectory: ".agents",
		adapters: [SKILL_ADAPTER],
		packageCompatibility: {
			canonicalDefinitionKey: "codex",
			definitionKeys: ["codex"],
			serializedTarget: "codex",
			packageIdSuffix: "codex",
		},
	},
	{
		id: "open-code",
		status: "declared",
		adapters: [],
	},
];

const STATIC_HARNESS_ASSETS = [
	{
		assetId: "external-skill:cosmonauts",
		kind: "skill",
		ownership: { kind: "authority", authorityId: "cosmonauts/core" },
		sourceRootId: "cosmonauts:package",
		sourceRoot: PACKAGE_ROOT,
		sourcePath: "external-skills/cosmonauts",
		logicalPath: "external-skills/cosmonauts",
		outputIdentity: "cosmonauts",
		defaultScope: "personal",
		generatedInputs: "cosmonauts-inventory",
		reservedNames: COSMONAUTS_BUNDLE_RESERVED_NAMES,
	},
	{
		assetId: "command:spec-to-backlog",
		kind: "command",
		ownership: { kind: "authority", authorityId: "cosmonauts/core" },
		sourceRootId: "cosmonauts:package",
		sourceRoot: PACKAGE_ROOT,
		sourcePath: "external-commands/spec-to-backlog.md",
		logicalPath: "spec-to-backlog.md",
		outputIdentity: "spec-to-backlog.md",
		defaultScope: "personal",
	},
	{
		assetId: "command:implement-plan",
		kind: "command",
		ownership: { kind: "authority", authorityId: "cosmonauts/core" },
		sourceRootId: "cosmonauts:package",
		sourceRoot: PACKAGE_ROOT,
		sourcePath: "external-commands/implement-plan.md",
		logicalPath: "implement-plan.md",
		outputIdentity: "implement-plan.md",
		defaultScope: "personal",
	},
] as const satisfies readonly HarnessAsset[];

export interface RuntimeSkillDescriptorOptions {
	readonly name: string;
	readonly sourceRootId: string;
	readonly sourceRoot: string;
	readonly sourcePath: string;
	readonly logicalPath: string;
}

export interface ResolveHarnessTargetDirectoryOptions {
	readonly targetId: HarnessTargetId;
	readonly scope: HarnessScope;
	readonly kind: MaterializedAssetKind;
	readonly roots: ScopeRoots;
}

export interface ResolveHarnessAssetTargetOptions {
	readonly targetId: HarnessTargetId;
	readonly asset: HarnessAsset;
	readonly roots: ScopeRoots;
	readonly scope?: HarnessScope;
	readonly requestedMode?: SyncMode;
}

export interface ResolveHarnessPackageDefinitionTargetOptions<
	T extends object,
> {
	readonly definitionId: string;
	readonly targets: Readonly<Partial<Record<string, T>>>;
	readonly target: string;
}

export interface ResolvedHarnessPackageDefinitionTarget<T extends object> {
	readonly targetId: ImplementedHarnessTargetId;
	readonly definitionKey: string;
	readonly serializedTarget: HarnessPackageCompatibility["serializedTarget"];
	readonly packageIdSuffix: HarnessPackageCompatibility["packageIdSuffix"];
	readonly targetOptions: T;
}

export function listHarnessTargets(): readonly HarnessTargetDescriptor[] {
	return HARNESS_TARGETS;
}

export function getHarnessTarget(
	targetId: string,
): HarnessTargetDescriptor | undefined {
	return HARNESS_TARGETS.find(({ id }) => id === targetId);
}

export function listImplementedHarnessTargetIds(
	kind?: MaterializedAssetKind,
): readonly ImplementedHarnessTargetId[] {
	return HARNESS_TARGETS.filter(
		(target): target is ImplementedHarnessTarget =>
			target.status === "implemented" &&
			(kind === undefined ||
				target.adapters.some((adapter) => adapter.kind === kind)),
	).map(({ id }) => id);
}

export function isImplementedHarnessTargetId(
	value: string,
	kind?: MaterializedAssetKind,
): value is ImplementedHarnessTargetId {
	return listImplementedHarnessTargetIds(kind).some((id) => id === value);
}

export function listHarnessPackageTargetLabels(): readonly HarnessPackageCompatibility["serializedTarget"][] {
	return implementedHarnessTargets().map(
		({ packageCompatibility }) => packageCompatibility.serializedTarget,
	);
}

export function getHarnessPackageTarget(
	serializedTarget: string,
): ImplementedHarnessTarget | undefined {
	return implementedHarnessTargets().find(
		({ packageCompatibility }) =>
			packageCompatibility.serializedTarget === serializedTarget,
	);
}

export function resolveHarnessPackageDefinitionTarget<T extends object>(
	options: ResolveHarnessPackageDefinitionTargetOptions<T>,
): ResolvedHarnessPackageDefinitionTarget<T> {
	const target = getHarnessPackageTarget(options.target);
	if (!target) {
		throw new Error(
			`Harness package target "${options.target}" is not registered.`,
		);
	}

	const { packageCompatibility } = target;
	const matchingKeys = packageCompatibility.definitionKeys.filter((key) =>
		Object.hasOwn(options.targets, key),
	);
	if (matchingKeys.length > 1) {
		throw new Error(
			`ambiguous-package-target: Agent package definition "${options.definitionId}" declares multiple keys for target "${packageCompatibility.serializedTarget}": ${matchingKeys.join(", ")}. Declare exactly one.`,
		);
	}

	const definitionKey = matchingKeys[0];
	if (!definitionKey) {
		throw new Error(
			`Agent package definition "${options.definitionId}" does not declare target "${packageCompatibility.serializedTarget}". Add targets.${packageCompatibility.canonicalDefinitionKey} after reviewing the package for that runtime.`,
		);
	}
	const targetOptions = options.targets[definitionKey];
	if (!targetOptions) {
		throw new Error(
			`Agent package definition "${options.definitionId}" does not declare target "${packageCompatibility.serializedTarget}". Add targets.${packageCompatibility.canonicalDefinitionKey} after reviewing the package for that runtime.`,
		);
	}

	return {
		targetId: target.id,
		definitionKey,
		serializedTarget: packageCompatibility.serializedTarget,
		packageIdSuffix: packageCompatibility.packageIdSuffix,
		targetOptions,
	};
}

export function listStaticHarnessAssets(): readonly HarnessAsset[] {
	return STATIC_HARNESS_ASSETS;
}

export function getStaticHarnessAsset(
	assetId: string,
): HarnessAsset | undefined {
	return STATIC_HARNESS_ASSETS.find((asset) => asset.assetId === assetId);
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

function implementedHarnessTargets(): readonly ImplementedHarnessTarget[] {
	return HARNESS_TARGETS.filter(
		(target): target is ImplementedHarnessTarget =>
			target.status === "implemented",
	);
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
