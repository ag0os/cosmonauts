/**
 * Tests for plan file-system.ts
 * Covers file I/O operations with temp directory isolation
 */

import {
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
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
import { assessPlanReviewRound } from "../../lib/plans/index.ts";
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

	test("creates missions/plans/ directory", async () => {
		await ensurePlansDirectory(testDir);

		const plansDir = join(testDir, "missions", "plans");
		const stats = await stat(plansDir);
		expect(stats.isDirectory()).toBe(true);
	});

	test("returns path to missions/plans/", async () => {
		const result = await ensurePlansDirectory(testDir);
		expect(result).toBe(join(testDir, "missions", "plans"));
	});

	test("is idempotent - calling multiple times succeeds", async () => {
		await ensurePlansDirectory(testDir);
		await ensurePlansDirectory(testDir);
		await ensurePlansDirectory(testDir);

		const plansDir = join(testDir, "missions", "plans");
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
		const plansDir = join(testDir, "missions", "plans");
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

	test("creates plan directory under missions/plans/", async () => {
		const dirPath = await createPlanDirectory(testDir, "auth-system");

		expect(dirPath).toBe(join(testDir, "missions", "plans", "auth-system"));
		const stats = await stat(dirPath);
		expect(stats.isDirectory()).toBe(true);
	});

	test("creates parent directories if needed", async () => {
		await createPlanDirectory(testDir, "new-plan");

		const missionsDir = join(testDir, "missions");
		const stats = await stat(missionsDir);
		expect(stats.isDirectory()).toBe(true);
	});

	test("deletes plan directory and contents", async () => {
		await createPlanDirectory(testDir, "to-delete");
		const planDir = join(testDir, "missions", "plans", "to-delete");
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
			join(testDir, "missions", "plans", "test-plan", "plan.md"),
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
		const planDir = join(testDir, "missions", "plans", "bad-status");
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

describe("plan review rounds", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = await createTestDir();
		await ensurePlansDirectory(testDir);
	});

	afterEach(async () => {
		await cleanupTestDir(testDir);
	});

	// @cosmo-behavior plan:chain-stage-context#B-005
	test("derives a safe latest review round and ignores quoted or fenced references", async () => {
		const plansRoot = join(testDir, "missions", "plans");
		const validFinding = (options?: {
			id?: string;
			severity?: string;
			omit?: string;
		}) => {
			const fields = [
				["id", options?.id ?? "PR-001"],
				["dimension", "interface-fidelity"],
				["severity", options?.severity ?? "high"],
				["title", '"Concrete finding"'],
				["plan_refs", "D-001"],
				["code_refs", "lib/example.ts:1"],
				["description", "|\n    Concrete description."],
			].filter(([name]) => name !== options?.omit);
			return fields
				.map(
					([name, value], index) =>
						`${index === 0 ? "-" : " "} ${name}: ${value}`,
				)
				.join("\n");
		};
		const review = (...findings: string[]) =>
			`# Plan Review\n\n## Findings\n\n${findings.join("\n\n")}\n\n## Assessment\n\nReview complete.\n`;
		const plan = (options?: { statusLine?: string; body?: string }) =>
			`---\ntitle: Review target\n${options?.statusLine ?? "status: active"}\n---\n\n${options?.body ?? "## Decision Log\n"}`;
		const createPlan = async (options: {
			slug: string;
			planMarkdown?: string;
			reviews?: Readonly<Record<string, string>>;
		}) => {
			const planDir = join(plansRoot, options.slug);
			await mkdir(planDir, { recursive: true });
			await writeFile(
				join(planDir, "plan.md"),
				options.planMarkdown ?? plan(),
				"utf-8",
			);
			for (const [name, content] of Object.entries(options.reviews ?? {})) {
				await writeFile(join(planDir, name), content, "utf-8");
			}
			return planDir;
		};
		const reasonFor = async (slug: string, reviewRound?: number) => {
			const result = await assessPlanReviewRound({
				projectRoot: testDir,
				planSlug: slug,
				reviewRound,
				assessment: "addressed",
			});
			return result.status === "blocked" ? result.reason : undefined;
		};

		await createPlan({
			slug: "addressed",
			planMarkdown: plan({
				body: `## Decision Log

- **D-001 - Address the latest review**
  - Decision: address ${"`"}review-2.md${"`"} PR-001 and review-2.md PR-002
  - Decided-by: derived
`,
			}),
			reviews: {
				"review.md": review(validFinding({ id: "PR-001", severity: "low" })),
				"review-2.md": review(
					validFinding({ id: "PR-001" }),
					validFinding({ id: "PR-002", severity: "medium" }),
				),
			},
		});
		expect(
			await assessPlanReviewRound({
				projectRoot: testDir,
				planSlug: "addressed",
				reviewRound: 2,
				assessment: "addressed",
			}),
		).toEqual({
			status: "accepted",
			planSlug: "addressed",
			reviewRound: 2,
			reviewFile: "review-2.md",
			allocationRounds: [1, 2],
			assessableRounds: [1, 2],
			blockingFindingIds: ["PR-001", "PR-002"],
			requiresRevision: true,
		});

		await createPlan({
			slug: "eligible-target",
			reviews: { "review-1.md": review(validFinding()) },
		});
		expect(
			await assessPlanReviewRound({
				projectRoot: testDir,
				planSlug: "eligible-target",
				reviewRound: 1,
				assessment: "target",
			}),
		).toMatchObject({
			status: "accepted",
			reviewRound: 1,
			blockingFindingIds: ["PR-001"],
			requiresRevision: true,
		});

		await createPlan({
			slug: "quoted-references",
			planMarkdown: plan({
				body: `## Decision Log

- **D-001 - Mentions are not references**
  - Decision: the whole citation ${"`"}review-1.md PR-001${"`"} is only an example

~~~md
- **D-002 - Fenced fake decision**
  - Decision: review-1.md PR-001
~~~
`,
			}),
			reviews: { "review-1.md": review(validFinding()) },
		});
		expect(
			await assessPlanReviewRound({
				projectRoot: testDir,
				planSlug: "quoted-references",
				assessment: "addressed",
			}),
		).toEqual({
			status: "blocked",
			reason: "missing-review-reference",
			planSlug: "quoted-references",
			reviewRound: 1,
			latestReviewRound: 1,
			findingIds: ["PR-001"],
		});

		for (const [slug, content] of [
			["low-only", review(validFinding({ severity: "low" }))],
			["empty-findings", review()],
		] as const) {
			await createPlan({ slug, reviews: { "review-1.md": content } });
			const result = await assessPlanReviewRound({
				projectRoot: testDir,
				planSlug: slug,
				assessment: "addressed",
			});
			expect(result, slug).toMatchObject({
				status: "accepted",
				reviewRound: 1,
				blockingFindingIds: [],
				requiresRevision: false,
			});
		}

		const historicalReviews: Record<string, string> = {};
		for (let round = 1; round <= 18; round += 1) {
			historicalReviews[`review-${round}.md`] = "# Review by another tool\n";
		}
		historicalReviews["review-19.md"] = review();
		await createPlan({
			slug: "living-memory-shape",
			reviews: historicalReviews,
		});
		expect(
			await assessPlanReviewRound({
				projectRoot: testDir,
				planSlug: "living-memory-shape",
				assessment: "addressed",
			}),
		).toMatchObject({
			status: "accepted",
			reviewRound: 19,
			allocationRounds: Array.from({ length: 19 }, (_, index) => index + 1),
			assessableRounds: [19],
		});

		await createPlan({
			slug: "missing-historical-files",
			reviews: { "review-19.md": review() },
		});
		expect(await reasonFor("missing-historical-files")).toBe(
			"review-round-gap",
		);

		await createPlan({
			slug: "non-findings-above",
			reviews: {
				"review-1.md": review(),
				"review-2.md": "# Review by another tool\n",
			},
		});
		expect(
			await assessPlanReviewRound({
				projectRoot: testDir,
				planSlug: "non-findings-above",
				reviewRound: 1,
				assessment: "addressed",
			}),
		).toMatchObject({
			status: "accepted",
			reviewRound: 1,
			allocationRounds: [1, 2],
			assessableRounds: [1],
		});

		await createPlan({
			slug: "stale-report",
			reviews: { "review-1.md": review(), "review-2.md": review() },
		});
		expect(await reasonFor("stale-report", 1)).toBe("stale-review-round");

		for (const [slug, statusLine] of [
			["missing-status", ""],
			["unknown-status", "status: pending"],
			["unparseable-status", "status: ["],
		] as const) {
			await createPlan({
				slug,
				planMarkdown: plan({ statusLine }),
				reviews: { "review-1.md": review() },
			});
			expect(await reasonFor(slug), slug).toBe("plan-status-indeterminate");
		}
		await createPlan({
			slug: "inactive-plan",
			planMarkdown: plan({ statusLine: "status: completed" }),
			reviews: { "review-1.md": review() },
		});
		expect(await reasonFor("inactive-plan")).toBe("inactive-plan");
		expect(await reasonFor("missing-plan")).toBe("plan-not-found");

		const outsidePlan = await mkdtemp(join(tmpdir(), "outside-plan-"));
		try {
			await writeFile(join(outsidePlan, "plan.md"), plan(), "utf-8");
			await symlink(outsidePlan, join(plansRoot, "escaped-plan"));
			expect(await reasonFor("escaped-plan")).toBe("unsafe-plan-directory");
		} finally {
			await cleanupTestDir(outsidePlan);
		}

		const symlinkPlanDir = await createPlan({ slug: "symlink-review" });
		await writeFile(join(symlinkPlanDir, "outside.md"), review(), "utf-8");
		await symlink(
			join(symlinkPlanDir, "outside.md"),
			join(symlinkPlanDir, "review-1.md"),
		);
		expect(await reasonFor("symlink-review")).toBe("unsafe-review-entry");

		const directoryPlanDir = await createPlan({ slug: "directory-review" });
		await mkdir(join(directoryPlanDir, "review-1.md"));
		expect(await reasonFor("directory-review")).toBe("unsafe-review-entry");

		await createPlan({
			slug: "round-one-collision",
			reviews: { "review.md": review(), "review-1.md": review() },
		});
		expect(await reasonFor("round-one-collision")).toBe(
			"duplicate-review-round",
		);
		await createPlan({
			slug: "duplicate-logical-round",
			reviews: { "review-1.md": review(), "review-01.md": review() },
		});
		expect(await reasonFor("duplicate-logical-round")).toBe(
			"duplicate-review-round",
		);
		await createPlan({
			slug: "numeric-gap",
			reviews: { "review-1.md": review(), "review-3.md": review() },
		});
		expect(await reasonFor("numeric-gap")).toBe("review-round-gap");

		for (const [slug, malformedReview] of [
			["duplicate-finding-ids", review(validFinding(), validFinding())],
			["unknown-severity", review(validFinding({ severity: "critical" }))],
			["partial-finding", review(validFinding({ omit: "code_refs" }))],
		] as const) {
			await createPlan({
				slug,
				reviews: { "review-1.md": malformedReview },
			});
			expect(await reasonFor(slug), slug).toBe("malformed-review");
		}

		const unreadablePlanDir = await createPlan({ slug: "unreadable-review" });
		const unreadablePath = join(unreadablePlanDir, "review-1.md");
		await writeFile(unreadablePath, review(), "utf-8");
		await chmod(unreadablePath, 0o000);
		try {
			expect(await reasonFor("unreadable-review")).toBe("review-artifact-io");
		} finally {
			await chmod(unreadablePath, 0o600);
		}

		const source = await readFile(
			join(process.cwd(), "lib", "plans", "review-rounds.ts"),
			"utf-8",
		);
		expect(source).not.toMatch(
			/(?:from\s+|import\s*\(\s*)["']\.\.\/(?:orchestration|durable-runtime)(?:\/|["'])/,
		);
		const scannerSource = await readFile(
			join(process.cwd(), "lib", "artifacts", "markdown-scan.ts"),
			"utf-8",
		);
		expect(scannerSource).not.toMatch(
			/planSlug|reviewRound|Decision Log|## Findings|PR-\d{3}/,
		);
	});
});
