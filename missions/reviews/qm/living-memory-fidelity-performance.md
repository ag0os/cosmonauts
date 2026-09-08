# Performance Review: round 1

## Overall

incorrect

## Assessment

The exact index artifact remains faithful to combined-context injection, and the body ceilings remain intact. However, the production corpus source spends its bounded body allowance before excluding already-represented records, so consolidation stops making progress on a corpus that exceeds that allowance; the same path also exposes one unbounded diagnostic row per deferred file.

## Findings

- id: PRF-001
  dimension: scaling
  priority: P1
  severity: high
  confidence: 1.0
  complexity: complex
  title: "Represented records permanently consume the body-admission window"
  files: lib/memory/knowledge-store.ts, lib/memory/consolidation-sources.ts
  lineRange: lib/memory/knowledge-store.ts:173-210,374-400; lib/memory/consolidation-sources.ts:241-247,267-338
  summary: |
    Body bytes are admitted before represented evidence is excluded, so every
    pass reads the same bounded body set and cannot page into the remaining
    corpus after that set has been represented.
  evidence: |
    `retrieveKnowledge()` walks scopes and lexically sorted paths, and charges each
    successfully read body to `tally.bodyBytesAdmitted` before the corpus source
    knows which evidence keys are already represented. The source later builds
    `admittedBodies` from that fixed set and only then filters represented keys at
    lines 267-313. Therefore every pass spends the same aggregate byte allowance
    on the same path-ordered bodies. Once those records are represented, later
    inventory records have no entry in `admittedBodies` and line 318 skips them;
    no subsequent pass can admit their bodies.

    A read-only probe using the production source and the checkout's 236-record,
    553,396-byte corpus returned 50 records on pass 1, 40 on pass 2, and zero on
    passes 3-5 after carrying each prior pass's evidence keys forward. Pass 3
    still reported 146 omitted records. Thus the permanent paging test's small
    fixture does not exercise the production interaction between represented
    evidence and the 256 KiB aggregate body ceiling.
  scaleConsequence: |
    Total lifetime progress is bounded by the bodies selected during the first
    path-ordered admission window, rather than by 50 new records per pass. The
    current repository already reaches the failure point: 146 valid records can
    remain unjudged indefinitely while repeated runs rescan the whole corpus and
    return no work. Larger corpora increase repeated O(total corpus bytes) I/O
    without increasing useful work.
  suggestedFix: Move represented-key filtering into body admission (or perform bounded body selection after the complete metadata/digest inventory is known) so every pass spends the unchanged byte and record ceilings only on unrepresented project records while preserving the exact full index artifact.
  task:
    title: "Make bounded corpus body admission advance past represented evidence"
    labels: [review-fix]
    acceptanceCriteria:
      - "A production `createProjectCorpusConsolidationSource` fixture whose corpus exceeds `maxCorpusBytes` admits later unrepresented records over successive passes and eventually reaches zero omitted records."
      - "Each pass still admits at most `maxCorpusRecords`, `maxCorpusRecordBytes`, and `maxCorpusBytes`, while pressure measurement continues to use the complete project/user metadata-and-warning artifact."
      - "A regression fixture proves represented bodies do not consume the next pass's aggregate body allowance."

- id: PRF-002
  dimension: io-hot-path
  priority: P2
  severity: medium
  confidence: 1.0
  complexity: simple
  title: "Per-file aggregate deferrals make result and JSON size grow with the full corpus"
  files: lib/memory/consolidation-sources.ts, lib/memory/living-memory.ts
  lineRange: lib/memory/consolidation-sources.ts:250-264,319-347; lib/memory/living-memory.ts:212-224
  summary: |
    Every body deferred by the aggregate ceiling becomes a public decline row,
    making bounded-pass result size scale with the complete corpus rather than
    with the admitted batch.
  evidence: |
    The corpus source converts every read-time body decline into its own object
    and returns the complete array. The consolidator copies all of those rows
    into `details.declines`; only the additional `source-deferred` row is
    aggregated. This is not bounded by `maxCorpusRecords`, `maxObservations`, or
    any output limit. The real read-only command
    `memory consolidate --dry-run --no-model --json` on this checkout produced
    148 decline rows and 49,001 output bytes for 236 records, including 146
    per-file aggregate-byte deferrals.
  scaleConsequence: |
    Runtime result memory and JSON serialization/output are O(N) in every valid
    record beyond the 256 KiB body window even though useful work is capped at
    50 records. At 10x-100x this corpus, repeated no-work runs produce hundreds
    of kilobytes to several megabytes of duplicate deferral text; a 100k-record
    corpus produces tens of megabytes and a correspondingly large contiguous
    JSON string.
  suggestedFix: Keep complete inventory and byte-admission decisions internally, but report aggregate deferral counts/bytes with a bounded sample of paths instead of one public decline object per deferred file.
