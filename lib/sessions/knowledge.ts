/**
 * Knowledge bundle read/write operations.
 * Persists KnowledgeRecord arrays as JSONL files under memory/.
 *
 * File format: memory/<planSlug>.knowledge.jsonl
 *   Line 1: _meta record — {"_meta": true, "planSlug": ..., "planTitle": ..., "distilledAt": ..., "distilledBy": ...}
 *   Line 2+: one KnowledgeRecord JSON object per line
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { KnowledgeBundle, KnowledgeRecord } from "./types.ts";

// ============================================================================
// Constants
// ============================================================================

const MEMORY_DIR = "memory";
const KNOWLEDGE_EXT = ".knowledge.jsonl";

// ============================================================================
// Internal Helpers
// ============================================================================

function knowledgeFilePath(projectRoot: string, planSlug: string): string {
	return join(projectRoot, MEMORY_DIR, `${planSlug}${KNOWLEDGE_EXT}`);
}

interface MetaRecord {
	_meta: true;
	planSlug: string;
	planTitle: string;
	distilledAt: string;
	distilledBy: string;
}

function buildMetaRecord(bundle: KnowledgeBundle): MetaRecord {
	return {
		_meta: true,
		planSlug: bundle.planSlug,
		planTitle: bundle.planTitle,
		distilledAt: bundle.distilledAt,
		distilledBy: bundle.distilledBy,
	};
}

function parseBundle(content: string): KnowledgeBundle | undefined {
	const lines = content.split("\n").filter((l) => l.trim() !== "");
	if (lines.length === 0) return undefined;

	const firstRaw = JSON.parse(lines[0] as string) as Record<string, unknown>;
	if (
		firstRaw._meta !== true ||
		typeof firstRaw.planSlug !== "string" ||
		typeof firstRaw.planTitle !== "string" ||
		typeof firstRaw.distilledAt !== "string" ||
		typeof firstRaw.distilledBy !== "string"
	) {
		return undefined;
	}

	const meta: MetaRecord = {
		_meta: true,
		planSlug: firstRaw.planSlug,
		planTitle: firstRaw.planTitle,
		distilledAt: firstRaw.distilledAt,
		distilledBy: firstRaw.distilledBy,
	};
	const records: KnowledgeRecord[] = [];

	for (let i = 1; i < lines.length; i++) {
		records.push(JSON.parse(lines[i] as string) as KnowledgeRecord);
	}

	return {
		planSlug: meta.planSlug,
		planTitle: meta.planTitle,
		distilledAt: meta.distilledAt,
		distilledBy: meta.distilledBy,
		records,
	};
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Write a KnowledgeBundle to memory/<planSlug>.knowledge.jsonl.
 * Returns the absolute path of the written file.
 */
export async function writeKnowledgeBundle(
	projectRoot: string,
	bundle: KnowledgeBundle,
): Promise<string> {
	const memoryDir = join(projectRoot, MEMORY_DIR);
	await mkdir(memoryDir, { recursive: true });

	const lines: string[] = [
		JSON.stringify(buildMetaRecord(bundle)),
		...bundle.records.map((r) => JSON.stringify(r)),
	];

	const filePath = knowledgeFilePath(projectRoot, bundle.planSlug);
	await writeFile(filePath, `${lines.join("\n")}\n`, "utf-8");
	return filePath;
}

/**
 * Read a KnowledgeBundle from memory/<planSlug>.knowledge.jsonl.
 * Returns undefined if the file does not exist.
 */
export async function readKnowledgeBundle(
	projectRoot: string,
	planSlug: string,
): Promise<KnowledgeBundle | undefined> {
	const filePath = knowledgeFilePath(projectRoot, planSlug);

	let content: string;
	try {
		content = await readFile(filePath, "utf-8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return undefined;
		}
		throw error;
	}

	return parseBundle(content);
}

/**
 * Read all .knowledge.jsonl files in memory/ and return a flat array of KnowledgeRecord.
 * Files that are missing or malformed are silently skipped.
 */
export async function readAllKnowledge(
	projectRoot: string,
): Promise<KnowledgeRecord[]> {
	const memoryDir = join(projectRoot, MEMORY_DIR);

	let entries: string[];
	try {
		entries = await readdir(memoryDir);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return [];
		}
		throw error;
	}

	const knowledgeFiles = entries.filter((e) => e.endsWith(KNOWLEDGE_EXT));
	const allRecords: KnowledgeRecord[] = [];

	for (const filename of knowledgeFiles) {
		try {
			const content = await readFile(join(memoryDir, filename), "utf-8");
			const bundle = parseBundle(content);
			if (bundle) {
				allRecords.push(...bundle.records);
			}
		} catch {
			// Skip malformed files
		}
	}

	return allRecords;
}
