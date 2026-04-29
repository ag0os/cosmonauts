import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	loadPlanSummaries,
	parsePlanStatusFilter,
	registerListCommand,
	renderPlanSummaries,
} from "../../../../cli/plans/commands/list.ts";
import { PlanManager } from "../../../../lib/plans/plan-manager.ts";
import type { PlanSummary } from "../../../../lib/plans/plan-types.ts";
import type { TaskManager } from "../../../../lib/tasks/task-manager.ts";
import {
	createCommandProgram,
	createCommandTestContext,
	ProcessExitError,
} from "../../../helpers/cli.ts";
import { useTempDir } from "../../../helpers/fs.ts";
import { createPlanFixture } from "../../../helpers/plans.ts";
import {
	createInitializedTaskManager,
	createTaskFixture,
} from "../../../helpers/tasks.ts";

const renderedSummary: PlanSummary = {
	slug: "rendered-plan",
	title: "Rendered Plan",
	status: "active",
	createdAt: new Date("2026-01-01"),
	updatedAt: new Date("2026-01-01"),
	taskCount: 3,
};

describe("parsePlanStatusFilter", () => {
	it("returns undefined when no status is provided", () => {
		expect(parsePlanStatusFilter(undefined)).toEqual({
			ok: true,
			value: undefined,
		});
	});

	it("accepts active status", () => {
		expect(parsePlanStatusFilter("active")).toEqual({
			ok: true,
			value: "active",
		});
	});

	it("accepts completed status", () => {
		expect(parsePlanStatusFilter("completed")).toEqual({
			ok: true,
			value: "completed",
		});
	});

	it("rejects invalid status values", () => {
		expect(parsePlanStatusFilter("pending")).toEqual({
			ok: false,
			error: "Invalid status: pending. Must be one of: active, completed",
		});
	});
});

describe("renderPlanSummaries", () => {
	it("returns summaries for JSON mode", () => {
		expect(renderPlanSummaries([renderedSummary], "json")).toEqual([
			renderedSummary,
		]);
	});

	it("returns rows for plain mode", () => {
		expect(renderPlanSummaries([renderedSummary], "plain")).toEqual([
			"rendered-plan | active | 3 tasks | Rendered Plan",
		]);
	});

	it("returns empty human output", () => {
		expect(renderPlanSummaries([], "human")).toEqual(["No plans found"]);
	});

	it("returns a human table", () => {
		expect(renderPlanSummaries([renderedSummary], "human")).toEqual([
			"SLUG           STATUS       TASKS    TITLE",
			"rendered-plan  active       3        Rendered Plan",
		]);
	});
});

describe("plan list command", () => {
	const tmp = useTempDir("plan-list-test-");
	let planManager: PlanManager;
	let taskManager: TaskManager;

	beforeEach(async () => {
		planManager = new PlanManager(tmp.path);
		taskManager = await createInitializedTaskManager(tmp.path);
	});

	it("returns empty list when no plans exist", async () => {
		const plans = await planManager.listPlans();
		expect(plans).toEqual([]);
	});

	it("lists all plans", async () => {
		await createPlanFixture(planManager, { slug: "plan-a", title: "Plan A" });
		await createPlanFixture(planManager, { slug: "plan-b", title: "Plan B" });

		const plans = await planManager.listPlans();
		expect(plans).toHaveLength(2);
	});

	it("filters by status", async () => {
		await planManager.createPlan({ slug: "active-plan", title: "Active" });
		await planManager.createPlan({
			slug: "completed-plan",
			title: "Completed",
		});
		await planManager.updatePlan("completed-plan", { status: "completed" });

		const active = await planManager.listPlans("active");
		expect(active).toHaveLength(1);
		expect(active[0]?.slug).toBe("active-plan");

		const completed = await planManager.listPlans("completed");
		expect(completed).toHaveLength(1);
		expect(completed[0]?.slug).toBe("completed-plan");
	});

	it("gets plan summary with task count", async () => {
		await createPlanFixture(planManager, { slug: "counted", title: "Counted" });
		await taskManager.createTask({
			title: "Task 1",
			labels: ["plan:counted"],
		});
		await taskManager.createTask({
			title: "Task 2",
			labels: ["plan:counted"],
		});

		const summary = await planManager.getPlanSummary("counted", taskManager);
		expect(summary).not.toBeNull();
		expect(summary?.taskCount).toBe(2);
	});
});

