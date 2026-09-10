# Plan Review: chain-stage-context

## Findings

- id: PR-001
  dimension: state-sync
  severity: high
  title: "The attested slug is not bound to the chain's existing plan identity"
  plan_refs: D-004, D-005, D-006, B-005 through B-008, Design §2, Design §3, Design §7
  code_refs: lib/orchestration/types.ts:116-143, lib/orchestration/stage-prompts.ts:31-55, lib/orchestration/chain-runner.ts:640-663, lib/orchestration/durable-chain-compiler.ts:88-96, lib/orchestration/durable-chain-compiler.ts:274-299, lib/plans/plan-types.ts:11-28
  description: |
    The runtime already carries an optional authoritative plan identity: `ChainConfig.planSlug`, or a slug derived from `completionLabel`, is resolved before spawn in both paths and is passed into inline and durable spawn options. D-005 instead validates only the slug self-reported by the terminal agent; its accepted-state predicate and `ReviewRoundBlock.reason` union define neither equality with the already-resolved plan slug nor an `active`-status check. The two sources can therefore disagree, and an addressed round from another existing (even completed) plan can authorize this chain to advance.

    This defeats the gate's purpose when a completion label or explicit plan slug is available and leaves the “active plan” wording undefined when it is not. B-005/B-006 also omit the mismatch and inactive-plan cases. The planner must make the shared check consume the existing expected plan identity when present and define the fallback/active-status rule when it is absent. This repairs derived D-005/D-006 while preserving ratified AC-004; it does not require widening `runStart`, `StepResult`, or any generic durable contract.

- id: PR-002
  dimension: lifecycle-invariant
  severity: high
  title: "Allowed round gaps make lowest-free allocation disagree with highest-numbered latest"
  plan_refs: D-005, B-005, Design §2 (`Gaps do not create another numbering scheme`), Design §7
  code_refs: missions/archive/plans/planning-system-hardening/plan.md:52-64, bundled/coding/prompts/plan-reviewer.md:153-158, bundled/coding/prompts/planner.md:69-72
  description: |
    The shipped convention is asymmetric: the reviewer allocates the lowest unused positive number, while the planner treats the highest-numbered file as latest. The plan explicitly accepts gaps and always selects the numeric maximum. With `review-1.md` and `review-3.md` present, the next reviewer must write the free `review-2.md`, but the proposed assessor will still call `review-3.md` latest. An addressed attestation for round 3 can then pass while the newly written round 2 is unaddressed.

    This is a fail-open lifecycle contradiction in the core halt property, not merely malformed naming. B-005 tests collisions and stale claims but does not name a gapped allocation followed by a new lower-numbered round. The planner must define a safe outcome for gaps that remains consistent with archived `planning-system-hardening` D-002. The convention itself is derived historical ground; the ratified requirement to preserve is AC-004's visible machine-readable handling of the active highest review state.

- id: PR-003
  dimension: interface-fidelity
  severity: medium
  title: "The citation predicate does not preserve the existing meaning of a Decision Log reference"
  plan_refs: D-005, B-005, Design §2 (`exact canonical citation appears inside a parseable D-### entry`), Risks (`report can be syntactically valid while disposition is poor`)
  code_refs: lib/artifacts/behavior-conformance.ts:87-105, lib/artifacts/behavior-conformance.ts:334-418, lib/artifacts/behavior-conformance.ts:461-492, missions/archive/plans/planning-system-hardening/plan.md:65-79, bundled/coding/prompts/planner.md:69-72
  description: |
    D-005 turns “the citation text occurs somewhere inside a Decision Log entry” into a machine disposition. The existing artifact convention is narrower: archived `planning-system-hardening` D-003 says citations quoted in inline code or fenced examples are mentions, not references, and `behavior-conformance.ts` implements fence/inline-code masking before scanning Decision Log entries. The new `review-rounds.ts` design neither reuses that scanner nor states the same exclusion, so a literal example such as ``review-2.md PR-003`` inside a decision entry can satisfy the new gate while remaining a non-reference under the existing checker.

    More generally, the documented Decision Log grammar has `Decision`, `Alternatives`, `Why`, and provenance fields but no structured disposition field; the plan should be precise about what syntactic association it can prove and not claim stronger adjudication. Align the addressed predicate with the existing citation semantics (or explicitly redefine it on record) and add negative quoted/fenced cases. D-005 is derived and can be amended without changing an acceptance criterion; every resulting Decision Log entry in this plan can remain `Decided-by: derived` as required.

