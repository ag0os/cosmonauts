import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import {
	isImplementedHarnessTargetId,
	resolveRegisteredHarnessAssetPath,
} from "./target-registry.ts";
import type {
	HarnessAsset,
	HarnessManifestEntry,
	ImplementedHarnessTargetId,
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

const EMPTY_HARNESS_MANIFEST = {
	schemaVersion: 1,
	entries: {},
} as const satisfies HarnessProvenanceManifest;

interface HarnessTransactionPaths {
	readonly lockPath: string;
	readonly journalPath: string;
}

export interface LegacyCopiedNodeShape {
	readonly relativePath: string;
	readonly nodeType: "directory" | "file";
}

interface LegacyMigrationExpectation {
	readonly revision: string;
	readonly sourceRelativePath: string;
	readonly owner: OwnerIdentity;
	readonly assetId: string;
	readonly outputPath: string;
	readonly nodeShape: readonly LegacyCopiedNodeShape[];
}

/**
 * Proof assembled by the project-only migration edge after it has read the
 * named git object and observed the live target. The inward core deliberately
 * receives bytes-derived facts only and has no git or target-reading callback.
 */
interface LegacyMigrationProof {
	readonly revision: string;
	readonly sourceRelativePath: string;
	readonly owner: OwnerIdentity;
	readonly assetId: string;
	readonly outputPath: string;
	readonly historicalRenderedDigest: string;
	readonly currentTargetDigest: string;
	readonly historicalNodeShape: readonly LegacyCopiedNodeShape[];
	readonly currentTargetNodeShape: readonly LegacyCopiedNodeShape[];
}

export interface LegacyMigrationAuthorization
	extends LegacyMigrationExpectation {
	readonly authorizationKind: "legacy-copied-target";
	readonly consumption: "one-time";
	readonly historicalRenderedDigest: string;
	readonly targetDigest: string;
}

const LEGACY_MIGRATION_ASSET_IDS = new Set([
	"skill:shared/plan",
	"skill:shared/roadmap",
	"skill:shared/skills-cli",
	"skill:shared/task",
	"external-skill:cosmonauts",
]);

interface StableHarnessStateObservation<T> {
	readonly manifest: HarnessProvenanceManifest;
	readonly manifestFile: StableHarnessFileObservation;
	readonly journalPresent: boolean;
	readonly target: T;
	readonly concurrentChange: boolean;
	readonly exitCode: 0 | 1;
	readonly status?: "source-ahead";
	readonly reason?: "concurrent-change" | "pending-journal";
}

type StableHarnessFileObservation =
	| { readonly exists: false }
	| {
			readonly exists: true;
			readonly digest: string;
			readonly version: string;
			readonly contents: string;
	  };

export function sha256(bytes: Uint8Array | string): string {
	return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Convert injected historical/live proof into the sole copied-target migration
 * capability. Every identity, digest, and node-shape boundary must agree
 * exactly. This function is pure and intentionally cannot read git or a target.
 */
export function verifyLegacyMigrationProof(
	proof: LegacyMigrationProof,
	expected: LegacyMigrationExpectation,
): LegacyMigrationAuthorization | undefined {
	if (!LEGACY_MIGRATION_ASSET_IDS.has(expected.assetId)) return undefined;
	if (!isGitRelativePath(expected.sourceRelativePath)) return undefined;
	if (!isAbsolute(expected.outputPath)) return undefined;
	if (!isCopiedNodeShape(expected.nodeShape)) return undefined;
	if (
		proof.revision !== expected.revision ||
		proof.sourceRelativePath !== expected.sourceRelativePath ||
		!sameJson(proof.owner, expected.owner) ||
		proof.assetId !== expected.assetId ||
		proof.outputPath !== expected.outputPath ||
		proof.historicalRenderedDigest !== proof.currentTargetDigest ||
		!sameJson(proof.historicalNodeShape, expected.nodeShape) ||
		!sameJson(proof.currentTargetNodeShape, expected.nodeShape) ||
		!isCopiedNodeShape(proof.historicalNodeShape) ||
		!isCopiedNodeShape(proof.currentTargetNodeShape)
	) {
		return undefined;
	}

	return {
		authorizationKind: "legacy-copied-target",
		consumption: "one-time",
		...expected,
		historicalRenderedDigest: proof.historicalRenderedDigest,
		targetDigest: proof.currentTargetDigest,
	};
}

function isGitRelativePath(path: string): boolean {
	return (
		path.length > 0 &&
		!isAbsolute(path) &&
		!path.includes("\\") &&
		path
			.split("/")
			.every((segment) => segment !== "" && segment !== "." && segment !== "..")
	);
}

function isCopiedNodeShape(nodes: readonly LegacyCopiedNodeShape[]): boolean {
	const paths = new Set<string>();
	for (const node of nodes) {
		if (
			(node.nodeType !== "directory" && node.nodeType !== "file") ||
			(node.relativePath !== "" && !isGitRelativePath(node.relativePath)) ||
			paths.has(node.relativePath)
		) {
			return false;
		}
		paths.add(node.relativePath);
	}
	return nodes.length > 0 && nodes[0]?.relativePath === "";
}

function sameJson(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Resolve the sibling transaction artifacts shared by every kind and scope
 * under one harness owner root. The target id identifies the registered owner
 * directory (`.claude` or `.agents`); scope deliberately does not participate.
 */
export function resolveHarnessTransactionPaths(
	ownerRoot: string,
	targetId: ImplementedHarnessTargetId,
): HarnessTransactionPaths {
	const parent = dirname(resolve(ownerRoot));
	const stem = `.cosmonauts-harness-${targetId}`;
	return {
		lockPath: join(parent, `${stem}.lock`),
		journalPath: join(parent, `${stem}.journal.json`),
	};
}

/**
 * Observe a target between two raw manifest/journal reads. This function is
 * intentionally observation-only: it does not provision roots, acquire a
 * lock, recover a journal, or rewrite malformed/old state. Raw fingerprints
 * make appearance, disappearance, replacement, and byte changes visible.
 */
export async function observeStableHarnessState<T>(options: {
	readonly manifestPath: string;
	readonly journalPath: string;
	readonly observeTarget: (manifest: HarnessProvenanceManifest) => Promise<T>;
}): Promise<StableHarnessStateObservation<T>> {
	const [manifestBefore, journalBefore] = await Promise.all([
		observeFile(options.manifestPath),
		observeFile(options.journalPath),
	]);
	const manifest = await parseObservedManifest(
		manifestBefore,
		options.manifestPath,
	);
	const target = await options.observeTarget(manifest);
	const [manifestAfter, journalAfter] = await Promise.all([
		observeFile(options.manifestPath),
		observeFile(options.journalPath),
	]);
	const concurrentChange =
		!sameFileObservation(manifestBefore, manifestAfter) ||
		!sameFileObservation(journalBefore, journalAfter);
	if (concurrentChange) {
		return {
			manifest,
			manifestFile: manifestBefore,
			journalPresent: journalBefore.exists || journalAfter.exists,
			target,
			concurrentChange: true,
			exitCode: 1,
			status: "source-ahead",
			reason: "concurrent-change",
		};
	}
	if (journalBefore.exists) {
		return {
			manifest,
			manifestFile: manifestBefore,
			journalPresent: true,
			target,
			concurrentChange: false,
			exitCode: 1,
			status: "source-ahead",
			reason: "pending-journal",
		};
	}
	return {
		manifest,
		manifestFile: manifestBefore,
		journalPresent: false,
		target,
		concurrentChange: false,
		exitCode: 0,
	};
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
	return parseHarnessManifest(contents, manifestPath);
}

async function parseHarnessManifest(
	contents: string,
	manifestPath: string,
): Promise<HarnessProvenanceManifest> {
	const parsed: unknown = JSON.parse(contents);
	if (
		!isRecord(parsed) ||
		parsed.schemaVersion !== 1 ||
		!isRecord(parsed.entries)
	) {
		throw new Error(`Invalid harness provenance manifest: ${manifestPath}.`);
	}
	for (const [key, value] of Object.entries(parsed.entries)) {
		if (!(await isManifestEntry(value, key, manifestPath))) {
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

async function isManifestEntry(
	value: unknown,
	key: string,
	manifestPath: string,
): Promise<boolean> {
	if (!isManifestEntryShape(value)) return false;
	if (!isManifestEntryOwner(value, key)) return false;
	if (!(await isManifestEntryPathValid(value, manifestPath))) return false;
	return isManifestEntryMetadataValid(value);
}

function isManifestEntryShape(value: unknown): value is Record<
	string,
	unknown
> & {
	assetId: string;
	kind: "skill" | "command";
	target: ImplementedHarnessTargetId;
	outputPath: string;
	owner: Record<string, unknown>;
	provenance: Record<string, unknown>;
} {
	if (!isRecord(value)) return false;
	return [
		value.schemaVersion === 1,
		typeof value.assetId === "string",
		isHarnessAssetKind(value.kind),
		isImplementedHarnessTargetId(value.target),
		isHarnessScope(value.scope),
		typeof value.sourceRootId === "string",
		typeof value.sourcePath === "string",
		typeof value.logicalPath === "string",
		isOptionalString(value, "outputIdentity"),
		typeof value.outputPath === "string",
		isHarnessMode(value.mode),
		typeof value.exportedAt === "string",
		isRecord(value.owner),
		isRecord(value.owner) && typeof value.owner.ownerId === "string",
		isRecord(value.provenance),
	].every(Boolean);
}

function isHarnessAssetKind(value: unknown): boolean {
	return value === "skill" || value === "command";
}

function isHarnessScope(value: unknown): boolean {
	return value === "project" || value === "personal";
}

function isHarnessMode(value: unknown): boolean {
	return value === "copy" || value === "link";
}

function isOptionalString(
	value: Record<string, unknown>,
	key: string,
): boolean {
	return !Object.hasOwn(value, key) || typeof value[key] === "string";
}

function isManifestEntryOwner(
	value: Record<string, unknown> & {
		assetId: string;
		owner: Record<string, unknown>;
	},
	key: string,
): boolean {
	if (!isOwnerIdentity(value.owner)) return false;
	const owner = value.owner as unknown as OwnerIdentity;
	return key === manifestEntryKey(owner, value.assetId);
}

async function isManifestEntryPathValid(
	value: Record<string, unknown> & {
		kind: "skill" | "command";
		target: ImplementedHarnessTargetId;
		outputPath: string;
	},
	manifestPath: string,
): Promise<boolean> {
	const outputIdentity = manifestOutputIdentity(value);
	if (!outputIdentity) return false;
	try {
		const claimedOwnerRoot = dirname(dirname(value.outputPath));
		const expectedPath = resolveRegisteredHarnessAssetPath({
			ownerRoot: claimedOwnerRoot,
			targetId: value.target,
			kind: value.kind,
			outputIdentity,
		});
		if (value.outputPath !== expectedPath) return false;
		return (
			(await realpath(claimedOwnerRoot)) ===
			(await realpath(dirname(manifestPath)))
		);
	} catch {
		return false;
	}
}

function isGeneratingProjectRootValid(value: Record<string, unknown>): boolean {
	if (value.assetId === "external-skill:cosmonauts") {
		return (
			typeof value.generatingProjectRoot === "string" &&
			isAbsolute(value.generatingProjectRoot)
		);
	}
	return isOptionalString(value, "generatingProjectRoot");
}

function isManifestEntryMetadataValid(
	value: Record<string, unknown> & { provenance: Record<string, unknown> },
): boolean {
	return (
		isGeneratingProjectRootValid(value) &&
		isManifestProvenance(value.provenance)
	);
}

function isManifestProvenance(value: Record<string, unknown>): boolean {
	if (value.kind === "copy") return isCopyProvenance(value);
	if (value.kind === "direct-link") return isDirectLinkProvenance(value);
	if (value.kind === "generated-wrapper") {
		return isGeneratedWrapperProvenance(value);
	}
	return false;
}

function isCopyProvenance(value: Record<string, unknown>): boolean {
	return (
		typeof value.baselineDigest === "string" &&
		typeof value.sourceDigest === "string" &&
		typeof value.renderedDigest === "string" &&
		typeof value.targetDigest === "string" &&
		value.markerVersion === 1
	);
}

function isDirectLinkProvenance(value: Record<string, unknown>): boolean {
	return (
		typeof value.expectedCanonicalSource === "string" &&
		(value.linkShape === "directory" || value.linkShape === "flat-skill") &&
		!Object.hasOwn(value, "sourceDigest")
	);
}

function isGeneratedWrapperProvenance(value: Record<string, unknown>): boolean {
	return (
		typeof value.baselineDigest === "string" &&
		Array.isArray(value.authoredLinks) &&
		value.authoredLinks.every(isAuthoredLink) &&
		Array.isArray(value.generatedNodes) &&
		value.generatedNodes.every(isGeneratedNode)
	);
}

function isOwnerIdentity(value: Record<string, unknown>): boolean {
	if (value.kind === "authority") {
		return (
			value.ownerId === "authority:cosmonauts/core" &&
			value.authorityId === "cosmonauts/core" &&
			Object.keys(value).length === 3
		);
	}
	if (
		value.kind !== "project" ||
		typeof value.ownerId !== "string" ||
		typeof value.projectRoot !== "string" ||
		!isAbsolute(value.projectRoot) ||
		resolve(value.projectRoot) !== value.projectRoot ||
		Object.keys(value).length !== 3
	) {
		return false;
	}
	return value.ownerId === `project:${sha256(value.projectRoot)}`;
}

function manifestOutputIdentity(
	value: Record<string, unknown>,
): string | undefined {
	if (typeof value.outputIdentity === "string") return value.outputIdentity;
	return typeof value.outputPath === "string"
		? basename(value.outputPath)
		: undefined;
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

async function observeFile(
	path: string,
): Promise<StableHarnessFileObservation> {
	try {
		const before = await lstat(path, { bigint: true });
		const contents = await readFile(path, "utf8");
		const after = await lstat(path, { bigint: true });
		return {
			exists: true,
			digest: sha256(contents),
			version: [
				before.dev,
				before.ino,
				before.size,
				before.mtimeNs,
				before.ctimeNs,
				after.dev,
				after.ino,
				after.size,
				after.mtimeNs,
				after.ctimeNs,
			].join(":"),
			contents,
		};
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			return { exists: false };
		}
		throw error;
	}
}

async function parseObservedManifest(
	observation: StableHarnessFileObservation,
	manifestPath: string,
): Promise<HarnessProvenanceManifest> {
	if (!observation.exists) return EMPTY_HARNESS_MANIFEST;
	if (observation.contents === undefined) {
		throw new Error(
			`Harness manifest bytes were not observed: ${manifestPath}.`,
		);
	}
	return parseHarnessManifest(observation.contents, manifestPath);
}

function sameFileObservation(
	left: StableHarnessFileObservation,
	right: StableHarnessFileObservation,
): boolean {
	if (left.exists !== right.exists) return false;
	if (!left.exists || !right.exists) return true;
	return left.digest === right.digest && left.version === right.version;
}
