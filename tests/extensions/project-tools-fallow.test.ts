import {
	chmod,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
	discoverFallowProvider,
	FALLOW_VALIDATED_ENGINE_VERSION,
} from "../../domains/shared/extensions/project-tools/fallow-provider.ts";
import type {
	ProviderProcessExecutor,
	ProviderProcessInvocation,
} from "../../domains/shared/extensions/project-tools/process-runner.ts";
import { ANALYSIS_CAPABILITIES } from "../../lib/analysis/index.ts";

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
	await writeFile(
		join(stateRoot, "analysis-execution-consent.json"),
		`${JSON.stringify({
			schemaVersion: 1,
			projects: {
				[consentedProjectRoot]: { providers: ["fallow"] },
			},
		})}\n`,
		"utf8",
	);
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
		).toEqual([configuredExecutable, configuredExecutable]);
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
		).toEqual([projectExecutable, projectExecutable]);
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
		).toEqual([injectedExecutable, injectedExecutable]);
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
