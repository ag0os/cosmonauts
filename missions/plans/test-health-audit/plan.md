---
title: Test Health Audit
status: active
createdAt: '2026-09-15T21:15:54.575Z'
updatedAt: '2026-09-16T00:42:31.863Z'
---

## Overview

This plan implements the ratified quality pause in `spec.md`: establish a repeatable test-health assessment method, apply it to the complete current Vitest suite, remediate confirmed weaknesses or remove them from claimed guardrail evidence, and present a revision-pinned baseline for project-owner ratification. It is planned quality/refactor work, not a feature.

Repository exploration on 2026-09-15 enumerated 267 `tests/**/*.test.ts` files. File count is only the starting census: the audit batches by auditable test declarations and relevant source span, and permits subdivisions inside very large test files. Generated objective evidence plus bounded, resumable human-review work units avoid asking one agent to hand-write the suite’s profiles in one session.

Evidence lives under `missions/plans/test-health-audit/audit/` and archives with the plan. The repeatable method and repo-local audit utility remain under `docs/` and `scripts/`. The work cross-links, but does not implement, `ROADMAP.md` items `behavioral-regression` and `deliverable-completeness-gates`. It does not start `project-health-audit`; that remains the next quality-pause stage. Active-plan and feature work remains paused throughout this plan and the subsequent gate required by the roadmap.

### Scope boundaries

The following ratified exclusions remain in force verbatim:

- Porting deintroverter or committing to a static analyzer.
- Indiscriminate mutation testing.
- Treating coverage increases as the objective.
- New feature development or resuming active plans before baseline ratification.
- Whole-project dead-code, duplication, complexity, or boundary-conformance remediation.
- New analysis providers, provider infrastructure, or expansion of the existing analysis capability surface.
- Implementing the broader `behavioral-regression` or `deliverable-completeness-gates` roadmap items.
- Starting `project-health-audit`.
- Creating an implementation plan or tasks during spec ratification.

Spec ratification is complete; this is its subsequent implementation plan. This planning pass creates no tasks.

## Architecture Context

No new architecture record is needed. The method and evidence schemas are specific to this audit; durable project architecture remains in existing records.

Governing sources:

- `missions/plans/test-health-audit/spec.md` owns `INV-001` through `INV-007`, `AC-001` through `AC-015`, D-001 through D-004, assumptions, and evidence-resolved open questions.
- `docs/testing.md` owns canonical structure, mock-strategy order, and “Tests As Evidence.” A test pinning ratified behavior changes only after its governing ground changes through the deviation protocol.
- `AGENTS.md` owns Pi-First, TypeScript/test conventions, and project verification gates. Pi has no repository-test audit facility; use the pinned Vitest 3.2.4 public reporter contract and the already-direct TypeScript dependency rather than adding a provider or framework.
- `missions/architecture/code-structure-map.md` defines the derived map as mechanical evidence. The live architecture-map reader and `memory/architecture/` currently expose no module shards, so map evidence is unavailable, never clean.
- `domains/shared/skills/work-artifacts/references/deviation-protocol.md` owns mutability, deviation routing, and human-only ratification.

Verified execution surfaces:

- `package.json` maps `test` to `node ./scripts/vitest-runner.mjs`; the wrapper translates `--grep` to `--testNamePattern`, spawns `vitest run`, and forwards signal/exit status.
- `test:watch` invokes `vitest` directly.
- `test:coverage` invokes `vitest run --coverage` directly.
- `vitest.config.ts` supplies `tests/setup.ts`, a 15-second default, and V8 coverage configuration. `tests/setup.ts` restores spies/mocks and real timers after every test.
- Installed Vitest 3.2.4 exposes the planned reporter lifecycle hooks, but its public hook-end event does not carry a hook error/result. The census therefore never fabricates setup/test/teardown phase identity when the public payload cannot establish it.

Verified calibration evidence includes the no-runtime-consumer `AgentDefinition.session` specimen: `tests/domains/coding-agents.test.ts` validates the declared value, while `tests/cli/session.test.ts` fixtures set it but pass `persistent` explicitly. Direct reads show persistence is invocation-decided in `cli/main.ts`/`cli/session.ts` and plan-scoped in `lib/orchestration/session-factory.ts`; repository field-use search found `.session` otherwise serving configuration/presentation. The audit records and excludes this test from claimed runtime guardrail evidence but does not remediate it; `ROADMAP.md` assigns the drop/keep decision to `observational-memory-adoption`.

## Assumptions

These ratified assumptions are settled and carried verbatim:

- The existing Bun and Vitest commands are the initial supported execution surface, but the audit verifies rather than assumes their completeness.
- Ratified specifications, architecture decisions, and explicit human rulings outrank test expectations and current implementation behavior. When authoritative sources conflict or are absent, alignment remains unresolved.
- Criticality is based on user impact, data or artifact durability, concurrency, recovery, security, irreversible effects, and architectural dependency—not coverage percentage.
- Mocks, fixtures, synthetic projects, and isolated units are legitimate when their role and limitations are explicit and deeper risks are covered elsewhere.
- An objective observation may still require human judgment about significance; automation does not convert a heuristic into a fact.
- The trustworthy baseline is revision-specific and records enough context to be repeated after material production, test, runner, or configuration changes.
- The later `project-health-audit` consumes the trustworthy test baseline and the already shipped analysis capabilities; it does not need to be pulled forward into this work.

## Decision Log

- **D-001 - Layered assessment**
  - Decision: assess independent dimensions per test, protection per behavior/risk, and suite integrity as a prerequisite.
  - Rejected: one overall per-test certification; behavior/risk-only assessment.
  - Why: Cosmonauts has heterogeneous tests whose value emerges from complementary roles, while individual misleading tests must remain visible.
  - Decided by: user ratified, 2026-09-14.

- **D-002 - Native conclusions with common evidence status**
  - Decision: use dimension-specific conclusions plus a shared evidence basis and explicit reasons.
  - Rejected: one universal verdict ladder; unrelated dimension vocabularies without a common evidence status.
  - Why: semantic precision and epistemic uncertainty must both survive reporting.
  - Decided by: user ratified, 2026-09-14.

- **D-003 - Targeted fault probes**
  - Decision: require risk- and claim-targeted probes for critical, historical, and seam-sensitive guardrails.
  - Rejected: comprehensive mutation testing; calibration-only probes.
  - Why: critical guardrails need empirical sensitivity evidence without imposing indiscriminate mutation cost.
  - Decided by: user ratified, 2026-09-14.

- **D-004 - Risk-based trustworthy baseline**
  - Decision: resume development after suite integrity, critical protection, remediation, bounded uncertainty, and human ratification are established.
  - Rejected: requiring zero uncertainty across every dimension; resuming with a green suite plus a weakness backlog.
  - Why: trust must be demanding where consequences matter without pretending all uncertainty can be eliminated.
  - Decided by: user ratified, 2026-09-14.

