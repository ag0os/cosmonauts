---
title: Test Health Audit
status: active
createdAt: '2026-09-15T21:15:54.575Z'
updatedAt: '2026-09-16T04:10:00.000Z'
---

## Overview

This plan implements the ratified quality pause in `spec.md`: establish a repeatable test-health assessment method, apply it to the complete current Vitest suite, remediate confirmed weaknesses or remove them from claimed guardrail evidence, and present a revision-pinned baseline for project-owner ratification. It is planned quality/refactor work, not a feature.

Repository exploration on 2026-09-15 enumerated 267 `tests/**/*.test.ts` files. File count is only the starting census: the audit batches by auditable test declarations and relevant source span, and permits subdivisions inside very large test files. Generated objective evidence plus bounded, resumable assessment work units avoid asking one agent to hold the whole suite in one context.

The audit runs **unattended** from census to eligibility (spec `INV-008`, `AC-016`). Every health judgment is produced by an assessing agent from the project’s ratified authorities and curated knowledge, recorded with its evidence and assessor provenance; calibration is what licenses those judgments. The project owner is contacted exactly once, at the terminal ratification, and receives a single packet: the eligibility record, the accepted residual uncertainty, and any contract questions that turned out to lack a ratified authority. No earlier stage stops for a human.

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
- `domains/shared/skills/work-artifacts/references/deviation-protocol.md` owns mutability, deviation routing, and human-only ratification. Ratification stays human-only; *assessment* is not ratification, so agent-assessed conclusions are ordinary derived work under this protocol.
- Spec `INV-008`, `AC-016`, and ratified `D-005`/`D-006` (user ratified, 2026-09-16) own the autonomy boundary: agents assess, the human decides once, and an expectation may be corrected only against a cited ratified authority.

Verified execution surfaces:

- `package.json` maps `test` to `node ./scripts/vitest-runner.mjs`; the wrapper translates `--grep` to `--testNamePattern`, spawns `vitest run`, and forwards signal/exit status.
- `test:watch` invokes `vitest` directly.
- `test:coverage` invokes `vitest run --coverage` directly. **At the planning revision this command exits 1** while every test passes: `Test Files 263 passed | 4 skipped (267)`, `Tests 3133 passed | 21 todo (3154)`, then `ERROR: Coverage for branches (84.96%) does not meet global threshold (85%)` from `coverage.thresholds` in `vitest.config.ts`. The audit records this as a post-run policy exit and a residual-uncertainty entry; it does not remediate it. Raising coverage is a ratified exclusion, `vitest.config.ts` is read-only unless evidence-authorized, and `docs/testing.md` ratchet rule 2 forbids lowering a threshold. It also cannot close incidentally: coverage `include` is `lib/**` while this plan's code lands in `scripts/`.
- `vitest.config.ts` supplies `tests/setup.ts`, a 15-second default, and V8 coverage configuration. `tests/setup.ts` restores spies/mocks and real timers after every test.
- Installed Vitest 3.2.4 exposes the planned reporter lifecycle hooks, but its public hook-end event does not carry a hook error/result. The census therefore never fabricates setup/test/teardown phase identity when the public payload cannot establish it.

Verified calibration evidence includes the no-runtime-consumer `AgentDefinition.session` specimen: `tests/domains/coding-agents.test.ts` validates the declared value, while `tests/cli/session.test.ts` fixtures set it but pass `persistent` explicitly. Direct reads show persistence is invocation-decided in `cli/main.ts`/`cli/session.ts` and plan-scoped in `lib/orchestration/session-factory.ts`; repository field-use search found `.session` otherwise serving configuration/presentation. The audit records and excludes this test from claimed runtime guardrail evidence but does not remediate it; `ROADMAP.md` assigns the drop/keep decision to `observational-memory-adoption`.

## Assumptions

These ratified assumptions are settled and carried verbatim:

- The existing Bun and Vitest commands are the initial supported execution surface, but the audit verifies rather than assumes their completeness.
- Ratified specifications, architecture decisions, explicit human rulings, and the project's curated knowledge records outrank test expectations and current implementation behavior. An assessing agent is expected to consult them directly. When authoritative sources conflict or are absent, alignment remains unresolved.
- Criticality is based on user impact, data or artifact durability, concurrency, recovery, security, irreversible effects, and architectural dependency—not coverage percentage.
- Mocks, fixtures, synthetic projects, and isolated units are legitimate when their role and limitations are explicit and deeper risks are covered elsewhere.
- An objective observation may still require judgment about significance, and an agent supplies that judgment on the record; automation does not convert a heuristic into a fact, and calling a conclusion agent-assessed does not make it objective.
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

- **D-007 - Freeze an independently sourced behavior/risk inventory before test joining** *(independence restated as a derivation rule by D-026, 2026-09-16)*
  - Decision: derive inventory entries from current shipped/public surfaces, ratified shipped specifications, architecture records, and incident/risk records without consulting tests, markers, or coverage; freeze its source log before linking profiles.
  - Alternatives: let current tests/markers define the inventory; enumerate every historical AC without a shipped-scope bound; omit portfolio assessment.
  - Why: implements `INV-004` and prevents current guardrails from defining away missing behavior.
  - Decided by: planner-proposed, 2026-09-15.

- **D-008 - Probe copies, never Git restoration** *(working-tree fallback superseded by D-012, 2026-09-15)*
  - Decision: prefer a copied probe sandbox; the original draft allowed a copied backup plus in-place mutation/`finally` restoration only if sandboxing was infeasible. `git checkout -- <file>` was always forbidden.
  - Alternatives: restore from Git; batch defects; suite-wide mutation.
  - Why: the historical probe destroyed uncommitted fixes.
  - Decided by: planner-proposed, 2026-09-15.

- **D-009 - Mechanical observations and reasoned judgments use separate lanes** *(schema ownership clarified by D-015; lane renamed for agent assessment by D-027, 2026-09-16)*
  - Decision: only objective integrity failures may fail the audit command. Role, contract authority, evidence-chain adequacy, criticality, disposition, and portfolio sufficiency are `agent-assessed-judgment` values — never mechanical collector defaults, and never CI failures here.
  - Alternatives: gate every detectable smell; make all evidence prose-only; require human review of each judgment.
  - Why: preserves `INV-006` as amended — the lane split is between *mechanical observation* and *reasoned judgment*, not between machine and human. A collector that silently defaults a judgment would launder an unassessed field into evidence; an agent that records its reasoning does not.
  - Decided by: planner-proposed, 2026-09-15.

- **D-010 - Automation establishes eligibility, never ratification** *(revision/digest transition clarified by D-013, 2026-09-15)*
  - Decision: automation evaluates baseline conditions and may report `eligible-for-ratification`; only a project-owner block pinned to the evaluated evidence can set `established`.
  - Alternatives: self-establishment; green-suite implicit assent.
  - Why: enforces `INV-007` and D-004.
  - Decided by: planner-proposed, 2026-09-15.

