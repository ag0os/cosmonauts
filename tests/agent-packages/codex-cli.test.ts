import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCodexCliInvocation } from "../../lib/agent-packages/codex-cli.ts";
import type { AgentPackage } from "../../lib/agent-packages/types.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("codex-cli-invocation-");

const basePackage = {
	schemaVersion: 1,
	packageId: "sample-codex",
	description: "Sample Codex package.",
	systemPrompt: "You are a packaged Codex agent.",
	tools: "coding",
	skills: [],
	projectContext: "omit",
	target: "codex",
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
	overrides: Partial<Parameters<typeof createCodexCliInvocation>[1]> = {},
) {
	return createCodexCliInvocation(agentPackage, {
		cwd: tmp.path,
		codexArgs: [],
		env: { PATH: "/usr/bin", OPENAI_API_KEY: "secret" },
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

function instructionsOverride(systemPromptPath: string): string {
	return `model_instructions_file=${JSON.stringify(systemPromptPath)}`;
}

describe("createCodexCliInvocation", () => {
	it("builds the default Codex argv and writes the system prompt asset", async () => {
		const invocation = await materialize();
		try {
			const systemPromptPath = join(invocation.tempDir, "system.md");

			expect(invocation.spec.command).toBe("codex");
			expect(invocation.spec.args).toEqual([
				"-c",
				instructionsOverride(systemPromptPath),
				"--sandbox",
				"workspace-write",
			]);
			expect(await readFile(systemPromptPath, "utf-8")).toBe(
				basePackage.systemPrompt,
			);
			expect(await readdir(invocation.tempDir)).toEqual(["system.md"]);
		} finally {
			await invocation.cleanup();
		}
	});

	it("inserts instructions and package sandbox after the exec subcommand", async () => {
		const invocation = await materialize(basePackage, {
			codexArgs: ["exec", "--sandbox", "workspace-write", "-"],
		});
		try {
			const systemPromptPath = join(invocation.tempDir, "system.md");

			expect(invocation.spec.args).toEqual([
				"exec",
				"-c",
				instructionsOverride(systemPromptPath),
				"--sandbox",
				"workspace-write",
				"-",
			]);
		} finally {
			await invocation.cleanup();
		}
	});

	it("narrows readonly packages to Codex read-only sandbox", async () => {
		const invocation = await materialize(makePackage({ tools: "readonly" }), {
			codexArgs: ["exec", "--sandbox", "workspace-write", "-"],
		});
		try {
			const systemPromptPath = join(invocation.tempDir, "system.md");

			expect(invocation.spec.args).toEqual([
				"exec",
				"-c",
				instructionsOverride(systemPromptPath),
				"--sandbox",
				"read-only",
				"-",
			]);
		} finally {
			await invocation.cleanup();
		}
	});

	it("uses read-only sandbox for verification and no-tool packages", async () => {
		for (const tools of ["verification", "none"] as const) {
			const invocation = await materialize(makePackage({ tools }));
			try {
				expect(invocation.spec.args).toContain("--sandbox");
				expect(invocation.spec.args.at(-1)).toBe("read-only");
			} finally {
				await invocation.cleanup();
			}
		}
	});

	it("preserves a user sandbox when it is stricter than the package maximum", async () => {
		const invocation = await materialize(basePackage, {
			codexArgs: ["exec", "--sandbox", "read-only", "-"],
		});
		try {
			expect(invocation.spec.args).toContain("--sandbox");
			expect(invocation.spec.args.at(-2)).toBe("read-only");
		} finally {
			await invocation.cleanup();
		}
	});

	it("passes prompts and flags through for interactive Codex runs", async () => {
		const invocation = await materialize(basePackage, {
			codexArgs: ["--sandbox", "workspace-write", "implement the task"],
		});
		try {
			const systemPromptPath = join(invocation.tempDir, "system.md");

			expect(invocation.spec.args).toEqual([
				"-c",
				instructionsOverride(systemPromptPath),
				"--sandbox",
				"workspace-write",
				"implement the task",
			]);
		} finally {
			await invocation.cleanup();
		}
	});

	it("strips dangerous sandbox bypass flags", async () => {
		const invocation = await materialize(makePackage({ tools: "readonly" }), {
			codexArgs: [
				"exec",
				"--dangerously-bypass-approvals-and-sandbox",
				"--yolo",
				"-",
			],
		});
		try {
			expect(invocation.spec.args).toContain("read-only");
			expect(invocation.spec.args).not.toContain(
				"--dangerously-bypass-approvals-and-sandbox",
			);
			expect(invocation.spec.args).not.toContain("--yolo");
		} finally {
			await invocation.cleanup();
		}
	});

	it("preserves the caller environment and uses the caller cwd", async () => {
		const invocation = await materialize();
		try {
			expect(invocation.spec.cwd).toBe(tmp.path);
			expect(invocation.spec.env).toMatchObject({
				PATH: "/usr/bin",
				OPENAI_API_KEY: "secret",
			});
			expect(invocation.spec.warnings).toEqual([]);
		} finally {
			await invocation.cleanup();
		}
	});

	it("uses a custom Codex binary when provided", async () => {
		const invocation = await materialize(basePackage, {
			codexBinary: "/opt/bin/codex",
		});
		try {
			expect(invocation.spec.command).toBe("/opt/bin/codex");
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
