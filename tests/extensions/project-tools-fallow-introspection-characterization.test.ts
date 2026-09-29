import {
	chmod,
	mkdir,
	mkdtemp,
	realpath,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
	discoverFallowProvider,
	FALLOW_VALIDATED_ENGINE_VERSION,
} from "../../domains/shared/extensions/project-tools/fallow-provider.ts";
import type {
	ProviderProcessExecutor,
	ProviderProcessInvocation,
	ProviderProcessOutcome,
} from "../../domains/shared/extensions/project-tools/process-runner.ts";

const REPOSITORY_ROOT = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../..",
);

let root: string;
let projectRoot: string;
let userStateRoot: string;
let executable: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "fallow-introspection-char-"));
	projectRoot = join(root, "project");
	userStateRoot = join(root, "user-state");
	await mkdir(projectRoot, { recursive: true });
	await writeFile(join(projectRoot, "fallow.toml"), "", "utf8");
	executable = join(root, "bin", "fallow");
	await mkdir(dirname(executable), { recursive: true });
	await writeFile(executable, "#!/bin/sh\nexit 0\n", "utf8");
	await chmod(executable, 0o755);
	await recordConsent();
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

async function recordConsent(): Promise<void> {
	await mkdir(userStateRoot, { recursive: true });
	await writeFile(
		join(userStateRoot, "analysis-execution-consent.json"),
		`${JSON.stringify({
			schemaVersion: 1,
			projects: {
				[await realpath(projectRoot)]: { providers: ["fallow"] },
			},
		})}\n`,
		"utf8",
	);
}

function exit(
	code: number,
	stdout: string,
	stderr = "",
): ProviderProcessOutcome {
	return { kind: "code-exit", code, stdout, stderr };
}

interface Script {
	readonly version?: (
		invocation: ProviderProcessInvocation,
	) => ProviderProcessOutcome | Promise<ProviderProcessOutcome>;
	readonly config?: (
		invocation: ProviderProcessInvocation,
	) => ProviderProcessOutcome | Promise<ProviderProcessOutcome>;
}

function scripted(script: Script = {}) {
	const invocations: ProviderProcessInvocation[] = [];
	const executeProcess: ProviderProcessExecutor = async (invocation) => {
		invocations.push(invocation);
		if (invocation.args.includes("--version")) {
			return (
				script.version?.(invocation) ??
				exit(0, `fallow ${FALLOW_VALIDATED_ENGINE_VERSION}\n`)
			);
		}
		return (
			script.config?.(invocation) ??
			exit(
				0,
				`loaded config: ${projectRoot}/fallow.toml\n${JSON.stringify({
					boundaries: {
						zones: [{ name: "ui", patterns: ["src/ui/**"] }],
						rules: [{ from: "ui", allow: [] }],
					},
				})}\n`,
			)
		);
	};
	return { invocations, executeProcess };
}

async function discover(
	script: Script = {},
	extra: { signal?: AbortSignal } = {},
) {
	const run = scripted(script);
	const discovery = await discoverFallowProvider({
		projectRoot,
		userStateRoot,
		injectedExecutablePath: executable,
		executeProcess: run.executeProcess,
		...extra,
	});
	return { discovery, invocations: run.invocations };
}

function bindingStates(discovery: {
	readonly bindings: readonly { state: string; capability: string }[];
}) {
	return Object.fromEntries(
		discovery.bindings.map((binding) => [binding.capability, binding.state]),
	);
}

const ALL_BOUND = {
	"dead-code": "bound",
	duplication: "bound",
	complexity: "bound",
	"boundary-conformance": "bound",
	"changed-scope-audit": "bound",
	trace: "bound",
	"fix-preview": "bound",
};

function failureOf(discovery: unknown) {
	const failed = discovery as {
		status: string;
		detection: { failure: { kind: string; message: string } };
	};
	expect(failed.status).toBe("failed");
	return failed.detection.failure;
}

