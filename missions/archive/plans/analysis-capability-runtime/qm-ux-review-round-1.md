# UX Review: round 1

## Overall

incorrect

## Assessment

The eight stable tool names, seven-row start status, bound/unbound/failed states, consent-withheld reason, unsupported scope/metric diagnostics, provider/version/scope status, and Pi `isError` transport are generally visible and structured. The ratified trace/fix-preview `not-applicable` verdict and retained legacy Detected Analysis Tools command are treated as intended. Three API-contract gaps remain: complexity ignores the requested metric, provider error envelopes lose their actionable payload, and a schema-valid symbol trace is later rejected as a provider failure.

## Findings

- id: UR-001
  dimension: confusing-states
  priority: P1
  severity: high
  confidence: 1.0
  complexity: complex
  title: "analysis_complexity silently ignores the requested metric"
  files: domains/shared/extensions/project-tools/fallow-provider.ts, domains/shared/extensions/project-tools/index.ts, lib/analysis/types.ts, tests/fixtures/fallow-2.54.2/complexity.json
  lineRange: domains/shared/extensions/project-tools/fallow-provider.ts:900-910; domains/shared/extensions/project-tools/fallow-provider.ts:1033-1038; lib/analysis/types.ts:213-247
  summary: |
    The tool contract says it finds violations of one requested metric, and request parsing retains
    `metric`, but the Fallow invocation is always `health --complexity` and normalization returns
    every complexity finding. The completed result also echoes only `scope`, not the requested
    metric. An agent asking for `cyclomatic` can therefore receive a failing verdict caused solely
    by CRAP findings and cannot tell from the generic result which metric the verdict represents.
  evidence: |
    `index.ts:557-560` promises “one requested complexity metric,” and `index.ts:360-370` parses it.
    `fallow-provider.ts:909-910` drops `request.metric`; `fallow-provider.ts:1033-1038` normalizes the
    whole findings array without metric filtering. The reviewed live fixture contains CRAP-only
    findings at `tests/fixtures/fallow-2.54.2/complexity.json:66-135`, proving that the provider
    envelope can contain violations unrelated to a cyclomatic request. `AnalysisCompletedResultBase`
    at `lib/analysis/types.ts:213-224` has no requested-metric field.
  suggestedFix: Make execution/normalization and verdict metric-specific, and echo the requested metric in the completed complexity result.
  task:
    title: "Honor and expose the requested complexity metric"
    labels: [review-fix]
    acceptanceCriteria:
      - "A mixed provider envelope returns only findings relevant to the requested metric and derives the verdict from those findings."
      - "The completed complexity result explicitly echoes the requested metric alongside provider, version, and scope."
      - "Tests prove cyclomatic, cognitive, and CRAP requests cannot be failed by findings exclusive to another metric."

- id: UR-002
  dimension: feedback
  priority: P1
  severity: medium
  confidence: 0.99
  complexity: simple
  title: "Provider error envelopes lose the provider's actionable diagnostic"
  files: domains/shared/extensions/project-tools/fallow-provider.ts, domains/shared/extensions/project-tools/analysis-provider-error.ts, tests/pi-contract/pi-behavior-contract.test.ts
  lineRange: domains/shared/extensions/project-tools/fallow-provider.ts:1105-1135; domains/shared/extensions/project-tools/fallow-provider.ts:1215-1224
  summary: |
    A provider JSON error is correctly distinguished from a clean result, but the agent sees only
    the generic reason “provider returned an error envelope.” The actual `error`, `errors`, status,
    or other provider payload is discarded before `AnalysisProviderError` is formatted. This leaves
    failures visibly failed but often removes the only explanation needed to correct configuration,
    a base ref, or provider input.
  evidence: |
    `fallow-provider.ts:1215-1224` recognizes an error-bearing parsed object but replaces it with a
    constant message. `executionInvalidOutput` retains only exit, that constant reason, and stderr;
    `providerFailure` at lines 1105-1120 passes only process fields into the error. The error type at
    `analysis-provider-error.ts:8-34` has no provider-detail field. The real-Pi contract explicitly
    confirms `result.details` is `{}` at `tests/pi-contract/pi-behavior-contract.test.ts:312-318`, so
    information omitted from the serialized message is unavailable to external agent consumers.
  suggestedFix: Preserve and serialize the provider-tagged error diagnostic in `AnalysisProviderError` content while retaining Pi's `isError: true` behavior.

- id: UR-003
  dimension: consistency
  priority: P1
  severity: medium
  confidence: 1.0
  complexity: simple
  title: "The trace schema accepts a symbol request that the provider always rejects"
  files: domains/shared/extensions/project-tools/index.ts, domains/shared/extensions/project-tools/fallow-provider.ts, lib/analysis/types.ts
  lineRange: domains/shared/extensions/project-tools/index.ts:79-87; domains/shared/extensions/project-tools/index.ts:271-283
  summary: |
    `analysis_trace` advertises `{ kind: "symbol", symbol: "..." }` as valid because `path` is
    optional in both its schema and public type. After binding resolution says the request is ready,
    the Fallow adapter requires a nonempty path and converts the omission into an
    `invalid-output` provider failure. An external agent following the published schema therefore
    receives “Analysis failed to run” for a client-input shape the API itself declared valid.
  evidence: |
    `index.ts:79-87` makes symbol `path` optional, and request parsing at lines 275-283 preserves its
    absence. `lib/analysis/types.ts:95-100` publishes the same optional contract. The adapter then
    throws “symbol trace requires a nonempty path” at `fallow-provider.ts:869-878`; lines 1155-1167
    classify that pre-invocation input mismatch as provider `invalid-output` rather than rejecting it
    at the explicit path-validation boundary.
  suggestedFix: Require and validate a project-relative path for symbol traces in the public schema and request type before provider resolution.
