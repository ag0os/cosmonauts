/**
 * Tests for workflow loader.
 *
 * Workflows come from two sources: domain-provided defaults and
 * project config (`.cosmonauts/config.json`). Project config takes
 * precedence on name collision.
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

describe("domain workflow merging", () => {
	test("merges domain workflows with project config", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				workflows: {
					deploy: { description: "Deploy", chain: "worker" },
				},
			}),
		);

		const domainWorkflows = [
			{
				name: "plan-and-build",
				description: "Full pipeline",
				chain: "planner -> coordinator",
			},
			{ name: "verify", description: "Review", chain: "quality-manager" },
		];

		const workflows = await loadWorkflows(tmp.path, domainWorkflows);
		expect(workflows).toHaveLength(3);
		expect(workflows.map((w) => w.name)).toContain("plan-and-build");
		expect(workflows.map((w) => w.name)).toContain("verify");
		expect(workflows.map((w) => w.name)).toContain("deploy");
	});

	test("project config overrides domain workflow on name collision", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				workflows: {
					"plan-and-build": {
						description: "Custom pipeline",
						chain: "worker",
					},
				},
			}),
		);

		const domainWorkflows = [
			{
				name: "plan-and-build",
				description: "Default pipeline",
				chain: "planner -> coordinator",
			},
		];

		const workflows = await loadWorkflows(tmp.path, domainWorkflows);
		expect(workflows).toHaveLength(1);
		const pab = workflows.find((w) => w.name === "plan-and-build");
		expect(pab?.chain).toBe("worker"); // project config wins
		expect(pab?.description).toBe("Custom pipeline");
	});

	test("domain workflows returned when no project config exists", async () => {
		const domainWorkflows = [
			{
				name: "plan-and-build",
				description: "Full pipeline",
				chain: "planner -> coordinator",
			},
		];

		const workflows = await loadWorkflows(tmp.path, domainWorkflows);
		expect(workflows).toHaveLength(1);
		expect(workflows[0]?.name).toBe("plan-and-build");
	});

	test("resolveWorkflow finds domain-provided workflow", async () => {
		const domainWorkflows = [
			{
				name: "plan-and-build",
				description: "Full pipeline",
				chain: "planner -> coordinator",
			},
		];

		const wf = await resolveWorkflow(
			"plan-and-build",
			tmp.path,
			domainWorkflows,
		);
		expect(wf.name).toBe("plan-and-build");
		expect(wf.chain).toBe("planner -> coordinator");
	});

	test("listWorkflows includes domain workflows", async () => {
		const domainWorkflows = [
			{ name: "verify", description: "Review", chain: "quality-manager" },
		];

		const listed = await listWorkflows(tmp.path, domainWorkflows);
		expect(listed).toHaveLength(1);
		expect(listed[0]?.name).toBe("verify");
	});
});
