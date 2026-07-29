# Review Report

base: main
range: 3d527eeb43ad6d4bcca50d2eaa410bdf1ce20dc7..HEAD
overall: incorrect

## Overall Assessment

The slice stays within the runtime boundary, retains the accepted legacy bridge, and `bun run test`, `bun run lint`, and `bun run typecheck` pass. It is still incorrect because normal package-shim execution defeats end-to-end signal guarantees, consent can become stale in the session snapshot, metric-specific results are not metric-specific, and the behavior evidence does not satisfy the plan's exact-test contract.

## Findings

- id: F-001
  priority: P1
  severity: high
  confidence: 1.0
  complexity: complex
  title: "[P1] Package-manager shims defeat the signal-aware process contract"
  files: domains/shared/extensions/project-tools/fallow-provider.ts, domains/shared/extensions/project-tools/process-runner.ts, tests/extensions/project-tools.test.ts, tests/extensions/project-tools-fallow.test.ts
  lineRange: domains/shared/extensions/project-tools/fallow-provider.ts:198-210
  summary: In a normal local installation the resolver executes `node_modules/.bin/fallow` (or `fallow.cmd`) rather than the native analyzer. Fallow 2.54.2's POSIX shim starts the native binary with synchronous `execFileSync`; if that child emits classifiable JSON and then dies by signal, the shim exits code 0, so this adapter can return a completed result instead of the INV-3 failure, while abort/timeout targets the shim rather than guaranteeing termination of the analyzer child. On Windows the selected `.cmd` file also cannot be launched by Node's `spawn(..., { shell: false })`, so the reference provider cannot run there.
  evidence: The runner controls only the single process at `process-runner.ts:124-129`; B-036 uses a direct injected Node executable at `project-tools.test.ts:397-455`, and B-025 asserts the shim path at `project-tools-fallow.test.ts:390-430`, so neither test exercises the installed shim's nested-child crash or cancellation semantics. A local reproduction with the pinned shim produced valid JSON and outer `{ code: 0, signal: null }` after the nested child sent itself SIGTERM.
  suggestedFix: Resolve and spawn the package-installed platform analyzer directly, without PATH, a command shim, or a shell; alternatively use a process boundary that controls the full tree and preserves the native exit/signal. Add installed-provider crash, abort, timeout, and Windows execution coverage.
  task:
    title: Restore end-to-end provider process evidence and termination
    labels: analysis-runtime, process, cross-platform
    acceptanceCriteria:
      1. A native analyzer signal can never arrive as a completed code-0 analysis result.
      2. Abort and timeout terminate the actual analyzer with no descendant left running.
      3. The project-local provider runs shell-free on Windows and POSIX without PATH or mutable fetch resolution.

- id: F-002
  priority: P1
  severity: high
  confidence: 0.99
  complexity: complex
  title: "[P1] Cached bindings continue execution after consent is revoked"
  files: domains/shared/extensions/project-tools/index.ts, domains/shared/extensions/project-tools/fallow-provider.ts, tests/extensions/project-tools.test.ts
  lineRange: domains/shared/extensions/project-tools/index.ts:514-519
  summary: When consent exists during discovery, the session snapshot caches a bound runtime and later tool calls execute it without consulting user state again. If the user removes consent after agent-start/status discovery, or between the version and config subprocesses, subsequent provider subprocesses still spawn until a lifecycle event clears the snapshot; this is the snapshot-reuse bypass D-014 explicitly forbids.
  evidence: Consent is read once at `fallow-provider.ts:495-505`, while capability calls use the cached runtime at `index.ts:455` and lifecycle clearing occurs only at `index.ts:615-619`. B-034 grants consent by constructing a new extension instance and never tests revocation or a consent change within a reused snapshot.
  suggestedFix: Gate every provider spawn on current external consent and make a revoked decision return the withheld state without invoking the process. Add revocation tests after status injection, during discovery, and before a cached capability call.
  task:
    title: Enforce execution consent at every provider spawn
    labels: analysis-runtime, consent, security
    acceptanceCriteria:
      1. Removing consent after a bound snapshot prevents the next capability subprocess.
      2. Removing consent between introspection subprocesses prevents the later subprocess.
      3. Status/tool results expose `execution-not-consented` after revocation without relying on a new session.

- id: F-003
  priority: P2
  severity: medium
  confidence: 1.0
  complexity: simple
  title: "[P2] Complexity ignores the requested metric"
  files: domains/shared/extensions/project-tools/fallow-provider.ts, tests/extensions/project-tools-fallow.test.ts
  lineRange: domains/shared/extensions/project-tools/fallow-provider.ts:1033-1038
  summary: For any supported metric, `capabilityArgs` runs the same all-metrics health command and normalization returns every complexity finding. A project with only CRAP violations therefore returns `fail` and CRAP findings for a `cyclomatic` request, so consumers cannot degrade or enforce just the requested check as AC-007 and the public tool contract require.
  evidence: The request's `metric` is unused at `fallow-provider.ts:909-912`; the fixture contains two `exceeded: "crap"` findings, yet B-007 requests `cyclomatic` at `project-tools-fallow.test.ts:717-721` and only asserts that some findings exist at lines 766-768. That exact named test proves a weaker all-complexity property rather than metric-specific behavior.
  suggestedFix: Classify/filter findings and derive the verdict for `request.metric` only, while preserving the complete unfiltered native payload; add separate cyclomatic, cognitive, and CRAP result tests.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. A CRAP-only violation does not fail a cyclomatic or cognitive request.
      2. Each supported metric returns only its applicable normalized findings while native evidence remains lossless.

