/**
 * Tests for CLI argument parsing (parseCliArgs) and framework dev-mode
 * detection helpers (isCosmonautsFrameworkRepo, discoverBundledPackageDirs).
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
	discoverBundledPackageDirs,
	isCosmonautsFrameworkRepo,
	parseCliArgs,
} from "../../cli/main.ts";

describe("parseCliArgs", () => {
	test("defaults: interactive mode, no prompt", () => {
		const opts = parseCliArgs([]);

		expect(opts.print).toBe(false);
		expect(opts.prompt).toBeUndefined();
		expect(opts.agent).toBeUndefined();
		expect(opts.workflow).toBeUndefined();
		expect(opts.chain).toBeUndefined();
		expect(opts.completionLabel).toBeUndefined();
		expect(opts.model).toBeUndefined();
		expect(opts.thinking).toBeUndefined();
		expect(opts.init).toBe(false);
		expect(opts.listWorkflows).toBe(false);
		expect(opts.listAgents).toBe(false);
		expect(opts.domain).toBeUndefined();
		expect(opts.listDomains).toBe(false);
	});

	test("positional args joined into prompt", () => {
		const opts = parseCliArgs(["hello", "world"]);

		expect(opts.prompt).toBe("hello world");
	});

	test("single positional arg as prompt", () => {
		const opts = parseCliArgs(["what is 2+2"]);

		expect(opts.prompt).toBe("what is 2+2");
	});

	test("--print flag sets print mode", () => {
		const opts = parseCliArgs(["--print", "do something"]);

		expect(opts.print).toBe(true);
		expect(opts.prompt).toBe("do something");
	});

	test("-p shorthand sets print mode", () => {
		const opts = parseCliArgs(["-p", "do something"]);

		expect(opts.print).toBe(true);
		expect(opts.prompt).toBe("do something");
	});

	test("--workflow sets workflow name", () => {
		const opts = parseCliArgs(["--workflow", "plan-and-build", "my prompt"]);

		expect(opts.workflow).toBe("plan-and-build");
		expect(opts.prompt).toBe("my prompt");
	});

	test("-w shorthand sets workflow name", () => {
		const opts = parseCliArgs(["-w", "plan-and-build"]);

		expect(opts.workflow).toBe("plan-and-build");
	});

	test("--chain sets chain expression", () => {
		const opts = parseCliArgs([
			"--chain",
			"planner -> coordinator",
			"build it",
		]);

		expect(opts.chain).toBe("planner -> coordinator");
		expect(opts.prompt).toBe("build it");
	});

	test("--completion-label sets completion label", () => {
		const opts = parseCliArgs([
			"--completion-label",
			"plan:auth-system",
			"--chain",
			"planner -> coordinator",
		]);

		expect(opts.completionLabel).toBe("plan:auth-system");
	});

	test("-c shorthand sets chain expression", () => {
		const opts = parseCliArgs(["-c", "planner -> worker"]);

		expect(opts.chain).toBe("planner -> worker");
	});

	test("--model sets model override", () => {
		const opts = parseCliArgs(["--model", "anthropic/claude-opus-4-0"]);

		expect(opts.model).toBe("anthropic/claude-opus-4-0");
	});

	test("-m shorthand sets model override", () => {
		const opts = parseCliArgs(["-m", "anthropic/claude-opus-4-0"]);

		expect(opts.model).toBe("anthropic/claude-opus-4-0");
	});

	test("--thinking without value defaults to high", () => {
		const opts = parseCliArgs(["--thinking"]);

		expect(opts.thinking).toBe("high");
	});

	test("--thinking with value sets specific level", () => {
		const opts = parseCliArgs(["--thinking", "medium"]);

		expect(opts.thinking).toBe("medium");
	});

	test("--thinking with valid levels", () => {
		for (const level of ["off", "minimal", "low", "medium", "high", "xhigh"]) {
			const opts = parseCliArgs(["--thinking", level]);
			expect(opts.thinking).toBe(level);
		}
	});

	test("--thinking with invalid value throws", () => {
		expect(() => parseCliArgs(["--thinking", "turbo"])).toThrow(
			/Invalid thinking level/,
		);
	});

	test("init subcommand sets init flag", () => {
		const opts = parseCliArgs(["init"]);

		expect(opts.init).toBe(true);
		expect(opts.prompt).toBeUndefined();
	});

	test("--list-workflows flag", () => {
		const opts = parseCliArgs(["--list-workflows"]);

		expect(opts.listWorkflows).toBe(true);
	});

	test("combined flags: --print with --model and prompt", () => {
		const opts = parseCliArgs([
			"--print",
			"--model",
			"anthropic/claude-opus-4-0",
			"explain this",
		]);

		expect(opts.print).toBe(true);
		expect(opts.model).toBe("anthropic/claude-opus-4-0");
		expect(opts.prompt).toBe("explain this");
	});

	test("combined flags: --workflow with --thinking", () => {
		const opts = parseCliArgs([
			"--workflow",
			"plan-and-build",
			"--thinking",
			"high",
			"build feature",
		]);

		expect(opts.workflow).toBe("plan-and-build");
		expect(opts.thinking).toBe("high");
		expect(opts.prompt).toBe("build feature");
	});

	test("--agent sets agent ID", () => {
		const opts = parseCliArgs(["--agent", "planner"]);

		expect(opts.agent).toBe("planner");
	});

	test("-a shorthand sets agent ID", () => {
		const opts = parseCliArgs(["-a", "worker"]);

		expect(opts.agent).toBe("worker");
	});

	test("--agent with prompt", () => {
		const opts = parseCliArgs(["--agent", "planner", "design auth system"]);

		expect(opts.agent).toBe("planner");
		expect(opts.prompt).toBe("design auth system");
	});

	test("--agent with --print and prompt", () => {
		const opts = parseCliArgs([
			"--agent",
			"worker",
			"--print",
			"implement COSMO-007",
		]);

		expect(opts.agent).toBe("worker");
		expect(opts.print).toBe(true);
		expect(opts.prompt).toBe("implement COSMO-007");
	});

	test("--agent with --model override", () => {
		const opts = parseCliArgs([
			"-a",
			"planner",
			"-m",
			"anthropic/claude-opus-4-0",
			"design it",
		]);

		expect(opts.agent).toBe("planner");
		expect(opts.model).toBe("anthropic/claude-opus-4-0");
		expect(opts.prompt).toBe("design it");
	});

	test("--list-agents flag", () => {
		const opts = parseCliArgs(["--list-agents"]);

		expect(opts.listAgents).toBe(true);
	});

	test("--domain sets domain context", () => {
		const opts = parseCliArgs(["--domain", "coding"]);

		expect(opts.domain).toBe("coding");
	});

	test("-d shorthand sets domain", () => {
		const opts = parseCliArgs(["-d", "coding"]);

		expect(opts.domain).toBe("coding");
	});

	test("--list-domains flag", () => {
		const opts = parseCliArgs(["--list-domains"]);

		expect(opts.listDomains).toBe(true);
	});

	test("--domain with --list-agents", () => {
		const opts = parseCliArgs(["--list-agents", "-d", "coding"]);

		expect(opts.listAgents).toBe(true);
		expect(opts.domain).toBe("coding");
	});

	test("--domain with --agent and prompt", () => {
		const opts = parseCliArgs(["-d", "coding", "-a", "planner", "design it"]);

		expect(opts.domain).toBe("coding");
		expect(opts.agent).toBe("planner");
		expect(opts.prompt).toBe("design it");
	});

	test("--dump-prompt flag defaults", () => {
		const opts = parseCliArgs(["--dump-prompt"]);

		expect(opts.dumpPrompt).toBe(true);
		expect(opts.dumpPromptFile).toBeUndefined();
	});

	test("--dump-prompt with --agent", () => {
		const opts = parseCliArgs(["--dump-prompt", "--agent", "worker"]);

		expect(opts.dumpPrompt).toBe(true);
		expect(opts.agent).toBe("worker");
	});

	test("--dump-prompt with --file", () => {
		const opts = parseCliArgs(["--dump-prompt", "--file", "/tmp/prompt.md"]);

		expect(opts.dumpPrompt).toBe(true);
		expect(opts.dumpPromptFile).toBe("/tmp/prompt.md");
	});

	test("--dump-prompt with --agent and --file", () => {
		const opts = parseCliArgs([
			"--dump-prompt",
			"-a",
			"planner",
			"--file",
			"/tmp/planner.md",
		]);

		expect(opts.dumpPrompt).toBe(true);
		expect(opts.agent).toBe("planner");
		expect(opts.dumpPromptFile).toBe("/tmp/planner.md");
	});

	test("defaults include dumpPrompt false", () => {
		const opts = parseCliArgs([]);

		expect(opts.dumpPrompt).toBe(false);
		expect(opts.dumpPromptFile).toBeUndefined();
	});
});

// ============================================================================
// isCosmonautsFrameworkRepo
// ============================================================================

describe("isCosmonautsFrameworkRepo", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = join(
			import.meta.dirname,
			`.tmp-framework-repo-${Math.random().toString(36).slice(2)}`,
		);
		await mkdir(tmpDir, { recursive: true });
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	test("returns true when package.json name is 'cosmonauts', bundled/ exists, and .git/ is present", async () => {
		await writeFile(
			join(tmpDir, "package.json"),
			JSON.stringify({ name: "cosmonauts", version: "0.1.0" }),
		);
		await mkdir(join(tmpDir, "bundled"));
		await mkdir(join(tmpDir, ".git"));

		expect(await isCosmonautsFrameworkRepo(tmpDir)).toBe(true);
	});

	test("returns false when package.json name is not 'cosmonauts'", async () => {
		await writeFile(
			join(tmpDir, "package.json"),
			JSON.stringify({ name: "my-project", version: "1.0.0" }),
		);
		await mkdir(join(tmpDir, "bundled"));
		await mkdir(join(tmpDir, ".git"));

		expect(await isCosmonautsFrameworkRepo(tmpDir)).toBe(false);
	});

	test("returns false when bundled/ directory does not exist", async () => {
		await writeFile(
			join(tmpDir, "package.json"),
			JSON.stringify({ name: "cosmonauts", version: "0.1.0" }),
		);
		await mkdir(join(tmpDir, ".git"));

		expect(await isCosmonautsFrameworkRepo(tmpDir)).toBe(false);
	});

	test("returns false for installed package shape without repo marker", async () => {
		await writeFile(
			join(tmpDir, "package.json"),
			JSON.stringify({ name: "cosmonauts", version: "0.1.0" }),
		);
		await mkdir(join(tmpDir, "bundled"));

		expect(await isCosmonautsFrameworkRepo(tmpDir)).toBe(false);
	});

	test("returns false when package.json is absent", async () => {
		await mkdir(join(tmpDir, "bundled"));
		await mkdir(join(tmpDir, ".git"));

		expect(await isCosmonautsFrameworkRepo(tmpDir)).toBe(false);
	});

	test("returns false when package.json is malformed JSON", async () => {
		await writeFile(join(tmpDir, "package.json"), "not json {{{");
		await mkdir(join(tmpDir, "bundled"));
		await mkdir(join(tmpDir, ".git"));

		expect(await isCosmonautsFrameworkRepo(tmpDir)).toBe(false);
	});

	test("returns false when root directory does not exist", async () => {
		expect(await isCosmonautsFrameworkRepo("/no/such/path")).toBe(false);
	});
});

// ============================================================================
// discoverBundledPackageDirs
// ============================================================================

describe("discoverBundledPackageDirs", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = join(
			import.meta.dirname,
			`.tmp-bundled-${Math.random().toString(36).slice(2)}`,
		);
		await mkdir(tmpDir, { recursive: true });
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	test("returns directories that contain cosmonauts.json", async () => {
		await mkdir(join(tmpDir, "coding"));
		await writeFile(
			join(tmpDir, "coding", "cosmonauts.json"),
			JSON.stringify({ name: "coding" }),
		);

		const dirs = await discoverBundledPackageDirs(tmpDir);

		expect(dirs).toEqual([join(tmpDir, "coding")]);
	});

	test("returns multiple package directories", async () => {
		for (const pkg of ["coding", "coding-minimal"]) {
			await mkdir(join(tmpDir, pkg));
			await writeFile(
				join(tmpDir, pkg, "cosmonauts.json"),
				JSON.stringify({ name: pkg }),
			);
		}

		const dirs = await discoverBundledPackageDirs(tmpDir);

		expect(dirs.sort()).toEqual(
			[join(tmpDir, "coding"), join(tmpDir, "coding-minimal")].sort(),
		);
	});

	test("skips directories without cosmonauts.json", async () => {
		await mkdir(join(tmpDir, "with-manifest"));
		await writeFile(
			join(tmpDir, "with-manifest", "cosmonauts.json"),
			JSON.stringify({ name: "with-manifest" }),
		);
		await mkdir(join(tmpDir, "no-manifest"));

		const dirs = await discoverBundledPackageDirs(tmpDir);

		expect(dirs).toEqual([join(tmpDir, "with-manifest")]);
	});

	test("skips files (non-directories)", async () => {
		await writeFile(join(tmpDir, "cosmonauts.json"), "{}");

		const dirs = await discoverBundledPackageDirs(tmpDir);

		expect(dirs).toEqual([]);
	});

	test("returns empty array when bundledDir does not exist", async () => {
		const dirs = await discoverBundledPackageDirs("/no/such/bundled/dir");

		expect(dirs).toEqual([]);
	});

	test("returns empty array when bundledDir is empty", async () => {
		const dirs = await discoverBundledPackageDirs(tmpDir);

		expect(dirs).toEqual([]);
	});
});
