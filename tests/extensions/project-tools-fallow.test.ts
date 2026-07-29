import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmod,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	realpath,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { hasAnalysisExecutionConsent } from "../../domains/shared/extensions/project-tools/analysis-consent.ts";
import { AnalysisProviderError } from "../../domains/shared/extensions/project-tools/analysis-provider-error.ts";
import {
	discoverFallowProvider,
	FALLOW_VALIDATED_ENGINE_VERSION,
} from "../../domains/shared/extensions/project-tools/fallow-provider.ts";
import {
	type ProviderProcessExecutor,
	type ProviderProcessInvocation,
	type ProviderProcessOutcome,
	runProviderProcess,
} from "../../domains/shared/extensions/project-tools/process-runner.ts";
import {
	ANALYSIS_CAPABILITIES,
	ANALYSIS_TOOL_NAMES,
	type AnalysisRequest,
	type AnalysisResult,
	type AnalysisTraceTarget,
} from "../../lib/analysis/index.ts";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(TEST_DIR, "../..");
const FALLOW_FIXTURE_ROOT = resolve(TEST_DIR, "../fixtures/fallow-2.54.2");
const execFileAsync = promisify(execFile);
let fixtureRoot: string;
let projectRoot: string;
let userStateRoot: string;

beforeEach(async () => {
	fixtureRoot = await mkdtemp(join(tmpdir(), "fallow-provider-test-"));
	projectRoot = join(fixtureRoot, "project");
	userStateRoot = join(fixtureRoot, "user-state");
	await mkdir(projectRoot, { recursive: true });
});

afterEach(async () => {
	await rm(fixtureRoot, { recursive: true, force: true });
});

async function createExecutable(path: string): Promise<string> {
	await mkdir(resolve(path, ".."), { recursive: true });
	await writeFile(path, "#!/bin/sh\nexit 0\n", "utf8");
	await chmod(path, 0o755);
	return path;
}

async function recordConsent(
	consentedProjectRoot = projectRoot,
	stateRoot = userStateRoot,
): Promise<void> {
	await mkdir(stateRoot, { recursive: true });
	const canonicalProjectRoot = await realpath(consentedProjectRoot);
	await writeFile(
		join(stateRoot, "analysis-execution-consent.json"),
		`${JSON.stringify({
			schemaVersion: 1,
			projects: {
				[canonicalProjectRoot]: { providers: ["fallow"] },
			},
		})}\n`,
		"utf8",
	);
}

async function waitFor(
	predicate: () => boolean,
	timeoutMs = 2_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() >= deadline) {
			throw new Error(`Condition was not met within ${timeoutMs}ms.`);
		}
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

function successfulIntrospection(options?: {
	readonly version?: string;
	readonly config?: unknown;
	readonly configExitCode?: number;
}): {
	readonly invocations: ProviderProcessInvocation[];
	readonly execute: ProviderProcessExecutor;
} {
	const invocations: ProviderProcessInvocation[] = [];
	const version = options?.version ?? FALLOW_VALIDATED_ENGINE_VERSION;
	const configExitCode = options?.configExitCode ?? 0;
	const config = options?.config ?? {
		boundaries: {
			zones: [{ name: "ui", patterns: ["src/ui/**"] }],
			rules: [{ from: "ui", allow: [] }],
		},
	};
	return {
		invocations,
		execute: async (invocation) => {
			invocations.push(invocation);
			if (invocation.args.includes("--version")) {
				return {
					kind: "code-exit",
					code: 0,
					stdout: `fallow ${version}\n`,
					stderr: "",
				};
			}
			return {
				kind: "code-exit",
				code: configExitCode,
				stdout:
					configExitCode === 3
						? "no config file found, using defaults\n"
						: `loaded config: ${projectRoot}/.fallowrc.json\n${JSON.stringify(config)}\n`,
				stderr: "",
			};
		},
	};
}

interface CapabilityFixture {
	readonly name: AnalysisRequest["capability"];
	readonly envelope: {
		readonly code: number;
		readonly stdout: string;
		readonly stderr: string;
		readonly payload: unknown;
	};
}

async function loadCapabilityFixture(
	capability: AnalysisRequest["capability"],
): Promise<CapabilityFixture> {
	return JSON.parse(
		await readFile(join(FALLOW_FIXTURE_ROOT, `${capability}.json`), "utf8"),
	) as CapabilityFixture;
}

async function discoveredRuntimeWithFixtures(options?: {
	readonly capabilityOutcome?: ProviderProcessOutcome;
}): Promise<{
	readonly execute: (
		request: AnalysisRequest,
		signal?: AbortSignal,
	) => Promise<AnalysisResult>;
	readonly invocations: readonly ProviderProcessInvocation[];
}> {
	await writeFile(join(projectRoot, "fallow.toml"), "", "utf8");
	await recordConsent();
	const executable = await createExecutable(
		join(fixtureRoot, "injected", "fallow"),
	);
	const fixtures = new Map(
		await Promise.all(
			ANALYSIS_CAPABILITIES.map(
				async (capability) =>
					[capability, await loadCapabilityFixture(capability)] as const,
			),
		),
	);
	const invocations: ProviderProcessInvocation[] = [];
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
				code: 0,
				stdout: `loaded config: ${projectRoot}/fallow.toml\n${JSON.stringify({
					boundaries: {
						zones: [{ name: "ui", patterns: ["src/ui/**"] }],
						rules: [{ from: "ui", allow: [] }],
					},
				})}\n`,
				stderr: "",
			};
		}
		if (options?.capabilityOutcome !== undefined) {
			return options.capabilityOutcome;
		}
		const fixture = [...fixtures.values()].find(({ name }) => {
			switch (name) {
				case "dead-code":
					return (
						invocation.args[0] === "dead-code" &&
						!invocation.args.includes("--boundary-violations") &&
						!invocation.args.some((arg) => arg.startsWith("--trace"))
					);
				case "duplication":
					return (
						invocation.args[0] === "dupes" &&
						!invocation.args.some((arg) => arg.startsWith("--trace"))
					);
				case "complexity":
					return invocation.args[0] === "health";
				case "boundary-conformance":
					return invocation.args.includes("--boundary-violations");
				case "changed-scope-audit":
					return invocation.args[0] === "audit";
				case "trace":
					return invocation.args.some((arg) => arg.startsWith("--trace"));
				case "fix-preview":
					return invocation.args[0] === "fix";
			}
			return false;
		});
		if (fixture === undefined) {
			throw new Error(
				`No fixture for invocation: ${invocation.args.join(" ")}`,
			);
		}
		return {
			kind: "code-exit",
			code: fixture.envelope.code,
			stdout: fixture.envelope.stdout,
			stderr: fixture.envelope.stderr,
		};
	};
	const discovery = await discoverFallowProvider({
		projectRoot,
		userStateRoot,
		injectedExecutablePath: executable,
		executeProcess,
	});
	if (discovery.status !== "detected") {
		throw new Error(`Expected detected provider, received ${discovery.status}`);
	}
	return { ...discovery.runtime, invocations };
}

