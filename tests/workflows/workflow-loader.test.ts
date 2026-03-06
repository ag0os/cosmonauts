/**
 * Tests for workflow loader.
 *
 * All workflows come from project config (`.cosmonauts/config.json`),
 * scaffolded by `cosmonauts-tasks init`.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	listWorkflows,
	loadWorkflows,
	resolveWorkflow,
} from "../../lib/workflows/loader.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("workflow-test-");

describe("loadWorkflows", () => {
	test("returns empty array when no config file exists", async () => {
		const workflows = await loadWorkflows(tmp.path);

		expect(workflows).toEqual([]);
	});

	test("loads workflows from project config", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				workflows: {
					"plan-and-build": {
						description: "Full pipeline",
						chain: "planner -> task-manager -> coordinator -> quality-manager",
					},
					implement: {
						description: "From existing plan",
						chain: "task-manager -> coordinator -> quality-manager",
					},
					verify: {
						description: "Review and remediation",
						chain: "quality-manager",
					},
				},
			}),
		);

		const workflows = await loadWorkflows(tmp.path);

		expect(workflows.length).toBe(3);
		expect(workflows.map((w) => w.name)).toContain("plan-and-build");
		expect(workflows.map((w) => w.name)).toContain("implement");
		expect(workflows.map((w) => w.name)).toContain("verify");
	});

	test("loads single workflow from config", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				workflows: {
					refactor: {
						description: "Refactoring workflow",
						chain: "planner -> task-manager -> coordinator",
					},
				},
			}),
		);

		const workflows = await loadWorkflows(tmp.path);

		expect(workflows.length).toBe(1);
		expect(workflows[0]?.name).toBe("refactor");
		expect(workflows[0]?.chain).toBe("planner -> task-manager -> coordinator");
	});

	test("loads multiple workflows from config", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				workflows: {
					build: {
						description: "Build workflow",
						chain: "planner -> coordinator",
					},
					deploy: {
						description: "Deploy workflow",
						chain: "worker",
					},
				},
			}),
		);

		const workflows = await loadWorkflows(tmp.path);

		expect(workflows.length).toBe(2);
		expect(workflows.map((w) => w.name)).toContain("build");
		expect(workflows.map((w) => w.name)).toContain("deploy");
	});

	test("invalid JSON throws descriptive error", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			"not valid json {{{",
		);

		await expect(loadWorkflows(tmp.path)).rejects.toThrow("Invalid JSON");
	});

	test("empty config returns empty array", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({}),
		);

		const workflows = await loadWorkflows(tmp.path);
		expect(workflows).toEqual([]);
	});

	test("config with only skills and no workflows returns empty array", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ skills: ["typescript"] }),
		);

		const workflows = await loadWorkflows(tmp.path);
		expect(workflows).toEqual([]);
	});
});

describe("resolveWorkflow", () => {
	test("throws for any workflow name when no config exists", async () => {
		await expect(resolveWorkflow("plan-and-build", tmp.path)).rejects.toThrow(
			'Unknown workflow "plan-and-build"',
		);
	});

	test("resolves project-defined workflow", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				workflows: {
					deploy: {
						description: "Deploy workflow",
						chain: "worker",
					},
				},
			}),
		);

		const wf = await resolveWorkflow("deploy", tmp.path);
		expect(wf.name).toBe("deploy");
		expect(wf.chain).toBe("worker");
	});

	test("throws for unknown workflow name with config", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				workflows: {
					deploy: {
						description: "Deploy workflow",
						chain: "worker",
					},
				},
			}),
		);

		await expect(resolveWorkflow("nonexistent", tmp.path)).rejects.toThrow(
			'Unknown workflow "nonexistent"',
		);
	});
});

describe("listWorkflows", () => {
	test("returns empty array when no config exists", async () => {
		const listed = await listWorkflows(tmp.path);
		expect(listed).toEqual([]);
	});

	test("returns same result as loadWorkflows", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				workflows: {
					build: {
						description: "Build workflow",
						chain: "planner -> coordinator",
					},
				},
			}),
		);

		const loaded = await loadWorkflows(tmp.path);
		const listed = await listWorkflows(tmp.path);

		expect(listed).toEqual(loaded);
	});
});
