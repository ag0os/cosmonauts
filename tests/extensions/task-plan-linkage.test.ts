/**
 * Tests for task-plan linkage: plan parameter on task_create,
 * plan label validation on task_create and task_edit.
 *
 * Uses a mock ExtensionAPI (same pattern as todo-extension tests)
 * with real TaskManager on a temp directory for integration testing.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validatePlanLabels } from "../../extensions/tasks/index.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import type { Task } from "../../lib/tasks/task-types.ts";

// ---------------------------------------------------------------------------
// Mock Pi (mirrors the pattern from todo-extension.test.ts)
// ---------------------------------------------------------------------------

interface RegisteredTool {
	name: string;
	execute: (...args: unknown[]) => Promise<unknown>;
}

function createMockPi(cwd: string) {
	const tools = new Map<string, RegisteredTool>();

	return {
		tools,

		registerTool(def: {
			name: string;
			execute: (...args: unknown[]) => Promise<unknown>;
		}) {
			tools.set(def.name, def);
		},

		// Stubs for API methods the extension doesn't use but may be expected
		on(_event: string, _handler: unknown) {},
		appendEntry(_customType: string, _data: unknown) {},

		async callTool(name: string, params: unknown) {
			const tool = tools.get(name);
			if (!tool) throw new Error(`Tool not found: ${name}`);
			return tool.execute("call-id", params, undefined, undefined, { cwd });
		},
	};
}

async function setupExtension(cwd: string) {
	const { default: tasksExtension } = await import(
		"../../extensions/tasks/index.ts"
	);
	const pi = createMockPi(cwd);
	tasksExtension(pi as never);
	return pi;
}

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

interface ToolResult {
	content: { type: string; text: string }[];
	details: Task | null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("validatePlanLabels (unit)", () => {
	it("returns null for empty labels", () => {
		expect(validatePlanLabels([])).toBeNull();
	});

	it("returns null for labels with no plan: prefix", () => {
		expect(validatePlanLabels(["backend", "api"])).toBeNull();
	});

	it("returns null for exactly one plan: label", () => {
		expect(validatePlanLabels(["plan:my-plan", "backend"])).toBeNull();
	});

	it("returns error for two plan: labels", () => {
		const result = validatePlanLabels(["plan:alpha", "plan:beta"]);
		expect(result).toContain("at most one plan: label");
		expect(result).toContain("plan:alpha");
		expect(result).toContain("plan:beta");
	});

	it("returns error for three plan: labels", () => {
		const result = validatePlanLabels(["plan:a", "other", "plan:b", "plan:c"]);
		expect(result).not.toBeNull();
	});
});

describe("task_create plan parameter (integration)", () => {
	let tempDir: string;
	let pi: Awaited<ReturnType<typeof setupExtension>>;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "task-plan-linkage-"));
		const manager = new TaskManager(tempDir);
		await manager.init();
		pi = await setupExtension(tempDir);
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("adds plan:<slug> label when plan parameter is provided", async () => {
		const result = (await pi.callTool("task_create", {
			title: "My Task",
			plan: "my-plan",
		})) as ToolResult;

		expect(result.details).not.toBeNull();
		expect(result.details?.labels).toContain("plan:my-plan");
	});

	it("preserves existing labels when plan parameter is provided", async () => {
		const result = (await pi.callTool("task_create", {
			title: "My Task",
			labels: ["backend", "api"],
			plan: "my-plan",
		})) as ToolResult;

		expect(result.details).not.toBeNull();
		expect(result.details?.labels).toEqual(["backend", "api", "plan:my-plan"]);
	});

	it("works without plan parameter (backwards compatibility)", async () => {
		const result = (await pi.callTool("task_create", {
			title: "No plan task",
		})) as ToolResult;

		expect(result.details).not.toBeNull();
		expect(result.details?.labels).toEqual([]);
		expect(result.content[0]?.text).toContain("Created task");
	});

	it("works with labels but no plan parameter", async () => {
		const result = (await pi.callTool("task_create", {
			title: "Labeled task",
			labels: ["frontend"],
		})) as ToolResult;

		expect(result.details).not.toBeNull();
		expect(result.details?.labels).toEqual(["frontend"]);
	});

	it("rejects when plan parameter would create duplicate plan: labels", async () => {
		const result = (await pi.callTool("task_create", {
			title: "Conflict",
			labels: ["plan:existing-plan"],
			plan: "new-plan",
		})) as ToolResult;

		expect(result.details).toBeNull();
		expect(result.content[0]?.text).toContain("at most one plan: label");
		expect(result.content[0]?.text).toContain("plan:existing-plan");
		expect(result.content[0]?.text).toContain("plan:new-plan");
	});

	it("rejects when labels array already has multiple plan: labels", async () => {
		const result = (await pi.callTool("task_create", {
			title: "Double plan labels",
			labels: ["plan:alpha", "plan:beta"],
		})) as ToolResult;

		expect(result.details).toBeNull();
		expect(result.content[0]?.text).toContain("at most one plan: label");
	});

	it("allows plan parameter when it matches existing plan: label in labels", async () => {
		// Edge case: user passes plan:"foo" and labels already has "plan:foo"
		// This results in two "plan:foo" labels which should be rejected
		const result = (await pi.callTool("task_create", {
			title: "Same plan twice",
			labels: ["plan:foo"],
			plan: "foo",
		})) as ToolResult;

		// Two identical plan: labels still violates the "at most one" rule
		expect(result.details).toBeNull();
		expect(result.content[0]?.text).toContain("at most one plan: label");
	});
});

describe("task_edit plan label validation (integration)", () => {
	let tempDir: string;
	let pi: Awaited<ReturnType<typeof setupExtension>>;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "task-plan-edit-"));
		const manager = new TaskManager(tempDir);
		await manager.init();
		pi = await setupExtension(tempDir);
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("rejects when labels update would result in multiple plan: labels", async () => {
		// Create a task first
		await pi.callTool("task_create", { title: "Editable task" });

		const result = (await pi.callTool("task_edit", {
			taskId: "TASK-001",
			labels: ["plan:alpha", "plan:beta"],
		})) as ToolResult;

		expect(result.details).toBeNull();
		expect(result.content[0]?.text).toContain("at most one plan: label");
	});

	it("allows edit with a single plan: label", async () => {
		await pi.callTool("task_create", { title: "Editable task" });

		const result = (await pi.callTool("task_edit", {
			taskId: "TASK-001",
			labels: ["plan:my-plan", "backend"],
		})) as ToolResult;

		expect(result.details).not.toBeNull();
		expect(result.details?.labels).toEqual(["plan:my-plan", "backend"]);
	});

	it("allows edit with no plan: labels", async () => {
		await pi.callTool("task_create", {
			title: "Editable task",
			plan: "old-plan",
		});

		const result = (await pi.callTool("task_edit", {
			taskId: "TASK-001",
			labels: ["backend", "api"],
		})) as ToolResult;

		expect(result.details).not.toBeNull();
		expect(result.details?.labels).toEqual(["backend", "api"]);
	});

	it("allows edit that does not touch labels", async () => {
		await pi.callTool("task_create", {
			title: "Editable task",
			plan: "some-plan",
		});

		const result = (await pi.callTool("task_edit", {
			taskId: "TASK-001",
			title: "New title",
		})) as ToolResult;

		expect(result.details).not.toBeNull();
		expect(result.content[0]?.text).toContain("Updated task");
	});
});