- **D-005 - Audit evidence is schema-validated and sharded by source files** *(batch sizing superseded by D-016, 2026-09-15)*
  - Decision: keep exact controlled vocabularies in a pure schema module; generate a revision-pinned manifest; partition the lexically sorted source-test list into batches of at most 15 files; store one NDJSON profile shard per batch and derive progress from validated shard presence rather than a shared mutable counter.
  - Alternatives: one monolithic markdown report; one file per test; one mutable in-memory progress map.
  - Why: this makes the current suite tractable and reconstructs progress after restarts without weakening `INV-001` or `INV-005`.
  - Decided by: planner-proposed, 2026-09-15.

- **D-006 - Reconcile source declarations with public Vitest runtime evidence** *(error-phase claim clarified by D-011, 2026-09-15)*
  - Decision: use a bounded TypeScript-AST source-declaration census and a Vitest 3.2.4 custom reporter; execute it through all supported package-command surfaces without changing discovery configuration.
  - Alternatives: infer completeness from file globbing; trust one normal run; port/build a general static analyzer.
  - Why: source-only and runtime-only inventories each miss failure classes named by `INV-003` and `INV-005`; this bounded collector is not an analysis provider.
  - Decided by: planner-proposed, 2026-09-15.

- **D-007 - Freeze an independently sourced behavior/risk inventory before test joining**
  - Decision: derive inventory entries from current shipped/public surfaces, ratified shipped specifications, architecture records, and incident/risk records without consulting tests, markers, or coverage; freeze its source log before linking profiles.
  - Alternatives: let current tests/markers define the inventory; enumerate every historical AC without a shipped-scope bound; omit portfolio assessment.
  - Why: implements `INV-004` and prevents current guardrails from defining away missing behavior.
  - Decided by: planner-proposed, 2026-09-15.

- **D-008 - Probe copies, never Git restoration** *(working-tree fallback superseded by D-012, 2026-09-15)*
  - Decision: prefer a copied probe sandbox; the original draft allowed a copied backup plus in-place mutation/`finally` restoration only if sandboxing was infeasible. `git checkout -- <file>` was always forbidden.
  - Alternatives: restore from Git; batch defects; suite-wide mutation.
  - Why: the historical probe destroyed uncommitted fixes.
  - Decided by: planner-proposed, 2026-09-15.

- **D-009 - Objective observations and heuristic judgments use separate lanes** *(schema ownership clarified by D-015, 2026-09-15)*
  - Decision: only objective integrity failures may fail the audit command. Role, contract authority, evidence-chain adequacy, criticality, disposition, and portfolio sufficiency remain human-reviewed; heuristic candidates never become CI failures here.
  - Alternatives: gate every detectable smell; make all evidence prose-only.
  - Why: preserves `INV-006` while retaining repeatability.
  - Decided by: planner-proposed, 2026-09-15.

- **D-010 - Automation establishes eligibility, never ratification** *(revision/digest transition clarified by D-013, 2026-09-15)*
  - Decision: automation evaluates baseline conditions and may report `eligible-for-ratification`; only a project-owner block pinned to the evaluated evidence can set `established`.
  - Alternatives: self-establishment; green-suite implicit assent.
  - Why: enforces `INV-007` and D-004.
  - Decided by: planner-proposed, 2026-09-15.

- **D-011 - Unknown lifecycle phase remains blocked evidence**
  - Decision: collect every public Vitest error/result, module error, hook name/event, and stack. Label an error `collection`, `import`, `setup`, `test`, or `teardown` as `observed` only when the public payload directly establishes it; otherwise record `phase: unknown`, basis `blocked`, and an assessment limitation. Stack-based attribution may be a human-reviewed heuristic but cannot replace the blocked objective record.
  - Alternatives: infer hook phase from event adjacency; promise phase fidelity the 3.2.4 reporter API does not expose; omit the error.
  - Why: addresses `review-1.md PR-001` without narrowing AC-003—every error stays visible and unavailable phase evidence cannot become clean (`INV-005`, `INV-006`).
  - Decided by: planner, addressing review-1.md PR-001, 2026-09-15.

- **D-012 - Required probes are copy-only and prove copied resolution**
  - Decision: a required probe never mutates the source checkout. Run pre-mutation green, mutation, and post-removal green inside a current-working-tree copy; set subprocess cwd/config/setup to that sandbox; require the reported test module, declared target import route, resolved target/config/setup realpaths, and mutation target to remain beneath the sandbox root. The original checkout’s pre/post path-status and target digests must be identical. If copied execution identity cannot be proved, record `reasoned` or `unassessed`; do not probe in place.
  - Alternatives: the D-008 in-place fallback; trust inherited cwd; infer copied imports from a red result alone.
  - Why: addresses `review-1.md PR-002` and `PR-003`; a crash cannot strand a mutation in user work, and a result cannot count unless it exercised the copied graph (`INV-003`, D-003).
  - Supersedes: D-008’s in-place copy/`finally` fallback and any probe contract lacking copied-module identity.
  - Decided by: planner, addressing review-1.md PR-002 and PR-003, 2026-09-15.

- **D-013 - Audit state advances through immutable evidence epochs**
  - Decision: `audit/index.json` points to immutable input manifests under `audit/epochs/<epoch-id>/manifest.json`. Every remediation or authority/inventory change creates a new epoch. A profile may be carried into the new epoch only when the validator rehashes unchanged test source, SUT chain, contract authority, method schema, inventory row, runner/config/setup, and relevant command inputs; carried records name their source epoch. Otherwise they are stale and must be reviewed again. Final ratification references an already-committed `evaluatedRevision` and a canonical `candidateEvidenceDigest` covering source/input digests, deliverables 1–9, and baseline conditions while excluding the later owner block, preventing a self-referential commit/digest.
  - Alternatives: rewrite one “immutable” manifest; invalidate everything on every commit; mix old-revision judgments into a candidate without input proof; include ratification in its own digest.
  - Why: addresses `review-1.md PR-004`; persisted epoch transitions make remediation, restart, carry-forward, and ratification converge without in-memory defaults (`INV-005`, the revision-specific assumption).
  - Supersedes: a single mutable/immutable `audit/manifest.json` and any exact-current-HEAD ratification rule that changes itself when signed.
  - Decided by: planner, addressing review-1.md PR-004, 2026-09-15.

- **D-014 - Calibration passes only on predeclared per-control outcomes**
  - Decision: every calibration control has a stable ID and predeclared expected dimension conclusion(s), evidence basis, reason code(s), and portfolio effect. A row passes only when reviewed actuals match those obligations; every miss blocks profile acceptance until the derived method is amended and the full corpus rerun.
  - Alternatives: treat reviewed completeness as pass; invent expected outcomes during execution; reinterpret historical controls to fit output.
  - Why: addresses `review-1.md PR-005`; the ratified corpus calibrates the method, not vice versa (`AC-009`).
  - Decided by: planner, addressing review-1.md PR-005, 2026-09-15.

