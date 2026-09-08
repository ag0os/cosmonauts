# UX Review: round 1

## Overall

incorrect

## Assessment

The new pressure and completeness states are externally visible, but several public-contract paths remain ambiguous or inconsistent for CLI/API consumers. These findings are separate from the closed SR-001 through SR-009 defects and concern compatibility and diagnostics at the result boundary.

## Findings

- id: UR-001
  dimension: consistency
  priority: P1
  severity: medium
  confidence: 1.0
  complexity: simple
  title: "Existing pressure policies can silently produce an invalid JSON result"
  files: lib/memory/types.ts, lib/memory/living-memory.ts
  lineRange: lib/memory/types.ts:290-310; lib/memory/living-memory.ts:228-250,464-480,934-940
  evidence: |
    The exported `KnowledgeIndexPressurePolicy` changed from receiving a record array and
    returning the former six-field result to receiving `KnowledgeIndexRenderInput` and returning
    a required `kind: "measured"` variant. The consolidator does not validate or normalize that
    collaborator result: it stores it directly, and every value whose `kind` is not exactly
    `"measured"` is treated as unusable. A precompiled JavaScript policy returning the old object
    therefore yields `details.indexPressure` with no discriminant, an
    `index-pressure-unusable` decline whose `reason` is `undefined` (and disappears when JSON is
    serialized), and silently blocked retirement. An old policy that treats the new input as an
    array can instead throw; the catch returns post-collection details with no `indexPressure` at
    all.
  userConsequence: |
    API hosts upgrading Cosmonauts can receive JSON outside the exported union, including the
    contradictory combination `targetSatisfied: true` plus an unusable-pressure decline, or see
    consolidation behavior change without a usable migration diagnostic.
  suggestedFix: Validate the policy boundary and either adapt the previous contract safely or return an explicit structured compatibility failure instead of publishing an unrecognized pressure shape.

- id: UR-002
  dimension: confusing-states
  priority: P1
  severity: medium
  confidence: 1.0
  complexity: simple
  title: "Incomplete-inventory failures do not identify the incomplete source"
  files: lib/memory/types.ts, lib/memory/consolidation-sources.ts, lib/memory/living-memory.ts
  lineRange: lib/memory/types.ts:166-194; lib/memory/consolidation-sources.ts:785-804,909-925; lib/memory/living-memory.ts:252-268
  evidence: |
    Each source must now declare `inventoryComplete`, but aggregation reduces those declarations
    to one boolean. The public `details.sources` rows retain only `sourceId`, `admitted`, and
    `omitted`, and the fatal `source-inventory-incomplete` decline names no source. A valid custom
    source may return `inventoryComplete: false`, `omitted: 0`, and no warning; with multiple
    sources the resulting JSON contains only the generic failure and gives no indication which
    adapter blocked the pass. Production user-scope read/parse warnings can likewise make the
    aggregate incomplete while the project-oriented omitted count remains zero.
  userConsequence: |
    A CLI owner or API host cannot reliably locate the source that must be repaired, so recovery
    requires inspecting every configured source or reproducing the run with private diagnostics.
  suggestedFix: Preserve per-source completeness in `details.sources` and identify the incomplete source in the structured decline.

- id: UR-003
  dimension: confusing-states
  priority: P2
  severity: medium
  confidence: 1.0
  complexity: simple
  title: "Read and parse failures are mislabeled as bounded source deferrals"
  files: lib/memory/consolidation-sources.ts, lib/memory/living-memory.ts
  lineRange: lib/memory/consolidation-sources.ts:282-290,340-349,402-411; lib/memory/living-memory.ts:212-223
  evidence: |
    The changed corpus and episode paths increment `omitted` for warned read/parse omissions and
    malformed episode records, then mark inventory incomplete. Result assembly maps every source
    with any omitted count to `code: "source-deferred"` and states that the records "were deferred
    by the bounded source pass." These omissions were not deferred by a record, byte, or aggregate
    cap; they are integrity/read failures that make the whole result `failed`.
  userConsequence: |
    Machine consumers can classify a malformed or unreadable record as ordinary bounded backlog,
    and owners may retry or raise limits instead of repairing the path named by the warning.
  suggestedFix: Emit bounded-deferral diagnostics only for actual cap deferrals and use a distinct source-integrity diagnostic for read/parse omissions.

- id: UR-004
  dimension: consistency
  priority: P2
  severity: medium
  confidence: 0.99
  complexity: simple
  title: "Unusable pressure reports different retirement diagnostics by model mode"
  files: lib/memory/living-memory.ts
  lineRange: lib/memory/living-memory.ts:464-529,628-650,873-898
  evidence: |
    In the full/model path, every retirement blocked by unusable pressure is represented as
    `status: "deferred"` and receives a path-specific `retirement-pressure-deferred` decline. In
    the deterministic/no-model path, the same pressure gate empties `retirementCandidates`, but
    `reportedRetirements` falls back to the deterministic retirement rows and the decline list
    never adds `retirement-pressure-deferred`. Those rows retain only the authority reason
    `retire-when-met`, which does not explain why application was deferred.
  userConsequence: |
    Automation cannot use one decline code to identify pressure-blocked retirements across
    `--no-model` and default runs, and a user inspecting the deterministic JSON must infer the
    cause by correlating a global unusable-pressure state with otherwise unexplained deferred
    rows.
  suggestedFix: Report the same path-specific pressure-deferred retirement rows and decline codes in both model modes.
