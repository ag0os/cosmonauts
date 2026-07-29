import { access, constants, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import {
	ANALYSIS_CAPABILITIES,
	type AnalysisBinding,
	type AnalysisCapability,
	type AnalysisFailure,
	type DetectedAnalysisCapability,
	type DetectedAnalysisProvider,
	type ProviderDetection,
	type ProviderIdentity,
	resolveAnalysisBindings,
} from "../../../../lib/analysis/index.ts";
import { hasAnalysisExecutionConsent } from "./analysis-consent.ts";
import {
	type ProviderProcessExecutor,
	type ProviderProcessOutcome,
	runProviderProcess,
} from "./process-runner.ts";

const FALLOW_PROVIDER_ID = "fallow";
export const FALLOW_VALIDATED_ENGINE_VERSION = "2.54.2";

const FALLOW_VALIDATED_SCHEMA_VERSIONS = {
	"dead-code": [4],
	duplication: [4],
	complexity: [4],
	"boundary-conformance": [4],
	"changed-scope-audit": [3],
	trace: [],
	"fix-preview": [],
} as const satisfies Readonly<Record<AnalysisCapability, readonly number[]>>;

const FALLOW_CANONICAL_SIGNALS = [
	".fallowrc.json",
	"fallow.toml",
	".fallow.toml",
] as const;

type FallowSignalKind = "config" | "package";

interface FallowDetectionSignal {
	readonly kind: FallowSignalKind;
	readonly path: string;
}

interface FallowProviderRuntime {
	readonly provider: ProviderIdentity;
	readonly executablePath: string;
	readonly executeProcess: ProviderProcessExecutor;
	readonly validateEnvelopeSchema: typeof validateFallowEnvelopeSchema;
}

type FallowProviderDiscovery =
	| {
			readonly status: "absent";
			readonly detection: Extract<ProviderDetection, { status: "absent" }>;
			readonly bindings: readonly AnalysisBinding[];
	  }
	| {
			readonly status: "unbound";
			readonly signal: FallowDetectionSignal;
			readonly reason: "provider-not-installed" | "execution-not-consented";
			readonly bindings: readonly AnalysisBinding[];
	  }
	| {
			readonly status: "failed";
			readonly signal: FallowDetectionSignal;
			readonly detection: Extract<ProviderDetection, { status: "failed" }>;
			readonly bindings: readonly AnalysisBinding[];
	  }
	| {
			readonly status: "detected";
			readonly signal: FallowDetectionSignal;
			readonly detection: Extract<ProviderDetection, { status: "detected" }>;
			readonly bindings: readonly AnalysisBinding[];
			readonly runtime: FallowProviderRuntime;
	  };

interface DiscoverFallowProviderOptions {
	readonly projectRoot: string;
	/**
	 * Explicit runtime configuration, not repository-controlled provider config.
	 * Relative paths resolve from the target project.
	 */
	readonly configuredExecutablePath?: string;
	/** Last-resort seam for tests and pinned-engine integration fixtures. */
	readonly injectedExecutablePath?: string;
	/** User-owned state root containing the per-project consent decision. */
	readonly userStateRoot?: string;
	readonly executeProcess?: ProviderProcessExecutor;
}

interface FallowConfig {
	readonly boundaries?: {
		readonly zones?: readonly unknown[];
		readonly rules?: readonly unknown[];
	};
}

function providerNotAvailableBindings(
	reason: "provider-not-installed" | "execution-not-consented",
): readonly AnalysisBinding[] {
	return ANALYSIS_CAPABILITIES.map((capability) => ({
		state: "unbound",
		capability,
		reason,
		providerId: FALLOW_PROVIDER_ID,
	}));
}

async function fileExists(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isFile();
	} catch {
		return false;
	}
}

async function executableExists(path: string): Promise<boolean> {
	try {
		if (!(await stat(path)).isFile()) return false;
		await access(
			path,
			process.platform === "win32" ? constants.F_OK : constants.X_OK,
		);
		return true;
	} catch {
		return false;
	}
}

function configuredPath(projectRoot: string, path: string): string {
	return isAbsolute(path) ? path : resolve(projectRoot, path);
}

export async function detectFallowSignal(
	projectRoot: string,
): Promise<FallowDetectionSignal | null> {
	for (const signal of FALLOW_CANONICAL_SIGNALS) {
		if (await fileExists(join(projectRoot, signal))) {
			return { kind: "config", path: signal };
		}
	}

	const packagePath = join(projectRoot, "package.json");
	let parsed: unknown;
	try {
		parsed = JSON.parse(await readFile(packagePath, "utf8"));
	} catch {
		return null;
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		return null;
	}
	const packageJson = parsed as Record<string, unknown>;
	for (const dependencyKind of ["dependencies", "devDependencies"] as const) {
		const dependencies = packageJson[dependencyKind];
		if (
			typeof dependencies === "object" &&
			dependencies !== null &&
			!Array.isArray(dependencies) &&
			"fallow" in dependencies
		) {
			return { kind: "package", path: "package.json" };
		}
	}
	return null;
}

