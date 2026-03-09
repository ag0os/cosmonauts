/**
 * Tests for four-layer convention-based prompt assembly.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assemblePrompts } from "../../lib/domains/prompt-assembly.ts";
import type { RuntimeContext } from "../../lib/domains/prompt-assembly.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("prompt-assembly-");

/** Set up a minimal domain directory structure for testing. */
async function setupDomains(
	domainsDir: string,
	files: Record<string, string>,
): Promise<void> {
	for (const [relativePath, content] of Object.entries(files)) {
		const fullPath = join(domainsDir, relativePath);
		await mkdir(join(fullPath, ".."), { recursive: true });
		await writeFile(fullPath, content, "utf-8");
	}
}

/** Create a standard test fixture with all four layers. */
async function setupStandardFixture(domainsDir: string): Promise<void> {
	await setupDomains(domainsDir, {
		"shared/prompts/base.md": "You are a helpful agent.",
		"shared/capabilities/core.md": "Core capability content.",
		"shared/capabilities/tasks.md": "Tasks capability content.",
		"shared/prompts/runtime/sub-agent.md":
			"Parent: {{parentRole}}\nObjective: {{objective}}\n{{#taskId}}Task: {{taskId}}{{/taskId}}",
		"coding/capabilities/coding-readwrite.md":
			"Coding readwrite capability.",
		"coding/prompts/worker.md": "You are a worker agent.",
	});
}

