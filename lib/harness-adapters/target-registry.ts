import type {
	HarnessAssetAdapter,
	HarnessPackageCompatibility,
	HarnessTargetDescriptor,
	ImplementedHarnessTarget,
	ImplementedHarnessTargetId,
	MaterializedAssetKind,
} from "./types.ts";

const CLAUDE_SKILL_ADAPTER = {
	kind: "skill",
	directory: "skills",
	transform: "identity",
	supportedModes: ["copy", "link"],
	supportedLinkShapes: ["directory", "flat-skill", "generated-wrapper"],
} as const satisfies HarnessAssetAdapter;

const CODEX_SKILL_ADAPTER = {
	kind: "skill",
	directory: "skills",
	transform: "identity",
	supportedModes: ["copy", "link"],
	supportedLinkShapes: ["directory"],
} as const satisfies HarnessAssetAdapter;

interface DefinitionOnlyHarnessRegistryEntry {
	readonly status: "definition-only";
	readonly definitionKeys: readonly string[];
}

type HarnessRegistryEntry =
	| HarnessTargetDescriptor
	| DefinitionOnlyHarnessRegistryEntry;

const HARNESS_REGISTRY = [
	{
		id: "claude",
		status: "implemented",
		ownerDirectory: ".claude",
		adapters: [
			CLAUDE_SKILL_ADAPTER,
			{
				kind: "command",
				directory: "commands",
				transform: "claude-command",
				supportedModes: ["copy"],
				supportedLinkShapes: [],
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
		adapters: [CODEX_SKILL_ADAPTER],
		packageCompatibility: {
			canonicalDefinitionKey: "codex",
			definitionKeys: ["codex"],
			serializedTarget: "codex",
			packageIdSuffix: "codex",
		},
	},
	{
		status: "definition-only",
		definitionKeys: ["gemini-cli"],
	},
	{
		id: "open-code",
		status: "declared",
		adapters: [],
		definitionKeys: ["open-code"],
	},
] as const satisfies readonly HarnessRegistryEntry[];

const HARNESS_TARGETS: readonly HarnessTargetDescriptor[] =
	HARNESS_REGISTRY.filter((entry) => entry.status !== "definition-only");

type DefinitionKeyOf<T> = T extends {
	readonly packageCompatibility: {
		readonly definitionKeys: readonly (infer Key extends string)[];
	};
}
	? Key
	: T extends {
				readonly definitionKeys: readonly (infer Key extends string)[];
			}
		? Key
		: never;

export type HarnessPackageDefinitionKey = DefinitionKeyOf<
	(typeof HARNESS_REGISTRY)[number]
>;

type ImplementedRegistryEntry = Extract<
	(typeof HARNESS_REGISTRY)[number],
	{ readonly status: "implemented" }
>;

export type HarnessPackageTargetLabel =
	ImplementedRegistryEntry["packageCompatibility"]["serializedTarget"];

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
	value: unknown,
	kind?: MaterializedAssetKind,
): value is ImplementedHarnessTargetId {
	return (
		typeof value === "string" &&
		listImplementedHarnessTargetIds(kind).some((id) => id === value)
	);
}

/** Every known package-definition key, including syntax-only future targets. */
export function listHarnessPackageDefinitionKeys(): readonly HarnessPackageDefinitionKey[] {
	return HARNESS_REGISTRY.flatMap((entry) =>
		entry.status === "implemented"
			? entry.packageCompatibility.definitionKeys
			: entry.definitionKeys,
	);
}

export function isHarnessPackageDefinitionKey(
	value: unknown,
): value is HarnessPackageDefinitionKey {
	return (
		typeof value === "string" &&
		listHarnessPackageDefinitionKeys().some((key) => key === value)
	);
}

export function listHarnessPackageTargetLabels(): readonly HarnessPackageTargetLabel[] {
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

function implementedHarnessTargets(): readonly ImplementedHarnessTarget[] {
	return HARNESS_TARGETS.filter(
		(target): target is ImplementedHarnessTarget =>
			target.status === "implemented",
	);
}
