import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	loadPrompt,
	loadPrompts,
	renderRuntimeTemplate,
	PROMPTS_DIR,
} from "../../lib/prompts/loader.ts";

// ============================================================================
// Fixtures
// ============================================================================

let tmpDir: string;

beforeEach(async () => {
	tmpDir = await mkdtemp(join(tmpdir(), "prompts-test-"));
	await mkdir(join(tmpDir, "base"), { recursive: true });
	await mkdir(join(tmpDir, "roles"), { recursive: true });
});

afterEach(async () => {
	await rm(tmpDir, { recursive: true, force: true });
});

// ============================================================================
// loadPrompt
// ============================================================================

describe("loadPrompt", () => {
	it("reads a single file and returns content", async () => {
		await writeFile(
			join(tmpDir, "base", "coding.md"),
			"# Coding\n\nYou are a coding assistant.",
		);

		const content = await loadPrompt("base/coding", tmpDir);
		expect(content).toBe("# Coding\n\nYou are a coding assistant.");
	});

	it("strips YAML frontmatter if present", async () => {
		await writeFile(
			join(tmpDir, "roles", "planner.md"),
			"---\nname: planner\ndescription: Plans things\n---\n\n# Planner\n\nYou plan.",
		);

		const content = await loadPrompt("roles/planner", tmpDir);
		expect(content).toBe("# Planner\n\nYou plan.");
	});

	it("returns content unchanged when no frontmatter", async () => {
		const raw = "# Worker\n\nYou implement tasks.";
		await writeFile(join(tmpDir, "roles", "worker.md"), raw);

		const content = await loadPrompt("roles/worker", tmpDir);
		expect(content).toBe(raw);
	});

	it("throws for missing file with descriptive message", async () => {
		await expect(loadPrompt("roles/nonexistent", tmpDir)).rejects.toThrow(
			/Prompt file not found.*nonexistent/,
		);
	});

	it("includes the ref in the error message", async () => {
		await expect(loadPrompt("missing/ref", tmpDir)).rejects.toThrow(
			'ref: "missing/ref"',
		);
	});
});

// ============================================================================
// loadPrompts
// ============================================================================

describe("loadPrompts", () => {
	it("concatenates multiple files with double newline", async () => {
		await writeFile(join(tmpDir, "base", "coding.md"), "# Base");
		await writeFile(join(tmpDir, "roles", "planner.md"), "# Planner");

		const content = await loadPrompts(["base/coding", "roles/planner"], tmpDir);
		expect(content).toBe("# Base\n\n# Planner");
	});

	it("returns empty string for empty array", async () => {
		const content = await loadPrompts([], tmpDir);
		expect(content).toBe("");
	});

	it("returns single file content without extra separators", async () => {
		await writeFile(join(tmpDir, "base", "coding.md"), "# Base");

		const content = await loadPrompts(["base/coding"], tmpDir);
		expect(content).toBe("# Base");
	});

	it("strips frontmatter from all files when concatenating", async () => {
		await writeFile(
			join(tmpDir, "base", "coding.md"),
			"---\nname: coding\n---\n\n# Base",
		);
		await writeFile(
			join(tmpDir, "roles", "worker.md"),
			"---\nname: worker\n---\n\n# Worker",
		);

		const content = await loadPrompts(["base/coding", "roles/worker"], tmpDir);
		expect(content).toBe("# Base\n\n# Worker");
	});

	it("throws if any file is missing", async () => {
		await writeFile(join(tmpDir, "base", "coding.md"), "# Base");

		await expect(
			loadPrompts(["base/coding", "roles/nonexistent"], tmpDir),
		).rejects.toThrow(/Prompt file not found/);
	});
});

// ============================================================================
// PROMPTS_DIR
// ============================================================================

describe("PROMPTS_DIR", () => {
	it("points to a prompts directory path", () => {
		expect(PROMPTS_DIR).toMatch(/prompts$/);
	});
});

// ============================================================================
// renderRuntimeTemplate
// ============================================================================