- id: PR-004
  dimension: behavior-spec
  severity: medium
  title: "Unqualified substring matching changes prompts for agents that did not repeat after a reviewer"
  plan_refs: D-003, B-002, B-004, Design §1, Risks (`stage could be misclassified`)
  code_refs: lib/orchestration/types.ts:18-37, lib/orchestration/chain-parser.ts:53-84, lib/agents/resolver.ts:169-181, lib/agents/qualified-role.ts:20-26, external-skills/cosmonauts/chains/SKILL.md:45-51
  description: |
    `ChainStage.name` is an agent identifier, and the parser preserves qualified names because two domains may expose the same agent ID; the resolver deliberately stops fallback for a qualified identifier. D-003 discards that identity with `unqualifyRole`, so `coding/planner -> plan-reviewer -> product/planner` is classified as a repeated role even though the chain names two distinct agents. Its reviewer predicate is broader still: “contains `reviewer`” can classify a custom role such as `reviewer-summary` (or any other substring match) without evidence that it is a review stage.

    B-002 says it covers qualified names but does not specify the cross-domain non-repeat or false reviewer-name cases, and B-004 does not protect them. Implemented literally, this changes unrelated custom-chain prompts contrary to ratified AC-006. The planner should tighten and test the identity/reviewer predicate while amending only derived D-003; no unrelated system prompt or `factory-modes` change is needed.

- id: PR-005
  dimension: risk-blast-radius
  severity: medium
  title: "Artifact read failures fall out of the typed review-block path in both runtimes"
  plan_refs: D-004, D-005, B-005, B-006, B-008, Design §2, Design §3, Design §7
  code_refs: lib/plans/file-system.ts:157-190, lib/orchestration/chain-runner.ts:576-605, lib/durable-runtime/scheduler.ts:1170-1206
  description: |
    D-004 promises that every unaddressed or unverifiable outcome emits `unaddressed_review_round`, but the proposed reason union has no plan/review I/O failure state and B-005 covers malformed/missing content only. Existing plan reads return `null` only for `ENOENT`; permission, transient I/O, and parser exceptions are rethrown. If the shared assessor lets one escape, inline `runStage` converts it to the ordinary `error` path, while the durable scheduler converts a rejected backend result to generic `outcome:"failed"`/`abort_run`. Neither path emits or persists the typed review block.

    The chain still stops, but AC-004's machine-readable review-round signal is lost precisely when addressability cannot be verified. The assessor contract and both-path test matrix need a total, typed outcome for artifact-read failure (including what identity can still be retained) rather than relying on outer generic failure handling. This can remain chain/plan-local and does not require a generic durable contract change.

## Missing Coverage

- `external-commands/spec-to-backlog.md:22-48` names `/spec-to-backlog` as a user flow but actually runs `planner -> plan-reviewer` and performs revision in the external coordinator; it has no repeated terminal planner. The plan should state that this flow remains unaffected rather than imply the positional feature covers it.
- The terminal-report tests do not explicitly say that the report must be the last nonblank line or cover valid JSON followed by trailing prose, despite D-005 calling it a terminal line.
- The topology matrix does not name an earlier parallel group containing both the prior role and a reviewer; those unordered siblings must not become an “intervening reviewer” by flattening order.
- B-008 does not cover interruption between persisting chain-local `run_activity` evidence and the scheduler persisting the blocked attempt/step result; the recovery expectation should identify which durable record remains authoritative in that partial state.
- Review artifact symlinks and non-regular `review*.md` directory entries are not classified, although the plan claims reads remain under the validated plan directory.

