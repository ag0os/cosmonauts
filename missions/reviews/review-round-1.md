# Review Report

base: main
range: a8ca84ba17ed216e3fd0dbd94eff6ccc911ddf2a..HEAD
overall: incorrect

## Overall Assessment

The feature has concrete contract failures in the production corpus adapter, full-mode pipeline, cap enforcement, and pass serialization, so the patch is not release-correct despite all 21 behavior markers resolving and the targeted changed-file suites passing. For the mandatory shared-code blast-radius check, the pre-existing allowlisted callers were the knowledge-store write/noop paths, agent/knowledge recall handlers, combined-context allocator/renderer, and top-level CLI dispatch; their existing return/empty/warning/default semantics have regression coverage in the targeted passing suites, but that coverage does not exercise the mixed and concurrent scenarios below.

## Findings

- id: F-001
  priority: P1
  severity: high
  confidence: 0.99
  complexity: simple
  title: "[P1] Scope-relative corpus IDs collide across project and user stores"
  files: lib/memory/consolidation-sources.ts, tests/memory/consolidation-sources.test.ts
  lineRange: lib/memory/consolidation-sources.ts:131-145
  summary: When project and user knowledge contain the same relative resource (for example `knowledge/preferences.md` in both roots), the production adapter emits the same `id` and `sourceId` for both records, and `collectConsolidationSources()` rejects the second as a duplicate at lines 302-307. Same-name resources across scopes are valid existing memory semantics, so this ordinary input makes `cosmonauts memory consolidate` fail before observation; the source test uses different paths and does not cover the collision.
  suggestedFix: Include scope in the adapter's stable record identity (while retaining the scope-relative `path`) or otherwise make IDs unique across both roots, and add a project/user same-path regression test through the production adapter.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. Project and user records with the same relative path are both admitted with unambiguous IDs.
      2. The production consolidation entry point no longer fails duplicate-ID validation for this case.

- id: F-002
  priority: P1
  severity: high
  confidence: 0.99
  complexity: complex
  title: "[P1] Index pressure is measured from only the capped body subset"
  files: lib/memory/consolidation-sources.ts, lib/memory/living-memory.ts, tests/memory/consolidation-sources.test.ts
  lineRange: lib/memory/consolidation-sources.ts:103-150
  summary: The production source retrieves the complete corpus but then discards everything after `candidates.slice(0, input.limit)`, and the pipeline measures pressure only from those admitted records at `living-memory.ts:261-263`. With the current 237-record corpus, `recordCount` can therefore never exceed 50 and older rows never contribute rendered bytes or headroom, contrary to INV-007/D-008/B-021; user records also consume the same body cap even though the contract calls for complete project+user metadata measurement and up to 50 selected project bodies.
  suggestedFix: Preserve a complete metadata-only measurement set separately from the capped project body records, pass that set to the index policy, and keep user bodies out of the project admission quota.
  task:
    title: "Separate complete corpus measurement from bounded judgment bodies"
    labels: "backend, testing"
    acceptanceCriteria:
      1. More than 50 live records make row pressure visible even though no more than 50 project bodies enter judgment.
      2. All user metadata contributes to pressure without crowding project bodies out of the corpus cap.

- id: F-003
  priority: P1
  severity: high
  confidence: 0.98
  complexity: complex
  title: "[P1] A deterministic finding can bypass or lose full-mode judgment work"
  files: lib/memory/living-memory.ts, tests/memory/living-memory.test.ts
  lineRange: lib/memory/living-memory.ts:264-397
  summary: `needsJudgment` is true only for a deterministic retirement without a proposal, so any non-retirement deterministic finding enters the early return at line 270. In a full pass containing one stale-citation record plus other unrepresented records, the stale edit causes the entire model stage to be skipped; conversely, if a retire-when finding forces the model branch, only normalized model proposals are persisted at lines 491-527 and the deterministic stale edit is dropped. This breaks the required deterministic-first-then-judgment flow and makes B-009 depend incorrectly on what other findings share the pass.
  suggestedFix: Treat deterministic proposal materialization and optional model judgment as composable stages rather than mutually exclusive branches, then add mixed stale/healthy and stale/retire-when full-mode tests.
  task:
    title: "Compose deterministic and model stages without global short-circuiting"
    labels: "backend, testing"
    acceptanceCriteria:
      1. Full mode judges every still-unrepresented record even when another record has a deterministic finding.
      2. Deterministic proposals remain present when retirement evidence also causes model judgment.

- id: F-004
  priority: P1
  severity: high
  confidence: 0.99
  complexity: complex
  title: "[P1] Full mode applies caps independently instead of lossily bounding the pass"
  files: lib/memory/living-memory.ts, tests/memory/living-memory.test.ts
  lineRange: lib/memory/living-memory.ts:438-575
  summary: In the model branch, deterministic retirement candidates are passed to the retirement store without the `maxRetirements` slice/defer logic used by the deterministic branch. Thus six met retire-when conditions in a full pass produce a failed run (`6 > 5`) rather than five actions plus a cap-deferred result; model observations are also validated against a fresh 25-slot cap and then concatenated with up to 25 deterministic observations at lines 629-632, allowing the public result to exceed the hard 25-observation per-pass limit from INV-005/D-010/B-010.
  suggestedFix: Allocate one shared remaining budget across deterministic and model outputs, slice/defer full-mode retirement candidates before `apply()`, and test mixed findings at every total cap.
  task:
    title: "Enforce one lossy budget across full-mode pipeline stages"
    labels: "backend, testing"
    acceptanceCriteria:
      1. Full-mode details never exceed 25 observations, 10 proposals, or 5 retirements in total.
      2. Over-cap deterministic retirements are reported as deferred rather than failing the pass.

