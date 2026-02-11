import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	loadPrompt,
	loadPrompts,
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