- **D-011 - Unknown lifecycle phase remains blocked evidence**
  - Decision: collect every public Vitest error/result, module error, hook name/event, and stack. Label an error `collection`, `import`, `setup`, `test`, or `teardown` as `observed` only when the public payload directly establishes it; otherwise record `phase: unknown`, basis `blocked`, and an assessment limitation. Stack-based attribution may be an agent-assessed heuristic but cannot replace the blocked objective record.
  - Alternatives: infer hook phase from event adjacency; promise phase fidelity the 3.2.4 reporter API does not expose; omit the error.
  - Why: addresses `review-1.md PR-001` without narrowing AC-003—every error stays visible and unavailable phase evidence cannot become clean (`INV-005`, `INV-006`).
  - Decided by: planner, addressing review-1.md PR-001, 2026-09-15.

- **D-012 - Required probes are copy-only and prove copied resolution** *(sandbox seeding and repository provisioning refined by D-022, 2026-09-16)*
  - Decision: a required probe never mutates the source checkout. Run pre-mutation green, mutation, and post-removal green inside a current-working-tree copy; set subprocess cwd/config/setup to that sandbox; require the reported test module, declared target import route, resolved target/config/setup realpaths, and mutation target to remain beneath the sandbox root. The original checkout’s pre/post path-status and target digests must be identical. If copied execution identity cannot be proved, record `reasoned` or `unassessed`; do not probe in place.
  - Alternatives: the D-008 in-place fallback; trust inherited cwd; infer copied imports from a red result alone.
  - Why: addresses `review-1.md PR-002` and `PR-003`; a crash cannot strand a mutation in user work, and a result cannot count unless it exercised the copied graph (`INV-003`, D-003).
  - Supersedes: D-008’s in-place copy/`finally` fallback and any probe contract lacking copied-module identity.
  - Decided by: planner, addressing review-1.md PR-002 and PR-003, 2026-09-15.

- **D-013 - Audit state advances through immutable evidence epochs** *(transition triggers extended by D-020, 2026-09-16)*
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

- **D-015 - Assessment lane and provenance live on every assessed value** *(assessor is an agent per D-027, 2026-09-16)*
  - Decision: identity/runtime facts and every reasoned judgment use an `AssessedValue<T>` envelope with lane, assessor, time/tool version, evidence, and override history. Validators require `agent-assessed-judgment` provenance — agent id plus model identifier and version — for role, claim/authority, chain adequacy, non-Execution dimension conclusions, criticality, disposition, and portfolio sufficiency; mechanical collectors cannot populate those values as defaults. Execution observations may be objective.
  - Alternatives: one record-level assessor; infer authorship from evidence basis; label only final recommendations.
  - Why: addresses `review-1.md PR-006` and makes D-009 enforceable before parallel work (`INV-006`).
  - Decided by: planner, addressing review-1.md PR-006, 2026-09-15.

- **D-016 - Assessment work is bounded by identities and source span, not file count** *(bound reinterpreted as agent context by D-027, 2026-09-16)*
  - Decision: generate work units capped at 50 auditable profile identities, 2,500 relevant source lines, and eight source files, whichever is reached first. Oversized files split at top-level/nested suite boundaries, then declaration ranges if one suite remains oversized; each subdivision carries the same file-context/import/helper digest. Assessing-agent sessions write disjoint unit shards; concurrency is bounded by machine resources rather than by human attention, and the recorded memory-pressure incident is the reason to raise it deliberately rather than all at once. Actual unit count is census-derived; 18 is not assumed.
  - Alternatives: D-005’s fifteen-file batches; one entire large file per session; one profile file per test.
  - Why: addresses `review-1.md PR-007`; current 7,205-, 3,017-, and 2,054-line test callbacks prove file count is not a workload bound. Under D-027 the cap sizes an assessing agent's context window and keeps one failed session cheap; it is no longer a human-attention budget.
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

- **D-019 - The probe queue takes the spec's five triggers as an unconditional disjunction** *(Added 2026-09-16 after review)*
  - Decision: queue membership is the union of the spec's five required-probe triggers; inspection sufficiency adds claims and never removes them. Infeasibility degrades an already-queued claim to `reasoned`/`unassessed` with the limitation visible, and it cannot count as protection for the defect it was queued against.
  - Alternatives: the prior wording, which subordinated the historical, seam-dependent, and mock-maskable triggers to inspection sufficiency; a validator that adjudicates trigger membership mechanically.
  - Why: the prior narrowing let a mock-maskable or historically false-confident claim count as protection on `reasoned` basis alone — exactly the class `INV-003` and AC-010 exist to distrust. Membership stays human-reviewed per `INV-006`; only the counting rule is validated.
  - Decided by: independent review + spec-fidelity verification, 2026-09-16.

- **D-020 - Every material input change opens a successor epoch** *(Added 2026-09-16 after review; extends D-013)*
  - Decision: remediation, inventory/authority change, a method/schema amendment, and an added or removed test file each open a successor epoch. Epochs advance per remediation *wave*, not per ledger row.
  - Alternatives: epochs only after remediation or authority change; one epoch per row.
  - Why: calibration is expected to amend the method on a miss, so without this the audit had to mutate an immutable manifest, write evidence against a stale method digest, or wedge after the first miss. Wave batching bounds the human re-review radius that whole-module staleness would otherwise multiply.
  - Decided by: chain plan-reviewer (PR-001) + independent review, 2026-09-16.

- **D-021 - An unresolved row is a batched packet line item, never a run-stopping gate** *(Added 2026-09-16 after review; rewritten the same day on user ruling)*
  - Decision: a confirmed weakness whose authority is absent or self-contradicting is recorded `unresolved` with its drafted question and the audit **continues**. Unresolved rows accumulate into the ratification packet, where the owner answers them together with the baseline decision. Baseline condition 5 is satisfied for such a row by the recorded, batched question — not by a prior ruling — so eligibility can be reached with unresolved rows present, and `established` still cannot.
  - Alternatives: routing each unresolved row to a human before eligibility (the first version of this decision); halting only on critical rows; letting an unresolved row pass silently as accepted uncertainty.
  - Why: the first version made the owner adjudicate item by item, which is exactly what the user rejected on 2026-09-16 — the plan's purpose is a system that decides test health, not a decision queue. Batching preserves the no-exit fix (the row has a defined destination) and preserves ratified AC-012 (no contract changes on agent judgment alone) while reducing human contact to one packet.
  - Supersedes: the pre-eligibility human-ruling requirement of this decision's first version.
  - Decided by: user ratified, 2026-09-16.

