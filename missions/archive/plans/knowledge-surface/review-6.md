# Plan Review: knowledge-surface

## Findings

- id: PR-001
  dimension: interface-fidelity
  severity: medium
  title: "The chosen production spawner cannot honor mid-flight backfill cancellation"
  plan_refs: D-020, B-010, Design §7, Files to Change backfill entry, Implementation Order Stage 7A
  code_refs: lib/orchestration/types.ts:347-361, lib/orchestration/agent-spawner.ts:105-108, lib/orchestration/agent-spawner.ts:146-164, lib/orchestration/agent-spawner.ts:215-233
  description: |
    The plan gives `runKnowledgeSurfaceBackfill` an `AbortSignal`, requires cancellation to restore config, and says production `distillSlug` uses `createPiSpawner`. The existing spawner's `SpawnConfig.signal` is documented as cancellation, but `createPiSpawner.spawn` checks it only before preparing the session. Once running, both `session.prompt(config.prompt)` and the child-completion prompt loop ignore the signal, and `dispose()` is a no-op. A dependency-injected fake can therefore make B-010's cancellation test pass while the real distiller continues running with the knowledge gate frozen ON.

    The production seam needs cancellation that actually aborts and awaits the Pi session before the batch restores config or returns. The plan currently assigns no change to `lib/orchestration/agent-spawner.ts` and no real-spawner cancellation test, so a worker cannot satisfy the stated behavior through the chosen composition without inventing an additional contract.

- id: PR-002
  dimension: risk-blast-radius
  severity: medium
  title: "The combined recall limit does not preserve the shipped profile pin"
  plan_refs: B-005, B-006, Design §5, Implementation Order Stage 4
  code_refs: domains/shared/extensions/agent-memory/index.ts:495-512, docs/memory.md:214-221
  description: |
    Design §5 says the new combiner merges records, sorts once, and applies the visible limit across knowledge plus authorized authored memory. Current Cosmo recall deliberately removes profiles from that limit and prepends every matching profile; the shipped documentation says this is required so full-profile recovery cannot be shadowed by newer records. No revised behavior or quality assertion preserves that rule.

    Implemented literally, five newer knowledge matches can consume the default limit and omit a matching profile. That regresses the existing recovery path precisely when the feature is enabled. The planner should make the profile-outside-limit rule explicit at the combined-recall seam and add a negative with more than the requested number of newer knowledge matches.

- id: PR-003
  dimension: state-sync
  severity: high
  title: "Byte-for-byte config restoration can overwrite edits made during the backfill"
  plan_refs: D-013, D-016, B-010, Design §7, R-009, Quality Contract assertion 6, Implementation Order Stage 7A
  code_refs: .cosmonauts/config.json:1-25, lib/config/loader.ts:43-103
  description: |
    The batch snapshots `.cosmonauts/config.json`, atomically writes a temporary enabled version, runs 19 model-backed distillations, and then restores the snapshot unconditionally. The current config contains live project settings, and the config layer is a plain file read with no version, compare-and-swap, or writer coordination. Any human or concurrent agent edit made during that potentially long window is silently replaced by the old bytes in `finally`.

    B-010 covers success, induced failure, and cancellation but not a competing config write. The plan needs a defined conflict outcome that cannot lose the concurrent edit. Because D-016 human-ratified the exact temporary-enable/byte-restoration mechanism, any remediation that weakens unconditional byte restoration touches ratified ground and must be escalated rather than patched as an ordinary derived change.

- id: PR-004
  dimension: lifecycle-invariant
  severity: medium
  title: "Failed or cancelled distillation leaves unindexed proposal state with no workflow owner"
  plan_refs: D-019, D-020, B-010, Design §4, Design §7, Quality Contract assertions 6-7, Implementation Order Stage 7A/7B
  code_refs: lib/memory/types.ts:76-91, lib/memory/markdown-store.ts:65-98, lib/orchestration/agent-spawner.ts:125-153
  description: |
    Proposal writes use the shared per-record `MemoryStore.write` contract, so each successful tool call is durable immediately; there is no batch transaction. The review index is written only after all slugs validate. If a distiller writes one or more proposals and then fails or is cancelled, those files remain without a review index. Stage 7B is reached only after machine GREEN, so it does not own rejection or deletion of this partial set.

    D-019 only deduplicates a retry with identical stable content. Re-running a model-backed distiller can produce different titles or content and therefore new canonical keys beside the orphaned files. The induced failure/cancellation behavior must specify and test the proposal-set exit—cleanup, quarantine, or an explicit resume/baseline rule—before Stage 7A can close; otherwise retries can accumulate unreviewed records that no approval artifact binds.

