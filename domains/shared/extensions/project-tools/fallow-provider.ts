import { createHash } from "node:crypto";
import {
	closeSync,
	fstatSync,
	openSync,
	readFileSync,
	realpathSync,
	type Stats,
	statSync,
} from "node:fs";
import {
	access,
	constants,
	open,
	readFile,
	realpath,
	stat,
} from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import {
	ANALYSIS_CAPABILITIES,
	type AnalysisAction,
	type AnalysisBinding,
	type AnalysisCapability,
	type AnalysisEvidence,
	type AnalysisFailure,
	type AnalysisFinding,
	type AnalysisFindingSeverity,
	type AnalysisFixProposal,
	type AnalysisGateCapability,
	type AnalysisGateCoverage,
	type AnalysisLocation,
	type AnalysisMetric,
	type AnalysisRequest,
	type AnalysisResult,
	type AnalysisScope,
	type AnalysisTraceEdge,
	type DetectedAnalysisCapability,
	type DetectedAnalysisProvider,
	type ProviderDetection,
	type ProviderIdentity,
	resolveAnalysisBindings,
	resolveAnalysisRequest,
} from "../../../../lib/analysis/index.ts";
import {
	readAnalysisExecutionAuthorization,
	readAnalysisExecutionAuthorizationSync,
} from "./analysis-consent.ts";
import { AnalysisProviderError } from "./analysis-provider-error.ts";
import {
	type ProviderProcessExecutor,
	type ProviderProcessOutcome,
	runProviderProcess,
} from "./process-runner.ts";
import {
	ProviderExecutionQueue,
	ProviderExecutionQueueAbortedError,
} from "./provider-execution-queue.ts";

const FALLOW_PROVIDER_ID = "fallow";
export const FALLOW_VALIDATED_ENGINE_VERSION = "2.54.2";
export const FALLOW_MAX_CONCURRENT_ANALYSES = 1;

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

const FALLOW_COMPLEXITY_METRICS_BY_EXCEEDED = {
	cyclomatic: ["cyclomatic"],
	cognitive: ["cognitive"],
	both: ["cyclomatic", "cognitive"],
	crap: ["crap"],
	cyclomatic_crap: ["cyclomatic", "crap"],
	cognitive_crap: ["cognitive", "crap"],
	all: ["cyclomatic", "cognitive", "crap"],
} as const satisfies Readonly<Record<string, readonly AnalysisMetric[]>>;

type FallowComplexityExceeded =
	keyof typeof FALLOW_COMPLEXITY_METRICS_BY_EXCEEDED;

function isFallowComplexityExceeded(
	value: string,
): value is FallowComplexityExceeded {
	return Object.hasOwn(FALLOW_COMPLEXITY_METRICS_BY_EXCEEDED, value);
}

type FallowSignalKind = "config" | "package";
type SupportedFallowPlatform = "darwin" | "linux" | "win32";
type SupportedFallowArchitecture = "arm64" | "x64";
type FallowLinuxLibc = "gnu" | "musl";

export type FallowExecutableResolutionKind =
	| "configured"
	| "package-native"
	| "injected";

interface InstalledFallowExecutableOptions {
	readonly projectRoot: string;
	readonly platform?: NodeJS.Platform;
	readonly architecture?: string;
	readonly linuxLibc?: FallowLinuxLibc;
}

interface FallowDetectionSignal {
	readonly kind: FallowSignalKind;
	readonly path: string;
}

interface FallowProviderRuntime {
	readonly provider: ProviderIdentity;
	readonly executablePath: string;
	readonly executableResolution: FallowExecutableResolutionKind;
	readonly executeProcess: ProviderProcessExecutor;
	readonly validateEnvelopeSchema: typeof validateFallowEnvelopeSchema;
	readonly currentBindings: () => Promise<readonly AnalysisBinding[]>;
	readonly execute: (
		request: AnalysisRequest,
		signal?: AbortSignal,
	) => Promise<AnalysisResult>;
	readonly dispose: (reason: unknown) => void;
}

interface FallowExecutableIdentity {
	readonly canonicalPath: string;
	readonly device: number;
	readonly inode: number;
	readonly mode: number;
	readonly size: number;
	readonly modifiedAtMs: number;
	readonly changedAtMs: number;
	readonly sha256: string;
}

interface FallowBindingIdentity {
	readonly canonicalProjectRoot: string;
	readonly executable: FallowExecutableIdentity;
}

interface ResolvedFallowExecutable {
	readonly executablePath: string;
	readonly resolutionKind: FallowExecutableResolutionKind;
}

type FallowSpawnPrecondition =
	| { readonly kind: "ready"; readonly configurationIdentity: string }
	| { readonly kind: "unbound"; readonly bindings: readonly AnalysisBinding[] }
	| {
			readonly kind: "failed";
			readonly failure: AnalysisFailure;
			readonly bindings: readonly AnalysisBinding[];
	  };

class FallowSpawnPreconditionError extends Error {
	readonly precondition: Exclude<FallowSpawnPrecondition, { kind: "ready" }>;

	constructor(
		precondition: Exclude<FallowSpawnPrecondition, { kind: "ready" }>,
	) {
		super("Fallow provider spawn preconditions are no longer satisfied.");
		this.name = "FallowSpawnPreconditionError";
		this.precondition = precondition;
	}
}

export class FallowBindingUnavailableError extends Error {
	readonly bindings: readonly AnalysisBinding[];

