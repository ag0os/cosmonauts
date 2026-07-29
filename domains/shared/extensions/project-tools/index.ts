import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	ANALYSIS_CAPABILITY_TOOL_NAMES,
	ANALYSIS_METRICS,
	type AnalysisBinding,
	type AnalysisCapability,
	type AnalysisFailure,
	type AnalysisMetric,
	type AnalysisProjectOrPathsScope,
	type AnalysisRequest,
	type AnalysisRequestResolution,
	type AnalysisTraceTarget,
	resolveAnalysisBindings,
	resolveAnalysisRequest,
} from "../../../../lib/analysis/index.ts";
import { loadProjectConfig } from "../../../../lib/config/index.ts";
import { AnalysisProviderError } from "./analysis-provider-error.ts";
import {
	detectFallowSignal,
	discoverFallowProvider,
	FallowBindingUnavailableError,
} from "./fallow-provider.ts";
import type { ProviderProcessExecutor } from "./process-runner.ts";

export {
	AnalysisProviderError,
	type AnalysisProviderErrorOptions,
	type AnalysisProviderErrorProcessEvidence,
} from "./analysis-provider-error.ts";

const FALLOW_PROVIDER_ID = "fallow";

interface AnalysisTool {
	name: string;
	configFile: string;
	description: string;
	auditCommand: string;
}

type FallowDiscovery = Awaited<ReturnType<typeof discoverFallowProvider>>;
type DetectedFallowDiscovery = Extract<
	FallowDiscovery,
	{ readonly status: "detected" }
>;

interface AnalysisSessionSnapshot {
	readonly bindings: readonly AnalysisBinding[];
	readonly runtime?: DetectedFallowDiscovery["runtime"];
}

interface SnapshotDiscovery {
	readonly cwd: string;
	readonly controller: AbortController;
	readonly consumers: Set<symbol>;
	readonly promise: Promise<AnalysisSessionSnapshot>;
	settled: boolean;
	snapshot?: AnalysisSessionSnapshot;
	clearReason?: string;
}

class AnalysisDiscoveryAbortedError extends Error {
	readonly reason: unknown;

	constructor(reason: unknown) {
		super(reason instanceof Error ? reason.message : String(reason));
		this.name = "AnalysisDiscoveryAbortedError";
		this.reason = reason;
	}
}

export interface ProjectToolsExtensionDeps {
	readonly userStateRoot?: string;
	readonly configuredExecutablePath?: string;
	readonly injectedExecutablePath?: string;
	readonly executeProcess?: ProviderProcessExecutor;
	readonly loadConfig?: typeof loadProjectConfig;
	readonly discoverProvider?: typeof discoverFallowProvider;
}

interface RawParams {
	readonly [key: string]: unknown;
}

const ProjectPathsSchema = Type.Optional(
	Type.Array(Type.String({ minLength: 1 }), {
		description:
			"Project-relative paths. Omit for project scope; when present it must be non-empty.",
		minItems: 1,
	}),
);

const ProjectOrPathsParameters = Type.Object(
	{
		paths: ProjectPathsSchema,
	},
	{ additionalProperties: false },
);

const TraceTargetSchema = Type.Union([
	Type.Object(
		{
			kind: Type.Literal("symbol"),
			symbol: Type.String({ minLength: 1 }),
			path: Type.Optional(Type.String({ minLength: 1 })),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			kind: Type.Literal("file"),
			path: Type.String({ minLength: 1 }),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			kind: Type.Literal("dependency"),
			dependency: Type.String({ minLength: 1 }),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			kind: Type.Literal("duplicate-location"),
			location: Type.Object(
				{
					path: Type.String({ minLength: 1 }),
					line: Type.Optional(Type.Integer({ minimum: 1 })),
					column: Type.Optional(Type.Integer({ minimum: 1 })),
				},
				{ additionalProperties: false },
			),
		},
		{ additionalProperties: false },
	),
]);

function fallowTool(configFile: string): AnalysisTool {
	return {
		name: "fallow",
		configFile,
		description:
			"TypeScript/JavaScript dead code, duplication, and complexity audit",
		auditCommand: "npx fallow audit",
	};
}

