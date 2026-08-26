import type { GeneratedHarnessNode } from "./render.ts";
import { GENERATED_BY_MARKER } from "./render.ts";
import type {
	HarnessAsset,
	HarnessPathRow,
	RuntimeInventorySnapshot,
	SkillCandidate,
	SkillCandidateShape,
	SourceHealthRow,
} from "./types.ts";

/** Nested frontmatter names owned by the one external bundle asset. */
export const COSMONAUTS_BUNDLE_RESERVED_NAMES = [
	"cosmonauts",
	"cosmonauts-chains",
	"cosmonauts-plans",
	"cosmonauts-skills",
	"cosmonauts-tasks",
] as const;

export const COSMONAUTS_GENERATED_INVENTORY_PATH =
	"references/generated-inventory.md" as const;

const MATERIALIZED_PATH_KEYS = [
	"claude:command",
	"claude:skill",
	"codex:skill",
] as const;

interface RenderableCosmonautsInventory {
	readonly chains: RuntimeInventorySnapshot["chains"];
	readonly effectiveSkills: RuntimeInventorySnapshot["effectiveSkills"];
	readonly paths: readonly HarnessPathRow[];
}

/** Render the stable external bundle's only generated file as exact bytes. */
export function renderCosmonautsInventory(
	snapshot: RenderableCosmonautsInventory,
): Buffer {
	const inventory = normalizeCosmonautsInventory(snapshot);
	const lines = [
		GENERATED_BY_MARKER.toString("utf8").trimEnd(),
		"# Generated Cosmonauts Inventory",
		"",
		"## Named chains",
		"",
		"| Name | Description | Expression |",
		"|---|---|---|",
		...inventory.chains.map(
			(row) =>
				`| ${codeCell(row.name)} | ${textCell(row.description)} | ${codeCell(row.expression)} |`,
		),
		"",
		"## Skills",
		"",
		"| Name | Domain | Description |",
		"|---|---|---|",
		...inventory.effectiveSkills.map(
			(row) =>
				`| ${codeCell(row.name)} | ${codeCell(row.domain)} | ${textCell(row.description)} |`,
		),
		"",
		"## Harness paths",
		"",
		"| Target | Kind | Project | Personal |",
		"|---|---|---|---|",
		...inventory.paths.map(
			(row) =>
				`| ${codeCell(row.target)} | ${codeCell(row.kind)} | ${codeCell(row.project)} | ${codeCell(row.personal)} |`,
		),
		"",
	];
	return Buffer.from(lines.join("\n"));
}

/**
 * Preserve raw live facts separately from rendered bytes so either a schema
 * input change or a renderer change advances generated-wrapper provenance.
 */
export function createCosmonautsInventoryGeneratedNode(
	snapshot: RenderableCosmonautsInventory,
): GeneratedHarnessNode {
	const normalized = normalizeCosmonautsInventory(snapshot);
	return {
		relativePath: COSMONAUTS_GENERATED_INVENTORY_PATH,
		inputBytes: Buffer.from(JSON.stringify(normalized)),
		renderedBytes: renderCosmonautsInventory(normalized),
	};
}

function normalizeCosmonautsInventory(
	snapshot: RenderableCosmonautsInventory,
): RenderableCosmonautsInventory {
	return {
		chains: [...snapshot.chains].sort(
			(left, right) =>
				compareText(left.name, right.name) ||
				compareText(left.description, right.description) ||
				compareText(left.expression, right.expression),
		),
		effectiveSkills: [...snapshot.effectiveSkills].sort(
			(left, right) =>
				compareText(left.name, right.name) ||
				compareText(left.domain, right.domain) ||
				compareText(left.description, right.description),
		),
		paths: selectMaterializedPaths(snapshot.paths),
	};
}

function selectMaterializedPaths(
	paths: RenderableCosmonautsInventory["paths"],
): HarnessPathRow[] {
	const byKey = new Map<string, HarnessPathRow>();
	for (const row of paths) {
		const key = `${row.target}:${row.kind}`;
		if (!(MATERIALIZED_PATH_KEYS as readonly string[]).includes(key)) continue;
		if (byKey.has(key)) {
			throw new Error(`Duplicate materialized harness path row: ${key}.`);
		}
		byKey.set(key, row);
	}
	return MATERIALIZED_PATH_KEYS.map((key) => {
		const row = byKey.get(key);
		if (!row) throw new Error(`Missing materialized harness path row: ${key}.`);
		return row;
	});
}

function codeCell(value: string): string {
	return `\`${escapeInventoryCell(value)}\``;
}

function textCell(value: string): string {
	return escapeInventoryCell(value);
}

function escapeInventoryCell(value: string): string {
	let escaped = "";
	for (const character of value) {
		const codePoint = character.codePointAt(0);
		if (codePoint === undefined) continue;
		switch (character) {
			case "\\":
				escaped += "\\\\";
				break;
			case "|":
				escaped += "\\|";
				break;
			case "`":
				escaped += "\\`";
				break;
			case "\b":
				escaped += "\\b";
				break;
			case "\f":
				escaped += "\\f";
				break;
			case "\n":
				escaped += "\\n";
				break;
			case "\r":
				escaped += "\\r";
				break;
			case "\t":
				escaped += "\\t";
				break;
			default:
				escaped += isControlCodePoint(codePoint)
					? `\\u${codePoint.toString(16).padStart(4, "0")}`
					: character;
		}
	}
	return escaped;
}

