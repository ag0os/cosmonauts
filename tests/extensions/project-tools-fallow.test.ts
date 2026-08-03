import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { renameSync, rmSync } from "node:fs";
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
import {
	hasAnalysisExecutionConsent,
	readAnalysisExecutionAuthorizationSync,
} from "../../domains/shared/extensions/project-tools/analysis-consent.ts";
import { AnalysisProviderError } from "../../domains/shared/extensions/project-tools/analysis-provider-error.ts";
import {
	assertFallowFindingsCovered,
	discoverFallowProvider,
	FALLOW_VALIDATED_ENGINE_VERSION,
	fallowPlatformPackageName,
	resolveInstalledFallowExecutable,
} from "../../domains/shared/extensions/project-tools/fallow-provider.ts";
import { createProjectToolsExtension } from "../../domains/shared/extensions/project-tools/index.ts";
import {
	type ProviderProcessExecutor,
	type ProviderProcessInvocation,
	type ProviderProcessOutcome,
	runProviderProcess,
} from "../../domains/shared/extensions/project-tools/process-runner.ts";
import {
	ANALYSIS_CAPABILITIES,
	ANALYSIS_GATE_CAPABILITIES,
	ANALYSIS_TOOL_NAMES,
	type AnalysisRequest,
	type AnalysisResult,
	type AnalysisTraceTarget,
} from "../../lib/analysis/index.ts";
import { createMockPi } from "../helpers/mocks/index.ts";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(TEST_DIR, "../..");
const FALLOW_FIXTURE_ROOT = resolve(TEST_DIR, "../fixtures/fallow-2.54.2");
const execFileAsync = promisify(execFile);
let fixtureRoot: string;
let projectRoot: string;
let userStateRoot: string;

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

