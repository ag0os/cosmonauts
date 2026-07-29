import {
	ANALYSIS_CAPABILITIES,
	type AnalysisBinding,
	type AnalysisRequest,
	type AnalysisRequestResolution,
	type AnalysisTraceTarget,
	type AnalysisTraceTargetIdentityField,
	type AnalysisTraceTargetSupport,
	type DetectedAnalysisProvider,
	type ProviderDetection,
	type ResolveAnalysisBindingsOptions,
} from "./types.ts";

function detectionProviderId(detection: ProviderDetection): string {
	return detection.status === "detected"
		? detection.provider.provider.id
		: detection.providerId;
}

function selectDetection(
	options: ResolveAnalysisBindingsOptions,
): ProviderDetection | undefined {
	if (options.providerPreference !== undefined) {
		return options.detections.find(
			(detection) =>
				detectionProviderId(detection) === options.providerPreference,
		);
	}
	return options.detections.find((detection) => detection.status !== "absent");
}

function unavailableConfiguredProviderBindings(
	providerId: string,
): readonly AnalysisBinding[] {
	return ANALYSIS_CAPABILITIES.map((capability) => ({
		state: "unbound",
		capability,
		reason: "configured-provider-unavailable",
		providerId,
	}));
}

function failedBindings(
	detection: Extract<ProviderDetection, { status: "failed" }>,
): readonly AnalysisBinding[] {
	return ANALYSIS_CAPABILITIES.map((capability) => ({
		state: "failed",
		capability,
		providerId: detection.providerId,
		failure: detection.failure,
	}));
}

function detectedProviderBindings(
	detected: DetectedAnalysisProvider,
): readonly AnalysisBinding[] {
	return ANALYSIS_CAPABILITIES.map((capability): AnalysisBinding => {
		const support = detected.capabilities.find(
			(entry) => entry.capability === capability,
		);
		if (support?.status === "supported") {
			return {
				state: "bound",
				capability,
				provider: detected.provider,
				scopes: [...support.scopes],
				...(support.metrics === undefined
					? {}
					: { metrics: [...support.metrics] }),
				...(support.traceTargets === undefined
					? {}
					: {
							traceTargets: support.traceTargets.map((target) => ({
								...target,
							})),
						}),
			};
		}
		return {
			state: "unbound",
			capability,
			reason:
				support?.status === "provider-not-configured"
					? "provider-not-configured"
					: "provider-unsupported",
			providerId: detected.provider.id,
		};
	});
}

/**
 * Resolve one serializable binding row per stable capability.
 *
 * Provider executors deliberately do not cross this boundary. The session
 * runtime may invoke one only after {@link resolveAnalysisRequest} returns
 * `ready`.
 */
export function resolveAnalysisBindings(
	options: ResolveAnalysisBindingsOptions,
): readonly AnalysisBinding[] {
	const selected = selectDetection(options);
	if (options.providerPreference !== undefined) {
		if (selected === undefined || selected.status === "absent") {
			return unavailableConfiguredProviderBindings(options.providerPreference);
		}
	} else if (selected === undefined) {
		return ANALYSIS_CAPABILITIES.map((capability) => ({
			state: "unbound",
			capability,
			reason: "no-provider",
		}));
	}

	if (selected?.status === "failed") {
		return failedBindings(selected);
	}
	if (selected?.status === "detected") {
		return detectedProviderBindings(selected.provider);
	}

	throw new Error("Analysis provider selection reached an invalid state.");
}

function missingTraceTargetIdentity(
	target: AnalysisTraceTarget,
	support: AnalysisTraceTargetSupport,
): readonly AnalysisTraceTargetIdentityField[] {
	if (
		target.kind === "symbol" &&
		support.kind === "symbol" &&
		support.path === "required" &&
		target.path === undefined
	) {
		return ["path"];
	}
	if (
		target.kind === "duplicate-location" &&
		support.kind === "duplicate-location" &&
		support.line === "required" &&
		target.location.line === undefined
	) {
		return ["line"];
	}
	return [];
}

/**
 * Decide whether a request is executable without performing provider IO.
 */
export function resolveAnalysisRequest(
	bindings: readonly AnalysisBinding[],
	request: AnalysisRequest,
): AnalysisRequestResolution {
	const binding = bindings.find(
		(candidate) => candidate.capability === request.capability,
	);
	if (binding === undefined) {
		throw new Error(`Missing analysis binding for ${request.capability}.`);
	}
	if (binding.state === "unbound") {
		return {
			kind: "unbound",
			capability: binding.capability,
			reason: binding.reason,
			...(binding.providerId === undefined
				? {}
				: { providerId: binding.providerId }),
		};
	}
	if (binding.state === "failed") {
		return {
			kind: "failed",
			capability: binding.capability,
			...(binding.providerId === undefined
				? {}
				: { providerId: binding.providerId }),
			failure: binding.failure,
		};
	}
	if (!binding.scopes.includes(request.scope.kind)) {
		return {
			kind: "unsupported-scope",
			capability: request.capability,
			requestedScopeKind: request.scope.kind,
			supportedScopeKinds: [...binding.scopes],
		};
	}
	if (
		request.capability === "complexity" &&
		!binding.metrics?.includes(request.metric)
	) {
		return {
			kind: "unsupported-metric",
			capability: "complexity",
			requestedMetric: request.metric,
			availableMetrics: [...(binding.metrics ?? [])],
		};
	}
	if (request.capability === "trace") {
		const supportedTargets = binding.traceTargets ?? [];
		const support = supportedTargets.find(
			(target) => target.kind === request.scope.target.kind,
		);
		const missingIdentityFields =
			support === undefined
				? []
				: missingTraceTargetIdentity(request.scope.target, support);
		if (support === undefined || missingIdentityFields.length > 0) {
			return {
				kind: "unsupported-target",
				capability: "trace",
				providerId: binding.provider.id,
				requestedTargetKind: request.scope.target.kind,
				reason: support === undefined ? "unsupported-kind" : "missing-identity",
				missingIdentityFields,
				supportedTargets: supportedTargets.map((target) => ({ ...target })),
			};
		}
	}
	return {
		kind: "ready",
		binding,
		request,
	};
}
