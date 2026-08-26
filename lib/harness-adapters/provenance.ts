import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import type {
	HarnessAsset,
	HarnessManifestEntry,
	OwnerIdentity,
} from "./types.ts";

export interface HarnessAuthoredLink {
	readonly relativePath: string;
	readonly expectedCanonicalSource: string;
}

export interface HarnessGeneratedNodeProvenance {
	readonly relativePath: string;
	readonly inputDigest: string;
	readonly renderedDigest: string;
	readonly targetDigest: string;
}

export type MaterializedHarnessManifestEntry = Omit<
	HarnessManifestEntry,
	"provenance"
> & {
	readonly provenance:
		| {
				readonly kind: "copy";
				readonly baselineDigest: string;
				readonly sourceDigest: string;
				readonly renderedDigest: string;
				readonly targetDigest: string;
				readonly markerVersion: 1;
		  }
		| {
				readonly kind: "direct-link";
				readonly expectedCanonicalSource: string;
				readonly linkShape: "directory" | "flat-skill";
		  }
		| {
				readonly kind: "generated-wrapper";
				readonly baselineDigest: string;
				readonly authoredLinks: readonly HarnessAuthoredLink[];
				readonly generatedNodes: readonly HarnessGeneratedNodeProvenance[];
		  };
};

export interface HarnessProvenanceManifest {
	readonly schemaVersion: 1;
	readonly entries: Readonly<Record<string, MaterializedHarnessManifestEntry>>;
}

export const EMPTY_HARNESS_MANIFEST = {
	schemaVersion: 1,
	entries: {},
} as const satisfies HarnessProvenanceManifest;

export function sha256(bytes: Uint8Array | string): string {
	return createHash("sha256").update(bytes).digest("hex");
}

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

export async function readHarnessManifest(
	manifestPath: string,
): Promise<HarnessProvenanceManifest> {
	let contents: string;
	try {
		contents = await readFile(manifestPath, "utf8");
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			return EMPTY_HARNESS_MANIFEST;
		}
		throw error;
	}
	const parsed: unknown = JSON.parse(contents);
	if (
		!isRecord(parsed) ||
		parsed.schemaVersion !== 1 ||
		!isRecord(parsed.entries)
	) {
		throw new Error(`Invalid harness provenance manifest: ${manifestPath}.`);
	}
	for (const [key, value] of Object.entries(parsed.entries)) {
		if (!isManifestEntry(value)) {
			throw new Error(
				`Invalid harness provenance manifest entry "${key}" in ${manifestPath}.`,
			);
		}
	}
	return parsed as unknown as HarnessProvenanceManifest;
}

export function serializeHarnessManifest(
	manifest: HarnessProvenanceManifest,
): string {
	const entries = Object.fromEntries(
		Object.entries(manifest.entries).sort(([left], [right]) =>
			left.localeCompare(right),
		),
	);
	return `${JSON.stringify({ schemaVersion: 1, entries }, null, 2)}\n`;
}

function isManifestEntry(
	value: unknown,
): value is MaterializedHarnessManifestEntry {
	if (!isRecord(value) || value.schemaVersion !== 1) return false;
	if (
		typeof value.assetId !== "string" ||
		(value.kind !== "skill" && value.kind !== "command") ||
		(value.target !== "claude" && value.target !== "codex") ||
		(value.scope !== "project" && value.scope !== "personal") ||
		typeof value.sourceRootId !== "string" ||
		typeof value.sourcePath !== "string" ||
		typeof value.logicalPath !== "string" ||
		typeof value.outputPath !== "string" ||
		(value.mode !== "copy" && value.mode !== "link") ||
		typeof value.exportedAt !== "string" ||
		!isRecord(value.owner) ||
		typeof value.owner.ownerId !== "string" ||
		!isRecord(value.provenance)
	) {
		return false;
	}
	if (value.provenance.kind === "copy") {
		return (
			typeof value.provenance.baselineDigest === "string" &&
			typeof value.provenance.sourceDigest === "string" &&
			typeof value.provenance.renderedDigest === "string" &&
			typeof value.provenance.targetDigest === "string" &&
			value.provenance.markerVersion === 1
		);
	}
	if (value.provenance.kind === "direct-link") {
		return (
			typeof value.provenance.expectedCanonicalSource === "string" &&
			(value.provenance.linkShape === "directory" ||
				value.provenance.linkShape === "flat-skill") &&
			!Object.hasOwn(value.provenance, "sourceDigest")
		);
	}
	if (value.provenance.kind !== "generated-wrapper") return false;
	return (
		typeof value.provenance.baselineDigest === "string" &&
		Array.isArray(value.provenance.authoredLinks) &&
		value.provenance.authoredLinks.every(isAuthoredLink) &&
		Array.isArray(value.provenance.generatedNodes) &&
		value.provenance.generatedNodes.every(isGeneratedNode)
	);
}

function isAuthoredLink(value: unknown): value is HarnessAuthoredLink {
	return (
		isRecord(value) &&
		typeof value.relativePath === "string" &&
		typeof value.expectedCanonicalSource === "string"
	);
}

function isGeneratedNode(
	value: unknown,
): value is HarnessGeneratedNodeProvenance {
	return (
		isRecord(value) &&
		typeof value.relativePath === "string" &&
		typeof value.inputDigest === "string" &&
		typeof value.renderedDigest === "string" &&
		typeof value.targetDigest === "string"
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}