const CAPABILITY_REQUESTS = [
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

function resultDetails(result: unknown): Record<string, unknown> {
	return (result as ToolResult).details as Record<string, unknown>;
}

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

async function createInstalledFallowPackage(
	root: string,
	options: {
		readonly platform?: NodeJS.Platform;
		readonly architecture?: string;
		readonly linuxLibc?: "gnu" | "musl";
	} = {},
): Promise<string> {
	const platform = options.platform ?? process.platform;
	const architecture = options.architecture ?? process.arch;
	const platformPackage = fallowPlatformPackageName({
		platform,
		architecture,
		linuxLibc: options.linuxLibc,
	});
	if (platformPackage === null) {
		throw new Error(`Unsupported Fallow fixture: ${platform}-${architecture}`);
	}
	const platformPackageRoot = join(
		root,
		"node_modules",
		...platformPackage.split("/"),
	);
	const executablePath = join(
		platformPackageRoot,
		platform === "win32" ? "fallow.exe" : "fallow",
	);
	await mkdir(join(root, "node_modules", "fallow"), { recursive: true });
	await mkdir(platformPackageRoot, { recursive: true });
	await writeFile(
		join(root, "node_modules", "fallow", "package.json"),
		JSON.stringify({
			name: "fallow",
			version: FALLOW_VALIDATED_ENGINE_VERSION,
			optionalDependencies: {
				[platformPackage]: FALLOW_VALIDATED_ENGINE_VERSION,
			},
		}),
	);
	await writeFile(
		join(platformPackageRoot, "package.json"),
		JSON.stringify({
			name: platformPackage,
			version: FALLOW_VALIDATED_ENGINE_VERSION,
		}),
	);
	await writeFile(executablePath, "#!/bin/sh\nexit 0\n", "utf8");
	if (platform !== "win32") await chmod(executablePath, 0o755);
	return executablePath;
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

function processExists(processId: number): boolean {
	try {
		process.kill(processId, 0);
		return true;
	} catch (error) {
		return !(
			error instanceof Error &&
			"code" in error &&
			error.code === "ESRCH"
		);
	}
}

async function expectProcessGone(processId: number): Promise<void> {
	await waitFor(() => !processExists(processId));
	expect(processExists(processId)).toBe(false);
}

function installedProviderProcessIds(
	stdout: string,
	label: string,
): readonly number[] {
	const match = stdout.match(new RegExp(`${label}:ready:(\\d+):(\\d+)`, "u"));
	if (match?.[1] === undefined || match[2] === undefined) {
		throw new Error(
			`Missing ${label} process IDs in installed-provider output.`,
		);
	}
	return [Number(match[1]), Number(match[2])];
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
	readonly boundariesConfigured?: boolean;
	readonly config?: unknown;
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
			if (options?.boundariesConfigured === false) {
				return {
					kind: "code-exit",
					code: 3,
					stdout: "no config file found, using defaults\n",
					stderr: "",
				};
			}
			return {
				kind: "code-exit",
				code: 0,
				stdout: `loaded config: ${projectRoot}/fallow.toml\n${JSON.stringify(
					options?.config ?? {
						boundaries: {
							zones: [{ name: "ui", patterns: ["src/ui/**"] }],
							rules: [{ from: "ui", allow: [] }],
						},
					},
				)}\n`,
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
		const repositoryExecutable = await resolveInstalledFallowExecutable({
			projectRoot: repositoryRoot,
		});
		expect(repositoryExecutable).not.toBeNull();
		expect(liveDiscovery.runtime.executablePath).toBe(repositoryExecutable);
		expect(liveDiscovery.runtime.executableResolution).toBe("package-native");
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
		const projectExecutable = await createInstalledFallowPackage(projectRoot);
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
		if (configured.status !== "detected") {
			throw new Error(
				`Expected detected provider, received ${configured.status}`,
			);
		}
		expect(configured.runtime.executableResolution).toBe("configured");

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
		expect(project.runtime.executableResolution).toBe("package-native");

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
		expect(injected.runtime.executableResolution).toBe("injected");

		const fakeGlobalRoot = join(fixtureRoot, "fake-global");
		await createExecutable(
			join(
				fakeGlobalRoot,
				process.platform === "win32" ? "fallow.exe" : "fallow",
			),
		);
		const originalPath = process.env.PATH;
		let globalProbeInvocations = 0;
		process.env.PATH = fakeGlobalRoot;
		try {
			const noLocalProvider = await discoverFallowProvider({
				projectRoot,
				userStateRoot,
				executeProcess: async () => {
					globalProbeInvocations += 1;
					throw new Error("global or mutable provider lookup must not run");
				},
			});
			expect(noLocalProvider).toMatchObject({
				status: "unbound",
				reason: "provider-not-installed",
			});
			expect(
				noLocalProvider.bindings.every(
					(binding) =>
						binding.state === "unbound" &&
						binding.reason === "provider-not-installed",
				),
			).toBe(true);
		} finally {
			if (originalPath === undefined) {
				delete process.env.PATH;
			} else {
				process.env.PATH = originalPath;
			}
		}
		expect(globalProbeInvocations).toBe(0);

		const fixtureRuntime = await discoveredRuntimeWithFixtures();
		const results = await Promise.all(
			CAPABILITY_REQUESTS.map((request) => fixtureRuntime.execute(request)),
		);
		expect(results).toHaveLength(ANALYSIS_CAPABILITIES.length);
		expect(
			results.every(
				(result) => result.provider.version === FALLOW_VALIDATED_ENGINE_VERSION,
			),
		).toBe(true);
	});

	test("surfaces resolution provenance for detected, consent-withheld, and introspection-failed states without commands", async () => {
		await writeFile(
			join(projectRoot, "package.json"),
			JSON.stringify({ devDependencies: { fallow: "2.54.2" } }),
		);
		await recordConsent();
		const configuredExecutable = await createExecutable(
			join(fixtureRoot, "configured-status", "fallow"),
		);
		const injectedExecutable = await createExecutable(
			join(fixtureRoot, "injected-status", "fallow"),
		);

		const statusFor = async (
			options: {
				readonly configuredExecutablePath?: string;
				readonly injectedExecutablePath?: string;
			},
			executeProcess: ProviderProcessExecutor,
		): Promise<ToolResult> => {
			const pi = createMockPi({ cwd: projectRoot });
			createProjectToolsExtension({
				userStateRoot,
				...options,
				executeProcess,
			})(pi as never);
			return (await pi.callTool("analysis_status", {})) as ToolResult;
		};

		const configuredStatus = await statusFor(
			{
				configuredExecutablePath: configuredExecutable,
				injectedExecutablePath: injectedExecutable,
			},
			successfulIntrospection().execute,
		);
		expect(resultDetails(configuredStatus).resolutionProvenance).toBe(
			"configured",
		);

		const installedExecutable = await createInstalledFallowPackage(projectRoot);
		const packageStatus = await statusFor(
			{ injectedExecutablePath: injectedExecutable },
			successfulIntrospection().execute,
		);
		expect(resultDetails(packageStatus).resolutionProvenance).toBe(
			"package-native",
		);

		await rm(installedExecutable);
		const injectedStatus = await statusFor(
			{ injectedExecutablePath: injectedExecutable },
			successfulIntrospection().execute,
		);
		expect(resultDetails(injectedStatus).resolutionProvenance).toBe("injected");

		await rm(join(userStateRoot, "analysis-execution-consent.json"));
		const withheldStatus = await statusFor(
			{ injectedExecutablePath: injectedExecutable },
			successfulIntrospection().execute,
		);
		expect(resultDetails(withheldStatus)).toMatchObject({
			resolutionProvenance: "injected",
			capabilities: expect.arrayContaining([
				expect.objectContaining({
					state: "unbound",
					reason: "execution-not-consented",
				}),
			]),
		});

		await recordConsent();
		const failedStatus = await statusFor(
			{ injectedExecutablePath: injectedExecutable },
			successfulIntrospection({ configExitCode: 2 }).execute,
		);
		expect(resultDetails(failedStatus)).toMatchObject({
			resolutionProvenance: "injected",
			capabilities: expect.arrayContaining([
				expect.objectContaining({
					state: "failed",
					failure: expect.objectContaining({ kind: "invalid-config" }),
				}),
			]),
		});

		for (const status of [
			configuredStatus,
			packageStatus,
			injectedStatus,
			withheldStatus,
			failedStatus,
		]) {
			expect(status.content[0]?.text).not.toMatch(
				/(?:\bnpx\b|\bnode_modules\b|--[a-z-]+)/u,
			);
		}
	});

	test("keeps the consent revocation window minimal when revoked after preconditions begin but before spawn", async () => {
		await writeFile(join(projectRoot, "fallow.toml"), "");
		await recordConsent();
		const spawnMarker = join(fixtureRoot, "revocation-window-spawned");
		const executable = join(fixtureRoot, "revocation-window", "fallow");
		await mkdir(dirname(executable), { recursive: true });
		await writeFile(
			executable,
			[
				"#!/bin/sh",
				`touch '${spawnMarker.replaceAll("'", "'\\''")}'`,
				`echo "fallow ${FALLOW_VALIDATED_ENGINE_VERSION}"`,
				"exit 0",
				"",
			].join("\n"),
			"utf8",
		);
		await chmod(executable, 0o755);
		const consentPath = join(userStateRoot, "analysis-execution-consent.json");
		let finalConsentReads = 0;
		const discovery = await discoverFallowProvider({
			projectRoot,
			userStateRoot,
			injectedExecutablePath: executable,
			readExecutionAuthorizationSync: (options) => {
				finalConsentReads += 1;
				if (finalConsentReads === 2) rmSync(consentPath);
				return readAnalysisExecutionAuthorizationSync(options);
			},
			executeProcess: runProviderProcess,
		});

		expect(discovery).toMatchObject({
			status: "unbound",
			reason: "execution-not-consented",
		});
		expect(finalConsentReads).toBe(2);
		await expect(readFile(spawnMarker)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	test("fails closed when consent is revoked during runner preparation", async () => {
		await writeFile(join(projectRoot, "fallow.toml"), "");
		await recordConsent();
		const spawnMarker = join(fixtureRoot, "provider-spawned");
		const executable = join(fixtureRoot, "prepared-revocation", "fallow");
		await mkdir(dirname(executable), { recursive: true });
		await writeFile(
			executable,
			[
				"#!/bin/sh",
				`touch '${spawnMarker.replaceAll("'", "'\\''")}'`,
				`echo "fallow ${FALLOW_VALIDATED_ENGINE_VERSION}"`,
				"exit 0",
				"",
			].join("\n"),
			"utf8",
		);
		await chmod(executable, 0o755);
		const consentPath = join(userStateRoot, "analysis-execution-consent.json");
		let runnerPreparations = 0;
		const executeProcess: ProviderProcessExecutor = (
			invocation,
			signal,
			options,
		) =>
			runProviderProcess(invocation, signal, {
				...options,
				onOutputSpoolReady: (outputSpoolRoot) => {
					options?.onOutputSpoolReady?.(outputSpoolRoot);
					runnerPreparations += 1;
					rmSync(consentPath);
				},
			});

		const discovery = await discoverFallowProvider({
			projectRoot,
			userStateRoot,
			injectedExecutablePath: executable,
			executeProcess,
		});

		expect(discovery).toMatchObject({
			status: "unbound",
			reason: "execution-not-consented",
			executableResolution: "injected",
		});
		expect(runnerPreparations).toBe(1);
		await expect(readFile(spawnMarker)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	test("fails closed when the executable is replaced during the final consent read", async () => {
		await writeFile(join(projectRoot, "fallow.toml"), "");
		await recordConsent();
		const spawnMarker = join(fixtureRoot, "replacement-spawned");
		const executable = join(fixtureRoot, "consent-read-replacement", "fallow");
		const replacement = join(
			fixtureRoot,
			"consent-read-replacement",
			"replacement-fallow",
		);
		await mkdir(dirname(executable), { recursive: true });
		await writeFile(
			executable,
			[
				"#!/bin/sh",
				`touch '${spawnMarker.replaceAll("'", "'\\''")}'`,
				`echo "fallow ${FALLOW_VALIDATED_ENGINE_VERSION}"`,
				"exit 0",
				"",
			].join("\n"),
			"utf8",
		);
		await writeFile(
			replacement,
			"#!/bin/sh\n# replacement executable\nexit 0\n",
			"utf8",
		);
		await Promise.all([chmod(executable, 0o755), chmod(replacement, 0o755)]);
		let finalConsentReads = 0;

		const discovery = await discoverFallowProvider({
			projectRoot,
			userStateRoot,
			injectedExecutablePath: executable,
			readExecutionAuthorizationSync: (options) => {
				const authorization = readAnalysisExecutionAuthorizationSync(options);
				finalConsentReads += 1;
				if (finalConsentReads === 2) {
					rmSync(executable);
					renameSync(replacement, executable);
				}
				return authorization;
			},
			executeProcess: runProviderProcess,
		});

		expect(discovery).toMatchObject({
			status: "failed",
			executableResolution: "injected",
			detection: {
				failure: {
					process: { reason: "provider-executable-identity-changed" },
				},
			},
		});
		expect(finalConsentReads).toBe(2);
		await expect(readFile(spawnMarker)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	test("resolves supported POSIX and Windows native platform packages without PATH or package-manager shims", async () => {
		const originalPath = process.env.PATH;
		process.env.PATH = join(fixtureRoot, "path-must-not-be-used");
		try {
			for (const platformCase of [
				{ platform: "darwin", architecture: "arm64" },
				{ platform: "darwin", architecture: "x64" },
				{ platform: "linux", architecture: "arm64", linuxLibc: "gnu" },
				{ platform: "linux", architecture: "x64", linuxLibc: "musl" },
				{ platform: "win32", architecture: "arm64" },
				{ platform: "win32", architecture: "x64" },
			] as const) {
				const caseRoot = join(
					fixtureRoot,
					`${platformCase.platform}-${platformCase.architecture}-${
						"linuxLibc" in platformCase ? platformCase.linuxLibc : "native"
					}`,
				);
				await mkdir(caseRoot, { recursive: true });
				const expected = await createInstalledFallowPackage(
					caseRoot,
					platformCase,
				);
				await createExecutable(
					join(
						caseRoot,
						"node_modules",
						".bin",
						platformCase.platform === "win32" ? "fallow.cmd" : "fallow",
					),
				);
				await createExecutable(join(fixtureRoot, "global", "fallow"));

				await expect(
					resolveInstalledFallowExecutable({
						projectRoot: caseRoot,
						...platformCase,
					}),
				).resolves.toBe(expected);
			}
		} finally {
			if (originalPath === undefined) {
				delete process.env.PATH;
			} else {
				process.env.PATH = originalPath;
			}
		}
	});

	test("installed native provider preserves crash evidence and cleans descendants on abort and timeout", async () => {
		await writeFile(join(projectRoot, "fallow.toml"), "", "utf8");
		await recordConsent();
		const deadCodeFixture = await loadCapabilityFixture("dead-code");
		const executablePath = await createInstalledFallowPackage(projectRoot);
		await writeFile(
			executablePath,
			[
				`#!${process.execPath}`,
				'const { spawn } = require("node:child_process");',
				"const args = process.argv.slice(2);",
				'if (args.includes("--version")) {',
				`\tconsole.log("fallow ${FALLOW_VALIDATED_ENGINE_VERSION}");`,
				'} else if (args[0] === "config") {',
				"\tconsole.log(JSON.stringify({ boundaries: { zones: [], rules: [] } }));",
				'} else if (args[0] === "dead-code") {',
				`\tprocess.stdout.write(${JSON.stringify(deadCodeFixture.envelope.stdout)}, () => process.kill(process.pid, "SIGTERM"));`,
				'} else if (args[0] === "hang") {',
				"\tconst label = args[1];",
				'\tconst descendantScript = \'const label = process.argv[1]; process.on("SIGTERM", () => process.stderr.write(label + ":descendant-ignored\\\\n")); setInterval(() => {}, 1_000);\';',
				'\tconst descendant = spawn(process.execPath, ["-e", descendantScript, label], { stdio: ["ignore", "inherit", "inherit"] });',
				'\tprocess.on("SIGTERM", () => process.stderr.write(label + ":ignored\\n"));',
				'\tprocess.stdout.write(label + ":ready:" + process.pid + ":" + descendant.pid + "\\n");',
				"\tsetInterval(() => {}, 1_000);",
				"}",
				"",
			].join("\n"),
			"utf8",
		);
		await chmod(executablePath, 0o755);

		const discovery = await discoverFallowProvider({
			projectRoot,
			userStateRoot,
		});
		if (discovery.status !== "detected") {
			throw new Error(
				`Expected detected provider, received ${discovery.status}`,
			);
		}
		await expect(
			discovery.runtime.execute({
				capability: "dead-code",
				scope: { kind: "project" },
			}),
		).rejects.toThrow(
			/Capability: dead-code[\s\S]*Failure class: provider-signal[\s\S]*signal=SIGTERM/u,
		);

		const abortController = new AbortController();
		const abortReason = new Error("installed provider abort");
		const abortedExecution = runProviderProcess(
			{
				executablePath,
				args: ["hang", "abort"],
				cwd: projectRoot,
			},
			abortController.signal,
			{ timeoutMs: 5_000, terminationGraceMs: 75 },
		);
		setTimeout(() => abortController.abort(abortReason), 250);
		const aborted = await abortedExecution;
		expect(aborted).toMatchObject({
			kind: "aborted",
			reason: abortReason,
		});
		expect(aborted.stdout).toContain("abort:ready:");
		for (const processId of installedProviderProcessIds(
			aborted.stdout,
			"abort",
		)) {
			await expectProcessGone(processId);
		}

		const timedOut = await runProviderProcess(
			{
				executablePath,
				args: ["hang", "timeout"],
				cwd: projectRoot,
			},
			undefined,
			{ timeoutMs: 250, terminationGraceMs: 75 },
		);
		expect(timedOut).toMatchObject({
			kind: "timeout",
			timeoutMs: 250,
			reason: "Timed out after 250ms",
		});
		expect(timedOut.stdout).toContain("timeout:ready:");
		for (const processId of installedProviderProcessIds(
			timedOut.stdout,
			"timeout",
		)) {
			await expectProcessGone(processId);
		}
	}, 15_000);

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
		await createInstalledFallowPackage(projectRoot);
		const run = successfulIntrospection();
		const entriesBefore = await readdir(projectRoot, { recursive: true });

		const withheld = await discoverFallowProvider({
			projectRoot,
			userStateRoot,
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
		const pi = createMockPi({ cwd: projectRoot });
		createProjectToolsExtension({
			userStateRoot,
			injectedExecutablePath: executable,
			executeProcess: run.execute,
		})(pi as never);
		const status = resultDetails(await pi.callTool("analysis_status", {}));
		const boundaryStatus = (
			status.capabilities as readonly Record<string, unknown>[]
		).find(({ capability }) => capability === "boundary-conformance");
		expect(boundaryStatus).toEqual({
			state: "unbound",
			capability: "boundary-conformance",
			reason: "provider-not-configured",
			providerId: "fallow",
		});
		expect(
			(status.capabilities as readonly Record<string, unknown>[]).filter(
				({ capability }) => capability !== "boundary-conformance",
			),
		).toSatisfy((bindings: readonly Record<string, unknown>[]) =>
			bindings.every(({ state }) => state === "bound"),
		);
		const invocationCountAfterStatus = run.invocations.length;
		expect(resultDetails(await pi.callTool("analysis_boundaries", {}))).toEqual(
			{
				kind: "unbound",
				capability: "boundary-conformance",
				reason: "provider-not-configured",
				providerId: "fallow",
			},
		);
		expect(run.invocations).toHaveLength(invocationCountAfterStatus);
	});

	test("reports a gate capability unbound when its rules are disabled", async () => {
		await writeFile(join(projectRoot, "fallow.toml"), "", "utf8");
		await recordConsent();
		const executable = await createExecutable(
			join(fixtureRoot, "injected", "fallow"),
		);
		/*
		 * Every rule feeding dead-code is off, so the provider reports nothing
		 * whatever the code contains. `dead-code` is a bound gate row in this
		 * plan's Quality Contract, so leaving it advertised as supported would let
		 * a clean covered result pass that gate on an evaluation that never
		 * happened — and a single-capability result declares its own capability by
		 * construction, so nothing downstream could catch it.
		 */
		const disabledDeadCodeRules = Object.fromEntries(
			[
				"unused-files",
				"unused-exports",
				"unused-types",
				"unused-dependencies",
				"unused-dev-dependencies",
				"unused-optional-dependencies",
				"unused-enum-members",
				"unused-class-members",
				"unresolved-imports",
				"unlisted-dependencies",
				"duplicate-exports",
				"type-only-dependencies",
				"test-only-dependencies",
				"circular-dependencies",
				"stale-suppressions",
			].map((rule) => [rule, "off"]),
		);
		const run = successfulIntrospection({
			config: { rules: disabledDeadCodeRules },
		});
		const pi = createMockPi({ cwd: projectRoot });
		createProjectToolsExtension({
			userStateRoot,
			injectedExecutablePath: executable,
			executeProcess: run.execute,
		})(pi as never);

		const status = resultDetails(await pi.callTool("analysis_status", {}));
		expect(
			(status.capabilities as readonly Record<string, unknown>[]).find(
				({ capability }) => capability === "dead-code",
			),
		).toEqual({
			state: "unbound",
			capability: "dead-code",
			reason: "provider-not-configured",
			providerId: "fallow",
		});

		const invocationCountAfterStatus = run.invocations.length;
		const result = resultDetails(await pi.callTool("analysis_dead_code", {}));
		expect(result).toEqual({
			kind: "unbound",
			capability: "dead-code",
			reason: "provider-not-configured",
			providerId: "fallow",
		});
		expect(result).not.toHaveProperty("coverage");
		expect(run.invocations).toHaveLength(invocationCountAfterStatus);

		// One rule left enabled is enough for the provider to report something, so
		// the capability stays bound. This is what keeps the check from degrading
		// every project that merely tunes its rule severities.
		const partial = successfulIntrospection({
			config: {
				rules: { ...disabledDeadCodeRules, "unused-exports": "warn" },
			},
		});
		const partialPi = createMockPi({ cwd: projectRoot });
		createProjectToolsExtension({
			userStateRoot,
			injectedExecutablePath: executable,
			executeProcess: partial.execute,
		})(partialPi as never);
		expect(
			(
				resultDetails(await partialPi.callTool("analysis_status", {}))
					.capabilities as readonly Record<string, unknown>[]
			).find(({ capability }) => capability === "dead-code"),
		).toMatchObject({ state: "bound", capability: "dead-code" });
	});

	test("keeps audit coverage consistent with the dead-code binding", async () => {
		/*
		 * The audit embeds a dead_code sub-envelope, so it could declare the
		 * category covered while the dedicated capability is unbound for exactly
		 * the same configuration — passing a bound gate through the audit that the
		 * capability itself refuses to answer. Coverage must agree with the
		 * binding.
		 */
		const auditFixture = await loadCapabilityFixture("changed-scope-audit");
		const disabled = Object.fromEntries(
			[
				"unused-files",
				"unused-exports",
				"unused-types",
				"unused-dependencies",
				"unused-dev-dependencies",
				"unused-optional-dependencies",
				"unused-enum-members",
				"unused-class-members",
				"unresolved-imports",
				"unlisted-dependencies",
				"duplicate-exports",
				"type-only-dependencies",
				"test-only-dependencies",
				"circular-dependencies",
				"stale-suppressions",
			].map((rule) => [rule, "off"]),
		);
		const auditPayload = auditFixture.envelope.payload as Record<
			string,
			unknown
		>;
		const deadCode = auditPayload.dead_code as Record<string, unknown>;
		// A clean dead-code sub-envelope: with every rule disabled the emptiness is
		// not evidence of a clean scope, so it must not be declared covered.
		const cleanAudit = {
			...auditPayload,
			verdict: "pass",
			summary: {
				...(auditPayload.summary as Record<string, unknown>),
				dead_code_issues: 0,
				dead_code_has_errors: false,
			},
			dead_code: {
				...deadCode,
				total_issues: 0,
				summary: {
					...(deadCode.summary as Record<string, unknown>),
					total_issues: 0,
					unused_files: 0,
					unused_exports: 0,
				},
				unused_files: [],
				unused_exports: [],
			},
		};
		const runtime = await discoveredRuntimeWithFixtures({
			config: { rules: disabled },
			capabilityOutcome: {
				kind: "code-exit",
				code: 0,
				stdout: JSON.stringify(cleanAudit),
				stderr: "",
			},
		});
		const result = await runtime.execute({
			capability: "changed-scope-audit",
			scope: { kind: "changed", base: "HEAD" },
		});
		if (result.kind !== "findings") {
			throw new Error(`Expected findings, received ${result.kind}.`);
		}
		expect(result.coverage).not.toContain("dead-code");
		expect(result.coverage).toEqual(["duplication", "complexity"]);

		// Evidence outranks configuration: the same disabled rules with a dead-code
		// finding present must still declare the category, or the finding would
		// contradict its own result and fail normalization.
		const withFindings = await discoveredRuntimeWithFixtures({
			config: { rules: disabled },
			capabilityOutcome: {
				kind: "code-exit",
				code: auditFixture.envelope.code,
				stdout: auditFixture.envelope.stdout,
				stderr: auditFixture.envelope.stderr,
			},
		});
		const evidenced = await withFindings.execute({
			capability: "changed-scope-audit",
			scope: { kind: "changed", base: "HEAD" },
		});
		if (evidenced.kind !== "findings") {
			throw new Error(`Expected findings, received ${evidenced.kind}.`);
		}
		expect(evidenced.coverage).toContain("dead-code");

		// The fourth combination: clean and enabled. An empty result IS evidence of
		// a clean scope when the analyzer was allowed to report, so the category is
		// declared and the gate can legitimately pass on it.
		const cleanEnabled = await discoveredRuntimeWithFixtures({
			capabilityOutcome: {
				kind: "code-exit",
				code: 0,
				stdout: JSON.stringify(cleanAudit),
				stderr: "",
			},
		});
		const enabled = await cleanEnabled.execute({
			capability: "changed-scope-audit",
			scope: { kind: "changed", base: "HEAD" },
		});
		if (enabled.kind !== "findings") {
			throw new Error(`Expected findings, received ${enabled.kind}.`);
		}
		expect(enabled.coverage).toEqual([
			"dead-code",
			"duplication",
			"complexity",
		]);
	});

	test("reports boundary conformance unbound when its rule is disabled", async () => {
		await writeFile(join(projectRoot, "fallow.toml"), "", "utf8");
		await recordConsent();
		const executable = await createExecutable(
			join(fixtureRoot, "injected", "fallow"),
		);
		/*
		 * Zones and rules are configured, so the capability looks available — but
		 * the `boundary-violation` severity is off, so a boundary run reports
		 * nothing whatever the code contains. Treating that as a supported
		 * capability would let a clean result stand in for an evaluation that
		 * never happened: coverage would declare the category and a bound gate
		 * could pass on it. INV-2 requires the opposite — report it unbound,
		 * visibly, and never execute it.
		 */
		const run = successfulIntrospection({
			config: {
				boundaries: {
					zones: [{ name: "ui", patterns: ["src/ui/**"] }],
					rules: [{ from: "ui", allow: [] }],
				},
				rules: { "boundary-violation": "off" },
			},
		});
		const pi = createMockPi({ cwd: projectRoot });
		createProjectToolsExtension({
			userStateRoot,
			injectedExecutablePath: executable,
			executeProcess: run.execute,
		})(pi as never);

		const status = resultDetails(await pi.callTool("analysis_status", {}));
		expect(
			(status.capabilities as readonly Record<string, unknown>[]).find(
				({ capability }) => capability === "boundary-conformance",
			),
		).toEqual({
			state: "unbound",
			capability: "boundary-conformance",
			reason: "provider-not-configured",
			providerId: "fallow",
		});

		const invocationCountAfterStatus = run.invocations.length;
		const result = resultDetails(await pi.callTool("analysis_boundaries", {}));
		expect(result).toEqual({
			kind: "unbound",
			capability: "boundary-conformance",
			reason: "provider-not-configured",
			providerId: "fallow",
		});
		expect(result).not.toHaveProperty("coverage");
		expect(run.invocations).toHaveLength(invocationCountAfterStatus);
	});

	// @cosmo-behavior plan:analysis-capability-runtime#B-037
	test("surfaces version drift and fails out-of-contract envelopes", async () => {
		await writeFile(join(projectRoot, "fallow.toml"), "", "utf8");
		await recordConsent();
		const executable = await createExecutable(
			join(fixtureRoot, "injected", "fallow"),
		);
		const invocations: ProviderProcessInvocation[] = [];
		const executeProcess: ProviderProcessExecutor = async (invocation) => {
			invocations.push(invocation);
			if (invocation.args.includes("--version")) {
				return {
					kind: "code-exit",
					code: 0,
					stdout: "fallow 2.55.0\n",
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
			return {
				kind: "code-exit",
				code: 0,
				stdout: JSON.stringify({
					schema_version: 999,
					version: "2.55.0",
					total_issues: 0,
				}),
				stderr: "",
			};
		};
		const pi = createMockPi({ cwd: projectRoot });
		createProjectToolsExtension({
			userStateRoot,
			injectedExecutablePath: executable,
			executeProcess,
		})(pi as never);
		const status = resultDetails(await pi.callTool("analysis_status", {}));
		expect(
			(status.capabilities as readonly Record<string, unknown>[])
				.filter(({ state }) => state === "bound")
				.every(
					(binding) =>
						(binding.provider as { readonly version?: string }).version ===
						"2.55.0",
				),
		).toBe(true);
		const execution = pi.callTool("analysis_dead_code", {});
		await expect(execution).rejects.toMatchObject({
			name: "AnalysisProviderError",
			failureClass: "unsupported-schema",
			process: {
				exitCode: 0,
			},
		});
		await expect(execution).rejects.toThrow(
			/Capability: dead-code[\s\S]*Provider: fallow@2\.55\.0[\s\S]*Failure class: unsupported-schema/u,
		);
		expect(
			invocations.filter(({ args }) => args[0] === "dead-code"),
		).toHaveLength(1);
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
					stdout: JSON.stringify({
						boundaries: {
							zones: [{ name: "ui", patterns: ["src/ui/**"] }],
							rules: [{ from: "ui", allow: [] }],
						},
					}),
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

	test("isolates mixed complexity findings and verdicts by requested metric", async () => {
		const fixture = await loadCapabilityFixture("complexity");
		const payload = fixture.envelope.payload as Readonly<
			Record<string, unknown>
		> & {
			readonly findings: readonly Readonly<Record<string, unknown>>[];
		};
		const exemplar = payload.findings[0];
		if (exemplar === undefined) {
			throw new Error("Expected a captured complexity finding.");
		}
		const exceededValues = [
			"cyclomatic",
			"cognitive",
			"both",
			"crap",
			"cyclomatic_crap",
			"cognitive_crap",
			"all",
		] as const;
		const metricCases = [
			{
				metric: "cyclomatic",
				applicable: ["cyclomatic", "both", "cyclomatic_crap", "all"],
			},
			{
				metric: "cognitive",
				applicable: ["cognitive", "both", "cognitive_crap", "all"],
			},
			{
				metric: "crap",
				applicable: ["crap", "cyclomatic_crap", "cognitive_crap", "all"],
			},
		] as const;
		const findings = exceededValues.map((exceeded) => ({
			...exemplar,
			path: `src/${exceeded}.ts`,
			name: `${exceeded}Only`,
			exceeded,
		}));
		const mixedPayload = { ...payload, findings };

		for (const { metric, applicable } of metricCases) {
			const mixedRuntime = await discoveredRuntimeWithFixtures({
				capabilityOutcome: {
					kind: "code-exit",
					code: 1,
					stdout: JSON.stringify(mixedPayload),
					stderr: fixture.envelope.stderr,
				},
			});
			const mixedResult = await mixedRuntime.execute({
				capability: "complexity",
				scope: { kind: "project" },
				metric,
			});
			expect(mixedResult).toMatchObject({
				kind: "findings",
				capability: "complexity",
				metric,
				verdict: "fail",
				native: { payload: mixedPayload },
			});
			if (mixedResult.kind !== "findings") {
				throw new Error(`Expected findings, received ${mixedResult.kind}.`);
			}
			expect(
				mixedResult.findings.map(
					(finding) => finding.providerDetails?.data.exceeded,
				),
			).toEqual(applicable);

			const exclusivePayload = {
				...payload,
				findings: findings.filter(
					(finding) =>
						!applicable.some((exceeded) => exceeded === finding.exceeded),
				),
			};
			const exclusiveRuntime = await discoveredRuntimeWithFixtures({
				capabilityOutcome: {
					kind: "code-exit",
					code: 1,
					stdout: JSON.stringify(exclusivePayload),
					stderr: fixture.envelope.stderr,
				},
			});
			const exclusiveResult = await exclusiveRuntime.execute({
				capability: "complexity",
				scope: { kind: "project" },
				metric,
			});
			expect(exclusiveResult).toMatchObject({
				kind: "findings",
				capability: "complexity",
				metric,
				verdict: "pass",
				findings: [],
				native: {
					exitCode: 1,
					payload: exclusivePayload,
				},
			});
		}
	});

	// @cosmo-behavior plan:analysis-capability-runtime#B-007
	test("normalizes every supported capability and preserves its native envelope", async () => {
		const runtime = await discoveredRuntimeWithFixtures();

		for (const request of CAPABILITY_REQUESTS) {
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
				expect(result.coverage.length).toBeGreaterThan(0);
				expect(
					result.coverage.every((capability) =>
						ANALYSIS_GATE_CAPABILITIES.includes(capability),
					),
				).toBe(true);
				expect(result.findings.length).toBeGreaterThan(0);
			} else if (result.kind === "trace") {
				expect(result.verdict).toBe("not-applicable");
				expect(result).not.toHaveProperty("coverage");
				expect(result.trace.evidence.length).toBeGreaterThan(0);
			} else {
				expect(result.verdict).toBe("not-applicable");
				expect(result).not.toHaveProperty("coverage");
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

	// @cosmo-behavior plan:analysis-gate-coverage#B-042
	test("rejects findings outside the declared gate coverage", async () => {
		const deadCodeFixture = await loadCapabilityFixture("dead-code");
		const auditFixture = await loadCapabilityFixture("changed-scope-audit");
		const deadCodePayload = deadCodeFixture.envelope.payload as Readonly<
			Record<string, unknown>
		>;
		const auditPayload = auditFixture.envelope.payload as Readonly<
			Record<string, unknown>
		>;
		const boundaryViolation = (
			deadCodePayload.boundary_violations as readonly unknown[]
		)[0];
		const auditDeadCode = auditPayload.dead_code as Readonly<
			Record<string, unknown>
		>;
		const auditDeadCodeSummary = auditDeadCode.summary as Readonly<
			Record<string, unknown>
		>;
		const auditSummary = auditPayload.summary as Readonly<
			Record<string, unknown>
		>;
		const auditPayloadWithBoundaryFinding = {
			...auditPayload,
			summary: {
				...auditSummary,
				dead_code_issues: 4,
			},
			dead_code: {
				...auditDeadCode,
				total_issues: 4,
				summary: {
					...auditDeadCodeSummary,
					total_issues: 4,
					boundary_violations: 1,
				},
				boundary_violations: [boundaryViolation],
			},
		};
		const cases = [
			{
				name: "single-capability",
				request: {
					capability: "dead-code",
					scope: { kind: "project" },
				},
				payload: deadCodePayload,
			},
			{
				name: "changed-scope-audit",
				request: {
					capability: "changed-scope-audit",
					scope: { kind: "changed", base: "HEAD" },
				},
				payload: auditPayloadWithBoundaryFinding,
			},
		] as const satisfies readonly {
			readonly name: string;
			readonly request: AnalysisRequest;
			readonly payload: unknown;
		}[];

		/*
		 * The guard catches under-declaration only: a finding whose category the
		 * result did not declare. It cannot detect over-declaration — declaring a
		 * category that produced no findings is indistinguishable from a clean
		 * evaluation at this seam, which is why over-declaration is prevented
		 * upstream instead, by deriving each declaration from evidence and by
		 * reporting a capability unbound when the provider will not evaluate it.
		 *
		 * Under D-032 a boundary finding is itself
		 * the evidence that boundaries were evaluated, so it self-covers and the
		 * reference adapter's normalizers cannot construct a finding outside its
		 * own declared coverage — every category they emit is derived from the
		 * same evidence that declares it. The invariant is therefore proven
		 * directly at its seam, and the paths that previously produced a
		 * contradiction are proven to normalize cleanly instead, under both
		 * configured and unconfigured boundaries.
		 */
		for (const testCase of cases) {
			const stderr = `${testCase.name} provider evidence`;
			for (const boundariesConfigured of [true, false]) {
				const runtime = await discoveredRuntimeWithFixtures({
					boundariesConfigured,
					capabilityOutcome: {
						kind: "code-exit",
						code: 1,
						stdout: JSON.stringify(testCase.payload),
						stderr,
					},
				});
				const result = await runtime.execute(testCase.request);
				expect(
					result,
					`${testCase.name}/${boundariesConfigured}`,
				).toMatchObject({
					kind: "findings",
					coverage: expect.arrayContaining(["boundary-conformance"]),
					findings: expect.arrayContaining([
						expect.objectContaining({ category: "boundary-conformance" }),
					]),
				});
			}
		}

		for (const { findings, coverage, message } of [
			{
				findings: [{ category: "duplication" } as const],
				coverage: ["dead-code"] as const,
				message:
					"normalized finding category duplication is outside declared coverage [dead-code]",
			},
			{
				findings: [{ category: "boundary-conformance" } as const],
				coverage: ["dead-code"] as const,
				message:
					"normalized finding category boundary-conformance is outside declared coverage [dead-code]",
			},
			{
				findings: [
					{ category: "dead-code" } as const,
					{ category: "complexity" } as const,
				],
				coverage: ["dead-code", "duplication"] as const,
				message:
					"normalized finding category complexity is outside declared coverage [dead-code, duplication]",
			},
		]) {
			expect(() => assertFallowFindingsCovered(findings, coverage)).toThrow(
				message,
			);
		}

		expect(() =>
			assertFallowFindingsCovered(
				[{ category: "dead-code" }, { category: "boundary-conformance" }],
				["dead-code", "boundary-conformance"],
			),
		).not.toThrow();
	});

	test("rejects structurally valid verdict evidence that contradicts the provider exit", async () => {
		const duplicationFixture = await loadCapabilityFixture("duplication");
		const auditFixture = await loadCapabilityFixture("changed-scope-audit");
		const contradictions = [
			{
				name: "exit one with zero findings",
				request: {
					capability: "duplication",
					scope: { kind: "project" },
				},
				code: 1,
				payload: { schema_version: 4, clone_groups: [] },
			},
			{
				name: "exit one with asserted pass",
				request: {
					capability: "changed-scope-audit",
					scope: { kind: "changed", base: "HEAD" },
				},
				code: 1,
				payload: {
					schema_version: 3,
					base_ref: "HEAD",
					verdict: "pass",
				},
			},
			{
				name: "exit zero with findings",
				request: {
					capability: "duplication",
					scope: { kind: "project" },
				},
				code: 0,
				payload: duplicationFixture.envelope.payload,
			},
			{
				name: "exit zero with asserted fail",
				request: {
					capability: "changed-scope-audit",
					scope: { kind: "changed", base: "HEAD" },
				},
				code: 0,
				payload: auditFixture.envelope.payload,
			},
		] as const satisfies readonly {
			readonly name: string;
			readonly request: AnalysisRequest;
			readonly code: 0 | 1;
			readonly payload: unknown;
		}[];

		for (const contradiction of contradictions) {
			const runtime = await discoveredRuntimeWithFixtures({
				capabilityOutcome: {
					kind: "code-exit",
					code: contradiction.code,
					stdout: JSON.stringify(contradiction.payload),
					stderr: `${contradiction.name} detail`,
				},
			});

			await expect(
				runtime.execute(contradiction.request),
				contradiction.name,
			).rejects.toThrow(
				/Failure class: invalid-output[\s\S]*Process evidence: exit=[01]/u,
			);
		}
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
		await writeFile(join(projectRoot, "fallow.toml"), "", "utf8");
		await recordConsent();
		const executable = await createExecutable(
			join(fixtureRoot, "injected", "fallow"),
		);
		const fixture = await loadCapabilityFixture("changed-scope-audit");
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
					code: 3,
					stdout: "no config file found, using defaults\n",
					stderr: "",
				};
			}
			return {
				kind: "code-exit",
				code: fixture.envelope.code,
				stdout: fixture.envelope.stdout,
				stderr: fixture.envelope.stderr,
			};
		};
		const pi = createMockPi({ cwd: projectRoot });
		createProjectToolsExtension({
			userStateRoot,
			injectedExecutablePath: executable,
			executeProcess,
		})(pi as never);
		const invalidBases = [undefined, "", "   "] as const;

		for (const base of invalidBases) {
			await expect(
				pi.callTool("analysis_audit", base === undefined ? {} : { base }),
			).rejects.toThrow(/base must be a nonempty string/iu);
		}
		expect(invocations).toHaveLength(0);

		const literalBase = "HEAD";
		const completed = resultDetails(
			await pi.callTool("analysis_audit", { base: literalBase }),
		);
		expect(invocations.at(-1)?.args).toEqual([
			"audit",
			"--base",
			literalBase,
			"--format",
			"json",
			"--quiet",
			"--no-cache",
			"--fail-on-issues",
		]);
		expect(completed.scope).toEqual({ kind: "changed", base: literalBase });

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

		const executablePath = await resolveInstalledFallowExecutable({
			projectRoot: REPOSITORY_ROOT,
		});
		if (executablePath === null) {
			throw new Error("Expected the repository's native Fallow executable.");
		}
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

	// @cosmo-behavior plan:analysis-capability-runtime#B-012
	test("leaves the entire worktree unchanged across status and every capability", async () => {
		await createLiveProviderProject(projectRoot);
		await recordConsent();
		const executablePath = await resolveInstalledFallowExecutable({
			projectRoot: REPOSITORY_ROOT,
		});
		if (executablePath === null) {
			throw new Error("Expected the repository's native Fallow executable.");
		}
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
		const pi = createMockPi({ cwd: projectRoot });
		createProjectToolsExtension({
			userStateRoot,
			injectedExecutablePath: executablePath,
			executeProcess,
		})(pi as never);
		const registeredToolNames = [...pi.tools.keys()];
		expect(registeredToolNames).toEqual([
			"analysis_status",
			"analysis_dead_code",
			"analysis_duplication",
			"analysis_complexity",
			"analysis_boundaries",
			"analysis_audit",
			"analysis_trace",
			"analysis_fix_preview",
		]);
		expect(registeredToolNames).toEqual([...ANALYSIS_TOOL_NAMES]);
		expect(
			registeredToolNames.some((name) =>
				/(?:apply|write|mutat)|analysis_fix$/u.test(name),
			),
		).toBe(false);

		const status = resultDetails(await pi.callTool("analysis_status", {}));
		const results: Record<string, unknown>[] = [];
		for (const [toolName, params] of Object.entries(VALID_TOOL_PARAMS)) {
			const toolResult = (await pi.callTool(toolName, params)) as ToolResult;
			const details = resultDetails(toolResult);
			const modelVisibleText = toolResult.content[0]?.text;
			if (modelVisibleText === undefined) {
				throw new Error(`Expected model-visible JSON from ${toolName}.`);
			}
			const modelVisible = JSON.parse(modelVisibleText) as Record<
				string,
				unknown
			>;
			expect(modelVisible, toolName).toEqual(details);
			if (
				toolName === "analysis_trace" ||
				toolName === "analysis_fix_preview"
			) {
				expect(details, toolName).not.toHaveProperty("coverage");
				expect(modelVisible, toolName).not.toHaveProperty("coverage");
			} else {
				expect(details.coverage, toolName).toEqual(modelVisible.coverage);
				expect(details.coverage, toolName).toEqual(expect.any(Array));
				expect(details.coverage, toolName).not.toHaveLength(0);
			}
			results.push(details);
		}

		const deadCodeFixture = await loadCapabilityFixture("dead-code");
		const contradictionPi = createMockPi({ cwd: projectRoot });
		createProjectToolsExtension({
			userStateRoot,
			injectedExecutablePath: executablePath,
			executeProcess: async (invocation) => {
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
						stdout: "no config file found, using defaults\n",
						stderr: "",
					};
				}
				return {
					kind: "code-exit",
					code: deadCodeFixture.envelope.code,
					stdout: deadCodeFixture.envelope.stdout,
					stderr: deadCodeFixture.envelope.stderr,
				};
			},
		})(contradictionPi as never);
		/*
		 * Caller-facing evidence that boundary coverage is evidence-derived rather
		 * than configuration-derived (D-032): this provider reports no
		 * configuration at all (`config` exits 3, defaults in effect), yet the
		 * captured envelope carries a boundary violation. The registered tool must
		 * therefore declare the category — proving the claim survives transport
		 * through Pi and does not depend on a configuration snapshot that an
		 * external `extends` source could have invalidated.
		 */
		const unconfiguredResult = (await contradictionPi.callTool(
			"analysis_dead_code",
			{},
		)) as ToolResult;
		const unconfiguredDetails = resultDetails(unconfiguredResult);
		const unconfiguredText = unconfiguredResult.content[0]?.text;
		if (unconfiguredText === undefined) {
			throw new Error("Expected model-visible JSON from analysis_dead_code.");
		}
		expect(unconfiguredDetails.coverage).toEqual([
			"dead-code",
			"boundary-conformance",
		]);
		expect(JSON.parse(unconfiguredText)).toEqual(unconfiguredDetails);
		expect(unconfiguredDetails.findings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ category: "boundary-conformance" }),
			]),
		);

		const after = await snapshotWholeTree(projectRoot);

		expect(status).toMatchObject({
			kind: "status",
			capabilities: expect.arrayContaining(
				ANALYSIS_CAPABILITIES.map((capability) =>
					expect.objectContaining({ capability }),
				),
			),
		});
		expect(results).toHaveLength(ANALYSIS_CAPABILITIES.length);
		expect(results.map(({ capability }) => capability)).toEqual([
			...ANALYSIS_CAPABILITIES,
		]);
		expect(after).toEqual(before);
		expect(before[".fallow/preexisting.bin"]).toBeDefined();
		expect(invocations.every(({ args }) => args.includes("--no-cache"))).toBe(
			true,
		);
		const fixInvocation = invocations.find(({ args }) => args[0] === "fix");
		expect(fixInvocation?.args).toEqual(
			expect.arrayContaining(["--dry-run", "--no-cache"]),
		);
	});
});
