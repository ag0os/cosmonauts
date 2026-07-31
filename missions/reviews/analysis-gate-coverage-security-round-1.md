# Security Review: round 1

## Overall

incorrect

## Assessment

The changed Fallow normalization path can fail open at the provider-process JSON trust boundary. A schema-version-valid audit can omit every analyzer sub-envelope yet obtain clean declared coverage from zero-valued summary counters, contradicting D-029/D-031 and INV-2/INV-3.

## Findings

- id: SR-001
  dimension: input-validation
  priority: P1
  severity: medium
  confidence: 0.99
  complexity: simple
  title: "Zero audit summaries declare coverage for analyzers that supplied no evidence"
  files: domains/shared/extensions/project-tools/fallow-provider.ts
  lineRange: 1994-2069
  evidence: |
    `auditEnvelope` represents an omitted `dead_code`, `duplication`, or `complexity` sub-envelope as `null`. The new `emptyAuditSummaryReports` fallback then treats `changed_files_count === 0` plus the corresponding top-level summary counter being zero as proof that the omitted analyzer was covered (lines 1994-2003), and `auditFindings` pushes that category into `coverage` without normalizing any analyzer envelope (lines 2039-2060).

    This is reachable from the external provider-process JSON boundary with an exit-0 payload such as `{"schema_version":3,"base_ref":"HEAD","verdict":"pass","changed_files_count":0,"summary":{"dead_code_issues":0,"duplication_clone_groups":0,"complexity_findings":0}}`. It has no analyzer sub-envelopes, but normalization returns an empty-findings pass covering `dead-code`, `duplication`, and `complexity` (and also `boundary-conformance` when the earlier config snapshot says boundaries are configured). The exit code, asserted verdict, and empty normalized findings all agree, so `reconcileVerdictEvidence` does not reject it.

    Consequently, a buggy or compromised provider can skip an analyzer and emit zero summary fields; the Quality Manager can then resolve that gate as passed. This is precisely the absent-evidence inference rejected by D-029, violates D-031's requirement that audit coverage follow sub-envelopes actually present and normalized, and presents unclassifiable provider output as clean contrary to INV-2/INV-3.
  suggestedFix: Require each declared audit category to have its corresponding sub-envelope present and successfully normalized; treat an omitted sub-envelope as invalid/unclassifiable even when changed-file and summary counters are zero.
