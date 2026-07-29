---
title: Analysis investigation procedures
status: active
createdAt: '2026-07-29T00:00:00.000Z'
updatedAt: '2026-07-29T00:00:00.000Z'
---

## Overview

Slice 3 of 3 of the ratified `analysis-capabilities` design, split by D-024 on
2026-07-29. Depends on `analysis-capability-runtime` (the capability surface)
and `analysis-gate-rewiring` (which distributed that surface to the seven v1
consumer roles and shipped the provider-neutral shared skill). This slice
writes the four remaining role procedures onto it and closes the parent
design.

The end state of this slice is:

- Planner investigates before designing: it checks bindings and gathers complexity, duplication, boundary, and trace evidence for the areas a design will touch, and records evidence or its explicit absence in design and risks.
- Plan Reviewer challenges duplicate paths, dependency direction, and proposed deletions with capability evidence, or says plainly that the evidence was unavailable.
- Worker traces before deleting and audits the changed scope from the current pre-commit HEAD before task close; completed findings are corrected narrowly, unbound is recorded, failed blocks completion.
- Refactorer traces moves and removals and audits from the structural-change base, with no metric permitted to override no-behavior-change discipline.
- No shipped prompt or skill content names a concrete analyzer or command; the repository-wide generic-content scan re-runs clean and the ROADMAP analysis-tools entry is refreshed.

Explorer is not a consumer. D-021 dropped it from v1 and B-020 is withdrawn:
no test and no marker ship for it, and its prompt is untouched. It still
benefits passively from the shared skill and the injected status block.

What this slice does not do: touch the runtime or the gate path. The contract,
adapter, runner, and tool schemas belong to `analysis-capability-runtime`;
Quality Manager, Verifier, and Fixer procedure and worker's migration-sweep
clause belong to `analysis-gate-rewiring`. A gap discovered here is an
amend-on-record against the owning plan, deliberately reopened, never a
workaround in a prompt.

Out of scope remains CI enforcement, scheduled full-project stewardship,
repository boundary-zone authoring, a second executable provider, MCP/Node
transports, and fix application. INV-3 and INV-5 outrank every derived
convenience below.

## Decision Log

D-001 through D-023 were decided on the parent plan and are carried here
verbatim, provenance and dates preserved, so every citation in this slice
resolves against the ground it was actually decided on. D-024 records the
split itself.

- **D-001 - Use one project-level provider preference in v1**
  - Decision: add optional `analysis: { provider: string }`; absence means auto-detect, while an explicit unavailable provider remains visibly unbound without fallback.
  - Alternatives: per-language/per-capability maps now (unproven polyglot routing); auto-detection only (no maintainer-controlled swap).
  - Why: simplest v1 swap seam satisfying INV-2 without deciding the polyglot open question.
  - Decided by: planner-proposed, 2026-07-27

- **D-002 - Keep unbound reasons diagnostic, not prescriptive**
  - Decision: unbound bindings carry reason codes and attempted/configured provider identity, but no install recommendation.
  - Alternatives: provider recommendations in generic status (leaks policy); bare unbound (opaque).
  - Why: serves INV-2 without violating INV-1.
  - Decided by: planner-proposed, 2026-07-27

- **D-003 - Register one typed tool per capability**
  - Decision: register seven capability tools plus `analysis_status`, each with a narrow object-root TypeBox schema and runtime non-empty validation.
  - Alternatives: one dispatcher (invalid argument combinations); shell commands (provider-bound/lossy); provider-operation tools (unstable vocabulary).
  - Why: makes explicit-base, path, target, and preview-only constraints enforceable at the API boundary under INV-4/INV-5.
  - Decided by: planner-proposed, 2026-07-27

- **D-004 - Put the stable contract inward and provider IO at the extension edge**
  - Decision: `lib/analysis/` owns types and pure binding resolution; `domains/shared/extensions/project-tools/` owns detection, subprocess execution, normalization, and Pi registration.
  - Alternatives: one extension file (unclear/test-hostile); concrete provider in `lib/analysis/` (tool-specific core).
  - Why: future adapters depend on the generic core; the core never imports provider/Pi infrastructure.
  - Decided by: planner-proposed, 2026-07-27