- **D-022 - Probe sandboxes are seeded from tracked files and carry a real repository** *(Added 2026-09-16 after review; refines D-012)*
  - Decision: seed the sandbox from `git ls-files` plus a recorded untracked allowlist, provision a working repository at the sandbox root, symlink `node_modules`, and direct the Vitest cache away from the shared `node_modules/.vite`.
  - Alternatives: copying the whole working tree; leaving dependency provisioning unnamed; omitting `.git`.
  - Why: a whole-tree copy is ~4.9 GB here because `missions/archive/sessions/` is ~4.8 GB, against ~76 MB tracked. Omitting `.git` breaks guardrails that shell out to git at the project root, failing pre-mutation green for a reason unrelated to the mutation and degrading probes to `unassessed` for an avoidable cause.
  - Decided by: independent review, codebase-feasibility and design-attack lenses, 2026-09-16.

- **D-023 - Probe outcomes are written back into the current epoch's profiles** *(Added 2026-09-16 after review)*
  - Decision: a probe record updates the current-epoch profile's `dimensions.faultSensitivity` and, where protection changes, its `portfolioContributions`. Unit shards stay revisable within an open epoch — only the manifest is immutable — and are revalidated on rewrite; `probe-survived` opens a ledger row.
  - Alternatives: freezing profiles at P-final; recording probe evidence only in the matrix.
  - Why: `probe-confirmed` and `probe-survived` are profile-level fault-sensitivity values that only exist after the probe stage, so without a write-back path every profile's strongest fault-sensitivity evidence was unreachable.
  - Decided by: independent review, scope/sequencing lens, 2026-09-16.

- **D-024 - Generated audit JSON is excluded from Biome rather than formatted to match it** *(Added 2026-09-16 after review)*
  - Decision: add `"!missions/plans/*/audit/**"` to `biome.json` `files.includes`.
  - Alternatives: emitting tab-indented JSON; leaving lint to fail.
  - Why: `bun run lint` is an `AGENTS.md` gate and currently covers `missions/plans/**`. Tab indentation is insufficient — `JSON.stringify` always expands arrays while Biome collapses short ones — so matching would pin Biome's exact array and line-width behavior. More importantly, epoch evidence is immutable and digest-pinned: a formatter that can rewrite a committed manifest via `lint:fix` would silently invalidate the candidate digest and stale a ratified epoch.
  - Decided by: independent review, codebase-feasibility lens (verified against `biome.json`), 2026-09-16.

- **D-025 - A post-run policy exit is command evidence, not a census failure** *(Added 2026-09-16 after review)*
  - Decision: a non-zero exit with no module/suite/case error and no declaration-to-runtime mismatch is recorded as command evidence and, if unresolved, as residual uncertainty; only collection, execution, or hook failures in the reporter payload make the census `incomplete` or `blocked`.
  - Alternatives: treating every non-zero exit as blocking; dropping the coverage surface from the census.
  - Why: `bun run test:coverage` exits 1 at the planning revision on a branch-coverage threshold while all 3133 tests pass. Under the prior rule the census could never be clean for a reason unrelated to test execution, and no in-scope repair existed — raising coverage is a ratified exclusion and lowering the threshold is forbidden by `docs/testing.md` ratchet rule 2.
  - Decided by: independent review, design-attack lens (verified by running the command), 2026-09-16.

- **D-026 - Inventory independence is a derivation rule, not a property of the pack** *(Added 2026-09-16 after review; clarifies D-007)*
  - Decision: the pack excludes the census identity set, test files, and coverage output; where an authority incidentally cites a test path or marker, the assessing agent does not open it and the source log records the authority rather than the citation. The provable claim is that every entry traces to a cited non-test authority and no entry cites a test, marker, or coverage artifact as its authority.
  - Alternatives: claiming the pack contains no test references (false — `missions/architecture/living-memory.md` cites `tests/memory/interface.test.ts`); adding a redaction step.
  - Why: independence was stated as a property of the pack that the pack does not have. Stating it as a derivation rule keeps `AC-008` provable without machinery that cannot verify an assessor's attention — and under D-027 the rule is more checkable, not less, because an agent's consulted-source log is itself recorded evidence.
  - Decided by: independent review, design-attack lens, 2026-09-16.

- **D-027 - Assessment is agent work; the human decides once** *(Added 2026-09-16 on user ruling; implements spec `INV-008`/`D-005`)*
  - Decision: every health judgment — role, claim, evidence chain, all seven dimension conclusions, criticality, disposition, portfolio sufficiency — is produced by an assessing agent consulting ratified authorities and `knowledge/`, and recorded with agent id, model identifier, model version, and the sources it consulted. The `AssessmentLane` values become `objective-observation` and `agent-assessed-judgment`. No stage blocks on human input.
  - Alternatives: human review of each profile (the prior design, which made 267 tests a human queue); a hybrid sampling review; no assessment provenance at all.
  - Why: the user ruled on 2026-09-16 that the framework's models and curated knowledge are sufficient to judge test health, and that the plan's purpose is a system producing healthy tests rather than a decision queue. Trust comes from calibration plus recorded, re-derivable evidence — which is *stronger* than human review here, because an agent's consulted-source log is auditable in a way a reviewer's attention is not.
  - Decided by: user ratified, 2026-09-16.

- **D-028 - Contract corrections require a cited authority, not a human** *(Added 2026-09-16 on user ruling; implements spec `D-006`)*
  - Decision: an assessing agent may correct a wrong-side expectation whenever a ratified authority exists — a spec, an architecture record, a `knowledge/` record, or a prior human ruling — citing it in the ledger row. Only an absent or self-contradicting authority yields `unresolved`, and those batch into the ratification packet under D-021.
  - Alternatives: every contract correction through a human; full agent authority over product intent even with no authority to cite.
  - Why: reading an authority is ordinary agent work and needs no gate, so the common path is unattended. But where no authority exists, "correct the test" and "declare current behavior intended" are the same act, and the spec's own calibration corpus carries that exact defect (an expectation encoding six retirements under a maximum of five). The guard is narrow by construction: it triggers only on missing or contradictory authority, which the inventory pass has already enumerated.
  - Decided by: user ratified, 2026-09-16.

- **D-029 - One ratification packet is the whole human surface** *(Added 2026-09-16 on user ruling)*
  - Decision: `baseline.md` carries a single `## Ratification packet` section containing the eligibility record, every `unresolved` contract question with its drafted options and the agent's recommendation, the residual-uncertainty register, and the critical-portfolio summary. The owner answers it in one pass. Nothing else in the audit solicits human input, and the packet is assembled incrementally so it is complete the moment eligibility is reached.
  - Alternatives: separate escalations per stage; a mid-run question queue the owner drains as it fills.
  - Why: makes "human as last resort at one particular point" a structural property of an artifact rather than a discipline the agents must remember. It also means the owner sees every question in context, against the finished evidence, instead of deciding items before the evidence that would inform them exists.
  - Decided by: user ratified, 2026-09-16.

## Behaviors

### B-001 - Independent dimensions, evidence bases, grounding forms, and authorship lanes

