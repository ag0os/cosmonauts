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

describe("loadWorkflows", () => {
	test("returns defaults when no config file exists", async () => {
		const workflows = await loadWorkflows(tmp.path);

		expect(workflows).toHaveLength(DEFAULT_WORKFLOWS.length);
		expect(workflows.length).toBeGreaterThan(0);
		for (const wf of workflows) {
			expect(wf).toHaveProperty("name");
			expect(wf).toHaveProperty("chain");
			expect(wf).toHaveProperty("description");
		}
	});

	test("loads and merges from project config.json", async () => {
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
		expect(workflows.length).toBe(DEFAULT_WORKFLOWS.length + 1);
	});

	test("project config overrides built-in on name collision", async () => {
		const builtIn = DEFAULT_WORKFLOWS[0];
		expect(builtIn).toBeDefined();
		if (!builtIn) {
			throw new Error("Expected at least one default workflow");
		}
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				workflows: {
					[builtIn.name]: {
						description: "Overridden workflow",
						chain: "worker",
					},
				},
			}),
		);

		const workflows = await loadWorkflows(tmp.path);
		const overridden = workflows.find((w) => w.name === builtIn.name);

		expect(overridden).toBeDefined();
		expect(overridden?.description).toBe("Overridden workflow");
		expect(overridden?.chain).toBe("worker");
		// Same count since it replaced, not added
		expect(workflows.length).toBe(DEFAULT_WORKFLOWS.length);
	});

	test("invalid JSON throws descriptive error", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			"not valid json {{{",
		);

		await expect(loadWorkflows(tmp.path)).rejects.toThrow("Invalid JSON");
	});

	test("empty config returns defaults only", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({}),
		);

		const workflows = await loadWorkflows(tmp.path);
		expect(workflows).toHaveLength(DEFAULT_WORKFLOWS.length);
	});

	test("config with only skills and no workflows returns defaults", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ skills: ["typescript"] }),
		);

		const workflows = await loadWorkflows(tmp.path);
		expect(workflows).toHaveLength(DEFAULT_WORKFLOWS.length);
	});
});

describe("resolveWorkflow", () => {
	test("resolves a built-in workflow by name", async () => {
		const builtIn = DEFAULT_WORKFLOWS[0];
		expect(builtIn).toBeDefined();
		if (!builtIn) {
			throw new Error("Expected at least one default workflow");
		}
		const wf = await resolveWorkflow(builtIn.name, tmp.path);

		expect(wf.name).toBe(builtIn.name);
		expect(wf.chain).toBe(builtIn.chain);
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
