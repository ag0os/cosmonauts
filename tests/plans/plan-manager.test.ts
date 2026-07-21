/**
 * Tests for PlanManager class
 */

import {
	access,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createMarkdownMemoryStore,
	parseEpisodeRecord,
} from "../../lib/memory/index.ts";
import { PlanManager } from "../../lib/plans/plan-manager.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";

describe("PlanManager", () => {
	let tempDir: string;
	let manager: PlanManager;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "plan-manager-test-"));
		manager = new PlanManager(tempDir);
	});

	afterEach(async () => {
		vi.useRealTimers();
		await rm(tempDir, { recursive: true, force: true });
	});

	it("adds gated fail-soft episodes only for plan creation and real status transitions @cosmo-behavior plan:episodic-log#B-013", async () => {
		vi.useFakeTimers();
		const baselineRoot = join(tempDir, "disabled-baseline");
		const contextualRoot = join(tempDir, "disabled-contextual");
		const disabledWarnings: unknown[] = [];
		const baselineManager = new PlanManager(baselineRoot);
		const contextualManager = new PlanManager(contextualRoot, {
			episodeSource: "custom/plan-owner",
			reportEpisodeWarning: async (warning) => {
				disabledWarnings.push(warning);
			},
		});

		const runDisabledLifecycle = async (target: PlanManager) => {
			vi.setSystemTime(new Date("2026-07-21T12:00:00.000Z"));
			const created = await target.createPlan({
				slug: "disabled-plan",
				title: "Disabled Plan",
				description: "Pinned disabled body.",
				spec: "Pinned disabled spec.",
			});
			vi.setSystemTime(new Date("2026-07-21T12:01:00.000Z"));
			await target.updatePlan("disabled-plan", { title: "Renamed Plan" });
			vi.setSystemTime(new Date("2026-07-21T12:02:00.000Z"));
			const updated = await target.updatePlan("disabled-plan", {
				status: "completed",
			});
			return { created, updated };
		};

		const baseline = await runDisabledLifecycle(baselineManager);
		const contextual = await runDisabledLifecycle(contextualManager);
		expect(contextual).toEqual(baseline);
		expect(
			await readFile(
				join(contextualRoot, "missions/plans/disabled-plan/plan.md"),
				"utf-8",
			),
		).toBe(
			await readFile(
				join(baselineRoot, "missions/plans/disabled-plan/plan.md"),
				"utf-8",
			),
		);
		expect(
			await readFile(
				join(contextualRoot, "missions/plans/disabled-plan/spec.md"),
				"utf-8",
			),
		).toBe(
			await readFile(
				join(baselineRoot, "missions/plans/disabled-plan/spec.md"),
				"utf-8",
			),
		);
		expect(disabledWarnings).toEqual([]);
		await expect(access(join(contextualRoot, "memory"))).rejects.toMatchObject({
			code: "ENOENT",
		});

		const enabledRoot = join(tempDir, "enabled");
		await writeEpisodicConfig(enabledRoot);
		const enabledManager = new PlanManager(enabledRoot, {
			episodeSource: "custom/plan-owner",
		});
		vi.setSystemTime(new Date("2026-07-21T13:00:00.000Z"));
		const created = await enabledManager.createPlan({
			slug: "captured-plan",
			title: "Captured Plan",
		});
		const originalCreatedAt = created.createdAt.toISOString();
		vi.setSystemTime(new Date("2026-07-21T13:01:00.000Z"));
		await enabledManager.updatePlan("captured-plan", {
			title: "Renamed Captured Plan",
		});
		vi.setSystemTime(new Date("2026-07-21T13:02:00.000Z"));
		await enabledManager.updatePlan("captured-plan", {
			body: "A body-only edit.",
		});
		vi.setSystemTime(new Date("2026-07-21T13:03:00.000Z"));
		await enabledManager.updatePlan("captured-plan", { status: "active" });
		vi.setSystemTime(new Date("2026-07-21T13:04:00.000Z"));
		const completed = await enabledManager.updatePlan("captured-plan", {
			status: "completed",
		});
		vi.setSystemTime(new Date("2026-07-21T13:05:00.000Z"));
		await enabledManager.updatePlan("captured-plan", { status: "completed" });
		vi.setSystemTime(new Date("2026-07-21T13:06:00.000Z"));
		await enabledManager.updatePlan("captured-plan", { status: "active" });

		const captured = await readProjectEpisodes(enabledRoot);
		expect(captured).toHaveLength(3);
		expect(
			captured.map((record) => ({
				source: record.source,
				metadata: parseEpisodeRecord(record),
				content: record.content,
			})),
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					source: "custom/plan-owner",
					metadata: expect.objectContaining({
						action: "plan.created",
						outcome: "active",
						subject: { kind: "plan", id: "captured-plan" },
					}),
				}),
				expect.objectContaining({
					source: "custom/plan-owner",
					metadata: expect.objectContaining({
						action: "plan.status-changed",
						outcome: "completed",
						subject: { kind: "plan", id: "captured-plan" },
					}),
					content: expect.stringContaining("active to completed"),
				}),
				expect.objectContaining({
					source: "custom/plan-owner",
					metadata: expect.objectContaining({
						action: "plan.status-changed",
						outcome: "active",
						subject: { kind: "plan", id: "captured-plan" },
					}),
					content: expect.stringContaining("completed to active"),
				}),
			]),
		);
		expect(completed.createdAt.toISOString()).toBe(originalCreatedAt);

		const failureRoot = join(tempDir, "capture-failure");
		await writeEpisodicConfig(failureRoot);
		await writeFile(join(failureRoot, "memory"), "path collision", "utf-8");
		const persistedStates: Array<{
			readonly status: string | undefined;
			readonly spec: string | undefined;
		}> = [];
		const warnings: unknown[] = [];
		const failingManager = new PlanManager(failureRoot, {
			episodeSource: "custom/plan-owner",
			reportEpisodeWarning: async (warning) => {
				const persisted = await new PlanManager(failureRoot).getPlan(
					"faulty-plan",
				);
				persistedStates.push({
					status: persisted?.status,
					spec: persisted?.spec,
				});
				warnings.push(warning);
			},
		});
		vi.setSystemTime(new Date("2026-07-21T14:00:00.000Z"));
		const failureCreated = await failingManager.createPlan({
			slug: "faulty-plan",
			title: "Faulty Capture",
			spec: "Persisted before create capture.",
		});
		vi.setSystemTime(new Date("2026-07-21T14:01:00.000Z"));
		const failureUpdated = await failingManager.updatePlan("faulty-plan", {
			status: "completed",
			spec: "Persisted before status capture.",
		});

		expect(failureUpdated.status).toBe("completed");
		expect(failureUpdated.createdAt).toEqual(failureCreated.createdAt);
		expect(persistedStates).toEqual([
			{ status: "active", spec: "Persisted before create capture." },
			{ status: "completed", spec: "Persisted before status capture." },
		]);
		expect(warnings).toHaveLength(2);
		expect(warnings).toEqual([
			expect.objectContaining({
				message: expect.stringContaining("Episode capture skipped"),
			}),
			expect.objectContaining({
				message: expect.stringContaining("Episode capture skipped"),
			}),
		]);
	});

	describe("createPlan", () => {
		it("should create a plan with required fields", async () => {
			const plan = await manager.createPlan({
				slug: "auth-system",
				title: "Auth System",
			});

			expect(plan.slug).toBe("auth-system");
			expect(plan.title).toBe("Auth System");
			expect(plan.status).toBe("active");
			expect(plan.body).toBe("");
			expect(plan.spec).toBeUndefined();
			expect(plan.createdAt).toBeInstanceOf(Date);
			expect(plan.updatedAt).toBeInstanceOf(Date);
		});

		it("should create a plan with description as body", async () => {
			const plan = await manager.createPlan({
				slug: "api-redesign",
				title: "API Redesign",
				description: "Redesign the entire API layer.",
			});

			expect(plan.body).toBe("Redesign the entire API layer.");
		});

		it("should create a plan with spec.md", async () => {
			const plan = await manager.createPlan({
				slug: "with-spec",
				title: "Plan With Spec",
				spec: "# Specification\n\nDetailed requirements here.",
			});

			expect(plan.spec).toBe("# Specification\n\nDetailed requirements here.");
		});

		it("should throw when creating a plan with duplicate slug", async () => {
			await manager.createPlan({
				slug: "duplicate",
				title: "First Plan",
			});

			await expect(
				manager.createPlan({
					slug: "duplicate",
					title: "Second Plan",
				}),
			).rejects.toThrow("Plan already exists: duplicate");
		});

		it("should create plan directory structure on disk", async () => {
			await manager.createPlan({
				slug: "disk-test",
				title: "Disk Test",
				description: "Body content.",
				spec: "Spec content.",
			});

			// Verify by reading back with a new manager
			const newManager = new PlanManager(tempDir);
			const plan = await newManager.getPlan("disk-test");

			expect(plan).not.toBeNull();
			expect(plan?.title).toBe("Disk Test");
			expect(plan?.body).toBe("Body content.");
			expect(plan?.spec).toBe("Spec content.");
		});
	});

	describe("getPlan", () => {
		it("should retrieve a plan by slug", async () => {
			await manager.createPlan({
				slug: "my-plan",
				title: "My Plan",
				description: "A plan description.",
			});

			const plan = await manager.getPlan("my-plan");

			expect(plan).not.toBeNull();
			expect(plan?.slug).toBe("my-plan");
			expect(plan?.title).toBe("My Plan");
			expect(plan?.body).toBe("A plan description.");
		});

		it("should return null for non-existent plan", async () => {
			const plan = await manager.getPlan("nonexistent");
			expect(plan).toBeNull();
		});

		it("should include spec when it exists", async () => {
			await manager.createPlan({
				slug: "has-spec",
				title: "Has Spec",
				spec: "The spec content.",
			});

			const plan = await manager.getPlan("has-spec");
			expect(plan?.spec).toBe("The spec content.");
		});

		it("should not include spec when it does not exist", async () => {
			await manager.createPlan({
				slug: "no-spec",
				title: "No Spec",
			});

			const plan = await manager.getPlan("no-spec");
			expect(plan?.spec).toBeUndefined();
		});
	});

	describe("listPlans", () => {
		it("should list all plans", async () => {
			await manager.createPlan({ slug: "plan-a", title: "Plan A" });
			await manager.createPlan({ slug: "plan-b", title: "Plan B" });
			await manager.createPlan({ slug: "plan-c", title: "Plan C" });

			const plans = await manager.listPlans();

			expect(plans).toHaveLength(3);
		});

		it("should return empty array when no plans exist", async () => {
			const plans = await manager.listPlans();
			expect(plans).toEqual([]);
		});

		it("should filter by status", async () => {
			await manager.createPlan({ slug: "active-plan", title: "Active Plan" });
			await manager.createPlan({
				slug: "completed-plan",
				title: "Completed Plan",
			});
			await manager.updatePlan("completed-plan", { status: "completed" });

			const activePlans = await manager.listPlans("active");
			expect(activePlans).toHaveLength(1);
			expect(activePlans[0]?.slug).toBe("active-plan");

			const completedPlans = await manager.listPlans("completed");
			expect(completedPlans).toHaveLength(1);
			expect(completedPlans[0]?.slug).toBe("completed-plan");
		});

		it("should return all plans when no filter is provided", async () => {
			await manager.createPlan({ slug: "plan-1", title: "Plan 1" });
			await manager.createPlan({ slug: "plan-2", title: "Plan 2" });
			await manager.updatePlan("plan-2", { status: "completed" });

			const allPlans = await manager.listPlans();
			expect(allPlans).toHaveLength(2);
		});
	});

	describe("updatePlan", () => {
		it("should update plan title", async () => {
			await manager.createPlan({
				slug: "updatable",
				title: "Original Title",
			});

			const updated = await manager.updatePlan("updatable", {
				title: "Updated Title",
			});

			expect(updated.title).toBe("Updated Title");
			expect(updated.slug).toBe("updatable");
		});

		it("should update plan status", async () => {
			await manager.createPlan({
				slug: "status-change",
				title: "Status Change",
			});

			const updated = await manager.updatePlan("status-change", {
				status: "completed",
			});

			expect(updated.status).toBe("completed");
		});

		it("should update both title and status simultaneously", async () => {
			await manager.createPlan({
				slug: "both-fields",
				title: "Original",
			});

			const updated = await manager.updatePlan("both-fields", {
				title: "New Title",
				status: "completed",
			});

			expect(updated.title).toBe("New Title");
			expect(updated.status).toBe("completed");
		});

		it("should update the updatedAt timestamp", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			await manager.createPlan({
				slug: "timestamp-test",
				title: "Timestamp Test",
			});

			const before = await manager.getPlan("timestamp-test");

			// Advance fake clock to guarantee timestamp difference
			vi.setSystemTime(new Date("2026-01-01T00:01:00Z"));

			const updated = await manager.updatePlan("timestamp-test", {
				title: "Updated",
			});

			expect(updated.updatedAt.getTime()).toBeGreaterThan(
				before?.updatedAt.getTime() ?? 0,
			);
		});

		it("should preserve body content after update", async () => {
			await manager.createPlan({
				slug: "preserve-body",
				title: "Preserve Body",
				description: "Important body content.",
			});

			const updated = await manager.updatePlan("preserve-body", {
				title: "New Title",
			});

			expect(updated.body).toBe("Important body content.");
		});

		it("should preserve spec after update", async () => {
			await manager.createPlan({
				slug: "preserve-spec",
				title: "Preserve Spec",
				spec: "Spec content.",
			});

			const updated = await manager.updatePlan("preserve-spec", {
				status: "completed",
			});

			expect(updated.spec).toBe("Spec content.");
		});

		it("round-trips behaviorsReviewPending across updates", async () => {
			await manager.createPlan({
				slug: "behavior-review-state",
				title: "Behavior Review State",
				description: "Initial body.",
			});

			const flagged = await manager.updatePlan("behavior-review-state", {
				behaviorsReviewPending: true,
			});
			expect(flagged.behaviorsReviewPending).toBe(true);

			const reloadedAfterFlag = await manager.getPlan("behavior-review-state");
			expect(reloadedAfterFlag?.behaviorsReviewPending).toBe(true);

			const updatedTitle = await manager.updatePlan("behavior-review-state", {
				title: "Updated Behavior Review State",
			});
			expect(updatedTitle.behaviorsReviewPending).toBe(true);

			const reloadedAfterTitleUpdate = await manager.getPlan(
				"behavior-review-state",
			);
			expect(reloadedAfterTitleUpdate?.behaviorsReviewPending).toBe(true);

			const cleared = await manager.updatePlan("behavior-review-state", {
				behaviorsReviewPending: false,
			});
			expect(cleared.behaviorsReviewPending).toBe(false);

			const reloadedAfterClear = await manager.getPlan("behavior-review-state");
			expect(reloadedAfterClear?.behaviorsReviewPending).toBe(false);
		});

		it("should throw error for non-existent plan", async () => {
			await expect(
				manager.updatePlan("nonexistent", { title: "New Title" }),
			).rejects.toThrow("Plan not found: nonexistent");
		});

		it("rejects path traversal slugs before updating", async () => {
			await expect(
				manager.updatePlan("../archive/plans/archived", {
					title: "Should Fail",
				}),
			).rejects.toThrow(
				"Invalid plan slug (path traversal): ../archive/plans/archived",
			);
		});

		it("preserves createdAt after update", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			const plan = await manager.createPlan({
				slug: "preserve-created",
				title: "Original",
			});
			const originalCreatedAt = plan.createdAt.toISOString();

			// Advance fake clock to ensure dates differ
			vi.setSystemTime(new Date("2026-01-01T00:01:00Z"));

			const updated = await manager.updatePlan("preserve-created", {
				title: "Updated",
			});
			expect(updated.createdAt.toISOString()).toBe(originalCreatedAt);
		});
	});

	describe("deletePlan", () => {
		it("should delete a plan", async () => {
			await manager.createPlan({
				slug: "to-delete",
				title: "To Delete",
			});

			await manager.deletePlan("to-delete");

			const plan = await manager.getPlan("to-delete");
			expect(plan).toBeNull();
		});

		it("should delete plan with spec", async () => {
			await manager.createPlan({
				slug: "with-spec",
				title: "With Spec",
				spec: "Spec content.",
			});

			await manager.deletePlan("with-spec");

			const plan = await manager.getPlan("with-spec");
			expect(plan).toBeNull();
		});

		it("should throw error for non-existent plan", async () => {
			await expect(manager.deletePlan("nonexistent")).rejects.toThrow(
				"Plan not found: nonexistent",
			);
		});

		it("should not affect other plans", async () => {
			await manager.createPlan({ slug: "keep-me", title: "Keep Me" });
			await manager.createPlan({ slug: "delete-me", title: "Delete Me" });

			await manager.deletePlan("delete-me");

			const remaining = await manager.listPlans();
			expect(remaining).toHaveLength(1);
			expect(remaining[0]?.slug).toBe("keep-me");
		});
	});

	describe("getPlanSummary", () => {
		let taskManager: TaskManager;

		beforeEach(async () => {
			taskManager = new TaskManager(tempDir);
			await taskManager.init({ prefix: "COSMO" });
		});

		it("should return plan summary with zero task count", async () => {
			await manager.createPlan({
				slug: "no-tasks",
				title: "No Tasks Plan",
			});

			const summary = await manager.getPlanSummary("no-tasks", taskManager);

			expect(summary).not.toBeNull();
			expect(summary?.slug).toBe("no-tasks");
			expect(summary?.title).toBe("No Tasks Plan");
			expect(summary?.status).toBe("active");
			expect(summary?.taskCount).toBe(0);
			expect(summary?.createdAt).toBeInstanceOf(Date);
			expect(summary?.updatedAt).toBeInstanceOf(Date);
		});

		it("should count tasks with matching plan label", async () => {
			await manager.createPlan({
				slug: "with-tasks",
				title: "With Tasks Plan",
			});

			// Create tasks with the plan label
			await taskManager.createTask({
				title: "Task 1",
				labels: ["plan:with-tasks"],
			});
			await taskManager.createTask({
				title: "Task 2",
				labels: ["plan:with-tasks"],
			});
			await taskManager.createTask({
				title: "Task 3",
				labels: ["plan:with-tasks"],
			});

			const summary = await manager.getPlanSummary("with-tasks", taskManager);

			expect(summary?.taskCount).toBe(3);
		});

		it("should not count tasks with different plan labels", async () => {
			await manager.createPlan({
				slug: "plan-a",
				title: "Plan A",
			});
			await manager.createPlan({
				slug: "plan-b",
				title: "Plan B",
			});

			await taskManager.createTask({
				title: "Task for A",
				labels: ["plan:plan-a"],
			});
			await taskManager.createTask({
				title: "Task for B",
				labels: ["plan:plan-b"],
			});
			await taskManager.createTask({
				title: "Task for A again",
				labels: ["plan:plan-a"],
			});

			const summaryA = await manager.getPlanSummary("plan-a", taskManager);
			const summaryB = await manager.getPlanSummary("plan-b", taskManager);

			expect(summaryA?.taskCount).toBe(2);
			expect(summaryB?.taskCount).toBe(1);
		});

		it("should not count tasks without plan labels", async () => {
			await manager.createPlan({
				slug: "selective",
				title: "Selective Plan",
			});

			await taskManager.createTask({
				title: "Labeled Task",
				labels: ["plan:selective"],
			});
			await taskManager.createTask({
				title: "Unlabeled Task",
				labels: ["other-label"],
			});
			await taskManager.createTask({
				title: "No Label Task",
			});

			const summary = await manager.getPlanSummary("selective", taskManager);

			expect(summary?.taskCount).toBe(1);
		});

		it("should return null for non-existent plan", async () => {
			const summary = await manager.getPlanSummary("nonexistent", taskManager);
			expect(summary).toBeNull();
		});
	});

	describe("slug validation", () => {
		it("rejects empty slug", async () => {
			await expect(
				manager.createPlan({ slug: "", title: "Empty" }),
			).rejects.toThrow("empty");
		});

		it("rejects path traversal slug", async () => {
			await expect(
				manager.createPlan({ slug: "../../escape", title: "Escape" }),
			).rejects.toThrow("path traversal");
		});

		it("rejects slug with forward slash", async () => {
			await expect(
				manager.createPlan({ slug: "some/path", title: "Slash" }),
			).rejects.toThrow("path traversal");
		});

		it("rejects slug with spaces", async () => {
			await expect(
				manager.createPlan({ slug: "has spaces", title: "Spaces" }),
			).rejects.toThrow("Invalid plan slug");
		});

		it("rejects slug with uppercase", async () => {
			await expect(
				manager.createPlan({ slug: "UpperCase", title: "Upper" }),
			).rejects.toThrow("Invalid plan slug");
		});

		it("rejects slug with special characters", async () => {
			await expect(
				manager.createPlan({ slug: "plan!", title: "Special" }),
			).rejects.toThrow("Invalid plan slug");
		});

		it("accepts valid lowercase-hyphenated slug", async () => {
			const plan = await manager.createPlan({
				slug: "valid-slug-123",
				title: "Valid",
			});
			expect(plan.slug).toBe("valid-slug-123");
		});
	});

	describe("full lifecycle", () => {
		it("should support complete Create -> Update -> Get -> Delete workflow", async () => {
			// Step 1: Create a plan
			const created = await manager.createPlan({
				slug: "lifecycle-test",
				title: "Lifecycle Test",
				description: "Testing the full lifecycle.",
				spec: "Spec for lifecycle test.",
			});

			expect(created.slug).toBe("lifecycle-test");
			expect(created.status).toBe("active");
			expect(created.body).toBe("Testing the full lifecycle.");
			expect(created.spec).toBe("Spec for lifecycle test.");

			// Step 2: Update the plan
			const updated = await manager.updatePlan("lifecycle-test", {
				title: "Updated Lifecycle Test",
				status: "completed",
			});

			expect(updated.title).toBe("Updated Lifecycle Test");
			expect(updated.status).toBe("completed");
			expect(updated.body).toBe("Testing the full lifecycle.");
			expect(updated.spec).toBe("Spec for lifecycle test.");

			// Step 3: Retrieve and verify
			const retrieved = await manager.getPlan("lifecycle-test");
			expect(retrieved).not.toBeNull();
			expect(retrieved?.title).toBe("Updated Lifecycle Test");
			expect(retrieved?.status).toBe("completed");
			expect(retrieved?.body).toBe("Testing the full lifecycle.");
			expect(retrieved?.spec).toBe("Spec for lifecycle test.");

			// Step 4: Delete
			await manager.deletePlan("lifecycle-test");
			const deleted = await manager.getPlan("lifecycle-test");
			expect(deleted).toBeNull();

			// Step 5: Verify list is empty
			const plans = await manager.listPlans();
			expect(plans).toHaveLength(0);
		});

		it("should persist plans across PlanManager instances", async () => {
			await manager.createPlan({
				slug: "persistent",
				title: "Persistent Plan",
				description: "Should survive.",
			});

			// Create new manager for same directory
			const newManager = new PlanManager(tempDir);

			const plan = await newManager.getPlan("persistent");
			expect(plan).not.toBeNull();
			expect(plan?.title).toBe("Persistent Plan");
			expect(plan?.body).toBe("Should survive.");
		});
	});
});

async function writeEpisodicConfig(projectRoot: string): Promise<void> {
	const configDir = join(projectRoot, ".cosmonauts");
	await mkdir(configDir, { recursive: true });
	await writeFile(
		join(configDir, "config.json"),
		JSON.stringify({ episodicLog: { enabled: true } }),
		"utf-8",
	);
}

async function readProjectEpisodes(projectRoot: string) {
	return (
		await createMarkdownMemoryStore({ projectRoot }).retrieve(
			{ projectRoot, scopes: ["project"] },
			{ text: "", recordTypes: ["episode"] },
		)
	).records;
}
