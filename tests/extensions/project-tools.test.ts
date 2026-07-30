import {
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
	FALLOW_VALIDATED_ENGINE_VERSION,
	fallowPlatformPackageName,
} from "../../domains/shared/extensions/project-tools/fallow-provider.ts";
import projectToolsExtension, {
	createProjectToolsExtension,
} from "../../domains/shared/extensions/project-tools/index.ts";
import {
	type ProviderProcessExecutor,
	runProviderProcess,
} from "../../domains/shared/extensions/project-tools/process-runner.ts";
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
	const canonicalProjectRoot = await realpath(projectRoot);
	await writeFile(
		join(userStateRoot, "analysis-execution-consent.json"),
		JSON.stringify({
			schemaVersion: 1,
			projects: {
				[canonicalProjectRoot]: { providers: ["fallow"] },
			},
		}),
	);
}

async function createInstalledFallowExecutable(
	projectRoot: string,
): Promise<string> {
	const platformPackage = fallowPlatformPackageName({
		platform: process.platform,
		architecture: process.arch,
	});
	if (platformPackage === null) {
		throw new Error(
			`Unsupported installed Fallow fixture: ${process.platform}-${process.arch}`,
		);
	}
	const packageRoot = join(
		projectRoot,
		"node_modules",
		...platformPackage.split("/"),
	);
	const executable = join(
		packageRoot,
		process.platform === "win32" ? "fallow.exe" : "fallow",
	);
	await Promise.all([
		mkdir(join(projectRoot, "node_modules", "fallow"), { recursive: true }),
		mkdir(packageRoot, { recursive: true }),
	]);
	await Promise.all([
		writeFile(
			join(projectRoot, "node_modules", "fallow", "package.json"),
			JSON.stringify({
				name: "fallow",
				version: FALLOW_VALIDATED_ENGINE_VERSION,
				optionalDependencies: {
					[platformPackage]: FALLOW_VALIDATED_ENGINE_VERSION,
				},
			}),
		),
		writeFile(
			join(packageRoot, "package.json"),
			JSON.stringify({
				name: platformPackage,
				version: FALLOW_VALIDATED_ENGINE_VERSION,
			}),
		),
	]);
	return executable;
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

		test("keeps optional trace identity fields optional in the TypeBox schema", () => {
			const pi = createMockPi();
			projectToolsExtension(pi as never);
			const parameters = (
				pi.tools.get("analysis_trace") as unknown as {
					readonly parameters: {
						readonly properties: {
							readonly target: {
								readonly anyOf: readonly {
									readonly properties: Readonly<
										Record<
											string,
											{
												readonly const?: string;
												readonly required?: readonly string[];
											}
										>
									>;
									readonly required: readonly string[];
								}[];
							};
						};
					};
				}
			).parameters;
			const variants = parameters.properties.target.anyOf;
			const symbol = variants.find(
				(schema) => schema.properties.kind?.const === "symbol",
			);
			const duplicate = variants.find(
				(schema) => schema.properties.kind?.const === "duplicate-location",
			);

			expect(symbol?.required).toEqual(["kind", "symbol"]);
			expect(duplicate?.required).toEqual(["kind", "location"]);
			expect(duplicate?.properties.location?.required).toEqual(["path"]);
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
						code: 0,
						stdout: `loaded config: fixture\n${JSON.stringify({
							boundaries: {
								zones: [{ name: "ui", patterns: ["src/ui/**"] }],
								rules: [{ from: "ui", allow: [] }],
							},
						})}\n`,
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
				expectedReason: `provider \`fallow@${FALLOW_VALIDATED_ENGINE_VERSION}\``,
				expectedProvenance: "injected",
				executeProcess: successfulIntrospection,
			},
			{
				...unbound,
				expectedState: "unbound",
				expectedReason: "`no-provider`",
				expectedProvenance: undefined,
				executeProcess: successfulIntrospection,
			},
			{
				...failed,
				expectedState: "failed",
				expectedReason: "`provider-signal`",
				expectedProvenance: "injected",
				executeProcess: failedIntrospection,
			},
			{
				...withheld,
				expectedState: "unbound",
				expectedReason: "`execution-not-consented`",
				expectedProvenance: "injected",
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
				const row = rows.find((candidate) =>
					candidate.startsWith(`| \`${capability}\` |`),
				);
				expect(row, `${fixture.projectRoot}:${capability}`).toContain(
					`| \`${fixture.expectedState}\` |`,
				);
				expect(row, `${fixture.projectRoot}:${capability}`).toContain(
					fixture.expectedReason,
				);
			}
			if (fixture.expectedProvenance === undefined) {
				expect(block).not.toContain("Resolution provenance:");
			} else {
				expect(block).toContain(
					`Resolution provenance: \`${fixture.expectedProvenance}\`.`,
				);
			}
			expect(block).not.toMatch(/command|executable|npx/iu);
		}
	});

	// @cosmo-behavior plan:analysis-capability-runtime#B-034
	test("withholds all provider execution until consent is recorded", async () => {
		const fixture = await createProjectFixture("consent");
		await writeFile(join(fixture.projectRoot, "fallow.toml"), "");
		const executable = join(tmpDir, "consent-fallow");
		await writeFile(
			executable,
			[
				"#!/bin/sh",
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
		let invocationCount = 0;
		const executeProcess: ProviderProcessExecutor = (
			invocation,
			signal,
			options,
		) => {
			invocationCount += 1;
			return runProviderProcess(invocation, signal, options);
		};

		const withheldPi = createMockPi({ cwd: fixture.projectRoot });
		createProjectToolsExtension({
			userStateRoot: fixture.userStateRoot,
			injectedExecutablePath: executable,
			executeProcess,
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
		expect(invocationCount).toBe(0);

		await grantConsent(fixture.projectRoot, fixture.userStateRoot);
		const consentedPi = createMockPi({ cwd: fixture.projectRoot });
		createProjectToolsExtension({
			userStateRoot: fixture.userStateRoot,
			injectedExecutablePath: executable,
			executeProcess,
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
		expect(invocationCount).toBe(2);
	});

	test("revoking consent after status prevents cached capability execution", async () => {
		const fixture = await createProjectFixture("live-consent-revocation");
		await writeFile(join(fixture.projectRoot, "fallow.toml"), "");
		await grantConsent(fixture.projectRoot, fixture.userStateRoot);
		const executable = join(tmpDir, "live-consent-fallow");
		await writeFile(executable, "#!/bin/sh\nexit 0\n");
		await chmod(executable, 0o755);
		const invocations: Parameters<ProviderProcessExecutor>[0][] = [];
		const executeProcess: ProviderProcessExecutor = async (invocation) => {
			invocations.push(invocation);
			if (invocation.args.includes("--version")) {
				return {
					kind: "code-exit",
					code: 0,
					stdout: `fallow ${FALLOW_VALIDATED_ENGINE_VERSION}\n`,
					stderr: "",
				};
			}
			if (invocation.args[0] === "config") {
				return {
					kind: "code-exit",
					code: 3,
					stdout: "defaults in effect\n",
					stderr: "",
				};
			}
			return {
				kind: "code-exit",
				code: 0,
				stdout: JSON.stringify({ schema_version: 4, total_issues: 0 }),
				stderr: "",
			};
		};
		const pi = createMockPi({ cwd: fixture.projectRoot });
		createProjectToolsExtension({
			userStateRoot: fixture.userStateRoot,
			injectedExecutablePath: executable,
			executeProcess,
		})(pi as never);

		const initialStatus = resultDetails(
			await pi.callTool("analysis_status", {}),
		);
		expect(initialStatus.capabilities).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					state: "bound",
					capability: "dead-code",
				}),
			]),
		);
		expect(invocations).toHaveLength(2);

		await rm(join(fixture.userStateRoot, "analysis-execution-consent.json"));

		expect(
			resultDetails(await pi.callTool("analysis_dead_code", {})),
		).toMatchObject({
			kind: "unbound",
			capability: "dead-code",
			reason: "execution-not-consented",
			providerId: "fallow",
		});
		const revokedStatus = resultDetails(
			await pi.callTool("analysis_status", {}),
		);
		expect(revokedStatus.capabilities).toSatisfy(
			(capabilities: unknown) =>
				Array.isArray(capabilities) &&
				capabilities.every(
					(binding) =>
						typeof binding === "object" &&
						binding !== null &&
						(binding as { state?: string; reason?: string }).state ===
							"unbound" &&
						(binding as { state?: string; reason?: string }).reason ===
							"execution-not-consented",
				),
		);
		expect(invocations).toHaveLength(2);
	});

	test("invalidates a cached binding when the executable is replaced", async () => {
		const fixture = await createProjectFixture("executable-replacement");
		await writeFile(join(fixture.projectRoot, "fallow.toml"), "");
		await grantConsent(fixture.projectRoot, fixture.userStateRoot);
		const executable = join(tmpDir, "replaceable-fallow");
		await writeFile(executable, "#!/bin/sh\n# inspected\nexit 0\n");
		await chmod(executable, 0o755);
		const invocations: Parameters<ProviderProcessExecutor>[0][] = [];
		const executeProcess: ProviderProcessExecutor = async (invocation) => {
			invocations.push(invocation);
			if (invocation.args.includes("--version")) {
				return {
					kind: "code-exit",
					code: 0,
					stdout: `fallow ${FALLOW_VALIDATED_ENGINE_VERSION}\n`,
					stderr: "",
				};
			}
			if (invocation.args[0] === "config") {
				return {
					kind: "code-exit",
					code: 3,
					stdout: "defaults in effect\n",
					stderr: "",
				};
			}
			return {
				kind: "code-exit",
				code: 0,
				stdout: JSON.stringify({ schema_version: 4, total_issues: 0 }),
				stderr: "",
			};
		};
		const pi = createMockPi({ cwd: fixture.projectRoot });
		createProjectToolsExtension({
			userStateRoot: fixture.userStateRoot,
			injectedExecutablePath: executable,
			executeProcess,
		})(pi as never);
		await pi.callTool("analysis_status", {});
		expect(invocations).toHaveLength(2);

		await writeFile(executable, "#!/bin/sh\n# replacement\nexit 0\n");
		await chmod(executable, 0o755);

		await expect(pi.callTool("analysis_dead_code", {})).rejects.toMatchObject({
			name: "AnalysisProviderError",
			failureClass: "invalid-config",
		});
		const status = resultDetails(await pi.callTool("analysis_status", {}));
		expect(status.capabilities).toSatisfy(
			(capabilities: unknown) =>
				Array.isArray(capabilities) &&
				capabilities.every(
					(binding) =>
						typeof binding === "object" &&
						binding !== null &&
						(binding as { state?: string }).state === "failed",
				),
		);
		expect(invocations).toHaveLength(2);
	});

	test("invalidates a cached binding when the executable symlink is retargeted", async () => {
		const fixture = await createProjectFixture("executable-retarget");
		await writeFile(join(fixture.projectRoot, "fallow.toml"), "");
		await grantConsent(fixture.projectRoot, fixture.userStateRoot);
		const firstExecutable = join(tmpDir, "first-fallow");
		const replacementExecutable = join(tmpDir, "replacement-fallow");
		const executableLink = join(tmpDir, "linked-fallow");
		await Promise.all([
			writeFile(firstExecutable, "#!/bin/sh\nexit 0\n"),
			writeFile(replacementExecutable, "#!/bin/sh\nexit 0\n"),
		]);
		await Promise.all([
			chmod(firstExecutable, 0o755),
			chmod(replacementExecutable, 0o755),
		]);
		await symlink(firstExecutable, executableLink, "file");
		const invocations: Parameters<ProviderProcessExecutor>[0][] = [];
		const executeProcess: ProviderProcessExecutor = async (invocation) => {
			invocations.push(invocation);
			return invocation.args.includes("--version")
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
		};
		const pi = createMockPi({ cwd: fixture.projectRoot });
		createProjectToolsExtension({
			userStateRoot: fixture.userStateRoot,
			injectedExecutablePath: executableLink,
			executeProcess,
		})(pi as never);
		await pi.callTool("analysis_status", {});
		expect(invocations).toHaveLength(2);

		await rm(executableLink);
		await symlink(replacementExecutable, executableLink, "file");

		await expect(pi.callTool("analysis_dead_code", {})).rejects.toMatchObject({
			name: "AnalysisProviderError",
			failureClass: "invalid-config",
		});
		expect(invocations).toHaveLength(2);
	});

	test("concurrent lifecycle status and tools cannot reuse a binding after project retargeting", async () => {
		const fixtureRoot = join(tmpDir, "concurrent-project-retarget");
		const goodProject = join(fixtureRoot, "good");
		const otherProject = join(fixtureRoot, "other");
		const projectLink = join(fixtureRoot, "project");
		const userStateRoot = join(fixtureRoot, "user-state");
		await Promise.all([
			mkdir(goodProject, { recursive: true }),
			mkdir(otherProject, { recursive: true }),
			mkdir(userStateRoot, { recursive: true }),
		]);
		await Promise.all([
			writeFile(join(goodProject, "fallow.toml"), ""),
			writeFile(join(otherProject, "fallow.toml"), ""),
		]);
		await symlink(goodProject, projectLink, "dir");
		const [canonicalGoodProject, canonicalOtherProject] = await Promise.all([
			realpath(goodProject),
			realpath(otherProject),
		]);
		await writeFile(
			join(userStateRoot, "analysis-execution-consent.json"),
			JSON.stringify({
				schemaVersion: 1,
				projects: {
					[canonicalGoodProject]: { providers: ["fallow"] },
					[canonicalOtherProject]: { providers: ["fallow"] },
				},
			}),
		);
		const executable = join(fixtureRoot, "shared-fallow");
		await writeFile(executable, "#!/bin/sh\nexit 0\n");
		await chmod(executable, 0o755);
		const invocations: Parameters<ProviderProcessExecutor>[0][] = [];
		const executeProcess: ProviderProcessExecutor = async (invocation) => {
			invocations.push(invocation);
			if (invocation.args.includes("--version")) {
				return {
					kind: "code-exit",
					code: 0,
					stdout: `fallow ${FALLOW_VALIDATED_ENGINE_VERSION}\n`,
					stderr: "",
				};
			}
			if (invocation.args[0] === "config") {
				return {
					kind: "code-exit",
					code: 3,
					stdout: "defaults in effect\n",
					stderr: "",
				};
			}
			return {
				kind: "code-exit",
				code: 0,
				stdout: JSON.stringify({ schema_version: 4, total_issues: 0 }),
				stderr: "",
			};
		};
		const pi = createMockPi({ cwd: projectLink });
		createProjectToolsExtension({
			userStateRoot,
			injectedExecutablePath: executable,
			executeProcess,
		})(pi as never);
		await pi.callTool("analysis_status", {});
		expect(invocations).toHaveLength(2);

		await rm(projectLink);
		await symlink(otherProject, projectLink, "dir");

		const outcomes = await Promise.allSettled([
			pi.callTool("analysis_status", {}),
			pi.callTool("analysis_dead_code", {}),
			pi.callTool("analysis_duplication", {}),
			pi.fireEvent("session_start"),
		]);

		expect(outcomes[0]?.status).toBe("fulfilled");
		for (const outcome of outcomes.slice(1)) {
			if (outcome === outcomes.at(-1)) {
				expect(outcome.status).toBe("fulfilled");
			} else {
				expect(outcome.status).toBe("rejected");
				expect(
					outcome.status === "rejected" ? outcome.reason : undefined,
				).toMatchObject({
					name: "AnalysisProviderError",
				});
				expect(
					["invalid-config", "aborted"].includes(
						String(
							outcome.status === "rejected" &&
								typeof outcome.reason === "object" &&
								outcome.reason !== null &&
								"failureClass" in outcome.reason
								? outcome.reason.failureClass
								: "",
						),
					),
				).toBe(true);
			}
		}
		expect(invocations).toHaveLength(2);
	});

	// @cosmo-behavior plan:analysis-capability-runtime#B-005
	test("reports and returns every capability unbound for a Python fixture", async () => {
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
	test("rejects empty scopes and trace targets instead of widening", async () => {
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

	test("degrades Fallow trace targets missing provider identity before execution", async () => {
		const fixture = await createProjectFixture("unsupported-trace-targets");
		await writeFile(join(fixture.projectRoot, "fallow.toml"), "");
		await grantConsent(fixture.projectRoot, fixture.userStateRoot);
		const executable = join(tmpDir, "unsupported-trace-targets-fallow");
		await writeFile(executable, "#!/bin/sh\nexit 0\n");
		await chmod(executable, 0o755);
		let capabilityInvocations = 0;
		const executeProcess: ProviderProcessExecutor = async (invocation) => {
			if (invocation.args.includes("--version")) {
				return {
					kind: "code-exit",
					code: 0,
					stdout: `fallow ${FALLOW_VALIDATED_ENGINE_VERSION}\n`,
					stderr: "",
				};
			}
			if (invocation.args[0] === "config") {
				return {
					kind: "code-exit",
					code: 3,
					stdout: "defaults in effect\n",
					stderr: "",
				};
			}
			capabilityInvocations += 1;
			throw new Error("provider capability execution must not start");
		};
		const pi = createMockPi({ cwd: fixture.projectRoot });
		createProjectToolsExtension({
			userStateRoot: fixture.userStateRoot,
			injectedExecutablePath: executable,
			executeProcess,
		})(pi as never);
		const targets = [
			{ kind: "symbol", symbol: "render" },
			{
				kind: "duplicate-location",
				location: { path: "src/render.ts" },
			},
		] as const;

		for (const target of targets) {
			expect(
				resultDetails(await pi.callTool("analysis_trace", { target })),
			).toMatchObject({
				kind: "unsupported-target",
				capability: "trace",
				providerId: "fallow",
				reason: "missing-identity",
			});
		}
		expect(capabilityInvocations).toBe(0);
	});

	// @cosmo-behavior plan:analysis-capability-runtime#B-036
	test("aborting a capability tool terminates the provider child", async () => {
		const fixture = await createProjectFixture("cancellation");
		await writeFile(join(fixture.projectRoot, "fallow.toml"), "");
		await grantConsent(fixture.projectRoot, fixture.userStateRoot);
		const pidPath = join(tmpDir, "capability-child.pid");
		const executable = await createInstalledFallowExecutable(
			fixture.projectRoot,
		);
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

	test.each([
		"version",
		"config",
	] as const)("aborting first-use during %s discovery terminates introspection and reports failure", async (phase) => {
		const fixture = await createProjectFixture(`cold-${phase}-cancellation`);
		await writeFile(join(fixture.projectRoot, "fallow.toml"), "");
		await grantConsent(fixture.projectRoot, fixture.userStateRoot);
		const pidPath = join(tmpDir, `${phase}-discovery-child.pid`);
		const executable = join(tmpDir, `${phase}-discovery-fallow`);
		await writeFile(executable, "#!/bin/sh\nexit 0\n");
		await chmod(executable, 0o755);
		const executeProcess: ProviderProcessExecutor = (
			invocation,
			signal,
			options,
		) => {
			const operation = invocation.args.includes("--version")
				? "version"
				: "config";
			if (operation !== phase) {
				return Promise.resolve(
					operation === "version"
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
							},
				);
			}
			return runProviderProcess(
				{
					executablePath: process.execPath,
					args: [
						"-e",
						[
							'const { writeFileSync } = require("node:fs");',
							`writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));`,
							'process.on("SIGTERM", () => {});',
							"setTimeout(() => process.exit(0), 10_000);",
						].join("\n"),
					],
					cwd: invocation.cwd,
				},
				signal,
				options,
			);
		};
		const pi = createMockPi({ cwd: fixture.projectRoot });
		createProjectToolsExtension({
			userStateRoot: fixture.userStateRoot,
			injectedExecutablePath: executable,
			executeProcess,
		})(pi as never);
		const controller = new AbortController();
		const execution = pi.callTool("analysis_dead_code", {}, controller.signal);
		const executionOutcome = execution.then(
			(value) => ({ kind: "resolved", value }) as const,
			(error: unknown) => ({ kind: "rejected", error }) as const,
		);
		await waitFor(async () => {
			try {
				await readFile(pidPath, "utf8");
				return true;
			} catch {
				return false;
			}
		}, 5_000);
		const pid = Number(await readFile(pidPath, "utf8"));
		const abortStartedAt = Date.now();

		controller.abort(new Error(`cancelled during ${phase} discovery`));

		const outcome = await executionOutcome;
		expect(outcome.kind).toBe("rejected");
		expect(outcome.kind === "rejected" ? outcome.error : undefined).toEqual(
			expect.objectContaining({
				failureClass: "aborted",
			}),
		);
		expect(String(outcome.kind === "rejected" ? outcome.error : "")).toMatch(
			new RegExp(
				`Failure class: aborted[\\s\\S]*cancelled during ${phase} discovery`,
				"u",
			),
		);
		await waitFor(() => !processExists(pid), 5_000);
		expect(Date.now() - abortStartedAt).toBeLessThan(5_000);
		expect(processExists(pid)).toBe(false);
	}, 15_000);

	test.each([
		"session_start",
		"session_shutdown",
	] as const)("%s aborts obsolete discovery and a later call discovers afresh", async (lifecycleEvent) => {
		const fixture = await createProjectFixture(`${lifecycleEvent}-discovery`);
		await writeFile(join(fixture.projectRoot, "fallow.toml"), "");
		await grantConsent(fixture.projectRoot, fixture.userStateRoot);
		const pidPath = join(tmpDir, `${lifecycleEvent}-discovery-child.pid`);
		const executable = join(tmpDir, `${lifecycleEvent}-discovery-fallow`);
		await writeFile(executable, "#!/bin/sh\nexit 0\n");
		await chmod(executable, 0o755);
		let versionInvocationCount = 0;
		const executeProcess: ProviderProcessExecutor = (
			invocation,
			signal,
			options,
		) => {
			if (!invocation.args.includes("--version")) {
				return Promise.resolve({
					kind: "code-exit",
					code: 3,
					stdout: "defaults in effect\n",
					stderr: "",
				});
			}
			versionInvocationCount += 1;
			if (versionInvocationCount > 1) {
				return Promise.resolve({
					kind: "code-exit",
					code: 0,
					stdout: `fallow ${FALLOW_VALIDATED_ENGINE_VERSION}\n`,
					stderr: "",
				});
			}
			return runProviderProcess(
				{
					executablePath: process.execPath,
					args: [
						"-e",
						[
							'const { writeFileSync } = require("node:fs");',
							`writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));`,
							'process.on("SIGTERM", () => {});',
							"setTimeout(() => process.exit(0), 10_000);",
						].join("\n"),
					],
					cwd: invocation.cwd,
				},
				signal,
				options,
			);
		};
		const pi = createMockPi({ cwd: fixture.projectRoot });
		createProjectToolsExtension({
			userStateRoot: fixture.userStateRoot,
			injectedExecutablePath: executable,
			executeProcess,
		})(pi as never);
		const obsoleteStatus = pi.callTool("analysis_status", {});
		await waitFor(async () => {
			try {
				await readFile(pidPath, "utf8");
				return true;
			} catch {
				return false;
			}
		}, 5_000);
		const pid = Number(await readFile(pidPath, "utf8"));
		const resetStartedAt = Date.now();

		await pi.fireEvent(lifecycleEvent);

		const obsoleteDetails = resultDetails(await obsoleteStatus);
		expect(obsoleteDetails.capabilities).toSatisfy(
			(capabilities: unknown) =>
				Array.isArray(capabilities) &&
				capabilities.every(
					(binding) =>
						typeof binding === "object" &&
						binding !== null &&
						(binding as { state?: string }).state === "failed",
				),
		);
		await waitFor(() => !processExists(pid), 5_000);
		expect(Date.now() - resetStartedAt).toBeLessThan(5_000);

		const freshDetails = resultDetails(
			await pi.callTool("analysis_status", {}),
		);
		expect(freshDetails.capabilities).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					state: "bound",
					capability: "dead-code",
				}),
			]),
		);
		expect(versionInvocationCount).toBe(2);
	}, 15_000);

	test("session shutdown aborts active analysis and removes queued analysis work", async () => {
		const fixture = await createProjectFixture("session-analysis-queue");
		await writeFile(join(fixture.projectRoot, "fallow.toml"), "");
		await grantConsent(fixture.projectRoot, fixture.userStateRoot);
		const executable = join(tmpDir, "session-analysis-queue-fallow");
		await writeFile(executable, "#!/bin/sh\nexit 0\n");
		await chmod(executable, 0o755);
		let capabilityInvocations = 0;
		const executeProcess: ProviderProcessExecutor = async (
			invocation,
			signal,
		) => {
			if (invocation.args.includes("--version")) {
				return {
					kind: "code-exit",
					code: 0,
					stdout: `fallow ${FALLOW_VALIDATED_ENGINE_VERSION}\n`,
					stderr: "",
				};
			}
			if (invocation.args[0] === "config") {
				return {
					kind: "code-exit",
					code: 3,
					stdout: "defaults in effect\n",
					stderr: "",
				};
			}
			capabilityInvocations += 1;
			return await new Promise((resolve) => {
				const abort = (): void => {
					resolve({
						kind: "aborted",
						reason: signal?.reason,
						stdout: "",
						stderr: "",
					});
				};
				signal?.addEventListener("abort", abort, { once: true });
				if (signal?.aborted) abort();
			});
		};
		const pi = createMockPi({ cwd: fixture.projectRoot });
		createProjectToolsExtension({
			userStateRoot: fixture.userStateRoot,
			injectedExecutablePath: executable,
			executeProcess,
		})(pi as never);
		await pi.callTool("analysis_status", {});

		const active = pi.callTool("analysis_dead_code", {});
		const queued = pi.callTool("analysis_duplication", {});
		await waitFor(() => capabilityInvocations === 1);

		await pi.fireEvent("session_shutdown");
		const outcomes = await Promise.allSettled([active, queued]);

		expect(capabilityInvocations).toBe(1);
		for (const outcome of outcomes) {
			expect(outcome.status).toBe("rejected");
			expect(
				outcome.status === "rejected" ? outcome.reason : undefined,
			).toMatchObject({
				name: "AnalysisProviderError",
				failureClass: "aborted",
			});
		}
	});

	test("one cancelled caller detaches without aborting shared discovery needed by another", async () => {
		const fixture = await createProjectFixture("shared-discovery");
		await writeFile(join(fixture.projectRoot, "fallow.toml"), "");
		await grantConsent(fixture.projectRoot, fixture.userStateRoot);
		const executable = join(tmpDir, "shared-discovery-fallow");
		await writeFile(executable, "#!/bin/sh\nexit 0\n");
		await chmod(executable, 0o755);
		let releaseVersion: (() => void) | undefined;
		const versionGate = new Promise<void>((resolve) => {
			releaseVersion = resolve;
		});
		const invocations: Parameters<ProviderProcessExecutor>[0][] = [];
		const discoverySignals: (AbortSignal | undefined)[] = [];
		const executeProcess: ProviderProcessExecutor = async (
			invocation,
			signal,
		) => {
			invocations.push(invocation);
			discoverySignals.push(signal);
			if (invocation.args.includes("--version")) {
				await versionGate;
				return {
					kind: "code-exit",
					code: 0,
					stdout: `fallow ${FALLOW_VALIDATED_ENGINE_VERSION}\n`,
					stderr: "",
				};
			}
			if (invocation.args[0] === "config") {
				return {
					kind: "code-exit",
					code: 3,
					stdout: "defaults in effect\n",
					stderr: "",
				};
			}
			return {
				kind: "aborted",
				reason: signal?.reason,
				stdout: "",
				stderr: "",
			};
		};
		const pi = createMockPi({ cwd: fixture.projectRoot });
		createProjectToolsExtension({
			userStateRoot: fixture.userStateRoot,
			injectedExecutablePath: executable,
			executeProcess,
		})(pi as never);
		const controller = new AbortController();
		const cancelledCall = pi.callTool(
			"analysis_dead_code",
			{},
			controller.signal,
		);
		const activeCall = pi.callTool("analysis_status", {});
		await waitFor(() => invocations.length === 1);

		controller.abort(new Error("only one caller cancelled"));
		const cancellationState = await Promise.race([
			cancelledCall.then(
				() => "resolved",
				() => "rejected",
			),
			new Promise<"pending">((resolve) =>
				setTimeout(() => resolve("pending"), 200),
			),
		]);
		releaseVersion?.();

		const activeDetails = resultDetails(await activeCall);
		await expect(cancelledCall).rejects.toThrow(
			/Failure class: aborted[\s\S]*only one caller cancelled/u,
		);
		expect(cancellationState).toBe("rejected");
		expect(activeDetails.capabilities).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					state: "bound",
					capability: "dead-code",
				}),
			]),
		);
		expect(invocations).toHaveLength(2);
		expect(discoverySignals[0]?.aborted).toBe(false);
		expect(discoverySignals[1]).toBe(discoverySignals[0]);
	});

	describe("fallow detection", () => {
		// @cosmo-behavior plan:analysis-capability-runtime#B-004
		test("detects every canonical provider config and reports version scopes and metrics without commands", async () => {
			const userStateRoot = join(tmpDir, "..", "user-state");
			const executable = join(tmpDir, "..", "fixture-fallow");
			await writeFile(executable, "#!/bin/sh\nexit 0\n", "utf8");
			await chmod(executable, 0o755);
			await mkdir(userStateRoot, { recursive: true });
			const canonicalTmpDir = await realpath(tmpDir);
			await writeFile(
				join(userStateRoot, "analysis-execution-consent.json"),
				JSON.stringify({
					schemaVersion: 1,
					projects: {
						[canonicalTmpDir]: { providers: ["fallow"] },
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
				const pi = createMockPi({ cwd: tmpDir });
				createProjectToolsExtension({
					userStateRoot,
					injectedExecutablePath: executable,
					executeProcess,
				})(pi as never);
				const status = resultDetails(await pi.callTool("analysis_status", {}));
				const capabilities = status.capabilities as readonly Record<
					string,
					unknown
				>[];

				expect(status.kind).toBe("status");
				expect(capabilities.map(({ capability }) => capability)).toEqual([
					...ANALYSIS_CAPABILITIES,
				]);
				const supported = capabilities.filter(({ state }) => state === "bound");
				expect(supported).toHaveLength(6);
				for (const binding of supported) {
					expect(binding).toMatchObject({
						provider: {
							id: "fallow",
							name: "Fallow",
							version: FALLOW_VALIDATED_ENGINE_VERSION,
						},
						scopes: expect.any(Array),
					});
					expect(binding.scopes as readonly unknown[]).not.toHaveLength(0);
				}
				expect(
					capabilities.find(({ capability }) => capability === "complexity"),
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
				expect(
					capabilities.find(
						({ capability }) => capability === "boundary-conformance",
					),
				).toEqual({
					state: "unbound",
					capability: "boundary-conformance",
					reason: "provider-not-configured",
					providerId: "fallow",
				});
				expect(JSON.stringify(status)).not.toMatch(/command|executable|npx/iu);
			}

			await rm(join(tmpDir, "package.json"), { force: true });
			await writeFile(join(tmpDir, ".fallowrc.toml"), "", "utf8");
			const stalePi = createMockPi({ cwd: tmpDir });
			createProjectToolsExtension({
				userStateRoot,
				injectedExecutablePath: executable,
				executeProcess,
			})(stalePi as never);
			const staleStatus = resultDetails(
				await stalePi.callTool("analysis_status", {}),
			);
			expect(staleStatus.capabilities).toEqual(
				ANALYSIS_CAPABILITIES.map((capability) => ({
					state: "unbound",
					capability,
					reason: "no-provider",
				})),
			);

			await rm(join(tmpDir, ".fallowrc.toml"));
			await writeFile(
				join(tmpDir, "package.json"),
				JSON.stringify({ devDependencies: { fallow: "2.54.2" } }),
			);
			const uninstalledPi = createMockPi({ cwd: tmpDir });
			createProjectToolsExtension({ userStateRoot })(uninstalledPi as never);
			const uninstalledStatus = resultDetails(
				await uninstalledPi.callTool("analysis_status", {}),
			);
			expect(uninstalledStatus.capabilities).toEqual(
				ANALYSIS_CAPABILITIES.map((capability) => ({
					state: "unbound",
					capability,
					reason: "provider-not-installed",
					providerId: "fallow",
				})),
			);
		});
	});

	describe("capability status injection", () => {
		test("injects unbound capability status when no provider is configured", async () => {
			const result = (await fireBeforeAgentStart(tmpDir)) as {
				systemPrompt: string;
			};
			expect(result.systemPrompt).toContain("## Analysis Capability Status");
		});

		test("injects unbound capability status when package.json has no provider entry", async () => {
			await writeFile(
				join(tmpDir, "package.json"),
				JSON.stringify({ devDependencies: { typescript: "^5.0.0" } }),
			);
			const result = (await fireBeforeAgentStart(tmpDir)) as {
				systemPrompt: string;
			};
			expect(result.systemPrompt).toContain("## Analysis Capability Status");
		});

		test("still injects unbound status when package.json is unparseable", async () => {
			await writeFile(join(tmpDir, "package.json"), "not json {{{");
			const result = (await fireBeforeAgentStart(tmpDir)) as {
				systemPrompt: string;
			};
			expect(result.systemPrompt).toContain("## Analysis Capability Status");
		});

		test("appends capability status after existing system prompt content", async () => {
			const result = (await fireBeforeAgentStart(tmpDir, "my base prompt")) as {
				systemPrompt: string;
			};
			expect(result.systemPrompt).toMatch(/^my base prompt/);
			expect(result.systemPrompt).toContain("## Analysis Capability Status");
		});
	});
});
