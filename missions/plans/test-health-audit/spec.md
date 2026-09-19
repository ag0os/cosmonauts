# Test Health Audit

## Purpose

Cosmonauts has paused feature and active-plan development because a green test suite does not currently provide enough evidence that important behavior is protected. Historical failures show that tests can execute production code yet miss the real consumer, inject every dependency while omitting the shipped composition root, accept mock-supplied outcomes, or encode the wrong side of a contract.

This work establishes a repeatable method for evaluating test health, applies it to the complete current suite, remediates confirmed weaknesses, and records the trustworthy baseline required before development resumes.

Test health is not coverage, test count, or production-code contact. A healthy test is executable, grounded in a legitimate system under test, aligned with an authoritative contract, appropriately realistic for its role, sensitive to the faults it claims to guard against, deterministic enough to trust, and maintainable enough to remain useful.

A valuable test contributes distinct protection or useful fault localization to a behavior or risk. A focused unit test may be healthy and valuable without reaching a composition root; that deeper protection may be supplied by another test in the behavior’s portfolio. Conversely, a directly grounded test may be healthy in form but provide little value if it protects no meaningful contract or cannot detect a realistic defect.

## Intent

Goal: A green Cosmonauts test suite must provide traceable and appropriately strong evidence that important shipped behaviors and risks are protected, while making gaps and uncertainty visible.

Invariants — mechanism yields to these:

- INV-001 - Test health remains multidimensional. Grounding, contract alignment, fault sensitivity, realism, determinism, and engineering quality are recorded independently and are never collapsed into a score.
- INV-002 - Legitimate grounding includes production behavior and shipped artifacts. Functions, files, prompts, configuration, CLI output, subprocess behavior, events, persisted state, and composition roots may all be systems under test; direct invocation is not automatically strong, and mediation is not automatically weak.
- INV-003 - Green execution, coverage, and production contact never substitute for contract alignment and fault sensitivity. A guardrail must protect the intended side of a meaningful contract and be capable of noticing a realistic defect.
- INV-004 - Adequacy is judged both per test and per behavior or risk. Critical protection may require a portfolio spanning producer, consumer, alternate path, persistence boundary, and real composition root rather than one all-encompassing test.
- INV-005 - Missing evidence never becomes clean evidence. Discovery mismatches, collection or execution errors, skips, todos, conditional assertions, assessment failures, and unsupported cases remain visible in every relevant conclusion.
- INV-006 - Heuristic conclusions are agent-assessed and recorded with their evidence, reasoning, and assessor provenance; calibration, not human review, is what licenses them. No heuristic finding becomes a CI failure merely because it can be automated.
- INV-007 - Feature development resumes only after confirmed weaknesses are remediated, critical behaviors and risks meet the ratified protection bar, residual uncertainty is explicit, and a human ratifies the baseline. That ratification is the audit's **single** human decision point; no upstream stage halts for a human. Whole-project static health remains the later `project-health-audit`.
- INV-008 - Assessment is automated; decision is human. Every health judgment — role, claim, evidence chain, all seven dimensions, criticality, disposition, and portfolio sufficiency — is produced by an agent using the project's ratified authorities and curated knowledge, recorded with its evidence and assessor provenance. What an agent may never do alone is accept residual risk or redefine what the product is supposed to do; those reach the single ratification point as batched line items, never as a mid-run stop.

When speed or simplicity conflicts with evidence integrity, INV-001, INV-003, and INV-005 take precedence. Automation is not in that tension: an unattended audit is a goal (INV-008), and the way automation stays trustworthy is calibration plus recorded evidence, not human re-review of every conclusion.

## Users

- Cosmonauts maintainers, who need to know whether a green suite makes a proposed change safer.
- Feature developers and remediation workers, who need precise evidence about which guardrail is weak and why.
- Planners and assessing agents, who need behavior- and risk-level protection evidence rather than test counts or marker presence, and whose own conclusions must be re-derivable from the recorded evidence.
- The project owner, who makes one terminal decision: ratifying the baseline, the batched contract questions, the accepted residual uncertainty, and the return to feature development. The owner is not an assessor and is not consulted per test, per weakness, or per stage.
- Future auditors, who need to repeat the method and compare later suite health with the established baseline.

## User Experience

### Suite-integrity pass

The audit begins by establishing whether the suite being assessed is the suite that actually executes.

The auditor receives a reconciled census connecting source-declared tests to runtime discovery under every supported test command. Parameterized tests may be grouped when they share one evidence chain, but their discovered case count remains visible.

