# Integration Report

plan: knowledge-surface
task: TASK-568
overall: correct
reviewedAt: 2026-08-21

## Overall Assessment

The integrated knowledge-surface implementation satisfies the two bound gates.
The mutation, duplication, complexity, boundary-conformance, and dead-code
capabilities remain unbound with execution not consented, so the findings below
are explicitly degraded reviewer judgments, not mechanical passes. No behavior
expectation was changed to obtain GREEN and no Stage-9 production-code repair was
needed.

The initial artifact check exposed one derived plan/reality collision: B-010
still named `tests/prompts/archive-skill.test.ts`, while TASK-565 implemented and
marked it in `tests/scripts/knowledge-surface-backfill.test.ts`. Before continuing,
the plan was amended on-record to the executable owner, multiline decision
headings were normalized for the existing artifact parser without changing their
decisions, and the distiller prompt/definition pairing was made explicit. The
same check then returned `ok: true`, 13 behaviors, and zero issues. This is the
only integration repair; its red-before-green evidence is the two ordered
`cosmonauts plan check-artifacts knowledge-surface --json` results.

## Ordered Quality Contract

| Order | Gate | Binding | Result |
| ---: | --- | --- | --- |
| 1 | correctness | bound | PASS — all nine named behavior files passed (140 tests), then `bun run test`, `bun run lint`, and `bun run typecheck` passed. The first full-suite run hit the unrelated cross-plan commit-lock timing test; that test passed in isolation and the complete native suite passed on rerun. |
| 2 | artifact-conformance | bound | PASS — `cosmonauts plan check-artifacts knowledge-surface --json` returned `ok: true`; B-001 through B-013 each resolve to an existing named test file with the exact marker and no issues. |
| 3 | mutation | unbound bindable | DEGRADED reviewer judgment: acceptable. Named negative controls are executable and detect the required fault classes; no mutation engine result is claimed. |
| 4 | duplication | unbound bindable | DEGRADED reviewer judgment: acceptable. Targeted source/search inspection found one implementation for every named knowledge-surface responsibility; no project-wide duplication-tool result is claimed. |
| 5 | complexity | unbound bindable | DEGRADED reviewer judgment: acceptable. The parser/store/combiner/allocator/composer/tool/lifecycle seams remain focused and separately testable; no complexity-tool result is claimed. |
| 6 | boundary-conformance | unbound bindable | DEGRADED reviewer judgment: acceptable for the knowledge-surface delta. Dependency direction, wrappers, authorization, and documented trust seams were checked manually; no boundary-tool result is claimed. |
| 7 | dead-code | unbound bindable | DEGRADED reviewer judgment: acceptable. Targeted reachability/scope searches and the full suite found no forbidden surviving or newly introduced surface; no dead-code-tool result is claimed. |

## Artifact Ownership

Each behavior remains owned by exactly one earlier implementing task:

- TASK-560: B-001, B-002, B-004
- TASK-559: B-005, B-008, B-012
- TASK-561: B-006, B-007
- TASK-563: B-009, B-013
- TASK-564: B-003
- TASK-565: B-010
- TASK-567: B-011

TASK-562 and TASK-566 are non-behavior precondition/human checkpoints. TASK-568
owns no B-### behavior.

## Degraded Mutation Judgment

The named tests contain observable negative controls for every required class:

- B-001/B-002 reject traversal, absolute resources, scope/type/provenance loss,
  symlinked roots, nonconforming occupants, changed stable identity, writer-only
  identity changes, and time-advanced same-writer retries.
- B-003's frozen-corpus audit explicitly mutates `planTitle`, body bytes,
  timestamps, destinations, legacy fields, and active JSONL pointers.
- B-007 drives oversized three-surface allocation and the all-empty case,
  asserting the 24,000-byte cap, discoverability, scan details, and no message.
- B-005/B-006 use synthetic ineligible wrapper owners and store spies to catch
  authored-memory/architecture authorization widening, direct IO, duplicate
  recall ownership, and profile shadowing beyond the visible recall limit.
- B-008 reads current shipped files, rejects D-009 deltas outside exact allowed
  regions, and executes both OFF→ON and ON→OFF through real reload/plain-new and
  restart/`/agent` seams.
- B-010 covers injected failure, fake and production-spawner cancellation,
  conditional restoration, concurrent config edits, hard-kill recovery evidence,
  unindexed-orphan cleanup, digest-complete indexing, and no promotion.