## Missing Coverage

- A real `createPiSpawner` run cancelled after session start, proving the Pi session terminates before config restoration and batch return.
- A combined recall query with more than the requested limit of newer knowledge records plus a matching user profile, proving the profile remains pinned outside the limit.
- A concurrent edit to `.cosmonauts/config.json` between temporary enablement and restoration, with a non-destructive observable outcome.
- Failure or cancellation after one proposal tool call, followed by rerun, proving no orphaned or duplicate proposal set escapes the review index.
- Enabled agent-memory-owned `recall` metadata and visible result wording that truthfully describe knowledge results; the current tool description says only authored notes/profile/playbooks (`domains/shared/extensions/agent-memory/index.ts:224-237`).
- Project-wide proof that the deleted JSONL API has no production consumers remains unavailable because dead-code and trace capabilities are unbound.

## Coverage Ledger

- dimension: interface-fidelity
  status: checked
  checked: Compared the plan with `MemoryStore`, current authored recall, session assembly, both resource-loader paths, Pi inline-factory types/loading, and the production `createPiSpawner`/`SpawnConfig.signal` contract.
  findings: PR-001, PR-002
- dimension: duplication
  status: unchecked
  checked: `analysis_status` reports duplication unbound with reason `execution-not-consented` for provider `fallow`; manual reading of the named parser/store/combiner/factory seams cannot establish project-wide structural uniqueness.
  findings: none
- dimension: state-sync
  status: checked
  checked: Traced gate freezing/reassembly, proposal identity and retries, backfill config snapshot/restore, concurrent config mutation, review-index timing, and partial proposal state.
  findings: PR-003, PR-004
- dimension: risk-blast-radius
  status: unchecked
  checked: Manually traced enabled/OFF sessions, authored-memory regression risk, package hosts, migration, backfill, and approval. Project-wide reachability of the proposed JSONL deletions could not be established because dead-code and trace capabilities are unbound (`execution-not-consented`, provider `fallow`).
  findings: PR-002
- dimension: user-experience
  status: checked
  checked: Walked enabled recall, profile recovery, config edits, ordinary cancellation, failed/rerun backfill, human approval, and OFF/package-host behavior.
  findings: PR-001, PR-002, PR-003, PR-004
- dimension: behavior-spec
  status: checked
  checked: Reviewed all 13 behaviors for AC sources, executable inputs/results, seams, named tests, markers, failures, cancellation, and lifecycle exits.
  findings: PR-001, PR-002, PR-003, PR-004
- dimension: architecture-record
  status: unchecked
  checked: Manually compared the plan with `knowledge-and-memory.md` and `code-structure-map.md`, including `MemoryStore` direction, proposal authority, derived-map separation, disk truth, and the combined budget. Project-wide boundary conformance remains unchecked because `analysis_status` reports it unbound (`execution-not-consented`, provider `fallow`).
  findings: none
- dimension: quality-contract
  status: checked
  checked: Reviewed the eight plan assertions and ordered abstract gate ladder against authorization, migration, recurring cost, backfill failure/cancellation, approval, and degraded structural evidence.
  findings: PR-001, PR-002, PR-003, PR-004
- dimension: lifecycle-invariant
  status: checked
  checked: Attacked extension reload/replacement, proposal retry and exit states, partial writes, config restoration, cancellation, approval/rejection, migration, and recurring scans.
  findings: PR-001, PR-003, PR-004
- dimension: constraint-ownership
  status: checked
  checked: Traced D-017-D-025, behavior seams, Files to Change, and Stages 1-9 into worker-visible ownership, including the production spawner and backfill cleanup paths.
  findings: PR-001, PR-004
- dimension: scope-size
  status: checked
  checked: The plan has 13 behaviors, one above guidance, but R-011 records a seam-based justification and the Implementation Order supplies two delivery slices plus eight candidate worker slices.
  findings: none

## Assessment

The plan remains viable, but it is not ready for task creation. Resolve the config-restoration collision first: the current mechanism can destroy concurrent project-config edits, and changing its exact-restore promise intersects human-ratified D-016.
