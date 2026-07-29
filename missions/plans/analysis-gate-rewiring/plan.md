---
title: Analysis gate rewiring
status: active
createdAt: '2026-07-29T00:00:00.000Z'
updatedAt: '2026-07-29T00:00:00.000Z'
---

## Overview

Slice 2 of 3 of the ratified `analysis-capabilities` design, split by D-024 on
2026-07-29. Depends on `analysis-capability-runtime`. That slice built the
capability surface without a consumer; this one moves the gating and
remediation roles onto it and removes the bridge that kept them working
meanwhile.

The end state of this slice is:

- Quality Manager resolves the plan's abstract gate ladder against runtime bindings and executes bound changed-scope capabilities directly — feature-branch base is the literal merge-base SHA, dirty-base is the literal HEAD SHA.
- Bound-and-completed, genuinely unbound, and failed-to-run are three distinct gate outcomes. A provider error is never a pass and never a quiet degradation.
- Remediation consumers rerun the same capability request and treat their own fresh structured result as ground truth (D-019), avoiding the lossy child-assistant-text boundary while still giving Verifier a generic capability-claim procedure.
- The `project-tools` extension reaches exactly seven roles (D-021), asserted by exhaustive enumeration over all agent definitions so drift fails the gate.
- A provider-neutral `domains/shared/skills/analysis/SKILL.md` replaces the deleted concrete provider skill, opening with the availability check that keeps it honest for wildcard agents that receive the skill without the tools.
- The legacy "Detected Analysis Tools" prose injection is deleted in the same stage that rewires its consumers — no silent gate window.

What this slice does not do: touch the runtime. The contract, adapter, runner,
and tool schemas are `analysis-capability-runtime`'s. If a consumer here
cannot express what it needs through the delivered contract, that is an
amend-on-record against that plan reopened deliberately, never a prompt-level
workaround. Planner, plan-reviewer, and refactorer procedures, and worker's
trace-and-audit procedure, belong to `analysis-investigation-procedures`;
worker's migration-sweep clause (B-031) is here because it is paired with the
Quality Manager's.

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
  - Decision: the parent plan `analysis-capabilities` is split at its own marked slice boundaries into `analysis-capability-runtime` (stages 1–5), `analysis-gate-rewiring` (stages 6–7), and `analysis-investigation-procedures` (stage 8), delivered in that order. Each slice carries the ratified Intent and the full acceptance-criteria list verbatim, the complete D-001–D-024 Decision Log verbatim, and its own behaviors with their original `B-###` IDs and slice-scoped markers. Withdrawn behaviors stay withdrawn in their home slice (B-032 in the runtime slice, B-020 in the investigation slice) and are neither resurrected nor renumbered. The parent plan is archived as the design of record; its behaviors are not duplicated back into it.
  - Alternatives: one plan with all 35 active behaviors (~3x the 3–12-task guidance, a long drive with a large blast radius before anything ships, and the size advisory left standing); a two-way split with one combined consumer slice (second slice still ~11 behaviors across seven roles, still above guidance); partitioning the acceptance criteria across slices rather than carrying them whole (impossible without editing ratified ground — B-024 alone sources AC-009, AC-010, and AC-012, so no clean partition exists).
  - Why: serves the Intent goal by making each slice independently valuable and gate-clean. The retained legacy prose injection is what makes the seams safe: slice 1 adds the runtime without touching consumers, slice 2 swaps consumers and deletes the bridge in the same stage, slice 3 extends procedures onto the surface slice 2 distributed.
  - Decided by: human, user-chose-among-options, 2026-07-29
  - Supersedes: the parent plan's single-backlog delivery and the "decide at task creation" wording of its Implementation Order slice-boundary note

## Behaviors

### B-013 - Feature-branch gates use the literal merge base
- Source: AC-009
- Context: Quality Manager reviews a feature branch with bound structural gates
- Action: it calls changed-scope audit directly
- Expected: the prompt instructs supplying the literal merge-base SHA as the base, consuming per-gate verdicts/findings from the direct tool result, and never synthesizing a command or Verifier handoff
- Seam: `bundled/coding/prompts/quality-manager.md`
- Test: `tests/prompts/quality-manager.test.ts` > `runs bound feature branch gates directly through the changed scope capability`
- Marker: `@cosmo-behavior plan:analysis-gate-rewiring#B-013`

### B-014 - Dirty-base gates use HEAD explicitly
- Source: AC-009
- Context: Quality Manager reviews dirty work on the local base branch
- Action: it calls changed-scope audit directly
- Expected: the prompt instructs supplying the literal HEAD SHA as the base and forbids skipping the audit because no branch range exists
- Seam: `bundled/coding/prompts/quality-manager.md`
- Test: `tests/prompts/quality-manager.test.ts` > `runs bound dirty base gates from an explicit HEAD base`
- Marker: `@cosmo-behavior plan:analysis-gate-rewiring#B-014`

