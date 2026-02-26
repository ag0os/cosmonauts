/**
 * Tests for plan file-system.ts
 * Covers file I/O operations with temp directory isolation
 */

import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
	createPlanDirectory,
	deletePlanDirectory,
	ensurePlansDirectory,
	listPlanSlugs,
	readPlanFile,
	readSpecFile,
	writePlanFile,
	writeSpecFile,
} from "../../lib/plans/file-system.ts";
import type { Plan } from "../../lib/plans/plan-types.ts";

/**
 * Helper to create a unique temp directory for test isolation
 */
async function createTestDir(): Promise<string> {
	const prefix = join(tmpdir(), "forge-plans-test-");
	return await mkdtemp(prefix);
}

/**
 * Helper to safely clean up temp directory
 */
async function cleanupTestDir(dir: string): Promise<void> {
	try {
		await rm(dir, { recursive: true, force: true });
	} catch {
		// Ignore cleanup errors
	}
}

describe("ensurePlansDirectory", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = await createTestDir();
	});

	afterEach(async () => {
		await cleanupTestDir(testDir);
	});

	test("creates forge/plans/ directory", async () => {
		await ensurePlansDirectory(testDir);

		const plansDir = join(testDir, "forge", "plans");
		const stats = await stat(plansDir);
		expect(stats.isDirectory()).toBe(true);
	});

	test("returns path to forge/plans/", async () => {
		const result = await ensurePlansDirectory(testDir);
		expect(result).toBe(join(testDir, "forge", "plans"));
	});

	test("is idempotent - calling multiple times succeeds", async () => {
		await ensurePlansDirectory(testDir);
		await ensurePlansDirectory(testDir);
		await ensurePlansDirectory(testDir);

		const plansDir = join(testDir, "forge", "plans");
		const stats = await stat(plansDir);
		expect(stats.isDirectory()).toBe(true);
	});
});

describe("listPlanSlugs", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = await createTestDir();
		await ensurePlansDirectory(testDir);
	});

	afterEach(async () => {
		await cleanupTestDir(testDir);
	});

	test("returns empty array when no plan directories exist", async () => {
		const slugs = await listPlanSlugs(testDir);
		expect(slugs).toEqual([]);
	});

	test("returns only directories, not files", async () => {
		const plansDir = join(testDir, "forge", "plans");
		await createPlanDirectory(testDir, "auth-system");
		await createPlanDirectory(testDir, "api-redesign");
		await writeFile(join(plansDir, "notes.txt"), "content", "utf-8");

		const slugs = await listPlanSlugs(testDir);

		expect(slugs).toHaveLength(2);
		expect(slugs).toContain("auth-system");
		expect(slugs).toContain("api-redesign");
		expect(slugs).not.toContain("notes.txt");
	});

	test("returns slugs sorted alphabetically", async () => {
		await createPlanDirectory(testDir, "zeta-plan");
		await createPlanDirectory(testDir, "alpha-plan");
		await createPlanDirectory(testDir, "middle-plan");

		const slugs = await listPlanSlugs(testDir);

		expect(slugs).toEqual(["alpha-plan", "middle-plan", "zeta-plan"]);
	});

	test("returns empty array when plans directory does not exist", async () => {
		const freshDir = await createTestDir();
		try {
			const slugs = await listPlanSlugs(freshDir);
			expect(slugs).toEqual([]);
		} finally {
			await cleanupTestDir(freshDir);
		}
	});
});

describe("createPlanDirectory / deletePlanDirectory", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = await createTestDir();
	});

	afterEach(async () => {
		await cleanupTestDir(testDir);
	});

	test("creates plan directory under forge/plans/", async () => {
		const dirPath = await createPlanDirectory(testDir, "auth-system");

		expect(dirPath).toBe(join(testDir, "forge", "plans", "auth-system"));
		const stats = await stat(dirPath);
		expect(stats.isDirectory()).toBe(true);
	});

	test("creates parent directories if needed", async () => {
		await createPlanDirectory(testDir, "new-plan");

		const forgeDir = join(testDir, "forge");
		const stats = await stat(forgeDir);
		expect(stats.isDirectory()).toBe(true);
	});

	test("deletes plan directory and contents", async () => {
		await createPlanDirectory(testDir, "to-delete");
		const planDir = join(testDir, "forge", "plans", "to-delete");
		await writeFile(join(planDir, "plan.md"), "content", "utf-8");

		await deletePlanDirectory(testDir, "to-delete");

		await expect(stat(planDir)).rejects.toThrow();
	});

	test("does not throw when deleting non-existent directory", async () => {
		await ensurePlansDirectory(testDir);
		await deletePlanDirectory(testDir, "nonexistent");
	});
});

