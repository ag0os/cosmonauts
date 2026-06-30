import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
	loadPrompt,
	loadPrompts,
	PROMPTS_DIR,
	renderRuntimeTemplate,
} from "../../lib/prompts/loader.ts";
import { useTempDir } from "../helpers/fs.ts";

// ============================================================================
// Fixtures
// ============================================================================

const tmp = useTempDir("prompts-test-");

beforeEach(async () => {
	await mkdir(join(tmp.path, "capabilities"), { recursive: true });
	await mkdir(join(tmp.path, "agents", "coding"), { recursive: true });
	await mkdir(join(tmp.path, "alpha", "capabilities"), { recursive: true });
	await mkdir(join(tmp.path, "alpha", "prompts"), { recursive: true });
	await writeFile(
		join(tmp.path, "alpha", "capabilities", "alpha-readwrite.md"),
		"Alpha readwrite capability.",
	);
	await writeFile(
		join(tmp.path, "alpha", "capabilities", "alpha-readonly.md"),
		"Alpha readonly capability.",
	);
	for (const persona of [
		"cody",
		"planner",
		"task-manager",
		"coordinator",
		"worker",
		"quality-manager",
		"integration-verifier",
		"reviewer",
		"fixer",
	]) {
		const title = persona
			.split("-")
			.map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
			.join(" ");
		await writeFile(
			join(tmp.path, "alpha", "prompts", `${persona}.md`),
			`# ${title}\n\nSynthetic ${persona} persona.`,
		);
	}
});

// ============================================================================
// loadPrompt
// ============================================================================

describe("loadPrompt", () => {
	it("reads a single file and returns content", async () => {
		await writeFile(
			join(tmp.path, "capabilities", "core.md"),
			"# Core\n\nYou are a coding assistant.",
		);

		const content = await loadPrompt("capabilities/core", tmp.path);
		expect(content).toBe("# Core\n\nYou are a coding assistant.");
	});

	it("strips YAML frontmatter if present", async () => {
		await writeFile(
			join(tmp.path, "agents", "coding", "planner.md"),
			"---\nname: planner\ndescription: Plans things\n---\n\n# Planner\n\nYou plan.",
		);

		const content = await loadPrompt("agents/coding/planner", tmp.path);
		expect(content).toBe("# Planner\n\nYou plan.");
	});

	it("returns content unchanged when no frontmatter", async () => {
		const raw = "# Worker\n\nYou implement tasks.";
		await writeFile(join(tmp.path, "agents", "coding", "worker.md"), raw);

		const content = await loadPrompt("agents/coding/worker", tmp.path);
		expect(content).toBe(raw);
	});

	it("throws for missing file with descriptive message", async () => {
		await expect(
			loadPrompt("agents/coding/nonexistent", tmp.path),
		).rejects.toThrow(/Prompt file not found.*nonexistent/);
	});

	it("includes the ref in the error message", async () => {
		await expect(loadPrompt("capabilities/missing", tmp.path)).rejects.toThrow(
			'ref: "capabilities/missing"',
		);
	});
});

// ============================================================================
// loadPrompts
// ============================================================================

describe("loadPrompts", () => {
	it("concatenates multiple files with double newline", async () => {
		await writeFile(join(tmp.path, "capabilities", "core.md"), "# Core");
		await writeFile(
			join(tmp.path, "agents", "coding", "planner.md"),
			"# Planner",
		);

		const content = await loadPrompts(
			["capabilities/core", "agents/coding/planner"],
			tmp.path,
		);
		expect(content).toBe("# Core\n\n# Planner");
	});

	it("returns empty string for empty array", async () => {
		const content = await loadPrompts([], tmp.path);
		expect(content).toBe("");
	});

	it("returns single file content without extra separators", async () => {
		await writeFile(join(tmp.path, "capabilities", "core.md"), "# Core");

		const content = await loadPrompts(["capabilities/core"], tmp.path);
		expect(content).toBe("# Core");
	});

	it("strips frontmatter from all files when concatenating", async () => {
		await writeFile(
			join(tmp.path, "capabilities", "core.md"),
			"---\nname: core\n---\n\n# Core",
		);
		await writeFile(
			join(tmp.path, "agents", "coding", "worker.md"),
			"---\nname: worker\n---\n\n# Worker",
		);

		const content = await loadPrompts(
			["capabilities/core", "agents/coding/worker"],
			tmp.path,
		);
		expect(content).toBe("# Core\n\n# Worker");
	});

	it("throws if any file is missing", async () => {
		await writeFile(join(tmp.path, "capabilities", "core.md"), "# Core");

		await expect(
			loadPrompts(["capabilities/core", "agents/coding/nonexistent"], tmp.path),
		).rejects.toThrow(/Prompt file not found/);
	});
});

