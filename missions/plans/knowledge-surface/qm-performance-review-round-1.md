# Performance Review: round 1

## Overall

incorrect

## Assessment

The bounded injection and current 136-record knowledge scan are within their stated limits, and the accepted disk-authoritative O(N) design does not itself warrant a finding. However, the new scan telemetry omits architecture freshness work, and the D-025 evidence disables a production-authorized worker section, so the recorded pass does not cover the actual recurring enabled-turn cost.

## Findings

- id: PRF-001
  dimension: measurement
  priority: P1
  severity: medium
  confidence: 0.99
  complexity: complex
  title: "Architecture scan statistics count returned records, not the source-tree scan"
  files: lib/architecture-map/retrieval.ts, lib/extensions/knowledge-surface/combined-context.ts
  lineRange: lib/architecture-map/retrieval.ts:90-112; lib/extensions/knowledge-surface/combined-context.ts:145-154
  summary: |
    `retrieve()` runs `checkFreshness` before reading the architecture record, but then reports
    `filesScanned` as only `result.records.length` and `bytesRead` as only returned record content.
    The combined handler sums these values as its per-turn scan telemetry. With a generated map,
    freshness recursively walks the configured source roots and performs one sequential `stat` per
    source file; this repository currently has 267 TS/TSX source files, yet the architecture section
    can report only one scanned file. In a 100k-file TypeScript monorepo, the turn performs roughly
    100k sequential stats and can exceed the 250 ms gate while the exposed counter still says one,
    preventing the new measurement surface from detecting the scaling failure.
  suggestedFix: Include freshness/config/index filesystem work in architecture retrieval stats before aggregating the combined-context counters.
  task:
    title: "Make architecture per-turn scan statistics reflect actual freshness IO"
    labels: [review-fix]
    acceptanceCriteria:
      - "Architecture retrieval stats count source files inspected during freshness evaluation and bytes actually read for config/index retrieval."
      - "A test with multiple source files proves combined-context aggregate stats increase with the freshness scan rather than only with returned records."

- id: PRF-002
  dimension: measurement
  priority: P1
  severity: medium
  confidence: 0.99
  complexity: complex
  title: "D-025 evidence measures a non-production coding/worker authorization profile"
  files: missions/reviews/knowledge-surface-scan-cost.md, lib/agents/session-assembly.ts, lib/extensions/knowledge-surface/combined-context.ts
  lineRange: missions/reviews/knowledge-surface-scan-cost.md:18-26; lib/agents/session-assembly.ts:186-218; lib/extensions/knowledge-surface/combined-context.ts:65-93
  summary: |
    The evidence says its enabled `coding/worker` has no architecture authorization and therefore
    records exactly the 136 knowledge files. Production session assembly instead derives the
    architecture wrapper from resolved extensions and authorizes `coding/worker`; the combined
    handler then runs that retrieval on every turn. The artifact also exercises no authored-memory
    turn. Consequently its 13.955 ms p95 and 136-file maximum establish only a knowledge-only custom
    composition, not the recurring enabled-session composition named by D-025. On a worker project
    with a generated map and 100k source files, the omitted architecture freshness walk can cross
    250 ms while this artifact remains a pass; even in this repository it excludes the production
    worker's architecture branch and its config/index IO.
  suggestedFix: Re-run and validate the 20-turn gate through production session assembly, covering the worker architecture branch and an authored-memory-authorized turn, after scan telemetry is made complete.
  task:
    title: "Replace D-025 evidence with production-composed enabled-turn measurements"
    labels: [review-fix]
    acceptanceCriteria:
      - "The recorded worker samples use the authorization selected by `buildSessionParams` and include architecture retrieval when the worker definition requests it."
      - "The evidence includes an authored-memory-authorized enabled turn or explicitly reports its separate measured cost, with all combined-handler IO included in threshold evaluation."
      - "The artifact verdict and raw rows are regenerated from the corrected measurements rather than retaining the current knowledge-only values."