- Source: AC-001, AC-005, AC-006, AC-014
- Context: profile fixtures cover production functions, shipped files/prompts, configuration, CLI output, subprocesses, events, persisted state, and composition roots, with mechanical observations and agent-assessed judgments
- Action: the schema validates the records
- Expected: all seven dimensions, the evidence basis, the reason classes, the portfolio conclusions, and the dispositions accept only the spec's ratified vocabularies, and each dimension has one common evidence basis; no score/overall-health label is accepted; Grounding and Realism remain independent/non-ranked; every assessed value has enforceable `objective-observation` or `agent-assessed-judgment` provenance, the latter carrying agent id and model identifier/version; absent/conflicting authority is `unresolved`; and every legitimate system-under-test form is representable with its concrete expected Grounding/Realism combination
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
- Action: assessing agents complete disjoint NDJSON unit shards and the epoch validator aggregates them
- Expected: every auditable identity appears exactly once with source/runtime/case count, agent-assessed role/claim/authority/chain carrying agent id and model identifier/version, seven conclusions and bases, reasons/counterevidence/uncertainty, portfolio contribution, disposition, field-level provenance, and material-input digests; no unit exceeds the declared workload caps except one indivisible test; missing/duplicate/stale/malformed records block aggregation; restart reconstructs progress from persisted shards and carry-forward requires rehashed unchanged inputs
- Seam: `missions/plans/test-health-audit/audit/epochs/<epoch-id>/profiles/*.ndjson`, `missions/plans/test-health-audit/audit/epochs/<epoch-id>/manifest.json`
- Test: `tests/scripts/test-health-audit/artifacts.test.ts` > `requires one fresh complete profile per identity and safely subdivides oversized files across resumable units`
- Marker: `@cosmo-behavior plan:test-health-audit#B-004`

### B-005 - False-confidence chains are named without condemning legitimate test forms

- Source: AC-007, AC-009
- Context: tests can assert local data, receive outcomes from doubles, encode the wrong contract side, stop before consumer/composition/caller paths, or survive defects, while focused/mediated tests may validly protect one boundary
- Action: the assessing agent classifies each evidence chain against calibrated controls
- Expected: ratified reason classes are applied where evidenced; a test counts only for boundaries/axes it protects; no meaningful claim is explicit when none exists; mock use/directness/depth alone never decides value; the `AgentDefinition.session` specimen is excluded from runtime guardrail evidence with an `observational-memory-adoption` pointer and is not changed here
- Seam: `scripts/test-health-audit/schema.ts`, `missions/plans/test-health-audit/audit/epochs/<epoch-id>/profiles/*.ndjson`
- Test: `tests/scripts/test-health-audit/schema.test.ts` > `classifies false-confidence chains without automatically demoting mocks mediation or focused units`
- Marker: `@cosmo-behavior plan:test-health-audit#B-005`

### B-006 - Behavior/risk inventory is independently derived and shipped-scope bounded

- Source: AC-008
- Context: a restricted inventory evidence pack contains current package/CLI/domain surfaces, shipped docs/ratified contracts, architecture records, and incident/risk records but no tests, markers, or coverage
- Action: assessing agents derive and freeze inventory work units before test-to-portfolio joining
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
- Action: the runner seeds a sandbox from the tracked file set plus a recorded untracked allowlist, provisions a repository and dependencies in it, proves sandbox cwd/config/setup/test/target/import-route containment, runs sandbox green, introduces one realistic defect in the sandbox target, runs the narrow guardrail, removes the sandbox mutation, reruns sandbox green, and verifies the source checkout remained identical
- Expected: the record has one defect/boundary, non-contributing doubles, copied-graph identity, expected red reason, sandbox restored-green evidence, and `probe-confirmed` or `probe-survived`; no source-checkout mutation or `git checkout` is permitted; an unprovable/unsafe copy remains `reasoned` or `unassessed` and cannot count for a required defect; and a queued required claim counted as protection carries either a `probe-confirmed` record or a recorded infeasibility limitation, while a queued claim with neither, and any `probe-survived` claim, is rejected as protection for that defect
- Seam: `scripts/test-health-audit/probe.ts`, `missions/plans/test-health-audit/audit/epochs/<epoch-id>/probes.jsonl`
- Test: `tests/scripts/test-health-audit/probe.test.ts` > `rejects probes outside the sandbox or without copied import identity isolated outcome and restored green`
- Marker: `@cosmo-behavior plan:test-health-audit#B-008`

### B-009 - Remediation closes evidence failures without unratified contract changes

- Source: AC-012
- Context: a profile/portfolio/probe confirms a weakness
- Action: the loop traces authority, applies the deviation classifier, repairs/replaces/removes or excludes the guardrail test-first, and creates a successor evidence epoch
- Expected: each weakness has affected claims, scope, before/action/closure evidence, profile/matrix updates, and `closed`, `excluded-from-guardrail`, or `unresolved`; a correction against a cited ratified authority closes autonomously, while absent or self-contradicting authority yields `unresolved` with a drafted packet question and the run continues rather than halting; no expected behavior changes merely to match production or on agent judgment alone; material changes invalidate or explicitly carry profiles under D-013
- Seam: `missions/plans/test-health-audit/audit/epochs/<epoch-id>/remediation-ledger.md`
- Test: `tests/scripts/test-health-audit/artifacts.test.ts` > `requires authorized closure or guardrail exclusion and blocks unratified contract changes`
- Marker: `@cosmo-behavior plan:test-health-audit#B-009`

### B-010 - Evidence package separates objective gate candidates from heuristics

- Source: AC-011, AC-014, AC-015
- Context: one candidate epoch contains the complete ten deliverable bundles
- Action: the explicit-root audit validator checks schemas, provenance, freshness, scope, and gate recommendations
- Expected: all bundles link to one epoch/digest; recommendations label `objective-candidate` versus `agent-assessed-heuristic`, cite calibration/limitations, activate no CI gate, cross-link `behavioral-regression` and `deliverable-completeness-gates`, and contain no project-health/provider-expansion work; fixture validator tests remain valid after plan archival
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

`cli.ts` commands and their exit contract, since `docs/test-health-audit.md` is the sole durable interface (D-018 adds no package script):

| Command | Produces | Exit 0 | Non-zero exit |
|---|---|---|---|
| `census` | source + runtime reconciliation, raw evidence | census written, state recorded | audit itself failed (unreadable root, invalid manifest, reporter incompatibility) |
| `prepare-units` | deterministic work units in the current epoch | units written | stale or missing census digest |
| `validate` | schema, freshness, ten-bundle, and identity-set validation | all objective checks pass | invalid schema, stale digest, missing/duplicate record, omitted material input |
| `probe --confirm-probe <id>` | one probe record | probe ran and the source checkout is byte-identical | restoration unproven or sandbox containment unproven |
| `baseline` | condition rows 1-7 and the eligibility verdict | verdict written, including `not established` on missing or stale input evidence | the verdict itself could not be computed (unreadable epoch, invalid manifest) |