describe("introspectProvider result variants through discoverFallowProvider (characterization)", () => {
	test("detects the provider after a version probe then a config probe, both with --no-cache", async () => {
		const { discovery, invocations } = await discover();
		expect(discovery.status).toBe("detected");
		expect(bindingStates(discovery)).toEqual(ALL_BOUND);
		expect(invocations.map((invocation) => invocation.args)).toEqual([
			["--version", "--no-cache"],
			["config", "--format", "json", "--quiet", "--no-cache"],
		]);
		expect(invocations.every((i) => i.cwd === projectRoot)).toBe(true);
		if (discovery.status !== "detected") return;
		expect(discovery.detection.provider.provider).toEqual({
			id: "fallow",
			name: "Fallow",
			version: FALLOW_VALIDATED_ENGINE_VERSION,
		});
	});

	test("config exit 3 (no config file) still detects with boundary conformance unbound", async () => {
		const { discovery } = await discover({
			config: () => exit(3, "no config file found, using defaults\n"),
		});
		expect(discovery.status).toBe("detected");
		expect(bindingStates(discovery)).toEqual({
			...ALL_BOUND,
			"boundary-conformance": "unbound",
		});
		expect(
			discovery.bindings.find((b) => b.capability === "boundary-conformance"),
		).toEqual({
			state: "unbound",
			capability: "boundary-conformance",
			reason: "provider-not-configured",
			providerId: "fallow",
		});
	});

	test("boundary_violations rule off leaves boundary conformance unbound even with zones and rules", async () => {
		const { discovery } = await discover({
			config: () =>
				exit(
					0,
					JSON.stringify({
						rules: { "boundary-violation": "off" },
						boundaries: {
							zones: [{ name: "ui" }],
							rules: [{ from: "ui" }],
						},
					}),
				),
		});
		expect(discovery.status).toBe("detected");
		expect(bindingStates(discovery)["boundary-conformance"]).toBe("unbound");
	});

	test("every dead-code rule off leaves dead-code unbound as provider-not-configured", async () => {
		const rules = Object.fromEntries(
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
		const { discovery } = await discover({
			config: () => exit(0, JSON.stringify({ rules })),
		});
		expect(discovery.status).toBe("detected");
		const states = bindingStates(discovery);
		expect(states.duplication).toBe("bound");
		expect(states.complexity).toBe("bound");
		expect(
			discovery.bindings.find((b) => b.capability === "dead-code"),
		).toEqual({
			state: "unbound",
			capability: "dead-code",
			reason: "provider-not-configured",
			providerId: "fallow",
		});
	});

	test("accepts a config preamble line before the JSON object", async () => {
		const { discovery } = await discover({
			config: () => exit(0, `loaded config: x\n  {"rules": {}}\n`),
		});
		expect(discovery.status).toBe("detected");
	});

	test("a version probe with a non-zero exit fails every binding as provider-exit", async () => {
		const { discovery, invocations } = await discover({
			version: () => exit(4, "", "boom"),
		});
		expect(failureOf(discovery)).toEqual({
			kind: "provider-exit",
			message: "Fallow version exited with code 4.",
			process: { exitCode: 4, stderr: "boom" },
		});
		expect(discovery.bindings.every((b) => b.state === "failed")).toBe(true);
		expect(invocations).toHaveLength(1);
	});

	test("a version probe killed by a signal fails as provider-signal", async () => {
		const { discovery } = await discover({
			version: () => ({
				kind: "signal-exit",
				signal: "SIGKILL",
				stdout: "",
				stderr: "",
			}),
		});
		expect(failureOf(discovery).kind).toBe("provider-signal");
	});

	test("a version probe that cannot start fails as spawn-error", async () => {
		const { discovery } = await discover({
			version: () => ({
				kind: "spawn-error",
				error: Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
				stdout: "",
				stderr: "",
			}),
		});
		expect(failureOf(discovery).kind).toBe("spawn-error");
	});

	test.each([
		"fallow",
		"fallow x.y.z",
		"not fallow 1.2.3",
		"fallow 1.2",
	])("an unparsable version %j fails as invalid-output without probing config", async (stdout) => {
		const { discovery, invocations } = await discover({
			version: () => exit(0, `${stdout}\n`),
		});
		expect(failureOf(discovery)).toEqual({
			kind: "invalid-output",
			message:
				"Fallow version returned invalid output: expected `fallow <version>`",
		});
		expect(invocations).toHaveLength(1);
	});

	test("accepts prerelease and build metadata versions", async () => {
		const { discovery } = await discover({
			version: () => exit(0, "fallow 3.1.4-rc.1+build.7\n"),
		});
		expect(discovery.status).toBe("detected");
		if (discovery.status !== "detected") return;
		expect(discovery.detection.provider.provider.version).toBe(
			"3.1.4-rc.1+build.7",
		);
	});

	test("config exit 2 fails as invalid-config", async () => {
		const { discovery } = await discover({
			config: () => exit(2, "", "bad toml"),
		});
		expect(failureOf(discovery)).toEqual({
			kind: "invalid-config",
			message: "Fallow config exited with code 2.",
			process: { exitCode: 2, stderr: "bad toml" },
		});
	});

	test("any other config exit fails as provider-exit", async () => {
		const { discovery } = await discover({ config: () => exit(1, "") });
		expect(failureOf(discovery).kind).toBe("provider-exit");
	});

	test.each([
		["no JSON line", "just words\n"],
		["malformed JSON", "{not json\n"],
		["a JSON array", "[1,2]\n{"],
	])("config output with %s fails as invalid-output", async (_name, stdout) => {
		const { discovery } = await discover({ config: () => exit(0, stdout) });
		expect(failureOf(discovery)).toEqual({
			kind: "invalid-output",
			message:
				"Fallow config returned invalid output: expected a JSON object after any preamble",
		});
	});

	test("a config probe that times out fails as timeout", async () => {
		const { discovery } = await discover({
			config: () => ({
				kind: "timeout",
				timeoutMs: 5,
				reason: "slow",
				stdout: "",
				stderr: "",
			}),
		});
		expect(failureOf(discovery)).toMatchObject({
			kind: "timeout",
			message: "Fallow config timed out after 5ms.",
		});
	});

	test("an already-aborted signal fails as aborted before any probe runs", async () => {
		const controller = new AbortController();
		controller.abort(new Error("stop now"));
		const { discovery, invocations } = await discover(
			{},
			{
				signal: controller.signal,
			},
		);
		expect(failureOf(discovery).kind).toBe("aborted");
		expect(invocations).toHaveLength(0);
	});

	test("aborting during the version probe fails as an aborted version operation", async () => {
		const controller = new AbortController();
		const { discovery, invocations } = await discover(
			{
				version: () => {
					controller.abort(new Error("mid-version"));
					return exit(0, `fallow ${FALLOW_VALIDATED_ENGINE_VERSION}\n`);
				},
			},
			{ signal: controller.signal },
		);
		expect(failureOf(discovery)).toMatchObject({
			kind: "aborted",
			message: "Fallow version was aborted.",
			process: { reason: "mid-version" },
		});
		expect(invocations).toHaveLength(1);
	});

	test("aborting during the config probe fails as an aborted config operation", async () => {
		const controller = new AbortController();
		const { discovery, invocations } = await discover(
			{
				config: () => {
					controller.abort(new Error("mid-config"));
					return exit(0, "{}");
				},
			},
			{ signal: controller.signal },
		);
		expect(failureOf(discovery)).toMatchObject({
			kind: "aborted",
			message: "Fallow config was aborted.",
		});
		expect(invocations).toHaveLength(2);
	});

	test("consent revoked during the version probe withholds the provider before config runs", async () => {
		const { discovery, invocations } = await discover({
			version: async () => {
				await writeFile(
					join(userStateRoot, "analysis-execution-consent.json"),
					`${JSON.stringify({ schemaVersion: 1, projects: {} })}\n`,
					"utf8",
				);
				return exit(0, `fallow ${FALLOW_VALIDATED_ENGINE_VERSION}\n`);
			},
		});
		expect(discovery.status).toBe("unbound");
		expect(discovery).toMatchObject({ reason: "execution-not-consented" });
		expect(
			discovery.bindings.every(
				(binding) =>
					binding.state === "unbound" &&
					"reason" in binding &&
					binding.reason === "execution-not-consented",
			),
		).toBe(true);
		expect(invocations).toHaveLength(1);
	});

	test("a fallow.toml edit during the config probe fails as provider-configuration-changed", async () => {
		const { discovery } = await discover({
			config: async () => {
				await writeFile(
					join(projectRoot, "fallow.toml"),
					"# changed mid-introspection\n",
					"utf8",
				);
				return exit(3, "no config file found, using defaults\n");
			},
		});
		expect(failureOf(discovery)).toMatchObject({
			kind: "invalid-config",
			message: "Fallow configuration changed during provider introspection.",
			process: { reason: "provider-configuration-changed" },
		});
	});
});

describe("introspectProvider normalized analysis status for the repository configuration (characterization)", () => {
	test("binds the six non-boundary capabilities and leaves boundary conformance unbound for the repository's own fallow config", async () => {
		const repositoryConsent = join(root, "repo-consent");
		await mkdir(repositoryConsent, { recursive: true });
		await writeFile(
			join(repositoryConsent, "analysis-execution-consent.json"),
			`${JSON.stringify({
				schemaVersion: 1,
				projects: {
					[await realpath(REPOSITORY_ROOT)]: { providers: ["fallow"] },
				},
			})}\n`,
			"utf8",
		);
		const discovery = await discoverFallowProvider({
			projectRoot: REPOSITORY_ROOT,
			userStateRoot: repositoryConsent,
		});

		expect(discovery.status).toBe("detected");
		expect(bindingStates(discovery)).toEqual({
			...ALL_BOUND,
			"boundary-conformance": "unbound",
		});
		expect(
			discovery.bindings.find((b) => b.capability === "boundary-conformance"),
		).toEqual({
			state: "unbound",
			capability: "boundary-conformance",
			reason: "provider-not-configured",
			providerId: "fallow",
		});
		if (discovery.status !== "detected") return;
		expect(discovery.detection.provider.provider).toEqual({
			id: "fallow",
			name: "Fallow",
			version: FALLOW_VALIDATED_ENGINE_VERSION,
		});
		expect(
			discovery.detection.provider.capabilities.map((c) => [
				c.capability,
				c.status,
			]),
		).toEqual([
			["dead-code", "supported"],
			["duplication", "supported"],
			["complexity", "supported"],
			["boundary-conformance", "provider-not-configured"],
			["changed-scope-audit", "supported"],
			["trace", "supported"],
			["fix-preview", "supported"],
		]);
	});
});
