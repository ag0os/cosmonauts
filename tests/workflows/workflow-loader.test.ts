/**
 * Tests for workflow loader.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_WORKFLOWS } from "../../lib/workflows/defaults.ts";
import {
	listWorkflows,
	loadWorkflows,
	resolveWorkflow,
} from "../../lib/workflows/loader.ts";

let tmpDir: string;

beforeEach(async () => {
	tmpDir = await mkdtemp(join(tmpdir(), "workflow-test-"));
});

afterEach(async () => {
	await rm(tmpDir, { recursive: true, force: true });
});

describe("loadWorkflows", () => {
	test("returns defaults when no config file exists", async () => {
		const workflows = await loadWorkflows(tmpDir);

		expect(workflows).toHaveLength(DEFAULT_WORKFLOWS.length);
		expect(workflows.map((w) => w.name)).toContain("plan-and-build");
		expect(workflows.map((w) => w.name)).toContain("implement");
		expect(workflows.map((w) => w.name)).toContain("plan");
	});

	test("loads and merges from project JSON config", async () => {
		await mkdir(join(tmpDir, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmpDir, ".cosmonauts", "workflows.json"),
			JSON.stringify({
				workflows: {
					refactor: {
						description: "Refactoring workflow",
						chain: "planner -> task-manager -> coordinator",
					},
				},
			}),
		);

		const workflows = await loadWorkflows(tmpDir);

		expect(workflows.map((w) => w.name)).toContain("refactor");
		expect(workflows.length).toBe(DEFAULT_WORKFLOWS.length + 1);
	});

	test("project config overrides built-in on name collision", async () => {
		await mkdir(join(tmpDir, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmpDir, ".cosmonauts", "workflows.json"),
			JSON.stringify({
				workflows: {
					plan: {
						description: "Custom plan workflow",
						chain: "planner -> task-manager",
					},
				},
			}),
		);

		const workflows = await loadWorkflows(tmpDir);
		const plan = workflows.find((w) => w.name === "plan");

		expect(plan).toBeDefined();
		expect(plan?.description).toBe("Custom plan workflow");
		expect(plan?.chain).toBe("planner -> task-manager");
		// Same count since it replaced, not added
		expect(workflows.length).toBe(DEFAULT_WORKFLOWS.length);
	});

	test("invalid JSON throws descriptive error", async () => {
		await mkdir(join(tmpDir, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmpDir, ".cosmonauts", "workflows.json"),
			"not valid json {{{",
		);

		await expect(loadWorkflows(tmpDir)).rejects.toThrow("Invalid JSON");
	});

	test("empty workflows object returns defaults only", async () => {
		await mkdir(join(tmpDir, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmpDir, ".cosmonauts", "workflows.json"),
			JSON.stringify({ workflows: {} }),
		);

		const workflows = await loadWorkflows(tmpDir);
		expect(workflows).toHaveLength(DEFAULT_WORKFLOWS.length);
	});
});

describe("resolveWorkflow", () => {
	test("resolves a built-in workflow by name", async () => {
		const wf = await resolveWorkflow("plan-and-build", tmpDir);

		expect(wf.name).toBe("plan-and-build");
		expect(wf.chain).toBe("planner -> task-manager -> coordinator");
	});

	test("throws for unknown workflow name", async () => {
		await expect(resolveWorkflow("nonexistent", tmpDir)).rejects.toThrow(
			'Unknown workflow "nonexistent"',
		);
	});

	test("resolves project-defined workflow", async () => {
		await mkdir(join(tmpDir, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmpDir, ".cosmonauts", "workflows.json"),
			JSON.stringify({
				workflows: {
					deploy: {
						description: "Deploy workflow",
						chain: "worker",
					},
				},
			}),
		);

		const wf = await resolveWorkflow("deploy", tmpDir);
		expect(wf.name).toBe("deploy");
		expect(wf.chain).toBe("worker");
	});
});

describe("listWorkflows", () => {
	test("returns same result as loadWorkflows", async () => {
		const loaded = await loadWorkflows(tmpDir);
		const listed = await listWorkflows(tmpDir);

		expect(listed).toEqual(loaded);
	});
});

describe("DEFAULT_WORKFLOWS", () => {
	test("plan-and-build has full pipeline chain", () => {
		const wf = DEFAULT_WORKFLOWS.find((w) => w.name === "plan-and-build");
		expect(wf).toBeDefined();
		expect(wf?.chain).toBe("planner -> task-manager -> coordinator");
	});

	test("implement skips planner", () => {
		const wf = DEFAULT_WORKFLOWS.find((w) => w.name === "implement");
		expect(wf).toBeDefined();
		expect(wf?.chain).toBe("task-manager -> coordinator");
	});

	test("plan is planner only", () => {
		const wf = DEFAULT_WORKFLOWS.find((w) => w.name === "plan");
		expect(wf).toBeDefined();
		expect(wf?.chain).toBe("planner");
	});
});
