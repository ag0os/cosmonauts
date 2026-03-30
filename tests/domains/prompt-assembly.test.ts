/**
 * Tests for four-layer convention-based prompt assembly.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { RuntimeContext } from "../../lib/domains/prompt-assembly.ts";
import { assemblePrompts } from "../../lib/domains/prompt-assembly.ts";
import { DomainRegistry } from "../../lib/domains/registry.ts";
import { DomainResolver } from "../../lib/domains/resolver.ts";
import type { LoadedDomain } from "../../lib/domains/types.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("prompt-assembly-");

/** Write files relative to the given base directory. */
async function setupFiles(
	baseDir: string,
	files: Record<string, string>,
): Promise<void> {
	for (const [relativePath, content] of Object.entries(files)) {
		const fullPath = join(baseDir, relativePath);
		await mkdir(join(fullPath, ".."), { recursive: true });
		await writeFile(fullPath, content, "utf-8");
	}
}

/**
 * Build a LoadedDomain for testing.
 * rootDirs points to `join(baseDir, id)`.
 */
function makeDomain(
	baseDir: string,
	id: string,
	resources: {
		capabilities?: string[];
		prompts?: string[];
		extensions?: string[];
		portable?: boolean;
	} = {},
): LoadedDomain {
	return {
		manifest: { id, description: `Test ${id}`, portable: resources.portable },
		portable: resources.portable ?? false,
		agents: new Map(),
		capabilities: new Set(resources.capabilities ?? []),
		prompts: new Set(resources.prompts ?? []),
		skills: new Set(),
		extensions: new Set(resources.extensions ?? []),
		workflows: [],
		rootDirs: [join(baseDir, id)],
	};
}

/** Build a DomainResolver from an array of LoadedDomains. */
function makeResolver(domains: LoadedDomain[]): DomainResolver {
	return new DomainResolver(new DomainRegistry(domains));
}