- **D-005 - Use the pinned project-local CLI through `pi.exec`** *(superseded by D-008, 2026-07-27)*
  - Decision: resolve a project-local executable and invoke through `pi.exec`, throwing on uncertainty.
  - Alternatives: mutable fetching; Node bindings; MCP.
  - Why: originally selected as Pi-first, but review proved Pi normalizes signal exits to code 0 and cannot establish INV-3. (Cited finding is from a prior review round's numbering, not the parent plan's `review.md`; premise independently re-verified 2026-07-27 against `pi-coding-agent/dist/core/exec.js` — `code ?? 0`.)
  - Decided by: planner-proposed, 2026-07-27

- **D-006 - Cache only reconstructible session discovery**
  - Decision: lazily build one binding snapshot per extension session/cwd, share its promise concurrently, and clear it on `session_start`/`session_shutdown`.
  - Alternatives: probe every turn (wasteful); persist bindings (stale duplicate truth); process-global cache (cross-project leakage).
  - Why: every fresh/reloaded/resumed/forked session reconstructs from project/provider records; no safety decision depends on unrecoverable memory.
  - Decided by: planner-proposed, 2026-07-27

- **D-007 - Put the generic analysis skill in the coding bundle** *(superseded by D-011, 2026-07-27)*
  - Decision: replace the concrete provider skill with a generic bundled skill.
  - Alternatives: retain both skills; prompt-only migration.
  - Why: generic procedure was correct, but review showed project skill filters can hide bundled wildcard skills.
  - Decided by: planner-proposed, 2026-07-27

- **D-008 - Use a signal-aware read-only process runner**
  - Decision: implement an injected `node:child_process.spawn` runner with `shell: false` that preserves code exits, signal exits, spawn errors, aborts, and timeouts as distinct outcomes; do not use `pi.exec` for provider execution.
  - Alternatives: keep `pi.exec` (signal death can become clean code 0); patch Pi (unrelated framework fork); trust JSON despite signal death (violates INV-3).
  - Why: review PR-002 verified the current Pi contract cannot prove AC-005's crash case. A narrow local runner is the first seam that preserves the required evidence.
  - Decided by: planner, amend-on-record, 2026-07-27
  - Supersedes: D-005 and Design's `pi.exec` mechanism

- **D-009 - Model failed discovery separately from unsupported**
  - Decision: add binding state `failed` for invalid provider config, introspection failure, signal/spawn failure, or unclassifiable discovery output. Capability calls against it throw the stored serialized failure; gates report failed-to-run.
  - Alternatives: encode discovery error as unbound (would degrade); bind optimistically (could produce false clean results).
  - Why: unsupported belongs to INV-2 degradation; attempted provider failure belongs to INV-3 blocking.
  - Decided by: planner, amend-on-record, 2026-07-27
  - Supersedes: prior `provider-discovery-error` unbound reason and blanket “all unbound degrades” text

- **D-010 - Execute gates in Quality Manager and replay at remediation** *(partially superseded by D-019, 2026-07-27: direct QM execution and rerun-before-edit stand; the deterministic-ID resolution protocol is withdrawn)*
  - Decision: Quality Manager calls capability tools directly. It routes deterministic finding IDs plus the exact capability request; Fixer/Worker reruns that request and resolves those IDs before editing.
  - Alternatives: Verifier child returns JSON in final prose (actual spawn boundary keeps only model-authored assistant text); persist result artifacts (new correctness state and cleanup); modify orchestration transport (larger unrelated surface).
  - Why: direct and replayed tool calls preserve full structured/native results at each consumer without depending on lossy child text, satisfying AC-009/AC-011 with no new persistent state.
  - Decided by: planner, amend-on-record, 2026-07-27
  - Supersedes: B-013/B-016/Design delegation of Quality Manager's audit through Verifier

- **D-011 - Ship the generic skill from the shared domain**
  - Decision: create `domains/shared/skills/analysis/SKILL.md`; explicit role allowlists include it, while wildcard agents receive shared skills even when projects specify a skill filter.
  - Alternatives: bundled skill plus editing this project's allowlist (fails arbitrary projects); force-inject past project filters (disrespects maintainer policy).
  - Why: matches the real `resolveEffectiveProjectSkills` contract and keeps all named consumers' procedure available without stack/provider content.
  - Decided by: planner, amend-on-record, 2026-07-27
  - Supersedes: D-007 skill placement

