# Plan Review: test-health-audit

## Findings

- id: PR-001
  dimension: interface-fidelity
  severity: medium
  title: "The selected Vitest reporter hooks cannot objectively classify hook failures by lifecycle phase"
  plan_refs: Decision Log D-006, B-002, Design §1, Design §2
  code_refs: node_modules/vitest/dist/chunks/reporters.d.BFLkQcL6.d.ts:180-190, node_modules/vitest/dist/chunks/reporters.d.BFLkQcL6.d.ts:276-310, node_modules/vitest/dist/chunks/reporters.d.BFLkQcL6.d.ts:555-645
  description: |
    The plan promises explicit collection/import/setup/teardown/execution-error evidence using `onTestRunStart`, `onTestModuleCollected`, `onTestCaseReady`, `onTestCaseResult`, and `onTestRunEnd`. Vitest 3.2.4 does expose all five hooks, but its public `ReportedHookContext` contains only the hook name and entity, and `onHookEnd` has no result or error argument. `onTestCaseResult` runs after the test and its hooks and exposes one aggregated `TestResult.errors`; module `errors()` is documented for errors outside the test run, such as collection failures. The selected contract therefore detects failure but cannot reliably and objectively distinguish a test-body error from `beforeEach`/`afterEach`, or a suite failure from `beforeAll`/`afterAll`.

    This conflicts with the plan's phase-specific census claim. The planner should either identify a supported 3.2.4 evidence channel that preserves phase identity or record the unavailable distinction as a blocking/heuristic limitation. Narrowing the promised census categories would touch ratified suite-integrity ground and must follow the deviation protocol.

- id: PR-002
  dimension: lifecycle-invariant
  severity: high
  title: "The probe design is not copy-only and has a crash path with no restoration exit"
  plan_refs: Decision Log D-008, B-008, Design §6, Risks 6, Quality Contract assertion 6
  code_refs: missions/plans/test-health-audit/spec.md:171-191, missions/reviews/improvements/living-memory-fidelity.md:57-61, missions/archive/plans/living-memory-fidelity/review-16.md:84-99
  description: |
    D-008 and B-008 allow a fallback that mutates the working tree, restores in `finally`, and checks bytes/mode/diff when sandboxing is deemed infeasible. A killed process, machine failure, or forced termination never runs `finally`, leaving the mutation in user work. That is the same destructive class the cited historical incident establishes, and it contradicts the plan's own Quality Contract assertion that every required probe mutates a copied target.

    This is derived plan mechanism, not ratified spec ground, so it should be corrected on record: define required probes as copy-only or leave them `reasoned`/`unassessed` when a safe copied execution cannot be built. The current fallback creates a written state with no guaranteed exit.

- id: PR-003
  dimension: interface-fidelity
  severity: medium
  title: "Copied probes do not prove that the guardrail executes the copied module graph"
  plan_refs: B-008, Design §1 probe.ts, Design §6, Quality Contract assertion 6
  code_refs: scripts/vitest-runner.mjs:14-20, package.json:40-42, vitest.config.ts:1-20
  description: |
    The probe contract says to mutate a copied target and run the narrowest guardrail, but it does not define the subprocess cwd, copied repository boundary, dependency/config resolution, reporter output location, or evidence proving that the test imported the copied target rather than the original checkout. The existing wrapper simply spawns `vitest run` in the inherited cwd, and Vitest loads the root config/setup from that project. A helper test with a fake runner can satisfy the proposed restoration assertions while real probes still resolve production imports from the source checkout.

    The planner should make copied execution identity part of the shared contract and acceptance evidence. Without it, a green or red probe is not causally attributable to the copied mutation, so AC-010 evidence can be false confidence even when restoration is safe.

- id: PR-004
  dimension: state-sync
  severity: high
  title: "Immutable revision-pinned manifests cannot survive the remediation revision they are meant to validate"
  plan_refs: D-005, D-007, Design §4, Design §5, Design §7, B-004, B-011
  code_refs: missions/plans/test-health-audit/spec.md:193-230, domains/shared/skills/work-artifacts/references/deviation-protocol.md:7-24
  description: |
    `prepare-batches` writes one immutable `audit/manifest.json` pinned to a revision, while inventory additions require a manifest amendment and remediation is expected to change tests or production before the final exact-revision baseline. Design §4 nevertheless says only affected shards are refreshed. After the first remediation commit, either the immutable manifest still names the old revision, or it is rewritten despite being immutable; if revision is part of freshness, all shards become stale, while if it is ignored the baseline can aggregate evidence from a different revision.

    The plan has no supersession/versioning transition that creates a candidate-revision manifest and proves which unchanged shards may be carried forward by material-input digest. Implemented literally, the required remediation loop cannot reach the exact-revision ratification state. This needs a defined persisted transition, not an in-memory convention.

