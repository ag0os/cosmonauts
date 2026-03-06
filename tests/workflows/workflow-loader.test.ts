/**
 * Tests for workflow loader.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { DEFAULT_WORKFLOWS } from "../../lib/workflows/defaults.ts";
import {
	listWorkflows,
	loadWorkflows,
	resolveWorkflow,
} from "../../lib/workflows/loader.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("workflow-test-");

describe("DEFAULT_WORKFLOWS", () => {
	test("includes plan-and-build, implement, and verify", () => {
		const names = DEFAULT_WORKFLOWS.map((wf) => wf.name);
		expect(names).toContain("plan-and-build");
		expect(names).toContain("implement");
		expect(names).toContain("verify");
	});

	test("each default has name, description, and chain", () => {
		for (const wf of DEFAULT_WORKFLOWS) {
			expect(wf.name).toBeTruthy();
			expect(wf.description).toBeTruthy();
			expect(wf.chain).toBeTruthy();
		}
	});
});

describe("loadWorkflows", () => {
	test("returns built-in defaults when no config file exists", async () => {
		const workflows = await loadWorkflows(tmp.path);

		expect(workflows.length).toBe(DEFAULT_WORKFLOWS.length);
		expect(workflows.map((w) => w.name)).toContain("plan-and-build");
		expect(workflows.map((w) => w.name)).toContain("implement");
		expect(workflows.map((w) => w.name)).toContain("verify");
	});

	test("merges project config workflows with defaults", async () => {
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
		expect(workflows.map((w) => w.name)).toContain("plan-and-build");
		expect(workflows.length).toBe(DEFAULT_WORKFLOWS.length + 1);
	});

	test("project config overrides default workflow with same name", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				workflows: {
					"plan-and-build": {
						description: "Custom pipeline",
						chain: "planner -> coordinator",
					},
				},
			}),
		);

		const workflows = await loadWorkflows(tmp.path);

		const pnb = workflows.find((w) => w.name === "plan-and-build");
		expect(pnb).toBeDefined();
		expect(pnb?.chain).toBe("planner -> coordinator");
		expect(pnb?.description).toBe("Custom pipeline");
	});

	test("loads multiple workflows from config alongside defaults", async () => {
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

		expect(workflows.map((w) => w.name)).toContain("build");
		expect(workflows.map((w) => w.name)).toContain("deploy");
		expect(workflows.map((w) => w.name)).toContain("plan-and-build");
		expect(workflows.length).toBe(DEFAULT_WORKFLOWS.length + 2);
	});

	test("invalid JSON throws descriptive error", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			"not valid json {{{",
		);

		await expect(loadWorkflows(tmp.path)).rejects.toThrow("Invalid JSON");
	});

	test("empty config returns only defaults", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({}),
		);

		const workflows = await loadWorkflows(tmp.path);
		expect(workflows.length).toBe(DEFAULT_WORKFLOWS.length);
	});

	test("config with only skills and no workflows returns only defaults", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ skills: ["typescript"] }),
		);

		const workflows = await loadWorkflows(tmp.path);
		expect(workflows.length).toBe(DEFAULT_WORKFLOWS.length);
	});
});

describe("resolveWorkflow", () => {
	test("resolves built-in plan-and-build without any config", async () => {
		const wf = await resolveWorkflow("plan-and-build", tmp.path);

		expect(wf.name).toBe("plan-and-build");
		expect(wf.chain).toContain("planner");
	});

	test("resolves built-in implement without any config", async () => {
		const wf = await resolveWorkflow("implement", tmp.path);

		expect(wf.name).toBe("implement");
		expect(wf.chain).toContain("coordinator");
	});

	test("resolves built-in verify without any config", async () => {
		const wf = await resolveWorkflow("verify", tmp.path);

		expect(wf.name).toBe("verify");
		expect(wf.chain).toContain("quality-manager");
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