- **D-015 - Assessment lane and provenance live on every assessed value**
  - Decision: identity/runtime facts and every human judgment use an `AssessedValue<T>` envelope with lane, assessor, time/tool version, evidence, and override history. Validators require human-reviewed provenance for role, claim/authority, chain adequacy, non-Execution dimension conclusions, criticality, disposition, and portfolio sufficiency; collectors cannot populate those values as defaults. Execution observations may be objective; heuristic candidates stay separate until reviewed.
  - Alternatives: one record-level reviewer; infer authorship from evidence basis; label only final recommendations.
  - Why: addresses `review-1.md PR-006` and makes D-009 enforceable before parallel work (`INV-006`).
  - Decided by: planner, addressing review-1.md PR-006, 2026-09-15.

- **D-016 - Review work is bounded by identities and source span, not file count**
  - Decision: generate work units capped at 50 auditable profile identities, 2,500 relevant source lines, and eight source files, whichever is reached first. Oversized files split at top-level/nested suite boundaries, then declaration ranges if one suite remains oversized; each subdivision carries the same file-context/import/helper digest. At most two reviewer sessions run concurrently and write disjoint unit shards. Actual unit count is census-derived; 18 is not assumed.
  - Alternatives: D-005’s fifteen-file batches; one entire large file per session; one profile file per test.
  - Why: addresses `review-1.md PR-007`; current 7,205-, 3,017-, and 2,054-line test callbacks prove file count is not a workload bound.
  - Supersedes: D-005’s at-most-15-file sizing and the claimed 18-session schedule.
  - Decided by: planner, addressing review-1.md PR-007, 2026-09-15.

- **D-017 - Calibration represents every legitimate system-under-test form**
  - Decision: schema and calibration include typed examples for production functions, shipped files/prompts, configuration, CLI output, subprocess behavior, events, persisted state, and composition roots; each expected Grounding/Realism combination demonstrates that directness and depth are not rankings.
  - Alternatives: validate only vocabulary; infer omitted forms from generic `EvidenceRef`; rely on unit/seam/subprocess positives alone.
  - Why: addresses `review-1.md PR-008` and preserves all of AC-005/`INV-002`.
  - Decided by: planner, addressing review-1.md PR-008, 2026-09-15.

- **D-018 - Repeatability stays repo-local and archive-safe**
  - Decision: expose the utility as `bun scripts/test-health-audit/cli.ts --audit-root <path> <command>` in the method doc; do not add a `package.json` script because `scripts/` is excluded from the npm tarball. Validator tests use temporary fixture audit roots, never the active plan path, so plan archival does not break the permanent suite. Running any project-controlled test command or probe requires an explicit maintainer invocation; a probe additionally prints its target/import route/guardrail and requires explicit probe-ID confirmation.
  - Alternatives: a package script that is broken in the published tarball; permanent tests coupled to `missions/plans/...`; implicit probe execution.
  - Why: preserves the repeatable maintainer method without widening packaging and names the project-controlled execution trust boundary.
  - Decided by: planner-proposed during review-1 revision, 2026-09-15.

## Behaviors

### B-001 - Independent dimensions, evidence bases, grounding forms, and authorship lanes

- Source: AC-001, AC-005, AC-006, AC-014
- Context: profile fixtures cover production functions, shipped files/prompts, configuration, CLI output, subprocesses, events, persisted state, and composition roots, with objective observations and human judgments
- Action: the schema validates the records
- Expected: all seven dimensions use only their ratified vocabularies and each has one common evidence basis; no score/overall-health label is accepted; Grounding and Realism remain independent/non-ranked; every assessed value has enforceable objective or human-reviewed provenance; absent/conflicting authority is `unresolved`; and every legitimate system-under-test form is representable with its concrete expected Grounding/Realism combination
- Seam: `scripts/test-health-audit/schema.ts`
- Test: `tests/scripts/test-health-audit/schema.test.ts` > `preserves seven dimensions all grounding forms and field-level assessment provenance without a score`
- Marker: `@cosmo-behavior plan:test-health-audit#B-001`

### B-002 - Complete source/runtime census precedes a suite conclusion

- Source: AC-002, AC-003
- Context: declarations include ordinary, parameterized, skipped, todo, conditional, unsupported, collection-failing, hook-failing, and test-failing cases across normal, watch, and coverage surfaces
- Action: the audit reconciles source declarations with each command’s reporter evidence
- Expected: every declaration/runtime case and parameter count is reconciled; command identity, errors, empty selections/filters, skips/todos, conditional assertions, flaky/order-sensitive results, and unsupported syntax remain visible; error lifecycle phase is objective only when public evidence establishes it and otherwise is `unknown`/`blocked`; any missing run, mismatch, error, or blind spot makes the census `incomplete` or `blocked`, never clean
- Seam: `scripts/test-health-audit/source-census.ts`, `scripts/test-health-audit/runtime-reporter.ts`, `scripts/test-health-audit/census.ts`, `scripts/test-health-audit/cli.ts`
- Test: `tests/scripts/test-health-audit/census.test.ts` > `reconciles all command surfaces and keeps unsupported or phase-unknown failures blocking`
- Marker: `@cosmo-behavior plan:test-health-audit#B-002`

### B-003 - Calibration must match every predeclared control before profiling

- Source: AC-009
- Context: each stable negative/positive control ID has expected dimension conclusion(s), basis, reason codes, and portfolio effect declared in this plan
- Action: the method is applied and actual reviewed outcomes are compared with those obligations
- Expected: profiling remains blocked unless every required control exists and is `pass`; a row passes only when actuals match all predeclared obligations; any missing row, counterexample, or mismatch is a calibration miss that requires method amendment and a full calibration rerun; no miss can be waived by marking it reviewed
- Seam: `missions/plans/test-health-audit/audit/epochs/<epoch-id>/calibration.md`
- Test: `tests/scripts/test-health-audit/artifacts.test.ts` > `rejects calibration with a missing control or any actual outcome that differs from its declared obligations`
- Marker: `@cosmo-behavior plan:test-health-audit#B-003`

### B-004 - Every auditable test has one current, resumable profile

- Source: AC-004, AC-005, AC-006
- Context: an epoch contains weighted work units, including subdivisions of oversized files and grouped parameterized cases sharing one chain
- Action: reviewers complete disjoint NDJSON unit shards and the epoch validator aggregates them
- Expected: every auditable identity appears exactly once with source/runtime/case count, human-reviewed role/claim/authority/chain, seven conclusions and bases, reasons/counterevidence/uncertainty, portfolio contribution, disposition, field-level provenance, and material-input digests; no unit exceeds the declared workload caps except one indivisible test; missing/duplicate/stale/malformed records block aggregation; restart reconstructs progress from persisted shards and carry-forward requires rehashed unchanged inputs
- Seam: `missions/plans/test-health-audit/audit/epochs/<epoch-id>/profiles/*.ndjson`, `missions/plans/test-health-audit/audit/epochs/<epoch-id>/manifest.json`
- Test: `tests/scripts/test-health-audit/artifacts.test.ts` > `requires one fresh complete profile per identity and safely subdivides oversized files across resumable units`
- Marker: `@cosmo-behavior plan:test-health-audit#B-004`

### B-005 - False-confidence chains are named without condemning legitimate test forms

