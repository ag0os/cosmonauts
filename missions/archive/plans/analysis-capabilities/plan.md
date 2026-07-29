---
title: Analysis capability abstraction
status: completed
createdAt: '2026-07-27T17:10:11.520Z'
updatedAt: '2026-07-29T16:36:48.071Z'
---

## Overview

> **Delivery: split into three plans (D-024, 2026-07-29).** This plan is the
> design of record. It is not implemented directly; its 35 active behaviors
> and 2 withdrawn entries were carried, IDs unchanged, into three sequential
> plans that own delivery:
>
> | Plan | Stages | Behaviors | Acceptance criteria |
> |---|---|---|---|
> | `analysis-capability-runtime` | 1–5 | B-001–B-012, B-025–B-030, B-033–B-037 (B-032 withdrawn) | AC-001–008, 011, 012 |
> | `analysis-gate-rewiring` | 6–7 | B-013–B-018, B-024, B-031 | AC-009 |
> | `analysis-investigation-procedures` | 8 | B-019, B-021–B-023 (B-020 withdrawn) | AC-010 |
>
> Each carries the ratified Intent, the full acceptance-criteria list, and the
> complete D-001–D-024 Decision Log verbatim. Stages 9–10 close whichever
> slice ships last. Read this plan for the unified design narrative; read the
> slice plans for what is actually being built.

Replace the current one-command project-tool injection with a provider-agnostic structural-analysis runtime. The stable core owns seven capability names and typed outcomes; the `project-tools` extension owns Pi registration and session discovery; a Fallow CLI adapter is the first concrete provider. Agent procedures call only generic capability tools, while runtime status/results may identify the resolved provider and version under INV-1.

The end state is:

- Capability vocabulary: `dead-code`, `duplication`, `complexity`, `boundary-conformance`, `changed-scope-audit`, `trace`, and `fix-preview`. The first four exactly reuse gate-contract vocabulary; the last three are operations, not competing gate aliases.
- Generic tools: `analysis_status`, `analysis_dead_code`, `analysis_duplication`, `analysis_complexity`, `analysis_boundaries`, `analysis_audit`, `analysis_trace`, and `analysis_fix_preview`.
- Optional project preference: `.cosmonauts/config.json` may name one provider; absence means auto-detect. Changing the provider never changes prompts, skills, plans, or tool names.
- Session status lists every capability as `bound`, `unbound`, or `failed`. `failed` is reserved for attempted provider discovery/runtime uncertainty and is never degraded as unsupported. Tool calls return completed/unbound/unsupported-metric/unsupported-scope or throw a Pi tool error. Provider subprocesses run only with recorded per-project execution consent (D-014); without it, detection stays read-only and status shows detected-but-withheld.
- Every provider subprocess is shell-free, cache-disabled, and read-only. Fix support is preview-only; no request, tool, or callback can apply changes.
- Quality Manager executes changed-scope capabilities directly. Remediation consumers rerun the same capability request and treat their own fresh structured result as ground truth (D-019), avoiding the lossy child-assistant-text boundary while still giving Verifier a generic capability-claim procedure.

This is one planned feature, not an architecture-linked umbrella. The durable provider boundary is the exported `lib/analysis/index.ts` contract plus `docs/analysis-capabilities.md`; create a separate architecture record only if a later second-provider/polyglot plan changes that boundary.

Out of scope remains CI enforcement, scheduled full-project stewardship, repository boundary-zone authoring, a second executable provider, MCP/Node transports, and fix application. INV-3 and INV-5 outrank every derived convenience below.