- **D-012 - Disable all provider writes, not only fix application**
  - Decision: every analysis/introspection invocation includes the provider's no-cache option; version detection uses a non-writing version call; tests snapshot the worktree across status and every capability. Fix preview additionally requires dry-run.
  - Alternatives: ignore generated caches (still worktree mutation); clean caches afterward (mutates and risks deleting preexisting data); test only source files (too narrow).
  - Why: review PR-001 showed ordinary analysis writes `.fallow/cache.bin`/`churn.bin`; INV-5 and AC-008 cover every capability tool. (Cited finding is from a prior review round's numbering, not the parent plan's `review.md`; premise independently re-verified 2026-07-27 with a live run — `fallow dead-code` writes `.fallow/cache.bin` without `--no-cache`.)
  - Decided by: planner, amend-on-record, 2026-07-27
  - Supersedes: prior B-012 proof based only on absence of apply/fix dry-run

- **D-013 - Discriminate verdict by result kind** *(ratified)*
  - Decision: analysis-kind results (`dead-code`, `duplication`, `complexity`, `boundary-conformance`, `changed-scope-audit`) carry an asserted or derived verdict; operational results (`trace`, `fix-preview`) carry `verdict: "not-applicable"` plus their evidence/proposals. Fabricating pass/fail for an operational result is itself a normalization error; B-009's cannot-support-a-verdict throw applies only to verdict-bearing kinds.
  - Alternatives: universal mandatory verdict (forces inventing meaning the provider never asserted — INV-3 forbids guessing — or throwing on every successful trace/fix-preview call, gutting two required capabilities); dropping the verdict field entirely for operational kinds (loses the uniform envelope).
  - Why: current-round review PR-002 proved Fallow asserts a verdict only for audit-style analysis; trace and `fix --dry-run` return evidence/changes with no verdict. This reads AC-003's field list as applying per result kind — surfaced for human confirmation at plan ratification; halt-and-escalate if a literal universal-verdict reading is required.
  - Ratified: the human confirmed the per-kind reading on 2026-07-29 after being shown both readings and the consequence of the literal one (fabricate a verdict, violating INV-3, or throw on every successful trace/fix-preview call). The halt-and-escalate branch is closed and AC-003 needs no amendment; this entry is now ratified ground and moves only by a further human decision.
  - Decided by: review-synthesis agent, amend-on-record, 2026-07-27; ratified by human, 2026-07-29
  - Supersedes: the universal-verdict clause of Design §1 and B-007/B-009's undiscriminated expectations

- **D-014 - Execution consent gates provider spawning**
  - Decision: the extension never spawns a project-resolved executable unless per-project execution consent is recorded outside the repository (cosmonauts-owned user-level state). Absent consent, discovery stays file-read-only; every detectable capability surfaces unbound reason `execution-not-consented`; `analysis_status` names the detected provider and why execution is withheld.
  - Alternatives: gate on Pi's `ctx.isProjectTrusted()` (insufficient — implicit trust for resource-less checkouts is indistinguishable from an explicit user decision; verified against `project-trust.js`/`settings-manager.js`); accept auto-execution as status-quo-equivalent (false: today's injected command is agent-chosen and permission-mediated; discovery-time spawning is automatic and pre-turn).
  - Why: current-round review PR-003. A repository-controlled binary must not run automatically in an untrusted checkout; INV-5 cannot be established for a replaced executable. Detection (read-only) and introspection (consent-gated) split accordingly.
  - Decided by: review-synthesis agent, amend-on-record, 2026-07-27
  - Supersedes: Design §2/§4's unconditional discovery-time introspection

- **D-015 - Define executable resolution and a version/schema compatibility policy**
  - Decision: executable resolution probes, in order: explicit configured path → the target project's package-manager-installed binary (`node_modules/.bin` or platform equivalent) → an injected test seam. PATH/global binaries and npx-style mutable fetch are never used. A detection signal without a resolvable executable yields unbound reason `provider-not-installed` for every capability — never `failed`, because nothing was executed. The adapter declares its validated engine version (2.54.2) and validated envelope `schema_version`s; a resolved executable with a different version binds with the detected version surfaced in status, while every result's `schema_version` is strictly validated — an out-of-contract envelope is an `AnalysisFailure`, never a silently normalized result.
  - Alternatives: reject any non-2.54.2 engine (breaks the spec's maintainer-upgrade story for compatible releases); no policy (silently misnormalizes drifted-but-classifiable output; leaves the signal-without-executable case — this repository's own current state — implementer-decided).
  - Why: current-round review PR-006 plus the feasibility review: B-025 conflated this repo's pin with target-project resolution, and real-engine fixture tests need the injection seam to obtain the pinned binary.
  - Decided by: review-synthesis agent, amend-on-record, 2026-07-27
  - Supersedes: Design §2's undefined "requires a project-local executable" and B-025's conflated proof