async function detectFallow(cwd: string): Promise<AnalysisTool | null> {
	const signal = await detectFallowSignal(cwd);
	return signal === null ? null : fallowTool(signal.path);
}

async function detectTools(cwd: string): Promise<AnalysisTool[]> {
	const results = await Promise.all([
		detectFallow(cwd),
		// Future: detectReek(cwd), detectCargoUdeps(cwd), etc.
	]);
	return results.filter((t): t is AnalysisTool => t !== null);
}

function buildToolsBlock(tools: AnalysisTool[]): string {
	const lines = tools.map(
		(t) =>
			`- **${t.name}** (\`${t.configFile}\`) — ${t.description}. Audit command: \`${t.auditCommand}\``,
	);
	return `## Detected Analysis Tools\n\n${lines.join("\n")}`;
}

function statusReason(binding: AnalysisBinding): string {
	if (binding.state === "bound") {
		const scopes = binding.scopes.map((scope) => `\`${scope}\``).join(", ");
		const metrics =
			binding.metrics === undefined
				? ""
				: `; metrics ${binding.metrics
						.map((metric) => `\`${metric}\``)
						.join(", ")}`;
		return `provider \`${binding.provider.id}@${binding.provider.version}\`; scopes ${scopes}${metrics}`;
	}
	if (binding.state === "unbound") {
		const provider =
			binding.providerId === undefined
				? ""
				: `; provider \`${binding.providerId}\``;
		return `\`${binding.reason}\`${provider}`;
	}
	const provider =
		binding.providerId === undefined
			? ""
			: `; provider \`${binding.providerId}\``;
	const message = binding.failure.message
		.replaceAll("|", "\\|")
		.replaceAll(/\s+/gu, " ");
	return `\`${binding.failure.kind}\`${provider}; ${message}`;
}

function buildCapabilityStatusBlock(
	bindings: readonly AnalysisBinding[],
	executableResolution?: DetectedFallowDiscovery["runtime"]["executableResolution"],
): string {
	const rows = bindings.map(
		(binding) =>
			`| \`${binding.capability}\` | \`${binding.state}\` | ${statusReason(binding)} |`,
	);
	return [
		"## Analysis Capability Status",
		"",
		...(executableResolution === undefined
			? []
			: [`Resolution provenance: \`${executableResolution}\`.`, ""]),
		"| Capability | State | Reason |",
		"|---|---|---|",
		...rows,
	].join("\n");
}

function textResult<T>(details: T): {
	content: { type: "text"; text: string }[];
	readonly details: T;
} {
	return {
		content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
		details,
	};
}