- Source: AC-007, AC-009
- Context: tests can assert local data, receive outcomes from doubles, encode the wrong contract side, stop before consumer/composition/caller paths, or survive defects, while focused/mediated tests may validly protect one boundary
- Action: the reviewer classifies each evidence chain against calibrated controls
- Expected: ratified reason classes are applied where evidenced; a test counts only for boundaries/axes it protects; no meaningful claim is explicit when none exists; mock use/directness/depth alone never decides value; the `AgentDefinition.session` specimen is excluded from runtime guardrail evidence with an `observational-memory-adoption` pointer and is not changed here
- Seam: `scripts/test-health-audit/schema.ts`, `missions/plans/test-health-audit/audit/epochs/<epoch-id>/profiles/*.ndjson`
- Test: `tests/scripts/test-health-audit/schema.test.ts` > `classifies false-confidence chains without automatically demoting mocks mediation or focused units`
- Marker: `@cosmo-behavior plan:test-health-audit#B-005`

### B-006 - Behavior/risk inventory is independently derived and shipped-scope bounded

- Source: AC-008
- Context: a restricted inventory evidence pack contains current package/CLI/domain surfaces, shipped docs/ratified contracts, architecture records, and incident/risk records but no tests, markers, or coverage
- Action: reviewers derive and freeze inventory work units before test-to-portfolio joining
- Expected: every important shipped behavior/risk family records authority, consequence-based criticality, applicable producer/consumer/adapter/persisted-state/event/alternate-path/composition-root boundaries, and path/caller/defect axes; source-log provenance proves tests/markers/coverage did not define it; later additions require a cited non-test authority and a new epoch
- Seam: `missions/plans/test-health-audit/audit/epochs/<epoch-id>/behavior-risk-inventory.json`
- Test: `tests/scripts/test-health-audit/artifacts.test.ts` > `rejects test-derived inventory and requires authority criticality boundaries and defect axes`
- Marker: `@cosmo-behavior plan:test-health-audit#B-006`

### B-007 - Portfolio conclusions are risk-proportionate and retain gaps

- Source: AC-008, AC-011
- Context: a frozen inventory, complete current profiles, and probe records exist in one epoch
- Action: evidence is joined at each named boundary/defect axis
- Expected: every entry lists contributing tests, probe evidence, gaps/uncertainty, and exactly one `protected`, `partially-protected`, `unprotected`, or `unresolved`; fixture-injected producer tests alone cannot protect a critical user-invokable behavior with possible shipped consumer/adapter/composition failure; missing evidence remains in matrix and gap register
- Seam: `missions/plans/test-health-audit/audit/epochs/<epoch-id>/behavior-risk-matrix.md`, `missions/plans/test-health-audit/audit/epochs/<epoch-id>/gap-register.md`
- Test: `tests/scripts/test-health-audit/artifacts.test.ts` > `rejects protected portfolios with a missing risk-required boundary axis or probe`
- Marker: `@cosmo-behavior plan:test-health-audit#B-007`

### B-008 - Targeted probes are copy-only, causally isolated, and graph-identified

- Source: AC-010
- Context: a critical/historical/seam-sensitive/double-maskable claim requires empirical evidence and the maintainer explicitly confirms its probe ID
- Action: the runner copies the current tree, proves sandbox cwd/config/setup/test/target/import-route containment, runs sandbox green, introduces one realistic defect in the sandbox target, runs the narrow guardrail, removes the sandbox mutation, reruns sandbox green, and verifies the source checkout remained identical
- Expected: the record has one defect/boundary, non-contributing doubles, copied-graph identity, expected red reason, sandbox restored-green evidence, and `probe-confirmed` or `probe-survived`; no source-checkout mutation or `git checkout` is permitted; an unprovable/unsafe copy remains `reasoned` or `unassessed` and cannot count for a required defect
- Seam: `scripts/test-health-audit/probe.ts`, `missions/plans/test-health-audit/audit/epochs/<epoch-id>/probes.jsonl`
- Test: `tests/scripts/test-health-audit/probe.test.ts` > `rejects probes outside the sandbox or without copied import identity isolated outcome and restored green`
- Marker: `@cosmo-behavior plan:test-health-audit#B-008`

### B-009 - Remediation closes evidence failures without unratified contract changes

- Source: AC-012
- Context: a profile/portfolio/probe confirms a weakness
- Action: the loop traces authority, applies the deviation classifier, repairs/replaces/removes or excludes the guardrail test-first, and creates a successor evidence epoch
- Expected: each weakness has affected claims, scope, before/action/closure evidence, profile/matrix updates, and `closed`, `excluded-from-guardrail`, or `unresolved`; absent/conflicting authority remains unresolved for human ruling; no expected behavior changes merely to match production; material changes invalidate or explicitly carry profiles under D-013
- Seam: `missions/plans/test-health-audit/audit/epochs/<epoch-id>/remediation-ledger.md`
- Test: `tests/scripts/test-health-audit/artifacts.test.ts` > `requires authorized closure or guardrail exclusion and blocks unratified contract changes`
- Marker: `@cosmo-behavior plan:test-health-audit#B-009`

### B-010 - Evidence package separates objective gate candidates from heuristics

- Source: AC-011, AC-014, AC-015
- Context: one candidate epoch contains the complete ten deliverable bundles
- Action: the explicit-root audit validator checks schemas, provenance, freshness, scope, and gate recommendations
- Expected: all bundles link to one epoch/digest; recommendations label `objective-candidate` versus `human-reviewed-heuristic`, cite calibration/limitations, activate no CI gate, cross-link `behavioral-regression` and `deliverable-completeness-gates`, and contain no project-health/provider-expansion work; fixture validator tests remain valid after plan archival
- Seam: `missions/plans/test-health-audit/audit/epochs/<epoch-id>/gate-recommendations.md`, `scripts/test-health-audit/artifacts.ts`, `scripts/test-health-audit/cli.ts`
- Test: `tests/scripts/test-health-audit/artifacts.test.ts` > `validates all ten bundles in one epoch and forbids heuristic CI activation or active-plan coupling`
- Marker: `@cosmo-behavior plan:test-health-audit#B-010`

### B-011 - Establishment requires eight conditions and non-circular owner ratification

- Source: AC-013
- Context: a committed candidate epoch has final evidence, canonical candidate digest, and baseline conditions; an optional later owner block references them
- Action: the validator evaluates the eight conditions and verifies the owner block against the evaluated revision/digest
- Expected: any failed/blocked condition, critical unprotected/unresolved portfolio, changed material input, stale digest, or missing owner block yields `not established`; conditions 1–7 yield only `eligible-for-ratification`; `established` is accepted only when the owner ratifies the already-committed evaluated revision and digest, accepted noncritical uncertainties match, and current canonical evidence recomputes identically despite the excluded later ratification block
- Seam: `missions/plans/test-health-audit/audit/epochs/<epoch-id>/baseline.md`, `scripts/test-health-audit/schema.ts`, `scripts/test-health-audit/artifacts.ts`
- Test: `tests/scripts/test-health-audit/artifacts.test.ts` > `accepts established only for eight met conditions and a non-circular exact owner ratification`
- Marker: `@cosmo-behavior plan:test-health-audit#B-011`

## Design

### 1. Modules and contracts

Create repo-maintenance tooling, not framework/runtime code:

- `schema.ts` — exact `as const` vocabularies, plain interfaces, unknown-input parsing, and pure validators; imports no IO/Vitest/production modules.
- `source-census.ts` — bounded TypeScript-AST extraction of Vitest imports/aliases, suites/tests, `.each`, skips/todos/conditionals, assertion candidates, source spans, and unsupported constructs; unsupported/dynamic registration is an assessment limitation, never absence.
- `runtime-reporter.ts` — observation-only Vitest reporter for run/module/case/suite/hook lifecycle, public result/error payloads, locations, IDs, run-end reason, and exact root/config metadata; it classifies no health and does not guess hook-error phase.
- `census.ts` — command-surface reconciliation, error visibility, parameter counts, deterministic repeat comparison, and suite-integrity rendering.
- `artifacts.ts` — epoch/index IO, weighted work-unit construction, material-input freshness/carry-forward validation, ten-bundle validation, canonical digest, and baseline state machine.
- `probe.ts` — copy-sandbox containment, declared import-route resolution, target mutation safety, subprocess cwd/config identity, source-checkout pre/post manifest, and probe record production.
- `cli.ts` — explicit-root command adapter only; parses options and invokes the focused modules.

Dependency direction is `cli/reporter/probe/census/artifacts/source-census -> schema`; `schema` imports none of them. Census and artifact logic do not import product modules. The utility is run explicitly as documented and is not added to the shipped CLI/package.

Core assessed-value contract:

```ts
type EvidenceBasis = "observed" | "probe-confirmed" | "reasoned" | "missing" | "blocked";
type AssessmentLane = "objective-observation" | "human-reviewed-judgment";

interface AssessedValue<T> {
  value: T;
  lane: AssessmentLane;
  basis: EvidenceBasis;
  assessor: { kind: "collector"; id: string; version: string } | { kind: "human"; id: string; reviewedAt: string };
  evidence: EvidenceRef[];
  counterevidence: EvidenceRef[];
  uncertainty: string[];
  overrides: { previousDigest: string; reason: string; assessor: string; at: string }[];
}

interface TestEvidenceProfile {
  schemaVersion: 1;
  id: string;
  source: { path: string; line: number; title: string; ordinal: number; workUnitId: string };
  runtime: AssessedValue<{ discoveryBySurface: Record<TestSurface, RuntimeState>; caseNames: string[]; caseCount: number }>;
  role: AssessedValue<TestRole>;
  claim: AssessedValue<{ status: "identified" | "no-meaningful-claim" | "unresolved"; text: string; authority: EvidenceRef[] }>;
  chain: AssessedValue<{ assertions: EvidenceRef[]; observations: EvidenceRef[]; systemsUnderTest: SystemUnderTestRef[]; limitations: string[] }>;
  dimensions: {
    execution: AssessedValue<ExecutionConclusion>;
    grounding: AssessedValue<GroundingConclusion>;
    contractAlignment: AssessedValue<ContractAlignmentConclusion>;
    faultSensitivity: AssessedValue<FaultSensitivityConclusion>;
    realism: AssessedValue<RealismConclusion>;
    determinism: AssessedValue<DeterminismConclusion>;
    engineeringQuality: AssessedValue<EngineeringQualityConclusion>;
  };
  reasonCodes: AssessedValue<ReasonCode[]>;
  portfolioContributions: AssessedValue<PortfolioContribution[]>;
  disposition: AssessedValue<Disposition>;
  materialInputs: EvidenceDigest[];
  carriedFrom?: { epochId: string; profileDigest: string };
}
```

`SystemUnderTestRef.kind` is one of `production-function`, `shipped-file`, `shipped-prompt`, `configuration`, `cli-output`, `subprocess`, `event`, `persisted-state`, or `composition-root`. Conclusion, basis, reason, portfolio, and disposition unions use the spec’s spelling exactly. There is no score, overall-health field, or universal per-test verdict. Validator rules require human lane for D-009’s judgments; an objective collector may suggest a separate candidate but cannot populate them.

Stable profile ID is a hash of root-relative path, normalized nested declaration title/template, and same-title declaration ordinal. Location and Vitest runtime ID are separate. Parameterized cases share a profile only for one declaration/evidence chain; every case name/count remains visible.

### 2. Suite-integrity census

The census precedes every suite/test-health conclusion:

1. Parse all current `tests/**/*.test.ts` declarations and emit unsupported constructs explicitly.
2. Invoke normal once with the reporter through `bun run test`.
3. Invoke the actual watch surface through `bun run test:watch -- --watch` with the reporter, wait for one complete initial cycle plus watcher-start evidence, then request graceful termination and verify process cleanup. The harness-controlled termination is distinct from an unexpected command failure. If a bounded initial cycle cannot be observed, the watch surface is blocked; `--run` is not substituted and called watch evidence.
4. Invoke coverage once through `bun run test:coverage` with the reporter. Coverage percentages remain context only.
5. Run two additional normal checks: one same-order repeat and one `--sequence.shuffle --sequence.seed <recorded>` run. This fixed regimen is bounded evidence, not proof of universal determinism.
6. Preserve full-suite outcomes for `tests/driver/cross-plan-commit-lock.test.ts`, `tests/plans/archive.test.ts`, and `tests/extensions/project-tools.test.ts`; run each twice in isolation after full collection and record full-versus-isolation evidence. Isolation never excuses a full-suite failure.
7. Reconcile source declarations, collected modules, ready/result cases, suite/module errors, hook events, filters, and surface differences. Individual assertion execution is `unknown` unless unconditional observation/probe establishes it; AST conditional/unreachable candidates are human-reviewed heuristics.

Error records contain `phase`, `phaseBasis`, original serialized payload, entity/test/module, and command. Public module errors can establish collection/outside-run failure; aggregated case/suite errors do not automatically establish hook versus test-body phase. Unknown phase is visible blocked evidence under D-011.

Census state is `complete`, `incomplete`, or `blocked`. `incomplete` exits only after every mismatch/skip/filter/limitation has a disposition and relevant recollection; `blocked` exits only after execution/collection/assessment repair. Neither can render clean. Raw full-suite collection before calibration is inventory data only; no health/clean conclusion is trusted until calibration passes.

### 3. Independent behavior/risk inventory

An inventory reviewer receives a restricted evidence pack—not census identities, test files, markers, or coverage—containing:

- current bin/CLI/domain/public and shipped-artifact surfaces;
- shipped docs and ratified current/archived contracts describing current behavior;
- active architecture decisions governing current code; and
- durability, persistence, recovery, concurrency, security, irreversible-effect, and architectural-dependency incidents.

Partition the authority list into bounded source work units, merge duplicate behavior/risk families only when authority/consequence/boundaries remain explicit, then freeze the source-log and inventory digest. Completion requires a positive coverage statement for every enumerated shipped surface/authority group, not an arbitrary entry cap. Each entry has intended contract/authority, criticality/consequence, applicable producer/consumer/adapter/persisted-state/event/alternate-path/composition-root boundaries, and realistic path/caller/axis defect classes. A later non-test authority discovery creates a successor epoch.

### 4. Calibration contract

