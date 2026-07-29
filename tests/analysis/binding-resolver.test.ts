import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { createProjectToolsExtension } from "../../domains/shared/extensions/project-tools/index.ts";
import {
	ANALYSIS_CAPABILITIES,
	ANALYSIS_CAPABILITY_TOOL_NAMES,
	ANALYSIS_TOOL_NAMES,
	type AnalysisBinding,
	type AnalysisFailure,
	type AnalysisTraceTarget,
	type AnalysisTraceTargetSupport,
	type DetectedAnalysisProvider,
	type ProviderDetection,
	type ProviderIdentity,
	resolveAnalysisBindings,
	resolveAnalysisRequest,
} from "../../lib/analysis/index.ts";
import { loadProjectConfig } from "../../lib/config/index.ts";
import { createMockPi } from "../helpers/mocks/index.ts";

const FALLOW_PROVIDER = {
	id: "fallow",
	name: "Fallow",
	version: "2.54.2",
} as const;

const FAKE_PROVIDER = {
	id: "fake",
	name: "Fake analyzer",
	version: "1.0.0",
} as const;

const DEPENDENCY_CRUISER_PROVIDER = {
	id: "dependency-cruiser",
	name: "dependency-cruiser",
	version: "17.3.2",
} as const;

const FALLOW_TRACE_TARGETS = [
	{ kind: "symbol", path: "required" },
	{ kind: "file" },
	{ kind: "dependency" },
	{ kind: "duplicate-location", line: "required" },
] as const satisfies readonly AnalysisTraceTargetSupport[];

function traceBinding(
	traceTargets: readonly AnalysisTraceTargetSupport[],
	provider: ProviderIdentity = FALLOW_PROVIDER,
): readonly AnalysisBinding[] {
	return [
		{
			state: "bound",
			capability: "trace",
			provider,
			scopes: ["target"],
			traceTargets,
		},
	];
}

function detected(
	provider: DetectedAnalysisProvider["provider"],
): ProviderDetection {
	return {
		status: "detected",
		provider: {
			provider,
			capabilities: [
				{
					capability: "dead-code",
					status: "supported",
					scopes: ["project", "paths"],
				},
				{
					capability: "complexity",
					status: "supported",
					scopes: ["project"],
					metrics: ["cyclomatic"],
				},
			],
		},
	};
}

