/**
 * Public API for the sessions module.
 * Exports types, knowledge bundle I/O, and session lineage utilities.
 */

// Knowledge bundle I/O
export {
	readAllKnowledge,
	readKnowledgeBundle,
	writeKnowledgeBundle,
} from "./knowledge.ts";

// Session manifest I/O
export { appendSession, createManifest, readManifest } from "./manifest.ts";

// Types
export type {
	KnowledgeBundle,
	KnowledgeRecord,
	KnowledgeType,
	SessionManifest,
	SessionRecord,
} from "./types.ts";