function isControlCodePoint(codePoint: number): boolean {
	return (
		(codePoint >= 0 && codePoint <= 0x1f) ||
		(codePoint >= 0x7f && codePoint <= 0x9f) ||
		codePoint === 0x2028 ||
		codePoint === 0x2029
	);
}

function compareText(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

export interface PreparedSkillAsset extends HarnessAsset {
	readonly domain?: string;
	readonly flatteningRule?: "frontmatter-name";
	readonly targetShape?: SkillCandidateShape;
}

export interface SkillOutputClaim {
	readonly assetId: string;
	readonly domain?: string;
	readonly logicalPath: string;
	readonly claimKind: "output" | "reserved-name";
}

export interface SkillOutputCollision {
	readonly outputIdentity: string;
	readonly claims: readonly SkillOutputClaim[];
}

export interface PrepareSkillExportAssetsOptions {
	readonly candidates: readonly SkillCandidate[];
	readonly sourceHealth: readonly Pick<
		SourceHealthRow,
		"sourceRootId" | "status"
	>[];
	readonly staticAssets?: readonly HarnessAsset[];
}

export interface PreparedSkillExportInventory {
	readonly assets: readonly PreparedSkillAsset[];
	readonly collisions: readonly SkillOutputCollision[];
	readonly sourceHealth: PrepareSkillExportAssetsOptions["sourceHealth"];
	readonly reconciliationAuthority:
		| "authorized"
		| "blocked-incomplete-discovery"
		| "blocked-collision";
	readonly canReconcile: boolean;
}

/**
 * Reduce strict plain discovery rows into export assets. This function plans no
 * target or manifest writes; callers must require `canReconcile` before they
 * hand the result to any transaction planner.
 */
export function prepareSkillExportAssets(
	options: PrepareSkillExportAssetsOptions,
): PreparedSkillExportInventory {
	const candidates = collapseRuntimeOverrides(options.candidates);
	const candidateAssets = candidates.map(candidateToAsset);
	const staticAssets = (options.staticAssets ?? []).filter(
		(asset) => asset.kind === "skill",
	);
	const assets = [...candidateAssets, ...staticAssets];
	const collisions = findOutputCollisions(assets);

	const completeRoots = new Set(
		options.sourceHealth
			.filter((row) => row.status === "complete")
			.map((row) => row.sourceRootId),
	);
	const discoveryComplete =
		options.sourceHealth.every((row) => row.status === "complete") &&
		candidates.every((candidate) => completeRoots.has(candidate.sourceRootId));
	const reconciliationAuthority = !discoveryComplete
		? "blocked-incomplete-discovery"
		: collisions.length > 0
			? "blocked-collision"
			: "authorized";

	return {
		assets,
		collisions,
		sourceHealth: options.sourceHealth,
		reconciliationAuthority,
		canReconcile: reconciliationAuthority === "authorized",
	};
}

function collapseRuntimeOverrides(
	candidates: readonly SkillCandidate[],
): readonly SkillCandidate[] {
	const seen = new Set<string>();
	const effective: SkillCandidate[] = [];
	for (const candidate of candidates) {
		const overrideIdentity = JSON.stringify([
			candidate.domain,
			candidate.logicalPath,
		]);
		if (seen.has(overrideIdentity)) continue;
		seen.add(overrideIdentity);
		effective.push(candidate);
	}
	return effective;
}

function candidateToAsset(candidate: SkillCandidate): PreparedSkillAsset {
	return {
		assetId: `skill:${candidate.domain}/${candidate.logicalPath}`,
		kind: "skill",
		ownership: { kind: "project" },
		sourceRootId: candidate.sourceRootId,
		sourceRoot: candidate.sourceRoot,
		sourcePath: candidate.sourcePath,
		logicalPath: candidate.logicalPath,
		outputIdentity: candidate.outputIdentity,
		defaultScope: "project",
		domain: candidate.domain,
		flatteningRule: "frontmatter-name",
		targetShape: candidate.targetShape ?? "directory",
	};
}

function findOutputCollisions(
	assets: readonly PreparedSkillAsset[],
): readonly SkillOutputCollision[] {
	const claimsByName = new Map<string, SkillOutputClaim[]>();
	for (const asset of assets) {
		addClaim(claimsByName, asset.outputIdentity, {
			assetId: asset.assetId,
			...(asset.domain ? { domain: asset.domain } : {}),
			logicalPath: asset.logicalPath,
			claimKind: "output",
		});
		for (const reservedName of asset.reservedNames ?? []) {
			addClaim(claimsByName, reservedName, {
				assetId: asset.assetId,
				...(asset.domain ? { domain: asset.domain } : {}),
				logicalPath: asset.logicalPath,
				claimKind: "reserved-name",
			});
		}
	}

	const collisions: SkillOutputCollision[] = [];
	for (const [outputIdentity, claims] of claimsByName) {
		const distinctAssets = new Set(claims.map((claim) => claim.assetId));
		if (distinctAssets.size < 2) continue;
		collisions.push({ outputIdentity, claims });
	}
	return collisions.sort((left, right) =>
		left.outputIdentity.localeCompare(right.outputIdentity),
	);
}

function addClaim(
	claimsByName: Map<string, SkillOutputClaim[]>,
	outputIdentity: string,
	claim: SkillOutputClaim,
): void {
	const claims = claimsByName.get(outputIdentity) ?? [];
	if (
		claims.some(
			(existing) =>
				existing.assetId === claim.assetId &&
				existing.claimKind === claim.claimKind,
		)
	) {
		return;
	}
	claims.push(claim);
	claimsByName.set(outputIdentity, claims);
}
