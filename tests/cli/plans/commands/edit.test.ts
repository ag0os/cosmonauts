import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	buildPlanUpdate,
	registerEditCommand,
	renderPlanEditSuccess,
} from "../../../../cli/plans/commands/edit.ts";
import { PlanManager } from "../../../../lib/plans/plan-manager.ts";
import type { Plan } from "../../../../lib/plans/plan-types.ts";
import {
	type CommandTestContext,
	type captureCommandOutput,
	createCommandProgram,
	createCommandTestContext,
	type mockProcessExitThrow,
	ProcessExitError,
} from "../../../helpers/cli.ts";
import { createPlanFixture } from "../../../helpers/plans.ts";

describe("buildPlanUpdate", () => {
	it("builds an update input and changed field list", () => {
		expect(
			buildPlanUpdate({
				title: "Updated",
				status: "completed",
				body: "Line 1\\nLine 2",
				spec: "Spec 1\\nSpec 2",
			}),
		).toEqual({
			ok: true,
			value: {
				updateInput: {
					title: "Updated",
					status: "completed",
					body: "Line 1\nLine 2",
					spec: "Spec 1\nSpec 2",
				},
				changedFields: ["title", "status", "body", "spec"],
			},
		});
	});

	it("rejects invalid status values", () => {
		expect(buildPlanUpdate({ status: "paused" })).toEqual({
			ok: false,
			error: "Invalid status: paused. Must be one of: active, completed",
		});
	});

	it("rejects no-change options", () => {
		expect(buildPlanUpdate({})).toEqual({
			ok: false,
			error: "No changes specified. Use --help to see available options.",
		});
	});
});

describe("renderPlanEditSuccess", () => {
	const plan: Plan = {
		slug: "rendered-plan",
		title: "Rendered Plan",
		status: "active",
		createdAt: new Date("2026-01-01"),
		updatedAt: new Date("2026-01-02"),
		body: "",
	};

	it("returns the plan object for JSON mode", () => {
		expect(renderPlanEditSuccess(plan, ["title"], "json")).toBe(plan);
	});

	it("returns update lines for plain mode", () => {
		expect(renderPlanEditSuccess(plan, ["title", "status"], "plain")).toEqual([
			"updated rendered-plan",
			"title=updated",
			"status=updated",
		]);
	});

	it("returns human success lines for human mode", () => {
		expect(renderPlanEditSuccess(plan, ["title"], "human")).toEqual([
			"Updated plan rendered-plan: Rendered Plan",
			"Changed: title",
		]);
	});
});

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

describe("plan edit CLI", () => {
	let tempDir: string;
	let output: ReturnType<typeof captureCommandOutput>;
	let exit: ReturnType<typeof mockProcessExitThrow>;
	let context: CommandTestContext;
	let manager: PlanManager;

	beforeEach(async () => {
		context = await createCommandTestContext("plan-edit-command-test-");
		tempDir = context.tempDir;
		output = context.output;
		exit = context.exit;
		manager = new PlanManager(tempDir);
	});

	afterEach(async () => {
		await context.restore();
	});

	it("prints invalid status errors in human mode", async () => {
		await expectPlanEditExit(["edit", "editable", "--status", "paused"]);

		expect(output.stdout()).toBe("");
		expect(output.stderr()).toBe(
			"Error: Invalid status: paused. Must be one of: active, completed\n",
		);
		expect(exit.calls()).toEqual([1]);
	});

	it("prints no-change errors in JSON mode", async () => {
		await createPlanFixture(manager, { slug: "no-change", title: "No Change" });

		await expectPlanEditExit(["--json", "edit", "no-change"]);

		expect(output.stdout()).toBe(
			'{\n  "error": "No changes specified. Use --help to see available options."\n}\n',
		);
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([1]);
	});

	it("processes escaped newlines for body and spec", async () => {
		await createPlanFixture(manager, { slug: "newlines", title: "Newlines" });

		await parsePlanEdit([
			"node",
			"test",
			"edit",
			"newlines",
			"--body",
			"Body line 1\\nBody line 2",
			"--spec",
			"Spec line 1\\nSpec line 2",
		]);

		const updated = await manager.getPlan("newlines");
		expect(updated?.body).toBe("Body line 1\nBody line 2");
		expect(updated?.spec).toBe("Spec line 1\nSpec line 2");
		expect(output.stdout()).toBe(
			"Updated plan newlines: Newlines\nChanged: body, spec\n",
		);
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([]);
	});

	it("prints JSON success output", async () => {
		const plan = await createPlanFixture(manager, {
			slug: "json-success",
			title: "JSON Success",
		});

		await parsePlanEdit([
			"node",
			"test",
			"--json",
			"edit",
			"json-success",
			"--title",
			"JSON Updated",
		]);

		const rendered = JSON.parse(output.stdout()) as Plan;
		expect(rendered).toMatchObject({
			slug: plan.slug,
			title: "JSON Updated",
			status: "active",
			body: "",
		});
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([]);
	});

	it("prints plain success output", async () => {
		await createPlanFixture(manager, { slug: "plain-success", title: "Plain" });

		await parsePlanEdit([
			"node",
			"test",
			"--plain",
			"edit",
			"plain-success",
			"--title",
			"Plain Updated",
			"--status",
			"completed",
		]);

		expect(output.stdout()).toBe(
			"updated plain-success\ntitle=updated\nstatus=updated\n",
		);
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([]);
	});

	it("prints human success output", async () => {
		await createPlanFixture(manager, { slug: "human-success", title: "Human" });

		await parsePlanEdit([
			"node",
			"test",
			"edit",
			"human-success",
			"--title",
			"Human Updated",
		]);

		expect(output.stdout()).toBe(
			"Updated plan human-success: Human Updated\nChanged: title\n",
		);
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([]);
	});

	it("prints not-found errors in human mode", async () => {
		await expectPlanEditExit(["edit", "missing-plan", "--title", "Missing"]);

		expect(output.stdout()).toBe("");
		expect(output.stderr()).toBe(
			"Error updating plan: Error: Plan not found: missing-plan\n",
		);
		expect(exit.calls()).toEqual([1]);
	});

	it("prints manager errors in JSON mode", async () => {
		await createPlanFixture(manager, { slug: "manager-error", title: "Error" });
		vi.spyOn(PlanManager.prototype, "updatePlan").mockRejectedValue(
			new Error("disk full"),
		);

		await expectPlanEditExit([
			"--json",
			"edit",
			"manager-error",
			"--title",
			"Failure",
		]);

		expect(output.stdout()).toBe(
			'{\n  "error": "Error updating plan: Error: disk full"\n}\n',
		);
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([1]);
	});
});

async function parsePlanEdit(argv: string[]): Promise<void> {
	await createCommandProgram(registerEditCommand).parseAsync(argv);
}

async function expectPlanEditExit(args: string[]): Promise<void> {
	const argv = ["node", "test", ...args];
	const execution = createCommandProgram(registerEditCommand).parseAsync(argv);

	await expect(execution).rejects.toThrow(ProcessExitError);
}
