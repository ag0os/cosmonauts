import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { renderPlanEditSuccess } from "../../cli/plans/commands/edit.ts";
import { renderTaskCreateSuccess } from "../../cli/tasks/commands/create.ts";
import { renderTaskEditSuccess } from "../../cli/tasks/commands/edit.ts";
import { buildAgentIdentityMarker } from "../../lib/agents/runtime-identity.ts";
import { PlanManager } from "../../lib/plans/plan-manager.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createMockPi, type MockPi } from "../helpers/mocks/index.ts";

const tmp = useTempDir("episodic-pre-w3-baseline-");
const FIXED_TIME = "2026-07-21T12:00:00.000Z";

describe("pre-W3 disabled baselines", () => {
	test("freezes authored-memory tools, bytes, and files when episodic config is absent", async () => {
		const projectRoot = join(tmp.path, "authored-project");
		const userRoot = join(tmp.path, "authored-user");
		const pi = createMockPi({ cwd: projectRoot });
		const { createAgentMemoryExtension } = await import(
			"../../domains/shared/extensions/agent-memory/index.ts"
		);
		createAgentMemoryExtension({
			userCosmonautsRoot: userRoot,
			now: () => new Date(FIXED_TIME),
		})(pi as never);

		expect(toolContract(pi, "remember")).toEqual({
			name: "remember",
			label: "Remember",
			description:
				"Save an explicit note, user profile, or playbook to agent memory.",
			executionMode: "sequential",
			parameterNames: [
				"changeSummary",
				"confirmUpdate",
				"content",
				"description",
				"kind",
				"scope",
				"tags",
				"title",
				"type",
			],
		});
		expect(toolContract(pi, "recall")).toEqual({
			name: "recall",
			label: "Recall",
			description:
				"Search authored agent-memory records: notes, the user profile, and playbooks.",
			executionMode: undefined,
			parameterNames: ["limit", "query"],
		});

		await authorizeCosmo(pi, projectRoot);
		const saved = asToolResult(
			await pi.callTool("remember", {
				content: "The disabled baseline stays authored-only.",
				description: "Pinned authored-memory output.",
				kind: "semantic",
				scope: "project",
				tags: ["baseline"],
				title: "Pre-W3 baseline",
			}),
		);
		const savedDetails = asRecord(saved.details);
		const humanPath = asString(savedDetails.humanPath);
		expect(saved.content).toEqual([
			{
				type: "text",
				text: `Saved "Pre-W3 baseline" to project memory: ${humanPath}`,
			},
		]);
		expect(savedDetails).toEqual({
			status: "saved",
			type: "note",
			title: "Pre-W3 baseline",
			scope: "project",
			kind: "semantic",
			tags: ["baseline"],
			timestamp: FIXED_TIME,
			path: join(projectRoot, humanPath),
			humanPath,
		});

		const recalled = asToolResult(
			await pi.callTool("recall", { query: "disabled baseline" }),
		);
		const recallDetails = asRecord(recalled.details);
		expect(recalled.content[0]?.text).toContain(
			'Found 1 authored memory record for "disabled baseline".',
		);
		expect(Object.keys(recallDetails).sort()).toEqual([
			"limit",
			"query",
			"records",
			"searchedScopes",
			"skippedScopes",
			"stats",
			"status",
			"warnings",
		]);
		expect(recallDetails).toMatchObject({
			status: "matched",
			query: "disabled baseline",
			limit: 5,
			searchedScopes: ["project", "user"],
			skippedScopes: [],
			warnings: [],
		});
		expect(recallDetails.records).toEqual([
			{
				type: "note",
				title: "Pre-W3 baseline",
				description: "Pinned authored-memory output.",
				scope: "project",
				kind: "semantic",
				tags: ["baseline"],
				timestamp: FIXED_TIME,
				path: join(projectRoot, humanPath),
				humanPath,
				content: "The disabled baseline stays authored-only.",
			},
		]);

		const injection = asRecord(await authorizeCosmo(pi, projectRoot));
		const message = asRecord(injection.message);
		expect(message).toEqual({
			customType: "agent-memory-context",
			display: false,
			content: [
				"Agent memory index context",
				"Current disk authored memory for this Cosmo turn.",
				"## Authored memory index",
				"Up to 50 most recent project/user notes and playbooks, ordered by timestamp then path.",
				"This section contains compact metadata only, not record bodies.",
				"Use recall(query) for full authored memory record details before relying on an entry.",
				"- type: note",
				"  title: Pre-W3 baseline",
				"  scope: project",
				"  kind: semantic",
				`  timestamp: ${FIXED_TIME}`,
				"  description: Pinned authored-memory output.",
				`  path: ${humanPath}`,
				"",
			].join("\n"),
		});
		expect(await listFiles(projectRoot)).toEqual([
			"memory/agent/index.md",
			humanPath,
		]);
		expect(await listFiles(userRoot)).toEqual([]);
	});

	test("freezes context-free managers, Pi tools, CLI output, and files when episodic config is absent", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(FIXED_TIME));
		const projectRoot = join(tmp.path, "lifecycle-project");
		const pi = createMockPi({ cwd: projectRoot });
		const [{ default: plansExtension }, { default: tasksExtension }] =
			await Promise.all([
				import("../../domains/shared/extensions/plans/index.ts"),
				import("../../domains/shared/extensions/tasks/index.ts"),
			]);
		plansExtension(pi as never);
		tasksExtension(pi as never);

		const planToolResult = asToolResult(
			await pi.callTool("plan_create", {
				slug: "baseline-plan",
				title: "Baseline Plan",
				description: "Pinned plan body.",
				spec: "Pinned plan spec.",
			}),
		);
		expect(planToolResult.content).toEqual([
			{
				type: "text",
				text: [
					"Created plan: baseline-plan",
					"Title: Baseline Plan",
					"Status: active",
					"Description: Pinned plan body.",
					"Spec: included",
				].join("\n"),
			},
		]);

		const taskToolResult = asToolResult(
			await pi.callTool("task_create", {
				title: "Baseline Task",
				description: "Pinned task body.",
				labels: ["plan:baseline-plan"],
			}),
		);
		expect(taskToolResult.content).toEqual([
			{ type: "text", text: "Created task TASK-001: Baseline Task" },
		]);

		const planManager = new PlanManager(projectRoot);
		const taskManager = new TaskManager(projectRoot);
		const updatedPlan = await planManager.updatePlan("baseline-plan", {
			status: "completed",
		});
		const updatedTask = await taskManager.updateTask("TASK-001", {
			status: "Done",
		});

		expect(Object.keys(updatedPlan).sort()).toEqual([
			"behaviorsReviewPending",
			"body",
			"createdAt",
			"slug",
			"spec",
			"status",
			"title",
			"updatedAt",
		]);
		expect(updatedPlan).toMatchObject({
			slug: "baseline-plan",
			title: "Baseline Plan",
			status: "completed",
			body: "Pinned plan body.",
			spec: "Pinned plan spec.",
			createdAt: new Date(FIXED_TIME),
			updatedAt: new Date(FIXED_TIME),
		});
		expect(Object.keys(updatedTask).sort()).toEqual([
			"acceptanceCriteria",
			"assignee",
			"createdAt",
			"dependencies",
			"description",
			"dueDate",
			"id",
			"implementationNotes",
			"implementationPlan",
			"labels",
			"priority",
			"rawContent",
			"status",
			"title",
			"updatedAt",
		]);
		expect(updatedTask).toMatchObject({
			id: "TASK-001",
			title: "Baseline Task",
			status: "Done",
			description: "Pinned task body.",
			labels: ["plan:baseline-plan"],
			dependencies: [],
			acceptanceCriteria: [],
			createdAt: new Date(FIXED_TIME),
			updatedAt: new Date(FIXED_TIME),
		});

		expect(renderPlanEditSuccess(updatedPlan, ["status"], "human")).toEqual([
			"Updated plan baseline-plan: Baseline Plan",
			"Changed: status",
		]);
		expect(
			renderTaskCreateSuccess(taskToolResult.details as never, "human"),
		).toEqual(["Created task TASK-001: Baseline Task"]);
		expect(
			renderTaskEditSuccess(
				updatedTask,
				{ status: "Done" },
				[{ field: "status", oldValue: "To Do", newValue: "Done" }],
				"human",
			),
		).toEqual([
			"Updated task TASK-001: Baseline Task",
			"Changed: status (To Do → Done)",
		]);
		expect(await listFiles(projectRoot)).toEqual([
			"missions/plans/baseline-plan/plan.md",
			"missions/plans/baseline-plan/spec.md",
			"missions/tasks/TASK-001 - Baseline Task.md",
			"missions/tasks/config.json",
		]);
	});
});