describe("assemblePrompts", () => {
	describe("Layer 0: Base prompt", () => {
		it("always loads domains/shared/prompts/base.md", async () => {
			await setupStandardFixture(tmp.path);

			const result = await assemblePrompts({
				agentId: "worker",
				domain: "coding",
				capabilities: [],
				domainsDir: tmp.path,
			});

			expect(result).toContain("You are a helpful agent.");
		});

		it("strips YAML frontmatter from base prompt", async () => {
			await setupDomains(tmp.path, {
				"shared/prompts/base.md":
					"---\ntitle: Base\n---\nBase content after frontmatter.",
				"coding/prompts/worker.md": "Worker.",
			});

			const result = await assemblePrompts({
				agentId: "worker",
				domain: "coding",
				capabilities: [],
				domainsDir: tmp.path,
			});

			expect(result).toContain("Base content after frontmatter.");
			expect(result).not.toContain("title: Base");
		});
	});

	describe("Layer 1: Capabilities", () => {
		it("resolves capabilities from the domain first", async () => {
			await setupDomains(tmp.path, {
				"shared/prompts/base.md": "Base.",
				"coding/capabilities/coding-readwrite.md":
					"Domain coding-rw content.",
				"shared/capabilities/coding-readwrite.md":
					"Shared coding-rw content.",
				"coding/prompts/worker.md": "Worker.",
			});

			const result = await assemblePrompts({
				agentId: "worker",
				domain: "coding",
				capabilities: ["coding-readwrite"],
				domainsDir: tmp.path,
			});

			expect(result).toContain("Domain coding-rw content.");
			expect(result).not.toContain("Shared coding-rw content.");
		});

		it("falls back to shared when capability not in domain", async () => {
			await setupDomains(tmp.path, {
				"shared/prompts/base.md": "Base.",
				"shared/capabilities/core.md": "Shared core content.",
				"coding/prompts/worker.md": "Worker.",
			});

			const result = await assemblePrompts({
				agentId: "worker",
				domain: "coding",
				capabilities: ["core"],
				domainsDir: tmp.path,
			});

			expect(result).toContain("Shared core content.");
		});

		it("throws when capability not found in domain or shared", async () => {
			await setupDomains(tmp.path, {
				"shared/prompts/base.md": "Base.",
				"coding/prompts/worker.md": "Worker.",
			});

			await expect(
				assemblePrompts({
					agentId: "worker",
					domain: "coding",
					capabilities: ["nonexistent"],
					domainsDir: tmp.path,
				}),
			).rejects.toThrow(
				'Capability "nonexistent" not found in domain "coding" or shared',
			);
		});

		it("loads multiple capabilities in order", async () => {
			await setupDomains(tmp.path, {
				"shared/prompts/base.md": "Base.",
				"shared/capabilities/core.md": "CORE_CAP",
				"shared/capabilities/tasks.md": "TASKS_CAP",
				"coding/capabilities/coding-readwrite.md": "CODING_RW_CAP",
				"coding/prompts/worker.md": "Worker.",
			});

			const result = await assemblePrompts({
				agentId: "worker",
				domain: "coding",
				capabilities: ["core", "tasks", "coding-readwrite"],
				domainsDir: tmp.path,
			});

			const coreIdx = result.indexOf("CORE_CAP");
			const tasksIdx = result.indexOf("TASKS_CAP");
			const codingIdx = result.indexOf("CODING_RW_CAP");

			expect(coreIdx).toBeLessThan(tasksIdx);
			expect(tasksIdx).toBeLessThan(codingIdx);
		});
	});

	describe("Layer 2: Agent persona", () => {
		it("loads persona prompt from the agent's domain", async () => {
			await setupStandardFixture(tmp.path);

			const result = await assemblePrompts({
				agentId: "worker",
				domain: "coding",
				capabilities: [],
				domainsDir: tmp.path,
			});

			expect(result).toContain("You are a worker agent.");
		});

		it("throws when persona prompt does not exist", async () => {
			await setupDomains(tmp.path, {
				"shared/prompts/base.md": "Base.",
			});

			await expect(
				assemblePrompts({
					agentId: "nonexistent-agent",
					domain: "coding",
					capabilities: [],
					domainsDir: tmp.path,
				}),
			).rejects.toThrow();
		});
	});

	describe("Layer 3: Runtime context", () => {
		it("renders sub-agent runtime template when mode is sub-agent", async () => {
			await setupStandardFixture(tmp.path);

			const runtimeContext: RuntimeContext = {
				mode: "sub-agent",
				parentRole: "coordinator",
				objective: "Implement the auth module",
				taskId: "TASK-042",
			};

			const result = await assemblePrompts({
				agentId: "worker",
				domain: "coding",
				capabilities: [],
				domainsDir: tmp.path,
				runtimeContext,
			});

			expect(result).toContain("Parent: coordinator");
			expect(result).toContain("Objective: Implement the auth module");
			expect(result).toContain("Task: TASK-042");
		});

		it("omits runtime layer for top-level mode", async () => {
			await setupStandardFixture(tmp.path);

			const runtimeContext: RuntimeContext = {
				mode: "top-level",
				parentRole: "coordinator",
			};

			const result = await assemblePrompts({
				agentId: "worker",
				domain: "coding",
				capabilities: [],
				domainsDir: tmp.path,
				runtimeContext,
			});

			expect(result).not.toContain("Parent:");
		});

		it("omits runtime layer when no runtimeContext provided", async () => {
			await setupStandardFixture(tmp.path);

			const result = await assemblePrompts({
				agentId: "worker",
				domain: "coding",
				capabilities: [],
				domainsDir: tmp.path,
			});

			expect(result).not.toContain("Parent:");
			expect(result).not.toContain("Objective:");
		});
	});

	describe("Full four-layer assembly", () => {
		it("assembles all four layers in correct order", async () => {
			await setupStandardFixture(tmp.path);

			const result = await assemblePrompts({
				agentId: "worker",
				domain: "coding",
				capabilities: ["core", "tasks", "coding-readwrite"],
				domainsDir: tmp.path,
				runtimeContext: {
					mode: "sub-agent",
					parentRole: "coordinator",
					objective: "Build feature X",
				},
			});

			// Verify order: base -> capabilities -> persona -> runtime
			const baseIdx = result.indexOf("You are a helpful agent.");
			const coreIdx = result.indexOf("Core capability content.");
			const tasksIdx = result.indexOf("Tasks capability content.");
			const codingIdx = result.indexOf("Coding readwrite capability.");
			const personaIdx = result.indexOf("You are a worker agent.");
			const runtimeIdx = result.indexOf("Parent: coordinator");

			expect(baseIdx).toBeGreaterThanOrEqual(0);
			expect(coreIdx).toBeGreaterThan(baseIdx);
			expect(tasksIdx).toBeGreaterThan(coreIdx);
			expect(codingIdx).toBeGreaterThan(tasksIdx);
			expect(personaIdx).toBeGreaterThan(codingIdx);
			expect(runtimeIdx).toBeGreaterThan(personaIdx);
		});

		it("separates layers with double newlines", async () => {
			await setupDomains(tmp.path, {
				"shared/prompts/base.md": "BASE",
				"shared/capabilities/core.md": "CORE",
				"coding/prompts/worker.md": "WORKER",
			});

			const result = await assemblePrompts({
				agentId: "worker",
				domain: "coding",
				capabilities: ["core"],
				domainsDir: tmp.path,
			});

			expect(result).toBe("BASE\n\nCORE\n\nWORKER");
		});
	});
});