- The supervised-artifact test reads the approval file directly and asserts
  `decision: approve`, no-verbatim attestation, review-index digest, aggregate
  proposal digest, counts, and no curated distiller output. Removing the file,
  changing it to reject, or changing either digest is therefore detectable.

## Degraded Structural Judgments

The focused implementations are singular and explicit:

- parser/normalizer and proposal identity: `lib/memory/knowledge-records.ts`
- store: `createKnowledgeMemoryStore` in `lib/memory/knowledge-store.ts`
- retrieval combiner: `combineMemoryRetrieval`
- budget allocator: `allocateInjectionBudget`
- enabled session composer: `createKnowledgeSurfaceSessionExtension`
- proposal adapter derivation: `deriveKnowledgeProposalIdentity` plus the thin
  draft adapter in `knowledge-tools.ts`
- backfill lifecycle: `runKnowledgeSurfaceBackfill`

The enabled composer disables both legacy `before_agent_start` handlers and
registers the single combined handler. The package wrappers only re-export the
inward implementations. Searches found no knowledge-surface WeakMap, module
singleton, EventBus correctness handoff, speculative registry/backend,
correctness cache, second extractor, surviving migration program, or duplicate
enabled context handler. `fallow.toml` is unchanged.

The new domain-neutral memory core files (`knowledge-records.ts`,
`knowledge-store.ts`, `multi-store-retrieval.ts`, and `injection-budget.ts`)
import no Pi, config, agent, domain, session, task, plan, or architecture-map
module. Pi/config adapters depend inward on `MemoryStore`. Two older episodic
capture files under `lib/memory/` retain their pre-plan config imports; the
knowledge-surface delta did not touch them, and changing them here would violate
the explicit episode-change exclusion. Legacy authored-memory and architecture
authorization remains identity-gated. Documentation states that generic Pi
project tools and Codex/Claude backends are trusted, human-supervised,
git-reviewed, and deliberately unsandboxed rather than claiming a sandbox.

## Stage 6 / Stage 7B Recheck

The earlier gate artifacts were read and revalidated, not regenerated:

- Scan-cost evidence is unchanged and contains 20 raw turns with `verdict:
  pass`; p95 is 18.916 ms against 250 ms, maximum bytes are 423,016 against 10
  MiB, and maximum files scanned are 413 against the 413-file eligible bound.
- `memory/agent/proposals/backfill-review.json` hashes to
  `e61eaf52d7ca488657323c06e6f6f03463447265158a6eaf114a0faf25e3a6b4`,
  matching the human approval. It binds 164 proposals across 19 slugs,
  `noPromotion: true`, and aggregate digest
  `f22ae61f24b82d534f68f5d4e4dfccfd08344cf59558dbee72f5118e1e0053c1`.
- The approval records reviewer Agustin Calabrese, `decision: approve`,
  `noVerbatimAttested: true`, zero rejected proposals, and the same digests and
  counts.
- `.cosmonauts/config.json` hashes to the index's before/after digest
  `890d02aa85df1daccbdd177f01503c6477c04e9e352fa000daf9e1b5fb87d8a6`
  and has no `knowledgeSurface.enabled: true`; the gate is OFF.

## Scope / Dead-Code Judgment

Active source, CLI, shipped prompts/skills, package metadata, and live docs
contain no `.knowledge.jsonl` or retired session-knowledge API reference. The
curated corpus and proposal corpus use only `decision`, `trade-off`, `gotcha`,
and `convention`; all 164 `coding/distiller` records remain under
`memory/agent/proposals/`, with none in curated knowledge. The store's required
`consolidate` method is an explicit no-op and adds no consolidation behavior.

The implementation-range diff contains no working-state, episodic/episode,
explicit-save, embeddings/similarity, retention/raw-session deletion,
autonomy-host, enabled bare-host, or `fallow.toml` change. The project config is
OFF and the example explicitly uses `enabled: false`. The only shipped
prompt/skill deltas are the existing coding distiller persona and shared archive
skill; their executable contract rejects stack-specific examples and legacy or
excluded output instructions.

## Findings

No unresolved Stage-9 finding remains. The prior integration findings are
closed by the archive proposal-only correction and TASK-569/TASK-570's real
transition and collision-seam regressions.
