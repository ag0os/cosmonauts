# Integration Report

plan: analysis-capability-runtime
overall: incorrect

## Overall Assessment

The local refs match the requested range (`main` at `3d527eeb43ad6d4bcca50d2eaa410bdf1ce20dc7`, feature head `776505fce2431d14ccd191e053aa50e2bb1b2dd4`), and the two accepted deviation commits are limited in the branch history to the three-slice artifact retarget and B-036's 30-second precondition wait; B-036 remains tool-level under TASK-519. Consumer rewiring and sibling-plan work were excluded, but the runtime is not integration-correct because supported complexity requests ignore their requested metric, several named behavior proofs stop short of declared seams (including INV-3/INV-5 safety seams), and the tool rewrites an explicit audit base instead of preserving it literally.

## Findings

- id: I-001
  priority: P1
  severity: high
  confidence: 0.99
  complexity: complex
  contract: B-007/B-011 and Design §1 complexity request contract
  files: domains/shared/extensions/project-tools/fallow-provider.ts, tests/extensions/project-tools-fallow.test.ts
  lineRange: domains/shared/extensions/project-tools/fallow-provider.ts:793-915
  summary: A complexity request carries one required metric, but `capabilityArgs` maps every metric to the same `health --complexity` invocation and `normalizeComplexityFindings`/`analysisFindings` return every provider finding without consulting `request.metric` (`fallow-provider.ts:793-815`, `fallow-provider.ts:906-909`, `fallow-provider.ts:1032-1038`). The captured mixed envelope includes CRAP-only findings, while the B-007 test sends `metric: "cyclomatic"` and merely asserts a nonempty failing result (`tests/extensions/project-tools-fallow.test.ts:714-760`), so a cyclomatic request can be failed by unrelated CRAP or cognitive findings. This contradicts the declared one-requested-metric tool contract and makes metric-specific gate discrimination unreliable.
  suggestedFix: Make the adapter honor the requested metric—either invoke a provider operation that natively scopes to it or classify/filter the mixed envelope using validated provider evidence—then derive the generic findings and verdict only from that metric while retaining the complete native payload. Add mixed-envelope tests for all three supported metrics and preserve B-011's no-invocation behavior for unsupported metrics.
  task:
    title: Honor requested complexity metrics in Fallow execution and normalization
    labels: backend, testing, review-fix
    acceptanceCriteria:
      1. Each supported metric request returns only findings relevant to that metric and derives its verdict from that metric-specific set while preserving the full native envelope.
      2. Mixed-envelope tests prove cyclomatic, cognitive, and CRAP requests discriminate different findings, and unsupported metrics still return before provider invocation.

- id: I-002
  priority: P1
  severity: high
  confidence: 0.99
  complexity: complex
  contract: Behavior seams and Quality Contract artifact-conformance (B-004, B-010–B-012, B-033, B-037; INV-3/INV-5)
  files: tests/extensions/project-tools.test.ts, tests/analysis/binding-resolver.test.ts, tests/extensions/project-tools-fallow.test.ts
  lineRange: tests/extensions/project-tools-fallow.test.ts:1103-1188
  summary: Several named tests do not exercise every seam or action their behaviors declare. B-004 calls `discoverFallowProvider` directly instead of requesting extension status (`tests/extensions/project-tools.test.ts:457-546`); B-011 and B-033 stop at the pure resolver and have no registered-tool proof that execution is skipped (`tests/analysis/binding-resolver.test.ts:99-151`); B-010 enters the adapter runtime directly rather than the `analysis_audit` tool (`tests/extensions/project-tools-fallow.test.ts:928-984`); B-037 calls `validateEnvelopeSchema` directly rather than running an out-of-contract result through capability execution/status (`tests/extensions/project-tools-fallow.test.ts:626-690`); and B-012 snapshots around direct discovery/runtime calls and checks the exported name constant rather than invoking `analysis_status`, all seven registered tools, and the actual registration surface (`tests/extensions/project-tools-fallow.test.ts:1124-1188`). The current wiring often appears correct, but these are partial-seam proofs under the plan's explicit integration rule and would not catch realistic wrapper, registration, or error-transport regressions at the INV-3/INV-5 boundaries.
  suggestedFix: Extend the named tests through `createProjectToolsExtension`/registered tools. Assert complete B-004 status, B-010 literal-base/error behavior, B-011/B-033 structured degradation with zero executor calls, and B-037 unsupported-schema tool failure. Rework B-012's live-engine snapshot to invoke `analysis_status` and every registered capability tool and inspect the actual registered tool set for absence of apply operations.
  task:
    title: Complete end-to-end behavior proofs at every declared project-tools seam
    labels: testing, integration, review-fix
    acceptanceCriteria:
      1. B-004, B-010, B-011, B-033, and B-037 each have registered-tool/status tests that prove their full Expected clauses and provider-invocation constraints.
      2. B-012 snapshots the whole worktree around `analysis_status` plus all seven registered capability tools using the real pinned engine and proves the actual registration contains no apply tool.
      3. All active behavior markers remain exact and B-032 remains withdrawn with no executable test.

- id: I-003
  priority: P2
  severity: medium
  confidence: 0.88
  complexity: simple
  contract: B-010 explicit-base literal preservation
  files: domains/shared/extensions/project-tools/index.ts, tests/extensions/project-tools-fallow.test.ts
  lineRange: domains/shared/extensions/project-tools/index.ts:224-229
  summary: The shared `nonemptyString` validator returns `value.trim()` (`index.ts:224-229`), and `analysis_audit` stores that rewritten value as the changed-scope base (`index.ts:371-379`). B-010 requires a valid base to be passed literally and echoed in scope, but its test uses only the already-normalized string `HEAD` (`tests/extensions/project-tools-fallow.test.ts:947-969`), so a nonempty input such as `" HEAD "` is silently changed to another ref rather than rejected or preserved. Rewriting the review base weakens the explicit-scope contract even though empty/whitespace-only inputs are rejected correctly.
  suggestedFix: Use audit-specific validation that checks trimmed non-emptiness without silently rewriting an accepted base; reject leading/trailing whitespace if it is not a valid literal ref. Add a registered-tool test covering a whitespace-padded nonempty base and proving no widened or rewritten provider invocation occurs.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. Every accepted audit base reaches the provider and result scope byte-for-byte unchanged; inputs requiring normalization are rejected before invocation.
      2. A tool-level regression test covers a whitespace-padded nonempty base and a valid literal base.
