import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { compileAgentPackageBinary } from "../../lib/agent-packages/export.ts";
import type { AgentPackage } from "../../lib/agent-packages/types.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("agent-package-export-");

const claudePackage = {
	schemaVersion: 1,
	packageId: "sample-agent-claude",
	description: "Sample packaged agent.",
	systemPrompt: "You are packaged.",
	tools: "readonly",
	skills: [],
	projectContext: "omit",
	target: "claude-cli",
	targetOptions: {},
} satisfies AgentPackage;

const codexPackage = {
	...claudePackage,
	packageId: "sample-agent-codex",
	target: "codex",
} satisfies AgentPackage;

describe("compileAgentPackageBinary", () => {
	it("embeds package JSON in a generated entry and compiles it with bun", async () => {
		const outFile = join(tmp.path, "sample-agent");
		let generatedEntry = "";
		let generatedSource = "";
		const execFile = vi.fn(
			async (_command: string, args: readonly string[]) => {
				const entryPath = args[2];
				expect(entryPath).toBeDefined();
				generatedEntry = entryPath ?? "";
				generatedSource = await readFile(generatedEntry, "utf-8");
			},
		);

		await compileAgentPackageBinary({
			agentPackage: claudePackage,
			outFile,
			execFile,
		});

		expect(generatedSource).toContain('import { runClaudeBinary } from "');
		expect(generatedSource).not.toContain("file://");
		expect(generatedSource).toContain(
			"/lib/agent-packages/claude-binary-runner.ts",
		);
		expect(generatedSource).toContain(
			JSON.stringify(JSON.stringify(claudePackage)),
		);
		expect(generatedSource).not.toMatch(
			/readFile|CosmonautsRuntime|missions\//,
		);
		expect(execFile).toHaveBeenCalledWith("bun", [
			"build",
			"--compile",
			generatedEntry,
			"--outfile",
			outFile,
		]);
	});

	it("embeds a Codex package with the Codex runner", async () => {
		const outFile = join(tmp.path, "sample-agent-codex");
		let generatedSource = "";
		const execFile = vi.fn(
			async (_command: string, args: readonly string[]) => {
				const entryPath = args[2];
				expect(entryPath).toBeDefined();
				generatedSource = await readFile(entryPath ?? "", "utf-8");
			},
		);

		await compileAgentPackageBinary({
			agentPackage: codexPackage,
			outFile,
			execFile,
		});

		expect(generatedSource).toContain('import { runCodexBinary } from "');
		expect(generatedSource).toContain(
			"/lib/agent-packages/codex-binary-runner.ts",
		);
		expect(generatedSource).toContain(
			JSON.stringify(JSON.stringify(codexPackage)),
		);
		expect(execFile).toHaveBeenCalledWith("bun", [
			"build",
			"--compile",
			expect.any(String),
			"--outfile",
			outFile,
		]);
	});
});
