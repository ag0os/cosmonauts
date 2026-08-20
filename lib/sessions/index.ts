/**
 * Public API for the sessions module.
 * Exports session-lineage types and manifest utilities.
 */

// Session manifest I/O
export { appendSession, createManifest, readManifest } from "./manifest.ts";

// Types
export type {
	SessionManifest,
	SessionRecord,
} from "./types.ts";