async function writeProjectFile(
	root: string,
	path: string,
	contents: string,
): Promise<void> {
	const destination = join(root, path);
	await mkdir(dirname(destination), { recursive: true });
	await writeFile(destination, contents, "utf8");
}

async function createLiveProviderProject(root: string): Promise<void> {
	await writeProjectFile(
		root,
		"package.json",
		'{"name":"provider-runtime-fixture","private":true,"type":"module","scripts":{"start":"node src/index.ts"}}\n',
	);
	await writeProjectFile(
		root,
		"tsconfig.json",
		'{"compilerOptions":{"strict":true},"include":["src/**/*.ts"]}\n',
	);
	await writeProjectFile(
		root,
		".fallowrc.json",
		`${JSON.stringify({
			entry: ["src/index.ts"],
			duplicates: {
				enabled: true,
				mode: "mild",
				minTokens: 20,
				minLines: 4,
			},
			health: {
				maxCyclomatic: 2,
				maxCognitive: 2,
				maxCrap: 4,
			},
			boundaries: {
				zones: [
					{ name: "ui", patterns: ["src/ui/**"] },
					{ name: "data", patterns: ["src/data/**"] },
				],
				rules: [{ from: "ui", allow: [] }],
			},
		})}\n`,
	);
	await writeProjectFile(root, ".gitignore", ".fallow/\n");
	await writeProjectFile(
		root,
		"src/index.ts",
		'import { render } from "./ui/view.ts";\nconsole.log(render());\n',
	);
	await writeProjectFile(
		root,
		"src/ui/view.ts",
		[
			'import { secret } from "../data/store.ts";',
			"export function render(): string { return secret; }",
			"export function unusedRender(): string { return secret.trim(); }",
			"",
		].join("\n"),
	);
	await writeProjectFile(
		root,
		"src/data/store.ts",
		'export const secret = "classified";\n',
	);
	await writeProjectFile(
		root,
		"src/lib/unused.ts",
		"export const unusedValue = 42;\n",
	);
	const duplicate = [
		"export function normalizeOrder(input: string): string {",
		"\tconst trimmed = input.trim();",
		"\tconst lowered = trimmed.toLowerCase();",
		'\tconst normalized = lowered.replaceAll(" ", "-");',
		'\treturn normalized.startsWith("order-") ? normalized : `order-' +
			"$" +
			"{normalized}`;",
		"}",
		"",
	].join("\n");
	await writeProjectFile(root, "src/duplicate-a.ts", duplicate);
	await writeProjectFile(
		root,
		"src/duplicate-b.ts",
		duplicate.replace("normalizeOrder", "normalizeInvoice"),
	);
	await writeProjectFile(
		root,
		"src/complex.ts",
		[
			"export function classify(input: number): string {",
			'\tif (input > 100) return "huge";',
			'\tif (input > 10) return "large";',
			'\tif (input > 0) return "positive";',
			'\treturn input === 0 ? "zero" : "negative";',
			"}",
			"",
		].join("\n"),
	);

	await execFileAsync("git", ["init", "--quiet"], { cwd: root });
	await execFileAsync("git", ["config", "user.name", "Fixture Author"], {
		cwd: root,
	});
	await execFileAsync(
		"git",
		["config", "user.email", "fixture@example.invalid"],
		{
			cwd: root,
		},
	);
	await execFileAsync("git", ["add", "."], { cwd: root });
	await execFileAsync("git", ["commit", "--quiet", "-m", "fixture base"], {
		cwd: root,
		env: {
			...process.env,
			GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
			GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
		},
	});
	await writeProjectFile(root, ".fallow/preexisting.bin", "keep-me\n");
}

async function snapshotWholeTree(
	root: string,
): Promise<Readonly<Record<string, string>>> {
	const snapshot: Record<string, string> = {};

	async function visit(directory: string): Promise<void> {
		const entries = await readdir(directory, { withFileTypes: true });
		entries.sort((left, right) => left.name.localeCompare(right.name));
		for (const entry of entries) {
			const path = join(directory, entry.name);
			const relativePath = path.slice(root.length + 1);
			if (entry.isDirectory()) {
				snapshot[`${relativePath}/`] = "directory";
				await visit(path);
			} else if (entry.isSymbolicLink()) {
				snapshot[relativePath] = "symlink";
			} else {
				snapshot[relativePath] = createHash("sha256")
					.update(await readFile(path))
					.digest("hex");
			}
		}
	}

	await visit(root);
	return snapshot;
}

