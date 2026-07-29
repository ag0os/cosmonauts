/**
 * Provider-neutral analysis contracts shared by resolution, provider adapters,
 * Pi-facing tools, and consumers.
 */

export const ANALYSIS_GATE_CAPABILITIES = [
	"dead-code",
	"duplication",
	"complexity",
	"boundary-conformance",
] as const;

export const ANALYSIS_OPERATIONAL_CAPABILITIES = [
	"changed-scope-audit",
	"trace",
	"fix-preview",
] as const;

export const ANALYSIS_CAPABILITIES = [
	...ANALYSIS_GATE_CAPABILITIES,
	...ANALYSIS_OPERATIONAL_CAPABILITIES,
] as const;

export type AnalysisGateCapability =
	(typeof ANALYSIS_GATE_CAPABILITIES)[number];
export type AnalysisOperationalCapability =
	(typeof ANALYSIS_OPERATIONAL_CAPABILITIES)[number];
export type AnalysisCapability = (typeof ANALYSIS_CAPABILITIES)[number];

export const ANALYSIS_VERDICT_CAPABILITIES = [
	...ANALYSIS_GATE_CAPABILITIES,
	"changed-scope-audit",
] as const;

export const ANALYSIS_NOT_APPLICABLE_VERDICT_CAPABILITIES = [
	"trace",
	"fix-preview",
] as const;

export type AnalysisVerdictCapability =
	(typeof ANALYSIS_VERDICT_CAPABILITIES)[number];
export type AnalysisNotApplicableVerdictCapability =
	(typeof ANALYSIS_NOT_APPLICABLE_VERDICT_CAPABILITIES)[number];

export const ANALYSIS_METRICS = ["cyclomatic", "cognitive", "crap"] as const;

export type AnalysisMetric = (typeof ANALYSIS_METRICS)[number];
export type AnalysisVerdict = "pass" | "fail";
export type AnalysisFindingSeverity = "info" | "warning" | "error" | "unknown";

export interface ProviderIdentity {
	readonly id: string;
	readonly name: string;
	readonly version: string;
}

export interface AnalysisProjectScope {
	readonly kind: "project";
}

export interface AnalysisPathsScope {
	readonly kind: "paths";
	/** Non-empty, trimmed, project-relative paths. */
	readonly paths: readonly string[];
}

export interface AnalysisChangedScope {
	readonly kind: "changed";
	/** Non-empty revision or ref used literally by the provider. */
	readonly base: string;
}

export type AnalysisTraceTarget =
	| {
			readonly kind: "symbol";
			readonly symbol: string;
			readonly path?: string;
	  }
	| { readonly kind: "file"; readonly path: string }
	| { readonly kind: "dependency"; readonly dependency: string }
	| {
			readonly kind: "duplicate-location";
			readonly location: AnalysisLocation;
	  };

export interface AnalysisTargetScope {
	readonly kind: "target";
	readonly target: AnalysisTraceTarget;
}

export type AnalysisScope =
	| AnalysisProjectScope
	| AnalysisPathsScope
	| AnalysisChangedScope
	| AnalysisTargetScope;

export type AnalysisProjectOrPathsScope =
	| AnalysisProjectScope
	| AnalysisPathsScope;

export type AnalysisRequest =
	| {
			readonly capability: "dead-code";
			readonly scope: AnalysisProjectOrPathsScope;
	  }
	| {
			readonly capability: "duplication";
			readonly scope: AnalysisProjectOrPathsScope;
	  }
	| {
			readonly capability: "complexity";
			readonly scope: AnalysisProjectOrPathsScope;
			readonly metric: AnalysisMetric;
	  }
	| {
			readonly capability: "boundary-conformance";
			readonly scope: AnalysisProjectOrPathsScope;
	  }
	| {
			readonly capability: "changed-scope-audit";
			readonly scope: AnalysisChangedScope;
	  }
	| {
			readonly capability: "trace";
			readonly scope: AnalysisTargetScope;
	  }
	| {
			readonly capability: "fix-preview";
			readonly scope: AnalysisProjectOrPathsScope;
	  };