## Coverage Ledger

- dimension: interface-fidelity
  status: checked
  checked: Both asymmetric `buildStagePrompt` call sites, zero-based inline versus one-based durable indexing, plan-slug resolution, spawn-result text access, plan/review file APIs, durable backend inputs/results, and event/rendering consumers were read against the proposed contracts.
  findings: PR-001, PR-003
- dimension: duplication
  status: unchecked
  checked: Structural duplication and symbol-trace capabilities are unbound (`execution-not-consented`, provider `fallow`). Direct reading found the existing Decision Log scanner, but no project-wide duplication verdict is claimed.
  findings: none
- dimension: state-sync
  status: checked
  checked: Report slug versus existing `planSlug`, review filenames versus round identity, persisted durable purpose, terminal block evidence, and `behaviorsReviewPending` were traced. The existing flag is behavior-review-specific, serialized and tool-visible, and the plan is correct not to repurpose it.
  findings: PR-001, PR-002
- dimension: risk-blast-radius
  status: checked
  checked: Named planning chains, custom/qualified chains, `/spec-to-backlog`, inline failure, durable blocked scheduling, restart evidence, later-stage suppression, CLI stderr, and agent-tool progress were walked.
  findings: PR-001, PR-002, PR-004, PR-005
- dimension: user-experience
  status: checked
  checked: Successful revision, missing/malformed report, wrong identity, stale/gapped round, artifact-read failure, rerun recovery, CLI logging, and tool-progress rendering were reviewed from the operator and calling-agent surfaces.
  findings: PR-001, PR-002, PR-005
- dimension: behavior-spec
  status: checked
  checked: B-001 through B-010 were mapped to the seven authoritative acceptance bullets, named seams/tests/markers, negative cases, and implementation homes. The user-directed absence of `## Intent`/`INV-###` was honored and is not a finding.
  findings: PR-001, PR-002, PR-003, PR-004, PR-005
- dimension: architecture-record
  status: unchecked
  checked: `missions/architecture/orchestration-future.md`, `missions/architecture/durable-orchestration-runtime.md`, `docs/prompts.md`, and ROADMAP `factory-modes` were read directly. The chain-local prompt/report design is compatible with their no-new-runtime, generic-runtime-inward, normalized-evidence, and system-prompt-mode boundaries, but project-wide boundary conformance is unchecked because that capability is unbound and `memory/architecture/index.md` is missing.
  findings: none
- dimension: quality-contract
  status: checked
  checked: Gate order/tier/binding/degradation, prompt parity, negative topology, artifact truth, both-path halting, observability, forbidden generic changes, and failure coverage were reviewed.
  findings: PR-001, PR-002, PR-003, PR-004, PR-005
- dimension: lifecycle-invariant
  status: checked
  checked: Every purpose/report/block state, stop transition, rerun exit, review allocation transition, durable scheduler transition, cancellation, and partial persistence point was attacked.
  findings: PR-002, PR-005
- dimension: constraint-ownership
  status: checked
  checked: D-001 through D-007, every Files-to-Change row, both runtime parity, `behaviorsReviewPending`, `factory-modes`, system prompt assembly, and generic durable exclusions were traced to behaviors, implementation stages, or explicit owners. All current Decision Log entries are `Decided-by: derived`; no finding requires changing that provenance.
  findings: none
- dimension: scope-size
  status: checked
  checked: The plan has 10 behaviors, below the 12-behavior guidance, with coherent staged ownership and no need for a size split.
  findings: none

## Assessment

The plan is viable with revisions, and its narrow stage-purpose layer plus chain-local durable evidence is compatible with both architecture records and the future `factory-modes` boundary. Fix plan identity and round ordering first: as written, either mismatch can let the chain advance on evidence from the wrong review state despite the intended fail-closed gate.
