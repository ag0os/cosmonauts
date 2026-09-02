# Performance Review: round 1

## Overall

incorrect

## Assessment

The diff correctly fixes model-call count at one and keeps retirement mutations at five records, but the production composition does not preserve those bounds at corpus scale. In particular, the 50-record cap is applied to the complete metadata/index view rather than only to judged bodies, source and citation bytes remain unbounded, and append-only evidence is repeatedly rescanned.

## Findings

- id: PF-001
  dimension: scaling
  priority: P1
  severity: high
  confidence: 1.0
  complexity: complex
  title: "The fixed newest-50 window starves the rest of the corpus and hides index pressure"
  files: lib/memory/consolidation-sources.ts, lib/memory/living-memory.ts, lib/extensions/knowledge-surface/index-policy.ts
  lineRange: lib/memory/consolidation-sources.ts:99-155; lib/memory/living-memory.ts:178-224,261-263; lib/extensions/knowledge-surface/index-policy.ts:41-69
  summary: |
    `createProjectCorpusConsolidationSource.collect` loads and sorts the complete
    project+user result but returns only `candidates.slice(0, input.limit)`. The
    consolidator then computes represented work and calls the pressure policy
    solely with that bounded snapshot. On this checkout the production source
    returned 50 records and reported 186 omitted records. Once those same newest
    50 digests are represented, lines 214-224 return `noop`; no cursor or
    unrepresented-aware selection ever admits the other 186. The pressure policy
    also receives at most 50 knowledge records, so its `records.length > 50`
    condition cannot fire and rendered-byte pressure ignores every omitted row.
    At any corpus size above 50, work is permanently starved and INV-007 is
    measured against a partial index. The 50-body ceiling is a correctness/cost
    boundary for judgment, not an optimization that may truncate the complete
    metadata and pressure view.
  suggestedFix: Separate the complete project+user metadata/index inventory from the capped body batch, and page or rank unrepresented project bodies across passes without exceeding the 50-body/model limits.
  task:
    title: "Preserve complete index pressure while paging bounded corpus bodies"
    labels: [review-fix]
    acceptanceCriteria:
      - "A corpus with more than 50 records processes later unrepresented records on subsequent passes while each pass still admits at most 50 bodies."
      - "KnowledgeIndexPressurePolicy receives complete project+user metadata, so 51 records report pressure while user records remain non-mutation candidates."

- id: PF-002
  dimension: memory
  priority: P1
  severity: high
  confidence: 0.99
  complexity: complex
  title: "Count caps do not bound source bytes or the model payload"
  files: lib/memory/types.ts, lib/memory/knowledge-store.ts, lib/memory/consolidation-sources.ts, lib/memory/living-memory.ts, cli/memory/judgment-provider.ts
  lineRange: lib/memory/types.ts:206-213,244-250; lib/memory/knowledge-store.ts:112-151; lib/memory/consolidation-sources.ts:97-155,174-210; lib/memory/living-memory.ts:900-920,1224-1241; cli/memory/judgment-provider.ts:151-171
  summary: |
    `LivingMemoryLimits` bounds record and output counts but has no byte limits.
    Corpus retrieval reads and retains every complete record before the source
    slices to 50, selected corpus and episode files are read whole again, and
    `buildJudgmentPrompt` JSON-serializes all admitted content without truncation
    or rejection. Citation files are likewise read wholly, and one retirement
    observation includes every inbound citation as an evidence ref, so citation
    fan-in can make a single capped observation O(D) in the number of citing
    documents. The current 50-record batch is already 166,374 bytes; 50 1-MiB
    records produce a 50+ MiB request, while one very large Markdown file controls
    peak memory and can exceed the model context before the one-request limit
    helps. Complete metadata/citation discovery is correctness-bound and must not
    be silently truncated, but oversized files or aggregate evidence need a
    fail-closed bound before model invocation or retirement.
  suggestedFix: Add explicit per-record, aggregate judgment-payload, and citation-evidence byte ceilings, using metadata-only discovery and fail-closed oversized-inventory reporting rather than silently omitting safety evidence.
  task:
    title: "Bound living-memory source and judgment bytes"
    labels: [review-fix]
    acceptanceCriteria:
      - "Corpus and episode scans never materialize more body bytes than a documented per-pass ceiling, and an oversized individual record is deferred or rejected before model invocation."
      - "Citation completeness remains fail-closed when a file or evidence fan-in exceeds its bound, and no retirement is authorized from truncated citation evidence."
      - "The serialized model prompt has a tested hard byte ceiling in addition to the one-request and record-count limits."