- **D-016 - Unsupported scopes degrade narrowly, mirroring unsupported metrics**
  - Decision: bindings advertise supported scope kinds per capability; the resolver rejects a request whose scope kind the binding does not advertise before execution, returning a structured `unsupported-scope` outcome naming requested and supported kinds. Never widened, never misreported as provider failure; consumers reissue with a supported scope kind. The Fallow adapter advertises `paths` only where the provider natively honors it; duplication/complexity do not advertise `paths` in v1 and degrade visibly.
  - Alternatives: run-wider-then-filter path emulation for duplication/complexity (unproven verdict semantics; deferred); leaving the outcome unmodeled (an implementer could silently widen or misclassify a contract mismatch as INV-3 failure — current-round review PR-001).
  - Why: the outcome vocabulary had no unsupported-scope member, so a non-empty unsupported scope had no defined behavior.
  - Decided by: review-synthesis agent, amend-on-record, 2026-07-27

- **D-017 - Propagate Pi's per-tool AbortSignal into the provider runner**
  - Decision: the provider executor signature carries the Pi `execute` AbortSignal; every registered capability tool passes it through the adapter into the process runner, where cancellation triggers the same bounded termination as timeout and yields the serialized aborted failure. The shared extension mock gains an optional signal parameter so extension tests can drive it.
  - Alternatives: runner-level abort classification only (current-round review PR-005: a literal implementation passes B-029 while a cancelled tool orphans the provider child and hangs the session).
  - Why: verified against pinned Pi 0.80.6 — `ToolDefinition.execute`'s third parameter is `signal: AbortSignal | undefined`; the plan modeled the outcome but never wired the seam.
  - Decided by: review-synthesis agent, amend-on-record, 2026-07-27