describe("analysis binding resolver", () => {
	// @cosmo-behavior plan:analysis-capability-runtime#B-003
	test("honors project provider preference without changing capability names", async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "analysis-preference-"));
		const detections = [detected(FALLOW_PROVIDER), detected(FAKE_PROVIDER)];
		const bindingsForConfiguredProvider = async (
			provider: string,
			availableDetections = detections,
		): Promise<readonly AnalysisBinding[]> => {
			await mkdir(join(projectRoot, ".cosmonauts"), { recursive: true });
			await writeFile(
				join(projectRoot, ".cosmonauts", "config.json"),
				JSON.stringify({ analysis: { provider } }),
			);
			const config = await loadProjectConfig(projectRoot);
			return resolveAnalysisBindings({
				detections: availableDetections,
				providerPreference: config.analysis?.provider,
			});
		};

		let fallowBindings: readonly AnalysisBinding[];
		let fakeBindings: readonly AnalysisBinding[];
		let unavailableBindings: readonly AnalysisBinding[];
		try {
			fallowBindings = await bindingsForConfiguredProvider("fallow");
			fakeBindings = await bindingsForConfiguredProvider("fake");
			unavailableBindings = await bindingsForConfiguredProvider("fake", [
				detected(FALLOW_PROVIDER),
			]);
		} finally {
			await rm(projectRoot, { recursive: true, force: true });
		}

		expect(fallowBindings.map(({ capability }) => capability)).toEqual([
			...ANALYSIS_CAPABILITIES,
		]);
		expect(fakeBindings.map(({ capability }) => capability)).toEqual([
			...ANALYSIS_CAPABILITIES,
		]);
		expect(ANALYSIS_TOOL_NAMES).toEqual([
			"analysis_status",
			...ANALYSIS_CAPABILITIES.map(
				(capability) => ANALYSIS_CAPABILITY_TOOL_NAMES[capability],
			),
		]);
		expect(
			fallowBindings.find(({ capability }) => capability === "complexity"),
		).toMatchObject({
			state: "bound",
			provider: FALLOW_PROVIDER,
		});
		expect(
			fakeBindings.find(({ capability }) => capability === "complexity"),
		).toMatchObject({
			state: "bound",
			provider: FAKE_PROVIDER,
		});
		expect(unavailableBindings).toEqual(
			ANALYSIS_CAPABILITIES.map((capability) => ({
				state: "unbound",
				capability,
				reason: "configured-provider-unavailable",
				providerId: "fake",
			})),
		);
	});

	// @cosmo-behavior plan:analysis-capability-runtime#B-011
	test("degrades only an unavailable complexity metric", () => {
		const bindings = resolveAnalysisBindings({
			detections: [detected(FALLOW_PROVIDER)],
		});
		const resolution = resolveAnalysisRequest(bindings, {
			capability: "complexity",
			scope: { kind: "project" },
			metric: "cognitive",
		});

		expect(resolution).toEqual({
			kind: "unsupported-metric",
			capability: "complexity",
			requestedMetric: "cognitive",
			availableMetrics: ["cyclomatic"],
		});
		expect(resolution).not.toHaveProperty("findings");
		expect(resolution).not.toHaveProperty("execute");
	});

	// @cosmo-behavior plan:analysis-capability-runtime#B-033
	test("degrades an unadvertised scope kind without widening", async () => {
		const bindings = resolveAnalysisBindings({
			detections: [detected(FALLOW_PROVIDER)],
		});
		const request = {
			capability: "dead-code",
			scope: { kind: "paths", paths: ["lib/analysis"] },
		} as const;
		const projectOnlyBindings = bindings.map((binding) =>
			binding.state === "bound" && binding.capability === "dead-code"
				? { ...binding, scopes: ["project"] as const }
				: binding,
		);
		const resolution = resolveAnalysisRequest(projectOnlyBindings, request);

		expect(resolution).toEqual({
			kind: "unsupported-scope",
			capability: "dead-code",
			requestedScopeKind: "paths",
			supportedScopeKinds: ["project"],
		});
		expect(resolution).not.toHaveProperty("request");
		expect(resolution).not.toHaveProperty("failure");
		expect(resolution).not.toHaveProperty("execute");

		let providerInvocations = 0;
		const pi = createMockPi({ cwd: "/fixture/project" });
		createProjectToolsExtension({
			loadConfig: async () => ({}),
			discoverProvider: (async () => ({
				status: "detected",
				signal: { kind: "config", path: "fallow.toml" },
				detection: detected(FALLOW_PROVIDER),
				bindings: projectOnlyBindings,
				runtime: {
					provider: FALLOW_PROVIDER,
					executablePath: "/fixture/fallow",
					executeProcess: async () => {
						throw new Error("process execution is not expected");
					},
					validateEnvelopeSchema: () => undefined,
					currentBindings: async () => projectOnlyBindings,
					execute: async () => {
						providerInvocations += 1;
						throw new Error("provider execution is not expected");
					},
					dispose: () => undefined,
				},
			})) as never,
		})(pi as never);
		const toolResult = (await pi.callTool("analysis_dead_code", {
			paths: ["lib/analysis"],
		})) as { readonly details: unknown };

		expect(toolResult.details).toEqual({
			kind: "unsupported-scope",
			capability: "dead-code",
			requestedScopeKind: "paths",
			supportedScopeKinds: ["project"],
		});
		expect(providerInvocations).toBe(0);
	});

	test("resolves every trace target against provider identity requirements", () => {
		const cases = [
			{
				name: "symbol without provider-required path",
				target: { kind: "symbol", symbol: "render" },
				expected: {
					kind: "unsupported-target",
					reason: "missing-identity",
					missingIdentityFields: ["path"],
				},
			},
			{
				name: "symbol with path",
				target: {
					kind: "symbol",
					symbol: "render",
					path: "src/render.ts",
				},
				expected: { kind: "ready" },
			},
			{
				name: "file",
				target: { kind: "file", path: "src/render.ts" },
				expected: { kind: "ready" },
			},
			{
				name: "dependency",
				target: { kind: "dependency", dependency: "typebox" },
				expected: { kind: "ready" },
			},
			{
				name: "duplicate location without provider-required line",
				target: {
					kind: "duplicate-location",
					location: { path: "src/render.ts" },
				},
				expected: {
					kind: "unsupported-target",
					reason: "missing-identity",
					missingIdentityFields: ["line"],
				},
			},
			{
				name: "duplicate location with line",
				target: {
					kind: "duplicate-location",
					location: { path: "src/render.ts", line: 12 },
				},
				expected: { kind: "ready" },
			},
			{
				name: "duplicate location with optional column",
				target: {
					kind: "duplicate-location",
					location: { path: "src/render.ts", line: 12, column: 4 },
				},
				expected: { kind: "ready" },
			},
		] as const satisfies readonly {
			readonly name: string;
			readonly target: AnalysisTraceTarget;
			readonly expected: Readonly<Record<string, unknown>>;
		}[];

		for (const testCase of cases) {
			const resolution = resolveAnalysisRequest(
				traceBinding(FALLOW_TRACE_TARGETS),
				{
					capability: "trace",
					scope: { kind: "target", target: testCase.target },
				},
			);
			expect(resolution, testCase.name).toMatchObject(testCase.expected);
		}
	});

	test("allows another provider to accept trace targets without optional identity", () => {
		const flexibleTargets = [
			{ kind: "symbol", path: "optional" },
			{ kind: "file" },
			{ kind: "dependency" },
			{ kind: "duplicate-location", line: "optional" },
		] as const satisfies readonly AnalysisTraceTargetSupport[];
		const targets = [
			{ kind: "symbol", symbol: "render" },
			{
				kind: "duplicate-location",
				location: { path: "src/render.ts" },
			},
		] as const satisfies readonly AnalysisTraceTarget[];

		for (const target of targets) {
			expect(
				resolveAnalysisRequest(traceBinding(flexibleTargets, FAKE_PROVIDER), {
					capability: "trace",
					scope: { kind: "target", target },
				}),
			).toMatchObject({ kind: "ready", binding: { provider: FAKE_PROVIDER } });
		}
	});

	test("degrades a target kind the bound provider does not advertise", () => {
		const dependencyGraphTargets = [
			{ kind: "file" },
			{ kind: "dependency" },
		] as const satisfies readonly AnalysisTraceTargetSupport[];

		expect(
			resolveAnalysisRequest(
				traceBinding(dependencyGraphTargets, DEPENDENCY_CRUISER_PROVIDER),
				{
					capability: "trace",
					scope: {
						kind: "target",
						target: { kind: "symbol", symbol: "render" },
					},
				},
			),
		).toEqual({
			kind: "unsupported-target",
			capability: "trace",
			providerId: "dependency-cruiser",
			requestedTargetKind: "symbol",
			reason: "unsupported-kind",
			missingIdentityFields: [],
			supportedTargets: dependencyGraphTargets,
		});
	});

	test("preserves failed detection and exposes only serializable resolution state", () => {
		const failure: AnalysisFailure = {
			kind: "invalid-config",
			message: "provider config could not be classified",
			providerDetails: {
				providerId: "fallow",
				data: { field: "threshold" },
			},
		};
		const bindings = resolveAnalysisBindings({
			detections: [
				{
					status: "failed",
					providerId: "fallow",
					failure,
				},
			],
		});
		const resolution = resolveAnalysisRequest(bindings, {
			capability: "dead-code",
			scope: { kind: "project" },
		});

		expect(bindings).toEqual(
			ANALYSIS_CAPABILITIES.map((capability) => ({
				state: "failed",
				capability,
				providerId: "fallow",
				failure,
			})),
		);
		expect(resolution).toEqual({
			kind: "failed",
			capability: "dead-code",
			providerId: "fallow",
			failure,
		});
		expect(JSON.parse(JSON.stringify({ bindings, resolution }))).toEqual({
			bindings,
			resolution,
		});
	});
});