interface ToolResult {
	readonly content: readonly { readonly type: string; readonly text: string }[];
	readonly details: unknown;
}

function asToolResult(value: unknown): ToolResult {
	return value as ToolResult;
}

function asRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("Expected an object baseline value");
	}
	return value as Record<string, unknown>;
}

function asString(value: unknown): string {
	if (typeof value !== "string") throw new Error("Expected a string value");
	return value;
}

async function authorizeCosmo(pi: MockPi, cwd: string): Promise<unknown> {
	return pi.fireEvent(
		"before_agent_start",
		{ systemPrompt: buildAgentIdentityMarker("main/cosmo") },
		{ cwd },
	);
}

function toolContract(pi: MockPi, name: string): Record<string, unknown> {
	const tool = pi.tools.get(name) as unknown as {
		readonly name: string;
		readonly label: string;
		readonly description: string;
		readonly executionMode?: string;
		readonly parameters: { readonly properties?: Record<string, unknown> };
	};
	if (!tool) throw new Error(`Missing tool ${name}`);
	return {
		name: tool.name,
		label: tool.label,
		description: tool.description,
		executionMode: tool.executionMode,
		parameterNames: Object.keys(tool.parameters.properties ?? {}).sort(),
	};
}

async function listFiles(root: string): Promise<string[]> {
	const files: string[] = [];
	await visit(root, files);
	return files.sort();

	async function visit(directory: string, output: string[]): Promise<void> {
		try {
			const entries = await readdir(directory, { withFileTypes: true });
			for (const entry of entries) {
				const path = join(directory, entry.name);
				if (entry.isDirectory()) {
					await visit(path, output);
				} else {
					output.push(relative(root, path));
				}
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
			throw error;
		}
	}
}