describe("renderRuntimeTemplate", () => {
	it("replaces parentRole with provided value", () => {
		const result = renderRuntimeTemplate("Agent: {{parentRole}}", { parentRole: "coordinator" });
		expect(result).toBe("Agent: coordinator");
	});

	it("defaults parentRole to 'unknown'", () => {
		const result = renderRuntimeTemplate("Agent: {{parentRole}}", {});
		expect(result).toBe("Agent: unknown");
	});

	it("defaults objective to standard message", () => {
		const result = renderRuntimeTemplate("Goal: {{objective}}", {});
		expect(result).toBe("Goal: Complete the assigned work");
	});

	it("includes conditional block when taskId is present", () => {
		const result = renderRuntimeTemplate(
			"{{#taskId}}Task: {{taskId}}{{/taskId}}",
			{ taskId: "COSMO-001" },
		);
		expect(result).toBe("Task: COSMO-001");
	});

	it("removes conditional block when taskId is absent", () => {
		const result = renderRuntimeTemplate(
			"Before {{#taskId}}Task: {{taskId}}{{/taskId}} After",
			{},
		);
		expect(result).not.toContain("Task:");
		expect(result).toContain("Before");
		expect(result).toContain("After");
	});

	it("strips unknown template tokens", () => {
		const result = renderRuntimeTemplate("Hello {{unknown}} world", {});
		expect(result).toBe("Hello  world");
	});

	it("handles all fields together", () => {
		const result = renderRuntimeTemplate(
			"Role: {{parentRole}}, Goal: {{objective}}. {{#taskId}}Task: {{taskId}}.{{/taskId}}",
			{ parentRole: "coordinator", objective: "build feature", taskId: "T-1" },
		);
		expect(result).toContain("coordinator");
		expect(result).toContain("build feature");
		expect(result).toContain("T-1");
		expect(result).not.toMatch(/\{\{.*?\}\}/);
	});
});

// ============================================================================
// New prompt file paths (integration tests against real PROMPTS_DIR)
// ============================================================================

describe("new prompt file paths", () => {
	it("loads cosmonauts base prompt", async () => {
		const content = await loadPrompt("cosmonauts");
		expect(content.length).toBeGreaterThan(0);
	});

	it("loads all capability files", async () => {
		const capabilities = [
			"capabilities/core",
			"capabilities/coding-readwrite",
			"capabilities/coding-readonly",
			"capabilities/tasks",
			"capabilities/spawning",
			"capabilities/todo",
		];
		for (const ref of capabilities) {
			const content = await loadPrompt(ref);
			expect(content.length).toBeGreaterThan(0);
		}
	});

	it("loads all persona files", async () => {
		const personas = [
			"agents/coding/cosmo",
			"agents/coding/planner",
			"agents/coding/task-manager",
			"agents/coding/coordinator",
			"agents/coding/worker",
		];
		for (const ref of personas) {
			const content = await loadPrompt(ref);
			expect(content.length).toBeGreaterThan(0);
		}
	});

	it("loads runtime sub-agent template", async () => {
		const content = await loadPrompt("runtime/sub-agent");
		expect(content.length).toBeGreaterThan(0);
		expect(content).toContain("{{parentRole}}");
	});

	it("loads full layered prompt stack for cosmo", async () => {
		const content = await loadPrompts([
			"cosmonauts",
			"capabilities/core",
			"capabilities/coding-readwrite",
			"capabilities/tasks",
			"capabilities/spawning",
			"capabilities/todo",
			"agents/coding/cosmo",
		]);
		expect(content.length).toBeGreaterThan(0);
		// Verify ordering: base content appears before persona
		const baseIdx = content.indexOf("# Cosmonauts");
		const personaIdx = content.indexOf("# Cosmo\n");
		expect(baseIdx).toBeGreaterThanOrEqual(0);
		expect(personaIdx).toBeGreaterThan(0);
		expect(baseIdx).toBeLessThan(personaIdx);
	});
});
