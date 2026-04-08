/**
 * Plan-to-session lineage manifest CRUD operations.
 * Manages manifest.json files under <sessionsDir>/<planSlug>/manifest.json.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SessionManifest, SessionRecord } from "./types.ts";

// ============================================================================
// Internal Helpers
// ============================================================================

function manifestPath(sessionsDir: string, planSlug: string): string {
	return join(sessionsDir, planSlug, "manifest.json");
}

async function writeManifest(
	sessionsDir: string,
	planSlug: string,
	manifest: SessionManifest,
): Promise<void> {
	const dir = join(sessionsDir, planSlug);
	await mkdir(dir, { recursive: true });
	await writeFile(
		manifestPath(sessionsDir, planSlug),
		JSON.stringify(manifest, null, 2),
		"utf-8",
	);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create a new empty SessionManifest and write it to disk.
 * Returns the created manifest.
 */
export async function createManifest(
	sessionsDir: string,
	planSlug: string,
): Promise<SessionManifest> {
	const now = new Date().toISOString();
	const manifest: SessionManifest = {
		planSlug,
		createdAt: now,
		updatedAt: now,
		sessions: [],
	};
	await writeManifest(sessionsDir, planSlug, manifest);
	return manifest;
}

/**
 * Append a SessionRecord to the manifest for the given plan.
 * Creates the manifest if it does not exist yet.
 * Updates updatedAt on each call.
 */
export async function appendSession(
	sessionsDir: string,
	planSlug: string,
	record: SessionRecord,
): Promise<void> {
	const existing = await readManifest(sessionsDir, planSlug);
	const manifest: SessionManifest =
		existing ?? (await createManifest(sessionsDir, planSlug));
	manifest.sessions.push(record);
	manifest.updatedAt = new Date().toISOString();
	await writeManifest(sessionsDir, planSlug, manifest);
}

/**
 * Read the SessionManifest for the given plan.
 * Returns undefined if the manifest file does not exist.
 */
export async function readManifest(
	sessionsDir: string,
	planSlug: string,
): Promise<SessionManifest | undefined> {
	let content: string;
	try {
		content = await readFile(manifestPath(sessionsDir, planSlug), "utf-8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return undefined;
		}
		throw error;
	}
	return JSON.parse(content) as SessionManifest;
}
