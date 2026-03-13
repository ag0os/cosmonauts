import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlanManager } from "../../../../lib/plans/plan-manager.ts";

describe("plan create command", () => {
	let tempDir: string;
	let manager: PlanManager;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "plan-create-test-"));
		manager = new PlanManager(tempDir);
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("creates a plan with slug and title", async () => {
		const plan = await manager.createPlan({
			slug: "test-plan",
			title: "Test Plan",
		});

		expect(plan.slug).toBe("test-plan");
		expect(plan.title).toBe("Test Plan");
		expect(plan.status).toBe("active");
	});

	it("creates a plan with description", async () => {
		const plan = await manager.createPlan({
			slug: "with-desc",
			title: "With Description",
			description: "A detailed description.",
		});

		expect(plan.body).toBe("A detailed description.");
	});

	it("creates a plan with spec", async () => {
		const plan = await manager.createPlan({
			slug: "with-spec",
			title: "With Spec",
			spec: "# Spec content",
		});

		expect(plan.spec).toBe("# Spec content");
	});

	it("rejects duplicate slugs", async () => {
		await manager.createPlan({ slug: "dupe", title: "First" });

		await expect(
			manager.createPlan({ slug: "dupe", title: "Second" }),
		).rejects.toThrow("Plan already exists: dupe");
	});

	it("rejects invalid slugs", async () => {
		await expect(
			manager.createPlan({ slug: "Invalid_Slug", title: "Bad" }),
		).rejects.toThrow(/Invalid plan slug/);
	});
});
