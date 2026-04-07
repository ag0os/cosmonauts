/**
 * Tests for lib/sessions/knowledge.ts
 * Covers writeKnowledgeBundle, readKnowledgeBundle, and readAllKnowledge.
 */

import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
	readAllKnowledge,
	readKnowledgeBundle,
	writeKnowledgeBundle,
} from "../../lib/sessions/knowledge.ts";
import type {
	KnowledgeBundle,
	KnowledgeRecord,
} from "../../lib/sessions/types.ts";

// ============================================================================
// Fixtures
// ============================================================================

function makeRecord(overrides: Partial<KnowledgeRecord> = {}): KnowledgeRecord {
	return {
		id: "rec-001",
		planSlug: "test-plan",
		sourceRole: "worker",
		type: "decision",
		content:
			"Used JSONL for knowledge storage to enable streaming reads and easy SQLite import.",
		files: ["lib/sessions/knowledge.ts"],
		tags: ["storage", "jsonl"],
		createdAt: "2026-04-07T00:00:00.000Z",
		...overrides,
	};
}

function makeBundle(overrides: Partial<KnowledgeBundle> = {}): KnowledgeBundle {
	return {
		planSlug: "test-plan",
		planTitle: "Test Plan",
		distilledAt: "2026-04-07T01:00:00.000Z",
		distilledBy: "distiller",
		records: [makeRecord()],
		...overrides,
	};
}

// ============================================================================
// Setup
// ============================================================================

let tempDir: string;

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "sessions-knowledge-test-"));
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

// ============================================================================
// writeKnowledgeBundle
// ============================================================================

describe("writeKnowledgeBundle", () => {
	test("creates memory/ directory if missing", async () => {
		const bundle = makeBundle();
		await writeKnowledgeBundle(tempDir, bundle);

		const memStats = await stat(join(tempDir, "memory"));
		expect(memStats.isDirectory()).toBe(true);
	});

	test("writes file to memory/<planSlug>.knowledge.jsonl", async () => {
		const bundle = makeBundle();
		const filePath = await writeKnowledgeBundle(tempDir, bundle);

		expect(filePath).toBe(join(tempDir, "memory", "test-plan.knowledge.jsonl"));

		const fileStats = await stat(filePath);
		expect(fileStats.isFile()).toBe(true);
	});

	test("writes _meta header on first line", async () => {
		const bundle = makeBundle();
		await writeKnowledgeBundle(tempDir, bundle);

		const content = await readFile(
			join(tempDir, "memory", "test-plan.knowledge.jsonl"),
			"utf-8",
		);
		const lines = content.split("\n").filter((l) => l.trim() !== "");

		const meta = JSON.parse(lines[0] as string) as Record<string, unknown>;
		expect(meta._meta).toBe(true);
		expect(meta.planSlug).toBe("test-plan");
		expect(meta.planTitle).toBe("Test Plan");
		expect(meta.distilledAt).toBe("2026-04-07T01:00:00.000Z");
		expect(meta.distilledBy).toBe("distiller");
	});

	test("writes one KnowledgeRecord per line after the header", async () => {
		const records = [
			makeRecord({ id: "rec-001", type: "decision" }),
			makeRecord({ id: "rec-002", type: "pattern", content: "Second record" }),
		];
		const bundle = makeBundle({ records });
		await writeKnowledgeBundle(tempDir, bundle);

		const content = await readFile(
			join(tempDir, "memory", "test-plan.knowledge.jsonl"),
			"utf-8",
		);
		const lines = content.split("\n").filter((l) => l.trim() !== "");

		// Line 0 is meta, lines 1+ are records
		expect(lines.length).toBe(3);
		const r1 = JSON.parse(lines[1] as string) as KnowledgeRecord;
		const r2 = JSON.parse(lines[2] as string) as KnowledgeRecord;
		expect(r1.id).toBe("rec-001");
		expect(r2.id).toBe("rec-002");
	});

	test("handles empty records array", async () => {
		const bundle = makeBundle({ records: [] });
		await writeKnowledgeBundle(tempDir, bundle);

		const content = await readFile(
			join(tempDir, "memory", "test-plan.knowledge.jsonl"),
			"utf-8",
		);
		const lines = content.split("\n").filter((l) => l.trim() !== "");
		expect(lines.length).toBe(1); // only _meta
	});
});

// ============================================================================
// readKnowledgeBundle
// ============================================================================