The distinction the wrapper makes for tests is preserved here: an **observed** failing test run, an `incomplete`/`blocked` census, a calibration miss, and `not established` are all successful observations and exit 0 with the state in the record. A non-zero exit means the audit tooling could not produce trustworthy evidence. No command activates a CI gate.

Dependency direction is `cli/reporter/probe/census/artifacts/source-census -> schema`; `schema` imports none of them. Census and artifact logic do not import product modules. The utility is run explicitly as documented and is not added to the shipped CLI/package.

Core assessed-value contract:

```ts
type EvidenceBasis = "observed" | "probe-confirmed" | "reasoned" | "missing" | "blocked";
type AssessmentLane = "objective-observation" | "agent-assessed-judgment";

type TestSurface = "normal" | "watch" | "coverage" | "repeat" | "shuffle" | "isolation";
type RuntimeState = "collected" | "passed" | "failed" | "skipped" | "todo" | "not-collected" | "errored";
type TestRole = "unit" | "seam/component" | "artifact contract" | "CLI/subprocess" | "persistence" | "recovery" | "concurrency" | "other";

interface EvidenceRef {
  kind: "source-span" | "command-output" | "artifact" | "authority-document" | "probe-record";
  path: string;
  span?: { startLine: number; endLine: number };
  locator?: string;
  quote?: string;
}

interface SystemUnderTestRef extends EvidenceRef {
  kind: "source-span" | "artifact";
  sutKind: "production-function" | "shipped-file" | "shipped-prompt" | "configuration" | "cli-output" | "subprocess" | "event" | "persisted-state" | "composition-root";
}

interface EvidenceDigest {
  path: string;
  scope: "declaration-span" | "file";
  span?: { startLine: number; endLine: number };
  sha256: string;
}

interface PortfolioContribution {
  inventoryId: string;
  boundary: string;
  defectAxes: string[];
}

interface AssessedValue<T> {
  value: T;
  lane: AssessmentLane;
  basis: EvidenceBasis;
  assessor:
    | { kind: "collector"; id: string; version: string; observedAt: string }
    | { kind: "agent"; id: string; model: string; modelVersion: string; assessedAt: string; consultedAuthorities: EvidenceRef[] }
    | { kind: "human"; id: string; reviewedAt: string };
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

`SystemUnderTestRef.sutKind` enumerates the spec's legitimate system-under-test forms. Conclusion, basis, reason, portfolio, and disposition unions use the spec’s spelling exactly. There is no score, overall-health field, or universal per-test verdict. Validator rules require the `agent-assessed-judgment` lane with a `kind: "agent"` assessor for D-009’s judgments; a mechanical collector may suggest a separate candidate but cannot populate them. The `kind: "human"` assessor appears only inside the ratification packet, never on a profile.

Stable profile ID is a hash of root-relative path, normalized nested declaration title/template, and same-title declaration ordinal. Location and Vitest runtime ID are separate. Parameterized cases share a profile only for one declaration/evidence chain; every case name/count remains visible.

### 2. Suite-integrity census

The census precedes every suite/test-health conclusion:

1. Parse all current `tests/**/*.test.ts` declarations and emit unsupported constructs explicitly. The universe is re-derived per epoch rather than pinned once, so identities introduced after an earlier epoch — including the tests this plan adds under `tests/scripts/test-health-audit/**` and any guardrail added by remediation — are ordinary auditable identities requiring complete fresh profiles in the candidate epoch. They are never carried, exempted, or treated as audit infrastructure.
2. Invoke normal once with the reporter through `bun run test`.
3. Invoke the actual watch surface through `bun run test:watch -- --watch` with the reporter, wait for one complete initial cycle plus watcher-start evidence, then request graceful termination and verify process cleanup. The harness-controlled termination is distinct from an unexpected command failure. If a bounded initial cycle cannot be observed, the watch surface is blocked; `--run` is not substituted and called watch evidence.
4. Invoke coverage once through `bun run test:coverage` with the reporter. Coverage percentages remain context only.
5. Run two additional normal checks: one same-order repeat and one `--sequence.shuffle --sequence.seed <recorded>` run. This fixed regimen is bounded evidence, not proof of universal determinism.
6. Preserve full-suite outcomes for `tests/driver/cross-plan-commit-lock.test.ts`, `tests/plans/archive.test.ts`, and `tests/extensions/project-tools.test.ts`; run each twice in isolation after full collection and record full-versus-isolation evidence. Isolation never excuses a full-suite failure.
7. Reconcile source declarations, collected modules, ready/result cases, suite/module errors, hook events, filters, and surface differences. Individual assertion execution is `unknown` unless unconditional observation/probe establishes it; AST conditional/unreachable candidates are agent-assessed heuristics.

Error records contain `phase`, `phaseBasis`, original serialized payload, entity/test/module, and command. Public module errors can establish collection/outside-run failure; aggregated case/suite errors do not automatically establish hook versus test-body phase. Unknown phase is visible blocked evidence under D-011.

A non-zero command exit whose reporter payload shows no module/suite/case error and no declaration-to-runtime mismatch is a **post-run policy exit** (the coverage-threshold violation above is the live instance): it is recorded as command evidence and, if unresolved, as residual uncertainty, but it does not by itself make the census `incomplete` or `blocked`. Only collection, execution, or hook failures evidenced in the reporter payload block. This also fixes the scope of the word "error" in B-002.

Census state is `complete`, `incomplete`, or `blocked`. `incomplete` exits only after every mismatch/skip/filter/limitation has a disposition and relevant recollection; `blocked` exits only after execution/collection/assessment repair. Neither can render clean. Raw full-suite collection before calibration is inventory data only; no health/clean conclusion is trusted until calibration passes.

### 3. Independent behavior/risk inventory

An inventory-assessing agent receives a restricted evidence pack that excludes the census identity set, test files, and coverage output, containing:

- current bin/CLI/domain/public and shipped-artifact surfaces;
- shipped docs and ratified current/archived contracts describing current behavior;
- active architecture decisions governing current code; and
- durability, persistence, recovery, concurrency, security, irreversible-effect, and architectural-dependency incidents.

Some authorities incidentally cite test paths or behavior markers — `missions/architecture/living-memory.md` cites `tests/memory/interface.test.ts`, and `docs/testing.md` names `tests/setup.ts`. Such a citation is never an inventory source: an entry cites the authority's behavioral statement, and the agent does not open a cited test file — its consulted-source log records which authorities it actually read, so the rule is checkable after the fact. The source log records the authority, not the citation. The provable form of the independence claim is therefore that every entry traces to a cited non-test authority in the frozen source log, and no entry cites a test, marker, or coverage artifact as its authority.

Partition the authority list into bounded source work units, merge duplicate behavior/risk families only when authority/consequence/boundaries remain explicit, then freeze the source-log and inventory digest. Completion requires a positive coverage statement for every enumerated shipped surface/authority group, not an arbitrary entry cap. Each entry has intended contract/authority, criticality/consequence, applicable producer/consumer/adapter/persisted-state/event/alternate-path/composition-root boundaries, and realistic path/caller/axis defect classes. A later non-test authority discovery creates a successor epoch.

### 4. Calibration contract

Calibration is what licenses agent autonomy under D-027: it is the evidence that an assessing agent's judgments track the historical defect classes before those judgments are trusted against the suite. Every row records stable ID, polarity, source, expected conclusions/bases/reasons/portfolio effect, actuals, assessor (agent id and model identifier/version), and pass/miss. Every row predeclares all four D-014 fields — expected dimension conclusion(s), evidence basis, reason code(s), and portfolio effect — each written as the ratified vocabulary token in backticks, with any field deliberately left open for that row written as `unconstrained` rather than omitted. Each control also names an exact source identity (a declaration's executable title, not a whole file). The recorded `expected` columns must transcribe this table verbatim; a divergence between the table and the recorded expected is itself a calibration miss. Required obligations:

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

Work units are lexically deterministic after enforcing D-016 caps. Large files split at suite/declaration boundaries and each unit receives shared file-context/import/helper evidence. One assessing agent owns one unit and unit paths are disjoint; concurrency is bounded by machine resources rather than human attention, raised deliberately given the recorded memory-pressure incident. Each unit writes a temporary sibling and atomically renames after validation. Progress is reconstructed from valid current-epoch unit files. A failed session loses at most its bounded unit.

Create a successor epoch on any material change to a frozen input: remediation, an inventory/authority change, a calibration- or disagreement-driven method/schema amendment, or an added or removed test file. A method/schema amendment therefore never writes new evidence against a stale method digest and never mutates an immutable manifest. Recollect required command evidence. For each prior agent-assessed judgment, recompute all material-input digests. If unchanged, copy the profile into the successor with `carriedFrom`; refresh current runtime observations. If any test/SUT/contract/inventory/method/runner/config/setup input changed or was omitted, re-assess it. The final candidate epoch therefore contains a complete current profile set rather than cross-revision references; the complete-current-profile obligation binds at that final candidate epoch, not at each intermediate one.

Digest granularity is pinned so invalidation neither over- nor under-fires: `materialInputs`/`EvidenceDigest` covers the recorded declaration span cited in the profile's evidence chain for `production-function` system-under-test refs, and whole-file content for runner, config, setup, and contract inputs. Without this a hub-module edit would invalidate every profile citing the file — 59 test files reference `lib/tasks` alone.

### 6. Portfolio join, probes, and remediation

After inventory freeze and calibration pass, join profiles into matrix cells containing profile IDs, probe IDs, evidence basis, gaps, and uncertainty. A probe record is written back into the current-epoch profile's `dimensions.faultSensitivity` and, where it changes protection, its `portfolioContributions`: unit shards remain revisable within an open epoch — only the manifest is immutable — and are revalidated on rewrite. A `probe-survived` result additionally opens a remediation-ledger row under B-009. Missing cells never default to protection. Path parity, caller enumeration, and defect axes are explicit where production presents them.

The probe queue contains, unconditionally: every critical behavior/risk entry; every claim in a known historical false-confidence class; every guardrail whose claimed value depends on a consumer, adapter, alternate path, persistence boundary, or composition root; and every claim whose observed outcome could be supplied by a mock or fixture independently of the production path under test. It additionally contains any other claim for which reasoned inspection cannot establish that the intended defect would be detected — inspection sufficiency is a fifth trigger that adds claims to the queue, never a filter that removes them. A queued probe that proves infeasible or unprovable under D-012 degrades to `reasoned` or `unassessed` with the limitation visible, and cannot count for the defect it was queued against. The explicit probe command prints sandbox root plan, target, declared import route, config/setup, test selection, and mutation description, then requires `--confirm-probe <id>`. It executes project-controlled code with user privileges only after this maintainer act.

Sandbox protocol:

1. Capture source-checkout status plus target/test/config/setup path existence, type (file/symlink), mode, realpath, and SHA-256.
2. Seed a temp root from the tracked file set (`git ls-files -z`) plus an explicitly enumerated untracked allowlist the probe target actually requires (for example compiled `bin/cosmo-*` runners); record that allowlist in the probe record so containment stays provable. Never copy gitignored bulk — `missions/archive/sessions/` alone is ~4.8 GB, so a naive whole-tree copy is ~4.9 GB per probe against ~76 MB for the tracked set.
3. Provision a working repository at the sandbox root (copy `.git`, or `git init` plus one commit inside the sandbox honoring the source `.gitignore`). Guardrails that shell out to git at the project root exist — `tests/config/biome.test.ts` runs `git check-ignore` against `process.cwd()` — and without a repository they fail step 6's pre-mutation green for a reason unrelated to the mutation, silently degrading probes to `unassessed`.
4. Make dependencies available by an explicitly named mechanism — symlink the source `node_modules` at the sandbox root — while keeping production, test, and config paths resolving inside the sandbox. Because Vitest's cache lives at `node_modules/.vite`, the run must direct its cache elsewhere so a mutated copy never shares or poisons the source transform cache.
5. Resolve and record test module -> declared import route -> target plus root config/setup beneath sandbox. Any alias/dynamic route that cannot be proven remains unassessed.
6. Set subprocess cwd to sandbox, set reporter output outside it, and run the narrow guardrail green.
7. Apply exactly one realistic mutation to the sandbox target; verify only declared sandbox paths changed; run the guardrail and record expected red or survived.
8. Restore/delete only the sandbox mutation from a copy, verify sandbox pre-mutation target digest/mode/realpath, and rerun green.
9. Delete sandbox and prove source-checkout status/path digests are identical. The source checkout was never mutated, so crash safety does not depend on `finally`.

For each confirmed weakness, locate authority and apply the deviation classifier. A cited ratified authority — spec, architecture record, `knowledge/` record, or prior human ruling — lets the agent correct the expectation autonomously under D-028. Conflict or absence becomes `unresolved` with a drafted packet question, and the run continues. Otherwise RED-GREEN-REFACTOR at the narrowest correct seam, rerun probe and affected evidence, then create a successor epoch per remediation **wave**: several ledger rows may close under one successor epoch and one re-review pass over the union of invalidated profiles, so the human re-review radius is batched rather than multiplied per row. Every ledger `open` exits through `closed`, `excluded-from-guardrail`, or `unresolved`; `probe-survived` exits only through remediation plus new confirmation or stays visible/uncounted. Every `unresolved` confirmed weakness — critical or not — becomes a line item in the single ratification packet (D-021, D-029) and the audit proceeds. Baseline condition 5 is satisfied for such a row by the recorded, batched question rather than by a prior ruling, which is what gives the row a defined exit without stopping the run; `established` still requires the owner to answer it.

The session-field specimen uses exclusion and remains untouched.

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

The candidate epoch is committed before ratification. Its canonical digest covers every material source/test/authority/runner/config/setup digest, bundles 1–9, and canonical baseline condition rows. It excludes volatile render timestamps, `audit/index.json`’s current pointer, and the future owner block. `baseline.md` carries one `## Ratification packet` section — the audit's entire human surface (D-029) — assembled incrementally so it is complete the moment eligibility is reached. It contains `evaluatedRevision` and `candidateEvidenceDigest`, the critical-portfolio summary, remediation and probe outcomes, the residual-uncertainty register, and every `unresolved` contract question with its drafted options and the assessing agent's recommendation. The owner answers the packet in one pass and may append a ratification block in a later commit. Validator recomputation over current evidence must equal the candidate digest; any material change requires a new epoch and makes the old decision stale.

| Conditions 1–7 | Owner block | Candidate evidence | Outcome |
|---|---|---|---|
| any `not-met`/`blocked` | any | any | `not established`, with failing rows |
| all `met` | absent | current | `not established`; `eligible-for-ratification` only |
| all `met` | present | changed/stale | `not established`; ratification stale |
| all `met` | exact owner decision | recomputes to evaluated revision/digest | `established` |

The eight rows are the spec’s exact conditions: complete command census; dispositions for skips/todos/conditionals/quarantines/limitations; no counted test-local/misaligned/surviving-defect guardrail; every critical portfolio protected; confirmed weaknesses fixed/replaced/removed/excluded, or carried as an answered packet question; required probes red for defect and green after exact restoration; remaining uncertainty noncritical/bounded/documented; project-owner ratification. No score participates.

### 8. Open questions remain evidence-resolved

| Ratified open question | Mechanism, not an invented answer |
|---|---|
| Which current Cosmonauts behaviors and risks meet the criticality definition and therefore require targeted probe evidence? | Restricted independent inventory, consequence rationale, agent-assessed criticality, then generated probe queue. |
| Which objective suite-integrity checks prove sufficiently complete and stable to be proposed for immediate gate activation? | Calibration/repeat evidence and `gate-recommendations.md`; this plan activates none. |
| What noncritical residual uncertainties, if any, will the project owner accept when ratifying the baseline? | `residual-uncertainty.md` IDs referenced exactly by the owner block. |
| Which contract conflicts or production violations discovered by corrected tests lack a ratified authority, and therefore reach the ratification packet rather than closing autonomously? | `unresolved` ledger rows with drafted decisions; no code/expectation change until ruling. |

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
- `missions/plans/test-health-audit/audit/epochs/<epoch-id>/suite-integrity.json` and `missions/plans/test-health-audit/audit/epochs/<epoch-id>/suite-integrity.md` — census evidence.
- `missions/plans/test-health-audit/audit/epochs/<epoch-id>/profiles/index.json` and `missions/plans/test-health-audit/audit/epochs/<epoch-id>/profiles/unit-*.ndjson` — per-test evidence profiles.
- `missions/plans/test-health-audit/audit/epochs/<epoch-id>/behavior-risk-inventory.json` — frozen independent inventory.
- `missions/plans/test-health-audit/audit/epochs/<epoch-id>/behavior-risk-matrix.md` and `missions/plans/test-health-audit/audit/epochs/<epoch-id>/gap-register.md` — portfolio evidence.
- `missions/plans/test-health-audit/audit/epochs/<epoch-id>/calibration.md` — calibration controls and trust-gate result.
- `missions/plans/test-health-audit/audit/epochs/<epoch-id>/probes.jsonl` and `missions/plans/test-health-audit/audit/epochs/<epoch-id>/probes.md` — targeted probe records.
- `missions/plans/test-health-audit/audit/epochs/<epoch-id>/remediation-ledger.md` and `missions/plans/test-health-audit/audit/epochs/<epoch-id>/residual-uncertainty.md` — closure and uncertainty evidence.
- `missions/plans/test-health-audit/audit/epochs/<epoch-id>/gate-recommendations.md` and `missions/plans/test-health-audit/audit/epochs/<epoch-id>/baseline.md` — recommendations, the final decision record, and the single `## Ratification packet` section (D-029).
- `biome.json` — add `"!missions/plans/*/audit/**"` to `files.includes`, following the existing `!missions/tasks/config.json` and `!.fallow-baselines` precedent for generated JSON.
- Evidence-selected current test/production files — only after a ledger row identifies a confirmed in-scope weakness and authority. Add every path before modification. `tests/domains/coding-agents.test.ts` and `AgentDefinition.session` are excluded from remediation here.
- Read-only unless evidence-authorized remediation names them: `package.json`, `scripts/vitest-runner.mjs`, `vitest.config.ts`, `tests/setup.ts`, current `tests/**/*.test.ts`, governing production/artifacts, `docs/testing.md`, `AGENTS.md`, `missions/architecture/code-structure-map.md`, and `ROADMAP.md`.

`package.json` is deliberately unchanged: adding a script pointing to excluded `scripts/` would create a broken published-package command.

## Risks

1. **Unsupported/dynamic source syntax.** Emit source-located assessment blind spots and block clean census; extend only the bounded collector test-first or review manually with blocked evidence.
2. **Reporter phase limits.** Aggregated errors cannot be guessed into hook phases. D-011 preserves payload and unknown phase as blocked; a clean final run has no hidden error to classify.
3. **Watch collection lifecycle.** A bounded real watch cycle may not terminate cleanly. Require watcher/initial-run evidence, graceful signal, and process cleanup; otherwise mark watch blocked, never substitute normal mode.
4. **Expensive bounded regimen.** Five full-surface executions still do not prove universal determinism. Record time/seeds and residual uncertainty; do not add suite-wide mutation or unbounded repetition.
5. **Assessor drift, over-claiming, or large tests.** This is the central risk of D-027: an agent can produce a fluent, well-formatted judgment that is wrong, and unlike a weak test it leaves no failing signal. Controls: calibration must pass before any unit is accepted and is re-sampled between waves; every judgment records its consulted authorities so a conclusion can be re-derived and contradicted; workload caps and intra-file subdivision keep each context tractable; unit validation rejects malformed or incomplete records. A calibration miss amends the method and invalidates affected units. Residual exposure is explicit: agent assessment is `reasoned` basis, not `observed`, and the probe queue exists precisely because reasoning is not evidence for the claims that matter most.
6. **Incomplete independent inventory/map absence.** Restricted authorities, positive coverage statements, cited exclusions, and successor epochs prevent tests from defining completeness or missing map evidence from becoming clean.
7. **Probe graph escape or work loss.** Realpath containment, copied import route, sandbox cwd/config/setup, source pre/post manifest, explicit confirmation, and no in-place fallback are hard requirements. Any unresolved route stays unassessed.
8. **Unratified contract drift.** The deviation classifier applies and a correction requires a cited ratified authority (D-028); absent or contradictory authority yields `unresolved` and a packet question rather than an agent ruling. Tests never move first merely to agree with production. This is the one place autonomy is deliberately withheld, because there the audit could otherwise absorb a production defect as intent.
9. **Cross-revision stale evidence.** Epochs and material-input carry-forward rules fail closed. Omitted input invalidates carry-forward; ratification digest excludes only enumerated nonmaterial/self-referential fields.
10. **Scope explosion from findings.** Providers, project-wide static health, or feature design escalate into the ratification packet rather than halting the run; a product decision becomes an `unresolved` packet question. Confirmed in-scope weaknesses are split into evidence-derived remediation work within this slug, not deferred as “future cleanup.”
11. **Planning analysis gaps.** Duplication failed, boundaries unbound, complexity already red, and map absent. Record uncertainty; do not pull `project-health-audit` forward.

## Quality Contract

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | project-native correctness evidence and explicit-root audit schema/freshness validation pass | project-discovered | hard fail; command/collection failure is evidence, not waiver |
| 2 | `artifact-conformance` | universal | bound | behavior-spine required fields, root-relative test references, and exact markers pass | artifact evidence | hard fail; canonical v1 scope only |
| 3 | `mutation` | bindable | unbound | required targeted probes have plan-recorded copied-graph, expected-red, and restored-green evidence | pending | no generic CI enforcement; reasoned/unassessed cannot satisfy a required probe |

Plan-specific assertions:

1. Schema rejects any collapsed/missing dimension, invalid vocabulary, score, unsupported SUT kind, collector-defaulted reasoned judgment, absent field provenance, or agent-assessed value missing its model identifier/version and consulted authorities.
2. Census fixtures prove source/runtime-only cases, parameters, skip/todo/filter/error, unknown hook phase, unsupported syntax, and command mismatch cannot render clean.
3. Applied census has normal, real initial watch, coverage, repeat, shuffle, and full-versus-isolation evidence for all three known-flaky suites.
4. Every stable calibration ID exists and actual conclusion/basis/reasons/portfolio effect matches the declared obligation before profiles are accepted.
5. Weighted unit validation proves exactly one current profile per auditable identity; oversized files subdivide; stale/duplicate/missing/carried-without-input-proof records fail.
6. Every executed required probe proves sandbox module/config/setup/target identity, one isolated defect, no source mutation/`git checkout`, expected red, and sandbox restored green.
7. Every confirmed weakness closes against a cited ratified authority, is excluded, or remains `unresolved` as a drafted packet question without halting the run; no expectation change passes on agent judgment alone where authority is absent or self-contradicting.
8. `bun run lint` is clean after a full epoch is written under `missions/plans/test-health-audit/audit/`.
9. The audit reaches `eligible-for-ratification` with no human input at any stage, and `baseline.md` carries exactly one `## Ratification packet` section holding every question the owner must answer.
10. Establishment requires all eight rows plus owner ratification of an already-committed evaluated revision/canonical digest; any material change makes it stale.

