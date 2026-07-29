import { describe, expect, test } from "vitest";
import {
	ANALYSIS_CAPABILITIES,
	ANALYSIS_CAPABILITY_TOOL_NAMES,
	ANALYSIS_TOOL_NAMES,
	type AnalysisFailure,
	type DetectedAnalysisProvider,
	type ProviderDetection,
	resolveAnalysisBindings,
	resolveAnalysisRequest,
} from "../../lib/analysis/index.ts";

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
	test("honors project provider preference without changing capability names", () => {
		const detections = [detected(FALLOW_PROVIDER), detected(FAKE_PROVIDER)];
		const fallowBindings = resolveAnalysisBindings({
			detections,
			providerPreference: "fallow",
		});
		const fakeBindings = resolveAnalysisBindings({
			detections,
			providerPreference: "fake",
		});
		const unavailableBindings = resolveAnalysisBindings({
			detections: [detected(FALLOW_PROVIDER)],
			providerPreference: "fake",
		});

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
	test("degrades an unadvertised scope kind without widening", () => {
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
