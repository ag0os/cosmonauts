import {
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
	discoverFallowProvider,
	FALLOW_VALIDATED_ENGINE_VERSION,
} from "../../domains/shared/extensions/project-tools/fallow-provider.ts";
import projectToolsExtension, {
	createProjectToolsExtension,
} from "../../domains/shared/extensions/project-tools/index.ts";
import type { ProviderProcessExecutor } from "../../domains/shared/extensions/project-tools/process-runner.ts";
import {
	ANALYSIS_CAPABILITIES,
	ANALYSIS_TOOL_NAMES,
} from "../../lib/analysis/index.ts";
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

interface ToolResult {
	readonly content: readonly { readonly type: string; readonly text: string }[];
	readonly details: unknown;
}

const VALID_TOOL_PARAMS = {
	analysis_dead_code: {},
	analysis_duplication: {},
	analysis_complexity: { metric: "cyclomatic" },
	analysis_boundaries: {},
	analysis_audit: { base: "HEAD" },
	analysis_trace: { target: { kind: "file", path: "src/index.ts" } },
	analysis_fix_preview: {},
} as const;

async function createProjectFixture(name: string): Promise<{
	readonly projectRoot: string;
	readonly userStateRoot: string;
}> {
	const projectRoot = join(tmpDir, name, "project");
	const userStateRoot = join(tmpDir, name, "user-state");
	await Promise.all([
		mkdir(projectRoot, { recursive: true }),
		mkdir(userStateRoot, { recursive: true }),
	]);
	return { projectRoot, userStateRoot };
}

async function grantConsent(
	projectRoot: string,
	userStateRoot: string,
): Promise<void> {
	await writeFile(
		join(userStateRoot, "analysis-execution-consent.json"),
		JSON.stringify({
			schemaVersion: 1,
			projects: {
				[projectRoot]: { providers: ["fallow"] },
			},
		}),
	);
}

function capabilityStatusBlock(systemPrompt: string): string {
	const heading = "## Analysis Capability Status";
	const start = systemPrompt.indexOf(heading);
	if (start < 0) throw new Error("Missing analysis capability status block.");
	const remaining = systemPrompt.slice(start);
	const nextHeading = remaining.indexOf("\n## ", heading.length);
	return nextHeading < 0 ? remaining : remaining.slice(0, nextHeading);
}

function resultDetails(result: unknown): Record<string, unknown> {
	return (result as ToolResult).details as Record<string, unknown>;
}

async function waitFor(
	predicate: () => boolean | Promise<boolean>,
	timeoutMs = 2_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!(await predicate())) {
		if (Date.now() >= deadline) {
			throw new Error(`Condition was not met within ${timeoutMs}ms.`);
		}
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

function processExists(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ESRCH") {
			return false;
		}
		throw error;
	}
}