The census reports:

- discovered and executed tests;
- source tests not discovered by the supported runner;
- collection, import, setup, teardown, and execution errors;
- unexpected empty selections or filters;
- differences between normal, watch, and coverage test surfaces;
- skipped, todo, quarantined, and conditionally executing tests;
- assertions whose execution cannot be established;
- flaky or order-dependent outcomes found during the audit; and
- assessment failures or unsupported syntax that prevent a conclusion.

An incomplete census or assessment error cannot produce a clean suite conclusion.

### Per-test evidence profile

Every test receives an evidence profile containing:

- stable identity, source location, and runtime discovery state;
- declared role, such as unit, seam/component, artifact contract, CLI/subprocess, persistence, recovery, or concurrency;
- the behavior or risk it claims to protect, or an explicit statement that no meaningful claim could be established;
- the authoritative source for the expected contract;
- an assertion-to-observation-to-system-under-test evidence chain;
- independent conclusions for every health dimension;
- supporting evidence, reason codes, counterevidence, and uncertainty;
- its contribution to a behavior/risk portfolio; and
- a disposition of `retain`, `strengthen`, `replace`, `remove`, or `investigate`.

The controlled dimension vocabulary is:

| Dimension | Conclusions |
|---|---|
| Execution | `executed`, `skipped`, `todo`, `undiscovered`, `errored`, `unknown` |
| Grounding | `direct-production`, `shipped-artifact`, `mediated-production`, `test-local`, `unresolved` |
| Contract alignment | `aligned`, `partially-aligned`, `misaligned`, `unresolved` |
| Fault sensitivity | `probe-confirmed`, `reasoned`, `probe-survived`, `unassessed` |
| Realism | `composition-root`, `integrated-subsystem`, `isolated-real-unit`, `simulated-boundary`, `test-only`, `unresolved` |
| Determinism | `stable`, `conditional`, `flaky`, `unassessed` |
| Engineering quality | `sound`, `concern`, `defective`, `unassessed` |

Each conclusion also records a common evidence basis:

- `observed` - traceable source or runtime evidence;
- `probe-confirmed` - an isolated counterexample or mutation produced the predicted result;
- `reasoned` - an agent-assessed causal argument recorded with its evidence and assessor provenance, without an executed probe;
- `missing` - required evidence was not found; or
- `blocked` - an execution, discovery, contract, or assessment failure prevents judgment.

Grounding and realism conclusions describe different facts and are not rankings. For example, a simulated subprocess boundary may be properly grounded through a production consumer and valuable for orchestration logic, while a separate composition-root test establishes external compatibility.

At minimum, findings distinguish these reason classes:

- test-local assertion;
- mock-supplied outcome;
- wrong-side expectation;
- missing consumer seam;
- missing composition root;
- missing caller or alternate path;
- undiscovered or filtered test;
- collection or execution error;
- skipped or todo protection;
- conditional or unreachable assertion;
- contract authority unresolved;
- realistic defect survived;
- nondeterministic outcome; and
- assessment blind spot.

No summary label replaces the underlying profile.

### Behavior- and risk-level assessment

The audit constructs a behavior and risk inventory independently of the existing tests. Existing tests, behavior markers, and coverage cannot define the full universe of what matters.

For each behavior or risk, the audit records:

- the intended contract and its authority;
- criticality and failure consequence;
- relevant producer, consumer, adapter, persisted-state, event, alternate-path, and composition-root boundaries;
- realistic defect classes, including both sides and distinct axes of a class;
- the tests that contribute protection at each boundary;
- targeted probe evidence where required;
- explicit gaps and uncertainty; and
- one portfolio conclusion: `protected`, `partially-protected`, `unprotected`, or `unresolved`.

A portfolio is `protected` only when its evidence is proportionate to its risk. A critical user-invokable behavior cannot be protected solely by fixture-injected tests if failure could occur in the shipped adapter or composition root. A producer-level test does not establish consumer protection when the value can be dropped, reconstructed, or supplied by another test double downstream.

Path parity, caller enumeration, and defect-axis enumeration are required where the production behavior presents those risks. A review that checks only a diff, named instance, or previously known axis cannot establish class-wide protection.

### Calibration corpus

The method is calibrated before it is trusted against the full suite.

The initial Cosmonauts calibration corpus includes:

- a fully green behavior suite disconnected from the production corpus and real CLI composition;
- an expectation that encoded six retirements under a maximum of five;
- producer-level tests that remained green when consumer propagation was reverted;
- consumer tests initially masked because another double supplied the same positive outcome;
- deterministic and model-judgment paths whose near-duplicate behavior diverged;
- source or adapter behavior missed because fixtures performed work on the wrong side of the boundary;
- helper changes whose affected callers were not enumerated;
- defect classes declared closed after only one path or axis had been checked; and
- committed-write reporting defects across error, success/proxy, and confirmation/republication axes.

The corpus also includes positive controls representing legitimate focused units, mediated seams, artifact contracts, subprocess tests, persistence tests, and recovery/concurrency tests. Calibration must demonstrate that the method preserves their legitimate roles rather than treating mock use or lack of composition-root depth as automatic weakness.

The deintroverter study supplies external negative controls for method design: undiscovered tests, swallowed analysis errors, incomplete assertion recognition, orphaned intent manifests, and golden comparisons that omit important properties. These calibrate the requirement for visible uncertainty and audit completeness; they are not a design to port.

### Targeted fault probes

Mutation and counterexample probes are selective, not suite-wide.

They are required for:

- critical behaviors and risks;
- known historical false-confidence classes;
- guardrails whose claimed value depends on a consumer, adapter, alternate path, persistence boundary, or composition root;
- cases where mocks or fixtures could supply the observed outcome independently of the production path under test; and
- cases where reasoned inspection cannot establish that the intended defect would be detected.

A valid probe introduces one realistic defect at a time, runs the narrowest claimed guardrail, and records whether the test fails for the expected reason. Other doubles or setup paths must not be able to supply the outcome under examination. The original state is restored exactly and the guardrail must return to green.

A test that survives its targeted defect is recorded as `probe-survived`; it cannot be counted as protection for that defect until remediated. When a safe probe is not feasible, the result remains `reasoned` or `unassessed`, with the limitation visible.

### Remediation and baseline

Remediation addresses confirmed evidence failures rather than increasing test volume for its own sake. It may reconnect a test to its real system under test, correct a wrong-side expectation against ratified ground, add a missing consumer or composition seam, make an assertion unconditional, repair discovery or execution, remove misleading tests, or replace a brittle guardrail with one that detects the intended fault.

A test expectation is never changed merely to agree with current production behavior. An expectation may be corrected only against a **cited ratified authority** — a spec, an architecture record, or a prior human ruling — and reading that authority is ordinary agent work requiring no human contact. Where no authority exists, or two ratified authorities genuinely contradict each other, the row stays `unresolved` and becomes a line item in the single ratification packet. It does not halt the run, and the agent does not resolve it by inspection: absent an authority, "correct the test" and "declare current behavior intended" are indistinguishable, which is the defect class this audit exists to catch.

The audit produces:

- a repeatable test-health assessment method;
- the reconciled suite census and integrity record;
- one evidence profile for every auditable test;
- a behavior/risk protection matrix and explicit gap register;
- the calibration corpus and its results;
- targeted probe records;
- a remediation ledger linking each confirmed weakness to closure evidence;
- a residual-uncertainty register;
- recommendations for objective gate candidates and heuristic review checks; and
- a suite-level baseline decision of `established` or `not established`, with reasons rather than a score.

The baseline is established only when:

- the census is complete and supported test commands execute without hidden collection or execution failures;
- every skip, todo, conditional assertion, quarantine, and assessment limitation has an explicit disposition;
- no test counted as a guardrail has a confirmed test-local, misaligned, or surviving-defect conclusion for the claim being counted;
- every critical behavior/risk portfolio is `protected`;
- confirmed weaknesses are fixed, replaced, removed, or explicitly excluded from guardrail evidence;
- required targeted probes fail under the defect and pass after exact restoration;
- remaining uncertainty is noncritical, bounded, and documented; and
- the project owner ratifies the record before feature development resumes.

Coverage remains contextual evidence for locating unexecuted areas. It is not evidence that assertions protect behavior and is not part of the baseline formula.

## Acceptance Criteria

