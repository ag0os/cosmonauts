/**
 * Tests for the plans extension.
 * Uses a mock ExtensionAPI to capture registered tools, then tests them
 * against a real temp directory with PlanManager and TaskManager.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { TaskManager } from "../../lib/tasks/task-manager.ts";

// Minimal mock of Pi's ExtensionAPI — captures registrations
interface RegisteredTool {
	name: string;
	execute: (...args: unknown[]) => Promise<unknown>;
}

function createMockPi() {
	const tools = new Map<string, RegisteredTool>();

	return {
		tools,

		registerTool(def: {
			name: string;
			execute: (...args: unknown[]) => Promise<unknown>;
		}) {
			tools.set(def.name, def);
		},

		on(_event: string, _handler: unknown) {},
		appendEntry(_customType: string, _data: unknown) {},

		async callTool(name: string, params: unknown, cwd: string) {
			const tool = tools.get(name);
			if (!tool) throw new Error(`Tool not found: ${name}`);
			return tool.execute("call-id", params, undefined, undefined, {
				cwd,
			});
		},
	};
}

async function setupExtension() {
	const { default: plansExtension } = await import(
		"../../extensions/plans/index.ts"
	);
	const pi = createMockPi();
	plansExtension(pi as never);
	return pi;
}

interface ToolResult {
	content: { type: string; text: string }[];
	details: unknown;
}

describe("plans extension", () => {
	let pi: Awaited<ReturnType<typeof setupExtension>>;
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "plans-ext-test-"));
		pi = await setupExtension();
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	test("registers plan_create, plan_list, and plan_view tools", () => {
		expect(pi.tools.has("plan_create")).toBe(true);
		expect(pi.tools.has("plan_list")).toBe(true);
		expect(pi.tools.has("plan_view")).toBe(true);
	});

	describe("plan_create", () => {
		test("creates a plan with required fields", async () => {
			const result = (await pi.callTool(
				"plan_create",
				{ slug: "auth-system", title: "Auth System" },
				tempDir,
			)) as ToolResult;

			expect(result.content[0]?.text).toContain("Created plan: auth-system");
			expect(result.content[0]?.text).toContain("Title: Auth System");
			expect(result.content[0]?.text).toContain("Status: active");

			const plan = result.details as {
				slug: string;
				title: string;
				status: string;
			};
			expect(plan.slug).toBe("auth-system");
			expect(plan.title).toBe("Auth System");
			expect(plan.status).toBe("active");
		});

		test("creates a plan with description", async () => {
			const result = (await pi.callTool(
				"plan_create",
				{
					slug: "api-redesign",
					title: "API Redesign",
					description: "Redesign the API layer.",
				},
				tempDir,
			)) as ToolResult;

			expect(result.content[0]?.text).toContain(
				"Description: Redesign the API layer.",
			);

			const plan = result.details as { body: string };
			expect(plan.body).toBe("Redesign the API layer.");
		});

		test("creates a plan with spec", async () => {
			const result = (await pi.callTool(
				"plan_create",
				{
					slug: "with-spec",
					title: "With Spec",
					spec: "# Specification\n\nDetailed requirements.",
				},
				tempDir,
			)) as ToolResult;

			expect(result.content[0]?.text).toContain("Spec: included");

			const plan = result.details as { spec: string };
			expect(plan.spec).toBe("# Specification\n\nDetailed requirements.");
		});

		test("creates a plan with all optional fields", async () => {
			const result = (await pi.callTool(
				"plan_create",
				{
					slug: "full-plan",
					title: "Full Plan",
					description: "A complete plan.",
					spec: "Spec content here.",
				},
				tempDir,
			)) as ToolResult;

			const plan = result.details as {
				slug: string;
				title: string;
				body: string;
				spec: string;
			};
			expect(plan.slug).toBe("full-plan");
			expect(plan.title).toBe("Full Plan");
			expect(plan.body).toBe("A complete plan.");
			expect(plan.spec).toBe("Spec content here.");
		});

		test("fails when creating duplicate slug", async () => {
			await pi.callTool(
				"plan_create",
				{ slug: "duplicate", title: "First" },
				tempDir,
			);

			await expect(
				pi.callTool(
					"plan_create",
					{ slug: "duplicate", title: "Second" },
					tempDir,
				),
			).rejects.toThrow("Plan already exists: duplicate");
		});
	});

	describe("plan_list", () => {
		test("returns no plans message when empty", async () => {
			const result = (await pi.callTool(
				"plan_list",
				{},
				tempDir,
			)) as ToolResult;

			expect(result.content[0]?.text).toBe("No plans found");
			expect(result.details).toEqual([]);
		});

		test("lists all plans", async () => {
			await pi.callTool(
				"plan_create",
				{ slug: "plan-a", title: "Plan A" },
				tempDir,
			);
			await pi.callTool(
				"plan_create",
				{ slug: "plan-b", title: "Plan B" },
				tempDir,
			);

			const result = (await pi.callTool(
				"plan_list",
				{},
				tempDir,
			)) as ToolResult;

			expect(result.content[0]?.text).toContain("plan-a");
			expect(result.content[0]?.text).toContain("plan-b");
			expect(result.content[0]?.text).toContain("Plan A");
			expect(result.content[0]?.text).toContain("Plan B");

			const summaries = result.details as { slug: string }[];
			expect(summaries).toHaveLength(2);
		});

		test("filters by status", async () => {
			await pi.callTool(
				"plan_create",
				{ slug: "active-plan", title: "Active Plan" },
				tempDir,
			);
			await pi.callTool(
				"plan_create",
				{ slug: "done-plan", title: "Done Plan" },
				tempDir,
			);

			// Manually update the done plan via PlanManager
			const { PlanManager } = await import("../../lib/plans/plan-manager.ts");
			const mgr = new PlanManager(tempDir);
			await mgr.updatePlan("done-plan", { status: "completed" });

			const activeResult = (await pi.callTool(
				"plan_list",
				{ status: "active" },
				tempDir,
			)) as ToolResult;

			const activeSummaries = activeResult.details as { slug: string }[];
			expect(activeSummaries).toHaveLength(1);
			expect(activeSummaries[0]?.slug).toBe("active-plan");

			const completedResult = (await pi.callTool(
				"plan_list",
				{ status: "completed" },
				tempDir,
			)) as ToolResult;

			const completedSummaries = completedResult.details as { slug: string }[];
			expect(completedSummaries).toHaveLength(1);
			expect(completedSummaries[0]?.slug).toBe("done-plan");
		});

		test("includes task count in summaries", async () => {
			await pi.callTool(
				"plan_create",
				{ slug: "counted", title: "Counted Plan" },
				tempDir,
			);

			// Create tasks with the plan label
			const taskManager = new TaskManager(tempDir);
			await taskManager.init({ prefix: "COSMO" });
			await taskManager.createTask({
				title: "Task 1",
				labels: ["plan:counted"],
			});
			await taskManager.createTask({
				title: "Task 2",
				labels: ["plan:counted"],
			});

			const result = (await pi.callTool(
				"plan_list",
				{},
				tempDir,
			)) as ToolResult;

			expect(result.content[0]?.text).toContain("2 task(s)");

			const summaries = result.details as { taskCount: number }[];
			expect(summaries[0]?.taskCount).toBe(2);
		});

		test("shows zero tasks when no tasks are associated", async () => {
			await pi.callTool(
				"plan_create",
				{ slug: "no-tasks", title: "No Tasks" },
				tempDir,
			);

			const result = (await pi.callTool(
				"plan_list",
				{},
				tempDir,
			)) as ToolResult;

			expect(result.content[0]?.text).toContain("0 task(s)");
		});
	});

	describe("plan_view", () => {
		test("returns not found for nonexistent plan", async () => {
			const result = (await pi.callTool(
				"plan_view",
				{ slug: "nonexistent" },
				tempDir,
			)) as ToolResult;

			expect(result.content[0]?.text).toBe("Plan not found: nonexistent");
			expect(result.details).toBeNull();
		});

		test("returns plan details", async () => {
			await pi.callTool(
				"plan_create",
				{
					slug: "view-test",
					title: "View Test",
					description: "Plan body content.",
				},
				tempDir,
			);

			const result = (await pi.callTool(
				"plan_view",
				{ slug: "view-test" },
				tempDir,
			)) as ToolResult;

			const text = result.content[0]?.text;
			expect(text).toContain("view-test: View Test");
			expect(text).toContain("Status: active");
			expect(text).toContain("Tasks: 0");
			expect(text).toContain("Description:\nPlan body content.");
		});

		test("includes spec content when present", async () => {
			await pi.callTool(
				"plan_create",
				{
					slug: "spec-view",
					title: "Spec View",
					spec: "# Spec\n\nSpec details here.",
				},
				tempDir,
			);

			const result = (await pi.callTool(
				"plan_view",
				{ slug: "spec-view" },
				tempDir,
			)) as ToolResult;

			expect(result.content[0]?.text).toContain(
				"Spec:\n# Spec\n\nSpec details here.",
			);
		});

		test("does not include spec section when no spec exists", async () => {
			await pi.callTool(
				"plan_create",
				{ slug: "no-spec", title: "No Spec" },
				tempDir,
			);

			const result = (await pi.callTool(
				"plan_view",
				{ slug: "no-spec" },
				tempDir,
			)) as ToolResult;

			expect(result.content[0]?.text).not.toContain("Spec:");
		});

		test("includes task count from summary", async () => {
			await pi.callTool(
				"plan_create",
				{ slug: "with-tasks", title: "With Tasks" },
				tempDir,
			);

			const taskManager = new TaskManager(tempDir);
			await taskManager.init({ prefix: "COSMO" });
			await taskManager.createTask({
				title: "Associated Task",
				labels: ["plan:with-tasks"],
			});

			const result = (await pi.callTool(
				"plan_view",
				{ slug: "with-tasks" },
				tempDir,
			)) as ToolResult;

			expect(result.content[0]?.text).toContain("Tasks: 1");

			const details = result.details as {
				plan: { slug: string };
				summary: { taskCount: number };
			};
			expect(details.plan.slug).toBe("with-tasks");
			expect(details.summary.taskCount).toBe(1);
		});

		test("returns full plan and summary in details", async () => {
			await pi.callTool(
				"plan_create",
				{
					slug: "detail-test",
					title: "Detail Test",
					description: "Body here.",
					spec: "Spec here.",
				},
				tempDir,
			);

			const result = (await pi.callTool(
				"plan_view",
				{ slug: "detail-test" },
				tempDir,
			)) as ToolResult;

			const details = result.details as {
				plan: {
					slug: string;
					title: string;
					body: string;
					spec: string;
					status: string;
				};
				summary: {
					slug: string;
					title: string;
					status: string;
					taskCount: number;
				};
			};

			expect(details.plan.slug).toBe("detail-test");
			expect(details.plan.title).toBe("Detail Test");
			expect(details.plan.body).toBe("Body here.");
			expect(details.plan.spec).toBe("Spec here.");
			expect(details.summary.slug).toBe("detail-test");
			expect(details.summary.taskCount).toBe(0);
		});
	});
});