### B-015 - Unsupported gates enter degraded reporting
- Source: AC-004, AC-009
- Context: a bindable gate's runtime capability is genuinely unbound
- Action: Quality Manager resolves it
- Expected: report says unbound/not enforced and reviewer judgment; it is neither pass nor hard failure
- Seam: `bundled/coding/prompts/quality-manager.md`, `domains/shared/skills/work-artifacts/references/gate-contracts.md`
- Test: `tests/prompts/quality-manager.test.ts` > `uses runtime unbound status for degraded gate reporting`
- Marker: `@cosmo-behavior plan:analysis-gate-rewiring#B-015`

### B-016 - Failed gates block and findings replay at remediation
- Source: AC-005, AC-009
- Context: direct Quality Manager analysis returns completed blocking findings or a tool error
- Action: it routes remediation
- Expected: the prompt instructs that tool errors are failed-to-run blockers, that findings route as the exact capability request plus human-readable finding designations (file:line, category, quoted message), and that the remediator reruns that request before editing and works from its own fresh result under the minimal-change constraint (D-019)
- Seam: `bundled/coding/prompts/quality-manager.md`, `bundled/coding/prompts/fixer.md`
- Test: `tests/prompts/quality-manager.test.ts` > `separates failed to run gates and routes findings for direct replay`
- Marker: `@cosmo-behavior plan:analysis-gate-rewiring#B-016`

### B-017 - Verifier validates capability claims directly
- Source: AC-009
- Context: a parent supplies capability/scope/base/metric claim
- Action: Verifier validates it
- Expected: it calls status and named generic tool, reports completed/unbound/unsupported/failed distinctly, and never uses provider commands
- Seam: `bundled/coding/prompts/verifier.md`
- Test: `tests/prompts/analysis-procedures.test.ts` > `gives verifier a provider agnostic capability claim protocol`
- Marker: `@cosmo-behavior plan:analysis-gate-rewiring#B-017`

### B-018 - Fixer replays findings and edits normally
- Source: AC-008, AC-009
- Context: Fixer receives a capability request and human-readable finding designations
- Action: it reruns analysis and remediates
- Expected: the prompt instructs rerunning the capability request before editing and working from the fresh result as ground truth (D-019); it traces before deletion, may preview, treats actions as proposals, and applies only ordinary narrow edits
- Seam: `bundled/coding/prompts/fixer.md`
- Test: `tests/prompts/analysis-procedures.test.ts` > `keeps fixer remediation replayed trace first preview only and agent edited`
- Marker: `@cosmo-behavior plan:analysis-gate-rewiring#B-018`

### B-024 - Every consumer receives a generic provider-free surface
- Source: AC-009, AC-010, AC-012
- Context: agent definitions assemble under a project skill allowlist that omits analysis
- Action: tool allowlists/skills and every shipped `bundled/`/`domains/` prompt, skill, and generic work-artifact reference are inspected
- Expected: the set of shipped agents loading project-tools is exactly the seven v1 consumers (D-021), asserted by exhaustive enumeration over all agent definitions so drift fails the gate; the shared analysis skill remains visible and contains the availability-check opening (D-021); generic shipped surfaces contain no Fallow name/command; provider docs/runtime source are explicit exclusions
- Seam: `bundled/coding/agents/*.ts`, `domains/shared/skills/analysis/SKILL.md`, `domains/shared/skills/work-artifacts/references/*.md`
- Test: `tests/domains/coding-agents.test.ts` > `gives analysis consumers generic tools and shared skill under project filtering`
- Marker: `@cosmo-behavior plan:analysis-gate-rewiring#B-024`

### B-031 - Migration sweeps combine capability and explicit search
- Source: AC-009, AC-011
- Context: work moves/renames files, exports, commands, config keys, or paths
- Action: Worker/Quality Manager perform the migration sweep
- Expected: the prompts instruct running the dead-code capability when bound, and always running the explicit old-identifier/path search across runtime/tests/docs, because structural reachability cannot prove stale strings absent
- Seam: `bundled/coding/prompts/worker.md`, `bundled/coding/prompts/quality-manager.md`
- Test: `tests/prompts/quality-manager.test.ts` > `preserves explicit migration reference searches even when dead code is bound`
- Marker: `@cosmo-behavior plan:analysis-gate-rewiring#B-031`

## Design

### 1. Gate resolution vocabulary

`gate-contracts.md` clarifies that runtime status is authoritative evidence without mutating plan rows:

- bound + completed: evaluate actual verdict;
- genuinely unbound: degraded, reviewer judgment;
- failed binding/invocation: failed-to-run, blocking;
- unsupported metric: degrade only that metric.