- id: PR-005
  dimension: behavior-spec
  severity: medium
  title: "B-003 can accept reviewed calibration misses even though calibration must pass"
  plan_refs: B-003 Expected/Test, Design §3, Implementation Order stage 4, Quality Contract assertion 4
  code_refs: missions/plans/test-health-audit/spec.md:147-169, missions/reviews/improvements/living-memory-implementation.md:27-40, missions/reviews/improvements/living-memory-fidelity.md:43-62
  description: |
    B-003's expected result requires reviewed evidence, records counterexamples and misses, and blocks only until every row has reviewed evidence. Its named test likewise says it requires “complete ... evidence,” not that every row's actual observation matches a predeclared expected conclusion and is `pass`. The stronger rule appears only in Design, Implementation Order, and the Quality Contract. A worker can therefore implement the behavior test so a complete corpus containing a calibration miss unlocks profiling.

    The calibration rows also lack stable control IDs and per-control expected conclusion/reason/basis/portfolio outcomes, forcing the worker to invent what “recognized” means from several historical documents. Move the pass predicate and directly authorable expected outcomes into the behavior spine; the historical false-confidence classes in the spec are ratified calibration ground and must not be reinterpreted merely to obtain a pass.

- id: PR-006
  dimension: constraint-ownership
  severity: medium
  title: "The profile contract cannot enforce the objective-versus-human-reviewed lane split"
  plan_refs: D-009, B-001, B-010, Design §1 TestEvidenceProfile, Design §9
  code_refs: missions/plans/test-health-audit/spec.md:17-24, missions/plans/test-health-audit/spec.md:242-248
  description: |
    D-009 assigns role, contract authority, evidence-chain adequacy, criticality, disposition, and portfolio sufficiency to the human-reviewed lane. The minimum `TestEvidenceProfile` shape has only one record-level `review: { kind: "human-reviewed" }`; the listed role, claim, chain, portfolio contributions, and disposition fields carry no field-level lane or reviewer provenance. `basis: "observed" | ...` is epistemic basis, not whether automation or a human made the judgment.

    As written, independently implemented collectors and validators cannot tell whether a heuristic field was machine-defaulted, human-reviewed, or later overwritten, and cannot enforce the rule that only objective integrity conditions fail the command. The shared schema must own this distinction before parallel artifact work; a final gate-recommendations label alone does not protect the underlying records.

- id: PR-007
  dimension: scope-size
  severity: medium
  title: "Fifteen-file shards have no bound on the actual per-test review workload"
  plan_refs: D-005, B-004, Design §4, Risks 4 and 10, Implementation Order stage 5
  code_refs: tests/memory/living-memory.test.ts:59, tests/extensions/agent-memory.test.ts:33, tests/memory/interface.test.ts:59
  description: |
    The plan derives 18 reviewer sessions solely from 267 files and says reducing file batch size is the fallback. Current capability evidence contradicts file count as a useful work bound: the 2026-09-15 project cognitive-complexity result reports top-level test callbacks of 7,205 lines in `living-memory.test.ts`, 3,017 lines in `agent-memory.test.ts`, and 2,054 lines in `interface.test.ts`; the cited historical verification already ran more than 3,100 tests across roughly 263 files. One of those files alone can exceed a focused review session, so reducing a shard to one file still has no exit.

    Because B-004 requires one profile per auditable test identity, batch/resume ownership needs a declaration/profile-count or other review-cost bound and must permit resumable subdivision inside a large source file. Otherwise the proposed 18-shard state machine is durable but not feasible at the repository's actual shape.