export interface ProviderTaggedDetails {
	readonly providerId: string;
	readonly data: Readonly<Record<string, unknown>>;
}

export interface AnalysisLocation {
	readonly path: string;
	readonly line?: number;
	readonly column?: number;
	readonly endLine?: number;
	readonly endColumn?: number;
}

export interface AnalysisAction {
	readonly description: string;
	readonly providerDetails?: ProviderTaggedDetails;
}

export interface AnalysisFinding {
	/** Adapter-internal identity; no cross-session stability is promised. */
	readonly id: string;
	readonly category: AnalysisGateCapability;
	readonly severity: AnalysisFindingSeverity;
	readonly message: string;
	readonly locations: readonly AnalysisLocation[];
	readonly actions: readonly AnalysisAction[];
	readonly providerDetails?: ProviderTaggedDetails;
}

export interface AnalysisTraceEdge {
	readonly from: string;
	readonly to: string;
}

export interface AnalysisEvidence {
	readonly message: string;
	readonly locations: readonly AnalysisLocation[];
	readonly providerDetails?: ProviderTaggedDetails;
}

export interface AnalysisTrace {
	readonly nodes: readonly string[];
	readonly edges: readonly AnalysisTraceEdge[];
	readonly evidence: readonly AnalysisEvidence[];
}

export interface AnalysisFixProposal {
	readonly description: string;
	readonly locations: readonly AnalysisLocation[];
	readonly providerDetails?: ProviderTaggedDetails;
}

export interface AnalysisNativeEnvelope {
	readonly providerId: string;
	readonly exitCode: number;
	readonly payload: unknown;
	readonly stderr: string;
}

interface AnalysisCompletedResultBase<
	Kind extends string,
	Capability extends AnalysisCapability,
	Scope extends AnalysisScope,
	Verdict extends AnalysisVerdict | "not-applicable",
> {
	readonly kind: Kind;
	readonly capability: Capability;
	readonly provider: ProviderIdentity;
	readonly scope: Scope;
	readonly verdict: Verdict;
	readonly native: AnalysisNativeEnvelope;
}

type AnalysisFindingsResultFor<
	Capability extends AnalysisVerdictCapability,
	Scope extends AnalysisScope,
> = AnalysisCompletedResultBase<
	"findings",
	Capability,
	Scope,
	AnalysisVerdict
> & {
	readonly findings: readonly AnalysisFinding[];
};

export type AnalysisFindingsResult =
	| AnalysisFindingsResultFor<"dead-code", AnalysisProjectOrPathsScope>
	| AnalysisFindingsResultFor<"duplication", AnalysisProjectOrPathsScope>
	| AnalysisFindingsResultFor<"complexity", AnalysisProjectOrPathsScope>
	| AnalysisFindingsResultFor<
			"boundary-conformance",
			AnalysisProjectOrPathsScope
	  >
	| AnalysisFindingsResultFor<"changed-scope-audit", AnalysisChangedScope>;

export type AnalysisTraceResult = AnalysisCompletedResultBase<
	"trace",
	"trace",
	AnalysisTargetScope,
	"not-applicable"
> & {
	readonly trace: AnalysisTrace;
};

export type AnalysisFixPreviewResult = AnalysisCompletedResultBase<
	"fix-preview",
	"fix-preview",
	AnalysisProjectOrPathsScope,
	"not-applicable"
> & {
	readonly proposals: readonly AnalysisFixProposal[];
};

export type AnalysisResult =
	| AnalysisFindingsResult
	| AnalysisTraceResult
	| AnalysisFixPreviewResult;

export const ANALYSIS_FAILURE_KINDS = [
	"invalid-config",
	"provider-exit",
	"provider-signal",
	"spawn-error",
	"aborted",
	"timeout",
	"invalid-output",
	"unsupported-schema",
	"missing-base",
] as const;

export type AnalysisFailureKind = (typeof ANALYSIS_FAILURE_KINDS)[number];