Every row records stable ID, polarity, source, expected conclusions/bases/reasons/portfolio effect, actuals, reviewer, and pass/miss. Required obligations:

| ID | Control | Predeclared pass obligation |
|---|---|---|
| N-001 | Green fixture suite disconnected from real corpus/CLI | Individual fixture tests may remain legitimate contributors, but the shipped composition-root matrix cell is missing and the user-invokable portfolio is not `protected`; reason `missing composition root`. |
| N-002 | Six retirements asserted under a maximum of five | Contract alignment `misaligned` with `wrong-side expectation`; excluded from guardrail evidence until corrected against ratified authority. |
| N-003 | Producer tests surviving consumer propagation reverts | Producer contribution remains producer-only; consumer defect is unprotected with `missing consumer seam`; survived mutation is not counted. |
| N-004 | Consumer outcome supplied by another double | First probe is `probe-survived` with `mock-supplied outcome`; only a rerun with other doubles non-contributing may become `probe-confirmed`. |
| N-005 | Deterministic/judgment sibling divergence | Portfolio is not protected across both paths; reason `missing caller or alternate path` and explicit path-parity gap. |
| N-006 | Fixtures doing source/adapter work on wrong side | The claimed shipped adapter/composition cell remains missing; fixture contact cannot substitute for it. |
| N-007 | Helper change without caller enumeration | Class-wide protection remains partial/unresolved until every caller has fix-or-justification evidence; `missing caller or alternate path`. |
| N-008 | Defect class closed after one path/axis | Only the observed axis may be protected; other axes remain explicit gaps, never inferred closed. |
| N-009 | Committed-write error, success/proxy, confirmation/republication axes | Each axis is represented separately; evidence for one cannot establish another. |
| N-010 | `AgentDefinition.session` allowed-value test | No runtime-persistence claim is established; test is excluded from runtime guardrail evidence, linked to `observational-memory-adoption`, and not remediated here. |
| N-011 | Spawn tests with real timeout budgets | A budget is Determinism/Engineering-quality evidence only; it does not prove cleanup. A test observing descendant exit may contribute cleanup evidence. |
| X-001 | Undiscovered external control | Execution `undiscovered`, basis `observed`, reason `undiscovered or filtered test`; never clean. |
| X-002 | Swallowed analysis error | Basis `blocked`, reason `collection or execution error`/`assessment blind spot`; no clean conclusion. |
| X-003 | Incomplete assertion recognition | Unknown assertions remain `missing`/`blocked` with `assessment blind spot`; recognized subset cannot certify completeness. |
| X-004 | Orphaned intent manifest | Contract alignment `unresolved`; no test/portfolio claim is inferred. |
| X-005 | Golden comparison omits material properties | Contract alignment `partially-aligned` or unresolved as authority dictates; omitted property remains an explicit gap. |
| P-001 | `tests/orchestration/spawn-limits.test.ts` | Focused production-function unit may be `direct-production` + `isolated-real-unit`, retained for its narrow claim without composition penalty. |
| P-002 | `tests/orchestration/chain-event-adapter.test.ts` | Event-mediated production seam may be `mediated-production`; mediation is not weakness. |
| P-003 | `tests/artifacts/behavior-conformance.test.ts` / `tests/prompts/planner.test.ts` | Shipped files/prompts may be `shipped-artifact`; artifact contract needs no fake composition-depth promotion. |
| P-004 | `tests/config/loader.test.ts` | Production configuration behavior is a legitimate SUT; synthetic config limits are explicit, not automatic weakness. |
| P-005 | `tests/cli/main.test.ts` render tests | CLI output is representable as an observation; direct renderer coverage contributes only at that seam. |
| P-006 | `tests/agent-packages/claude-binary-runner.test.ts` and `tests/driver/backends/process-reaping.test.ts` | Simulated subprocess boundary and real process observation are distinct legitimate roles; only the latter can prove real cleanup. |
| P-007 | `tests/sessions/session-store.test.ts` | Persisted state is a legitimate SUT with its actual durability limits recorded. |
| P-008 | `tests/durable-runtime/scheduler-recovery.test.ts` | Recovery test may be a strong integrated/persisted contributor; no demotion for setup depth. |
| P-009 | `tests/tasks/task-manager-concurrency.test.ts` | Concurrency test may protect concurrent allocation/update risk when observation and determinism are established. |
| P-010 | `tests/cli/memory/subcommand.test.ts` > real-corpus CLI test | Real CLI composition root against copied real corpus may be `composition-root`; copied data and dry-run limits remain explicit. |

Historical sources are `missions/reviews/improvements/living-memory-implementation.md`, `missions/reviews/improvements/living-memory-fidelity.md`, and `missions/archive/plans/living-memory-fidelity/review-16.md`; external X controls come only from the ratified spec. No deintroverter code is ported. Any missing/mismatched row is a calibration miss; fix the derived method and rerun all rows.

### 5. Evidence epochs, workload, and resume

`audit/index.json` atomically names `currentEpochId` and prior epoch IDs. Each `audit/epochs/<id>/manifest.json` is immutable and contains evaluated HEAD, complete working-tree content digest for material inputs, command definitions, method/schema version, census/inventory digests, authority/SUT input digests, and deterministic work-unit assignments. No correctness outcome depends on an in-memory progress map.

Work units are lexically deterministic after enforcing D-016 caps. Large files split at suite/declaration boundaries and each unit receives shared file-context/import/helper evidence. One reviewer owns one unit; at most two run concurrently; unit paths are disjoint. Each unit writes a temporary sibling and atomically renames after validation. Progress is reconstructed from valid current-epoch unit files. A failed session loses at most its bounded unit.

After remediation or inventory/authority change, create a successor epoch. Recollect required command evidence. For each prior human judgment, recompute all material-input digests. If unchanged, copy the profile into the successor with `carriedFrom`; refresh current runtime observations. If any test/SUT/contract/inventory/method/runner/config/setup input changed or was omitted, re-review it. The final candidate epoch therefore contains a complete current profile set rather than cross-revision references.

### 6. Portfolio join, probes, and remediation

After inventory freeze and calibration pass, join profiles into matrix cells containing profile IDs, probe IDs, evidence basis, gaps, and uncertainty. Missing cells never default to protection. Path parity, caller enumeration, and defect axes are explicit where production presents them.

Probe queue contains every critical entry and each historical/seam-sensitive/mock-maskable claim for which causal inspection is insufficient. The explicit probe command prints sandbox root plan, target, declared import route, config/setup, test selection, and mutation description, then requires `--confirm-probe <id>`. It executes project-controlled code with user privileges only after this maintainer act.

Sandbox protocol:

1. Capture source-checkout status plus target/test/config/setup path existence, type (file/symlink), mode, realpath, and SHA-256.
2. Copy the current working tree to a temp root, excluding `.git`, `node_modules`, coverage, and audit temp output; make dependencies available without allowing production/test/config paths to resolve back to source.
3. Resolve and record test module -> declared import route -> target plus root config/setup beneath sandbox. Any alias/dynamic route that cannot be proven remains unassessed.
4. Set subprocess cwd to sandbox, set reporter output outside it, and run the narrow guardrail green.
5. Apply exactly one realistic mutation to the sandbox target; verify only declared sandbox paths changed; run the guardrail and record expected red or survived.
6. restore/delete only the sandbox mutation from a copy, verify sandbox pre-mutation target digest/mode/realpath, and rerun green.
7. Delete sandbox and prove source-checkout status/path digests are identical. The source checkout was never mutated, so crash safety does not depend on `finally`.

