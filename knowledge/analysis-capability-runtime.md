---
type: decision
title: Analysis capability runtime
description: Archived plan distillation for analysis-capability-runtime.
resource: knowledge/analysis-capability-runtime.md
tags:
  - 'plan:analysis-capability-runtime'
  - 'source:legacy-distillation'
timestamp: '2026-07-30T00:00:00.000Z'
scope: project
kind: semantic
writer: knowledge-surface-migration
source: memory/analysis-capability-runtime.md
date: '2026-08-20T17:05:15.000Z'
legacySource: archive
legacyPlan: analysis-capability-runtime
legacyDistilledAt: '2026-07-30T00:00:00.000Z'
legacySourceSha256: 59e11747e730fb73d8807f55ee79792a3b111af940069ccffe6f293a653d26ae
---

# Analysis capability runtime

## What Was Built

Slice 1 of 3 of the ratified `analysis-capabilities` design: a
provider-agnostic structural-analysis runtime. `lib/analysis/` owns the stable
contract (seven capabilities, discriminated scopes/results/bindings) and a pure
binding resolver; `domains/shared/extensions/project-tools/` owns detection, an
execution-consent gate, a signal-aware process runner, a Fallow adapter, and
eight registered Pi tools. Fallow is pinned at exactly 2.54.2 and resolved as a
platform-native binary. No consumer was rewired — the legacy "Detected Analysis
Tools" prose injection is retained deliberately, and `analysis-gate-rewiring`
deletes it in the same stage it swaps its consumers.

## Key Decisions

- **D-024 (ratified) — three-way split.** The parent plan's 35 active behaviors
  were ~3x the task guidance. Split at its own marked slice boundaries into
  runtime / gate-rewiring / investigation-procedures. Acceptance criteria could
  not be partitioned (B-024 alone sources AC-009, AC-010, AC-012), so every
  slice carries the ratified Intent, the full AC list, and the complete
  Decision Log **verbatim**. The retained legacy injection is what makes the
  seams safe.
- **D-013 (ratified) — verdict discriminated by result kind.** Analysis kinds
  carry a real verdict; `trace` and `fix-preview` carry `"not-applicable"`. The
  literal-universal-verdict reading had no non-destructive implementation:
  either fabricate meaning the provider never asserted (INV-3 violation) or
  throw on every successful call to two required capabilities.
- **D-025 (ratified) — sandboxing deferred.** A worker amended the plan to
  require an OS sandbox (`sandbox-exec`/`bwrap`) failing closed when absent. It
  had no Windows branch and bubblewrap is not default on many distros, so every
  capability became uncallable there — narrowing ratified AC-003/AC-011. Human
  chose deferral; D-012 stands as the INV-5 mechanism on top of D-014 consent.
- **D-026 — disclose provenance instead of detecting wrappers.** Reliably
  detecting a signal-swallowing wrapper from executable contents is unsound.
  Status reports *how* the executable resolved; the plan states the guarantee's
  boundary. Operator-configured and test-injected paths are declared trust.
- **D-027 — one synchronous combined pre-spawn validation.** See the ordering
  constraint under Gotchas. Prepare everything, then read consent and capture
  executable identity in a single event-loop turn, then spawn. Honest about the
  residual: no `fexecve` in Node, so this is not OS-atomic.
- **D-028 — fail closed on unverified Windows tree termination.** Only
  `taskkill /T` exit 0 establishes termination. Job Objects deferred, citing
  D-025 as precedent against letting a mechanism outgrow the reviewed slice.

## Patterns Established

- **Encode ratified contracts as types, not conventions.** D-013 became
  `AnalysisTraceResult … Verdict = "not-applicable"` as a literal type, so
  fabricating a verdict is a compile error. Cheaper and stronger than a test.
- **Reconcile against complete evidence; derive the verdict from the filtered
  subset.** Two different questions — "is the provider's output internally
  consistent" and "what is the verdict for the requested metric" — must not
  share one comparison. Collapsing them made a CRAP-only project throw
  `invalid-output` for a `cyclomatic` request.
- **Make a negative test non-vacuous with a paired positive.** The consent test
  asserts a sentinel file is absent (zero spawns) *and* that it appears once
  consent is granted, proving the sentinel would have caught a spawn.
- **Extract platform-specific decisions into exported pure classifiers.** When
  a guarantee can't be exercised on the host, make the decision unit-testable
  with injected inputs (`classifyTaskkillExitCode(128)`) rather than asserting
  it works and moving on.