- **D-018 - Status rows are injected at agent start from the shared session snapshot**
  - Decision: `before_agent_start` injects the seven capability rows into the system prompt; "lazy" discovery (D-006) means first-need, where the needs are that injection and tool calls sharing one session/cwd promise. In a project without execution consent, injection still lists every detectable capability as detected-but-withheld without spawning anything (D-014).
  - Alternatives: first-tool-call-only discovery with no injection (fails AC-004's agent-visible status for agents that never call a tool); eager unconditional discovery (violates D-014).
  - Why: Design §4's "inject seven rows" and D-006's "first status/tool call" were unreconciled and no behavior proved the injection path; the current extension already awaits async detection inside `before_agent_start`, so this is specification, not new capability.
  - Decided by: review-synthesis agent, amend-on-record, 2026-07-27
  - Supersedes: the "first status/tool call" wording of D-006/Design §4 as the sole discovery trigger

- **D-019 - Route remediation by capability request plus human-readable designations; drop the deterministic-ID replay protocol**
  - Decision: Quality Manager routes the exact capability request (capability, base/scope/metric) plus human-readable finding designations (file:line, category, quoted message). The remediator reruns the capability before editing and treats its own fresh, complete structured result as ground truth under the minimal-change constraint. Finding IDs remain an adapter-internal convenience with no cross-session determinism contract; B-032 is withdrawn.
  - Alternatives: D-010's deterministic-ID resolve-before-edit protocol (satisfies AC-009 but adds a cross-session determinism contract, its own drift failure mode, and a determinism test that could not distinguish content-derived from position-derived IDs).
  - Why: AC-009 requires lossless findings at remediation; the remediator's own direct tool call is lossless without ID machinery. The plan's own risk register listed replay drift as a failure mode created by the protocol it now removes.
  - Decided by: review-synthesis agent, amend-on-record, 2026-07-27
  - Supersedes: D-010's ID-resolution mechanics, B-016/B-018's ID clauses, B-032

- **D-020 - Failure evidence is structured prose, not a canonical-JSON round-trip contract**
  - Decision: a thrown `AnalysisProviderError` message names capability, provider, failure class, and process evidence (exit/signal/reason, stderr summary). The real-Pi contract test pins that `isError` is true and the message arrives intact. The canonical-compact-JSON parse-the-envelope contract is withdrawn.
  - Alternatives: keep message-as-canonical-JSON (served a machine consumer that D-019 removed; the remaining consumer is a model, which reads structured prose as well as JSON).
  - Why: AC-005 requires errors distinct from findings end to end, not a machine-parseable envelope inside `Error.message`.
  - Decided by: review-synthesis agent, amend-on-record, 2026-07-27
  - Supersedes: Design §4's canonical-JSON clause and B-009/B-030's parse assertions

- **D-021 - v1 consumer roles are seven; investigation roles use a two-way evidence protocol**
  - Decision: Explorer is dropped from v1 (B-020 withdrawn; it still benefits passively from the shared skill and status block). The extension is added to seven roles: Quality Manager, Verifier, Fixer, Planner, Plan Reviewer, Worker, Refactorer. Investigation roles (Planner, Plan Reviewer) distinguish only "evidence" vs "no evidence — record it"; the full completed/unbound/unsupported/failed protocol is taught only where completion decisions depend on it (Quality Manager, Worker, Refactorer). Because shared skills are visible to every wildcard agent regardless, the shared skill MUST open with an availability check and degrade gracefully when the tools are absent.
  - Alternatives: eight roles with the four-way protocol everywhere (Explorer appears in no AC — AC-010 names planner, plan-reviewer, worker, refactorer; teaching gate semantics to roles that gate nothing is prompt surface without an AC); withholding the skill from wildcard agents (not implementable under `resolveEffectiveProjectSkills`, which unconditionally merges shared skills).
  - Why: scope discipline plus current-round review PR-004 (wildcard reviewer-panel agents, cody, and cosmo receive the skill without the tools; without the availability check that ships a broken affordance B-024 was structured to miss).
  - Decided by: review-synthesis agent, amend-on-record, 2026-07-27
  - Supersedes: D-011's/B-024's eight-role list, B-020

- **D-022 - Per-operation exit-code contract**
  - Decision: capability executions map exit 0/1 plus classifiable JSON to completed and everything else to failure. Introspection commands have their own contracts: config introspection treats exit 3 as defaults-in-effect (bindable) and exit 2 as failed; the adapter tolerates the provider's non-JSON stdout preamble (e.g. `loaded config: <path>`) before parsing.
  - Alternatives: one 0/1 rule for every invocation (turns every healthy config-less package-detected project into `failed` — contradicting B-004 — because live `fallow config` exits 3 with a plain-text line when no config file exists).
  - Why: verified against the live 2.54.2 CLI and its documented config exit codes (0/2/3).
  - Decided by: review-synthesis agent, amend-on-record, 2026-07-27
  - Supersedes: Design §3's single exit rule as applied to introspection

- **D-023 - Every provider invocation runs under a finite timeout with escalating termination**
  - Decision: a finite default timeout (implementation-chosen constant, overridable per capability kind) applies to every provider invocation; on timeout or abort the runner sends graceful termination, then force-kills after a bounded grace period; the outcome retains the initiating reason, not the kill signal.
  - Alternatives: timeout as an optional runner feature no invocation configures (the modeled outcome would be unreachable in production, and a signal-ignoring child could hang a whole chain).
  - Why: review Missing Coverage — B-029 proved classification of a timeout, not the existence of a bound.
  - Decided by: review-synthesis agent, amend-on-record, 2026-07-27

- **D-024 - Deliver the design as three sequential slices** *(ratified)*
  - Decision: the parent plan `analysis-capabilities` is split at its own marked slice boundaries into `analysis-capability-runtime` (stages 1–5), `analysis-gate-rewiring` (stages 6–7), and `analysis-investigation-procedures` (stage 8), delivered in that order. Each slice carries the ratified Intent and the full acceptance-criteria list verbatim, the complete D-001–D-024 Decision Log verbatim, and its own behaviors with their original `B-###` IDs and slice-scoped markers. Withdrawn behaviors stay withdrawn in their home slice (B-032 in the runtime slice, B-020 here) and are neither resurrected nor renumbered. The parent plan is archived as the design of record; its behaviors are not duplicated back into it.
  - Alternatives: one plan with all 35 active behaviors (~3x the 3–12-task guidance, a long drive with a large blast radius before anything ships, and the size advisory left standing); a two-way split with one combined consumer slice (second slice still ~11 behaviors across seven roles, still above guidance); partitioning the acceptance criteria across slices rather than carrying them whole (impossible without editing ratified ground — B-024 alone sources AC-009, AC-010, and AC-012, so no clean partition exists).
  - Why: serves the Intent goal by making each slice independently valuable and gate-clean. The retained legacy prose injection is what makes the seams safe: slice 1 adds the runtime without touching consumers, slice 2 swaps consumers and deletes the bridge in the same stage, slice 3 extends procedures onto the surface slice 2 distributed.
  - Decided by: human, user-chose-among-options, 2026-07-29
  - Supersedes: the parent plan's single-backlog delivery and the "decide at task creation" wording of its Implementation Order slice-boundary note

## Behaviors

### B-019 - Planner investigates through capabilities
- Source: AC-010
- Context: Planner designs non-trivial work
- Action: it checks bindings and relevant touched-area complexity/duplication/boundaries/traces
- Expected: evidence or unbound uncertainty enters design/risks with no provider command/name in procedure
- Seam: `bundled/coding/prompts/planner.md`
- Test: `tests/prompts/analysis-procedures.test.ts` > `expresses planner investigation in capability terms`
- Marker: `@cosmo-behavior plan:analysis-investigation-procedures#B-019`

### B-020 - Explorer maps available evidence *(withdrawn by D-021, 2026-07-27 — Explorer is not a v1 consumer; no test or marker ships for this entry)*
- Source: AC-010
- Context: Explorer maps a subsystem
- Action: it checks bindings and invokes relevant investigations
- Expected: report cites capability evidence or explicit gaps without provider procedures
- Seam: `bundled/coding/prompts/explorer.md`
- Test: `tests/prompts/analysis-procedures.test.ts` > `expresses explorer evidence gathering in capability terms`
- Marker: `@cosmo-behavior plan:analysis-investigation-procedures#B-020`

### B-021 - Plan Reviewer challenges with capability evidence
- Source: AC-010
- Context: Plan Reviewer checks duplicate paths, dependency direction, deletions
- Action: it checks bindings/investigations
- Expected: findings cite capability evidence or visible limitations without provider procedures
- Seam: `bundled/coding/prompts/plan-reviewer.md`
- Test: `tests/prompts/analysis-procedures.test.ts` > `expresses plan review challenges in capability terms`
- Marker: `@cosmo-behavior plan:analysis-investigation-procedures#B-021`

### B-022 - Worker audits and traces before completion
- Source: AC-010
- Context: Worker is green after refactor and has not committed
- Action: it audits from current pre-commit HEAD and traces deletions
- Expected: the prompt instructs correcting completed findings narrowly, recording unbound, blocking completion on failed, and stating evidence in capability terms
- Seam: `bundled/coding/prompts/worker.md`
- Test: `tests/prompts/analysis-procedures.test.ts` > `requires worker trace before delete and audit at task close`
- Marker: `@cosmo-behavior plan:analysis-investigation-procedures#B-022`

### B-023 - Refactorer audits without metric chasing
- Source: AC-010
- Context: behavior is green and a structural delta is uncommitted
- Action: Refactorer traces moves/removals and audits from structural-change base
- Expected: completed/unbound/failed evidence is explicit and no metric overrides no-behavior-change discipline
- Seam: `bundled/coding/prompts/refactorer.md`
- Test: `tests/prompts/analysis-procedures.test.ts` > `requires refactorer trace and changed scope evidence without metric chasing`
- Marker: `@cosmo-behavior plan:analysis-investigation-procedures#B-023`

## Design

### 1. Role procedures

The shared analysis skill already carries the common protocol — availability check, status first, completed/unbound/unsupported/failed, explicit base, trace-first, preview-only, narrow remediation. Role prompts add only what is role-specific and do not restate the skill.

- Planner and Plan Reviewer: investigate when bound; record evidence or its absence. The full four-state protocol is deliberately not taught to investigation roles (D-021) — they gate nothing, so the distinction they need is evidence versus no evidence.
- Worker and Refactorer: trace before delete, audit before commit from an explicit base, block on a failed bound capability, never chase metrics. These roles carry the full protocol because their completion decisions depend on it.

Every procedure is written in capability terms. No prompt names an analyzer or a command; INV-1 is the constraint the content test enforces.

### 2. Order within the slice

Each behavior's marker and test land before its prompt edit, one behavior at a time. Worker's prompt is edited here for trace-and-audit only; its migration-sweep clause is `analysis-gate-rewiring`'s B-031 and must be preserved, not rewritten.

### 3. Closing the parent design

Re-run the repository-wide shipped generic-content scan and the stale-link scan across all `bundled/`/`domains/` prompts, skills, and generic work-artifact references — this is the last slice, so it is the last chance for a provider name to have leaked in through any of the three. Refresh the ROADMAP analysis-tools entry at completion. Provider-specific docs and runtime source remain explicit exclusions from INV-1 content scans.

## Files to Change

- `tests/prompts/analysis-procedures.test.ts` ↔ `bundled/coding/prompts/planner.md`.
- `tests/prompts/analysis-procedures.test.ts` ↔ `bundled/coding/prompts/plan-reviewer.md`.
- `tests/prompts/analysis-procedures.test.ts` ↔ `bundled/coding/prompts/worker.md`.
- `tests/prompts/analysis-procedures.test.ts` ↔ `bundled/coding/prompts/refactorer.md`.
- `ROADMAP.md` — refresh the analysis-tools entry status at plan completion.

## Risks

- **Worker's prompt has two owners across slices.** B-031 (migration sweep) landed in `analysis-gate-rewiring`; B-022 lands here. Editing worker.md must preserve the migration clause verbatim — re-run that slice's test, not only this slice's.
- **Investigation procedure can become gate procedure.** Planner and Plan Reviewer gate nothing. If their procedure starts distinguishing failed from unbound or blocking on a state, it has drifted past D-021 and past AC-010's letter.
- **Metric chasing is the failure mode of a bound complexity capability.** The refactorer procedure must make no-behavior-change discipline outrank any metric improvement, explicitly, or a bound capability becomes a licence to rewrite working code.
- **Prompt content tests prove text, not behavior.** These behaviors are content obligations; their Expected clauses state what the named test can assert. Runtime correctness belongs to the runtime slice's evidence.
- **A provider name can leak in late.** This slice runs the final repository-wide scan for all three; a leak introduced by an earlier slice surfaces here and is fixed here regardless of which slice introduced it.
- **Explorer may look like an omission.** It is a recorded decision (D-021), not a gap. B-020 stays withdrawn; resurrecting it needs a new decision, not a convenience edit.

## Quality Contract

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | Project-native tests, style, and type/schema checks pass, including the sibling slices' preserved prompt tests | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | Every non-withdrawn B-### entry in this plan (B-019, B-021–B-023; B-020 withdrawn) has its named test and exact marker | artifact evidence | hard fail |
| 3 | `mutation` | bindable | unbound | Project-specific mutation evidence | pending | unbound/not enforced; reviewer judgment required |
| 4 | `duplication` | bindable | bound | Changed scope introduces no blocking clone finding | capability resolution | genuine unbound degrades; failed blocks |
| 5 | `complexity` | bindable | bound | No configured changed-scope metric violation; unavailable requested metrics degrade individually | capability resolution | never treat unsupported as zero |
| 6 | `boundary-conformance` | bindable | unbound | Configured zones have no changed-scope violation | pending configuration | unbound until rules; reviewer checks direction; introspection failure blocks |
| 7 | `dead-code` | bindable | bound | No blocking changed-scope reachability/dependency finding and explicit migration searches find no stale references | capability resolution plus explicit search | capability is additive to migration search; failed blocks |

Rows 4, 5, and 7 are bound by `analysis-capability-runtime`'s delivery. This is the last slice, so its ladder run is also the parent design's final ladder run: mutation and boundaries remain visibly degraded by design, and that degradation is the delivered outcome, not a deferral.

## Implementation Order

1. **RED B-019/B-021: investigation roles.** Add each marker/test before the prompt edit. Two-way evidence protocol only (D-021); keep procedures provider-free.
2. **RED B-022/B-023: implementation roles.** Add each marker/test before the prompt edit. Full protocol including blocking on failed. Preserve worker's migration-sweep clause from `analysis-gate-rewiring`.
3. **Re-run the repository-wide generic-content and stale-link scans** across all shipped `bundled/`/`domains/` prompts, skills, and generic work-artifact references. Fix any provider-name leak from any of the three slices here.
4. **Refresh the ROADMAP analysis-tools entry** at plan completion.
5. **Run the final ladder.** Project-native tests/lint/typecheck, artifact conformance for this plan's behaviors, and bound changed-scope gates from an explicit base. Mutation/boundaries remain visibly degraded. Ratified collision → halt/escalate; false derived mechanism → amend-on-record before code.

B-020 is withdrawn (D-021) — Explorer is not a v1 consumer, and no stage adds a test, marker, or prompt edit for it.