// ============================================================================
// PROMPTS_DIR
// ============================================================================

describe("PROMPTS_DIR", () => {
	it("points to lib/prompts/framework directory", () => {
		expect(PROMPTS_DIR).toMatch(/lib\/prompts\/framework$/);
	});
});

// ============================================================================
// renderRuntimeTemplate
// ============================================================================

describe("renderRuntimeTemplate", () => {
	it("replaces parentRole with provided value", () => {
		const result = renderRuntimeTemplate("Agent: {{parentRole}}", {
			parentRole: "coordinator",
		});
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
// Domain-based prompt file paths
// ============================================================================

/** Resolve domain directories relative to the framework prompts directory. */
const PROJECT_ROOT = resolve(PROMPTS_DIR, "..", "..", "..");
const SHARED_CAPABILITIES_DIR = join(
	PROJECT_ROOT,
	"domains",
	"shared",
	"capabilities",
);
const alphaCapabilitiesDir = () => join(tmp.path, "alpha", "capabilities");
const alphaPromptsDir = () => join(tmp.path, "alpha", "prompts");

describe("domain-based prompt file paths", () => {
	it("loads base prompt from lib/prompts/framework", async () => {
		const content = await loadPrompt("base");
		expect(content.length).toBeGreaterThan(0);
		expect(content).toContain("# Cosmonauts");
	});

	it("loads runtime sub-agent template from lib/prompts/framework", async () => {
		const content = await loadPrompt("runtime/sub-agent");
		expect(content.length).toBeGreaterThan(0);
		expect(content).toContain("{{parentRole}}");
	});

	it("loads shared capability files from domains/shared/capabilities", async () => {
		const capabilities = ["tasks", "spawning", "todo"];
		for (const ref of capabilities) {
			const content = await loadPrompt(ref, SHARED_CAPABILITIES_DIR);
			expect(content.length).toBeGreaterThan(0);
		}
	});

	it("loads synthetic domain capability files from a domain capabilities directory", async () => {
		// @cosmo-behavior plan:coding-agnostic-framework#B-017
		const capabilities = ["alpha-readwrite", "alpha-readonly"];
		for (const ref of capabilities) {
			const content = await loadPrompt(ref, alphaCapabilitiesDir());
			expect(content.length).toBeGreaterThan(0);
		}
	});

	it("loads all synthetic persona files from a domain prompts directory", async () => {
		const personas = [
			"cody",
			"planner",
			"task-manager",
			"coordinator",
			"worker",
			"quality-manager",
			"integration-verifier",
			"reviewer",
			"fixer",
		];
		for (const ref of personas) {
			const content = await loadPrompt(ref, alphaPromptsDir());
			expect(content.length).toBeGreaterThan(0);
		}
	});

	it("loads the integration-verifier persona prompt", async () => {
		const content = await loadPrompt("integration-verifier", alphaPromptsDir());
		expect(content.length).toBeGreaterThan(0);
		expect(content).toContain("# Integration Verifier");
	});

	it("loads full layered prompt stack for cody across directories", async () => {
		const base = await loadPrompt("base");
		const sharedCaps = await loadPrompts(
			["tasks", "spawning", "todo"],
			SHARED_CAPABILITIES_DIR,
		);
		const alphaCaps = await loadPrompts(
			["alpha-readwrite"],
			alphaCapabilitiesDir(),
		);
		const persona = await loadPrompt("cody", alphaPromptsDir());

		const content = [base, sharedCaps, alphaCaps, persona].join("\n\n");
		expect(content.length).toBeGreaterThan(0);
		// Verify ordering: base content appears before persona
		const baseIdx = content.indexOf("# Cosmonauts");
		const personaIdx = content.indexOf("# Cody\n");
		expect(baseIdx).toBeGreaterThanOrEqual(0);
		expect(personaIdx).toBeGreaterThan(0);
		expect(baseIdx).toBeLessThan(personaIdx);
	});
});