describe("assemblePrompts", () => {
	describe("Layer 0: Base prompt", () => {
		it("always loads domains/shared/prompts/base.md", async () => {
			await setupFiles(tmp.path, {
				"shared/prompts/base.md": "You are a helpful agent.",
				"coding/prompts/worker.md": "You are a worker agent.",
			});

			const resolver = makeResolver([
				makeDomain(tmp.path, "shared", { prompts: ["base"] }),
				makeDomain(tmp.path, "coding", { prompts: ["worker"] }),
			]);

			const result = await assemblePrompts({
				agentId: "worker",
				domain: "coding",
				capabilities: [],
				resolver,
			});

			expect(result).toContain("You are a helpful agent.");
		});

		it("strips YAML frontmatter from base prompt", async () => {
			await setupFiles(tmp.path, {
				"shared/prompts/base.md":
					"---\ntitle: Base\n---\nBase content after frontmatter.",
				"coding/prompts/worker.md": "Worker.",
			});

			const resolver = makeResolver([
				makeDomain(tmp.path, "shared", { prompts: ["base"] }),
				makeDomain(tmp.path, "coding", { prompts: ["worker"] }),
			]);

			const result = await assemblePrompts({
				agentId: "worker",
				domain: "coding",
				capabilities: [],
				resolver,
			});

			expect(result).toContain("Base content after frontmatter.");
			expect(result).not.toContain("title: Base");
		});
	});

	describe("Layer 1: Capabilities", () => {
		it("resolves capabilities from the domain first (tier 1)", async () => {
			await setupFiles(tmp.path, {
				"shared/prompts/base.md": "Base.",
				"coding/capabilities/coding-readwrite.md": "Domain coding-rw content.",
				"shared/capabilities/coding-readwrite.md": "Shared coding-rw content.",
				"coding/prompts/worker.md": "Worker.",
			});

			const resolver = makeResolver([
				makeDomain(tmp.path, "shared", {
					capabilities: ["coding-readwrite"],
					prompts: ["base"],
				}),
				makeDomain(tmp.path, "coding", {
					capabilities: ["coding-readwrite"],
					prompts: ["worker"],
				}),
			]);

			const result = await assemblePrompts({
				agentId: "worker",
				domain: "coding",
				capabilities: ["coding-readwrite"],
				resolver,
			});

			expect(result).toContain("Domain coding-rw content.");
			expect(result).not.toContain("Shared coding-rw content.");
		});

		it("falls back to shared when capability not in domain (tier 3)", async () => {
			await setupFiles(tmp.path, {
				"shared/prompts/base.md": "Base.",
				"shared/capabilities/core.md": "Shared core content.",
				"coding/prompts/worker.md": "Worker.",
			});

			const resolver = makeResolver([
				makeDomain(tmp.path, "shared", {
					capabilities: ["core"],
					prompts: ["base"],
				}),
				makeDomain(tmp.path, "coding", { prompts: ["worker"] }),
			]);

			const result = await assemblePrompts({
				agentId: "worker",
				domain: "coding",
				capabilities: ["core"],
				resolver,
			});

			expect(result).toContain("Shared core content.");
		});

		it("throws when capability not found in any tier", async () => {
			await setupFiles(tmp.path, {
				"shared/prompts/base.md": "Base.",
				"coding/prompts/worker.md": "Worker.",
			});

			const resolver = makeResolver([
				makeDomain(tmp.path, "shared", { prompts: ["base"] }),
				makeDomain(tmp.path, "coding", { prompts: ["worker"] }),
			]);

			await expect(
				assemblePrompts({
					agentId: "worker",
					domain: "coding",
					capabilities: ["nonexistent"],
					resolver,
				}),
			).rejects.toThrow(
				'Capability "nonexistent" not found in domain "coding" or shared',
			);
		});

		it("loads multiple capabilities in order", async () => {
			await setupFiles(tmp.path, {
				"shared/prompts/base.md": "Base.",
				"shared/capabilities/core.md": "CORE_CAP",
				"shared/capabilities/tasks.md": "TASKS_CAP",
				"coding/capabilities/coding-readwrite.md": "CODING_RW_CAP",
				"coding/prompts/worker.md": "Worker.",
			});

			const resolver = makeResolver([
				makeDomain(tmp.path, "shared", {
					capabilities: ["core", "tasks"],
					prompts: ["base"],
				}),
				makeDomain(tmp.path, "coding", {
					capabilities: ["coding-readwrite"],
					prompts: ["worker"],
				}),
			]);

			const result = await assemblePrompts({
				agentId: "worker",
				domain: "coding",
				capabilities: ["core", "tasks", "coding-readwrite"],
				resolver,
			});

			const coreIdx = result.indexOf("CORE_CAP");
			const tasksIdx = result.indexOf("TASKS_CAP");
			const codingIdx = result.indexOf("CODING_RW_CAP");

			expect(coreIdx).toBeLessThan(tasksIdx);
			expect(tasksIdx).toBeLessThan(codingIdx);
		});

		it("resolves capability from portable domain (tier 2) when not in agent domain", async () => {
			await setupFiles(tmp.path, {
				"shared/prompts/base.md": "Base.",
				"portable-pkg/capabilities/portable-cap.md": "Portable cap content.",
				"coding/prompts/worker.md": "Worker.",
			});

			const resolver = makeResolver([
				makeDomain(tmp.path, "shared", { prompts: ["base"] }),
				makeDomain(tmp.path, "portable-pkg", {
					capabilities: ["portable-cap"],
					portable: true,
				}),
				makeDomain(tmp.path, "coding", { prompts: ["worker"] }),
			]);

			const result = await assemblePrompts({
				agentId: "worker",
				domain: "coding",
				capabilities: ["portable-cap"],
				resolver,
			});

			expect(result).toContain("Portable cap content.");
		});

		it("agent domain (tier 1) wins over portable domain (tier 2)", async () => {
			await setupFiles(tmp.path, {
				"shared/prompts/base.md": "Base.",
				"portable-pkg/capabilities/cap.md": "Portable cap.",
				"coding/capabilities/cap.md": "Domain cap.",
				"coding/prompts/worker.md": "Worker.",
			});

			const resolver = makeResolver([
				makeDomain(tmp.path, "shared", { prompts: ["base"] }),
				makeDomain(tmp.path, "portable-pkg", {
					capabilities: ["cap"],
					portable: true,
				}),
				makeDomain(tmp.path, "coding", {
					capabilities: ["cap"],
					prompts: ["worker"],
				}),
			]);

			const result = await assemblePrompts({
				agentId: "worker",
				domain: "coding",
				capabilities: ["cap"],
				resolver,
			});

			expect(result).toContain("Domain cap.");
			expect(result).not.toContain("Portable cap.");
		});

		it("portable domain (tier 2) wins over shared (tier 3)", async () => {
			await setupFiles(tmp.path, {
				"shared/prompts/base.md": "Base.",
				"shared/capabilities/cap.md": "Shared cap.",
				"portable-pkg/capabilities/cap.md": "Portable cap.",
				"coding/prompts/worker.md": "Worker.",
			});

			const resolver = makeResolver([
				makeDomain(tmp.path, "shared", {
					capabilities: ["cap"],
					prompts: ["base"],
				}),
				makeDomain(tmp.path, "portable-pkg", {
					capabilities: ["cap"],
					portable: true,
				}),
				makeDomain(tmp.path, "coding", { prompts: ["worker"] }),
			]);

			const result = await assemblePrompts({
				agentId: "worker",
				domain: "coding",
				capabilities: ["cap"],
				resolver,
			});

			expect(result).toContain("Portable cap.");
			expect(result).not.toContain("Shared cap.");
		});
	});

	describe("Layer 2: Agent persona", () => {
		it("loads persona prompt from the agent's domain", async () => {
			await setupFiles(tmp.path, {
				"shared/prompts/base.md": "You are a helpful agent.",
				"coding/prompts/worker.md": "You are a worker agent.",
			});

			const resolver = makeResolver([
				makeDomain(tmp.path, "shared", { prompts: ["base"] }),
				makeDomain(tmp.path, "coding", { prompts: ["worker"] }),
			]);

			const result = await assemblePrompts({
				agentId: "worker",
				domain: "coding",
				capabilities: [],
				resolver,
			});

			expect(result).toContain("You are a worker agent.");
		});

		it("throws when persona prompt does not exist", async () => {
			await setupFiles(tmp.path, {
				"shared/prompts/base.md": "Base.",
			});

			const resolver = makeResolver([
				makeDomain(tmp.path, "shared", { prompts: ["base"] }),
				makeDomain(tmp.path, "coding"),
			]);

			await expect(
				assemblePrompts({
					agentId: "nonexistent-agent",
					domain: "coding",
					capabilities: [],
					resolver,
				}),
			).rejects.toThrow();
		});
	});

	describe("Layer 3: Runtime context", () => {
		it("renders sub-agent runtime template when mode is sub-agent", async () => {
			await setupFiles(tmp.path, {
				"shared/prompts/base.md": "You are a helpful agent.",
				"shared/prompts/runtime/sub-agent.md":
					"Parent: {{parentRole}}\nObjective: {{objective}}\n{{#taskId}}Task: {{taskId}}{{/taskId}}",
				"coding/prompts/worker.md": "You are a worker agent.",
			});

			const resolver = makeResolver([
				makeDomain(tmp.path, "shared", { prompts: ["base"] }),
				makeDomain(tmp.path, "coding", { prompts: ["worker"] }),
			]);

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
				resolver,
				runtimeContext,
			});

			expect(result).toContain("Parent: coordinator");
			expect(result).toContain("Objective: Implement the auth module");
			expect(result).toContain("Task: TASK-042");
		});

		it("omits runtime layer for top-level mode", async () => {
			await setupFiles(tmp.path, {
				"shared/prompts/base.md": "You are a helpful agent.",
				"coding/prompts/worker.md": "You are a worker agent.",
			});

			const resolver = makeResolver([
				makeDomain(tmp.path, "shared", { prompts: ["base"] }),
				makeDomain(tmp.path, "coding", { prompts: ["worker"] }),
			]);

			const runtimeContext: RuntimeContext = {
				mode: "top-level",
				parentRole: "coordinator",
			};

			const result = await assemblePrompts({
				agentId: "worker",
				domain: "coding",
				capabilities: [],
				resolver,
				runtimeContext,
			});

			expect(result).not.toContain("Parent:");
		});

		it("omits runtime layer when no runtimeContext provided", async () => {
			await setupFiles(tmp.path, {
				"shared/prompts/base.md": "You are a helpful agent.",
				"coding/prompts/worker.md": "You are a worker agent.",
			});

			const resolver = makeResolver([
				makeDomain(tmp.path, "shared", { prompts: ["base"] }),
				makeDomain(tmp.path, "coding", { prompts: ["worker"] }),
			]);

			const result = await assemblePrompts({
				agentId: "worker",
				domain: "coding",
				capabilities: [],
				resolver,
			});

			expect(result).not.toContain("Parent:");
			expect(result).not.toContain("Objective:");
		});
	});

	describe("Full four-layer assembly", () => {
		it("assembles all four layers in correct order", async () => {
			await setupFiles(tmp.path, {
				"shared/prompts/base.md": "You are a helpful agent.",
				"shared/capabilities/core.md": "Core capability content.",
				"shared/capabilities/tasks.md": "Tasks capability content.",
				"shared/prompts/runtime/sub-agent.md":
					"Parent: {{parentRole}}\nObjective: {{objective}}\n{{#taskId}}Task: {{taskId}}{{/taskId}}",
				"coding/capabilities/coding-readwrite.md":
					"Coding readwrite capability.",
				"coding/prompts/worker.md": "You are a worker agent.",
			});

			const resolver = makeResolver([
				makeDomain(tmp.path, "shared", {
					capabilities: ["core", "tasks"],
					prompts: ["base"],
				}),
				makeDomain(tmp.path, "coding", {
					capabilities: ["coding-readwrite"],
					prompts: ["worker"],
				}),
			]);

			const result = await assemblePrompts({
				agentId: "worker",
				domain: "coding",
				capabilities: ["core", "tasks", "coding-readwrite"],
				resolver,
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
			await setupFiles(tmp.path, {
				"shared/prompts/base.md": "BASE",
				"shared/capabilities/core.md": "CORE",
				"coding/prompts/worker.md": "WORKER",
			});

			const resolver = makeResolver([
				makeDomain(tmp.path, "shared", {
					capabilities: ["core"],
					prompts: ["base"],
				}),
				makeDomain(tmp.path, "coding", { prompts: ["worker"] }),
			]);

			const result = await assemblePrompts({
				agentId: "worker",
				domain: "coding",
				capabilities: ["core"],
				resolver,
			});

			expect(result).toBe("BASE\n\nCORE\n\nWORKER");
		});
	});
});