/**
 * Resolve only explicit or target-project-owned executables. Deliberately
 * omits PATH lookup, global package locations, and mutable package fetches.
 */
async function resolveFallowExecutable(
	options: Pick<
		DiscoverFallowProviderOptions,
		"projectRoot" | "configuredExecutablePath" | "injectedExecutablePath"
	>,
): Promise<string | null> {
	const projectRoot = resolve(options.projectRoot);
	const candidates = [
		options.configuredExecutablePath === undefined
			? undefined
			: configuredPath(projectRoot, options.configuredExecutablePath),
		join(
			projectRoot,
			"node_modules",
			".bin",
			process.platform === "win32" ? "fallow.cmd" : "fallow",
		),
		options.injectedExecutablePath === undefined
			? undefined
			: resolve(options.injectedExecutablePath),
	];
	for (const candidate of candidates) {
		if (candidate !== undefined && (await executableExists(candidate))) {
			return candidate;
		}
	}
	return null;
}

function processFailure(
	operation: string,
	outcome: ProviderProcessOutcome,
): AnalysisFailure {
	if (outcome.kind === "code-exit") {
		return {
			kind:
				operation === "config" && outcome.code === 2
					? "invalid-config"
					: "provider-exit",
			message: `Fallow ${operation} exited with code ${outcome.code}.`,
			process: {
				exitCode: outcome.code,
				stderr: outcome.stderr,
			},
		};
	}
	if (outcome.kind === "signal-exit") {
		return {
			kind: "provider-signal",
			message: `Fallow ${operation} exited from signal ${outcome.signal}.`,
			process: { signal: outcome.signal, stderr: outcome.stderr },
		};
	}
	if (outcome.kind === "spawn-error") {
		return {
			kind: "spawn-error",
			message: `Fallow ${operation} could not start: ${outcome.error.message}`,
			process: {
				reason: outcome.error.code ?? outcome.error.message,
				stderr: outcome.stderr,
			},
		};
	}
	if (outcome.kind === "aborted") {
		return {
			kind: "aborted",
			message: `Fallow ${operation} was aborted.`,
			process: {
				reason:
					outcome.reason instanceof Error
						? outcome.reason.message
						: String(outcome.reason),
				stderr: outcome.stderr,
			},
		};
	}
	return {
		kind: "timeout",
		message: `Fallow ${operation} timed out after ${outcome.timeoutMs}ms.`,
		process: {
			reason: outcome.reason,
			stderr: outcome.stderr,
		},
	};
}

function invalidOutput(operation: string, message: string): AnalysisFailure {
	return {
		kind: "invalid-output",
		message: `Fallow ${operation} returned invalid output: ${message}`,
	};
}

function parseVersion(stdout: string): string | null {
	const match = stdout
		.trim()
		.match(
			/^fallow\s+(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/u,
		);
	return match?.[1] ?? null;
}

function parseConfig(stdout: string): FallowConfig | null {
	const jsonStart = stdout
		.split(/\r?\n/u)
		.findIndex((line) => line.trimStart().startsWith("{"));
	if (jsonStart < 0) return null;
	try {
		const parsed = JSON.parse(
			stdout.split(/\r?\n/u).slice(jsonStart).join("\n"),
		) as unknown;
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			Array.isArray(parsed)
		) {
			return null;
		}
		return parsed as FallowConfig;
	} catch {
		return null;
	}
}

function boundariesConfigured(config: FallowConfig | null): boolean {
	return (
		Array.isArray(config?.boundaries?.zones) &&
		config.boundaries.zones.length > 0 &&
		Array.isArray(config.boundaries.rules) &&
		config.boundaries.rules.length > 0
	);
}

function capabilities(
	config: FallowConfig | null,
): readonly DetectedAnalysisCapability[] {
	return [
		{
			capability: "dead-code",
			status: "supported",
			scopes: ["project", "paths"],
		},
		{
			capability: "duplication",
			status: "supported",
			scopes: ["project"],
		},
		{
			capability: "complexity",
			status: "supported",
			scopes: ["project"],
			metrics: ["cyclomatic", "cognitive", "crap"],
		},
		boundariesConfigured(config)
			? {
					capability: "boundary-conformance",
					status: "supported",
					scopes: ["project", "paths"],
				}
			: {
					capability: "boundary-conformance",
					status: "provider-not-configured",
				},
		{
			capability: "changed-scope-audit",
			status: "supported",
			scopes: ["changed"],
		},
		{
			capability: "trace",
			status: "supported",
			scopes: ["target"],
		},
		{
			capability: "fix-preview",
			status: "supported",
			scopes: ["project", "paths"],
		},
	];
}

