import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlanManager } from "../../../../lib/plans/plan-manager.ts";

describe("plan edit command", () => {
	let tempDir: string;
	let manager: PlanManager;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "plan-edit-test-"));
		manager = new PlanManager(tempDir);
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("updates title", async () => {
		await manager.createPlan({ slug: "editable", title: "Original" });
		const updated = await manager.updatePlan("editable", {
			title: "New Title",
		});

		expect(updated.title).toBe("New Title");
	});

	it("updates status", async () => {
		await manager.createPlan({ slug: "status-test", title: "Status Test" });
		const updated = await manager.updatePlan("status-test", {
			status: "completed",
		});

		expect(updated.status).toBe("completed");
	});

	it("updates body", async () => {
		await manager.createPlan({ slug: "body-test", title: "Body Test" });
		const updated = await manager.updatePlan("body-test", {
			body: "New body content",
		});

		expect(updated.body).toBe("New body content");
	});

	it("updates spec", async () => {
		await manager.createPlan({ slug: "spec-test", title: "Spec Test" });
		const updated = await manager.updatePlan("spec-test", {
			spec: "New spec",
		});

		expect(updated.spec).toBe("New spec");
	});

	it("throws for non-existent plan", async () => {
		await expect(
			manager.updatePlan("nonexistent", { title: "Nope" }),
		).rejects.toThrow("Plan not found: nonexistent");
	});

	it("updates multiple fields at once", async () => {
		await manager.createPlan({ slug: "multi", title: "Multi" });
		const updated = await manager.updatePlan("multi", {
			title: "Updated Multi",
			status: "completed",
			body: "Updated body",
		});

		expect(updated.title).toBe("Updated Multi");
		expect(updated.status).toBe("completed");
		expect(updated.body).toBe("Updated body");
	});
});