	constructor(bindings: readonly AnalysisBinding[]) {
		super("Fallow provider binding is no longer executable.");
		this.name = "FallowBindingUnavailableError";
		this.bindings = bindings;
	}
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
			readonly reason: "provider-not-installed";
			readonly bindings: readonly AnalysisBinding[];
	  }
	| {
			readonly status: "unbound";
			readonly signal: FallowDetectionSignal;
			readonly reason: "execution-not-consented";
			readonly executableResolution: FallowExecutableResolutionKind;
			readonly bindings: readonly AnalysisBinding[];
	  }
	| {
			readonly status: "failed";
			readonly signal: FallowDetectionSignal;
			readonly detection: Extract<ProviderDetection, { status: "failed" }>;
			readonly executableResolution?: FallowExecutableResolutionKind;
			readonly bindings: readonly AnalysisBinding[];
	  }
	| {
			readonly status: "detected";
			readonly signal: FallowDetectionSignal;
			readonly detection: Extract<ProviderDetection, { status: "detected" }>;
			readonly executableResolution: FallowExecutableResolutionKind;
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
	/** Injectable filesystem identity reader for deterministic race tests. */
	readonly captureExecutableIdentity?: (
		executablePath: string,
	) => Promise<FallowExecutableIdentity>;
	/** Injectable synchronous consent reader for final-validation race tests. */
	readonly readExecutionAuthorizationSync?: typeof readAnalysisExecutionAuthorizationSync;
	/** Session-owned cancellation for version/config discovery subprocesses. */
	readonly signal?: AbortSignal;
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

function providerFailedBindings(
	failure: AnalysisFailure,
): readonly AnalysisBinding[] {
	return ANALYSIS_CAPABILITIES.map((capability) => ({
		state: "failed",
		capability,
		providerId: FALLOW_PROVIDER_ID,
		failure,
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

async function executableExistsForPlatform(
	path: string,
	platform: NodeJS.Platform,
): Promise<boolean> {
	try {
		if (!(await stat(path)).isFile()) return false;
		await access(path, platform === "win32" ? constants.F_OK : constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

function configuredPath(projectRoot: string, path: string): string {
	return isAbsolute(path) ? path : resolve(projectRoot, path);
}

function supportedFallowPlatform(
	platform: NodeJS.Platform,
): SupportedFallowPlatform | null {
	switch (platform) {
		case "darwin":
		case "linux":
		case "win32":
			return platform;
		default:
			return null;
	}
}

function supportedFallowArchitecture(
	architecture: string,
): SupportedFallowArchitecture | null {
	return architecture === "arm64" || architecture === "x64"
		? architecture
		: null;
}

function currentLinuxLibc(): FallowLinuxLibc {
	const report = process.report?.getReport() as
		| { readonly header?: Readonly<Record<string, unknown>> }
		| undefined;
	const header =
		typeof report === "object" && report !== null ? report.header : undefined;
	return typeof header?.glibcVersionRuntime === "string" ? "gnu" : "musl";
}

export function fallowPlatformPackageName(options: {
	readonly platform: NodeJS.Platform;
	readonly architecture: string;
	readonly linuxLibc?: FallowLinuxLibc;
}): string | null {
	const platform = supportedFallowPlatform(options.platform);
	const architecture = supportedFallowArchitecture(options.architecture);
	if (platform === null || architecture === null) return null;
	if (platform === "linux") {
		return `@fallow-cli/linux-${architecture}-${
			options.linuxLibc ?? currentLinuxLibc()
		}`;
	}
	if (platform === "win32") {
		return `@fallow-cli/win32-${architecture}-msvc`;
	}
	return `@fallow-cli/darwin-${architecture}`;
}

interface PackageRecord {
	readonly name?: unknown;
	readonly version?: unknown;
	readonly optionalDependencies?: unknown;
}

async function readPackageRecord(path: string): Promise<PackageRecord | null> {
	try {
		const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
		return typeof parsed === "object" &&
			parsed !== null &&
			!Array.isArray(parsed)
			? (parsed as PackageRecord)
			: null;
	} catch {
		return null;
	}
}

/**
 * Resolve the platform package's native analyzer without invoking the npm shim
 * or consulting PATH, global installations, or a mutable package fetch.
 */
export async function resolveInstalledFallowExecutable(
	options: InstalledFallowExecutableOptions,
): Promise<string | null> {
	const platform = options.platform ?? process.platform;
	const platformPackage = fallowPlatformPackageName({
		platform,
		architecture: options.architecture ?? process.arch,
		linuxLibc: options.linuxLibc,
	});
	if (platformPackage === null) return null;

	const projectRoot = resolve(options.projectRoot);
	const fallowPackage = await readPackageRecord(
		join(projectRoot, "node_modules", "fallow", "package.json"),
	);
	if (
		fallowPackage?.name !== FALLOW_PROVIDER_ID ||
		typeof fallowPackage.version !== "string" ||
		typeof fallowPackage.optionalDependencies !== "object" ||
		fallowPackage.optionalDependencies === null ||
		Array.isArray(fallowPackage.optionalDependencies)
	) {
		return null;
	}
	const declaredPlatformVersion = (
		fallowPackage.optionalDependencies as Readonly<Record<string, unknown>>
	)[platformPackage];
	if (declaredPlatformVersion !== fallowPackage.version) return null;

	const platformPackagePath = join(
		projectRoot,
		"node_modules",
		...platformPackage.split("/"),
	);
	const platformPackageRecord = await readPackageRecord(
		join(platformPackagePath, "package.json"),
	);
	if (
		platformPackageRecord?.name !== platformPackage ||
		platformPackageRecord.version !== fallowPackage.version
	) {
		return null;
	}
	const executablePath = join(
		platformPackagePath,
		platform === "win32" ? "fallow.exe" : "fallow",
	);
	return (await executableExistsForPlatform(executablePath, platform))
		? executablePath
		: null;
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
): Promise<ResolvedFallowExecutable | null> {
	const projectRoot = resolve(options.projectRoot);
	const configuredExecutable =
		options.configuredExecutablePath === undefined
			? undefined
			: configuredPath(projectRoot, options.configuredExecutablePath);
	if (
		configuredExecutable !== undefined &&
		(await executableExists(configuredExecutable))
	) {
		return {
			executablePath: configuredExecutable,
			resolutionKind: "configured",
		};
	}

	const installedExecutable = await resolveInstalledFallowExecutable({
		projectRoot,
	});
	if (installedExecutable !== null) {
		return {
			executablePath: installedExecutable,
			resolutionKind: "package-native",
		};
	}

	const injectedExecutable =
		options.injectedExecutablePath === undefined
			? undefined
			: resolve(options.injectedExecutablePath);
	if (
		injectedExecutable !== undefined &&
		(await executableExists(injectedExecutable))
	) {
		return {
			executablePath: injectedExecutable,
			resolutionKind: "injected",
		};
	}
	return null;
}

function sameFileStats(left: Stats, right: Stats): boolean {
	return (
		left.dev === right.dev &&
		left.ino === right.ino &&
		left.mode === right.mode &&
		left.size === right.size &&
		left.mtimeMs === right.mtimeMs &&
		left.ctimeMs === right.ctimeMs
	);
}

function captureExecutableIdentitySync(
	executablePath: string,
): FallowExecutableIdentity {
	const canonicalPath = realpathSync(executablePath);
	const descriptor = openSync(canonicalPath, "r");
	try {
		const before = fstatSync(descriptor);
		const contents = readFileSync(descriptor);
		const after = fstatSync(descriptor);
		const currentCanonicalPath = realpathSync(executablePath);
		const current = statSync(currentCanonicalPath);
		if (
			canonicalPath !== currentCanonicalPath ||
			!sameFileStats(before, after) ||
			!sameFileStats(after, current)
		) {
			throw new Error("Executable changed while its identity was captured.");
		}
		return {
			canonicalPath,
			device: after.dev,
			inode: after.ino,
			mode: after.mode,
			size: after.size,
			modifiedAtMs: after.mtimeMs,
			changedAtMs: after.ctimeMs,
			sha256: createHash("sha256").update(contents).digest("hex"),
		};
	} finally {
		closeSync(descriptor);
	}
}

function isMissingFileError(error: unknown): boolean {
	return (
		error instanceof Error &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === "ENOENT"
	);
}

/**
 * Identity of the locally readable Fallow configuration signals.
 *
 * This detects a change to the canonical signal files themselves. It is not a
 * complete account of the resolved configuration: Fallow resolves `extends`
 * from relative paths, `npm:` packages, and `https://` URLs, and also accepts
 * configuration in package.json. Nothing derives a coverage claim from this
 * value, so that incompleteness cannot become a gate passing without evidence
 * (D-032).
 */
function captureConfigurationIdentitySync(projectRoot: string): string {
	const identity = createHash("sha256");
	for (const signal of FALLOW_CANONICAL_SIGNALS) {
		const configPath = join(projectRoot, signal);
		let descriptor: number;
		try {
			descriptor = openSync(configPath, "r");
		} catch (error) {
			if (!isMissingFileError(error)) throw error;
			identity.update(`${signal}\0missing\0`);
			continue;
		}
		try {
			const before = fstatSync(descriptor);
			if (!before.isFile()) {
				throw new Error(`${configPath} is not a regular file.`);
			}
			const contents = readFileSync(descriptor);
			const after = fstatSync(descriptor);
			const canonicalPath = realpathSync(configPath);
			const current = statSync(canonicalPath);
			if (!sameFileStats(before, after) || !sameFileStats(after, current)) {
				throw new Error("Fallow configuration changed while it was captured.");
			}
			identity.update(`${signal}\0file\0${canonicalPath}\0`);
			identity.update(contents);
			identity.update("\0");
		} finally {
			closeSync(descriptor);
		}
	}
	return identity.digest("hex");
}

async function captureExecutableIdentity(
	executablePath: string,
): Promise<FallowExecutableIdentity> {
	const canonicalPath = await realpath(executablePath);
	const handle = await open(canonicalPath, "r");
	try {
		const before = await handle.stat();
		const contents = await handle.readFile();
		const after = await handle.stat();
		const currentCanonicalPath = await realpath(executablePath);
		const current = await stat(currentCanonicalPath);
		if (
			canonicalPath !== currentCanonicalPath ||
			!sameFileStats(before, after) ||
			!sameFileStats(after, current)
		) {
			throw new Error("Executable changed while its identity was captured.");
		}
		return {
			canonicalPath,
			device: after.dev,
			inode: after.ino,
			mode: after.mode,
			size: after.size,
			modifiedAtMs: after.mtimeMs,
			changedAtMs: after.ctimeMs,
			sha256: createHash("sha256").update(contents).digest("hex"),
		};
	} finally {
		await handle.close();
	}
}

function sameExecutableIdentity(
	left: FallowExecutableIdentity,
	right: FallowExecutableIdentity,
): boolean {
	return (
		left.canonicalPath === right.canonicalPath &&
		left.device === right.device &&
		left.inode === right.inode &&
		left.mode === right.mode &&
		left.size === right.size &&
		left.modifiedAtMs === right.modifiedAtMs &&
		left.changedAtMs === right.changedAtMs &&
		left.sha256 === right.sha256
	);
}

function bindingIdentityFailure(
	reason: "project-identity-changed" | "provider-executable-identity-changed",
	message: string,
): AnalysisFailure {
	return {
		kind: "invalid-config",
		message,
		process: { reason },
		providerDetails: {
			providerId: FALLOW_PROVIDER_ID,
			data: { reason },
		},
	};
}

function configurationIdentityFailure(message: string): AnalysisFailure {
	const reason = "provider-configuration-changed";
	return {
		kind: "invalid-config",
		message,
		process: { reason },
		providerDetails: {
			providerId: FALLOW_PROVIDER_ID,
			data: { reason },
		},
	};
}

function validateSpawnPreconditions(options: {
	readonly projectRoot: string;
	readonly userStateRoot?: string;
	readonly executablePath: string;
	readonly bindingIdentity: FallowBindingIdentity;
	readonly expectedConfigurationIdentity?: string;
	readonly readExecutionAuthorizationSync: typeof readAnalysisExecutionAuthorizationSync;
}): FallowSpawnPrecondition {
	/*
	 * This is intentionally one synchronous final validation. Turning any check
	 * back into an await recreates the stale-precondition cycle. Node cannot make
	 * these filesystem reads and a path-based spawn OS-atomic, so a mutation after
	 * this callback remains outside the guarantee.
	 */
	const authorization = options.readExecutionAuthorizationSync({
		projectRoot: options.projectRoot,
		providerId: FALLOW_PROVIDER_ID,
		userStateRoot: options.userStateRoot,
	});
	let currentExecutable: FallowExecutableIdentity;
	try {
		currentExecutable = captureExecutableIdentitySync(options.executablePath);
	} catch {
		const failure = bindingIdentityFailure(
			"provider-executable-identity-changed",
			"Fallow executable identity could not be revalidated after provider introspection.",
		);
		return {
			kind: "failed",
			failure,
			bindings: providerFailedBindings(failure),
		};
	}
	if (
		!sameExecutableIdentity(
			currentExecutable,
			options.bindingIdentity.executable,
		)
	) {
		const failure = bindingIdentityFailure(
			"provider-executable-identity-changed",
			"Fallow executable identity changed after provider introspection.",
		);
		return {
			kind: "failed",
			failure,
			bindings: providerFailedBindings(failure),
		};
	}

	if (
		authorization !== null &&
		authorization.canonicalProjectRoot !==
			options.bindingIdentity.canonicalProjectRoot
	) {
		const failure = bindingIdentityFailure(
			"project-identity-changed",
			"Fallow project identity changed after provider introspection.",
		);
		return {
			kind: "failed",
			failure,
			bindings: providerFailedBindings(failure),
		};
	}
	if (authorization?.consented !== true) {
		return {
			kind: "unbound",
			bindings: providerNotAvailableBindings("execution-not-consented"),
		};
	}

	let configurationIdentity: string;
	try {
		configurationIdentity = captureConfigurationIdentitySync(
			options.bindingIdentity.canonicalProjectRoot,
		);
	} catch {
		const failure = configurationIdentityFailure(
			"Fallow configuration identity could not be established before provider execution.",
		);
		return {
			kind: "failed",
			failure,
			bindings: providerFailedBindings(failure),
		};
	}
	if (
		options.expectedConfigurationIdentity !== undefined &&
		configurationIdentity !== options.expectedConfigurationIdentity
	) {
		const failure = configurationIdentityFailure(
			"Fallow configuration changed after provider introspection.",
		);
		return {
			kind: "failed",
			failure,
			bindings: providerFailedBindings(failure),
		};
	}
	return { kind: "ready", configurationIdentity };
}

function finalSpawnPrecondition(options: {
	readonly projectRoot: string;
	readonly userStateRoot?: string;
	readonly executablePath: string;
	readonly bindingIdentity: FallowBindingIdentity;
	readonly expectedConfigurationIdentity?: string;
	readonly readExecutionAuthorizationSync: typeof readAnalysisExecutionAuthorizationSync;
}): () => void {
	return () => {
		const precondition = validateSpawnPreconditions(options);
		if (precondition.kind !== "ready") {
			throw new FallowSpawnPreconditionError(precondition);
		}
	};
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
	if (outcome.kind === "termination-error") {
		const initiatingReason =
			outcome.initiated.kind === "timeout"
				? outcome.initiated.reason
				: outcome.initiated.reason instanceof Error
					? outcome.initiated.reason.message
					: String(outcome.initiated.reason);
		return {
			kind: "spawn-error",
			message: `Fallow ${operation} process-tree cleanup failed after ${outcome.initiated.kind}: ${outcome.error.message}`,
			process: {
				reason: `${outcome.error.code}: ${initiatingReason}`,
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
	hasConfiguredBoundaries: boolean,
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
		hasConfiguredBoundaries
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
			traceTargets: [
				{ kind: "symbol", path: "required" },
				{ kind: "file" },
				{ kind: "dependency" },
				{ kind: "duplicate-location", line: "required" },
			],
		},
		{
			capability: "fix-preview",
			status: "supported",
			scopes: ["project"],
		},
	];
}

function failedDiscovery(
	signal: FallowDetectionSignal,
	failure: AnalysisFailure,
	executableResolution?: FallowExecutableResolutionKind,
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
		...(executableResolution === undefined ? {} : { executableResolution }),
		bindings: resolveAnalysisBindings({ detections: [detection] }),
	};
}

function abortedDiscovery(
	detectionSignal: FallowDetectionSignal,
	operation: string,
	abortSignal: AbortSignal,
	outcome?: ProviderProcessOutcome,
	executableResolution?: FallowExecutableResolutionKind,
): FallowProviderDiscovery {
	return failedDiscovery(
		detectionSignal,
		processFailure(operation, {
			kind: "aborted",
			reason: abortSignal.reason,
			stdout: outcome?.stdout ?? "",
			stderr: outcome?.stderr ?? "",
		}),
		executableResolution,
	);
}

function combinedAbortSignal(signals: readonly (AbortSignal | undefined)[]): {
	readonly signal?: AbortSignal;
	readonly dispose: () => void;
} {
	const present = signals.filter(
		(signal): signal is AbortSignal => signal !== undefined,
	);
	if (present.length === 0) {
		return { dispose: () => undefined };
	}
	if (present.length === 1) {
		return { signal: present[0], dispose: () => undefined };
	}

	const controller = new AbortController();
	const listeners = new Map<AbortSignal, () => void>();
	const dispose = (): void => {
		for (const [signal, listener] of listeners) {
			signal.removeEventListener("abort", listener);
		}
		listeners.clear();
	};
	for (const signal of present) {
		if (signal.aborted) {
			controller.abort(signal.reason);
			break;
		}
		const listener = (): void => {
			if (!controller.signal.aborted) controller.abort(signal.reason);
			dispose();
		};
		listeners.set(signal, listener);
		signal.addEventListener("abort", listener, { once: true });
	}
	return { signal: controller.signal, dispose };
}

function abortedExecution(reason: unknown): AnalysisFailure {
	const message = reason instanceof Error ? reason.message : String(reason);
	return {
		kind: "aborted",
		message: "Fallow analysis execution was aborted.",
		process: { reason: message },
	};
}

function discoveryFromSpawnPrecondition(
	detectionSignal: FallowDetectionSignal,
	precondition: FallowSpawnPrecondition,
	executableResolution: FallowExecutableResolutionKind,
): FallowProviderDiscovery | undefined {
	if (precondition.kind === "ready") return undefined;
	if (precondition.kind === "failed") {
		return failedDiscovery(
			detectionSignal,
			precondition.failure,
			executableResolution,
		);
	}
	return {
		status: "unbound",
		signal: detectionSignal,
		reason: "execution-not-consented",
		executableResolution,
		bindings: precondition.bindings,
	};
}

async function introspectProvider(
	options: DiscoverFallowProviderOptions,
	detectionSignal: FallowDetectionSignal,
	executablePath: string,
	bindingIdentity: FallowBindingIdentity,
	executeProcess: ProviderProcessExecutor,
	executableResolution: FallowExecutableResolutionKind,
): Promise<FallowProviderDiscovery> {
	const spawnPreconditionOptions = {
		projectRoot: options.projectRoot,
		userStateRoot: options.userStateRoot,
		executablePath,
		bindingIdentity,
		readExecutionAuthorizationSync:
			options.readExecutionAuthorizationSync ??
			readAnalysisExecutionAuthorizationSync,
	} as const;
	const beforeSpawn = finalSpawnPrecondition(spawnPreconditionOptions);
	if (options.signal?.aborted) {
		return abortedDiscovery(
			detectionSignal,
			"version",
			options.signal,
			undefined,
			executableResolution,
		);
	}
	const versionPrecondition = discoveryFromSpawnPrecondition(
		detectionSignal,
		validateSpawnPreconditions(spawnPreconditionOptions),
		executableResolution,
	);
	if (versionPrecondition !== undefined) return versionPrecondition;
	if (options.signal?.aborted) {
		return abortedDiscovery(
			detectionSignal,
			"version",
			options.signal,
			undefined,
			executableResolution,
		);
	}
	let versionOutcome: ProviderProcessOutcome;
	try {
		versionOutcome = await executeProcess(
			{
				executablePath: bindingIdentity.executable.canonicalPath,
				args: ["--version", "--no-cache"],
				cwd: options.projectRoot,
			},
			options.signal,
			{ beforeSpawn },
		);
	} catch (error) {
		if (error instanceof FallowSpawnPreconditionError) {
			const discovery = discoveryFromSpawnPrecondition(
				detectionSignal,
				error.precondition,
				executableResolution,
			);
			if (discovery !== undefined) return discovery;
		}
		throw error;
	}
	if (options.signal?.aborted) {
		return abortedDiscovery(
			detectionSignal,
			"version",
			options.signal,
			versionOutcome,
			executableResolution,
		);
	}
	if (versionOutcome.kind !== "code-exit" || versionOutcome.code !== 0) {
		return failedDiscovery(
			detectionSignal,
			processFailure("version", versionOutcome),
			executableResolution,
		);
	}
	const version = parseVersion(versionOutcome.stdout);
	if (version === null) {
		return failedDiscovery(
			detectionSignal,
			invalidOutput("version", "expected `fallow <version>`"),
			executableResolution,
		);
	}

	const configSpawnPrecondition = validateSpawnPreconditions(
		spawnPreconditionOptions,
	);
	const configPrecondition = discoveryFromSpawnPrecondition(
		detectionSignal,
		configSpawnPrecondition,
		executableResolution,
	);
	if (configPrecondition !== undefined) return configPrecondition;
	if (options.signal?.aborted) {
		return abortedDiscovery(
			detectionSignal,
			"config",
			options.signal,
			undefined,
			executableResolution,
		);
	}
	let configOutcome: ProviderProcessOutcome;
	try {
		configOutcome = await executeProcess(
			{
				executablePath: bindingIdentity.executable.canonicalPath,
				args: ["config", "--format", "json", "--quiet", "--no-cache"],
				cwd: options.projectRoot,
			},
			options.signal,
			{ beforeSpawn },
		);
	} catch (error) {
		if (error instanceof FallowSpawnPreconditionError) {
			const discovery = discoveryFromSpawnPrecondition(
				detectionSignal,
				error.precondition,
				executableResolution,
			);
			if (discovery !== undefined) return discovery;
		}
		throw error;
	}
	if (options.signal?.aborted) {
		return abortedDiscovery(
			detectionSignal,
			"config",
			options.signal,
			configOutcome,
			executableResolution,
		);
	}
	let config: FallowConfig | null;
	if (configOutcome.kind === "code-exit" && configOutcome.code === 3) {
		config = null;
	} else if (configOutcome.kind === "code-exit" && configOutcome.code === 0) {
		config = parseConfig(configOutcome.stdout);
		if (config === null) {
			return failedDiscovery(
				detectionSignal,
				invalidOutput("config", "expected a JSON object after any preamble"),
				executableResolution,
			);
		}
	} else {
		return failedDiscovery(
			detectionSignal,
			processFailure("config", configOutcome),
			executableResolution,
		);
	}
	const configCompletionPrecondition = validateSpawnPreconditions(
		spawnPreconditionOptions,
	);
	const configCompletionFailure = discoveryFromSpawnPrecondition(
		detectionSignal,
		configCompletionPrecondition,
		executableResolution,
	);
	if (configCompletionFailure !== undefined) return configCompletionFailure;
	if (
		configSpawnPrecondition.kind !== "ready" ||
		configCompletionPrecondition.kind !== "ready" ||
		configSpawnPrecondition.configurationIdentity !==
			configCompletionPrecondition.configurationIdentity
	) {
		return failedDiscovery(
			detectionSignal,
			configurationIdentityFailure(
				"Fallow configuration changed during provider introspection.",
			),
			executableResolution,
		);
	}
	const expectedConfigurationIdentity =
		configCompletionPrecondition.configurationIdentity;

	const provider = {
		id: FALLOW_PROVIDER_ID,
		name: "Fallow",
		version,
	} as const;
	const hasConfiguredBoundaries = boundariesConfigured(config);
	const detectedProvider: DetectedAnalysisProvider = {
		provider,
		capabilities: capabilities(hasConfiguredBoundaries),
	};
	const detection = {
		status: "detected",
		provider: detectedProvider,
	} as const;
	const runtimeBase = {
		provider,
		executablePath,
		executableResolution,
		executeProcess,
		validateEnvelopeSchema: validateFallowEnvelopeSchema,
	};
	const resolvedBindings = resolveAnalysisBindings({ detections: [detection] });
	const executionQueue = new ProviderExecutionQueue(
		FALLOW_MAX_CONCURRENT_ANALYSES,
	);
	const lifecycleController = new AbortController();
	const executionPreconditionOptions = {
		...spawnPreconditionOptions,
		expectedConfigurationIdentity,
	};
	const executionRuntime = {
		...runtimeBase,
		executablePath: bindingIdentity.executable.canonicalPath,
		projectRoot: options.projectRoot,
		beforeSpawn: finalSpawnPrecondition(executionPreconditionOptions),
	};
	let invalidatedFailure: AnalysisFailure | undefined;
	const currentBindings = async (): Promise<readonly AnalysisBinding[]> => {
		if (invalidatedFailure !== undefined) {
			return providerFailedBindings(invalidatedFailure);
		}
		const precondition = validateSpawnPreconditions(
			executionPreconditionOptions,
		);
		if (precondition.kind === "failed") {
			invalidatedFailure = precondition.failure;
			if (!lifecycleController.signal.aborted) {
				lifecycleController.abort(precondition.failure);
			}
			executionQueue.close(precondition.failure);
			return precondition.bindings;
		}
		return precondition.kind === "unbound"
			? precondition.bindings
			: resolvedBindings;
	};
	return {
		status: "detected",
		signal: detectionSignal,
		detection,
		executableResolution,
		bindings: resolvedBindings,
		runtime: {
			...runtimeBase,
			currentBindings,
			execute: async (request, abortSignal) => {
				const combined = combinedAbortSignal([
					abortSignal,
					lifecycleController.signal,
				]);
				try {
					return await executionQueue.run(async () => {
						const liveBindings = await currentBindings();
						const liveResolution = resolveAnalysisRequest(
							liveBindings,
							request,
						);
						if (liveResolution.kind !== "ready") {
							throw new FallowBindingUnavailableError(liveBindings);
						}
						if (combined.signal?.aborted) {
							return providerFailure(
								executionRuntime,
								request.capability,
								abortedExecution(combined.signal.reason),
							);
						}
						try {
							return await executeFallowCapability(
								executionRuntime,
								request,
								combined.signal,
							);
						} catch (error) {
							if (error instanceof FallowSpawnPreconditionError) {
								if (error.precondition.kind === "failed") {
									invalidatedFailure = error.precondition.failure;
									if (!lifecycleController.signal.aborted) {
										lifecycleController.abort(error.precondition.failure);
									}
									executionQueue.close(error.precondition.failure);
								}
								throw new FallowBindingUnavailableError(
									error.precondition.bindings,
								);
							}
							throw error;
						}
					}, combined.signal);
				} catch (error) {
					if (error instanceof ProviderExecutionQueueAbortedError) {
						return providerFailure(
							executionRuntime,
							request.capability,
							abortedExecution(error.reason),
						);
					}
					throw error;
				} finally {
					combined.dispose();
				}
			},
			dispose: (reason) => {
				if (!lifecycleController.signal.aborted) {
					lifecycleController.abort(reason);
				}
				executionQueue.close(reason);
			},
		},
	};
}

export async function discoverFallowProvider(
	options: DiscoverFallowProviderOptions,
): Promise<FallowProviderDiscovery> {
	let initialCanonicalProjectRoot: string | undefined;
	try {
		initialCanonicalProjectRoot = await realpath(resolve(options.projectRoot));
	} catch {
		initialCanonicalProjectRoot = undefined;
	}
	const detectionSignal = await detectFallowSignal(options.projectRoot);
	if (detectionSignal === null) {
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
	if (options.signal?.aborted) {
		return abortedDiscovery(detectionSignal, "discovery", options.signal);
	}

	const resolvedExecutable = await resolveFallowExecutable(options);
	if (resolvedExecutable === null) {
		return {
			status: "unbound",
			signal: detectionSignal,
			reason: "provider-not-installed",
			bindings: providerNotAvailableBindings("provider-not-installed"),
		};
	}
	if (options.signal?.aborted) {
		return abortedDiscovery(
			detectionSignal,
			"discovery",
			options.signal,
			undefined,
			resolvedExecutable.resolutionKind,
		);
	}

	const authorization = await readAnalysisExecutionAuthorization({
		projectRoot: options.projectRoot,
		providerId: FALLOW_PROVIDER_ID,
		userStateRoot: options.userStateRoot,
	});
	if (options.signal?.aborted) {
		return abortedDiscovery(
			detectionSignal,
			"discovery",
			options.signal,
			undefined,
			resolvedExecutable.resolutionKind,
		);
	}
	if (authorization?.consented !== true) {
		return {
			status: "unbound",
			signal: detectionSignal,
			reason: "execution-not-consented",
			executableResolution: resolvedExecutable.resolutionKind,
			bindings: providerNotAvailableBindings("execution-not-consented"),
		};
	}
	if (
		initialCanonicalProjectRoot === undefined ||
		authorization.canonicalProjectRoot !== initialCanonicalProjectRoot
	) {
		return failedDiscovery(
			detectionSignal,
			bindingIdentityFailure(
				"project-identity-changed",
				"Fallow project identity changed during provider discovery.",
			),
			resolvedExecutable.resolutionKind,
		);
	}

	let executableIdentity: FallowExecutableIdentity;
	try {
		executableIdentity = await (
			options.captureExecutableIdentity ?? captureExecutableIdentity
		)(resolvedExecutable.executablePath);
	} catch {
		return failedDiscovery(
			detectionSignal,
			bindingIdentityFailure(
				"provider-executable-identity-changed",
				"Fallow executable identity could not be established before provider introspection.",
			),
			resolvedExecutable.resolutionKind,
		);
	}
	const bindingIdentity: FallowBindingIdentity = {
		canonicalProjectRoot: authorization.canonicalProjectRoot,
		executable: executableIdentity,
	};

	return introspectProvider(
		options,
		detectionSignal,
		resolvedExecutable.executablePath,
		bindingIdentity,
		options.executeProcess ?? runProviderProcess,
		resolvedExecutable.resolutionKind,
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

interface FallowExecutionRuntime {
	readonly projectRoot: string;
	readonly provider: ProviderIdentity;
	readonly executablePath: string;
	readonly executeProcess: ProviderProcessExecutor;
	readonly beforeSpawn: () => void;
	readonly validateEnvelopeSchema: typeof validateFallowEnvelopeSchema;
}

const FALLOW_JSON_ARGS = ["--format", "json", "--quiet", "--no-cache"] as const;

const DEAD_CODE_COLLECTIONS = [
	"unused_files",
	"unused_exports",
	"unused_types",
	"unused_dependencies",
	"unused_dev_dependencies",
	"unused_optional_dependencies",
	"unused_enum_members",
	"unused_class_members",
	"unresolved_imports",
	"unlisted_dependencies",
	"duplicate_exports",
	"type_only_dependencies",
	"test_only_dependencies",
	"circular_dependencies",
	"boundary_violations",
	"stale_suppressions",
] as const;

function objectRecord(
	value: unknown,
): Readonly<Record<string, unknown>> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Readonly<Record<string, unknown>>)
		: null;
}

function stringValue(
	record: Readonly<Record<string, unknown>>,
	key: string,
): string | undefined {
	const value = record[key];
	return typeof value === "string" ? value : undefined;
}

function numberValue(
	record: Readonly<Record<string, unknown>>,
	key: string,
): number | undefined {
	const value = record[key];
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function requiredArray(
	record: Readonly<Record<string, unknown>>,
	key: string,
): readonly unknown[] {
	const value = record[key];
	if (!Array.isArray(value)) {
		throw new Error(`expected ${key} to be an array`);
	}
	return value;
}

function providerDetails(data: Readonly<Record<string, unknown>>): {
	readonly providerId: typeof FALLOW_PROVIDER_ID;
	readonly data: Readonly<Record<string, unknown>>;
} {
	return { providerId: FALLOW_PROVIDER_ID, data };
}

function normalizeActions(
	record: Readonly<Record<string, unknown>>,
): readonly AnalysisAction[] {
	if (record.actions === undefined) return [];
	if (!Array.isArray(record.actions)) {
		throw new Error("expected finding actions to be an array");
	}
	return record.actions.map((value, index) => {
		const action = objectRecord(value);
		if (action === null) {
			throw new Error(`expected action ${index} to be an object`);
		}
		const description = stringValue(action, "description");
		if (description === undefined || description.trim().length === 0) {
			throw new Error(`expected action ${index} to carry a description`);
		}
		return {
			description,
			providerDetails: providerDetails(action),
		};
	});
}

function findingLocations(
	record: Readonly<Record<string, unknown>>,
): readonly AnalysisLocation[] {
	const path =
		stringValue(record, "path") ??
		stringValue(record, "file") ??
		stringValue(record, "from_path");
	if (path === undefined) return [];
	const line = numberValue(record, "line") ?? numberValue(record, "start_line");
	const column = numberValue(record, "col") ?? numberValue(record, "start_col");
	const endLine = numberValue(record, "end_line");
	const endColumn = numberValue(record, "end_col");
	return [
		{
			path,
			...(line === undefined ? {} : { line }),
			...(column === undefined ? {} : { column }),
			...(endLine === undefined ? {} : { endLine }),
			...(endColumn === undefined ? {} : { endColumn }),
		},
	];
}

function findingSeverity(
	record: Readonly<Record<string, unknown>>,
): AnalysisFindingSeverity {
	switch (stringValue(record, "severity")) {
		case "critical":
		case "high":
		case "error":
			return "error";
		case "moderate":
		case "warning":
		case "warn":
			return "warning";
		case "info":
			return "info";
		default:
			return "unknown";
	}
}

function findingSubject(
	record: Readonly<Record<string, unknown>>,
): string | undefined {
	return (
		stringValue(record, "export_name") ??
		stringValue(record, "name") ??
		stringValue(record, "dependency") ??
		stringValue(record, "package") ??
		stringValue(record, "path") ??
		stringValue(record, "from_path")
	);
}

function collectionLabel(collection: string): string {
	return collection.replaceAll("_", " ");
}

function normalizeDeadCodeFindings(
	payload: Readonly<Record<string, unknown>>,
	idPrefix: string,
): readonly AnalysisFinding[] {
	const totalIssues = numberValue(payload, "total_issues");
	if (totalIssues === undefined || !Number.isInteger(totalIssues)) {
		throw new Error("expected dead-code total_issues to be an integer");
	}
	const findings: AnalysisFinding[] = [];
	for (const collection of DEAD_CODE_COLLECTIONS) {
		for (const [index, value] of requiredArray(payload, collection).entries()) {
			const finding = objectRecord(value);
			if (finding === null) {
				throw new Error(`expected ${collection}[${index}] to be an object`);
			}
			const subject = findingSubject(finding);
			findings.push({
				id: `${idPrefix}:${collection}:${index}`,
				category:
					collection === "boundary_violations"
						? "boundary-conformance"
						: "dead-code",
				severity: findingSeverity(finding),
				message: `${collectionLabel(collection)}${
					subject === undefined ? "" : `: ${subject}`
				}`,
				locations: findingLocations(finding),
				actions: normalizeActions(finding),
				providerDetails: providerDetails(finding),
			});
		}
	}
	if (findings.length !== totalIssues) {
		throw new Error(
			`dead-code total_issues ${totalIssues} does not match ${findings.length} findings`,
		);
	}
	return findings;
}

function normalizeDuplicationFindings(
	payload: Readonly<Record<string, unknown>>,
	idPrefix: string,
): readonly AnalysisFinding[] {
	return requiredArray(payload, "clone_groups").map((value, index) => {
		const group = objectRecord(value);
		if (group === null) {
			throw new Error(`expected clone_groups[${index}] to be an object`);
		}
		const instances = requiredArray(group, "instances");
		const locations = instances.map((instanceValue, instanceIndex) => {
			const instance = objectRecord(instanceValue);
			if (instance === null) {
				throw new Error(
					`expected clone_groups[${index}].instances[${instanceIndex}] to be an object`,
				);
			}
			const [location] = findingLocations(instance);
			if (location === undefined) {
				throw new Error(
					`expected clone_groups[${index}].instances[${instanceIndex}] to carry a file`,
				);
			}
			return location;
		});
		const lineCount = numberValue(group, "line_count");
		return {
			id: `${idPrefix}:clone_groups:${index}`,
			category: "duplication",
			severity: findingSeverity(group),
			message: `duplicated code${
				lineCount === undefined ? "" : `: ${lineCount} lines`
			} across ${instances.length} instances`,
			locations,
			actions: normalizeActions(group),
			providerDetails: providerDetails(group),
		};
	});
}

function normalizeComplexityFindings(
	payload: Readonly<Record<string, unknown>>,
	idPrefix: string,
	metric?: AnalysisMetric,
): readonly AnalysisFinding[] {
	const findings: AnalysisFinding[] = [];
	for (const [index, value] of requiredArray(payload, "findings").entries()) {
		const finding = objectRecord(value);
		if (finding === null) {
			throw new Error(`expected findings[${index}] to be an object`);
		}
		if (metric !== undefined) {
			const exceeded = stringValue(finding, "exceeded");
			if (exceeded === undefined || !isFallowComplexityExceeded(exceeded)) {
				throw new Error(
					`expected findings[${index}].exceeded to identify supported metrics`,
				);
			}
			const applicableMetrics: readonly AnalysisMetric[] =
				FALLOW_COMPLEXITY_METRICS_BY_EXCEEDED[exceeded];
			if (!applicableMetrics.includes(metric)) {
				continue;
			}
		}
		const subject = findingSubject(finding);
		findings.push({
			id: `${idPrefix}:findings:${index}`,
			category: "complexity",
			severity: findingSeverity(finding),
			message: `complexity threshold exceeded${
				subject === undefined ? "" : `: ${subject}`
			}`,
			locations: findingLocations(finding),
			actions: normalizeActions(finding),
			providerDetails: providerDetails(finding),
		});
	}
	return findings;
}

function normalizeBoundaryFindings(
	payload: Readonly<Record<string, unknown>>,
	idPrefix: string,
): readonly AnalysisFinding[] {
	const totalIssues = numberValue(payload, "total_issues");
	const values = requiredArray(payload, "boundary_violations");
	if (totalIssues === undefined || totalIssues !== values.length) {
		throw new Error(
			"expected boundary total_issues to match boundary_violations",
		);
	}
	return values.map((value, index) => {
		const finding = objectRecord(value);
		if (finding === null) {
			throw new Error(`expected boundary_violations[${index}] to be an object`);
		}
		const fromPath = stringValue(finding, "from_path");
		const toPath = stringValue(finding, "to_path");
		return {
			id: `${idPrefix}:boundary_violations:${index}`,
			category: "boundary-conformance",
			severity: findingSeverity(finding),
			message: `boundary violation${
				fromPath === undefined || toPath === undefined
					? ""
					: `: ${fromPath} -> ${toPath}`
			}`,
			locations: findingLocations(finding),
			actions: normalizeActions(finding),
			providerDetails: providerDetails(finding),
		};
	});
}

function targetDescription(
	request: Extract<AnalysisRequest, { capability: "trace" }>,
): string {
	const target = request.scope.target;
	switch (target.kind) {
		case "symbol":
			return target.path === undefined
				? target.symbol
				: `${target.path}:${target.symbol}`;
		case "file":
			return target.path;
		case "dependency":
			return target.dependency;
		case "duplicate-location":
			return `${target.location.path}:${String(target.location.line ?? "")}`;
	}
}

function traceArgs(
	request: Extract<AnalysisRequest, { capability: "trace" }>,
): readonly string[] {
	const target = request.scope.target;
	switch (target.kind) {
		case "symbol":
			if (target.path === undefined || target.path.trim().length === 0) {
				throw new Error("symbol trace requires a nonempty path");
			}
			return ["dead-code", "--trace", `${target.path}:${target.symbol}`];
		case "file":
			return ["dead-code", "--trace-file", target.path];
		case "dependency":
			return ["dead-code", "--trace-dependency", target.dependency];
		case "duplicate-location":
			if (target.location.line === undefined) {
				throw new Error("duplicate-location trace requires a line");
			}
			return [
				"dupes",
				"--trace",
				`${target.location.path}:${target.location.line}`,
			];
	}
}

function scopePathArgs(scope: AnalysisScope): readonly string[] {
	if (scope.kind !== "paths") return [];
	return scope.paths.flatMap((path) => ["--file", path]);
}

function capabilityArgs(request: AnalysisRequest): readonly string[] {
	let operation: readonly string[];
	switch (request.capability) {
		case "dead-code":
			operation = ["dead-code", ...scopePathArgs(request.scope)];
			break;
		case "duplication":
			operation = ["dupes"];
			break;
		case "complexity":
			operation = ["health", "--complexity"];
			break;
		case "boundary-conformance":
			operation = [
				"dead-code",
				"--boundary-violations",
				...scopePathArgs(request.scope),
			];
			break;
		case "changed-scope-audit":
			if (request.scope.base.trim().length === 0) {
				throw new Error("changed-scope audit requires a nonempty base");
			}
			operation = ["audit", "--base", request.scope.base];
			break;
		case "trace":
			operation = traceArgs(request);
			break;
		case "fix-preview":
			operation = ["fix", "--dry-run"];
			break;
	}
	return [
		...operation,
		...FALLOW_JSON_ARGS,
		...(request.capability === "trace" || request.capability === "fix-preview"
			? []
			: ["--fail-on-issues"]),
	];
}

function traceNode(record: Readonly<Record<string, unknown>>): string | null {
	const path = stringValue(record, "file") ?? stringValue(record, "path");
	const symbol =
		stringValue(record, "export_name") ?? stringValue(record, "name");
	if (path === undefined) return null;
	return symbol === undefined ? path : `${path}:${symbol}`;
}

function traceReferenceEdges(
	payload: Readonly<Record<string, unknown>>,
	collection: "direct_references" | "re_export_chains",
	target: string,
): readonly AnalysisTraceEdge[] {
	const values = payload[collection];
	if (values === undefined) return [];
	if (!Array.isArray(values)) {
		throw new Error(`expected trace ${collection} to be an array`);
	}
	return values.flatMap((value) => {
		const reference = objectRecord(value);
		if (reference === null) return [];
		const node = traceNode(reference);
		return node === null ? [] : [{ from: node, to: target }];
	});
}

function normalizeTrace(
	request: Extract<AnalysisRequest, { capability: "trace" }>,
	payload: Readonly<Record<string, unknown>>,
): {
	readonly nodes: readonly string[];
	readonly edges: readonly AnalysisTraceEdge[];
	readonly evidence: readonly AnalysisEvidence[];
} {
	if (Object.keys(payload).length === 0) {
		throw new Error("expected trace evidence");
	}
	const target = traceNode(payload) ?? targetDescription(request);
	const collections = ["direct_references", "re_export_chains"] as const;
	const edges = collections.flatMap((collection) =>
		traceReferenceEdges(payload, collection, target),
	);
	const nodes = new Set([target, ...edges.map(({ from }) => from)]);
	const reason = stringValue(payload, "reason");
	const path = stringValue(payload, "file") ?? stringValue(payload, "path");
	const locations = path === undefined ? [] : [{ path }];
	return {
		nodes: [...nodes],
		edges,
		evidence: [
			{
				message: reason ?? `Trace evidence for ${targetDescription(request)}`,
				locations,
				providerDetails: providerDetails(payload),
			},
		],
	};
}

function normalizeFixProposals(
	payload: Readonly<Record<string, unknown>>,
): readonly AnalysisFixProposal[] {
	if (payload.dry_run !== true) {
		throw new Error("expected fix preview to assert dry_run true");
	}
	return requiredArray(payload, "fixes").map((value, index) => {
		const fix = objectRecord(value);
		if (fix === null) {
			throw new Error(`expected fixes[${index}] to be an object`);
		}
		const type = stringValue(fix, "type");
		const name = stringValue(fix, "name");
		const path = stringValue(fix, "path");
		const line = numberValue(fix, "line");
		return {
			description: [type, name].filter((part) => part !== undefined).join(": "),
			locations:
				path === undefined
					? []
					: [{ path, ...(line === undefined ? {} : { line }) }],
			providerDetails: providerDetails(fix),
		};
	});
}

interface NormalizedAnalysisFindings {
	readonly findings: readonly AnalysisFinding[];
	readonly verdict: "pass" | "fail";
}

interface NormalizedFallowAnalysis extends NormalizedAnalysisFindings {
	readonly coverage: AnalysisGateCoverage;
}

function findingsOutcome(
	findings: readonly AnalysisFinding[],
): NormalizedAnalysisFindings {
	return { findings, verdict: findings.length === 0 ? "pass" : "fail" };
}

export function assertFallowFindingsCovered(
	findings: readonly Pick<AnalysisFinding, "category">[],
	coverage: AnalysisGateCoverage,
): void {
	const uncoveredFinding = findings.find(
		(finding) => !coverage.includes(finding.category),
	);
	if (uncoveredFinding !== undefined) {
		throw new Error(
			`normalized finding category ${uncoveredFinding.category} is outside declared coverage [${coverage.join(", ")}]`,
		);
	}
}

function reconcileVerdictEvidence(
	outcome: CompletedFallowOutcome,
	payload: Readonly<Record<string, unknown>>,
	normalized: NormalizedAnalysisFindings,
): void {
	const findingsVerdict = normalized.findings.length === 0 ? "pass" : "fail";
	if (normalized.verdict !== findingsVerdict) {
		throw new Error(
			`provider verdict ${normalized.verdict} contradicts ${normalized.findings.length} normalized findings`,
		);
	}
	if ("verdict" in payload) {
		const assertedVerdict = payload.verdict;
		if (assertedVerdict !== "pass" && assertedVerdict !== "fail") {
			throw new Error("expected asserted verdict to be pass or fail");
		}
		if (assertedVerdict !== findingsVerdict) {
			throw new Error(
				`asserted verdict ${assertedVerdict} contradicts ${normalized.findings.length} normalized findings`,
			);
		}
	}
	const exitVerdict = outcome.code === 0 ? "pass" : "fail";
	if (exitVerdict !== findingsVerdict) {
		throw new Error(
			`provider exit ${outcome.code} contradicts ${normalized.findings.length} normalized findings`,
		);
	}
}

/**
 * Declared coverage for a dead-code-family invocation.
 *
 * Fallow reports boundary violations inside its dead-code envelope, so such an
 * invocation can evaluate boundaries — but whether it did depends on the
 * resolved configuration, and that cannot be established soundly from this
 * process: an `extends` closure reaches npm and HTTPS sources, and a separate
 * config process can never be atomic with the capability process (D-032,
 * superseding D-031).
 *
 * A boundary finding is itself proof that boundaries were evaluated, so the
 * category is declared exactly when the invocation produced one. A clean run
 * claims nothing rather than claiming a configuration-derived guarantee it
 * cannot back, which under-declares in the safe direction (INV-2): the gate
 * degrades visibly instead of passing without evidence. The boundary gate is
 * resolved from its own capability, so no consumer depends on the claim this
 * withholds.
 */
function deadCodeFamilyCoverage(
	base: readonly AnalysisGateCapability[],
	findings: readonly AnalysisFinding[],
): AnalysisGateCapability[] {
	const evaluatedBoundaries = findings.some(
		({ category }) => category === "boundary-conformance",
	);
	return evaluatedBoundaries ? [...base, "boundary-conformance"] : [...base];
}

function auditEnvelope(
	payload: Readonly<Record<string, unknown>>,
	key: "dead_code" | "duplication" | "complexity",
): Readonly<Record<string, unknown>> | null {
	const value = payload[key];
	if (value === undefined || value === null) return null;
	const envelope = objectRecord(value);
	if (envelope === null) {
		throw new Error(`expected audit ${key} to be an object`);
	}
	return envelope;
}

function zeroScopeAuditCoverage(
	payload: Readonly<Record<string, unknown>>,
): AnalysisGateCoverage {
	const summary = objectRecord(payload.summary);
	if (summary === null) {
		throw new Error("expected an audit summary for an empty changed scope");
	}
	for (const key of [
		"dead_code_issues",
		"duplication_clone_groups",
		"complexity_findings",
	] as const) {
		if (numberValue(summary, key) !== 0) {
			throw new Error(`expected zero-change audit summary ${key} to equal 0`);
		}
	}
	return ["dead-code", "duplication", "complexity"];
}

function auditFindings(
	request: Extract<AnalysisRequest, { capability: "changed-scope-audit" }>,
	payload: Readonly<Record<string, unknown>>,
): NormalizedFallowAnalysis {
	if (payload.base_ref !== request.scope.base) {
		throw new Error(
			`expected audit base_ref ${JSON.stringify(request.scope.base)}, received ${JSON.stringify(payload.base_ref)}`,
		);
	}
	const verdict = payload.verdict;
	if (verdict !== "pass" && verdict !== "fail") {
		throw new Error("expected audit verdict to be pass or fail");
	}
	const deadCode = auditEnvelope(payload, "dead_code");
	const duplication = auditEnvelope(payload, "duplication");
	const complexity = auditEnvelope(payload, "complexity");
	if (
		verdict === "fail" &&
		(deadCode === null || duplication === null || complexity === null)
	) {
		throw new Error(
			"expected audit dead_code, duplication, and complexity envelopes",
		);
	}
	if (numberValue(payload, "changed_files_count") === 0) {
		if (deadCode !== null || duplication !== null || complexity !== null) {
			throw new Error(
				"expected a zero-change audit to omit analysis sub-envelopes",
			);
		}
		return {
			findings: [],
			verdict,
			coverage: zeroScopeAuditCoverage(payload),
		};
	}
	const findings: AnalysisFinding[] = [];
	const coverage: AnalysisGateCapability[] = [];
	if (deadCode !== null) {
		findings.push(
			...normalizeDeadCodeFindings(deadCode, "fallow:audit:dead-code"),
		);
		coverage.push("dead-code");
	}
	if (duplication !== null) {
		findings.push(
			...normalizeDuplicationFindings(duplication, "fallow:audit:duplication"),
		);
		coverage.push("duplication");
	}
	if (complexity !== null) {
		findings.push(
			...normalizeComplexityFindings(complexity, "fallow:audit:complexity"),
		);
		coverage.push("complexity");
	}
	const declared = deadCodeFamilyCoverage(coverage, findings);
	const firstCapability = declared[0];
	if (firstCapability === undefined) {
		throw new Error("expected audit to contain a normalized analysis envelope");
	}
	return {
		findings,
		verdict,
		coverage: [firstCapability, ...declared.slice(1)],
	};
}

function analysisFindings(
	request: Exclude<AnalysisRequest, { capability: "trace" | "fix-preview" }>,
	payload: Readonly<Record<string, unknown>>,
): NormalizedFallowAnalysis {
	switch (request.capability) {
		case "dead-code": {
			const outcome = findingsOutcome(
				normalizeDeadCodeFindings(payload, "fallow:dead-code"),
			);
			const [first, ...rest] = deadCodeFamilyCoverage(
				[request.capability],
				outcome.findings,
			);
			if (first === undefined) {
				throw new Error("expected dead-code coverage to be non-empty");
			}
			return { ...outcome, coverage: [first, ...rest] };
		}
		case "duplication": {
			const outcome = findingsOutcome(
				normalizeDuplicationFindings(payload, "fallow:duplication"),
			);
			return { ...outcome, coverage: [request.capability] };
		}
		case "complexity": {
			const outcome = findingsOutcome(
				normalizeComplexityFindings(
					payload,
					"fallow:complexity",
					request.metric,
				),
			);
			return { ...outcome, coverage: [request.capability] };
		}
		case "boundary-conformance": {
			const outcome = findingsOutcome(
				normalizeBoundaryFindings(payload, "fallow:boundary-conformance"),
			);
			return { ...outcome, coverage: [request.capability] };
		}
		case "changed-scope-audit":
			return auditFindings(request, payload);
	}
}

function providerFailure(
	runtime: FallowExecutionRuntime,
	capability: AnalysisCapability,
	failure: AnalysisFailure,
): never {
	throw new AnalysisProviderError({
		capability,
		provider: `${runtime.provider.id}@${runtime.provider.version}`,
		failureClass: failure.kind,
		process: {
			exitCode: failure.process?.exitCode,
			signal: failure.process?.signal,
			reason: failure.process?.reason ?? failure.message,
			stderrSummary: failure.process?.stderr,
		},
	});
}

function executionInvalidOutput(
	capability: AnalysisCapability,
	outcome: Extract<ProviderProcessOutcome, { kind: "code-exit" }>,
	message: string,
): AnalysisFailure {
	return {
		...invalidOutput(capability, message),
		process: {
			exitCode: outcome.code,
			reason: message,
			stderr: outcome.stderr,
		},
	};
}

function carriesErrorEnvelope(
	payload: Readonly<Record<string, unknown>>,
): boolean {
	return (
		"error" in payload ||
		"errors" in payload ||
		payload.status === "error" ||
		payload.success === false
	);
}

type CompletedFallowOutcome = Extract<
	ProviderProcessOutcome,
	{ kind: "code-exit" }
>;

interface ParsedFallowEnvelope {
	readonly payload: unknown;
	readonly record: Readonly<Record<string, unknown>>;
}

function parseFallowEnvelope(
	runtime: FallowExecutionRuntime,
	request: AnalysisRequest,
	outcome: CompletedFallowOutcome,
): ParsedFallowEnvelope {
	let payload: unknown;
	try {
		payload = JSON.parse(outcome.stdout) as unknown;
	} catch {
		return providerFailure(
			runtime,
			request.capability,
			executionInvalidOutput(
				request.capability,
				outcome,
				"expected valid JSON",
			),
		);
	}
	const record = objectRecord(payload);
	if (record === null) {
		return providerFailure(
			runtime,
			request.capability,
			executionInvalidOutput(
				request.capability,
				outcome,
				"expected a JSON object",
			),
		);
	}
	if (carriesErrorEnvelope(record)) {
		return providerFailure(
			runtime,
			request.capability,
			executionInvalidOutput(
				request.capability,
				outcome,
				"provider returned an error envelope",
			),
		);
	}
	const schemaFailure = runtime.validateEnvelopeSchema(
		request.capability,
		record,
	);
	if (schemaFailure !== undefined) {
		return providerFailure(runtime, request.capability, {
			...schemaFailure,
			process: {
				exitCode: outcome.code,
				reason: schemaFailure.message,
				stderr: outcome.stderr,
			},
		});
	}
	return { payload, record };
}

function normalizedCapabilityResult(
	runtime: FallowExecutionRuntime,
	request: AnalysisRequest,
	outcome: CompletedFallowOutcome,
	envelope: ParsedFallowEnvelope,
): AnalysisResult {
	const native = {
		providerId: FALLOW_PROVIDER_ID,
		exitCode: outcome.code,
		payload: envelope.payload,
		stderr: outcome.stderr,
	} as const;
	try {
		if (request.capability === "trace") {
			return {
				kind: "trace",
				capability: "trace",
				provider: runtime.provider,
				scope: request.scope,
				verdict: "not-applicable",
				trace: normalizeTrace(request, envelope.record),
				native,
			};
		}
		if (request.capability === "fix-preview") {
			return {
				kind: "fix-preview",
				capability: "fix-preview",
				provider: runtime.provider,
				scope: request.scope,
				verdict: "not-applicable",
				proposals: normalizeFixProposals(envelope.record),
				native,
			};
		}
		const normalized = analysisFindings(request, envelope.record);
		assertFallowFindingsCovered(normalized.findings, normalized.coverage);
		const completeEvidence =
			request.capability === "complexity"
				? findingsOutcome(
						normalizeComplexityFindings(envelope.record, "fallow:complexity"),
					)
				: normalized;
		reconcileVerdictEvidence(outcome, envelope.record, completeEvidence);
		if (request.capability === "complexity") {
			return {
				kind: "findings",
				capability: "complexity",
				provider: runtime.provider,
				scope: request.scope,
				metric: request.metric,
				verdict: normalized.verdict,
				coverage: normalized.coverage,
				findings: normalized.findings,
				native,
			};
		}
		return {
			kind: "findings",
			capability: request.capability,
			provider: runtime.provider,
			scope: request.scope,
			verdict: normalized.verdict,
			coverage: normalized.coverage,
			findings: normalized.findings,
			native,
		} as AnalysisResult;
	} catch (error) {
		return providerFailure(
			runtime,
			request.capability,
			executionInvalidOutput(
				request.capability,
				outcome,
				error instanceof Error ? error.message : String(error),
			),
		);
	}
}

async function executeFallowCapability(
	runtime: FallowExecutionRuntime,
	request: AnalysisRequest,
	signal?: AbortSignal,
): Promise<AnalysisResult> {
	let args: readonly string[];
	try {
		args = capabilityArgs(request);
	} catch (error) {
		return providerFailure(runtime, request.capability, {
			kind:
				request.capability === "changed-scope-audit"
					? "missing-base"
					: "invalid-output",
			message: error instanceof Error ? error.message : String(error),
			process: {
				reason: error instanceof Error ? error.message : String(error),
			},
		});
	}

	const outcome = await runtime.executeProcess(
		{
			executablePath: runtime.executablePath,
			args,
			cwd: runtime.projectRoot,
		},
		signal,
		{ beforeSpawn: runtime.beforeSpawn },
	);
	if (
		outcome.kind !== "code-exit" ||
		(outcome.code !== 0 && outcome.code !== 1)
	) {
		return providerFailure(
			runtime,
			request.capability,
			processFailure(request.capability, outcome),
		);
	}
	return normalizedCapabilityResult(
		runtime,
		request,
		outcome,
		parseFallowEnvelope(runtime, request, outcome),
	);
}