export interface AnalysisFailureProcessEvidence {
	readonly exitCode?: number;
	readonly signal?: string;
	readonly reason?: string;
	readonly stderr?: string;
}

export interface AnalysisFailure {
	readonly kind: AnalysisFailureKind;
	readonly message: string;
	readonly process?: AnalysisFailureProcessEvidence;
	readonly providerDetails?: ProviderTaggedDetails;
}

export const ANALYSIS_UNBOUND_REASONS = [
	"no-provider",
	"configured-provider-unavailable",
	"provider-unsupported",
	"provider-not-configured",
	"provider-not-installed",
	"execution-not-consented",
] as const;

export type AnalysisUnboundReason = (typeof ANALYSIS_UNBOUND_REASONS)[number];

export type AnalysisBinding =
	| {
			readonly state: "bound";
			readonly capability: AnalysisCapability;
			readonly provider: ProviderIdentity;
			readonly scopes: readonly AnalysisScope["kind"][];
			readonly metrics?: readonly AnalysisMetric[];
	  }
	| {
			readonly state: "unbound";
			readonly capability: AnalysisCapability;
			readonly reason: AnalysisUnboundReason;
			readonly providerId?: string;
	  }
	| {
			readonly state: "failed";
			readonly capability: AnalysisCapability;
			readonly providerId?: string;
			readonly failure: AnalysisFailure;
	  };

export type DetectedAnalysisCapability =
	| {
			readonly capability: AnalysisCapability;
			readonly status: "supported";
			readonly scopes: readonly AnalysisScope["kind"][];
			readonly metrics?: readonly AnalysisMetric[];
	  }
	| {
			readonly capability: AnalysisCapability;
			readonly status: "provider-not-configured";
	  };

export interface DetectedAnalysisProvider {
	readonly provider: ProviderIdentity;
	readonly capabilities: readonly DetectedAnalysisCapability[];
}

export type ProviderDetection =
	| { readonly status: "absent"; readonly providerId: string }
	| {
			readonly status: "detected";
			readonly provider: DetectedAnalysisProvider;
	  }
	| {
			readonly status: "failed";
			readonly providerId: string;
			readonly failure: AnalysisFailure;
	  };

/**
 * Leaf-level completed-result fields whose provider neutrality is audited in
 * docs/analysis-provider-validation.md.
 */
export const ANALYSIS_RESULT_GENERIC_FIELDS = [
	"kind",
	"capability",
	"provider.id",
	"provider.name",
	"provider.version",
	"scope.kind",
	"scope.paths[]",
	"scope.base",
	"scope.target",
	"verdict",
	"findings[].id",
	"findings[].category",
	"findings[].severity",
	"findings[].message",
	"findings[].locations[].path",
	"findings[].locations[].line",
	"findings[].locations[].column",
	"findings[].locations[].endLine",
	"findings[].locations[].endColumn",
	"findings[].actions[].description",
	"findings[].actions[].providerDetails.providerId",
	"findings[].actions[].providerDetails.data",
	"findings[].providerDetails.providerId",
	"findings[].providerDetails.data",
	"trace.nodes[]",
	"trace.edges[].from",
	"trace.edges[].to",
	"trace.evidence[].message",
	"trace.evidence[].locations[].path",
	"trace.evidence[].locations[].line",
	"trace.evidence[].locations[].column",
	"trace.evidence[].locations[].endLine",
	"trace.evidence[].locations[].endColumn",
	"trace.evidence[].providerDetails.providerId",
	"trace.evidence[].providerDetails.data",
	"proposals[].description",
	"proposals[].locations[].path",
	"proposals[].locations[].line",
	"proposals[].locations[].column",
	"proposals[].locations[].endLine",
	"proposals[].locations[].endColumn",
	"proposals[].providerDetails.providerId",
	"proposals[].providerDetails.data",
	"native.providerId",
	"native.exitCode",
	"native.payload",
	"native.stderr",
] as const;

export type AnalysisResultGenericField =
	(typeof ANALYSIS_RESULT_GENERIC_FIELDS)[number];