- id: PF-003
  dimension: io-hot-path
  priority: P2
  severity: medium
  confidence: 0.99
  complexity: complex
  title: "One pass repeatedly reparses the same citation, proposal, and receipt histories"
  files: lib/memory/living-memory.ts, lib/memory/retirement-store.ts, lib/memory/consolidation-proposals.ts, lib/memory/retirement-receipts.ts
  lineRange: lib/memory/living-memory.ts:65-74,116-141,226-263; lib/memory/retirement-store.ts:508-551,629-684; lib/memory/consolidation-proposals.ts:57-65,547-619; lib/memory/retirement-receipts.ts:71-99,194-270,296-340
  summary: |
    Every non-dry pass first calls retirement `apply` with an empty candidate
    list. `applyUnderLock` still calls `authorizeCandidates`, which folds all
    promotion/retirement receipts and scans the complete citation inventory even
    though there is nothing to authorize. The main pass later scans citations for
    deterministic evidence and again under the retirement lock (the latter is a
    required safety revalidation). In parallel, `readEvidence()` and
    `readMaterializations()` both invoke the same full proposal-directory reader,
    so every proposal is read, parsed with gray-matter, and hashed twice. Receipt
    inventories are also folded again during inspection, authorization, and round
    allocation. The current citation inventory is 279 Markdown files / 1,327,200
    bytes, so the empty recovery call alone adds a full avoidable traversal.
    Per-pass cost is O(D + P + H) in citation documents, proposals, and historical
    rounds with large duplicate constants; because P and H are append-only, the
    cumulative cost over regular runs becomes O(R²). Full under-lock revalidation
    is correctness-bound; the empty-candidate scan and duplicate proposal/fold
    reads are not.
  suggestedFix: Skip authorization work for empty recovery, derive evidence from one proposal materialization read, and reuse folded inventories within a phase while retaining the required under-lock revalidation.
  task:
    title: "Remove duplicate living-memory evidence scans"
    labels: [review-fix]
    acceptanceCriteria:
      - "A clean empty recovery checks only journal/recovery state and does not scan citations or fold authorization receipts."
      - "One consolidation phase reads and parses each proposal at most once while deriving both materializations and evidence."
      - "Tests distinguish reusable preflight folds from the mandatory fresh citation/receipt validation performed under the retirement lock."

- id: PF-004
  dimension: measurement
  priority: P3
  severity: low
  confidence: 1.0
  complexity: simple
  title: "Consolidation exposes no scan, model, or phase-duration telemetry"
  files: lib/memory/types.ts, cli/memory/subcommand.ts
  lineRange: lib/memory/types.ts:160-187; cli/memory/subcommand.ts:250-283
  summary: |
    `MemoryConsolidateDetails` reports admitted/omitted counts and outcomes but no
    bytes read, files scanned, model-request count, model latency, or total/phase
    duration. The CLI renders only completion kind/reason. Consequently an
    operator cannot tell whether a slow pass is dominated by corpus discovery,
    citation revalidation, receipt/proposal folding, durability syncs, or the
    model request, and regressions from corpus/history growth are invisible after
    shipping.
  suggestedFix: Add per-phase duration plus files/bytes/model-call telemetry to the structured consolidation result or an equivalent trace/metric sink.