- id: F-005
  priority: P1
  severity: high
  confidence: 0.96
  complexity: complex
  title: "[P1] The mutating consolidation pass is not serialized by one lock"
  files: lib/memory/living-memory.ts, lib/memory/consolidation-receipts.ts, lib/memory/consolidation-proposals.ts
  lineRange: lib/memory/living-memory.ts:60-137
  summary: The initial empty `retirementStore.apply()` acquires and releases the lock before source collection, while receipt acceptance, proposal persistence, model work, and episode finalization later run outside that lock; receipt discharge and retirement then take separate short lock sections. During two concurrent passes—or a dry run overlapping an actual pass—there are long mutation windows where `.cosmonauts/living-memory.lock` is absent, so B-011 cannot reliably report concurrent mutation and D-014's pass serialization/state ordering is not enforced.
  suggestedFix: Introduce one pass-level finite-lock owner for mutating runs and make nested stores operate under that ownership; add concurrent mutating/mutating and dry-run/mutating regression tests.
  task:
    title: "Serialize the complete living-memory mutation lifecycle"
    labels: "backend, concurrency, testing"
    acceptanceCriteria:
      1. A mutating pass holds the living-memory lock across receipt, proposal, retirement, and episode-finalization state transitions.
      2. Concurrent dry runs fail closed as concurrent mutation throughout that interval.

- id: F-006
  priority: P2
  severity: medium
  confidence: 0.98
  complexity: simple
  title: "[P2] Failed pre-commit rollback can be reported as no recovery pending"
  files: lib/memory/retirement-store.ts, tests/memory/living-memory.test.ts
  lineRange: lib/memory/retirement-store.ts:615-625
  summary: If an exception occurs after the journal or retired link is written and the catch-block's `recoverJournal()` attempt also fails, the recovery error is discarded and `recoveryAttempt` falls back to the previous value, normally `none`. Because `committed` is still false, the returned failed result says `recovery: "none"` even though the journal and pre-commit state remain for a future run, violating the honest pending-recovery result required by B-012/B-015.
  suggestedFix: Preserve the recovery exception and return `recovery: "pending"` whenever a journal could not be cleared, with a regression that injects rollback removal/sync failure.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. An unsuccessful pre-commit rollback reports pending recovery.
      2. The original and recovery failures remain reviewable in the failed result.

- id: F-007
  priority: P2
  severity: medium
  confidence: 1.0
  complexity: simple
  title: "[P2] Retired state is missing from the public retrieved-record type"
  files: lib/memory/types.ts, lib/memory/knowledge-store.ts, lib/extensions/knowledge-surface/knowledge-tools.ts
  lineRange: lib/memory/types.ts:49-63
  summary: Opt-in retrieval returns records with `retired: true`, and the recall handler has to probe it via `"retired" in record`, but `RetrievedMemoryRecord` does not declare the optional retired discriminator. Typed consumers therefore cannot use the B-003 state promised by the public contract without an assertion or property-in workaround, even though the runtime supplies it.
  suggestedFix: Add `readonly retired?: true` to `RetrievedMemoryRecord` and access it directly in callers, with a compile-time/public-interface assertion.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. Typed callers can narrow and read retired state from opt-in results.
      2. Live/default retrieval remains source-compatible and omits the property.

- id: F-008
  priority: P2
  severity: medium
  confidence: 1.0
  complexity: simple
  title: "[P2] Documentation names a payload kind the adapter rejects"
  files: docs/memory.md, lib/memory/consolidation-job.ts, tests/memory/interface.test.ts
  lineRange: docs/memory.md:483-486
  summary: The documentation tells autonomy-host implementers to send `kind: "memory.consolidate"`, while `parseLivingMemoryPayloadV1()` accepts only `kind: "living-memory.consolidate"`. Following AC-013/AC-018's published contract therefore fails validation before dependency access, and the B-020 documentation pin currently preserves the wrong spelling instead of matching the executable adapter.
  suggestedFix: Change the documented payload kind and its pin to `living-memory.consolidate`, matching the plan and parser.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. The documented closed payload is accepted by `parseLivingMemoryPayloadV1()`.
      2. The documentation test fails on future payload-kind drift.

- id: F-009
  priority: P2
  severity: medium
  confidence: 0.95
  complexity: simple
  title: "[P2] Deterministic edit proposals embed the source frontmatter inside replacement content"
  files: lib/memory/consolidation-sources.ts, lib/memory/living-memory.ts, tests/memory/living-memory.test.ts
  lineRange: lib/memory/living-memory.ts:1525-1558
  summary: The production corpus adapter defines `record.content` as the exact raw file, including YAML frontmatter, but `proposedReplacement()` copies that whole value into `ProposedMemoryRecord.content` while also supplying replacement metadata separately. For every production stale-citation finding, the resulting N=1 replacement therefore has a second frontmatter block inside its body rather than a valid complete metadata/body replacement; the B-009 test only checks that strings appear in the proposal and does not validate the proposed record's promotable shape.
  suggestedFix: Derive the replacement body from parsed markdown content while retaining structured metadata separately, and assert the rendered proposal parses to one canonical replacement record without embedded source frontmatter.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. Production stale-citation proposals contain body-only replacement content plus separate metadata.
      2. Surrounding body text and valid frontmatter fields remain preserved.