- id: PR-008
  dimension: behavior-spec
  severity: medium
  title: "The behavior spine cites AC-005 without testing its full legitimate-system-under-test set"
  plan_refs: B-001, B-003, B-004, Design §1
  code_refs: missions/plans/test-health-audit/spec.md:58-115, missions/plans/test-health-audit/spec.md:234-241, tests/orchestration/chain-event-adapter.test.ts:1-18, tests/agent-packages/claude-binary-runner.test.ts:1-18
  description: |
    AC-005 and INV-002 require legitimate grounding for production functions, shipped files/prompts/configuration, CLI output, subprocess behavior, events, persisted state, and composition roots without ranking direct over mediated evidence. B-001 cites AC-005 but tests only controlled conclusion vocabularies and non-ranking; the profile shape stores untyped `EvidenceRef[]` systems under test. The listed positive controls cover several roles, but do not provide authorable examples for shipped prompts, configuration, CLI output, or a real composition root.

    The behavior tests can therefore pass while the method rejects or cannot represent several ratified grounding forms. Add concrete expected profile examples for the omitted categories, or explicitly map existing controls to every category and expected conclusion. Narrowing AC-005 is ratified-ground work and cannot be done as a planner amendment.

## Missing Coverage

- The exact current `tests/**/*.test.ts` count is not backed by a checked-in enumeration in the plan. Available read-only capability evidence reports 264 plugin-discovered entry points, which is not semantically equivalent to the claimed 267-file glob and therefore cannot confirm or refute it.
- No live command probe was run: exercising Vitest reporter loading or any package test surface necessarily loads project-controlled `vitest.config.ts`, setup files, and potentially tests/plugins, and this reviewer has no approved sandbox plus a no-shell role constraint. Static inspection confirms the three package scripts, wrapper forwarding, Vitest 3.2.4, `--run`, `--reporter`, `--outputFile`, shuffle/seed options, and the named reporter hooks.
- The planner's exhaustive “no runtime read of `definition.session`” search could not be reproduced as an exhaustive field-use query. Direct reads of `buildSessionParams`, CLI session creation, and the plan-scoped session factory support the claim, while symbol trace only proves broad `AgentDefinition` use.

## Coverage Ledger

- dimension: interface-fidelity
  status: checked
  checked: Compared all three package scripts and the wrapper with installed Vitest 3.2.4 CLI/reporter declarations; inspected session and calibration interfaces.
  findings: PR-001, PR-003
- dimension: duplication
  status: unchecked
  checked: The bound duplication capability failed normalization because provider exit 0 contradicted 91 findings; the four exact proposed source/test paths are currently absent, but project-wide overlap could not be established.
  findings: none
- dimension: state-sync
  status: checked
  checked: Traced census, manifest, shard, inventory-amendment, remediation, candidate-revision, and ratification freshness transitions.
  findings: PR-004, PR-006
- dimension: risk-blast-radius
  status: checked
  checked: Walked collection failure, interrupted probes, remediation revision changes, oversized profile shards, and blocked baseline outcomes.
  findings: PR-002, PR-004, PR-007
- dimension: user-experience
  status: checked
  checked: Walked auditor preparation, census, calibration, resumed profiling, remediation, eligibility, stale ratification, and owner-only establishment.
  findings: none
- dimension: behavior-spec
  status: checked
  checked: Mapped AC-001 through AC-015 and INV-001 through INV-007 to B-001 through B-011, named tests, seams, and markers; checked failure and edge examples.
  findings: PR-005, PR-008
- dimension: architecture-record
  status: checked
  checked: Read the declared code-structure-map record and live architecture-map result; the map index is missing and the plan correctly treats that evidence as unavailable rather than clean.
  findings: none
- dimension: quality-contract
  status: checked
  checked: Checked the ordered universal/bindable ladder, baseline assertions, calibration gate, mutation degradation, and exact ten deliverable/eight-condition claims.
  findings: PR-002, PR-005
- dimension: lifecycle-invariant
  status: checked
  checked: Attacked census states, calibration misses, profile staleness, inventory amendments, probe restoration, remediation statuses, manifest revisions, eligibility, and ratification freshness for exits.
  findings: PR-002, PR-004
- dimension: constraint-ownership
  status: checked
  checked: Traced load-bearing Design/Decision constraints into behaviors or implementation owners, including objective/heuristic authorship, contract deviation, scope exclusions, and human ratification.
  findings: PR-006
- dimension: scope-size
  status: checked
  checked: Confirmed 11 behaviors are under the 12-behavior guidance, then compared file-based batching with current large-suite capability evidence and resumability limits.
  findings: PR-007

## Assessment

The plan is viable only after substantial revisions; it does not need a new product direction. Fix the unsafe non-copy probe fallback and the manifest/revision transition first, because those defects can respectively damage user work and make the exact-revision human baseline unreachable.
