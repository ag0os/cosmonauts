/**
 * Tests for workflow loader.
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

		expect(workflows).toHaveLength(0);
	});

	test("loads workflows from project config.json", async () => {
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

		expect(workflows.map((w) => w.name)).toContain("refactor");
		expect(workflows.length).toBe(1);
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
		expect(workflows).toHaveLength(0);
	});

	test("config with only skills and no workflows returns empty array", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ skills: ["typescript"] }),
		);

		const workflows = await loadWorkflows(tmp.path);
		expect(workflows).toHaveLength(0);
	});
});

describe("resolveWorkflow", () => {
	test("throws when no config and any workflow name requested", async () => {
		await expect(resolveWorkflow("plan-and-build", tmp.path)).rejects.toThrow(
			'Unknown workflow "plan-and-build"',
		);
	});

	test("throws for unknown workflow name", async () => {
		await expect(resolveWorkflow("nonexistent", tmp.path)).rejects.toThrow(
			'Unknown workflow "nonexistent"',
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
});

describe("listWorkflows", () => {
	test("returns same result as loadWorkflows", async () => {
		const loaded = await loadWorkflows(tmp.path);
		const listed = await listWorkflows(tmp.path);

		expect(listed).toEqual(loaded);
	});
});
