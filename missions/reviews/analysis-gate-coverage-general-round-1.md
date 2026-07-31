# Review Report

base: main
range: 947054a37bbcbbee5457d0274b4f796544f06b45..HEAD
overall: incorrect

## Overall Assessment

Overall: incorrect. The contract, B-043 negative wording, 812c819 exclusive-bucket and boundary-own-capability rules, trace/fix-preview exclusion, and configured concurrency fixture are coherent, and no material scope creep was found. However, boundary coverage can be derived from stale configuration, while the zero-change normalization and the Pi-facing caller lack the required real-envelope and caller-facing regression evidence.

## Findings

- id: F-001
  priority: P1
  severity: high
  confidence: 0.94
  complexity: complex
  title: "[P1] Do not derive invocation coverage from stale discovery config"
  files: domains/shared/extensions/project-tools/fallow-provider.ts
  lineRange: domains/shared/extensions/project-tools/fallow-provider.ts:1175-1179
  summary: When a session discovers configured boundary zones/rules and that configuration is removed before a later `dead-code` or audit invocation, the provider process reads the new configuration but normalization still uses the discovery-time `boundariesConfigured` boolean. Lines 2085 and 2113 then declare `boundary-conformance` covered even though that invocation did not evaluate it, creating the silent-pass direction forbidden by INV-2/INV-3 and violating D-031's “actual invocation” condition; the reverse config change fails closed, so the high severity specifically depends on configured-to-unconfigured mutation within one session.
  evidence: `currentBindings` revalidates consent and executable identity but never provider configuration (lines 1183-1218), while both dead-code and audit coverage consume the cached boolean (lines 2085-2087 and 2113). No test changes boundary configuration between discovery and execution.
  suggestedFix: Revalidate or freeze the provider configuration at the same execution boundary as the capability invocation, and fail closed if its boundary state cannot be matched to that invocation. Add configured→unconfigured and unconfigured→configured regression cases.
  task:
    title: Keep boundary coverage synchronized with invocation configuration
    labels: backend, testing
    acceptanceCriteria:
      1. A boundary configuration change after discovery cannot produce coverage based on the old configuration.
      2. Stable configured and unconfigured runs retain D-031's exact coverage behavior.
      3. Both configuration-change directions have caller-observable regression tests.

- id: F-002
  priority: P2
  severity: medium
  confidence: 0.99
  complexity: complex
  title: "[P2] Prove the zero-change audit fallback with a captured envelope"
  files: domains/shared/extensions/project-tools/fallow-provider.ts, tests/extensions/project-tools-fallow-fixtures.test.ts
  lineRange: domains/shared/extensions/project-tools/fallow-provider.ts:1994-2003
  summary: `emptyAuditSummaryReports` is needed to avoid rejecting Fallow's legitimate no-change audit shape, but the patch promotes absent sub-envelopes to covered categories solely from zero summary counters without the captured-envelope proof required by B-041. The only captured audit fixture has `changed_files_count: 3`, so none of the fallback branches at lines 2039, 2051, and 2059 is exercised; a realistic mutation could over- or under-declare a clean gate while all tests continue to pass.
  evidence: The B-041 fixture test asserts the existing changed audit at lines 419-429 and 457-461, while line 345 explicitly proves that fixture has three changed files. A review-time read-only probe of pinned Fallow 2.54.2 confirmed that a no-change audit returns `changed_files_count: 0`, zero summary counters, and no sub-envelopes, supporting the fallback's availability purpose but not replacing committed real-envelope evidence.
  suggestedFix: Capture the pinned zero-change envelope, replay it through the adapter, and document why its summary counters establish coverage. Also prove missing/nonzero counters fail closed rather than silently declaring a category.
  task:
    title: Capture and validate no-change audit coverage
    labels: backend, testing, docs
    acceptanceCriteria:
      1. A provenance-labeled Fallow 2.54.2 zero-change envelope is committed and replayed through normalization.
      2. Its declared coverage is asserted, and malformed or contradictory zero-change summaries fail closed.
      3. Provider validation documents the zero-scope derivation separately from sub-envelope derivation.

- id: F-003
  priority: P2
  severity: medium
  confidence: 1.0
  complexity: simple
  title: "[P2] Add coverage regression evidence at the registered tool caller"
  files: domains/shared/extensions/project-tools/index.ts, tests/extensions/project-tools-fallow.test.ts
  lineRange: tests/extensions/project-tools-fallow.test.ts:2359-2363
  summary: The sole pre-existing production caller of the changed runtime is `registerCapabilityTool`, which serializes `snapshot.runtime.execute(...)` through `textResult`, but every new coverage assertion calls `runtime.execute` directly. The existing Pi-tool loop at these lines checks only capability names, so it does not prove that required coverage survives in both `details` and model-visible JSON content, or that the new contradiction remains an error at the caller Quality Manager actually uses; this is the required caller-facing blast-radius evidence for the shared adapter change.
  evidence: Production transport is `domains/shared/extensions/project-tools/index.ts:181-188` and `:491`; B-041/B-042 tests exercise the provider runtime directly. Trace and fix-preview absence is likewise asserted only on direct results, not the registered tool result.
  suggestedFix: Extend the registered-tool integration test to assert identical non-empty coverage in `details` and parsed text for all verdict-bearing tools, no coverage for trace/fix-preview, and an `AnalysisProviderError` for contradictory coverage.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. Registered verdict-bearing tools expose the same coverage in `details` and JSON text.
      2. Registered trace/fix-preview results omit coverage, and contradiction failures remain errors.