This amendment lands before any ladder consumer relies on the `failed blocks` vocabulary, and it introduces no capability name the runtime slice did not already define (B-001's vocabulary is the ground).

### 2. Direct gate execution and remediation rerun

Quality Manager calls `analysis_status` and `analysis_audit` itself. Feature branch base is literal merge-base; dirty-base is literal HEAD. The direct tool result retains full findings/native data. Bound gates absent a classifiable per-gate verdict fail-to-run.

For remediation, Quality Manager routes the exact generic request (capability, base/scope/metric) plus human-readable finding designations (file:line, category, quoted message), not copied model-authored payload (D-019). Fixer or a remediation Worker reruns the same capability tool before editing and treats its own fresh structured/native result as ground truth. Unbound or tool error at rerun yields not-resolved and triggers Quality Manager re-analysis; no stale finding is guessed. After edits, Quality Manager reruns directly.

Verifier still consumes capabilities for explicit validation claims, but it is not the lossless transport in the Quality Manager gate path. Its final report identifies status/evidence; remediation consumers never depend on child tool results crossing `extractAssistantText`.

Migration work always retains the explicit old-name/path repository search across runtime roots, tests, docs, and tracked references. Bound dead-code analysis is additive evidence, never a replacement for stale strings/config/command checks.

### 3. Surface distribution and the shared skill

Delete the Fallow skill tree. Add provider-neutral `domains/shared/skills/analysis/SKILL.md` covering status, completed/unbound/unsupported/failed, explicit base, trace-first, preview-only, rerun-before-edit remediation, and narrow remediation — without provider names/commands/apply. The skill opens with the availability check (D-021): call `analysis_status` first; if the tool is not registered in this session, analysis is not part of this role's surface — state that and proceed without it, no retries, no provider commands.

Add `project-tools` to the seven v1 consumers: Quality Manager, Verifier, Fixer, Planner, Plan Reviewer, Worker, Refactorer (D-021). Add `analysis` to explicit role skill allowlists; wildcard roles receive it because shared skills are automatically merged into effective project skills even when a project allowlist omits it — which makes the skill visible to wildcard agents without the tools (reviewer panel, distiller, integration-verifier, cody, main/cosmo), so the availability-check opening is load-bearing, not a courtesy.

Distribution reaches all seven roles here even though only three have their procedures rewritten in this slice. Planner, Plan Reviewer, Worker, and Refactorer receive the tools and the skill now so `analysis-investigation-procedures` writes procedure against a surface that already exists.

### 4. Role procedures in this slice

- Quality Manager: direct gate execution, explicit degradation/failure, request-plus-designation routing, always-preserved migration search.
- Verifier: generic claim validation, not transport.
- Fixer: rerun before edit, trace/preview, normal narrow edits only.
- Worker: the migration-sweep clause only (B-031). Its trace-before-delete and audit-at-task-close procedure is the next slice's B-022.

### 5. Removing the bridge

The legacy "Detected Analysis Tools" prose injection is deleted in the same stage that rewires Quality Manager, Verifier, and Fixer, so no shipped prompt is stranded against a missing block and no window exists where a consumer has neither surface. Remove shipped-skill links to the deleted provider skill from documentation in the same stage; the provider docs themselves stay, and provider-specific docs/runtime source remain excluded from INV-1 content scans.

## Files to Change

- `tests/prompts/quality-manager.test.ts` ↔ `bundled/coding/prompts/quality-manager.md`, `domains/shared/skills/work-artifacts/references/gate-contracts.md`.
- `tests/prompts/analysis-procedures.test.ts` (new) ↔ `bundled/coding/prompts/verifier.md`.
- `tests/prompts/analysis-procedures.test.ts` (new) ↔ `bundled/coding/prompts/fixer.md`.
- `tests/prompts/quality-manager.test.ts` ↔ `bundled/coding/prompts/worker.md` — migration sweep only (B-031).
- `tests/domains/coding-agents.test.ts` ↔ `bundled/coding/agents/quality-manager.ts`.
- `tests/domains/coding-agents.test.ts` ↔ `bundled/coding/agents/verifier.ts`.
- `tests/domains/coding-agents.test.ts` ↔ `bundled/coding/agents/fixer.ts`.
- `tests/domains/coding-agents.test.ts` ↔ `bundled/coding/agents/planner.ts`.
- `tests/domains/coding-agents.test.ts` ↔ `bundled/coding/agents/plan-reviewer.ts`.
- `tests/domains/coding-agents.test.ts` ↔ `bundled/coding/agents/worker.ts`.
- `tests/domains/coding-agents.test.ts` ↔ `bundled/coding/agents/refactorer.ts`.
- `domains/shared/skills/analysis/SKILL.md` (new) ↔ `tests/domains/coding-agents.test.ts` (B-024 availability-check assertion).
- `bundled/coding/skills/fallow/` (delete) — concrete shipped agent procedure removal.
- `domains/shared/extensions/project-tools/index.ts` — delete the legacy "Detected Analysis Tools" prose injection.
- `docs/fallow.md`, `docs/fallow-workflow-integration.md`, `docs/fallow-exceptions.md` — remove shipped-skill links to the deleted provider skill.

## Risks

- **Quality Manager regression surface is large.** Preserve legacy QC rows, universal gates, ledger, local-base logic, migration search, minimal remediation, and round budget through characterization/content tests written before the rewiring edits.
- **Deleting the bridge is the irreversible step.** The prose injection and its consumers must move in one stage. A partial landing leaves either a stranded prompt or a double surface; if the stage cannot complete, revert the deletion rather than shipping half.
- **Remediation rerun can observe drift.** The remediator's fresh rerun is ground truth (D-019); a finding that no longer reproduces is reported not-resolved and returns to Quality Manager rather than applying stale advice.
- **Shared skill visibility must respect filters.** Place only provider-neutral procedure in shared; provider docs remain outside skills. The availability-check opening is load-bearing for every wildcard agent that receives the skill without the tools (D-021).
- **Consumer enumeration drifts silently.** B-024 asserts the seven-role set by exhaustive enumeration over all agent definitions, not by spot-checking the seven; a new agent that loads `project-tools` must fail the gate until it is a considered decision.
- **A runtime gap may surface here.** If a consumer cannot express what it needs through the delivered contract, that is an amend-on-record against `analysis-capability-runtime`, deliberately reopened — never a prompt-level workaround that reintroduces a provider name or command.
- **Prompt content tests prove text, not behavior.** These behaviors are content obligations; their Expected clauses state what the named test can assert. Runtime correctness of the capabilities themselves is the runtime slice's evidence, not restated here.

## Quality Contract

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | Project-native tests, style, and type/schema checks pass, including the characterized Quality Manager behavior floor | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | Every B-### entry in this plan (B-013–B-018, B-024, B-031; none withdrawn) has its named test and exact marker | artifact evidence | hard fail |
| 3 | `mutation` | bindable | unbound | Project-specific mutation evidence | pending | unbound/not enforced; reviewer judgment required |
| 4 | `duplication` | bindable | bound | Changed scope introduces no blocking clone finding | capability resolution | genuine unbound degrades; failed blocks |
| 5 | `complexity` | bindable | bound | No configured changed-scope metric violation; unavailable requested metrics degrade individually | capability resolution | never treat unsupported as zero |
| 6 | `boundary-conformance` | bindable | unbound | Configured zones have no changed-scope violation | pending configuration | unbound until rules; reviewer checks direction; introspection failure blocks |
| 7 | `dead-code` | bindable | bound | No blocking changed-scope reachability/dependency finding and explicit migration searches find no stale references | capability resolution plus explicit search | capability is additive to migration search; failed blocks |

Rows 4, 5, and 7 are bound by `analysis-capability-runtime`'s delivery, not by this slice. This is the first slice whose own ladder run can use the `failed blocks` vocabulary, because the `gate-contracts.md` amendment lands in stage 1 below.

## Implementation Order

1. **Amend `gate-contracts.md` first.** The bound/unbound/failed/unsupported-metric resolution vocabulary must exist before any consumer prompt references it. No capability name may be introduced that the runtime slice did not define.
2. **RED B-024: distribute extension/shared skill and delete the provider skill.** Test under an explicit project skill filter omitting analysis; assert the seven-role set by exhaustive enumeration; run the repository-wide shipped generic-content scan. All seven roles receive the surface here, including the four whose procedures ship next slice.
3. **Characterize before rewiring.** Pin existing Quality Manager QC rows, ledger, local-base logic, migration search, minimal remediation, and round budget with tests that pass against today's prompt, so the rewiring cannot quietly drop them.
4. **RED B-013–B-018/B-031: Quality Manager, Verifier, Fixer, and worker's migration clause.** Introduce direct gates, the failed/unbound distinction, request-plus-designation remediation routing (D-019), and always-on explicit migration searches.
5. **Delete the legacy prose injection in this same stage.** It goes with its consumers, not before and not after. Remove shipped-skill links to the deleted provider skill.
6. **Run the ladder.** Project-native tests/lint/typecheck, artifact conformance for this plan's behaviors, and bound changed-scope gates from an explicit base. Mutation/boundaries remain visibly degraded. Ratified collision → halt/escalate; false derived mechanism → amend-on-record before code.

If stage 4 or 5 cannot complete, revert the injection deletion rather than shipping a half-rewired surface: a double surface is recoverable, a stranded prompt with no analysis block is a silent gate window.
