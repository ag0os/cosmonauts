import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { compileAgentPackageBinary } from "../../lib/agent-packages/export.ts";
import type { AgentPackage } from "../../lib/agent-packages/types.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("agent-package-export-");

const basePackage = {
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
			agentPackage: basePackage,
			outFile,
			execFile,
		});

		expect(generatedSource).toContain('import { runClaudeBinary } from "');
		expect(generatedSource).not.toContain("file://");
		expect(generatedSource).toContain(
			"/lib/agent-packages/claude-binary-runner.ts",
		);
		expect(generatedSource).toContain(
			JSON.stringify(JSON.stringify(basePackage)),
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
});