describe("project-tools extension", () => {
	describe("registration", () => {
		test("registers before_agent_start handler", () => {
			const pi = createMockPi();
			projectToolsExtension(pi as never);
			expect(pi.events.has("before_agent_start")).toBe(true);
		});

		test("registers all eight analysis tools immediately with narrow object-root schemas", () => {
			const pi = createMockPi();
			projectToolsExtension(pi as never);

			expect([...pi.tools.keys()]).toEqual([...ANALYSIS_TOOL_NAMES]);
			for (const name of ANALYSIS_TOOL_NAMES) {
				const parameters = (
					pi.tools.get(name) as unknown as {
						readonly parameters: {
							readonly type: string;
							readonly additionalProperties?: boolean;
						};
					}
				).parameters;
				expect(parameters.type, name).toBe("object");
				expect(parameters.additionalProperties, name).toBe(false);
			}
		});
	});

	// @cosmo-behavior plan:analysis-capability-runtime#B-035
	test("injects the seven-row capability status into the system prompt", async () => {
		const bound = await createProjectFixture("status-bound");
		const unbound = await createProjectFixture("status-unbound");
		const failed = await createProjectFixture("status-failed");
		const withheld = await createProjectFixture("status-withheld");
		for (const fixture of [bound, failed, withheld]) {
			await writeFile(join(fixture.projectRoot, "fallow.toml"), "");
		}
		await Promise.all([
			grantConsent(bound.projectRoot, bound.userStateRoot),
			grantConsent(failed.projectRoot, failed.userStateRoot),
		]);
		const executable = join(tmpDir, "status-fallow");
		await writeFile(executable, "#!/bin/sh\nexit 0\n");
		await chmod(executable, 0o755);
		const successfulIntrospection: ProviderProcessExecutor = async (
			invocation,
		) =>
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
						stdout: "defaults in effect\n",
						stderr: "",
					};
		const failedIntrospection: ProviderProcessExecutor = async () => ({
			kind: "signal-exit",
			signal: "SIGKILL",
			stdout: "",
			stderr: "fixture discovery failed",
		});
		const fixtures = [
			{
				...bound,
				expectedState: "bound",
				executeProcess: successfulIntrospection,
			},
			{
				...unbound,
				expectedState: "unbound",
				executeProcess: successfulIntrospection,
			},
			{
				...failed,
				expectedState: "failed",
				executeProcess: failedIntrospection,
			},
			{
				...withheld,
				expectedState: "unbound",
				executeProcess: successfulIntrospection,
			},
		] as const;

		for (const fixture of fixtures) {
			const pi = createMockPi({ cwd: fixture.projectRoot });
			createProjectToolsExtension({
				userStateRoot: fixture.userStateRoot,
				injectedExecutablePath: executable,
				executeProcess: fixture.executeProcess,
			})(pi as never);
			const injected = (await pi.fireEvent(
				"before_agent_start",
				{ systemPrompt: "base system prompt" },
				{ cwd: fixture.projectRoot },
			)) as { systemPrompt: string };
			const block = capabilityStatusBlock(injected.systemPrompt);
			const rows = block
				.split("\n")
				.filter((line) => /^\| `[^`]+` \|/u.test(line));

			expect(rows, fixture.projectRoot).toHaveLength(7);
			for (const capability of ANALYSIS_CAPABILITIES) {
				expect(block).toContain(`| \`${capability}\` |`);
			}
			expect(
				rows.some((row) => row.includes(`\`${fixture.expectedState}\``)),
			).toBe(true);
			expect(block).not.toMatch(/command|executable|npx/iu);
		}
	});

	// @cosmo-behavior plan:analysis-capability-runtime#B-034
	test("withholds all provider execution until consent is recorded", async () => {
		const fixture = await createProjectFixture("consent");
		await writeFile(join(fixture.projectRoot, "fallow.toml"), "");
		const sentinel = join(tmpDir, "provider-spawned");
		const executable = join(tmpDir, "consent-fallow");
		await writeFile(
			executable,
			[
				"#!/bin/sh",
				`echo invoked >> ${JSON.stringify(sentinel)}`,
				'if [ "$1" = "--version" ]; then',
				`  echo "fallow ${FALLOW_VALIDATED_ENGINE_VERSION}"`,
				"  exit 0",
				"fi",
				'if [ "$1" = "config" ]; then',
				'  echo "defaults in effect"',
				"  exit 3",
				"fi",
				"exit 2",
				"",
			].join("\n"),
		);
		await chmod(executable, 0o755);

		const withheldPi = createMockPi({ cwd: fixture.projectRoot });
		createProjectToolsExtension({
			userStateRoot: fixture.userStateRoot,
			injectedExecutablePath: executable,
		})(withheldPi as never);
		const injected = (await withheldPi.fireEvent(
			"before_agent_start",
			{ systemPrompt: "base" },
			{ cwd: fixture.projectRoot },
		)) as { systemPrompt: string };
		expect(capabilityStatusBlock(injected.systemPrompt)).toContain(
			"`execution-not-consented`",
		);
		const status = resultDetails(
			await withheldPi.callTool("analysis_status", {}),
		);
		expect(status).toMatchObject({ kind: "status" });
		for (const [name, params] of Object.entries(VALID_TOOL_PARAMS)) {
			expect(
				resultDetails(await withheldPi.callTool(name, params)),
				name,
			).toMatchObject({
				kind: "unbound",
				reason: "execution-not-consented",
				providerId: "fallow",
			});
		}
		await expect(readFile(sentinel, "utf8")).rejects.toMatchObject({
			code: "ENOENT",
		});

		await grantConsent(fixture.projectRoot, fixture.userStateRoot);
		const consentedPi = createMockPi({ cwd: fixture.projectRoot });
		createProjectToolsExtension({
			userStateRoot: fixture.userStateRoot,
			injectedExecutablePath: executable,
		})(consentedPi as never);
		const consentedStatus = resultDetails(
			await consentedPi.callTool("analysis_status", {}),
		);
		expect(consentedStatus).toMatchObject({ kind: "status" });
		expect(consentedStatus.capabilities).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					state: "bound",
					capability: "dead-code",
					provider: expect.objectContaining({ id: "fallow" }),
				}),
			]),
		);
		expect(await readFile(sentinel, "utf8")).toContain("invoked");
	});

	// @cosmo-behavior plan:analysis-capability-runtime#B-005
	test("lists every capability unbound in a Python project and every tool degrades", async () => {
		const fixture = await createProjectFixture("python");
		await writeFile(join(fixture.projectRoot, "pyproject.toml"), "[project]\n");
		const pi = createMockPi({ cwd: fixture.projectRoot });
		createProjectToolsExtension({ userStateRoot: fixture.userStateRoot })(
			pi as never,
		);
		const injected = (await pi.fireEvent(
			"before_agent_start",
			{ systemPrompt: "base" },
			{ cwd: fixture.projectRoot },
		)) as { systemPrompt: string };
		const block = capabilityStatusBlock(injected.systemPrompt);
		expect(
			block
				.split("\n")
				.filter((line) => /^\| `[^`]+` \| `unbound` \|/u.test(line)),
		).toHaveLength(7);
		expect(block).toContain("`no-provider`");

		const status = resultDetails(await pi.callTool("analysis_status", {}));
		expect(status.capabilities).toHaveLength(7);
		for (const [name, params] of Object.entries(VALID_TOOL_PARAMS)) {
			expect(
				resultDetails(await pi.callTool(name, params)),
				name,
			).toMatchObject({
				kind: "unbound",
				reason: "no-provider",
			});
		}
	});

	// @cosmo-behavior plan:analysis-capability-runtime#B-027
	test("rejects empty scoped inputs before provider invocation", async () => {
		const fixture = await createProjectFixture("invalid-input");
		await writeFile(join(fixture.projectRoot, "fallow.toml"), "");
		await grantConsent(fixture.projectRoot, fixture.userStateRoot);
		const executable = join(tmpDir, "invalid-input-fallow");
		await writeFile(executable, "#!/bin/sh\nexit 0\n");
		await chmod(executable, 0o755);
		let invocationCount = 0;
		const executeProcess: ProviderProcessExecutor = async () => {
			invocationCount += 1;
			return {
				kind: "code-exit",
				code: 0,
				stdout: "{}",
				stderr: "",
			};
		};
		const pi = createMockPi({ cwd: fixture.projectRoot });
		createProjectToolsExtension({
			userStateRoot: fixture.userStateRoot,
			injectedExecutablePath: executable,
			executeProcess,
		})(pi as never);
		const invalidCalls = [
			["analysis_dead_code", { paths: [] }],
			["analysis_dead_code", { paths: [""] }],
			["analysis_boundaries", { paths: [" \t "] }],
			["analysis_audit", { base: "   " }],
			["analysis_trace", { target: { kind: "file", path: "" } }],
			["analysis_trace", { target: { kind: "dependency", dependency: "  " } }],
		] as const;

		for (const [name, params] of invalidCalls) {
			await expect(pi.callTool(name, params), name).rejects.toThrow(
				/nonempty|at least one/iu,
			);
		}
		expect(invocationCount).toBe(0);
	});

	// @cosmo-behavior plan:analysis-capability-runtime#B-036
	test("aborting a capability tool terminates the provider child", async () => {
		const fixture = await createProjectFixture("cancellation");
		await writeFile(join(fixture.projectRoot, "fallow.toml"), "");
		await grantConsent(fixture.projectRoot, fixture.userStateRoot);
		const pidPath = join(tmpDir, "capability-child.pid");
		const executable = join(tmpDir, "cancellation-fallow");
		await writeFile(
			executable,
			[
				"#!/usr/bin/env node",
				'import { writeFileSync } from "node:fs";',
				"const [operation] = process.argv.slice(2);",
				'if (operation === "--version") {',
				`  console.log("fallow ${FALLOW_VALIDATED_ENGINE_VERSION}");`,
				"  process.exit(0);",
				"}",
				'if (operation === "config") {',
				'  console.log("defaults in effect");',
				"  process.exit(3);",
				"}",
				`writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));`,
				'process.on("SIGTERM", () => {});',
				"setInterval(() => {}, 1_000);",
				"",
			].join("\n"),
		);
		await chmod(executable, 0o755);
		const pi = createMockPi({ cwd: fixture.projectRoot });
		createProjectToolsExtension({
			userStateRoot: fixture.userStateRoot,
			injectedExecutablePath: executable,
		})(pi as never);
		const controller = new AbortController();
		const execution = pi.callTool("analysis_dead_code", {}, controller.signal);
		// Reaching the capability child costs three sequential Node spawns
		// (--version, config, then dead-code), so this precondition wait is
		// generous: it only establishes that the child is up before the abort
		// experiment starts. The bounded-termination assertions below stay tight
		// against the 250ms grace period — they are the behavioral evidence.
		await waitFor(async () => {
			try {
				await readFile(pidPath, "utf8");
				return true;
			} catch {
				return false;
			}
		}, 30_000);
		const pid = Number(await readFile(pidPath, "utf8"));
		expect(processExists(pid)).toBe(true);
		const abortStartedAt = Date.now();
		controller.abort(new Error("cancelled by Pi fixture"));

		await expect(execution).rejects.toThrow(
			/Capability: dead-code[\s\S]*Failure class: aborted[\s\S]*cancelled by Pi fixture/u,
		);
		expect(Date.now() - abortStartedAt).toBeLessThan(2_000);
		await waitFor(() => !processExists(pid));
		expect(processExists(pid)).toBe(false);
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
		test("injects capability status when no legacy tools are configured", async () => {
			const result = (await fireBeforeAgentStart(tmpDir)) as {
				systemPrompt: string;
			};
			expect(result.systemPrompt).toContain("## Analysis Capability Status");
			expect(result.systemPrompt).not.toContain("## Detected Analysis Tools");
		});

		test("omits only the legacy block when package.json has no fallow entry", async () => {
			await writeFile(
				join(tmpDir, "package.json"),
				JSON.stringify({ devDependencies: { typescript: "^5.0.0" } }),
			);
			const result = (await fireBeforeAgentStart(tmpDir)) as {
				systemPrompt: string;
			};
			expect(result.systemPrompt).toContain("## Analysis Capability Status");
			expect(result.systemPrompt).not.toContain("## Detected Analysis Tools");
		});

		test("still injects unbound status when package.json is unparseable", async () => {
			await writeFile(join(tmpDir, "package.json"), "not json {{{");
			const result = (await fireBeforeAgentStart(tmpDir)) as {
				systemPrompt: string;
			};
			expect(result.systemPrompt).toContain("## Analysis Capability Status");
			expect(result.systemPrompt).not.toContain("## Detected Analysis Tools");
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