- id: F-004
  priority: P2
  severity: medium
  confidence: 0.99
  complexity: complex
  title: "[P2] The public trace schema accepts targets the provider cannot execute"
  files: lib/analysis/types.ts, domains/shared/extensions/project-tools/index.ts, domains/shared/extensions/project-tools/fallow-provider.ts
  lineRange: lib/analysis/types.ts:95-106
  summary: The public contract and Pi schema accept a symbol target with no path, resolution marks its `target` scope ready, and only the Fallow adapter then rejects it as an `invalid-output` provider failure. Thus a valid `analysis_trace` call such as `{ target: { kind: "symbol", symbol: "render" } }` is misreported as a provider runtime failure; the public duplicate-location type similarly permits an omitted line even though the tool boundary requires one.
  evidence: Symbol `path` is optional in `types.ts:99` and `index.ts:84`, but `fallow-provider.ts:875-878` requires it. Duplicate-location reuses `AnalysisLocation` with optional `line` at `types.ts:105`, while the TypeBox schema requires line. Existing trace tests always provide both path and line-shaped data.
  suggestedFix: Align the stable request type, TypeBox schema, resolver support, and provider contract—either require the provider's necessary target identity in v1 or model unsupported target forms before execution—then add accepted/rejected tests for every target variant.
  task:
    title: Align trace target legality across the public and provider contracts
    labels: analysis-runtime, public-api, types
    acceptanceCriteria:
      1. Every request accepted by the public trace schema is executable by a bound provider or degrades before provider execution.
      2. Symbol and duplicate-location requirements are identical in TypeScript, TypeBox, documentation, and runtime validation.

- id: F-005
  priority: P2
  severity: medium
  confidence: 0.97
  complexity: simple
  title: "[P2] Contradictory exit and envelope evidence can become a clean result"
  files: domains/shared/extensions/project-tools/fallow-provider.ts, tests/extensions/project-tools-fallow.test.ts
  lineRange: domains/shared/extensions/project-tools/fallow-provider.ts:1021-1082
  summary: For verdict-bearing operations the adapter does not validate consistency between exit code, asserted verdict, and normalized findings. For example, exit 1 with a schema-valid zero-finding dead-code envelope is returned as `pass`, and an audit envelope asserting `pass` while carrying embedded findings remains `pass`; these same-schema malformed outcomes should be unclassifiable failures under INV-3 rather than clean results.
  evidence: Dead-code/duplication/complexity/boundary verdicts are derived solely from finding count at lines 1021-1045, while audit trusts `payload.verdict` and requires nested evidence only when it is `fail` at lines 1053-1081. B-009 covers exit 2, an explicit error envelope, invalid JSON, and a verdictless envelope, but no contradictory code/verdict/finding combination.
  suggestedFix: Add per-operation consistency validation before constructing a completed result and throw `invalid-output` for contradictory evidence; add mutation-style cases for code 1 plus pass/empty findings and asserted pass plus non-empty findings.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. Contradictory exit, verdict, and finding evidence throws `AnalysisProviderError`.
      2. Valid clean and finding-bearing envelopes for every verdict-bearing operation still complete with the correct verdict.

- id: F-006
  priority: P2
  severity: medium
  confidence: 1.0
  complexity: complex
  title: "[P2] Behavior tests do not satisfy the exact named-proof contract"
  files: tests/analysis/binding-resolver.test.ts, tests/extensions/project-tools.test.ts, tests/extensions/project-tools-fallow.test.ts, missions/plans/analysis-capability-runtime/plan.md
  lineRange: tests/extensions/project-tools.test.ts:322-356
  summary: The artifact checker passes because it only finds markers, but three required test names do not exist exactly and twelve named tests prove narrower internal properties than their Expected clauses. This fails the slice's hard artifact-conformance gate and leaves the shared resolver/tool/status/provider composition vulnerable to realistic mutations even though marker counts and the suite are green.
  evidence: Full exact proof was found for B-001, B-002, B-008, B-009, B-010, B-028, B-029, B-030, and B-034; B-005 and B-026 prove their content but are named differently (`project-tools.test.ts:322`, `project-tools-fallow.test.ts:998`). B-003 bypasses config/extension composition; B-004 bypasses session status and its unresolvable case is separate; B-006 never calls the boundaries tool; B-007 never calls a registered successful tool; B-011/B-033 test only the pure resolver and cannot prove no provider invocation; B-012 calls discovery/runtime directly rather than status plus every tool; B-025 does not prove its no-PATH end-to-end clause; B-027 has the wrong name and omits symbol/duplicate-location empty variants; B-035 asserts only that some row has each fixture's expected state at `project-tools.test.ts:232-239`; B-036 uses a direct fake executable instead of the installed provider process chain; and B-037 calls `validateEnvelopeSchema` directly at `project-tools-fallow.test.ts:665-706` rather than running status and a capability tool. The third missing exact name is B-027 at `project-tools.test.ts:356`.
  suggestedFix: Rename B-005/B-026/B-027 tests exactly as recorded, then move each behavior's complete public-seam assertions into its named test; add successful registered-tool, unsupported metric/scope no-invocation, status-row, no-write, installed-provider cancellation, and schema-drift tool cases.
  task:
    title: Close analysis runtime behavior-proof gaps
    labels: analysis-runtime, tests, artifact-conformance
    acceptanceCriteria:
      1. All 23 active behaviors have the exact recorded test name and marker.
      2. Each named test proves its full Context/Action/Expected clause through the specified public seam.
      3. Mutations that bypass config preference, call a provider for unsupported input, strip native tool output, misstate a status row, write through a tool, or ignore schema drift make the corresponding named test fail.
