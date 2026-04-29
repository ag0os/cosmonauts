import { describe, expect, it } from "vitest";
import { PlanManager } from "../../lib/plans/plan-manager.ts";
import { captureCliOutput, mockProcessExit } from "./cli.ts";
import { useTempDir } from "./fs.ts";
import { createPlanFixture } from "./plans.ts";
import { createInitializedTaskManager, createTaskFixture } from "./tasks.ts";

describe("test fixture helpers", () => {
	const tmp = useTempDir("fixture-helpers-test-");

	it("initializes task managers with a configurable prefix", async () => {
		const manager = await createInitializedTaskManager(tmp.path, "FIX");

		const task = await createTaskFixture(manager);

		expect(task.id).toBe("FIX-001");
		expect(task.title).toBe("Fixture Task");
		expect(await manager.getTask(task.id)).not.toBeNull();
	});

	it("creates plan fixtures with overrides", async () => {
		const manager = new PlanManager(tmp.path);

		const plan = await createPlanFixture(manager, {
			slug: "custom-plan",
			title: "Custom Plan",
			description: "Custom body",
			spec: "# Custom Spec",
		});

		expect(plan.slug).toBe("custom-plan");
		expect(plan.title).toBe("Custom Plan");
		expect(plan.body).toBe("Custom body");
		expect(plan.spec).toBe("# Custom Spec");
		expect(await manager.getPlan("custom-plan")).not.toBeNull();
	});

	it("captures stdout and stderr then restores stream mocks", () => {
		const originalStdoutWrite = process.stdout.write;
		const originalStderrWrite = process.stderr.write;
		const output = captureCliOutput();

		try {
			process.stdout.write("hello\n");
			process.stderr.write("problem\n");

			expect(output.stdout()).toBe("hello\n");
			expect(output.stderr()).toBe("problem\n");
		} finally {
			output.restore();
		}

		expect(process.stdout.write).toBe(originalStdoutWrite);
		expect(process.stderr.write).toBe(originalStderrWrite);
	});

	it("captures process.exit calls then restores the mock", () => {
		const originalExit = process.exit;
		const exit = mockProcessExit();

		try {
			expect(() => process.exit(2)).not.toThrow();

			expect(exit.calls()).toEqual([2]);
		} finally {
			exit.restore();
		}

		expect(process.exit).toBe(originalExit);
	});
});
