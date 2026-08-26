import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import type { HarnessAsset, OwnerIdentity } from "./types.ts";

/**
 * Derive ownership from declared authority or the canonical project root.
 * Catalogue/package location is intentionally not part of either identity.
 */
export async function resolveAssetOwnerIdentity(
	asset: Pick<HarnessAsset, "ownership">,
	projectRoot: string,
): Promise<OwnerIdentity> {
	if (asset.ownership.kind === "authority") {
		return {
			kind: "authority",
			ownerId: `authority:${asset.ownership.authorityId}`,
			authorityId: asset.ownership.authorityId,
		};
	}

	const canonicalProjectRoot = await realpath(projectRoot);
	const digest = createHash("sha256")
		.update(canonicalProjectRoot)
		.digest("hex");
	return {
		kind: "project",
		ownerId: `project:${digest}`,
		projectRoot: canonicalProjectRoot,
	};
}

export function manifestEntryKey(
	owner: Pick<OwnerIdentity, "ownerId">,
	assetId: string,
): string {
	return JSON.stringify([owner.ownerId, assetId]);
}

export function ownersMatch(
	left: OwnerIdentity,
	right: OwnerIdentity,
): boolean {
	return left.kind === right.kind && left.ownerId === right.ownerId;
}
