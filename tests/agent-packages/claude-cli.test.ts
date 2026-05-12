import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createClaudeCliInvocation } from "../../lib/agent-packages/claude-cli.ts";
import type { AgentPackage } from "../../lib/agent-packages/types.ts";
import type { AgentToolSet } from "../../lib/agents/types.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("claude-cli-invocation-");

const basePackage = {
	schemaVersion: 1,
	packageId: "sample-claude",
	description: "Sample Claude package.",
	systemPrompt: "You are a packaged agent.",
	tools: "readonly",
	skills: [],
	projectContext: "omit",
	target: "claude-cli",
	targetOptions: {},
} satisfies AgentPackage;

function makePackage(overrides: Partial<AgentPackage> = {}): AgentPackage {
	return {
		...basePackage,
		...overrides,
		targetOptions: {
			...basePackage.targetOptions,
			...overrides.targetOptions,
		},
	};
}

async function materialize(
	agentPackage: AgentPackage = basePackage,
	overrides: Partial<Parameters<typeof createClaudeCliInvocation>[1]> = {},
) {
	return createClaudeCliInvocation(agentPackage, {
		cwd: tmp.path,
		stdin: "inspect the repository",
		env: { PATH: "/usr/bin", ANTHROPIC_API_KEY: "secret" },
		...overrides,
	});
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return false;
		}
		throw error;
	}
}

describe("createClaudeCliInvocation", () => {
	it("builds the default Claude argv and writes the system prompt asset", async () => {
		const invocation = await materialize();
		try {
			const systemPromptPath = join(invocation.tempDir, "system.md");

			expect(invocation.spec.command).toBe("claude");
			expect(invocation.spec.args).toEqual([
				"-p",
				"--bare",
				"--setting-sources",
				"",
				"--append-system-prompt-file",
				systemPromptPath,
				"--tools",
				"Read,Glob,Grep",
			]);
			expect(await readFile(systemPromptPath, "utf-8")).toBe(
				basePackage.systemPrompt,
			);
			expect(await readdir(invocation.tempDir)).toEqual(["system.md"]);
		} finally {
			await invocation.cleanup();
		}
	});

	it("uses the replace prompt flag without the append prompt flag", async () => {
		const invocation = await materialize(
			makePackage({ targetOptions: { promptMode: "replace" } }),
		);
		try {
			const systemPromptPath = join(invocation.tempDir, "system.md");

			expect(invocation.spec.args).toContain("--system-prompt-file");
			expect(invocation.spec.args).not.toContain("--append-system-prompt-file");
			expect(invocation.spec.args).toEqual([
				"-p",
				"--bare",
				"--setting-sources",
				"",
				"--system-prompt-file",
				systemPromptPath,
				"--tools",
				"Read,Glob,Grep",
			]);
		} finally {
			await invocation.cleanup();
		}
	});

	it.each([
		["coding", "Bash,Edit,Read,Write,Glob,Grep"],
		["readonly", "Read,Glob,Grep"],
		["verification", "Bash,Read,Glob,Grep"],
		["none", ""],
	] satisfies readonly [
		AgentToolSet,
		string,
	][])("maps the %s tool preset to Claude tool names", async (tools, expectedTools) => {
		const invocation = await materialize(makePackage({ tools }));
		try {
			expect(invocation.spec.args.at(-1)).toBe(expectedTools);
		} finally {
			await invocation.cleanup();
		}
	});

	it("uses target allowedTools instead of the preset mapping", async () => {
		const invocation = await materialize(
			makePackage({
				tools: "readonly",
				targetOptions: { allowedTools: ["Read", "TodoWrite", "Task"] },
			}),
		);
		try {
			expect(invocation.spec.args.at(-1)).toBe("Read,TodoWrite,Task");
		} finally {
			await invocation.cleanup();
		}
	});

	it("removes ANTHROPIC_API_KEY and adds a warning by default", async () => {
		const invocation = await materialize();
		try {
			expect(invocation.spec.env.PATH).toBe("/usr/bin");
			expect(invocation.spec.env.ANTHROPIC_API_KEY).toBeUndefined();
			expect(invocation.spec.warnings).toEqual([
				{
					code: "anthropic_api_key_removed",
					message:
						"Cosmonauts removed ANTHROPIC_API_KEY before launching claude-cli to preserve Claude subscription auth. Pass --allow-api-billing to opt into API billing.",
				},
			]);
		} finally {
			await invocation.cleanup();
		}
	});

	it("preserves ANTHROPIC_API_KEY when API billing is explicitly allowed", async () => {
		const invocation = await materialize(basePackage, {
			allowApiBilling: true,
		});
		try {
			expect(invocation.spec.env.ANTHROPIC_API_KEY).toBe("secret");
			expect(invocation.spec.warnings).toEqual([]);
		} finally {
			await invocation.cleanup();
		}
	});

	it("uses the caller cwd instead of the prompt asset temp dir", async () => {
		const invocation = await materialize();
		try {
			expect(invocation.spec.cwd).toBe(tmp.path);
			expect(invocation.tempDir).not.toBe(tmp.path);
		} finally {
			await invocation.cleanup();
		}
	});

	it("removes the temp dir when cleanup is called and is safe to call more than once", async () => {
		const invocation = await materialize();
		const systemPromptPath = join(invocation.tempDir, "system.md");

		expect(await pathExists(systemPromptPath)).toBe(true);

		await invocation.cleanup();
		await invocation.cleanup();

		expect(await pathExists(invocation.tempDir)).toBe(false);
	});
});