For each confirmed weakness, locate authority and apply the deviation classifier. Conflict/absence becomes `unresolved` plus drafted human decision. Otherwise RED-GREEN-REFACTOR at the narrowest correct seam, rerun probe and affected evidence, then create a successor epoch. Every ledger `open` exits through `closed`, `excluded-from-guardrail`, or `unresolved`; `probe-survived` exits only through remediation plus new confirmation or stays visible/uncounted. The session-field specimen uses exclusion and remains untouched.

### 7. Deliverables and baseline

Each candidate epoch contains the spec’s ten bundles:

1. Method: permanent `docs/test-health-audit.md`, referenced with digest.
2. `suite-integrity.{json,md}`.
3. `profiles/index.json` and `profiles/unit-*.ndjson`.
4. `behavior-risk-matrix.md` and `gap-register.md`.
5. `calibration.md`.
6. `probes.jsonl` and `probes.md`.
7. `remediation-ledger.md`.
8. `residual-uncertainty.md`.
9. `gate-recommendations.md`.
10. `baseline.md`.

Raw evidence and inventory JSON support these bundles but do not replace them.

The candidate epoch is committed before ratification. Its canonical digest covers every material source/test/authority/runner/config/setup digest, bundles 1–9, and canonical baseline condition rows. It excludes volatile render timestamps, `audit/index.json`’s current pointer, and the future owner block. The project owner reviews `evaluatedRevision`, `candidateEvidenceDigest`, critical portfolios, remediation/probes, and uncertainty, then may append a ratification block in a later commit. Validator recomputation over current evidence must equal the candidate digest; any material change requires a new epoch and makes the old decision stale.

| Conditions 1–7 | Owner block | Candidate evidence | Outcome |
|---|---|---|---|
| any `not-met`/`blocked` | any | any | `not established`, with failing rows |
| all `met` | absent | current | `not established`; `eligible-for-ratification` only |
| all `met` | present | changed/stale | `not established`; ratification stale |
| all `met` | exact owner decision | recomputes to evaluated revision/digest | `established` |

The eight rows are the spec’s exact conditions: complete command census; dispositions for skips/todos/conditionals/quarantines/limitations; no counted test-local/misaligned/surviving-defect guardrail; every critical portfolio protected; confirmed weaknesses fixed/replaced/removed/excluded; required probes red for defect and green after exact restoration; remaining uncertainty noncritical/bounded/documented; project-owner ratification. No score participates.

### 8. Open questions remain evidence-resolved

| Ratified open question | Mechanism, not an invented answer |
|---|---|
| Which current Cosmonauts behaviors and risks meet the criticality definition and therefore require targeted probe evidence? | Restricted independent inventory, consequence rationale, human-reviewed criticality, then generated probe queue. |
| Which objective suite-integrity checks prove sufficiently complete and stable to be proposed for immediate gate activation? | Calibration/repeat evidence and `gate-recommendations.md`; this plan activates none. |
| What noncritical residual uncertainties, if any, will the project owner accept when ratifying the baseline? | `residual-uncertainty.md` IDs referenced exactly by the owner block. |
| Which contract conflicts or production violations discovered by corrected tests require separate human rulings before remediation can close? | `unresolved` ledger rows with drafted decisions; no code/expectation change until ruling. |

### 9. Planning capability evidence

Planning investigation found evidence, not a static-health baseline:

- `analysis_status`: dead-code, duplication, complexity, changed-scope audit, trace, and fix-preview bound to Fallow 2.54.2; boundary conformance unbound.
- Path-scoped complexity unsupported; project cognitive analysis reported 75 existing findings across 565 files, including huge test callbacks. This informed D-016 but is not remediated here.
- Duplication failed normalization because provider exit 0 contradicted 91 findings; no duplication-clean claim.
- Boundary conformance is unbound; no boundary baseline.
- Trace confirms runner/config/setup reachability and broad `AgentDefinition` use; direct reading/search supports but cannot mechanically prove an exhaustive absence of every possible reflective `session` use. The audit treats this specimen as calibration evidence, not a static proof.
- Architecture-map index/shards are absent. Inventory uses actual package/CLI/domain/contracts and records missing map evidence.

Provider expansion and whole-project fixes belong to later work.

## Files to Change

- `tests/scripts/test-health-audit/schema.test.ts` ↔ `scripts/test-health-audit/schema.ts` — exact vocabularies, field-level provenance, profile/inventory/probe/baseline validation.
- `tests/scripts/test-health-audit/census.test.ts` ↔ `scripts/test-health-audit/source-census.ts`, `scripts/test-health-audit/runtime-reporter.ts`, `scripts/test-health-audit/census.ts`, `scripts/test-health-audit/cli.ts` — declarations, public reporter evidence, command-surface lifecycle, reconciliation.
- `tests/scripts/test-health-audit/probe.test.ts` ↔ `scripts/test-health-audit/probe.ts` — copied graph identity, containment, crash-safe source preservation.
- `tests/scripts/test-health-audit/artifacts.test.ts` ↔ `scripts/test-health-audit/artifacts.ts`, `scripts/test-health-audit/schema.ts` — fixture-root epochs, workload subdivision, freshness/carry-forward, ten bundles, digest, baseline.
- `docs/test-health-audit.md` — repeatable explicit-root command method, rubric, trust/consent, rerun triggers, cross-links.
- `missions/plans/test-health-audit/audit/index.json` — persisted current/prior epoch index.
- `missions/plans/test-health-audit/audit/epochs/<epoch-id>/manifest.json` and `raw/` — immutable inputs and command evidence.
- `missions/plans/test-health-audit/audit/epochs/<epoch-id>/suite-integrity.json`, `suite-integrity.md`, `profiles/index.json`, and `profiles/unit-*.ndjson` — census/profile evidence.
- `missions/plans/test-health-audit/audit/epochs/<epoch-id>/behavior-risk-inventory.json`, `behavior-risk-matrix.md`, and `gap-register.md` — inventory/portfolio evidence.
- `missions/plans/test-health-audit/audit/epochs/<epoch-id>/calibration.md`, `probes.jsonl`, and `probes.md` — calibration/probe evidence.
- `missions/plans/test-health-audit/audit/epochs/<epoch-id>/remediation-ledger.md`, `residual-uncertainty.md`, `gate-recommendations.md`, and `baseline.md` — closure/decision evidence.
- Evidence-selected current test/production files — only after a ledger row identifies a confirmed in-scope weakness and authority. Add every path before modification. `tests/domains/coding-agents.test.ts` and `AgentDefinition.session` are excluded from remediation here.
- Read-only unless evidence-authorized remediation names them: `package.json`, `scripts/vitest-runner.mjs`, `vitest.config.ts`, `tests/setup.ts`, current `tests/**/*.test.ts`, governing production/artifacts, `docs/testing.md`, `AGENTS.md`, `missions/architecture/code-structure-map.md`, and `ROADMAP.md`.

