import type {
	HarnessAsset,
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