function failedDiscovery(
	signal: FallowDetectionSignal,
	failure: AnalysisFailure,
): FallowProviderDiscovery {
	const detection = {
		status: "failed",
		providerId: FALLOW_PROVIDER_ID,
		failure,
	} as const;
	return {
		status: "failed",
		signal,
		detection,
		bindings: resolveAnalysisBindings({ detections: [detection] }),
	};
}

async function introspectProvider(
	options: DiscoverFallowProviderOptions,
	signal: FallowDetectionSignal,
	executablePath: string,
	executeProcess: ProviderProcessExecutor,
): Promise<FallowProviderDiscovery> {
	const versionOutcome = await executeProcess({
		executablePath,
		args: ["--version"],
		cwd: options.projectRoot,
	});
	if (versionOutcome.kind !== "code-exit" || versionOutcome.code !== 0) {
		return failedDiscovery(signal, processFailure("version", versionOutcome));
	}
	const version = parseVersion(versionOutcome.stdout);
	if (version === null) {
		return failedDiscovery(
			signal,
			invalidOutput("version", "expected `fallow <version>`"),
		);
	}

	const configOutcome = await executeProcess({
		executablePath,
		args: ["config", "--format", "json", "--quiet", "--no-cache"],
		cwd: options.projectRoot,
	});
	let config: FallowConfig | null;
	if (configOutcome.kind === "code-exit" && configOutcome.code === 3) {
		config = null;
	} else if (configOutcome.kind === "code-exit" && configOutcome.code === 0) {
		config = parseConfig(configOutcome.stdout);
		if (config === null) {
			return failedDiscovery(
				signal,
				invalidOutput("config", "expected a JSON object after any preamble"),
			);
		}
	} else {
		return failedDiscovery(signal, processFailure("config", configOutcome));
	}

	const provider = {
		id: FALLOW_PROVIDER_ID,
		name: "Fallow",
		version,
	} as const;
	const detectedProvider: DetectedAnalysisProvider = {
		provider,
		capabilities: capabilities(config),
	};
	const detection = {
		status: "detected",
		provider: detectedProvider,
	} as const;
	return {
		status: "detected",
		signal,
		detection,
		bindings: resolveAnalysisBindings({ detections: [detection] }),
		runtime: {
			provider,
			executablePath,
			executeProcess,
			validateEnvelopeSchema: validateFallowEnvelopeSchema,
		},
	};
}

export async function discoverFallowProvider(
	options: DiscoverFallowProviderOptions,
): Promise<FallowProviderDiscovery> {
	const signal = await detectFallowSignal(options.projectRoot);
	if (signal === null) {
		const detection = {
			status: "absent",
			providerId: FALLOW_PROVIDER_ID,
		} as const;
		return {
			status: "absent",
			detection,
			bindings: resolveAnalysisBindings({ detections: [detection] }),
		};
	}

	const executablePath = await resolveFallowExecutable(options);
	if (executablePath === null) {
		return {
			status: "unbound",
			signal,
			reason: "provider-not-installed",
			bindings: providerNotAvailableBindings("provider-not-installed"),
		};
	}

	const consented = await hasAnalysisExecutionConsent({
		projectRoot: options.projectRoot,
		providerId: FALLOW_PROVIDER_ID,
		userStateRoot: options.userStateRoot,
	});
	if (!consented) {
		return {
			status: "unbound",
			signal,
			reason: "execution-not-consented",
			bindings: providerNotAvailableBindings("execution-not-consented"),
		};
	}

	return introspectProvider(
		options,
		signal,
		executablePath,
		options.executeProcess ?? runProviderProcess,
	);
}

function validateFallowEnvelopeSchema(
	capability: AnalysisCapability,
	payload: unknown,
): AnalysisFailure | undefined {
	const expectedSchemaVersions = FALLOW_VALIDATED_SCHEMA_VERSIONS[capability];
	const schemaVersionValue =
		typeof payload === "object" && payload !== null && !Array.isArray(payload)
			? (payload as Record<string, unknown>).schema_version
			: undefined;
	const actualSchemaVersion =
		typeof schemaVersionValue === "number" ? schemaVersionValue : undefined;
	if (
		expectedSchemaVersions.length === 0 &&
		actualSchemaVersion === undefined
	) {
		return undefined;
	}
	if (
		actualSchemaVersion !== undefined &&
		(expectedSchemaVersions as readonly number[]).includes(actualSchemaVersion)
	) {
		return undefined;
	}
	const expectedDescription =
		expectedSchemaVersions.length === 0
			? "no schema_version"
			: expectedSchemaVersions.join(" or ");
	return {
		kind: "unsupported-schema",
		message: `Fallow ${capability} returned schema_version ${String(actualSchemaVersion)}; expected ${expectedDescription}.`,
		providerDetails: {
			providerId: FALLOW_PROVIDER_ID,
			data: {
				capability,
				actualSchemaVersion,
				expectedSchemaVersions: [...expectedSchemaVersions],
			},
		},
	};
}
