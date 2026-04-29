import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import projectToolsExtension from "../../domains/shared/extensions/project-tools/index.ts";
import { createMockPi } from "../helpers/mocks/index.ts";

let tmpDir: string;

beforeEach(async () => {
	tmpDir = await mkdtemp(join(tmpdir(), "project-tools-test-"));
});

afterEach(async () => {
	await rm(tmpDir, { recursive: true, force: true });
});

async function fireBeforeAgentStart(
	cwd: string,
	systemPrompt = "base system prompt",
): Promise<unknown> {
	const pi = createMockPi({ cwd });
	projectToolsExtension(pi as never);
	return pi.fireEvent("before_agent_start", { systemPrompt }, { cwd });
}

describe("project-tools extension", () => {
	describe("registration", () => {
		test("registers before_agent_start handler", () => {
			const pi = createMockPi();
			projectToolsExtension(pi as never);
			expect(pi.events.has("before_agent_start")).toBe(true);
		});
	});

	describe("fallow detection", () => {
		test("detects fallow from fallow.toml", async () => {
			await writeFile(join(tmpDir, "fallow.toml"), "");
			const result = (await fireBeforeAgentStart(tmpDir)) as {
				systemPrompt: string;
			};
			expect(result.systemPrompt).toContain("## Detected Analysis Tools");
			expect(result.systemPrompt).toContain("**fallow**");
			expect(result.systemPrompt).toContain("`fallow.toml`");
		});

		test("detects fallow from .fallowrc.json", async () => {
			await writeFile(join(tmpDir, ".fallowrc.json"), "{}");
			const result = (await fireBeforeAgentStart(tmpDir)) as {
				systemPrompt: string;
			};
			expect(result.systemPrompt).toContain("**fallow**");
			expect(result.systemPrompt).toContain("`.fallowrc.json`");
		});

		test("detects fallow from .fallowrc.toml", async () => {
			await writeFile(join(tmpDir, ".fallowrc.toml"), "");
			const result = (await fireBeforeAgentStart(tmpDir)) as {
				systemPrompt: string;
			};
			expect(result.systemPrompt).toContain("**fallow**");
			expect(result.systemPrompt).toContain("`.fallowrc.toml`");
		});

		test("detects fallow from package.json devDependencies", async () => {
			await writeFile(
				join(tmpDir, "package.json"),
				JSON.stringify({ devDependencies: { fallow: "^1.0.0" } }),
			);
			const result = (await fireBeforeAgentStart(tmpDir)) as {
				systemPrompt: string;
			};
			expect(result.systemPrompt).toContain("**fallow**");
			expect(result.systemPrompt).toContain("`package.json`");
		});

		test("detects fallow from package.json dependencies", async () => {
			await writeFile(
				join(tmpDir, "package.json"),
				JSON.stringify({ dependencies: { fallow: "^1.0.0" } }),
			);
			const result = (await fireBeforeAgentStart(tmpDir)) as {
				systemPrompt: string;
			};
			expect(result.systemPrompt).toContain("**fallow**");
		});

		test("prefers config file over package.json — fallow appears exactly once", async () => {
			await writeFile(join(tmpDir, "fallow.toml"), "");
			await writeFile(
				join(tmpDir, "package.json"),
				JSON.stringify({ devDependencies: { fallow: "^1.0.0" } }),
			);
			const result = (await fireBeforeAgentStart(tmpDir)) as {
				systemPrompt: string;
			};
			expect(result.systemPrompt).toContain("`fallow.toml`");
			expect(result.systemPrompt.match(/\*\*fallow\*\*/g)).toHaveLength(1);
		});
	});

	describe("no tools detected", () => {
		test("returns undefined when no tools are configured", async () => {
			const result = await fireBeforeAgentStart(tmpDir);
			expect(result).toBeUndefined();
		});

		test("returns undefined when package.json has no fallow entry", async () => {
			await writeFile(
				join(tmpDir, "package.json"),
				JSON.stringify({ devDependencies: { typescript: "^5.0.0" } }),
			);
			const result = await fireBeforeAgentStart(tmpDir);
			expect(result).toBeUndefined();
		});

		test("returns undefined when package.json is unparseable", async () => {
			await writeFile(join(tmpDir, "package.json"), "not json {{{");
			const result = await fireBeforeAgentStart(tmpDir);
			expect(result).toBeUndefined();
		});
	});

	describe("system prompt injection", () => {
		test("appends tools block after existing system prompt content", async () => {
			await writeFile(join(tmpDir, "fallow.toml"), "");
			const result = (await fireBeforeAgentStart(tmpDir, "my base prompt")) as {
				systemPrompt: string;
			};
			expect(result.systemPrompt).toMatch(/^my base prompt/);
			expect(result.systemPrompt).toContain("## Detected Analysis Tools");
		});

		test("includes audit command in injected block", async () => {
			await writeFile(join(tmpDir, "fallow.toml"), "");
			const result = (await fireBeforeAgentStart(tmpDir)) as {
				systemPrompt: string;
			};
			expect(result.systemPrompt).toContain("`npx fallow audit`");
		});

		test("includes tool description in injected block", async () => {
			await writeFile(join(tmpDir, "fallow.toml"), "");
			const result = (await fireBeforeAgentStart(tmpDir)) as {
				systemPrompt: string;
			};
			expect(result.systemPrompt).toContain("TypeScript/JavaScript");
		});
	});
});