## Decision Log

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
  - Why: originally selected as Pi-first, but review proved Pi normalizes signal exits to code 0 and cannot establish INV-3. (Cited finding is from a prior review round's numbering, not the current `review.md`; premise independently re-verified 2026-07-27 against `pi-coding-agent/dist/core/exec.js` — `code ?? 0`.)
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
  - Why: review PR-001 showed ordinary analysis writes `.fallow/cache.bin`/`churn.bin`; INV-5 and AC-008 cover every capability tool. (Cited finding is from a prior review round's numbering, not the current `review.md`; premise independently re-verified 2026-07-27 with a live run — `fallow dead-code` writes `.fallow/cache.bin` without `--no-cache`.)
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
  - Decision: this plan is split at its own marked slice boundaries into `analysis-capability-runtime` (stages 1–5), `analysis-gate-rewiring` (stages 6–7), and `analysis-investigation-procedures` (stage 8), delivered in that order. Each slice carries the ratified Intent and the full acceptance-criteria list verbatim, the complete D-001–D-024 Decision Log verbatim, and its own behaviors with their original `B-###` IDs and slice-scoped markers. Withdrawn behaviors stay withdrawn in their home slice (B-032 in the runtime slice, B-020 in the investigation slice) and are neither resurrected nor renumbered. This plan is archived as the design of record and is not implemented directly.
  - Alternatives: one plan with all 35 active behaviors (~3x the 3–12-task guidance, a long drive with a large blast radius before anything ships, and the size advisory left standing); a two-way split with one combined consumer slice (second slice still ~11 behaviors across seven roles, still above guidance); partitioning the acceptance criteria across slices rather than carrying them whole (impossible without editing ratified ground — B-024 alone sources AC-009, AC-010, and AC-012, so no clean partition exists).
  - Why: serves the Intent goal by making each slice independently valuable and gate-clean. The retained legacy prose injection is what makes the seams safe: slice 1 adds the runtime without touching consumers, slice 2 swaps consumers and deletes the bridge in the same stage, slice 3 extends procedures onto the surface slice 2 distributed.
  - Decided by: human, user-chose-among-options, 2026-07-29
  - Supersedes: this plan's single-backlog delivery and the "decide at task creation" wording of the Implementation Order slice-boundary note

## Behaviors

### B-001 - One documented capability vocabulary
- Source: AC-001
- Context: a maintainer compares the generic analysis contract with gate contracts
- Action: they inspect taxonomy names and gate mapping
- Expected: all seven required capabilities exist; the four gate-facing names match exactly; operational capabilities introduce no aliases
- Seam: `docs/analysis-capabilities.md`, `domains/shared/skills/work-artifacts/references/gate-contracts.md`
- Test: `tests/analysis/contracts.test.ts` > `documents one capability vocabulary aligned with gate kinds`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-001`

### B-002 - Generic schemas have cross-tool evidence
- Source: AC-002
- Context: each result field is judged for provider neutrality
- Action: the validation record maps it to at least two real tools, no more than one Fallow
- Expected: common fields map across both tools; all single-provider data is provider-tagged; every capability is covered
- Seam: `docs/analysis-provider-validation.md`, `lib/analysis/types.ts`
- Test: `tests/analysis/contracts.test.ts` > `documents two-tool evidence and provider-tags single-provider data`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-002`

### B-003 - Provider preference swaps bindings, not procedures
- Source: AC-003
- Context: project config names a provider
- Action: resolution runs with it available, unavailable, and replaced by a fake provider
- Expected: tool/capability names stay fixed; support binds to the preference; unavailable explicit preference is unbound without fallback
- Seam: `lib/config/loader.ts`, `lib/analysis/binding-resolver.ts`
- Test: `tests/analysis/binding-resolver.test.ts` > `honors project provider preference without changing capability names`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-003`

### B-004 - Detected reference provider publishes complete status
- Source: AC-003, AC-007, AC-011
- Context: a JS/TS fixture has a local pinned provider (obtained through the D-015 injection seam) plus `.fallowrc.json`, `fallow.toml`, `.fallow.toml`, or package detection — including a package-signal-only case with no config file, and a signal-present case whose executable is not resolvable
- Action: session status is requested for each canonical detection signal
- Expected: supported capabilities bind with provider/version/scopes/metrics; the config-less package signal still binds (config introspection exit 3 is defaults-in-effect per D-022); the unresolvable-executable case reports every capability unbound `provider-not-installed` (D-015); status has no command; the stale `.fallowrc.toml` signal is not treated as canonical
- Seam: `domains/shared/extensions/project-tools/index.ts`, `domains/shared/extensions/project-tools/fallow-provider.ts`
- Test: `tests/extensions/project-tools.test.ts` > `detects every canonical provider config and reports version scopes and metrics without commands`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-004`

### B-005 - A non-JS project visibly degrades
- Source: AC-004
- Context: a Python fixture has no supporting provider
- Action: discovery and every generic tool run
- Expected: all seven capabilities are listed unbound with reasons; each tool returns unbound; none is omitted or passed
- Seam: `domains/shared/extensions/project-tools/index.ts`
- Test: `tests/extensions/project-tools.test.ts` > `reports and returns every capability unbound for a Python fixture`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-005`

### B-006 - Unconfigured boundaries are unbound, not clean
- Source: AC-004
- Context: provider detection succeeds but boundary introspection says no zones/rules
- Action: status and boundaries are requested
- Expected: boundary-conformance alone is unbound with `provider-not-configured`; zero native violations is not conformance
- Seam: `domains/shared/extensions/project-tools/fallow-provider.ts`, `lib/analysis/binding-resolver.ts`
- Test: `tests/extensions/project-tools-fallow.test.ts` > `leaves boundary conformance unbound when rules are not configured`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-006`

### B-007 - Successful results preserve generic and native evidence
- Source: AC-003, AC-011
- Context: valid success JSON exists for each supported capability
- Action: matching tools execute
- Expected: analysis-kind results carry capability/provider/version/scope/base/verdict; operational results (trace, fix preview) carry `verdict: "not-applicable"` with their evidence/proposals (D-013); all preserve complete provider-tagged payload/stderr/exit without truncation
- Seam: `domains/shared/extensions/project-tools/fallow-provider.ts`, `lib/analysis/types.ts`
- Test: `tests/extensions/project-tools-fallow.test.ts` > `normalizes every supported capability and preserves its native envelope`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-007`

### B-008 - Findings exit is completed analysis
- Source: AC-005, AC-011
- Context: provider exits 1 with valid findings JSON
- Action: a structural capability executes
- Expected: status is completed, verdict fail, all findings/actions are present, and no exception/prose flattening occurs
- Seam: `domains/shared/extensions/project-tools/fallow-provider.ts`
- Test: `tests/extensions/project-tools-fallow.test.ts` > `treats exit one as completed failing analysis with findings`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-008`

### B-009 - Invalid provider outcomes throw serialized failures
- Source: AC-005
- Context: provider exits 2, emits an error envelope, returns invalid JSON, or — for a verdict-bearing capability (D-013) — returns JSON that cannot support a verdict; successful trace/fix-preview evidence JSON completes without a fabricated verdict and without throwing
- Action: a bound capability executes
- Expected: `AnalysisProviderError.message` names failed-to-run status, capability, provider, failure class, and process evidence (D-020); no case returns clean or empty findings
- Seam: `domains/shared/extensions/project-tools/fallow-provider.ts`
- Test: `tests/extensions/project-tools-fallow.test.ts` > `throws serialized failures for every unclassifiable provider outcome`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-009`

### B-010 - Changed audit refuses an absent base
- Source: AC-006
- Context: audit receives missing/empty/whitespace base
- Action: validation/execution runs
- Expected: tool errors before provider invocation and never widens; a valid base is passed literally and echoed in scope
- Seam: `domains/shared/extensions/project-tools/index.ts`, `domains/shared/extensions/project-tools/fallow-provider.ts`
- Test: `tests/extensions/project-tools-fallow.test.ts` > `requires and preserves a nonempty explicit audit base`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-010`

### B-011 - Unsupported metrics degrade narrowly
- Source: AC-007
- Context: complexity is bound but requested metric is absent
- Action: complexity executes
- Expected: unsupported-metric names requested/available metrics without provider invocation or zero findings
- Seam: `lib/analysis/binding-resolver.ts`, `domains/shared/extensions/project-tools/index.ts`
- Test: `tests/analysis/binding-resolver.test.ts` > `degrades only an unavailable complexity metric`; tool-level case in `tests/extensions/project-tools.test.ts`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-011`

### B-012 - Every capability is non-mutating
- Source: AC-008
- Context: a fixture snapshots all worktree files, including ignored provider cache paths
- Action: status plus every capability tool executes, including fix preview
- Expected: all analysis/introspection calls disable caches, fix preview is dry-run, before/after bytes and paths match, and no apply tool exists
- Seam: `domains/shared/extensions/project-tools/process-runner.ts`, `domains/shared/extensions/project-tools/fallow-provider.ts`, `domains/shared/extensions/project-tools/index.ts`
- Test: `tests/extensions/project-tools-fallow.test.ts` > `leaves the entire worktree unchanged across status and every capability`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-012`

### B-013 - Feature-branch gates use the literal merge base
- Source: AC-009
- Context: Quality Manager reviews a feature branch with bound structural gates
- Action: it calls changed-scope audit directly
- Expected: the prompt instructs supplying the literal merge-base SHA as the base, consuming per-gate verdicts/findings from the direct tool result, and never synthesizing a command or Verifier handoff
- Seam: `bundled/coding/prompts/quality-manager.md`
- Test: `tests/prompts/quality-manager.test.ts` > `runs bound feature branch gates directly through the changed scope capability`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-013`

### B-014 - Dirty-base gates use HEAD explicitly
- Source: AC-009
- Context: Quality Manager reviews dirty work on the local base branch
- Action: it calls changed-scope audit directly
- Expected: the prompt instructs supplying the literal HEAD SHA as the base and forbids skipping the audit because no branch range exists
- Seam: `bundled/coding/prompts/quality-manager.md`
- Test: `tests/prompts/quality-manager.test.ts` > `runs bound dirty base gates from an explicit HEAD base`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-014`

### B-015 - Unsupported gates enter degraded reporting
- Source: AC-004, AC-009
- Context: a bindable gate's runtime capability is genuinely unbound
- Action: Quality Manager resolves it
- Expected: report says unbound/not enforced and reviewer judgment; it is neither pass nor hard failure
- Seam: `bundled/coding/prompts/quality-manager.md`, `domains/shared/skills/work-artifacts/references/gate-contracts.md`
- Test: `tests/prompts/quality-manager.test.ts` > `uses runtime unbound status for degraded gate reporting`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-015`

### B-016 - Failed gates block and findings replay at remediation
- Source: AC-005, AC-009
- Context: direct Quality Manager analysis returns completed blocking findings or a tool error
- Action: it routes remediation
- Expected: the prompt instructs that tool errors are failed-to-run blockers, that findings route as the exact capability request plus human-readable finding designations (file:line, category, quoted message), and that the remediator reruns that request before editing and works from its own fresh result under the minimal-change constraint (D-019)
- Seam: `bundled/coding/prompts/quality-manager.md`, `bundled/coding/prompts/fixer.md`
- Test: `tests/prompts/quality-manager.test.ts` > `separates failed to run gates and routes findings for direct replay`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-016`

### B-017 - Verifier validates capability claims directly
- Source: AC-009
- Context: a parent supplies capability/scope/base/metric claim
- Action: Verifier validates it
- Expected: it calls status and named generic tool, reports completed/unbound/unsupported/failed distinctly, and never uses provider commands
- Seam: `bundled/coding/prompts/verifier.md`
- Test: `tests/prompts/analysis-procedures.test.ts` > `gives verifier a provider agnostic capability claim protocol`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-017`

### B-018 - Fixer replays findings and edits normally
- Source: AC-008, AC-009
- Context: Fixer receives a capability request and human-readable finding designations
- Action: it reruns analysis and remediates
- Expected: the prompt instructs rerunning the capability request before editing and working from the fresh result as ground truth (D-019); it traces before deletion, may preview, treats actions as proposals, and applies only ordinary narrow edits
- Seam: `bundled/coding/prompts/fixer.md`
- Test: `tests/prompts/analysis-procedures.test.ts` > `keeps fixer remediation replayed trace first preview only and agent edited`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-018`

### B-019 - Planner investigates through capabilities
- Source: AC-010
- Context: Planner designs non-trivial work
- Action: it checks bindings and relevant touched-area complexity/duplication/boundaries/traces
- Expected: evidence or unbound uncertainty enters design/risks with no provider command/name in procedure
- Seam: `bundled/coding/prompts/planner.md`
- Test: `tests/prompts/analysis-procedures.test.ts` > `expresses planner investigation in capability terms`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-019`

### B-020 - Explorer maps available evidence *(withdrawn by D-021, 2026-07-27 — Explorer is not a v1 consumer; no test or marker ships for this entry)*
- Source: AC-010
- Context: Explorer maps a subsystem
- Action: it checks bindings and invokes relevant investigations
- Expected: report cites capability evidence or explicit gaps without provider procedures
- Seam: `bundled/coding/prompts/explorer.md`
- Test: `tests/prompts/analysis-procedures.test.ts` > `expresses explorer evidence gathering in capability terms`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-020`

### B-021 - Plan Reviewer challenges with capability evidence
- Source: AC-010
- Context: Plan Reviewer checks duplicate paths, dependency direction, deletions
- Action: it checks bindings/investigations
- Expected: findings cite capability evidence or visible limitations without provider procedures
- Seam: `bundled/coding/prompts/plan-reviewer.md`
- Test: `tests/prompts/analysis-procedures.test.ts` > `expresses plan review challenges in capability terms`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-021`

### B-022 - Worker audits and traces before completion
- Source: AC-010
- Context: Worker is green after refactor and has not committed
- Action: it audits from current pre-commit HEAD and traces deletions
- Expected: the prompt instructs correcting completed findings narrowly, recording unbound, blocking completion on failed, and stating evidence in capability terms
- Seam: `bundled/coding/prompts/worker.md`
- Test: `tests/prompts/analysis-procedures.test.ts` > `requires worker trace before delete and audit at task close`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-022`

### B-023 - Refactorer audits without metric chasing
- Source: AC-010
- Context: behavior is green and a structural delta is uncommitted
- Action: Refactorer traces moves/removals and audits from structural-change base
- Expected: completed/unbound/failed evidence is explicit and no metric overrides no-behavior-change discipline
- Seam: `bundled/coding/prompts/refactorer.md`
- Test: `tests/prompts/analysis-procedures.test.ts` > `requires refactorer trace and changed scope evidence without metric chasing`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-023`

### B-024 - Every consumer receives a generic provider-free surface
- Source: AC-009, AC-010, AC-012
- Context: agent definitions assemble under a project skill allowlist that omits analysis
- Action: tool allowlists/skills and every shipped `bundled/`/`domains/` prompt, skill, and generic work-artifact reference are inspected
- Expected: the set of shipped agents loading project-tools is exactly the seven v1 consumers (D-021), asserted by exhaustive enumeration over all agent definitions so drift fails the gate; the shared analysis skill remains visible and contains the availability-check opening (D-021); generic shipped surfaces contain no Fallow name/command; provider docs/runtime source are explicit exclusions
- Seam: `bundled/coding/agents/*.ts`, `domains/shared/skills/analysis/SKILL.md`, `domains/shared/skills/work-artifacts/references/*.md`
- Test: `tests/domains/coding-agents.test.ts` > `gives analysis consumers generic tools and shared skill under project filtering`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-024`

### B-025 - Reference engine resolution is reproducible
- Source: AC-011
- Context: this repository's dependencies install and the provider detects
- Action: package/lock/executable/version are inspected
- Expected: exact 2.54.2 pin in this repository's package/lock; resolution follows D-015 (never PATH/global, never mutable fetch); detected version in every result; the version/schema mismatch policy is proven separately by B-037
- Seam: `package.json`, `bun.lock`, `domains/shared/extensions/project-tools/fallow-provider.ts`
- Test: `tests/extensions/project-tools-fallow.test.ts` > `uses the exact pinned project local provider engine`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-025`

### B-026 - Dirty audit covers tracked staged and untracked files
- Source: AC-009
- Context: a temporary Git project has one tracked modification, one staged change, and one untracked source file relative to HEAD
- Action: the real pinned adapter runs changed-scope audit with base HEAD
- Expected: changed scope and normalized/native evidence account for all three classes; otherwise the test fails and implementation must redesign before prompt behavior lands
- Seam: `domains/shared/extensions/project-tools/fallow-provider.ts`
- Test: `tests/extensions/project-tools-fallow.test.ts` > `audits tracked staged and untracked dirty base changes from HEAD`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-026`

### B-027 - Empty path and trace inputs never widen
- Source: AC-003, AC-006
- Context: paths or trace target strings are empty/whitespace, or path arrays are empty
- Action: a scoped tool is called
- Expected: validation throws before provider invocation; no request becomes project scope
- Seam: `domains/shared/extensions/project-tools/index.ts`
- Test: `tests/extensions/project-tools.test.ts` > `rejects empty scopes and trace targets instead of widening`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-027`

### B-028 - Malformed analysis config is isolated visibly
- Source: AC-003, AC-004
- Context: `.cosmonauts/config.json` has malformed analysis object/provider plus unrelated valid keys
- Action: config loads
- Expected: warning names the bad field/value, analysis preference is ignored, and every unrelated key remains unchanged
- Seam: `lib/config/loader.ts`
- Test: `tests/config/loader.test.ts` > `isolates malformed analysis provider config from unrelated settings`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-028`

### B-029 - Process outcomes preserve crash abort and timeout
- Source: AC-005
- Context: child process exits by signal, is aborted, times out, or fails to spawn
- Action: signal-aware runner executes it
- Expected: mutually exclusive typed outcomes retain signal/reason/output and none is normalized to code 0; a child that ignores graceful termination is force-killed within the bounded grace period and the outcome retains the initiating reason (D-023); the runner's own tests spawn real short-lived children (self-signaling, termination-ignoring, nonexistent binary) on all supported platforms — doubles are reserved for adapter-level tests that inject the runner
- Seam: `domains/shared/extensions/project-tools/process-runner.ts`
- Test: `tests/extensions/project-tools-process.test.ts` > `distinguishes signal abort timeout and spawn failure from clean exit`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-029`

### B-030 - Pi preserves structured error evidence in error content
- Source: AC-005
- Context: a registered capability throws an `AnalysisProviderError` whose message carries the D-020 failure evidence
- Action: the real Pi agent loop executes the tool
- Expected: `tool_execution_end.isError` is true, details may be empty, and the result content preserves the message's capability/provider/failure-class/process evidence intact
- Seam: `@earendil-works/pi-agent-core` tool loop, `domains/shared/extensions/project-tools/index.ts`
- Test: `tests/pi-contract/pi-behavior-contract.test.ts` > `preserves serialized capability failure in Pi error content`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-030`

### B-031 - Migration sweeps combine capability and explicit search
- Source: AC-009, AC-011
- Context: work moves/renames files, exports, commands, config keys, or paths
- Action: Worker/Quality Manager perform the migration sweep
- Expected: the prompts instruct running the dead-code capability when bound, and always running the explicit old-identifier/path search across runtime/tests/docs, because structural reachability cannot prove stale strings absent
- Seam: `bundled/coding/prompts/worker.md`, `bundled/coding/prompts/quality-manager.md`
- Test: `tests/prompts/quality-manager.test.ts` > `preserves explicit migration reference searches even when dead code is bound`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-031`

### B-032 - Finding IDs are deterministic across replay *(withdrawn by D-019, 2026-07-27 — IDs are adapter-internal; no cross-session determinism contract or test ships)*
- Source: AC-009, AC-011
- Context: unchanged provider payload is normalized in Quality Manager and remediation sessions
- Action: the same capability request runs twice
- Expected: IDs derive from provider/capability/category/identity/location/message content, not array position or session state, so routed IDs resolve exactly
- Seam: `domains/shared/extensions/project-tools/fallow-provider.ts`, `lib/analysis/types.ts`
- Test: `tests/extensions/project-tools-fallow.test.ts` > `derives stable finding identifiers across repeated analysis`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-032`

### B-033 - Unsupported scopes degrade narrowly
- Source: AC-003, AC-006
- Context: a bound capability's binding does not advertise the requested scope kind
- Action: the tool is called with that scope
- Expected: a structured unsupported-scope outcome names the requested and supported kinds without provider invocation; the request never widens and is never reported as provider failure (D-016)
- Seam: `lib/analysis/binding-resolver.ts`, `domains/shared/extensions/project-tools/index.ts`
- Test: `tests/analysis/binding-resolver.test.ts` > `degrades an unadvertised scope kind without widening`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-033`

### B-034 - No provider subprocess without execution consent
- Source: AC-003, AC-004
- Context: a fixture carries a Fallow signal and a sentinel fake executable, with no recorded execution consent
- Action: session start, status, and every capability tool run
- Expected: zero subprocesses spawn (sentinel untouched, runner never invoked); status shows the provider detected-but-withheld with reason `execution-not-consented`; tools return the withheld state; the paired consent-granted case binds normally (D-014)
- Seam: `domains/shared/extensions/project-tools/index.ts`
- Test: `tests/extensions/project-tools.test.ts` > `withholds all provider execution until consent is recorded`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-034`

### B-035 - Agent start injects the capability status rows
- Source: AC-004
- Context: fixtures cover bound, unbound, failed, and detected-but-withheld states
- Action: `before_agent_start` fires
- Expected: the returned system prompt contains one row per capability (all seven) with state and reason and no commands, in every fixture including the no-consent one (D-018)
- Seam: `domains/shared/extensions/project-tools/index.ts`
- Test: `tests/extensions/project-tools.test.ts` > `injects the seven-row capability status into the system prompt`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-035`

### B-036 - Pi cancellation terminates the provider child
- Source: AC-005
- Context: a bound capability tool is executing a spawned child
- Action: the Pi-supplied AbortSignal aborts mid-execution
- Expected: the child receives bounded termination, the tool throws the serialized aborted failure (never a clean or empty result), and no orphan process persists (D-017)
- Seam: `domains/shared/extensions/project-tools/index.ts`, `domains/shared/extensions/project-tools/fallow-provider.ts`, `domains/shared/extensions/project-tools/process-runner.ts`
- Test: `tests/extensions/project-tools.test.ts` > `aborting a capability tool terminates the provider child`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-036`

### B-037 - Version and schema drift never silently normalize
- Source: AC-011
- Context: the resolved executable reports a version other than the validated engine, or an envelope carries an out-of-contract `schema_version`
- Action: status and a capability tool run
- Expected: the mismatched version binds with the detected version surfaced in status; an out-of-contract envelope is an `AnalysisFailure`, never a silently normalized completed result (D-015)
- Seam: `domains/shared/extensions/project-tools/fallow-provider.ts`
- Test: `tests/extensions/project-tools-fallow.test.ts` > `surfaces version drift and fails out-of-contract envelopes`
- Marker: `@cosmo-behavior plan:analysis-capabilities#B-037`

## Design

### 1. Stable analysis core

Create `lib/analysis/types.ts`, `binding-resolver.ts`, and `index.ts`. The core imports neither Pi nor concrete provider code.

```ts
type AnalysisCapability =
  | "dead-code" | "duplication" | "complexity" | "boundary-conformance"
  | "changed-scope-audit" | "trace" | "fix-preview";
type AnalysisMetric = "cyclomatic" | "cognitive" | "crap";
type AnalysisScope =
  | { kind: "project" }
  | { kind: "paths"; paths: readonly string[] }
  | { kind: "changed"; base: string }
  | { kind: "target"; target: AnalysisTraceTarget };
interface ProviderIdentity { readonly id: string; readonly name: string; readonly version: string }

type AnalysisBinding =
  | { state: "bound"; capability: AnalysisCapability; provider: ProviderIdentity; scopes: readonly AnalysisScope["kind"][]; metrics?: readonly AnalysisMetric[] }
  | { state: "unbound"; capability: AnalysisCapability; reason: "no-provider" | "configured-provider-unavailable" | "provider-unsupported" | "provider-not-configured" | "provider-not-installed" | "execution-not-consented"; providerId?: string }
  | { state: "failed"; capability: AnalysisCapability; providerId?: string; failure: AnalysisFailure };
```

Requests are discriminated so audit always has nonempty `base`, complexity alone has `metric`, trace has one `symbol | file | dependency | duplicate-location` target, path scopes contain at least one trimmed project path, and fix preview has no apply flag. Runtime checks trim/non-empty values even after schema validation.

Completed results share capability/provider/scope/native and discriminate into structural findings, trace graph/evidence, or fix proposals. Verdict is per result kind (D-013): analysis-kind results carry an asserted or derived verdict; trace and fix-preview results carry `verdict: "not-applicable"`. Findings have adapter-internal IDs, gate-aligned category, severity (`info | warning | error | unknown`), message, locations, generic actions, and provider-tagged details. Unknown severity is preserved. Native envelope stores provider, process outcome code, parsed payload, and stderr without truncation. A path-scoped adapter must derive verdict from the scoped normalized evidence; if that cannot be classified, it throws rather than reusing a wider project verdict.

Provider discovery is itself discriminated:

```ts
type ProviderDetection =
  | { status: "absent"; providerId: string }
  | { status: "detected"; provider: DetectedAnalysisProvider }
  | { status: "failed"; providerId: string; failure: AnalysisFailure };
```

Detected support entries can mark a capability supported or `provider-not-configured`. The resolver preserves failed detection, rejects unsupported metrics and unadvertised scope kinds before execution (D-016), and keeps provider executors in the session runtime while exposing serializable binding status. Provider executors take the Pi `execute` AbortSignal as an explicit parameter (D-017).

### 2. Config and canonical detection

Extend `ProjectConfig` with optional `ProjectAnalysisConfig { provider?: string }`. Parse only nonempty strings; malformed object/provider fields warn with value and preserve unrelated config (B-028).

The reference adapter recognizes canonical `.fallowrc.json`, `fallow.toml`, `.fallow.toml`, and package dependency signals. It does not perpetuate `.fallowrc.toml`. Signal detection is always file-read-only; executable introspection (version, config, boundaries) is consent-gated per D-014. Executable resolution and the version/schema policy follow D-015; a signal without a resolvable executable is unbound `provider-not-installed`. Config introspection follows the D-022 per-operation exit contract (exit 3 is defaults-in-effect; the stdout preamble is tolerated). No signal means absent/unbound. A detected/selected provider whose attempted introspection fails produces failed bindings, not unsupported. Real-engine tests obtain the pinned binary through the D-015 injection seam (fixtures link the repo-pinned engine); each real-engine behavior states whether it runs the live engine or captured envelopes.

Pin Fallow exactly at 2.54.2 in package/lock. `.cosmonauts/config.json` may explicitly select it for dogfooding, but skill visibility does not depend on this repository's skill list.

### 3. Signal-aware non-mutating provider runner

Create `process-runner.ts` around `spawn(command, args, { cwd, shell: false, stdio: [...] })`. The runner accepts an external AbortSignal (D-017) and every invocation runs under a finite default timeout (D-023). Capture stdout/stderr and resolve exactly one outcome: code exit, signal exit, spawn error, aborted, or timeout. Abort/timeout send graceful termination, then force-kill after a bounded grace period, and retain their initiating reason even if the eventual signal is observed. Never normalize null/signal to zero. For capability executions the adapter maps only code 0/1 plus valid classifiable JSON to completed; every other outcome becomes `AnalysisFailure`. Introspection commands follow the D-022 per-operation exit contract.

All analyzer/list/config invocations include JSON/quiet where supported and `--no-cache`; explanation flags are operation-specific, not blindly appended where unsupported. Version detection is read-only. Fix preview additionally includes dry-run. No free-form command/flag enters from tool input.

B-012 snapshots all files, including ignored `.fallow` paths, across status and every capability using the real pinned engine. B-026 uses a temporary Git project and real adapter. If Fallow does not account for untracked files, amend the derived adapter before consumer prompts: combine its changed audit with read-only Git dirty-path discovery and read-only path-scoped sub-analyses, or leave changed-scope audit failed. Never claim pass from incomplete scope.

### 4. Pi tools, errors, and session state

Register all eight tools immediately. Discovery runs at first need — `before_agent_start` injection or the first tool call — sharing one session/cwd promise (D-018), and respects the D-014 consent gate. The injected status block lists seven concise rows: bound provider/version/scopes/metrics; unbound reason (including detected-but-withheld); failed-to-run reason. The legacy "Detected Analysis Tools" prose injection survives unchanged until the Quality Manager rewiring stage deletes it, so no shipped prompt is stranded against a missing block. Clear snapshot on session start/shutdown.

Unbound returns structured skip; unsupported metric or scope returns a narrow unsupported outcome; failed binding/tool execution throws `AnalysisProviderError`. Because Pi discards custom error details, the error message itself names capability, provider, failure class, and process evidence (D-020). The real Pi contract test asserts `isError: true` and that the message arrives intact; extension-unit rejection alone is not accepted evidence.

Successful tool `content` contains complete JSON including native payload; `details` mirrors it for renderers. No result artifact or in-memory cross-session cache is correctness-critical.

### 5. Direct gate execution and remediation rerun

`gate-contracts.md` clarifies runtime status is authoritative evidence without mutating plan rows:

- bound + completed: evaluate actual verdict;
- genuinely unbound: degraded, reviewer judgment;
- failed binding/invocation: failed-to-run, blocking;
- unsupported metric: degrade only that metric.

Quality Manager calls `analysis_status` and `analysis_audit` itself. Feature branch base is literal merge-base; dirty-base is literal HEAD. The direct tool result retains full findings/native data. Bound gates absent a classifiable per-gate verdict fail-to-run.

For remediation, Quality Manager routes the exact generic request (capability, base/scope/metric) plus human-readable finding designations (file:line, category, quoted message), not copied model-authored payload (D-019). Fixer or a remediation Worker reruns the same capability tool before editing and treats its own fresh structured/native result as ground truth. Unbound or tool error at rerun yields not-resolved and triggers Quality Manager re-analysis; no stale finding is guessed. After edits, Quality Manager reruns directly.

Verifier still consumes capabilities for explicit validation claims, but it is not the lossless transport in the Quality Manager gate path. Its final report identifies status/evidence; remediation consumers never depend on child tool results crossing `extractAssistantText`.

Migration work always retains the explicit old-name/path repository search across runtime roots, tests, docs, and tracked references. Bound dead-code analysis is additive evidence, never a replacement for stale strings/config/command checks.

### 6. Role procedures and shared skill

Delete the Fallow skill tree. Add provider-neutral `domains/shared/skills/analysis/SKILL.md` covering status, completed/unbound/unsupported/failed, explicit base, trace-first, preview-only, rerun-before-edit remediation, and narrow remediation—without provider names/commands/apply. The skill opens with the availability check (D-021): call `analysis_status` first; if the tool is not registered in this session, analysis is not part of this role's surface — state that and proceed without it, no retries, no provider commands.

Add `project-tools` to the seven v1 consumers: Quality Manager, Verifier, Fixer, Planner, Plan Reviewer, Worker, Refactorer (D-021). Add `analysis` to explicit role skill allowlists; wildcard roles receive it because shared skills are automatically merged into effective project skills even when a project allowlist omits it — which makes the skill visible to wildcard agents without the tools (reviewer panel, distiller, integration-verifier, cody, main/cosmo), so the availability-check opening is load-bearing, not a courtesy.

Role procedures:

- Planner/Plan Reviewer: investigate when bound; record evidence or its absence — the full four-state protocol is not taught to investigation roles (D-021).
- Worker/Refactorer: trace before delete, audit before commit, block on failed bound capability, never chase metrics.
- Quality Manager: direct gate execution, explicit degradation/failure, ID/request routing, always-preserved migration search.
- Verifier: generic claim validation, not transport.
- Fixer: rerun IDs, trace/preview, normal narrow edits only.

### 7. Documentation

`docs/analysis-capabilities.md` is provider-neutral. `docs/analysis-provider-validation.md` is a deliberately concrete AC-002 evidence record (Fallow plus Knip, jscpd, Radon, dependency-cruiser, Semgrep baseline analysis, ESLint dry-run as applicable). Update Fallow/provider workflow docs — including `docs/fallow-exceptions.md`, whose Current Gate section and `fallow.toml` entry documentation drift under this plan — and remove shipped-skill links; refresh the ROADMAP analysis-tools entry at completion. Provider-specific docs/runtime source are excluded from INV-1 content scans; all `bundled/`/`domains/` prompts, skills, and generic work-artifact references are included.

## Files to Change

- `tests/analysis/contracts.test.ts` (new) ↔ `lib/analysis/types.ts` (new), `lib/analysis/index.ts` (new), `docs/analysis-capabilities.md` (new), `docs/analysis-provider-validation.md` (new), `domains/shared/skills/work-artifacts/references/gate-contracts.md` (B-001 vocabulary alignment).
- `tests/analysis/binding-resolver.test.ts` (new) ↔ `lib/analysis/binding-resolver.ts` (new).
- `tests/config/loader.test.ts` ↔ `lib/config/types.ts`, `lib/config/loader.ts`, `lib/config/index.ts`, `.cosmonauts/config.json`.
- `tests/extensions/project-tools-process.test.ts` (new) ↔ `domains/shared/extensions/project-tools/process-runner.ts` (new).
- `tests/extensions/project-tools.test.ts` ↔ `domains/shared/extensions/project-tools/index.ts`.
- `tests/extensions/project-tools-fallow.test.ts` (new) ↔ `domains/shared/extensions/project-tools/fallow-provider.ts` (new).
- `tests/pi-contract/pi-behavior-contract.test.ts` ↔ `domains/shared/extensions/project-tools/index.ts` — real Pi error conversion contract.
- `tests/domains/coding-agents.test.ts` ↔ `bundled/coding/agents/quality-manager.ts`.
- `tests/domains/coding-agents.test.ts` ↔ `bundled/coding/agents/verifier.ts`.
- `tests/domains/coding-agents.test.ts` ↔ `bundled/coding/agents/fixer.ts`.
- `tests/domains/coding-agents.test.ts` ↔ `bundled/coding/agents/planner.ts`.
- `tests/domains/coding-agents.test.ts` ↔ `bundled/coding/agents/plan-reviewer.ts`.
- `tests/domains/coding-agents.test.ts` ↔ `bundled/coding/agents/explorer.ts`.
- `tests/domains/coding-agents.test.ts` ↔ `bundled/coding/agents/worker.ts`.
- `tests/domains/coding-agents.test.ts` ↔ `bundled/coding/agents/refactorer.ts`.
- `tests/prompts/quality-manager.test.ts` ↔ `bundled/coding/prompts/quality-manager.md`, `domains/shared/skills/work-artifacts/references/gate-contracts.md`.
- `tests/prompts/analysis-procedures.test.ts` (new) ↔ `bundled/coding/prompts/verifier.md`.
- `tests/prompts/analysis-procedures.test.ts` (new) ↔ `bundled/coding/prompts/fixer.md`.
- `tests/prompts/analysis-procedures.test.ts` (new) ↔ `bundled/coding/prompts/planner.md`.
- `tests/prompts/analysis-procedures.test.ts` (new) ↔ `bundled/coding/prompts/explorer.md`.
- `tests/prompts/analysis-procedures.test.ts` (new) ↔ `bundled/coding/prompts/plan-reviewer.md`.
- `tests/prompts/analysis-procedures.test.ts` (new) ↔ `bundled/coding/prompts/worker.md`.
- `tests/prompts/analysis-procedures.test.ts` (new) ↔ `bundled/coding/prompts/refactorer.md`.
- `domains/shared/skills/analysis/SKILL.md` (new) ↔ `tests/domains/coding-agents.test.ts` (B-024 availability-check assertion).
- `tests/helpers/mocks/extension-api.ts` — optional signal parameter for tool invocation (D-017/B-036).
- `docs/fallow-exceptions.md` — align the Current Gate section with the capability runtime; document the `lib/analysis/index.ts` entry addition.
- `ROADMAP.md` — refresh the analysis-tools entry status at plan completion.
- `bundled/coding/skills/fallow/` (delete) — concrete shipped agent procedure removal.
- `package.json`, `bun.lock` — exact provider pin.
- `fallow.toml` — stable `lib/analysis/index.ts` public entry.
- `docs/fallow.md`, `docs/fallow-workflow-integration.md` — provider docs aligned to capability runtime/follow-up boundaries.

## Risks

- **Dirty scope may need adapter composition.** Live probing (2026-07-27) shows `audit --base HEAD` already covers tracked, staged, and untracked files, so B-026 is expected to pass as verification; if a regression ever omits a class, redesign before prompts — incomplete scope is failed-to-run under INV-3.
- **Process termination is platform-sensitive.** B-029's runner tests spawn real short-lived children on all supported platforms (self-signaling, termination-ignoring, nonexistent binary); doubles are reserved for adapter-level tests that inject the runner. Any unclassified termination is failure, never code 0.
- **Analyzer caches violate INV-5.** `--no-cache` and whole-worktree snapshots are mandatory for status and all tools; cleaning files afterward is not acceptable.
- **Provider JSON may drift.** Unknown fields stay native; unclassifiable verdict/finding/error output throws. Live pinned envelopes seed contract fixtures.
- **Generic schema may be provider-shaped.** AC-002 is a precondition: unsupported common fields move under provider tags before implementation.
- **Pi error evidence lives in message content.** Custom Error fields/details are not transport. Canonical JSON message plus real Pi contract test is mandatory.
- **Remediation rerun can observe drift.** The remediator's fresh rerun is ground truth (D-019); a finding that no longer reproduces is reported not-resolved and returns to Quality Manager rather than applying stale advice.
- **Full native payloads are large.** Losslessness outranks token savings here; focused calls and direct/replayed consumption bound the cost. No truncation.
- **Session cache can stale.** Clear on lifecycle reset; no process-global/persisted correctness state.
- **Shared skill visibility must respect filters.** Place only provider-neutral procedure in shared; provider docs remain outside skills.
- **Quality Manager regression surface is large.** Preserve legacy QC rows, universal gates, ledger, local-base logic, migration search, minimal remediation, and round budget through characterization/content tests.
- **V1 is not polyglot routing.** If ratified ACs require simultaneous providers, halt/escalate the open question.
- **Boundary zero is unsafe.** Unbound until rules are proven configured; introspection error is failed, not degraded.
- **Invalid scoped input could widen.** B-027 runtime validation is mandatory even if model/tool schema validation is bypassed on resume/tests.
- **Consent gating adds first-run friction.** A detected provider stays withheld until per-project execution consent is recorded (D-014); status must make the consent path obvious, or users will read withheld as broken.
- **Per-session discovery cost is accepted.** One config read plus ~3 short local subprocess calls, at most once per session at first need; revisit with a validated persisted cache only if chain latency measurably suffers — cross-session caching risks stale bindings (D-006).

## Quality Contract

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | Project-native tests, style, and type/schema checks pass, including real Pi error, signal runner, dirty-scope, and no-write tests | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | Every non-withdrawn B-### entry (B-001–B-037, less withdrawn B-020/B-032) has its named test and exact marker | artifact evidence | hard fail |
| 3 | `mutation` | bindable | unbound | Project-specific mutation evidence | pending | unbound/not enforced; adversarial no-write/error tests and reviewer judgment required |
| 4 | `duplication` | bindable | bound | Changed scope introduces no blocking clone finding | capability resolution | genuine unbound degrades; failed blocks |
| 5 | `complexity` | bindable | bound | No configured changed-scope metric violation; unavailable requested metrics degrade individually | capability resolution | never treat unsupported as zero |
| 6 | `boundary-conformance` | bindable | unbound | Configured zones have no changed-scope violation | pending configuration | unbound until rules; reviewer checks direction; introspection failure blocks |
| 7 | `dead-code` | bindable | bound | No blocking changed-scope reachability/dependency finding and explicit migration searches find no stale references | capability resolution plus explicit search | capability is additive to migration search; failed blocks |

Rows 4, 5, and 7 are bound-by-delivery: their enforcement path is what stages 1–5 plus the engine pin create, so binding state is evaluated at the final ladder run, not before. The `failed blocks` vocabulary lands with the gate-contracts.md amendment in the consumer-rewiring stage, before any ladder consumer relies on it.

## Implementation Order

1. **RED B-029/B-030/B-036 first: prove execution/error/cancellation seams.** Implement/test the signal-aware runner (real short-lived children, timeout escalation per D-023), real Pi error-message behavior, and Pi-signal-to-child abort propagation (D-017). Install the pin and capture live envelopes for every capability — including a dirty audit with tracked/staged/untracked changes and the config exit-code matrix — feeding the AC-002 validation record before the stage-2 schema freeze. If signal death or error evidence remains ambiguous, stop; INV-3 outranks the rest.
2. **RED B-001–B-003/B-011/B-028: contracts, docs skeleton, config, pure resolver.** Validate paper mappings before promoting fields to generic.
3. **RED B-004/B-006–B-012/B-025/B-027/B-033/B-037: provider adapter.** Implement canonical detection, consent-gated introspection (D-014), executable resolution and the version/schema policy (D-015), strict input, unsupported-scope degradation (D-016), no-cache, dry-run, and error classification one behavior at a time, against the stage-1 captured envelopes.
4. **RED B-026: real dirty-scope integration.** Use temp Git fixture with tracked/staged/untracked. If provider is incomplete, amend adapter composition before any consumer prompt changes.
5. **RED B-005/B-034/B-035: Pi composition/status.** All-tools registration, first-need snapshot (D-018), seven-row injection including detected-but-withheld, the consent gate (D-014), failed state, and lifecycle reset. The legacy prose injection is retained until stage 7 deletes it with the Quality Manager rewiring — no silent gate window.
6. **RED B-024: distribute extension/shared skill and delete provider skill.** Test under an explicit project skill filter omitting analysis; run repository-wide shipped generic-content scan.
7. **RED B-013–B-018/B-031: Quality Manager, Verifier, Fixer.** Characterize existing QC/ledger/base/migration behavior, then introduce direct gates, failed/unbound distinction, request-plus-designation remediation routing (D-019), always-on explicit migration searches — and delete the legacy prose injection in this same stage.
8. **RED B-019/B-021–B-023: planning/implementation roles.** Add each marker/test before prompt edits; keep procedures provider-free (B-020 withdrawn — Explorer is not a v1 consumer).
9. **Complete provider/workflow documentation and public entry.** Re-run stale-link/provider-skill scans.
10. **Run full ladder.** Project-native tests/lint/typecheck, artifact conformance, and bound changed-scope gates from explicit base. Mutation/boundaries remain visibly degraded. Ratified collision → halt/escalate; false derived mechanism → amend-on-record before code.

Slice boundaries *(superseded by D-024, 2026-07-29 — the split was taken, so these are no longer candidates)*: stages 1–5 (`analysis-capability-runtime` — ACs 1–8, 11, 12), stages 6–7 (`analysis-gate-rewiring` — AC-009), stage 8 (`analysis-investigation-procedures` — AC-010), stages 9–10 close whichever slice ships last. Each slice is independently valuable and gate-clean; the retained legacy injection bridge makes the seams safe.
