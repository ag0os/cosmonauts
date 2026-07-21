/**
 * Tests for the plans extension.
 * Uses a mock ExtensionAPI to capture registered tools, then tests them
 * against a real temp directory with PlanManager and TaskManager.
 */

import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { buildAgentIdentityMarker } from "../../lib/agents/runtime-identity.ts";
import {
	createMarkdownMemoryStore,
	parseEpisodeRecord,
} from "../../lib/memory/index.ts";
import { PlanManager } from "../../lib/plans/plan-manager.ts";
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

		async callTool(
			name: string,
			params: unknown,
			cwd: string,
			systemPrompt = buildAgentIdentityMarker("custom/planner"),
		) {
			const tool = tools.get(name);
			if (!tool) throw new Error(`Tool not found: ${name}`);
			return tool.execute("call-id", params, undefined, undefined, {
				cwd,
				getSystemPrompt: () => systemPrompt,
			});
		},
	};
}

async function setupExtension() {
	const { default: plansExtension } = await import(
		"../../domains/shared/extensions/plans/index.ts"
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

	test("registers plan_create, plan_list, plan_view, plan_edit, and plan_archive tools", () => {
		expect(pi.tools.has("plan_create")).toBe(true);
		expect(pi.tools.has("plan_list")).toBe(true);
		expect(pi.tools.has("plan_view")).toBe(true);
		expect(pi.tools.has("plan_edit")).toBe(true);
		expect(pi.tools.has("plan_archive")).toBe(true);
	});

	test("preserves plan tool results while supplying episode actor and visible failure warning @cosmo-behavior plan:episodic-log#B-023", async () => {
		const enabledRoot = join(tempDir, "enabled");
		await writeEpisodicConfig(enabledRoot);
		const actorPrompt = buildAgentIdentityMarker("custom/plan-specialist");
		const created = (await pi.callTool(
			"plan_create",
			{
				slug: "captured-tool-plan",
				title: "Captured Tool Plan",
				description: "Original tool text stays stable.",
			},
			enabledRoot,
			actorPrompt,
		)) as ToolResult;
		expect(created.content).toEqual([
			{
				type: "text",
				text: [
					"Created plan: captured-tool-plan",
					"Title: Captured Tool Plan",
					"Status: active",
					"Description: Original tool text stays stable.",
				].join("\n"),
			},
		]);
		expect(created.details).toMatchObject({
			slug: "captured-tool-plan",
			status: "active",
		});

		await pi.callTool(
			"plan_edit",
			{ slug: "captured-tool-plan", body: "Non-status lifecycle noise." },
			enabledRoot,
			actorPrompt,
		);
		await pi.callTool(
			"plan_edit",
			{ slug: "captured-tool-plan", status: "active" },
			enabledRoot,
			actorPrompt,
		);
		const edited = (await pi.callTool(
			"plan_edit",
			{ slug: "captured-tool-plan", status: "completed" },
			enabledRoot,
			actorPrompt,
		)) as ToolResult;
		expect(edited.content).toEqual([
			{
				type: "text",
				text: [
					'Updated plan "captured-tool-plan" (status)',
					"Title: Captured Tool Plan",
					"Status: completed",
				].join("\n"),
			},
		]);
		expect(edited.details).toMatchObject({
			slug: "captured-tool-plan",
			status: "completed",
		});
		const captured = await readProjectEpisodes(enabledRoot);
		expect(captured).toHaveLength(2);
		expect(
			captured.map((record) => ({
				source: record.source,
				metadata: parseEpisodeRecord(record),
			})),
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					source: "custom/plan-specialist",
					metadata: expect.objectContaining({ action: "plan.created" }),
				}),
				expect.objectContaining({
					source: "custom/plan-specialist",
					metadata: expect.objectContaining({
						action: "plan.status-changed",
						outcome: "completed",
					}),
				}),
			]),
		);

		const missingActorRoot = join(tempDir, "missing-actor");
		await writeEpisodicConfig(missingActorRoot);
		await pi.callTool(
			"plan_create",
			{ slug: "honest-plan", title: "No Fabricated Actor" },
			missingActorRoot,
			"System prompt without a runtime identity marker.",
		);
		await expect(
			access(join(missingActorRoot, "memory")),
		).rejects.toMatchObject({
			code: "ENOENT",
		});

		const failureRoot = join(tempDir, "failure");
		await writeEpisodicConfig(failureRoot);
		await writeFile(join(failureRoot, "memory"), "path collision", "utf-8");
		const stderr = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);
		const failedCapture = (await pi.callTool(
			"plan_create",
			{ slug: "warning-plan", title: "Warning Plan" },
			failureRoot,
			actorPrompt,
		)) as ToolResult;
		const warningText = failedCapture.content[0]?.text ?? "";
		expect(warningText).toContain("Created plan: warning-plan");
		expect(warningText).toContain("Warning:");
		expect(warningText).toContain("Episode capture skipped");
		expect(warningText.match(/Warning:/gu)).toHaveLength(1);
		expect(failedCapture.details).toMatchObject({
			slug: "warning-plan",
			status: "active",
		});
		expect(stderr).not.toHaveBeenCalled();
		expect(
			await new PlanManager(failureRoot).getPlan("warning-plan"),
		).toMatchObject({ slug: "warning-plan", status: "active" });
		const failedEditCapture = (await pi.callTool(
			"plan_edit",
			{ slug: "warning-plan", status: "completed" },
			failureRoot,
			actorPrompt,
		)) as ToolResult;
		const editWarningText = failedEditCapture.content[0]?.text ?? "";
		expect(editWarningText).toContain('Updated plan "warning-plan" (status)');
		expect(editWarningText).toContain("Episode capture skipped");
		expect(editWarningText.match(/Warning:/gu)).toHaveLength(1);
		expect(failedEditCapture.details).toMatchObject({
			slug: "warning-plan",
			status: "completed",
		});
		expect(stderr).not.toHaveBeenCalled();

		const disabledRoot = join(tempDir, "disabled");
		const disabled = (await pi.callTool(
			"plan_create",
			{ slug: "disabled-plan", title: "Disabled Plan" },
			disabledRoot,
			actorPrompt,
		)) as ToolResult;
		expect(disabled.content).toEqual([
			{
				type: "text",
				text: "Created plan: disabled-plan\nTitle: Disabled Plan\nStatus: active",
			},
		]);
		await expect(access(join(disabledRoot, "memory"))).rejects.toMatchObject({
			code: "ENOENT",
		});
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

		test("shows behaviorsReviewPending when present", async () => {
			await pi.callTool(
				"plan_create",
				{ slug: "behavior-view", title: "Behavior View" },
				tempDir,
			);
			await pi.callTool(
				"plan_edit",
				{ slug: "behavior-view", behaviorsReviewPending: true },
				tempDir,
			);

			const result = (await pi.callTool(
				"plan_view",
				{ slug: "behavior-view" },
				tempDir,
			)) as ToolResult;

			expect(result.content[0]?.text).toContain(
				"Behaviors review pending: true",
			);

			const details = result.details as {
				plan: { behaviorsReviewPending?: boolean };
			};
			expect(details.plan.behaviorsReviewPending).toBe(true);
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

	describe("plan_edit", () => {
		test("updates an existing plan", async () => {
			await pi.callTool(
				"plan_create",
				{ slug: "editable", title: "Original", description: "Body" },
				tempDir,
			);

			const result = (await pi.callTool(
				"plan_edit",
				{ slug: "editable", title: "Updated", body: "New body" },
				tempDir,
			)) as ToolResult;

			expect(result.content[0]?.text).toContain('Updated plan "editable"');

			const details = result.details as {
				title: string;
				body: string;
				slug: string;
			};
			expect(details.slug).toBe("editable");
			expect(details.title).toBe("Updated");
			expect(details.body).toBe("New body");
		});

		test("sets and clears behaviorsReviewPending", async () => {
			await pi.callTool(
				"plan_create",
				{ slug: "editable-flag", title: "Editable Flag" },
				tempDir,
			);

			const flagged = (await pi.callTool(
				"plan_edit",
				{ slug: "editable-flag", behaviorsReviewPending: true },
				tempDir,
			)) as ToolResult;
			expect(flagged.content[0]?.text).toContain("behaviorsReviewPending");
			expect(
				(flagged.details as { behaviorsReviewPending?: boolean })
					.behaviorsReviewPending,
			).toBe(true);

			const cleared = (await pi.callTool(
				"plan_edit",
				{ slug: "editable-flag", behaviorsReviewPending: false },
				tempDir,
			)) as ToolResult;
			expect(cleared.content[0]?.text).toContain("behaviorsReviewPending");
			expect(
				(cleared.details as { behaviorsReviewPending?: boolean })
					.behaviorsReviewPending,
			).toBe(false);
		});

		test("rejects path traversal slugs", async () => {
			await expect(
				pi.callTool(
					"plan_edit",
					{
						slug: "../archive/plans/archived",
						title: "Should Fail",
					},
					tempDir,
				),
			).rejects.toThrow(
				"Invalid plan slug (path traversal): ../archive/plans/archived",
			);
		});
	});

	describe("plan_archive", () => {
		test("registers plan_archive tool", () => {
			expect(pi.tools.has("plan_archive")).toBe(true);
		});

		test("archives plan and associated tasks", async () => {
			// Create a plan
			await pi.callTool(
				"plan_create",
				{ slug: "archive-test", title: "Archive Test" },
				tempDir,
			);

			// Create tasks with plan label and mark them Done
			const taskManager = new TaskManager(tempDir);
			await taskManager.init({ prefix: "TEST" });
			const task = await taskManager.createTask({
				title: "Test task",
				labels: ["plan:archive-test"],
			});
			await taskManager.updateTask(task.id, { status: "Done" });

			const result = (await pi.callTool(
				"plan_archive",
				{ slug: "archive-test" },
				tempDir,
			)) as ToolResult;

			expect(result.content[0]?.text).toContain('Archived plan "archive-test"');
			expect(result.content[0]?.text).toContain("Tasks archived: 1");
			expect(result.details).toBeDefined();

			const details = result.details as {
				planSlug: string;
				archivedTaskFiles: string[];
			};
			expect(details.planSlug).toBe("archive-test");
			expect(details.archivedTaskFiles).toHaveLength(1);
		});

		test("rejects when plan does not exist", async () => {
			await expect(
				pi.callTool("plan_archive", { slug: "nonexistent" }, tempDir),
			).rejects.toThrow('Plan "nonexistent" not found');
		});

		test("rejects when tasks are not all Done", async () => {
			await pi.callTool(
				"plan_create",
				{ slug: "incomplete", title: "Incomplete" },
				tempDir,
			);

			const taskManager = new TaskManager(tempDir);
			await taskManager.init({ prefix: "TEST" });
			await taskManager.createTask({
				title: "Pending task",
				labels: ["plan:incomplete"],
			});

			await expect(
				pi.callTool("plan_archive", { slug: "incomplete" }, tempDir),
			).rejects.toThrow("tasks not Done");
		});

		test("archives plan with zero tasks", async () => {
			await pi.callTool(
				"plan_create",
				{ slug: "no-tasks", title: "No Tasks Plan" },
				tempDir,
			);

			const result = (await pi.callTool(
				"plan_archive",
				{ slug: "no-tasks" },
				tempDir,
			)) as ToolResult;

			expect(result.content[0]?.text).toContain("Tasks archived: 0");
			const details = result.details as { archivedTaskFiles: string[] };
			expect(details.archivedTaskFiles).toHaveLength(0);
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