## Implementation Order

Eleven behaviors remain under the project’s twelve-behavior guidance. The work is intentionally sliced; task creation may be staged as evidence appears, but this planning pass creates none.

1. **Schema/provenance — B-001, B-005.** RED fixtures for all seven dimensions, exact bases/reasons, every SUT kind, non-ranking, no score, field lanes, collector-forbidden judgments, and contract unresolved. GREEN minimal pure validators; REFACTOR keep IO out. **M1:** schema tests green.
2. **Census collectors — B-002.** RED fixture project for aliases/nesting/parameters/skips/todos/conditionals/dynamic unsupported syntax, collection/test/hook failures, and no false phase attribution. Implement source collector, reporter, reconciliation, and explicit-root CLI. **C1:** the source census is derived for the current epoch (it is re-derived per epoch, never pinned once); no conclusions yet; `docs/test-health-audit.md` v1 publishes the explicit-root invocation, the reviewer rubric, and the trust/consent rules, because reviewers apply that rubric from stage 4 onward.
3. **Command census — B-002.** Run normal, bounded real watch initial cycle, coverage, same-order repeat, deterministic shuffle, and suspect-suite isolation. **C2:** all raw errors/mismatches/unknowns visible; incomplete/blocked cannot proceed as clean.
4. **Independent inventory — B-006.** Give separate assessing agents restricted non-test authority units; merge/freeze with positive coverage statements and criticality/boundary/axis fields. **I1:** an independent agent pass confirms no test/marker/coverage derivation, using each unit's consulted-source log.
5. **Calibration — B-003.** Execute every N/X/P control against the exact table. On any miss amend the derived method document and schema, open a successor epoch for the amended method digest, record the miss, and rerun all controls. **K1:** every required ID passes; otherwise stop.
6. **Profile units — B-004.** Generate D-016 work units, run disjoint assessing-agent sessions at a machine-bounded concurrency, validate/atomically publish each, and resume from persisted current-epoch units. Re-sample controls between waves. **P-final:** identity set equality, workload caps, complete agent-assessment provenance, no stale unit.
7. **Portfolio/probes — B-007, B-008.** Join inventory/profiles; enumerate every relevant boundary/path/caller/axis; derive selective probe queue; run only explicitly confirmed copy-only probes. **F1:** no critical `protected` row has a missing required cell/probe; survived/unassessed stays uncounted.
8. **Remediation epochs — B-009.** Per wave: authority/deviation check, RED-GREEN-REFACTOR or exclusion, narrow/full correctness, probe rerun, one successor epoch per wave, rehash/carry/re-assess over the union of invalidated profiles. **R1:** all confirmed rows closed against a cited authority, excluded, or `unresolved` with a drafted packet question; no row halts the run.
9. **Candidate evidence — B-010.** At final candidate commit, re-derive the source census over the current tree and run a bounded profiling wave (stage 6 mechanics) over any identity the refreshed census shows without a current-epoch profile — including the `tests/scripts/test-health-audit/**` tests this plan adds — then rerun the complete command regimen, refresh all current objective evidence, validate all ten bundles, uncertainty, objective/heuristic recommendations, roadmap links, scope, and canonical digest. **E1:** stale digest/profile, incomplete census, heuristic CI activation, or scope expansion blocks eligibility.
10. **Eligibility — B-011.** Populate rows 1–7. Automation emits only `not established` or `eligible-for-ratification`. **B1:** every row met or return to owning stage.
11. **Ratification packet — the single human checkpoint.** Deliver the committed `baseline.md` whose `## Ratification packet` section holds the evaluated revision/digest, critical portfolios, ledger, probes, residual uncertainty, and every batched contract question with its drafted options and recommendation. This is the audit's only request for human input. Only the project owner may append accepted uncertainties, answers, and `established`. Without it the plan remains active. After ratification, hand off to separate `project-health-audit`; do not begin it here.
