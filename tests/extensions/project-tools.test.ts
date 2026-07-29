import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
	discoverFallowProvider,
	FALLOW_VALIDATED_ENGINE_VERSION,
} from "../../domains/shared/extensions/project-tools/fallow-provider.ts";
import projectToolsExtension from "../../domains/shared/extensions/project-tools/index.ts";
import type { ProviderProcessExecutor } from "../../domains/shared/extensions/project-tools/process-runner.ts";
import { ANALYSIS_CAPABILITIES } from "../../lib/analysis/index.ts";
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
		// @cosmo-behavior plan:analysis-capability-runtime#B-004
		test("detects every canonical provider config and reports version scopes and metrics without commands", async () => {
			const userStateRoot = join(tmpDir, "..", "user-state");
			const executable = join(tmpDir, "..", "fixture-fallow");
			await writeFile(executable, "#!/bin/sh\nexit 0\n", "utf8");
			await chmod(executable, 0o755);
			await mkdir(userStateRoot, { recursive: true });
			await writeFile(
				join(userStateRoot, "analysis-execution-consent.json"),
				JSON.stringify({
					schemaVersion: 1,
					projects: {
						[tmpDir]: { providers: ["fallow"] },
					},
				}),
			);
			const executeProcess: ProviderProcessExecutor = async (invocation) =>
				invocation.args.includes("--version")
					? {
							kind: "code-exit",
							code: 0,
							stdout: `fallow ${FALLOW_VALIDATED_ENGINE_VERSION}\n`,
							stderr: "",
						}
					: {
							kind: "code-exit",
							code: 3,
							stdout: "no config file found, using defaults\n",
							stderr: "",
						};

			const signals = [
				[".fallowrc.json", "{}"],
				["fallow.toml", ""],
				[".fallow.toml", ""],
				[
					"package.json",
					JSON.stringify({ devDependencies: { fallow: "2.54.2" } }),
				],
			] as const;
			for (const [path, contents] of signals) {
				for (const [otherPath] of signals) {
					await rm(join(tmpDir, otherPath), { force: true });
				}
				await writeFile(join(tmpDir, path), contents, "utf8");
				const discovery = await discoverFallowProvider({
					projectRoot: tmpDir,
					userStateRoot,
					injectedExecutablePath: executable,
					executeProcess,
				});

				expect(discovery.status).toBe("detected");
				expect(discovery.bindings.map(({ capability }) => capability)).toEqual([
					...ANALYSIS_CAPABILITIES,
				]);
				expect(
					discovery.bindings.find(
						({ capability }) => capability === "complexity",
					),
				).toMatchObject({
					state: "bound",
					provider: {
						id: "fallow",
						name: "Fallow",
						version: FALLOW_VALIDATED_ENGINE_VERSION,
					},
					scopes: ["project"],
					metrics: ["cyclomatic", "cognitive", "crap"],
				});
				expect(JSON.stringify(discovery.bindings)).not.toMatch(
					/command|executable|npx/iu,
				);
			}

			await rm(join(tmpDir, "package.json"), { force: true });
			await writeFile(join(tmpDir, ".fallowrc.toml"), "", "utf8");
			const stale = await discoverFallowProvider({
				projectRoot: tmpDir,
				userStateRoot,
				injectedExecutablePath: executable,
				executeProcess,
			});
			expect(stale.status).toBe("absent");
		});

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

		test("detects fallow from .fallow.toml", async () => {
			await writeFile(join(tmpDir, ".fallow.toml"), "");
			const result = (await fireBeforeAgentStart(tmpDir)) as {
				systemPrompt: string;
			};
			expect(result.systemPrompt).toContain("**fallow**");
			expect(result.systemPrompt).toContain("`.fallow.toml`");
		});

		test("detects fallow from package.json devDependencies", async () => {
			const result = await detectFallowPackage({
				devDependencies: { fallow: "^1.0.0" },
			});
			expect(result.systemPrompt).toContain("**fallow**");
			expect(result.systemPrompt).toContain("`package.json`");
		});

		test("detects fallow from package.json dependencies", async () => {
			const result = await detectFallowPackage({
				dependencies: { fallow: "^1.0.0" },
			});
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

async function detectFallowPackage(packageJson: object): Promise<{
	systemPrompt: string;
}> {
	await writeFile(join(tmpDir, "package.json"), JSON.stringify(packageJson));
	return (await fireBeforeAgentStart(tmpDir)) as { systemPrompt: string };
}