describe("readKnowledgeBundle", () => {
	test("returns undefined when file does not exist", async () => {
		const result = await readKnowledgeBundle(tempDir, "nonexistent-plan");
		expect(result).toBeUndefined();
	});

	test("returns undefined for non-canonical metadata header", async () => {
		const filePath = join(tempDir, "memory", "test-plan.knowledge.jsonl");
		await mkdir(join(tempDir, "memory"), { recursive: true });
		await writeFile(
			filePath,
			[
				JSON.stringify({
					planSlug: "test-plan",
					planTitle: "Test Plan",
					distilledAt: "2026-04-07T01:00:00.000Z",
					distilledBy: "distiller",
					recordCount: 1,
				}),
				JSON.stringify(makeRecord()),
			].join("\n"),
			"utf-8",
		);

		const result = await readKnowledgeBundle(tempDir, "test-plan");
		expect(result).toBeUndefined();
	});

	test("roundtrip — reads back identical bundle (QC-007)", async () => {
		const bundle = makeBundle();
		await writeKnowledgeBundle(tempDir, bundle);

		const read = await readKnowledgeBundle(tempDir, "test-plan");
		expect(read).toBeDefined();
		expect(read?.planSlug).toBe(bundle.planSlug);
		expect(read?.planTitle).toBe(bundle.planTitle);
		expect(read?.distilledAt).toBe(bundle.distilledAt);
		expect(read?.distilledBy).toBe(bundle.distilledBy);
		expect(read?.records).toHaveLength(1);
		expect(read?.records[0]).toEqual(bundle.records[0]);
	});

	test("roundtrip preserves all record fields", async () => {
		const record = makeRecord({
			id: "full-record",
			taskId: "TASK-001",
			type: "gotcha",
			content: "Bun does not support X natively.",
			files: ["lib/foo.ts", "lib/bar.ts"],
			tags: ["bun", "gotcha", "compatibility"],
		});
		const bundle = makeBundle({ records: [record] });
		await writeKnowledgeBundle(tempDir, bundle);

		const read = await readKnowledgeBundle(tempDir, "test-plan");
		expect(read?.records[0]).toEqual(record);
	});

	test("roundtrip preserves multiple records in order", async () => {
		const records = [
			makeRecord({ id: "a", type: "decision" }),
			makeRecord({ id: "b", type: "pattern" }),
			makeRecord({ id: "c", type: "convention" }),
		];
		const bundle = makeBundle({ records });
		await writeKnowledgeBundle(tempDir, bundle);

		const read = await readKnowledgeBundle(tempDir, "test-plan");
		expect(read?.records).toHaveLength(3);
		expect(read?.records.map((r) => r.id)).toEqual(["a", "b", "c"]);
	});
});

// ============================================================================
// readAllKnowledge
// ============================================================================

describe("readAllKnowledge", () => {
	test("returns empty array when memory/ does not exist", async () => {
		const result = await readAllKnowledge(tempDir);
		expect(result).toEqual([]);
	});

	test("returns empty array when no .knowledge.jsonl files exist", async () => {
		await mkdir(join(tempDir, "memory"), { recursive: true });
		await writeFile(join(tempDir, "memory", "notes.md"), "# Notes", "utf-8");

		const result = await readAllKnowledge(tempDir);
		expect(result).toEqual([]);
	});

	test("returns all records from a single bundle", async () => {
		const records = [makeRecord({ id: "r1" }), makeRecord({ id: "r2" })];
		await writeKnowledgeBundle(tempDir, makeBundle({ records }));

		const result = await readAllKnowledge(tempDir);
		expect(result).toHaveLength(2);
		expect(result.map((r) => r.id)).toContain("r1");
		expect(result.map((r) => r.id)).toContain("r2");
	});

	test("returns flat array of records from multiple bundles", async () => {
		const bundle1 = makeBundle({
			planSlug: "plan-alpha",
			records: [makeRecord({ id: "a1", planSlug: "plan-alpha" })],
		});
		const bundle2 = makeBundle({
			planSlug: "plan-beta",
			records: [
				makeRecord({ id: "b1", planSlug: "plan-beta" }),
				makeRecord({ id: "b2", planSlug: "plan-beta" }),
			],
		});

		await writeKnowledgeBundle(tempDir, bundle1);
		await writeKnowledgeBundle(tempDir, bundle2);

		const result = await readAllKnowledge(tempDir);
		expect(result).toHaveLength(3);
		const ids = result.map((r) => r.id).sort();
		expect(ids).toEqual(["a1", "b1", "b2"]);
	});
});