- **Disclosure over unsound detection.** When a property cannot be verified
  reliably, surface provenance and record the boundary; don't ship a partial
  check that implies a guarantee.

- **Subprocess runners preserve termination evidence (from analysis-capabilities).** The shell-free runner's outcome type distinguishes numeric exit, signal termination, spawn failure, cancellation, and timeout; the host tool's cancellation signal propagates through every adapter layer; every invocation carries a finite timeout with graceful-then-force-kill retaining the initiating reason. Only explicitly documented exit codes plus classifiable output may become completed analysis — null or signal exits never become success.
- **Detection is not permission (from analysis-capabilities).** File-based detection and executable introspection are separate acts: a repository-controlled binary must not run until per-project execution consent is recorded *outside* that repository — implicit trust in unrelated project resources is insufficient. Without consent, status names the detected provider and explains that execution is withheld while spawning zero subprocesses. Shell-free invocation and read-only flags constrain a legitimate binary; they do nothing for a replaced one.

## Files Changed

- `lib/analysis/{types,binding-resolver,index}.ts` (new) — the stable contract;
  imports neither Pi nor provider code.
- `domains/shared/extensions/project-tools/{fallow-provider,process-runner,analysis-consent,analysis-provider-error}.ts` (new)
  plus `index.ts` — detection, consent gate, runner, adapter, tool registration.
- `lib/config/{types,loader,index}.ts` — optional `analysis.provider` preference.
- `package.json`/`bun.lock` — exact `fallow` 2.54.2 devDependency pin.
- `docs/analysis-capabilities.md`, `docs/analysis-provider-validation.md` (new);
  `docs/fallow*.md` aligned; `fallow.toml` public entry.
- `tests/analysis/`, `tests/extensions/project-tools*`, `tests/pi-contract/` —
  23 behavior proofs plus captured 2.54.2 envelope fixtures.

## Gotchas & Lessons

- **`node_modules/.bin/<tool>` may be a Node shim that converts a crash into
  success.** Fallow's shim is `execFileSync` wrapped in
  `catch (e) { if (e.status !== undefined) process.exit(e.status) }`. On signal
  death Node sets `e.status = null`, and `null !== undefined`, so it exits
  **0** — with the analyzer's JSON already on stdout. A crashed analyzer read as
  a clean pass. This is the same defect D-008 rejected `pi.exec` for
  (`code ?? 0`), reintroduced one layer down by the resolution target. Resolve
  the platform package's native binary (`@fallow-cli/<platform>/fallow`) and
  cross-validate its version against the parent package. **No gate catches
  this** — only reading the resolved file does.
- **Two independent async preconditions plus a path-based spawn cannot both be
  last.** Consent-last leaves executable identity stale; identity-last leaves
  consent stale. Two review rounds each "fixed" one and reopened the other.
  Reordering is never the fix — combine them into one synchronous check and
  document the residual. Same shape as the episodic-log lesson that three
  terminal-ordering wants were unsatisfiable with one completion write.
- **Review fixes introduce regressions; re-review is not optional.** Rounds 2
  and 3 each found a defect created by the previous round's fix. The loop ran
  QM(6) → codex 6 → 3 → 2 → 1 → 0 before SHIP.
- **A test rewritten to expect the wrong behavior is drift, not evidence.** The
  contradiction-reconciliation fix came with a test asserting
  `rejects … invalid-output` for a legitimate case. Correct the assertion
  *together with* the behavior and say so.
- **The QM panel still overwrites `missions/reviews/review-round-N.md` from
  other plans.** It clobbered `planning-system-hardening`'s committed artifacts
  again. Copy the reports somewhere plan-scoped, then `git checkout --` the
  originals.
- **The QM auto-creates its own remediation tasks.** Drive resolves by plan
  label and will run yours *and* its near-duplicates over the same files. Check
  `task list` before creating remediation tasks.
- **Drive may ignore SIGTERM to the pid in `run.pid`.** A run "stopped" that way
  continued through several more tasks. Verify with `run status` before assuming
  it halted.
- **Running the full suite while Drive is active fails unrelated tests.**
  `tests/driver/*` and `tests/extensions/orchestration-driver-tool.test.ts`
  failed three times only under concurrent Drive activity, byte-identical to
  main and green in isolation. Check `git diff main..HEAD -- <path>` before
  attributing.
- **The pin is a major version behind.** npm `fallow` is at 3.10.0; the
  validated engine is 2.54.2. D-015's version/schema drift policy covers it —
  binding surfaces the detected version and an out-of-contract `schema_version`
  is a failure — but an upgrade needs re-validated envelope fixtures.