`package.json` is deliberately unchanged: adding a script pointing to excluded `scripts/` would create a broken published-package command.

## Risks

1. **Unsupported/dynamic source syntax.** Emit source-located assessment blind spots and block clean census; extend only the bounded collector test-first or review manually with blocked evidence.
2. **Reporter phase limits.** Aggregated errors cannot be guessed into hook phases. D-011 preserves payload and unknown phase as blocked; a clean final run has no hidden error to classify.
3. **Watch collection lifecycle.** A bounded real watch cycle may not terminate cleanly. Require watcher/initial-run evidence, graceful signal, and process cleanup; otherwise mark watch blocked, never substitute normal mode.
4. **Expensive bounded regimen.** Five full-surface executions still do not prove universal determinism. Record time/seeds and residual uncertainty; do not add suite-wide mutation or unbounded repetition.
5. **Reviewer drift/large tests.** Workload caps, intra-file subdivision, max-two concurrency, field provenance, calibration resampling, and unit validation limit loss. Disagreement amends method and invalidates affected units.
6. **Incomplete independent inventory/map absence.** Restricted authorities, positive coverage statements, cited exclusions, and successor epochs prevent tests from defining completeness or missing map evidence from becoming clean.
7. **Probe graph escape or work loss.** Realpath containment, copied import route, sandbox cwd/config/setup, source pre/post manifest, explicit confirmation, and no in-place fallback are hard requirements. Any unresolved route stays unassessed.
8. **Unratified contract drift.** Deviation classifier and `unresolved` stop state apply; tests never move first merely to agree with production.
9. **Cross-revision stale evidence.** Epochs and material-input carry-forward rules fail closed. Omitted input invalidates carry-forward; ratification digest excludes only enumerated nonmaterial/self-referential fields.
10. **Scope explosion from findings.** Product decisions, providers, project-wide static health, or feature design halt/escalate. Confirmed in-scope weaknesses are split into evidence-derived remediation work within this slug, not deferred as “future cleanup.”
11. **Planning analysis gaps.** Duplication failed, boundaries unbound, complexity already red, and map absent. Record uncertainty; do not pull `project-health-audit` forward.

## Quality Contract

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | project-native correctness evidence and explicit-root audit schema/freshness validation pass | project-discovered | hard fail; command/collection failure is evidence, not waiver |
| 2 | `artifact-conformance` | universal | bound | behavior-spine required fields, root-relative test references, and exact markers pass | artifact evidence | hard fail; canonical v1 scope only |
| 3 | `mutation` | bindable | unbound | required targeted probes have plan-recorded copied-graph, expected-red, and restored-green evidence | pending | no generic CI enforcement; reasoned/unassessed cannot satisfy a required probe |

Plan-specific assertions:

1. Schema rejects any collapsed/missing dimension, invalid vocabulary, score, unsupported SUT kind, machine-defaulted human judgment, or absent field provenance.
2. Census fixtures prove source/runtime-only cases, parameters, skip/todo/filter/error, unknown hook phase, unsupported syntax, and command mismatch cannot render clean.
3. Applied census has normal, real initial watch, coverage, repeat, shuffle, and full-versus-isolation evidence for all three known-flaky suites.
4. Every stable calibration ID exists and actual conclusion/basis/reasons/portfolio effect matches the declared obligation before profiles are accepted.
5. Weighted unit validation proves exactly one current profile per auditable identity; oversized files subdivide; stale/duplicate/missing/carried-without-input-proof records fail.
6. Every executed required probe proves sandbox module/config/setup/target identity, one isolated defect, no source mutation/`git checkout`, expected red, and sandbox restored green.
7. Every confirmed weakness closes, is excluded, or remains unresolved with a human-decision request; no unratified expectation change passes.
8. Establishment requires all eight rows plus owner ratification of an already-committed evaluated revision/canonical digest; any material change makes it stale.

## Implementation Order

Eleven behaviors remain under the project’s twelve-behavior guidance. The work is intentionally sliced; task creation may be staged as evidence appears, but this planning pass creates none.

1. **Schema/provenance — B-001, B-005.** RED fixtures for all seven dimensions, exact bases/reasons, every SUT kind, non-ranking, no score, field lanes, collector-forbidden judgments, and contract unresolved. GREEN minimal pure validators; REFACTOR keep IO out. **M1:** schema tests green.
2. **Census collectors — B-002.** RED fixture project for aliases/nesting/parameters/skips/todos/conditionals/dynamic unsupported syntax, collection/test/hook failures, and no false phase attribution. Implement source collector, reporter, reconciliation, and explicit-root CLI. **C1:** source census freezes the universe; no conclusions yet.
3. **Command census — B-002.** Run normal, bounded real watch initial cycle, coverage, same-order repeat, deterministic shuffle, and suspect-suite isolation. **C2:** all raw errors/mismatches/unknowns visible; incomplete/blocked cannot proceed as clean.
4. **Independent inventory — B-006.** Give separate reviewers restricted non-test authority units; merge/freeze with positive coverage statements and criticality/boundary/axis fields. **I1:** independent check confirms no test/marker/coverage derivation.
5. **Calibration — B-003.** Execute every N/X/P control against the exact table. On any miss amend derived method/schema, record the miss, and rerun all controls. **K1:** every required ID passes; otherwise stop.
6. **Profile units — B-004.** Generate D-016 work units, max two disjoint reviewer sessions, validate/atomically publish each, and resume from persisted current-epoch units. Re-sample controls between waves. **P-final:** identity set equality, workload caps, complete human provenance, no stale unit.
7. **Portfolio/probes — B-007, B-008.** Join inventory/profiles; enumerate every relevant boundary/path/caller/axis; derive selective probe queue; run only explicitly confirmed copy-only probes. **F1:** no critical `protected` row has a missing required cell/probe; survived/unassessed stays uncounted.
8. **Remediation epochs — B-009.** Per row: authority/deviation check, RED-GREEN-REFACTOR or exclusion, narrow/full correctness, probe rerun, successor epoch, rehash/carry/re-review. **R1:** all confirmed rows closed/excluded/unresolved; critical unresolved halts for human ruling.
9. **Candidate evidence — B-010.** At final candidate commit, rerun complete command regimen, refresh all current objective evidence, validate all ten bundles, uncertainty, objective/heuristic recommendations, roadmap links, scope, and canonical digest. **E1:** stale digest/profile, incomplete census, heuristic CI activation, or scope expansion blocks eligibility.
10. **Eligibility — B-011.** Populate rows 1–7. Automation emits only `not established` or `eligible-for-ratification`. **B1:** every row met or return to owning stage.
11. **Human checkpoint.** Present committed evaluated revision/digest, critical portfolios, ledger, probes, and uncertainty. Only the project owner may append accepted uncertainties and `established`. Without it the plan remains active. After ratification, hand off to separate `project-health-audit`; do not begin it here.
