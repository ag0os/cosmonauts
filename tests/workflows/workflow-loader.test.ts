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
		expect(workflows.length).toBeGreaterThan(0);
		for (const wf of workflows) {
			expect(wf).toHaveProperty("name");
			expect(wf).toHaveProperty("chain");
			expect(wf).toHaveProperty("description");
		}
	});

	test("loads and merges from project config.json", async () => {
		await mkdir(join(tmpDir, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmpDir, ".cosmonauts", "config.json"),
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
		const builtIn = DEFAULT_WORKFLOWS[0];
		await mkdir(join(tmpDir, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmpDir, ".cosmonauts", "config.json"),
			JSON.stringify({
				workflows: {
					[builtIn.name]: {
						description: "Overridden workflow",
						chain: "worker",
					},
				},
			}),
		);

		const workflows = await loadWorkflows(tmpDir);
		const overridden = workflows.find((w) => w.name === builtIn.name);

		expect(overridden).toBeDefined();
		expect(overridden?.description).toBe("Overridden workflow");
		expect(overridden?.chain).toBe("worker");
		// Same count since it replaced, not added
		expect(workflows.length).toBe(DEFAULT_WORKFLOWS.length);
	});

	test("invalid JSON throws descriptive error", async () => {
		await mkdir(join(tmpDir, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmpDir, ".cosmonauts", "config.json"),
			"not valid json {{{",
		);

		await expect(loadWorkflows(tmpDir)).rejects.toThrow("Invalid JSON");
	});

	test("empty config returns defaults only", async () => {
		await mkdir(join(tmpDir, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmpDir, ".cosmonauts", "config.json"),
			JSON.stringify({}),
		);

		const workflows = await loadWorkflows(tmpDir);
		expect(workflows).toHaveLength(DEFAULT_WORKFLOWS.length);
	});

	test("config with only skills and no workflows returns defaults", async () => {
		await mkdir(join(tmpDir, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmpDir, ".cosmonauts", "config.json"),
			JSON.stringify({ skills: ["typescript"] }),
		);

		const workflows = await loadWorkflows(tmpDir);
		expect(workflows).toHaveLength(DEFAULT_WORKFLOWS.length);
	});
});

describe("resolveWorkflow", () => {
	test("resolves a built-in workflow by name", async () => {
		const builtIn = DEFAULT_WORKFLOWS[0];
		const wf = await resolveWorkflow(builtIn.name, tmpDir);

		expect(wf.name).toBe(builtIn.name);
		expect(wf.chain).toBe(builtIn.chain);
	});

	test("throws for unknown workflow name", async () => {
		await expect(resolveWorkflow("nonexistent", tmpDir)).rejects.toThrow(
			'Unknown workflow "nonexistent"',
		);
	});

	test("resolves project-defined workflow", async () => {
		await mkdir(join(tmpDir, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmpDir, ".cosmonauts", "config.json"),
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