- [ ] AC-001 - Maintainers have a repeatable assessment method that defines healthy and valuable tests through independent dimensions without producing a composite score.
- [ ] AC-002 - The audit reconciles the complete source test census with runtime discovery under every supported test command, including parameterized cases and command-surface differences.
- [ ] AC-003 - Discovery gaps, collection or execution errors, skips, todos, filters, conditional assertions, flaky outcomes, and assessment failures are visible and cannot be reported as clean evidence.
- [ ] AC-004 - Every auditable test has an evidence profile containing its role, claimed contract, grounding chain, dimension conclusions, evidence basis, reasons, uncertainty, portfolio contribution, and disposition.
- [ ] AC-005 - Grounding recognizes production functions, shipped files and prompts, configuration, CLI output, subprocess behavior, events, persisted state, and composition roots without ranking direct calls as inherently superior to mediated observations.
- [ ] AC-006 - Contract alignment is assessed independently of production contact, and a conflicting or absent contract source produces an unresolved conclusion rather than treating either the test or current code as authoritative.
- [ ] AC-007 - The method identifies test-local assertions, mock-supplied outcomes, wrong-side expectations, missing consumers, missing composition roots, missing callers or path variants, and tests that survive the defects they claim to prevent.
- [ ] AC-008 - Every important behavior or risk has an independently derived protection record identifying criticality, relevant boundaries and fault classes, contributing tests, gaps, uncertainty, and a graduated portfolio conclusion.
- [ ] AC-009 - The method correctly recognizes the known Cosmonauts false-confidence cases while retaining legitimate unit, mediated, artifact, CLI, persistence, recovery, and concurrency tests as possible contributors.
- [ ] AC-010 - Critical and historically failure-prone guardrails have isolated mutation or counterexample evidence showing that realistic defects make the intended protection fail for the expected reason.
- [ ] AC-011 - Audit outputs preserve per-test, per-behavior/risk, and suite-level evidence, including calibration results, remediation closure, residual uncertainty, and gate recommendations.
- [ ] AC-012 - Every confirmed test-health weakness is remediated or removed from claimed guardrail evidence autonomously; an expected product contract changes only against a cited ratified authority, and an absent or self-contradicting authority produces an `unresolved` row batched to the single ratification point rather than an agent judgment or a mid-run halt.
- [ ] AC-013 - The trustworthy baseline is established only when all critical behavior/risk portfolios are protected, suite integrity is demonstrated, required probes succeed, and remaining uncertainty is bounded and human-ratified. Where a baseline condition cannot be met, the project owner may instead record `established-with-limitations` by naming, in the ratification block, the exact condition ids that fail. Each such condition keeps its definition and stays recorded as not-met with its reasons intact; the accepted list is checked against the conditions the evidence actually fails, so it goes stale whenever they change. Automation can never reach this verdict on its own. *(Amended 2026-09-19 on the project owner's Q-002 ruling, recorded in `missions/tasks/TASK-701`: baseline condition 4 was unsatisfiable by construction, because no code path could mark a portfolio cell `protected`.)*
- [ ] AC-014 - Objective checks and agent-assessed heuristics are distinguished explicitly, each heuristic carrying its evidence and assessor provenance; heuristic findings do not fail CI unless later calibration and human approval establish a reliable gate contract.
- [ ] AC-015 - The resulting work remains limited to test trustworthiness and necessary closure evidence, cross-links `behavioral-regression` and `deliverable-completeness-gates`, and leaves whole-project static health and analysis-provider expansion to later work.
- [ ] AC-016 - The audit runs unattended from census to eligibility: no stage requires human input to proceed, every conclusion carries assessor provenance sufficient to re-derive it, and the only human interaction is the terminal ratification of the baseline together with whatever contract questions and residual uncertainties were batched into it.

## Scope

### In scope

- The complete supported Vitest suite, its test helpers, fixtures, setup, configuration, and test-related command surfaces.
- Production and shipped-artifact paths needed to establish the contract, grounding, consumer, path-parity, persistence, event, or composition evidence for a test.
- Suite discovery and execution integrity.
- Per-test and behavior/risk assessment.
- Historical calibration and targeted fault probes.
- Remediation of confirmed test-health weaknesses and directly exposed contract violations necessary to return the ratified suite to green.
- Documentation of the method, audit evidence, baseline, uncertainty, and possible future gates.
- Cross-linking `behavioral-regression` for preservation-oriented testing and `deliverable-completeness-gates` for future composition-root and workflow enforcement.

### Out of scope

- Porting deintroverter or committing to a static analyzer.
- Indiscriminate mutation testing.
- Treating coverage increases as the objective.
- New feature development or resuming active plans before baseline ratification.
- Whole-project dead-code, duplication, complexity, or boundary-conformance remediation.
- New analysis providers, provider infrastructure, or expansion of the existing analysis capability surface.
- Implementing the broader `behavioral-regression` or `deliverable-completeness-gates` roadmap items.
- Starting `project-health-audit`.
- Creating an implementation plan or tasks during spec ratification.

### Ratified product decisions

- **D-001 — Layered assessment**
  - Decision: assess independent dimensions per test, protection per behavior/risk, and suite integrity as a prerequisite.
  - Rejected: one overall per-test certification; behavior/risk-only assessment.
  - Why: Cosmonauts has heterogeneous tests whose value emerges from complementary roles, while individual misleading tests must remain visible.
  - Decided by: user ratified, 2026-09-14.

- **D-002 — Native conclusions with common evidence status**
  - Decision: use dimension-specific conclusions plus a shared evidence basis and explicit reasons.
  - Rejected: one universal verdict ladder; unrelated dimension vocabularies without a common evidence status.
  - Why: semantic precision and epistemic uncertainty must both survive reporting.
  - Decided by: user ratified, 2026-09-14.

- **D-003 — Targeted fault probes**
  - Decision: require risk- and claim-targeted probes for critical, historical, and seam-sensitive guardrails.
  - Rejected: comprehensive mutation testing; calibration-only probes.
  - Why: critical guardrails need empirical sensitivity evidence without imposing indiscriminate mutation cost.
  - Decided by: user ratified, 2026-09-14.

- **D-005 — Automated assessment, single human decision**
  - Decision: agents perform every health assessment using ratified authorities and curated knowledge; the human makes one terminal decision. No stage halts for human input, and nothing is reviewed per test or per weakness.
  - Rejected: human review of each test profile; per-weakness human rulings mid-run; a fully unattended audit with no ratification gate at all.
  - Why: the point of this work is a system that produces healthy tests, not a queue of decisions for the owner. The framework's models and knowledge records are sufficient to judge test health, and calibration plus recorded evidence is what makes those judgments trustworthy. Batching the few genuine product questions into the terminal gate keeps human contact rare without discarding the risk decision.
  - Decided by: user ratified, 2026-09-16.

- **D-006 — Contract corrections need a cited authority, not a human**
  - Decision: an agent may correct a wrong-side expectation whenever a ratified authority exists to check against. Only an absent or self-contradicting authority makes the row `unresolved`, and those batch to the single ratification packet.
  - Rejected: routing every contract correction through a human; letting an agent decide product intent where no authority exists.
  - Why: reading a spec or architecture record is ordinary agent work and needs no gate. But where no authority exists, correcting the test and ratifying current behavior as intended are the same action, and the spec's own calibration corpus contains that exact failure — an expectation encoding six retirements under a maximum of five. The narrow guard preserves the audit's purpose while keeping the common path unattended.
  - Decided by: user ratified, 2026-09-16.

- **D-004 — Risk-based trustworthy baseline**
  - Decision: resume development after suite integrity, critical protection, remediation, bounded uncertainty, and human ratification are established.
  - Rejected: requiring zero uncertainty across every dimension; resuming with a green suite plus a weakness backlog.
  - Why: trust must be demanding where consequences matter without pretending all uncertainty can be eliminated.
  - Decided by: user ratified, 2026-09-14.

## Assumptions

- The existing Bun and Vitest commands are the initial supported execution surface, but the audit verifies rather than assumes their completeness.
- Ratified specifications, architecture decisions, explicit human rulings, and the project's curated knowledge records outrank test expectations and current implementation behavior. An assessing agent is expected to consult them directly. When authoritative sources conflict or are absent, alignment remains unresolved.
- Criticality is based on user impact, data or artifact durability, concurrency, recovery, security, irreversible effects, and architectural dependency—not coverage percentage.
- Mocks, fixtures, synthetic projects, and isolated units are legitimate when their role and limitations are explicit and deeper risks are covered elsewhere.
- An objective observation may still require judgment about significance, and an agent supplies that judgment on the record; automation does not convert a heuristic into a fact, and calling a conclusion agent-assessed does not make it objective.
- The trustworthy baseline is revision-specific and records enough context to be repeated after material production, test, runner, or configuration changes.
- The later `project-health-audit` consumes the trustworthy test baseline and the already shipped analysis capabilities; it does not need to be pulled forward into this work.

## Open Questions

These are resolved from audit evidence rather than assumed during planning:

- Which current Cosmonauts behaviors and risks meet the criticality definition and therefore require targeted probe evidence?
- Which objective suite-integrity checks prove sufficiently complete and stable to be proposed for immediate gate activation?
- What noncritical residual uncertainties, if any, will the project owner accept when ratifying the baseline?
- Which contract conflicts or production violations discovered by corrected tests turn out to lack a ratified authority, and therefore reach the single ratification packet rather than closing autonomously?