function paramsObject(value: unknown, toolName: string): RawParams {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${toolName} requires an object input.`);
	}
	return value as RawParams;
}

function assertOnlyKeys(
	params: RawParams,
	allowedKeys: readonly string[],
	toolName: string,
): void {
	const unexpected = Object.keys(params).find(
		(key) => !allowedKeys.includes(key),
	);
	if (unexpected !== undefined) {
		throw new Error(`${toolName} does not accept ${unexpected}.`);
	}
}

function nonemptyString(value: unknown, label: string): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`${label} must be a nonempty string.`);
	}
	return value.trim();
}

function projectPath(value: unknown, label: string): string {
	const path = nonemptyString(value, label);
	const segments = path.split(/[\\/]/u);
	if (
		path.startsWith("/") ||
		path.startsWith("\\") ||
		/^[A-Za-z]:[\\/]/u.test(path) ||
		segments.includes("..")
	) {
		throw new Error(`${label} must be a project-relative path.`);
	}
	return path;
}

function projectOrPathsScope(
	params: RawParams,
	toolName: string,
): AnalysisProjectOrPathsScope {
	assertOnlyKeys(params, ["paths"], toolName);
	if (params.paths === undefined) return { kind: "project" };
	if (!Array.isArray(params.paths) || params.paths.length === 0) {
		throw new Error(`${toolName} paths must contain at least one path.`);
	}
	return {
		kind: "paths",
		paths: params.paths.map((path, index) =>
			projectPath(path, `${toolName} paths[${index}]`),
		),
	};
}

function analysisMetric(value: unknown): AnalysisMetric {
	const metric = nonemptyString(value, "analysis_complexity metric");
	if (!(ANALYSIS_METRICS as readonly string[]).includes(metric)) {
		throw new Error(
			`analysis_complexity metric must be one of ${ANALYSIS_METRICS.join(", ")}.`,
		);
	}
	return metric as AnalysisMetric;
}

function traceTarget(value: unknown): AnalysisTraceTarget {
	const target = paramsObject(value, "analysis_trace target");
	const kind = nonemptyString(target.kind, "analysis_trace target kind");
	switch (kind) {
		case "symbol":
			assertOnlyKeys(target, ["kind", "symbol", "path"], "analysis_trace");
			return {
				kind,
				symbol: nonemptyString(target.symbol, "analysis_trace symbol target"),
				...(target.path === undefined
					? {}
					: { path: projectPath(target.path, "analysis_trace symbol path") }),
			};
		case "file":
			assertOnlyKeys(target, ["kind", "path"], "analysis_trace");
			return {
				kind,
				path: projectPath(target.path, "analysis_trace file target"),
			};
		case "dependency":
			assertOnlyKeys(target, ["kind", "dependency"], "analysis_trace");
			return {
				kind,
				dependency: nonemptyString(
					target.dependency,
					"analysis_trace dependency target",
				),
			};
		case "duplicate-location": {
			assertOnlyKeys(target, ["kind", "location"], "analysis_trace");
			const location = paramsObject(
				target.location,
				"analysis_trace duplicate location",
			);
			assertOnlyKeys(
				location,
				["path", "line", "column"],
				"analysis_trace duplicate location",
			);
			if (
				location.line !== undefined &&
				(!Number.isInteger(location.line) || Number(location.line) < 1)
			) {
				throw new Error(
					"analysis_trace duplicate location line must be a positive integer.",
				);
			}
			if (
				location.column !== undefined &&
				(!Number.isInteger(location.column) || Number(location.column) < 1)
			) {
				throw new Error(
					"analysis_trace duplicate location column must be a positive integer.",
				);
			}
			return {
				kind,
				location: {
					path: projectPath(
						location.path,
						"analysis_trace duplicate location path",
					),
					...(location.line === undefined
						? {}
						: { line: Number(location.line) }),
					...(location.column === undefined
						? {}
						: { column: Number(location.column) }),
				},
			};
		}
		default:
			throw new Error(
				"analysis_trace target kind must be symbol, file, dependency, or duplicate-location.",
			);
	}
}

function parseCapabilityRequest(
	capability: AnalysisCapability,
	value: unknown,
): AnalysisRequest {
	const toolName = ANALYSIS_CAPABILITY_TOOL_NAMES[capability];
	const params = paramsObject(value, toolName);
	switch (capability) {
		case "dead-code":
		case "duplication":
		case "boundary-conformance":
		case "fix-preview":
			return {
				capability,
				scope: projectOrPathsScope(params, toolName),
			} as AnalysisRequest;
		case "complexity":
			assertOnlyKeys(params, ["paths", "metric"], toolName);
			return {
				capability,
				scope: projectOrPathsScope(
					Object.fromEntries(
						Object.entries(params).filter(([key]) => key === "paths"),
					),
					toolName,
				),
				metric: analysisMetric(params.metric),
			};
		case "changed-scope-audit":
			assertOnlyKeys(params, ["base"], toolName);
			return {
				capability,
				scope: {
					kind: "changed",
					base: nonemptyString(params.base, `${toolName} base`),
				},
			};
		case "trace":
			assertOnlyKeys(params, ["target"], toolName);
			return {
				capability,
				scope: {
					kind: "target",
					target: traceTarget(params.target),
				},
			};
	}
}

function throwProviderFailure(
	capability: AnalysisCapability,
	providerId: string | undefined,
	failure: AnalysisFailure,
): never {
	throw new AnalysisProviderError({
		capability,
		provider: providerId ?? "unknown",
		failureClass: failure.kind,
		process: {
			exitCode: failure.process?.exitCode,
			signal: failure.process?.signal,
			reason: failure.process?.reason ?? failure.message,
			stderrSummary: failure.process?.stderr,
		},
	});
}

function discoveryAbortFailure(
	error: AnalysisDiscoveryAbortedError,
): AnalysisFailure {
	return {
		kind: "aborted",
		message: "Fallow discovery was aborted.",
		process: {
			reason:
				error.reason instanceof Error
					? error.reason.message
					: String(error.reason),
		},
	};
}

function nonreadyResult(
	resolution: Exclude<AnalysisRequestResolution, { readonly kind: "ready" }>,
): ReturnType<typeof textResult> {
	if (resolution.kind === "failed") {
		return throwProviderFailure(
			resolution.capability,
			resolution.providerId,
			resolution.failure,
		);
	}
	return textResult(resolution);
}

async function refreshSnapshotBindings(
	snapshot: AnalysisSessionSnapshot,
): Promise<AnalysisSessionSnapshot> {
	if (snapshot.runtime === undefined) return snapshot;
	return {
		...snapshot,
		bindings: await snapshot.runtime.currentBindings(),
	};
}

function registerCapabilityTool(
	pi: ExtensionAPI,
	options: {
		readonly capability: AnalysisCapability;
		readonly label: string;
		readonly description: string;
		readonly parameters: ReturnType<typeof Type.Object>;
		readonly getSnapshot: (
			cwd: string,
			signal?: AbortSignal,
		) => Promise<AnalysisSessionSnapshot>;
	},
): void {
	pi.registerTool({
		name: ANALYSIS_CAPABILITY_TOOL_NAMES[options.capability],
		label: options.label,
		description: options.description,
		parameters: options.parameters,
		executionMode: "parallel",
		execute: async (_toolCallId, params, signal, _onUpdate, ctx) => {
			const request = parseCapabilityRequest(options.capability, params);
			let snapshot: AnalysisSessionSnapshot;
			try {
				snapshot = await refreshSnapshotBindings(
					await options.getSnapshot(ctx.cwd, signal),
				);
			} catch (error) {
				if (error instanceof AnalysisDiscoveryAbortedError) {
					return throwProviderFailure(
						options.capability,
						FALLOW_PROVIDER_ID,
						discoveryAbortFailure(error),
					);
				}
				throw error;
			}
			const resolution = resolveAnalysisRequest(snapshot.bindings, request);
			if (resolution.kind !== "ready") return nonreadyResult(resolution);
			if (snapshot.runtime === undefined) {
				return throwProviderFailure(
					options.capability,
					resolution.binding.provider.id,
					{
						kind: "invalid-config",
						message: "Bound analysis capability has no session runtime.",
						process: { reason: "missing-session-runtime" },
					},
				);
			}
			try {
				return textResult(await snapshot.runtime.execute(request, signal));
			} catch (error) {
				if (error instanceof FallowBindingUnavailableError) {
					const liveResolution = resolveAnalysisRequest(
						error.bindings,
						request,
					);
					if (liveResolution.kind !== "ready") {
						return nonreadyResult(liveResolution);
					}
				}
				throw error;
			}
		},
	});
}

export function createProjectToolsExtension(
	deps: ProjectToolsExtensionDeps = {},
): (pi: ExtensionAPI) => void {
	const loadConfig = deps.loadConfig ?? loadProjectConfig;
	const discoverProvider = deps.discoverProvider ?? discoverFallowProvider;

	return function projectToolsExtension(pi: ExtensionAPI): void {
		let snapshotDiscovery: SnapshotDiscovery | undefined;

		const clearSnapshot = (reason: string): void => {
			const obsoleteDiscovery = snapshotDiscovery;
			snapshotDiscovery = undefined;
			if (obsoleteDiscovery === undefined) return;
			obsoleteDiscovery.clearReason = reason;
			if (!obsoleteDiscovery.settled) {
				obsoleteDiscovery.controller.abort(
					new AnalysisDiscoveryAbortedError(reason),
				);
				return;
			}
			obsoleteDiscovery.snapshot?.runtime?.dispose(
				new AnalysisDiscoveryAbortedError(reason),
			);
		};

		const discoverSnapshot = async (
			cwd: string,
			signal: AbortSignal,
		): Promise<AnalysisSessionSnapshot> => {
			const config = await loadConfig(cwd);
			if (signal.aborted) {
				throw new AnalysisDiscoveryAbortedError(signal.reason);
			}
			const providerPreference = config.analysis?.provider;
			if (
				providerPreference !== undefined &&
				providerPreference !== FALLOW_PROVIDER_ID
			) {
				return {
					bindings: resolveAnalysisBindings({
						detections: [],
						providerPreference,
					}),
				};
			}

			const discovery = await discoverProvider({
				projectRoot: cwd,
				configuredExecutablePath: deps.configuredExecutablePath,
				injectedExecutablePath: deps.injectedExecutablePath,
				userStateRoot: deps.userStateRoot,
				executeProcess: deps.executeProcess,
				signal,
			});
			const bindings =
				providerPreference !== undefined && discovery.status === "absent"
					? resolveAnalysisBindings({
							detections: [discovery.detection],
							providerPreference,
						})
					: discovery.bindings;
			return {
				bindings,
				...(discovery.status === "detected"
					? { runtime: discovery.runtime }
					: {}),
			};
		};

		const createSnapshotDiscovery = (cwd: string): SnapshotDiscovery => {
			const controller = new AbortController();
			let discovery: SnapshotDiscovery;
			const promise = discoverSnapshot(cwd, controller.signal);
			discovery = {
				cwd,
				controller,
				consumers: new Set(),
				promise,
				settled: false,
			};
			void promise.then(
				(snapshot) => {
					discovery.snapshot = snapshot;
					discovery.settled = true;
					if (snapshotDiscovery !== discovery) {
						snapshot.runtime?.dispose(
							new AnalysisDiscoveryAbortedError(
								discovery.clearReason ?? "Analysis discovery became obsolete.",
							),
						);
					}
				},
				() => {
					discovery.settled = true;
				},
			);
			return discovery;
		};

		const releaseConsumer = (
			discovery: SnapshotDiscovery,
			consumer: symbol,
			abortReason?: unknown,
		): void => {
			discovery.consumers.delete(consumer);
			if (
				abortReason === undefined ||
				discovery.settled ||
				discovery.consumers.size > 0
			) {
				return;
			}
			if (snapshotDiscovery === discovery) snapshotDiscovery = undefined;
			discovery.controller.abort(
				new AnalysisDiscoveryAbortedError(abortReason),
			);
		};

		const waitForSnapshot = (
			discovery: SnapshotDiscovery,
			signal?: AbortSignal,
		): Promise<AnalysisSessionSnapshot> => {
			if (signal?.aborted) {
				return Promise.reject(new AnalysisDiscoveryAbortedError(signal.reason));
			}
			const consumer = Symbol("snapshot-consumer");
			discovery.consumers.add(consumer);
			return new Promise((resolve, reject) => {
				let finished = false;
				const finish = (): boolean => {
					if (finished) return false;
					finished = true;
					signal?.removeEventListener("abort", abort);
					return true;
				};
				const abort = (): void => {
					if (!finish()) return;
					releaseConsumer(discovery, consumer, signal?.reason);
					reject(new AnalysisDiscoveryAbortedError(signal?.reason));
				};

				signal?.addEventListener("abort", abort, { once: true });
				if (signal?.aborted) {
					abort();
					return;
				}
				discovery.promise.then(
					(snapshot) => {
						if (!finish()) return;
						releaseConsumer(discovery, consumer);
						resolve(snapshot);
					},
					(error: unknown) => {
						if (!finish()) return;
						releaseConsumer(discovery, consumer);
						reject(error);
					},
				);
			});
		};

		const getSnapshot = (
			cwd: string,
			signal?: AbortSignal,
		): Promise<AnalysisSessionSnapshot> => {
			if (snapshotDiscovery === undefined || snapshotDiscovery.cwd !== cwd) {
				if (snapshotDiscovery !== undefined) {
					clearSnapshot("Analysis discovery cwd changed.");
				}
				snapshotDiscovery = createSnapshotDiscovery(cwd);
			}
			return waitForSnapshot(snapshotDiscovery, signal);
		};

		pi.registerTool({
			name: "analysis_status",
			label: "Analysis Status",
			description:
				"Report the binding state, provider, scopes, metrics, and diagnostic reason for every analysis capability.",
			parameters: Type.Object({}, { additionalProperties: false }),
			executionMode: "parallel",
			execute: async (_toolCallId, params, signal, _onUpdate, ctx) => {
				const parsed = paramsObject(params, "analysis_status");
				assertOnlyKeys(parsed, [], "analysis_status");
				const snapshot = await refreshSnapshotBindings(
					await getSnapshot(ctx.cwd, signal),
				);
				return textResult({
					kind: "status",
					...(snapshot.runtime === undefined
						? {}
						: {
								resolutionProvenance: snapshot.runtime.executableResolution,
							}),
					capabilities: snapshot.bindings,
				} as const);
			},
		});

		registerCapabilityTool(pi, {
			capability: "dead-code",
			label: "Analysis: Dead Code",
			description:
				"Find unreachable files, exports, types, or dependencies in project or explicit path scope.",
			parameters: ProjectOrPathsParameters,
			getSnapshot,
		});
		registerCapabilityTool(pi, {
			capability: "duplication",
			label: "Analysis: Duplication",
			description:
				"Find structurally duplicated code in project or explicit path scope.",
			parameters: ProjectOrPathsParameters,
			getSnapshot,
		});
		registerCapabilityTool(pi, {
			capability: "complexity",
			label: "Analysis: Complexity",
			description:
				"Find units violating one requested complexity metric in project or explicit path scope.",
			parameters: Type.Object(
				{
					metric: Type.Union(
						ANALYSIS_METRICS.map((metric) => Type.Literal(metric)),
					),
					paths: ProjectPathsSchema,
				},
				{ additionalProperties: false },
			),
			getSnapshot,
		});
		registerCapabilityTool(pi, {
			capability: "boundary-conformance",
			label: "Analysis: Boundaries",
			description:
				"Find dependencies that violate configured boundaries in project or explicit path scope.",
			parameters: ProjectOrPathsParameters,
			getSnapshot,
		});
		registerCapabilityTool(pi, {
			capability: "changed-scope-audit",
			label: "Analysis: Changed Scope Audit",
			description:
				"Audit changes from one explicit non-empty revision or ref without widening scope.",
			parameters: Type.Object(
				{
					base: Type.String({ minLength: 1 }),
				},
				{ additionalProperties: false },
			),
			getSnapshot,
		});
		registerCapabilityTool(pi, {
			capability: "trace",
			label: "Analysis: Trace",
			description:
				"Trace exactly one symbol, file, dependency, or duplicate location; provider-specific identity requirements are reported before execution.",
			parameters: Type.Object(
				{
					target: TraceTargetSchema,
				},
				{ additionalProperties: false },
			),
			getSnapshot,
		});
		registerCapabilityTool(pi, {
			capability: "fix-preview",
			label: "Analysis: Fix Preview",
			description:
				"Return proposed changes for project or explicit path scope without applying them.",
			parameters: ProjectOrPathsParameters,
			getSnapshot,
		});

		pi.on("session_start", async () => {
			clearSnapshot("Analysis session started.");
		});
		pi.on("session_shutdown", async () => {
			clearSnapshot("Analysis session shut down.");
		});
		pi.on("before_agent_start", async (event, ctx) => {
			const [tools, cachedSnapshot] = await Promise.all([
				detectTools(ctx.cwd),
				getSnapshot(ctx.cwd),
			]);
			const snapshot = await refreshSnapshotBindings(cachedSnapshot);
			const blocks = [
				event.systemPrompt,
				...(tools.length === 0 ? [] : [buildToolsBlock(tools)]),
				buildCapabilityStatusBlock(
					snapshot.bindings,
					snapshot.runtime?.executableResolution,
				),
			];
			return {
				systemPrompt: blocks.join("\n\n"),
			};
		});
	};
}

export default createProjectToolsExtension();