describe("plan list command output", () => {
	it("prints invalid status errors in human mode", async () => {
		const result = await runPlanListCommand(["list", "--status", "pending"]);

		expect(result.stdout).toBe("");
		expect(result.stderr).toBe(
			"Invalid status: pending. Must be one of: active, completed\n",
		);
		expect(result.exitCalls).toEqual([1]);
	});

	it("prints invalid status errors in JSON mode", async () => {
		const result = await runPlanListCommand([
			"--json",
			"list",
			"--status",
			"pending",
		]);

		expect(JSON.parse(result.stdout)).toEqual({
			error: "Invalid status: pending. Must be one of: active, completed",
		});
		expect(result.stderr).toBe("");
		expect(result.exitCalls).toEqual([1]);
	});

	it("prints empty human output", async () => {
		const result = await runPlanListCommand(["list"]);

		expect(result).toMatchObject({
			stdout: "No plans found\n",
			stderr: "",
			exitCalls: [],
		});
	});

	it("prints JSON output with task count", async () => {
		const result = await runPlanListCommand(["--json", "list"], (projectRoot) =>
			createPlanWithTask(projectRoot, "json-plan", "JSON Plan"),
		);

		const plans = JSON.parse(result.stdout) as Array<{
			slug: string;
			taskCount: number;
		}>;
		expect(plans).toHaveLength(1);
		expect(plans[0]).toMatchObject({
			slug: "json-plan",
			taskCount: 1,
		});
		expect(result.stderr).toBe("");
		expect(result.exitCalls).toEqual([]);
	});

	it("prints plain output with task count", async () => {
		const result = await runPlanListCommand(
			["--plain", "list"],
			(projectRoot) =>
				createPlanWithTask(projectRoot, "plain-plan", "Plain Plan"),
		);

		expect(result.stdout).toBe("plain-plan | active | 1 tasks | Plain Plan\n");
		expect(result.stderr).toBe("");
		expect(result.exitCalls).toEqual([]);
	});

	it("prints table output with task count", async () => {
		const result = await runPlanListCommand(["list"], (projectRoot) =>
			createPlanWithTask(projectRoot, "table-plan", "Table Plan"),
		);

		expect(result.stdout).toBe(
			"SLUG        STATUS       TASKS    TITLE\n" +
				"table-plan  active       1        Table Plan\n",
		);
		expect(result.stderr).toBe("");
		expect(result.exitCalls).toEqual([]);
	});

	it("prints manager errors in human mode", async () => {
		vi.spyOn(PlanManager.prototype, "listPlans").mockRejectedValue(
			new Error("disk full"),
		);

		const result = await runPlanListCommand(["list"]);

		expect(result.stdout).toBe("");
		expect(result.stderr).toBe("Error listing plans: Error: disk full\n");
		expect(result.exitCalls).toEqual([1]);
	});
});

describe("loadPlanSummaries", () => {
	const tmp = useTempDir("plan-list-summaries-test-");
	let planManager: PlanManager;
	let taskManager: TaskManager;

	beforeEach(async () => {
		planManager = new PlanManager(tmp.path);
		taskManager = await createInitializedTaskManager(tmp.path);
	});

	it("loads summaries with task counts and applies status filters", async () => {
		await createPlanFixture(planManager, {
			slug: "active-plan",
			title: "Active Plan",
		});
		await createPlanFixture(planManager, {
			slug: "completed-plan",
			title: "Completed Plan",
		});
		await planManager.updatePlan("completed-plan", { status: "completed" });
		await createTaskFixture(taskManager, { labels: ["plan:active-plan"] });
		await createTaskFixture(taskManager, { labels: ["plan:active-plan"] });

		const summaries = await loadPlanSummaries(
			planManager,
			taskManager,
			"active",
		);

		expect(summaries).toEqual([
			expect.objectContaining({
				slug: "active-plan",
				taskCount: 2,
			}),
		]);
	});
});

interface PlanListCommandResult {
	stdout: string;
	stderr: string;
	exitCalls: readonly number[];
}

async function runPlanListCommand(
	args: readonly string[],
	setup?: (projectRoot: string) => Promise<void>,
): Promise<PlanListCommandResult> {
	const context = await createCommandTestContext("plan-list-command-test-");
	try {
		await setup?.(context.tempDir);
		try {
			await createProgram().parseAsync(["node", "test", ...args]);
		} catch (error) {
			if (!(error instanceof ProcessExitError)) {
				throw error;
			}
		}

		return {
			stdout: context.output.stdout(),
			stderr: context.output.stderr(),
			exitCalls: [...context.exit.calls()],
		};
	} finally {
		await context.restore();
	}
}

async function createPlanWithTask(
	projectRoot: string,
	slug: string,
	title: string,
): Promise<void> {
	const planManager = new PlanManager(projectRoot);
	const taskManager = await createInitializedTaskManager(projectRoot, "TASK");
	await createPlanFixture(planManager, { slug, title });
	await createTaskFixture(taskManager, {
		title: "Linked Task",
		labels: [`plan:${slug}`],
	});
}

function createProgram() {
	return createCommandProgram(registerListCommand);
}