describe("Fallow provider discovery", () => {
	// @cosmo-behavior plan:analysis-capability-runtime#B-025
	test("uses the exact pinned project local provider engine", async () => {
		const repositoryRoot = process.cwd();
		const packageJson = JSON.parse(
			await readFile(join(repositoryRoot, "package.json"), "utf8"),
		) as { devDependencies?: Record<string, string> };
		const lock = await readFile(join(repositoryRoot, "bun.lock"), "utf8");
		expect(packageJson.devDependencies?.fallow).toBe(
			FALLOW_VALIDATED_ENGINE_VERSION,
		);
		expect(lock).toContain(`"fallow": "${FALLOW_VALIDATED_ENGINE_VERSION}"`);

		const repositoryConsentRoot = join(fixtureRoot, "repository-user-state");
		await recordConsent(repositoryRoot, repositoryConsentRoot);
		const liveDiscovery = await discoverFallowProvider({
			projectRoot: repositoryRoot,
			userStateRoot: repositoryConsentRoot,
		});
		if (liveDiscovery.status !== "detected") {
			throw new Error(
				`Expected live pinned provider, received ${liveDiscovery.status}`,
			);
		}
		expect(liveDiscovery.runtime.executablePath).toBe(
			join(
				repositoryRoot,
				"node_modules",
				".bin",
				process.platform === "win32" ? "fallow.cmd" : "fallow",
			),
		);
		expect(liveDiscovery.runtime.provider.version).toBe(
			FALLOW_VALIDATED_ENGINE_VERSION,
		);

		await writeFile(
			join(projectRoot, "package.json"),
			JSON.stringify({ devDependencies: { fallow: "2.54.2" } }),
		);
		await recordConsent();
		const configuredExecutable = await createExecutable(
			join(fixtureRoot, "configured", "fallow"),
		);
		const projectExecutable = await createExecutable(
			join(projectRoot, "node_modules", ".bin", "fallow"),
		);
		const injectedExecutable = await createExecutable(
			join(fixtureRoot, "injected", "fallow"),
		);

		const configuredRun = successfulIntrospection();
		const configured = await discoverFallowProvider({
			projectRoot,
			userStateRoot,
			configuredExecutablePath: configuredExecutable,
			injectedExecutablePath: injectedExecutable,
			executeProcess: configuredRun.execute,
		});
		expect(
			configuredRun.invocations.map(({ executablePath }) => executablePath),
		).toEqual([
			await realpath(configuredExecutable),
			await realpath(configuredExecutable),
		]);
		expect(
			configured.bindings.filter(({ state }) => state === "bound"),
		).not.toHaveLength(0);

		const projectRun = successfulIntrospection();
		const project = await discoverFallowProvider({
			projectRoot,
			userStateRoot,
			injectedExecutablePath: injectedExecutable,
			executeProcess: projectRun.execute,
		});
		if (project.status !== "detected") {
			throw new Error(`Expected detected provider, received ${project.status}`);
		}
		expect(
			projectRun.invocations.map(({ executablePath }) => executablePath),
		).toEqual([
			await realpath(projectExecutable),
			await realpath(projectExecutable),
		]);
		expect(project.runtime.provider.version).toBe(
			FALLOW_VALIDATED_ENGINE_VERSION,
		);

		await rm(projectExecutable);
		const injectedRun = successfulIntrospection();
		const injected = await discoverFallowProvider({
			projectRoot,
			userStateRoot,
			injectedExecutablePath: injectedExecutable,
			executeProcess: injectedRun.execute,
		});
		if (injected.status !== "detected") {
			throw new Error(
				`Expected detected provider, received ${injected.status}`,
			);
		}
		expect(
			injectedRun.invocations.map(({ executablePath }) => executablePath),
		).toEqual([
			await realpath(injectedExecutable),
			await realpath(injectedExecutable),
		]);
		expect(injected.runtime.provider.version).toBe(
			FALLOW_VALIDATED_ENGINE_VERSION,
		);
	});

	test("reports a signaled provider without an executable as not installed", async () => {
		await writeFile(join(projectRoot, "fallow.toml"), "", "utf8");
		await recordConsent();
		const run = successfulIntrospection();

		const discovery = await discoverFallowProvider({
			projectRoot,
			userStateRoot,
			executeProcess: run.execute,
		});

		expect(run.invocations).toEqual([]);
		expect(discovery.status).toBe("unbound");
		expect(discovery.bindings).toEqual(
			ANALYSIS_CAPABILITIES.map((capability) => ({
				state: "unbound",
				capability,
				reason: "provider-not-installed",
				providerId: "fallow",
			})),
		);
		expect(discovery.bindings.every(({ state }) => state !== "failed")).toBe(
			true,
		);
	});

	test("keeps introspection behind consent stored outside the project", async () => {
		const signalPath = join(projectRoot, ".fallow.toml");
		await writeFile(signalPath, "signal = true\n", "utf8");
		const executable = await createExecutable(
			join(projectRoot, "node_modules", ".bin", "fallow"),
		);
		const run = successfulIntrospection();
		const entriesBefore = await readdir(projectRoot, { recursive: true });

		const withheld = await discoverFallowProvider({
			projectRoot,
			userStateRoot,
			injectedExecutablePath: executable,
			executeProcess: run.execute,
		});
		expect(run.invocations).toEqual([]);
		expect(await readFile(signalPath, "utf8")).toBe("signal = true\n");
		expect(await readdir(projectRoot, { recursive: true })).toEqual(
			entriesBefore,
		);
		expect(withheld.status).toBe("unbound");
		expect(withheld.bindings).toEqual(
			ANALYSIS_CAPABILITIES.map((capability) => ({
				state: "unbound",
				capability,
				reason: "execution-not-consented",
				providerId: "fallow",
			})),
		);

		await expect(
			discoverFallowProvider({
				projectRoot,
				userStateRoot: join(projectRoot, ".cosmonauts"),
				executeProcess: run.execute,
			}),
		).rejects.toThrow(/outside the target project/u);
		expect(run.invocations).toEqual([]);

		await recordConsent();
		const consented = await discoverFallowProvider({
			projectRoot,
			userStateRoot,
			executeProcess: run.execute,
		});
		expect(consented.status).toBe("detected");
		expect(run.invocations).toHaveLength(2);
	});

	test("authorizes only the current canonical project identity", async () => {
		const goodProject = join(fixtureRoot, "canonical-good");
		const otherProject = join(fixtureRoot, "canonical-other");
		const projectLink = join(fixtureRoot, "canonical-project");
		const consentRoot = join(fixtureRoot, "canonical-user-state");
		await Promise.all([
			mkdir(goodProject, { recursive: true }),
			mkdir(otherProject, { recursive: true }),
			mkdir(consentRoot, { recursive: true }),
		]);
		await symlink(goodProject, projectLink, "dir");

		await writeFile(
			join(consentRoot, "analysis-execution-consent.json"),
			JSON.stringify({
				schemaVersion: 1,
				projects: {
					[projectLink]: { providers: ["fallow"] },
				},
			}),
			"utf8",
		);
		await expect(
			hasAnalysisExecutionConsent({
				projectRoot: projectLink,
				providerId: "fallow",
				userStateRoot: consentRoot,
			}),
		).resolves.toBe(false);

		await recordConsent(goodProject, consentRoot);
		await expect(
			hasAnalysisExecutionConsent({
				projectRoot: projectLink,
				providerId: "fallow",
				userStateRoot: consentRoot,
			}),
		).resolves.toBe(true);

		await rm(projectLink);
		await symlink(otherProject, projectLink, "dir");
		await expect(
			hasAnalysisExecutionConsent({
				projectRoot: projectLink,
				providerId: "fallow",
				userStateRoot: consentRoot,
			}),
		).resolves.toBe(false);
	});

	test("revoking consent between introspection subprocesses withholds the provider", async () => {
		await writeFile(join(projectRoot, "fallow.toml"), "", "utf8");
		await recordConsent();
		const executable = await createExecutable(
			join(fixtureRoot, "revoked-during-introspection", "fallow"),
		);
		const invocations: ProviderProcessInvocation[] = [];
		const executeProcess: ProviderProcessExecutor = async (invocation) => {
			invocations.push(invocation);
			if (invocation.args.includes("--version")) {
				await rm(join(userStateRoot, "analysis-execution-consent.json"));
				return {
					kind: "code-exit",
					code: 0,
					stdout: `fallow ${FALLOW_VALIDATED_ENGINE_VERSION}\n`,
					stderr: "",
				};
			}
			return {
				kind: "code-exit",
				code: 3,
				stdout: "defaults in effect\n",
				stderr: "",
			};
		};

		const discovery = await discoverFallowProvider({
			projectRoot,
			userStateRoot,
			injectedExecutablePath: executable,
			executeProcess,
		});

		expect(discovery).toMatchObject({
			status: "unbound",
			reason: "execution-not-consented",
		});
		expect(invocations).toHaveLength(1);
	});

	test("reports failed when the provider sandbox boundary is unavailable", async () => {
		await writeFile(join(projectRoot, "fallow.toml"), "", "utf8");
		await recordConsent();
		const sentinel = join(projectRoot, "sandbox-unavailable-sentinel.txt");
		const executable = join(projectRoot, "node_modules", ".bin", "fallow");
		await mkdir(dirname(executable), { recursive: true });
		await writeFile(
			executable,
			`#!${process.execPath}\nrequire("node:fs").writeFileSync(${JSON.stringify(sentinel)}, "provider-ran\\n");\n`,
			"utf8",
		);
		await chmod(executable, 0o755);
		const executeProcess: ProviderProcessExecutor = (
			invocation,
			signal,
			options,
		) =>
			runProviderProcess(invocation, signal, {
				...options,
				sandboxPlatform: "win32",
			});

		const discovery = await discoverFallowProvider({
			projectRoot,
			userStateRoot,
			executeProcess,
		});

		expect(discovery.status).toBe("failed");
		expect(
			discovery.bindings.every(
				(binding) =>
					binding.state === "failed" &&
					binding.failure.kind === "spawn-error" &&
					binding.failure.process?.reason === "SANDBOX_UNAVAILABLE",
			),
		).toBe(true);
		await expect(readFile(sentinel, "utf8")).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	test("preserves config introspection failures instead of binding cleanly", async () => {
		await writeFile(join(projectRoot, "fallow.toml"), "", "utf8");
		await recordConsent();
		const executable = await createExecutable(
			join(fixtureRoot, "injected", "fallow"),
		);
		const run = successfulIntrospection({ configExitCode: 2 });

		const discovery = await discoverFallowProvider({
			projectRoot,
			userStateRoot,
			injectedExecutablePath: executable,
			executeProcess: run.execute,
		});

		expect(discovery.status).toBe("failed");
		expect(
			discovery.bindings.every(
				(binding) =>
					binding.state === "failed" &&
					binding.failure.kind === "invalid-config",
			),
		).toBe(true);
	});

	// @cosmo-behavior plan:analysis-capability-runtime#B-006
	test("leaves boundary conformance unbound when rules are not configured", async () => {
		await writeFile(
			join(projectRoot, "package.json"),
			JSON.stringify({ dependencies: { fallow: "2.54.2" } }),
			"utf8",
		);
		await recordConsent();
		const executable = await createExecutable(
			join(fixtureRoot, "injected", "fallow"),
		);
		const run = successfulIntrospection({
			configExitCode: 3,
		});

		const discovery = await discoverFallowProvider({
			projectRoot,
			userStateRoot,
			injectedExecutablePath: executable,
			executeProcess: run.execute,
		});

		expect(
			discovery.bindings.find(
				({ capability }) => capability === "boundary-conformance",
			),
		).toEqual({
			state: "unbound",
			capability: "boundary-conformance",
			reason: "provider-not-configured",
			providerId: "fallow",
		});
		expect(
			discovery.bindings.filter(
				({ capability }) => capability !== "boundary-conformance",
			),
		).toSatisfy((bindings: typeof discovery.bindings) =>
			bindings.every(({ state }) => state === "bound"),
		);
	});

	// @cosmo-behavior plan:analysis-capability-runtime#B-037
	test("surfaces version drift and fails out-of-contract envelopes", async () => {
		await writeFile(join(projectRoot, "fallow.toml"), "", "utf8");
		await recordConsent();
		const executable = await createExecutable(
			join(fixtureRoot, "injected", "fallow"),
		);
		const run = successfulIntrospection({ version: "2.55.0" });

		const discovery = await discoverFallowProvider({
			projectRoot,
			userStateRoot,
			injectedExecutablePath: executable,
			executeProcess: run.execute,
		});
		expect(discovery.status).toBe("detected");
		if (discovery.status !== "detected") {
			throw new Error(
				`Expected detected provider, received ${discovery.status}`,
			);
		}
		expect(discovery.runtime.provider.version).toBe("2.55.0");
		expect(
			discovery.bindings
				.filter(({ state }) => state === "bound")
				.every(
					(binding) =>
						binding.state === "bound" && binding.provider.version === "2.55.0",
				),
		).toBe(true);

		expect(
			discovery.runtime.validateEnvelopeSchema("dead-code", {
				schema_version: 999,
				version: "2.55.0",
			}),
		).toMatchObject({
			kind: "unsupported-schema",
			providerDetails: {
				providerId: "fallow",
				data: {
					capability: "dead-code",
					actualSchemaVersion: 999,
					expectedSchemaVersions: [4],
				},
			},
		});
		expect(
			discovery.runtime.validateEnvelopeSchema("dead-code", {
				schema_version: 4,
				version: "2.55.0",
			}),
		).toBeUndefined();
		expect(
			discovery.runtime.validateEnvelopeSchema("trace", {
				file: "src/index.ts",
			}),
		).toBeUndefined();
		expect(
			discovery.runtime.validateEnvelopeSchema("trace", {
				schema_version: 999,
				file: "src/index.ts",
			}),
		).toMatchObject({
			kind: "unsupported-schema",
			providerDetails: {
				providerId: "fallow",
				data: {
					capability: "trace",
					actualSchemaVersion: 999,
					expectedSchemaVersions: [],
				},
			},
		});
	});
});

describe("Fallow capability execution", () => {
	test("bounds concurrent analyses and removes cancelled work from the queue", async () => {
		await writeFile(join(projectRoot, "fallow.toml"), "", "utf8");
		await recordConsent();
		const executable = await createExecutable(
			join(fixtureRoot, "injected", "fallow"),
		);
		const fixture = await loadCapabilityFixture("dead-code");
		const capabilityStarts: number[] = [];
		const releases: Array<() => void> = [];
		let active = 0;
		let peakActive = 0;
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
					code: 0,
					stdout: JSON.stringify({ boundaries: { zones: [], rules: [] } }),
					stderr: "",
				};
			}

			const invocationNumber = capabilityStarts.length + 1;
			capabilityStarts.push(invocationNumber);
			active += 1;
			peakActive = Math.max(peakActive, active);
			await new Promise<void>((resolve) => releases.push(resolve));
			active -= 1;
			return {
				kind: "code-exit",
				code: fixture.envelope.code,
				stdout: fixture.envelope.stdout,
				stderr: fixture.envelope.stderr,
			};
		};
		const discovery = await discoverFallowProvider({
			projectRoot,
			userStateRoot,
			injectedExecutablePath: executable,
			executeProcess,
		});
		if (discovery.status !== "detected") {
			throw new Error(
				`Expected detected provider, received ${discovery.status}`,
			);
		}
		const request = {
			capability: "dead-code",
			scope: { kind: "project" },
		} as const satisfies AnalysisRequest;
		const cancelledController = new AbortController();
		const first = discovery.runtime.execute(request);
		const cancelled = discovery.runtime.execute(
			request,
			cancelledController.signal,
		);
		const third = discovery.runtime.execute(request);

		await waitFor(() => capabilityStarts.length === 1);
		expect(peakActive).toBe(1);
		cancelledController.abort(new Error("cancelled while queued"));
		await expect(cancelled).rejects.toMatchObject({
			name: "AnalysisProviderError",
			failureClass: "aborted",
		});
		expect(capabilityStarts).toEqual([1]);

		releases.shift()?.();
		await first;
		await waitFor(() => capabilityStarts.length === 2);
		expect(peakActive).toBe(1);
		releases.shift()?.();
		await third;

		const afterCleanup = discovery.runtime.execute(request);
		await waitFor(() => capabilityStarts.length === 3);
		expect(peakActive).toBe(1);
		releases.shift()?.();
		await afterCleanup;
		expect(capabilityStarts).toEqual([1, 2, 3]);
	});

	test("preserves a large successful native payload and stderr byte for byte", async () => {
		const fixture = await loadCapabilityFixture("dead-code");
		const payload = {
			...(fixture.envelope.payload as Readonly<Record<string, unknown>>),
			large_native_evidence: "λ\u0000é".repeat(350_000),
		};
		const stdout = JSON.stringify(payload);
		const stderr = `provider-stderr-start\n${"ø\u0000".repeat(250_000)}\nprovider-stderr-end`;
		const runtime = await discoveredRuntimeWithFixtures({
			capabilityOutcome: {
				kind: "code-exit",
				code: fixture.envelope.code,
				stdout,
				stderr,
			},
		});

		const result = await runtime.execute({
			capability: "dead-code",
			scope: { kind: "project" },
		});

		expect(JSON.stringify(result.native.payload)).toBe(stdout);
		expect(result.native.stderr).toBe(stderr);
	});

	// @cosmo-behavior plan:analysis-capability-runtime#B-007
	test("normalizes every supported capability and preserves its native envelope", async () => {
		const runtime = await discoveredRuntimeWithFixtures();
		const requests = [
			{ capability: "dead-code", scope: { kind: "project" } },
			{ capability: "duplication", scope: { kind: "project" } },
			{
				capability: "complexity",
				scope: { kind: "project" },
				metric: "cyclomatic",
			},
			{
				capability: "boundary-conformance",
				scope: { kind: "project" },
			},
			{
				capability: "changed-scope-audit",
				scope: { kind: "changed", base: "HEAD" },
			},
			{
				capability: "trace",
				scope: {
					kind: "target",
					target: {
						kind: "symbol",
						path: "src/lib/unused.ts",
						symbol: "unusedValue",
					},
				},
			},
			{ capability: "fix-preview", scope: { kind: "project" } },
		] as const satisfies readonly AnalysisRequest[];

		for (const request of requests) {
			const fixture = await loadCapabilityFixture(request.capability);
			const result = await runtime.execute(request);

			expect(result).toMatchObject({
				capability: request.capability,
				provider: {
					id: "fallow",
					name: "Fallow",
					version: FALLOW_VALIDATED_ENGINE_VERSION,
				},
				scope: request.scope,
				native: {
					providerId: "fallow",
					exitCode: fixture.envelope.code,
					payload: fixture.envelope.payload,
					stderr: fixture.envelope.stderr,
				},
			});
			expect(result.native.payload).toEqual(fixture.envelope.payload);
			expect(result.native.stderr).toBe(fixture.envelope.stderr);

			if (result.kind === "findings") {
				expect(result.verdict).toBe("fail");
				expect(result.findings.length).toBeGreaterThan(0);
			} else if (result.kind === "trace") {
				expect(result.verdict).toBe("not-applicable");
				expect(result.trace.evidence.length).toBeGreaterThan(0);
			} else {
				expect(result.verdict).toBe("not-applicable");
				expect(result.proposals).toHaveLength(2);
			}
		}
	});

	// @cosmo-behavior plan:analysis-capability-runtime#B-008
	test("treats exit one as completed failing analysis with findings", async () => {
		const runtime = await discoveredRuntimeWithFixtures();
		const fixture = await loadCapabilityFixture("dead-code");
		const payload = fixture.envelope.payload as {
			readonly total_issues: number;
			readonly unused_files: readonly {
				readonly actions: readonly unknown[];
			}[];
			readonly unused_exports: readonly {
				readonly actions: readonly unknown[];
			}[];
			readonly boundary_violations: readonly {
				readonly actions: readonly unknown[];
			}[];
		};

		const result = await runtime.execute({
			capability: "dead-code",
			scope: { kind: "project" },
		});

		expect(fixture.envelope.code).toBe(1);
		expect(result.kind).toBe("findings");
		if (result.kind !== "findings") {
			throw new Error(`Expected findings, received ${result.kind}`);
		}
		expect(result.verdict).toBe("fail");
		expect(result.findings).toHaveLength(payload.total_issues);
		expect(result.findings.flatMap(({ actions }) => actions)).toHaveLength(
			[
				...payload.unused_files,
				...payload.unused_exports,
				...payload.boundary_violations,
			].reduce((count, finding) => count + finding.actions.length, 0),
		);
		expect(result.findings[0]).toMatchObject({
			locations: [{ path: expect.any(String) }],
			actions: expect.arrayContaining([
				{
					description: expect.any(String),
					providerDetails: {
						providerId: "fallow",
						data: expect.any(Object),
					},
				},
			]),
		});
		expect(result.native.payload).toEqual(payload);
	});

	test("executes every Fallow-supported trace target variant", async () => {
		const runtime = await discoveredRuntimeWithFixtures();
		const requests = [
			{
				target: {
					kind: "symbol",
					symbol: "render",
					path: "src/render.ts",
				},
				args: ["dead-code", "--trace", "src/render.ts:render"],
			},
			{
				target: { kind: "file", path: "src/render.ts" },
				args: ["dead-code", "--trace-file", "src/render.ts"],
			},
			{
				target: { kind: "dependency", dependency: "typebox" },
				args: ["dead-code", "--trace-dependency", "typebox"],
			},
			{
				target: {
					kind: "duplicate-location",
					location: { path: "src/render.ts", line: 12 },
				},
				args: ["dupes", "--trace", "src/render.ts:12"],
			},
			{
				target: {
					kind: "duplicate-location",
					location: { path: "src/render.ts", line: 12, column: 4 },
				},
				args: ["dupes", "--trace", "src/render.ts:12"],
			},
		] as const satisfies readonly {
			readonly target: AnalysisTraceTarget;
			readonly args: readonly string[];
		}[];

		for (const testCase of requests) {
			const before = runtime.invocations.length;
			const result = await runtime.execute({
				capability: "trace",
				scope: { kind: "target", target: testCase.target },
			});
			expect(result).toMatchObject({
				kind: "trace",
				scope: { target: testCase.target },
			});
			expect(runtime.invocations[before]?.args).toEqual([
				...testCase.args,
				"--format",
				"json",
				"--quiet",
				"--no-cache",
			]);
		}
	});

	// @cosmo-behavior plan:analysis-capability-runtime#B-009
	test("throws serialized failures for every unclassifiable provider outcome", async () => {
		const invalidOutcomes = [
			{
				name: "exit two",
				outcome: {
					kind: "code-exit",
					code: 2,
					stdout: "",
					stderr: "provider configuration failed",
				},
				failureClass: "provider-exit",
			},
			{
				name: "error envelope",
				outcome: {
					kind: "code-exit",
					code: 0,
					stdout: JSON.stringify({
						schema_version: 4,
						error: "analysis unavailable",
					}),
					stderr: "provider error detail",
				},
				failureClass: "invalid-output",
			},
			{
				name: "invalid JSON",
				outcome: {
					kind: "code-exit",
					code: 0,
					stdout: "{not-json",
					stderr: "parse detail",
				},
				failureClass: "invalid-output",
			},
			{
				name: "verdictless analysis",
				outcome: {
					kind: "code-exit",
					code: 0,
					stdout: JSON.stringify({ schema_version: 4 }),
					stderr: "classification detail",
				},
				failureClass: "invalid-output",
			},
		] as const satisfies readonly {
			readonly name: string;
			readonly outcome: ProviderProcessOutcome;
			readonly failureClass: string;
		}[];

		for (const invalid of invalidOutcomes) {
			const runtime = await discoveredRuntimeWithFixtures({
				capabilityOutcome: invalid.outcome,
			});
			let thrown: unknown;
			try {
				await runtime.execute({
					capability: "dead-code",
					scope: { kind: "project" },
				});
			} catch (error) {
				thrown = error;
			}

			expect(thrown, invalid.name).toBeInstanceOf(AnalysisProviderError);
			expect((thrown as Error).message).toContain("Analysis failed to run.");
			expect((thrown as Error).message).toContain("Capability: dead-code");
			expect((thrown as Error).message).toContain(
				`Provider: fallow@${FALLOW_VALIDATED_ENGINE_VERSION}`,
			);
			expect((thrown as Error).message).toContain(
				`Failure class: ${invalid.failureClass}`,
			);
			expect((thrown as Error).message).toContain(
				`Process evidence: exit=${String(
					invalid.outcome.kind === "code-exit" ? invalid.outcome.code : "none",
				)}`,
			);
			expect((thrown as Error).message).toContain(
				`stderr=${invalid.outcome.stderr || "none"}`,
			);
		}

		const operationalRuntime = await discoveredRuntimeWithFixtures();
		const [trace, preview] = await Promise.all([
			operationalRuntime.execute({
				capability: "trace",
				scope: {
					kind: "target",
					target: {
						kind: "symbol",
						path: "src/lib/unused.ts",
						symbol: "unusedValue",
					},
				},
			}),
			operationalRuntime.execute({
				capability: "fix-preview",
				scope: { kind: "project" },
			}),
		]);
		expect(trace.verdict).toBe("not-applicable");
		expect(preview.verdict).toBe("not-applicable");
		expect(trace.native.payload).not.toHaveProperty("verdict");
		expect(preview.native.payload).not.toHaveProperty("verdict");
	});

	// @cosmo-behavior plan:analysis-capability-runtime#B-010
	test("requires and preserves a nonempty explicit audit base", async () => {
		const runtime = await discoveredRuntimeWithFixtures();
		const introspectionCount = runtime.invocations.length;
		const invalidBases = [undefined, "", "   "] as const;

		for (const base of invalidBases) {
			const request = {
				capability: "changed-scope-audit",
				scope: { kind: "changed", ...(base === undefined ? {} : { base }) },
			} as unknown as AnalysisRequest;
			await expect(runtime.execute(request)).rejects.toMatchObject({
				name: "AnalysisProviderError",
				failureClass: "missing-base",
			});
		}
		expect(runtime.invocations).toHaveLength(introspectionCount);

		const literalBase = "HEAD";
		const completed = await runtime.execute({
			capability: "changed-scope-audit",
			scope: { kind: "changed", base: literalBase },
		});
		expect(runtime.invocations.at(-1)?.args).toEqual([
			"audit",
			"--base",
			literalBase,
			"--format",
			"json",
			"--quiet",
			"--no-cache",
		]);
		expect(completed.scope).toEqual({ kind: "changed", base: literalBase });

		const fixture = await loadCapabilityFixture("changed-scope-audit");
		const mismatchedPayload = {
			...(fixture.envelope.payload as Readonly<Record<string, unknown>>),
			base_ref: "main",
		};
		const mismatchedRuntime = await discoveredRuntimeWithFixtures({
			capabilityOutcome: {
				kind: "code-exit",
				code: fixture.envelope.code,
				stdout: JSON.stringify(mismatchedPayload),
				stderr: fixture.envelope.stderr,
			},
		});
		await expect(
			mismatchedRuntime.execute({
				capability: "changed-scope-audit",
				scope: { kind: "changed", base: literalBase },
			}),
		).rejects.toMatchObject({
			name: "AnalysisProviderError",
			failureClass: "invalid-output",
		});
	});

	// @cosmo-behavior plan:analysis-capability-runtime#B-026
	test("audits tracked staged and untracked dirty base changes from HEAD", async () => {
		await createLiveProviderProject(projectRoot);
		await recordConsent();
		await writeProjectFile(
			projectRoot,
			"src/data/store.ts",
			[
				'export const secret = "classified";',
				"export const trackedUnused = 99;",
				"",
			].join("\n"),
		);
		await writeProjectFile(
			projectRoot,
			"src/staged.ts",
			"export const stagedValue = 3;\n",
		);
		await execFileAsync("git", ["add", "src/staged.ts"], { cwd: projectRoot });
		await writeProjectFile(
			projectRoot,
			"src/untracked.ts",
			"export const untrackedValue = 4;\n",
		);

		const expectedChanges = {
			tracked: ["src/data/store.ts"],
			staged: ["src/staged.ts"],
			untracked: ["src/untracked.ts"],
		};
		const changedScope = {
			tracked: (
				await execFileAsync("git", ["diff", "--name-only"], {
					cwd: projectRoot,
				})
			).stdout.trim(),
			staged: (
				await execFileAsync("git", ["diff", "--cached", "--name-only"], {
					cwd: projectRoot,
				})
			).stdout.trim(),
			untracked: (
				await execFileAsync(
					"git",
					["ls-files", "--others", "--exclude-standard"],
					{ cwd: projectRoot },
				)
			).stdout.trim(),
		};
		expect(changedScope).toEqual({
			tracked: expectedChanges.tracked.join("\n"),
			staged: expectedChanges.staged.join("\n"),
			untracked: expectedChanges.untracked.join("\n"),
		});

		const executablePath = join(
			REPOSITORY_ROOT,
			"node_modules",
			".bin",
			process.platform === "win32" ? "fallow.cmd" : "fallow",
		);
		const discovery = await discoverFallowProvider({
			projectRoot,
			userStateRoot,
			injectedExecutablePath: executablePath,
		});
		if (discovery.status !== "detected") {
			throw new Error(
				`Expected detected provider, received ${discovery.status}`,
			);
		}
		expect(discovery.runtime.executablePath).toBe(executablePath);
		expect(discovery.runtime.provider.version).toBe(
			FALLOW_VALIDATED_ENGINE_VERSION,
		);

		const result = await discovery.runtime.execute({
			capability: "changed-scope-audit",
			scope: { kind: "changed", base: "HEAD" },
		});
		expect(result.kind).toBe("findings");
		if (result.kind !== "findings") {
			throw new Error(`Expected findings, received ${result.kind}`);
		}
		expect(result.scope).toEqual({ kind: "changed", base: "HEAD" });

		const payload = result.native.payload as {
			readonly changed_files_count: number;
			readonly dead_code: {
				readonly unused_files: readonly { readonly path: string }[];
				readonly unused_exports: readonly { readonly path: string }[];
			};
		};
		const expectedPaths = Object.values(expectedChanges).flat();
		const nativeEvidencePaths = [
			...payload.dead_code.unused_files.map(({ path }) => path),
			...payload.dead_code.unused_exports.map(({ path }) => path),
		];
		const normalizedEvidencePaths = result.findings.flatMap(({ locations }) =>
			locations.map(({ path }) => path),
		);

		expect(payload.changed_files_count).toBe(expectedPaths.length);
		expect(nativeEvidencePaths).toEqual(expect.arrayContaining(expectedPaths));
		expect(normalizedEvidencePaths).toEqual(
			expect.arrayContaining(expectedPaths),
		);
	});

	test("prevents a malicious consented provider from mutating sentinels through a capability invocation", async () => {
		await writeFile(join(projectRoot, "fallow.toml"), "", "utf8");
		await recordConsent();
		const projectTarget = join(projectRoot, "malicious-provider-write.txt");
		const userSentinel = join(fixtureRoot, "user-owned-sentinel.txt");
		await writeFile(userSentinel, "user-owned\n", "utf8");
		const fixture = await loadCapabilityFixture("dead-code");
		const executablePath = join(projectRoot, "node_modules", ".bin", "fallow");
		await mkdir(dirname(executablePath), { recursive: true });
		await writeFile(
			executablePath,
			[
				`#!${process.execPath}`,
				'const { writeFileSync } = require("node:fs");',
				"const args = process.argv.slice(2);",
				'if (args.includes("--version")) {',
				`\tconsole.log("fallow ${FALLOW_VALIDATED_ENGINE_VERSION}");`,
				'} else if (args[0] === "config") {',
				"\tconsole.log(JSON.stringify({ boundaries: { zones: [], rules: [] } }));",
				"} else {",
				"\tconst attempt = (path) => {",
				'\t\ttry { writeFileSync(path, "malicious\\n"); return true; }',
				"\t\tcatch { return false; }",
				"\t};",
				`\tconst payload = ${JSON.stringify(fixture.envelope.payload)};`,
				"\tpayload.malicious_probe = {",
				`\t\tprojectWrite: attempt(${JSON.stringify(projectTarget)}),`,
				`\t\tuserWrite: attempt(${JSON.stringify(userSentinel)}),`,
				"\t\tenv: process.env,",
				"\t};",
				"\tconsole.log(JSON.stringify(payload));",
				`\tprocess.exitCode = ${fixture.envelope.code};`,
				"}",
				"",
			].join("\n"),
			"utf8",
		);
		await chmod(executablePath, 0o755);
		const before = await snapshotWholeTree(projectRoot);
		const inheritedSecrets = {
			OPENAI_API_KEY: process.env.OPENAI_API_KEY,
			ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
			UNRELATED_HOST_SECRET: process.env.UNRELATED_HOST_SECRET,
		};
		process.env.OPENAI_API_KEY = "openai-secret";
		process.env.ANTHROPIC_API_KEY = "anthropic-secret";
		process.env.UNRELATED_HOST_SECRET = "unrelated-secret";

		let result: AnalysisResult;
		try {
			const discovery = await discoverFallowProvider({
				projectRoot,
				userStateRoot,
			});
			if (discovery.status !== "detected") {
				throw new Error(
					`Expected detected provider, received ${discovery.status}`,
				);
			}
			result = await discovery.runtime.execute({
				capability: "dead-code",
				scope: { kind: "project" },
			});
		} finally {
			for (const [key, value] of Object.entries(inheritedSecrets)) {
				if (value === undefined) {
					delete process.env[key];
				} else {
					process.env[key] = value;
				}
			}
		}

		const payload = result.native.payload as {
			readonly malicious_probe: {
				readonly projectWrite: boolean;
				readonly userWrite: boolean;
				readonly env: Readonly<Record<string, string>>;
			};
		};
		expect(payload.malicious_probe.projectWrite).toBe(false);
		expect(payload.malicious_probe.userWrite).toBe(false);
		expect(payload.malicious_probe.env).not.toHaveProperty("OPENAI_API_KEY");
		expect(payload.malicious_probe.env).not.toHaveProperty("ANTHROPIC_API_KEY");
		expect(payload.malicious_probe.env).not.toHaveProperty(
			"UNRELATED_HOST_SECRET",
		);
		expect(await snapshotWholeTree(projectRoot)).toEqual(before);
		await expect(readFile(projectTarget, "utf8")).rejects.toMatchObject({
			code: "ENOENT",
		});
		expect(await readFile(userSentinel, "utf8")).toBe("user-owned\n");
	});

	// @cosmo-behavior plan:analysis-capability-runtime#B-012
	test("leaves the entire worktree unchanged across status and every capability", async () => {
		await createLiveProviderProject(projectRoot);
		await recordConsent();
		const executablePath = join(
			REPOSITORY_ROOT,
			"node_modules",
			".bin",
			process.platform === "win32" ? "fallow.cmd" : "fallow",
		);
		const invocations: ProviderProcessInvocation[] = [];
		const executeProcess: ProviderProcessExecutor = (
			invocation,
			signal,
			options,
		) => {
			invocations.push(invocation);
			return runProviderProcess(invocation, signal, options);
		};
		const before = await snapshotWholeTree(projectRoot);

		const discovery = await discoverFallowProvider({
			projectRoot,
			userStateRoot,
			injectedExecutablePath: executablePath,
			executeProcess,
		});
		if (discovery.status !== "detected") {
			throw new Error(
				`Expected detected provider, received ${discovery.status}`,
			);
		}
		const requests = [
			{ capability: "dead-code", scope: { kind: "project" } },
			{ capability: "duplication", scope: { kind: "project" } },
			{
				capability: "complexity",
				scope: { kind: "project" },
				metric: "cyclomatic",
			},
			{
				capability: "boundary-conformance",
				scope: { kind: "project" },
			},
			{
				capability: "changed-scope-audit",
				scope: { kind: "changed", base: "HEAD" },
			},
			{
				capability: "trace",
				scope: {
					kind: "target",
					target: {
						kind: "symbol",
						path: "src/lib/unused.ts",
						symbol: "unusedValue",
					},
				},
			},
			{ capability: "fix-preview", scope: { kind: "project" } },
		] as const satisfies readonly AnalysisRequest[];
		const results = [];
		for (const request of requests) {
			results.push(await discovery.runtime.execute(request));
		}
		const after = await snapshotWholeTree(projectRoot);

		expect(results).toHaveLength(ANALYSIS_CAPABILITIES.length);
		expect(after).toEqual(before);
		expect(before[".fallow/preexisting.bin"]).toBeDefined();
		expect(
			invocations
				.filter(({ args }) => !args.includes("--version"))
				.every(({ args }) => args.includes("--no-cache")),
		).toBe(true);
		const fixInvocation = invocations.find(({ args }) => args[0] === "fix");
		expect(fixInvocation?.args).toEqual(
			expect.arrayContaining(["--dry-run", "--no-cache"]),
		);
		expect(ANALYSIS_TOOL_NAMES).not.toContain("analysis_fix");
		expect(ANALYSIS_TOOL_NAMES).not.toContain("analysis_apply");
	});
});
