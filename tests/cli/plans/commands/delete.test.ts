import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlanManager } from "../../../../lib/plans/plan-manager.ts";

describe("plan delete command", () => {
	let tempDir: string;
	let manager: PlanManager;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "plan-delete-test-"));
		manager = new PlanManager(tempDir);
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("deletes an existing plan", async () => {
		await manager.createPlan({ slug: "to-delete", title: "To Delete" });

		await manager.deletePlan("to-delete");

		const plan = await manager.getPlan("to-delete");
		expect(plan).toBeNull();
	});

	it("throws for non-existent plan", async () => {
		await expect(manager.deletePlan("nonexistent")).rejects.toThrow(
			"Plan not found: nonexistent",
		);
	});

	it("does not affect other plans", async () => {
		await manager.createPlan({ slug: "keep-me", title: "Keep" });
		await manager.createPlan({ slug: "remove-me", title: "Remove" });

		await manager.deletePlan("remove-me");

		const kept = await manager.getPlan("keep-me");
		expect(kept).not.toBeNull();

		const removed = await manager.getPlan("remove-me");
		expect(removed).toBeNull();
	});
});