describe("readPlanFile / writePlanFile", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = await createTestDir();
		await ensurePlansDirectory(testDir);
	});

	afterEach(async () => {
		await cleanupTestDir(testDir);
	});

	test("returns null when plan file does not exist", async () => {
		const result = await readPlanFile(testDir, "nonexistent");
		expect(result).toBeNull();
	});

	test("writes and reads plan file with frontmatter", async () => {
		const now = new Date("2026-02-25T12:00:00.000Z");
		const plan: Omit<Plan, "spec"> = {
			slug: "auth-system",
			title: "Auth System",
			status: "active",
			createdAt: now,
			updatedAt: now,
			body: "This is the plan body.",
		};

		await writePlanFile(testDir, "auth-system", plan);
		const loaded = await readPlanFile(testDir, "auth-system");

		expect(loaded).not.toBeNull();
		expect(loaded?.slug).toBe("auth-system");
		expect(loaded?.title).toBe("Auth System");
		expect(loaded?.status).toBe("active");
		expect(loaded?.body).toBe("This is the plan body.");
		expect(loaded?.createdAt.toISOString()).toBe("2026-02-25T12:00:00.000Z");
		expect(loaded?.updatedAt.toISOString()).toBe("2026-02-25T12:00:00.000Z");
	});

	test("preserves markdown body content", async () => {
		const now = new Date("2026-02-25T12:00:00.000Z");
		const body = `## Goals

- Build authentication system
- Support OAuth and SAML

## Phases

1. Phase 1: Core auth
2. Phase 2: SSO integration`;

		const plan: Omit<Plan, "spec"> = {
			slug: "auth-system",
			title: "Auth System",
			status: "active",
			createdAt: now,
			updatedAt: now,
			body,
		};

		await writePlanFile(testDir, "auth-system", plan);
		const loaded = await readPlanFile(testDir, "auth-system");

		expect(loaded?.body).toBe(body);
	});

	test("writes plan.md as valid frontmatter + markdown", async () => {
		const now = new Date("2026-02-25T12:00:00.000Z");
		const plan: Omit<Plan, "spec"> = {
			slug: "test-plan",
			title: "Test Plan",
			status: "active",
			createdAt: now,
			updatedAt: now,
			body: "Body content.",
		};

		await writePlanFile(testDir, "test-plan", plan);

		const content = await readFile(
			join(testDir, "forge", "plans", "test-plan", "plan.md"),
			"utf-8",
		);

		expect(content).toContain("---");
		expect(content).toContain("title: Test Plan");
		expect(content).toContain("status: active");
		expect(content).toContain("Body content.");
	});

	test("creates directories when writing plan file", async () => {
		const freshDir = await createTestDir();
		try {
			const now = new Date();
			const plan: Omit<Plan, "spec"> = {
				slug: "new-plan",
				title: "New Plan",
				status: "active",
				createdAt: now,
				updatedAt: now,
				body: "",
			};

			await writePlanFile(freshDir, "new-plan", plan);
			const loaded = await readPlanFile(freshDir, "new-plan");
			expect(loaded).not.toBeNull();
			expect(loaded?.title).toBe("New Plan");
		} finally {
			await cleanupTestDir(freshDir);
		}
	});

	test("handles empty body", async () => {
		const now = new Date("2026-02-25T12:00:00.000Z");
		const plan: Omit<Plan, "spec"> = {
			slug: "empty-plan",
			title: "Empty Plan",
			status: "active",
			createdAt: now,
			updatedAt: now,
			body: "",
		};

		await writePlanFile(testDir, "empty-plan", plan);
		const loaded = await readPlanFile(testDir, "empty-plan");

		expect(loaded?.body).toBe("");
	});

	test("defaults to active status for invalid status values", async () => {
		const planDir = join(testDir, "forge", "plans", "bad-status");
		await createPlanDirectory(testDir, "bad-status");
		await writeFile(
			join(planDir, "plan.md"),
			`---
title: Bad Status
status: invalid
createdAt: 2026-02-25T12:00:00.000Z
updatedAt: 2026-02-25T12:00:00.000Z
---

Body.`,
			"utf-8",
		);

		const loaded = await readPlanFile(testDir, "bad-status");
		expect(loaded?.status).toBe("active");
	});
});

describe("readSpecFile / writeSpecFile", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = await createTestDir();
		await ensurePlansDirectory(testDir);
	});

	afterEach(async () => {
		await cleanupTestDir(testDir);
	});

	test("returns null when spec file does not exist", async () => {
		await createPlanDirectory(testDir, "no-spec");
		const result = await readSpecFile(testDir, "no-spec");
		expect(result).toBeNull();
	});

	test("returns null when plan directory does not exist", async () => {
		const result = await readSpecFile(testDir, "nonexistent");
		expect(result).toBeNull();
	});

	test("writes and reads spec file", async () => {
		await createPlanDirectory(testDir, "with-spec");
		const specContent = `# Specification

## Requirements

1. Must handle 1000 concurrent users
2. Must support OAuth 2.0`;

		await writeSpecFile(testDir, "with-spec", specContent);
		const loaded = await readSpecFile(testDir, "with-spec");

		expect(loaded).toBe(specContent);
	});

	test("overwrites existing spec file", async () => {
		await createPlanDirectory(testDir, "overwrite");

		await writeSpecFile(testDir, "overwrite", "original");
		await writeSpecFile(testDir, "overwrite", "updated");

		const loaded = await readSpecFile(testDir, "overwrite");
		expect(loaded).toBe("updated");
	});
});
