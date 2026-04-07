/**
 * Tests for lib/sessions/manifest.ts
 * Covers createManifest, appendSession, and readManifest.
 */

import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
	appendSession,
	createManifest,
	readManifest,
} from "../../lib/sessions/manifest.ts";
import type { SessionRecord } from "../../lib/sessions/types.ts";

// ============================================================================
// Fixtures
// ============================================================================

function makeRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
	return {
		sessionId: "sess-001",
		role: "worker",
		startedAt: "2026-04-07T00:00:00.000Z",
		completedAt: "2026-04-07T00:05:00.000Z",
		outcome: "success",
		sessionFile: "worker-sess-001.jsonl",
		transcriptFile: "worker-sess-001.transcript.md",
		...overrides,
	};
}

// ============================================================================
// Setup
// ============================================================================

let tempDir: string;

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "sessions-manifest-test-"));
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

// ============================================================================
// createManifest
// ============================================================================

describe("createManifest", () => {
	test("creates the plan subdirectory", async () => {
		await createManifest(tempDir, "my-plan");
		const dirStats = await stat(join(tempDir, "my-plan"));
		expect(dirStats.isDirectory()).toBe(true);
	});

	test("writes manifest.json to <sessionsDir>/<planSlug>/", async () => {
		await createManifest(tempDir, "my-plan");
		const fileStats = await stat(join(tempDir, "my-plan", "manifest.json"));
		expect(fileStats.isFile()).toBe(true);
	});

	test("manifest has correct planSlug", async () => {
		const manifest = await createManifest(tempDir, "test-plan");
		expect(manifest.planSlug).toBe("test-plan");
	});

	test("manifest starts with empty sessions array", async () => {
		const manifest = await createManifest(tempDir, "test-plan");
		expect(manifest.sessions).toEqual([]);
	});

	test("manifest has createdAt and updatedAt as ISO 8601 strings", async () => {
		const before = new Date().toISOString();
		const manifest = await createManifest(tempDir, "test-plan");
		const after = new Date().toISOString();

		expect(manifest.createdAt >= before).toBe(true);
		expect(manifest.createdAt <= after).toBe(true);
		expect(manifest.updatedAt).toBe(manifest.createdAt);
	});

	test("written file deserializes to the returned manifest", async () => {
		const created = await createManifest(tempDir, "round-trip");
		const read = await readManifest(tempDir, "round-trip");

		expect(read).toEqual(created);
	});
});

// ============================================================================
// appendSession
// ============================================================================

describe("appendSession", () => {
	test("appends a record to an existing manifest", async () => {
		await createManifest(tempDir, "my-plan");
		const record = makeRecord();
		await appendSession(tempDir, "my-plan", record);

		const manifest = await readManifest(tempDir, "my-plan");
		expect(manifest?.sessions).toHaveLength(1);
		expect(manifest?.sessions[0]).toEqual(record);
	});

	test("updates updatedAt after append", async () => {
		const original = await createManifest(tempDir, "my-plan");
		// Slight delay to ensure updatedAt differs
		await new Promise((r) => setTimeout(r, 2));

		await appendSession(tempDir, "my-plan", makeRecord());

		const manifest = await readManifest(tempDir, "my-plan");
		expect(manifest?.updatedAt).toBeDefined();
		// updatedAt should be at or after original
		expect(String(manifest?.updatedAt) >= original.updatedAt).toBe(true);
	});

	test("preserves createdAt when appending", async () => {
		const original = await createManifest(tempDir, "my-plan");
		await appendSession(tempDir, "my-plan", makeRecord());

		const manifest = await readManifest(tempDir, "my-plan");
		expect(manifest?.createdAt).toBe(original.createdAt);
	});

	test("appends multiple records in order", async () => {
		await createManifest(tempDir, "my-plan");
		const r1 = makeRecord({ sessionId: "s1", role: "planner" });
		const r2 = makeRecord({ sessionId: "s2", role: "worker" });
		const r3 = makeRecord({ sessionId: "s3", role: "quality-manager" });

		await appendSession(tempDir, "my-plan", r1);
		await appendSession(tempDir, "my-plan", r2);
		await appendSession(tempDir, "my-plan", r3);

		const manifest = await readManifest(tempDir, "my-plan");
		expect(manifest?.sessions).toHaveLength(3);
		expect(manifest?.sessions.map((s) => s.sessionId)).toEqual([
			"s1",
			"s2",
			"s3",
		]);
	});

	test("creates manifest if it does not exist (idempotent on first call)", async () => {
		const record = makeRecord({ sessionId: "s1" });
		await appendSession(tempDir, "my-plan", record);

		const manifest = await readManifest(tempDir, "my-plan");
		expect(manifest).toBeDefined();
		expect(manifest?.planSlug).toBe("my-plan");
		expect(manifest?.sessions).toHaveLength(1);
		expect(manifest?.sessions[0]).toEqual(record);
	});

	test("subsequent appends to auto-created manifest accumulate records", async () => {
		await appendSession(tempDir, "my-plan", makeRecord({ sessionId: "s1" }));
		await appendSession(tempDir, "my-plan", makeRecord({ sessionId: "s2" }));

		const manifest = await readManifest(tempDir, "my-plan");
		expect(manifest?.sessions).toHaveLength(2);
	});

	test("preserves all SessionRecord fields", async () => {
		await createManifest(tempDir, "my-plan");
		const record = makeRecord({
			sessionId: "full-record",
			role: "planner",
			parentSessionId: "parent-123",
			taskId: "TASK-001",
			outcome: "failed",
			stats: {
				tokens: { input: 100, output: 200, total: 300 },
				cost: 0.005,
				durationMs: 12000,
				turns: 5,
				toolCalls: 10,
			},
		});
		await appendSession(tempDir, "my-plan", record);

		const manifest = await readManifest(tempDir, "my-plan");
		expect(manifest?.sessions[0]).toEqual(record);
	});
});

// ============================================================================
// readManifest
// ============================================================================

describe("readManifest", () => {
	test("returns undefined when file does not exist", async () => {
		const result = await readManifest(tempDir, "nonexistent-plan");
		expect(result).toBeUndefined();
	});

	test("returns undefined when plan subdirectory does not exist", async () => {
		const result = await readManifest(tempDir, "no-such-dir");
		expect(result).toBeUndefined();
	});

	test("roundtrip — reads back identical manifest after createManifest", async () => {
		const created = await createManifest(tempDir, "round-trip");
		const read = await readManifest(tempDir, "round-trip");

		expect(read).toEqual(created);
	});

	test("roundtrip — reads back correct data after appendSession", async () => {
		await createManifest(tempDir, "my-plan");
		const record = makeRecord({ sessionId: "s1", role: "coordinator" });
		await appendSession(tempDir, "my-plan", record);

		const manifest = await readManifest(tempDir, "my-plan");
		expect(manifest?.planSlug).toBe("my-plan");
		expect(manifest?.sessions).toHaveLength(1);
		expect(manifest?.sessions[0]?.sessionId).toBe("s1");
		expect(manifest?.sessions[0]?.role).toBe("coordinator");
	});
});
