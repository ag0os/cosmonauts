# Lean Coding Domain — Coordinator Brief

**Status:** Design brief, human-ratified direction (2026-09-30). Hand this to a
coordinator agent (Claude Code, Codex or similar) that drives subagents. It is
written to stand alone; the coordinator has not seen the conversation that
produced it.
**Mottos:** *As simple as possible.* *Less is more.*
**Scope:** A new domain built **beside** `bundled/coding/`, not a rewrite of it.
The existing domain stays untouched so the two can be compared on the same
tasks.
**Out of band:** This work is coordinated outside cosmonauts' own plan/task
system. Do not create plans or tasks under `missions/` for it. Use this brief as
the plan.

---

## 1. Why

The coding domain implements the right vision (section 2) but grew a layer of
protocol around every artifact, each layer added after a specific failure.
Measured on `main` at 2026-09-29:

| Surface | Size |
|---|---|
| Agents in `bundled/coding/agents/` | 18 |
| Prompt text, all agents (`bundled/coding/prompts/`) | ~24,100 words |
| Capability text layered on top (`bundled/coding/capabilities/`) | ~2,600 words |
| Artifact contract skill the planner, worker and reviewers must load (`domains/shared/skills/work-artifacts/`) | ~4,400 words |
| Stages in the `plan-and-build` chain | 7, each a fresh ephemeral session at high/xhigh thinking |
| Reviewers spawned per Quality Manager pass | up to 5 |

Most of the worker's ~1,800 words are procedural guards (record the SHA, run the
audit with a literal base, never widen scope, classify deviations through a
four-route protocol, append notes in the right mode, tick criteria through the
right tool per backend). Each guard exists because an earlier model failed at
that point. Today's models and harnesses do most of that unprompted, and the
guards now cost context, latency and attention.

The clearest evidence is the `driver-hardening` plan (archived under
`missions/archive/plans/driver-hardening/`): one day of 23 Drive slices produced
25 coordinator observations, mostly retries caused by the harness's own protocol
defects. Fixing them took a 364-line spec, 23 tasks, six Codex review rounds,
three Claude review rounds and two Quality Manager attempts, with the coordinator
handing off twice at ~45% context. Rounds three to five returned 5, 4 and 3
findings on adjacent edge cases and did not converge; a human capped the loop.
None of it shipped user-facing capability.

**Root cause:** cost scales with the number of *contracts* between the framework
and its agents (outcome grammar, notes mode, per-backend criterion protocol,
commit-policy variants, probe evidence rules). Every contract must be prompted,
parsed, hardened, reviewed and re-reviewed. **The redesign is measured by how
many contracts it deletes.**

## 2. The vision (unchanged)

Four phases, two optional documents, one bounded verification loop.

1. **Planning — the human/system contract.**
   - *Spec*: non-technical, the change from the user's point of view, may carry
     mockups. A PRD in one screen.
   - *Plan*: technical. Approach, touched modules, existing helpers to reuse,
     behaviors (observer, entry point, outcome, inspired by BDD/TDD), risks. One
     screen plus one Mermaid diagram of touched modules and new edges.
   - Both are optional. The lead decides the tier from the size of the request:
     **direct** (no documents), **plan only**, **spec + plan**.
2. **Implementation.** Workers implement against the plan with a shared context
   pack so each does not rebuild context alone. The known failure modes are:
   reimplementing logic that exists, tests coupled to the implementation, tests
   that assert nothing.
3. **Verification.** Only what the earlier phases require: spec outcomes
   observable, plan followed, tests meaningful, checks green. Deterministic
   signals first (graph, static analysis, mutation), one reviewer with lenses
   second, one remediation round, then a human.
4. **Delivery.** A PR whose body carries the plan diagram restyled with
   added/modified/removed nodes and the verification summary.

The system runs anywhere between fully automated (factory mode, human supplies
the spec) and pair mode (human collaborates in the early phases). A senior
developer's knowledge of the codebase (which modules and helpers exist, what to
reuse) is supplied by a maintained, scannable architecture map, not by rules.

## 3. Design principles

1. **Enforcement ladder.** Push every rule to the lowest layer that can enforce
   it: host code > tool permissions > skill loaded on demand > prompt. A prompt
   rule the host could check mechanically is a smell.
2. **One envelope.** Every agent ends its output with one JSON line, one schema,
   three outcomes: `done`, `blocked`, `failed`, with evidence. Backend-neutral.
3. **Workers never touch task state.** No criterion ticking, no notes mode, no
   status edits. The host derives state from the envelope and from checks it
   runs itself.
4. **Commit policy is host configuration.** Workers never see it.
5. **Host-owned verification.** Tests, lint, typecheck, static analysis and
   mutation run by the host after the builder returns. No agent attests that
   checks passed.
6. **Bounded review loop.** One review, one remediation, one re-review, then a
   human. No open-ended external review rounds.
7. **Deterministic first, LLM second.** Graphs and analyzers supply facts;
   models supply judgment and text. Diagrams are views over a JSON graph, never
   the source of truth.
8. **Mottos over rules.** Prompts are persona + intent + what to hand back, under
   400 words, with mottos ("less is more", "keep it simple", "reuse before you
   write"). Procedure lives in skills loaded when relevant.
9. **Keep the good bones.** The sealed-snapshot review idea, Drive's durable run
   machinery, the architecture map, fallow's analyzers, the destructive-git
   guard (`lib/agents/drive-worker-tool-guard.ts`) and "Drive completes task
   status after verifying the report" are all host-level enforcement replacing
   prompt rules. Generalize them; do not rebuild them.

## 4. Target shape

### 4.1 Domain directory

A new installable domain beside `bundled/coding/`. Working name **`lean`**
(directory `bundled/lean/`); the human may rename it (open decision D-1). It is
discovered like any domain: a `domain.ts` exporting a `DomainManifest` (see
`lib/domains/types.ts`), an `agents/` directory of `AgentDefinition` files
(`lib/agents/types.ts`), `prompts/`, `capabilities/`, `skills/`, `chains.ts`,
and a `cosmonauts.json` package manifest mirroring `bundled/coding/cosmonauts.json`.
Read `lib/domains/loader.ts` and `tests/domains/loader.test.ts` before creating
it; the loader scans for `domain.ts` and `agents/*.ts`.

Adding a domain requires **no framework change**. If a framework change turns
out to be necessary, stop and record it as an open decision.

### 4.2 Roles (four, not eighteen)

| Role | Purpose | Tools | Hands back |
|---|---|---|---|
| `lead` | Interactive engineer the human talks to. Decides the tier. Writes spec/plan with the human or alone. Starts chains. Reuse the `cody` persona from `bundled/coding/prompts/cody.md` trimmed to ≤400 words. | `coding` | conversation; envelope when run in a chain |
| `builder` | Implements one plan section (or one direct fix) in one session, test-first against the plan's behaviors. Receives a context pack. | `coding` | diff in the worktree + envelope |
| `reviewer` | One reviewer, lens list as a parameter (`general`, `security`, `performance`, `ux`). Receives the plan, the diff, the blast radius and the verification facts. Produces findings. Never edits. | `readonly` | findings in the envelope |
| `verifier` | Runs commands and reports pass/fail with evidence for explicit claims. Never edits. | `verification` | claims in the envelope |

Prompt budget: **≤400 words each**. Persona, what done looks like, what to hand
back, three mottos. No "Critical Rules" sections. Anything procedural goes into
a skill (`bundled/lean/skills/`) that the role loads when the task calls for it
(TDD, contract templates, git workflow). Model and thinking level are
configuration, not prompt text; start from the same models the coding domain
uses (`bundled/coding/agents/*.ts`).

### 4.3 Chains

```
build:  builder -> reviewer          (lead decides whether a plan exists first)
review: reviewer
```

Plan review is a conversation between the lead and the human, or one
adversarial pass the lead spawns when asked. It is not a mandatory stage.
Remediation after review re-enters `builder` with the findings once, then goes
to the human. Chains are defined in `bundled/lean/chains.ts` (`NamedChain`,
`lib/chains/types.ts`); see `tests/domains/coding-chains.test.ts` for how chains
are tested.

### 4.4 The contract documents

Two templates, shipped as a skill (`bundled/lean/skills/contract/`), each fitting
on one screen. The lead fills them; the human edits them; nothing else parses
them beyond headings.

**Spec** (`spec.md`)
```
# <title>
## Intent        — one paragraph, user's point of view
## Users         — who, and what they do today
## Outcomes      — observable results, bullet list
## Out of scope  — bullet list
## Mockups       — optional links or ASCII/Mermaid
```

**Plan** (`plan.md`)
```
# <title>
## Approach      — one paragraph
## Touches       — modules/files to change, with the reason each is touched
## Reuses        — existing helpers/modules the change must use (from the map)
## Behaviors     — B-1..n: observer / entry point / outcome
## Risks         — bullet list
## Diagram       — one Mermaid graph: touched modules, new edges
```

Tier rule (lives in the lead's prompt in one sentence each): a direct fix touches
one module and needs no design; a plan is needed when more than one module
changes or a new seam is introduced; a spec is needed when user-visible
behavior changes.

### 4.5 The envelope

One JSON line, last non-empty line of every agent's final output:

```json
{"outcome":"done|blocked|failed",
 "summary":"one sentence",
 "evidence":[{"kind":"test|command|file|claim","ref":"tests/x.test.ts:12 or command","result":"pass|fail|n/a","note":"optional"}],
 "findings":[{"id":"F-1","severity":"high|medium|low","file":"path:line","summary":"...","fix":"..."}],
 "touched":["path", "..."],
 "reason":"required when blocked or failed"}
```

`findings` is used by `reviewer`, `evidence` by `verifier` and `builder`,
`touched` by `builder`. Everything else is optional. One parser in
`lib/` (new module, e.g. `lib/envelope/`), one schema (`typebox`, already a
dependency), tests in `tests/envelope/`. It replaces the five grammars the coding
domain uses today (`outcome:` line, `Verdict:` report, `COSMO_PLAN_REVIEW`
JSON line, reviewer `- id:` YAML-ish findings, `Findings addressed:` lists) for
this domain only. Do not modify the existing parsers.

### 4.6 Context pack

Assembled by the host (or the lead) once per plan and given verbatim to every
builder:

1. The plan section (or the direct-fix request).
2. A **repo-map slice**: the existing architecture map
   (`lib/architecture-map/`, generated by `cosmonauts architecture generate`,
   sharded OKF under `memory/architecture/`) reduced to the modules reachable
   from the plan's `Touches` and `Reuses` within a token budget. Rank with
   personalized PageRank biased toward the touch set (the Aider repo-map
   algorithm: definitions and references graph, elided signatures, budget in
   tokens). Text in, text out, harness-agnostic.
3. Repository conventions: `AGENTS.md` and the verification commands.

No task file, no acceptance-criteria checklist, no protocol section.

### 4.7 Host-owned verification

Two mechanisms. Neither appears in a prompt.

**A. Post-edit hook, silent unless broken.** On every file write by `builder`,
run fallow health on that file (`domains/shared/extensions/project-tools/`
already wraps fallow; see `docs/fallow.md` for `fallow health`, cyclomatic ≤20,
cognitive ≤15, CRAP) and inject a finding into the session only when a
*changed* function crosses a threshold relative to the base. Implement as a Pi
extension using the `tool_result` hook (see `domains/shared/skills/pi/SKILL.md`,
"tool_result"). For external harness backends the equivalent is a post-tool
hook; design the check as a CLI so both call the same code.

**B. Completion loop.** When `builder` returns `done`:

1. Run the project's verification commands (tests, lint, typecheck).
2. Fallow health and duplicate detection scoped to the diff, compared to the
   committed baselines in `.fallow-baselines/`.
3. **Blast radius** from the diff: changed modules → dependents → tests that
   cover them (from the architecture map's dependency edges). Run those tests
   explicitly and hand the list to the reviewer.
4. **Plan-versus-actual**: diff the plan's `Touches` against the envelope's
   `touched` and `git diff --name-only`. Unplanned files become a reviewer
   input, not a failure.
5. **Scoped mutation**: mutants generated only inside changed functions, run
   only against the tests in the blast radius. A test that kills no mutants is
   the mechanical signal for "tests that assert nothing".
6. If 1 fails or 5 reports surviving mutants in changed functions, re-enter
   `builder` once with the structured results. Then proceed to `reviewer` with
   all results as facts.

Thresholds are **regression against the base**, never absolute, or legacy code
blocks every task. Complexity is a signal to the reviewer, not a hard gate
(agents split functions to dodge thresholds).

### 4.8 Graph functions (new, small, deterministic)

Two functions, TypeScript, no model calls, built on the existing architecture
map graph:

- `repoMapSlice(touchSet, budgetTokens)` → text (section 4.6).
- `blastRadius(diff)` → `{changed, dependents, tests}` and
  `planVersusActual(plan, diff)` → `{planned, unplanned, untouched}`, both
  renderable as a Mermaid subgraph with `added`, `modified`, `removed`,
  `impacted` classes (section 4.9).

Keep the canonical data as JSON; diagrams are views.

### 4.9 Delivery

The PR body is generated from: the plan's diagram restyled with the change
classes from 4.8, the verification summary (commands, blast-radius tests,
mutation score on changed functions, plan-versus-actual), and the reviewer's
findings with their disposition. GitHub renders Mermaid and the line diff, so
no diff renderer is needed.

### 4.10 Parked: Jev (TypeSafe System One)

A hosted decision model (typed yes/no, choice, score questions with calibrated
probabilities) was evaluated. It is **not in scope for v1**. If added later, it
plugs in as an optional capability binding with `unbound` / `unsupported` /
`failed` states, gated by project config (data leaves the machine), for exactly
two uses: reviewer lens selection from the diff, and triage of reviewer findings
(severity calibration, dedupe, "introduced in diff"). It never flips a verdict.

## 5. Existing assets: reuse, and do not touch

**Reuse (read before building):**
- `lib/architecture-map/` — TypeScript compiler-API analyzer, dependency spine,
  public exports, cache-on-hash freshness, narrative shards. Design doc:
  `missions/architecture/code-structure-map.md`.
- `domains/shared/extensions/project-tools/` — fallow provider and analysis
  tools (`analysis_status`, `analysis_audit`, health, dupes, dead-code,
  boundaries). Docs: `docs/fallow.md`, `docs/analysis-capabilities.md`.
- `lib/agents/drive-worker-tool-guard.ts` — `isDestructiveGitCommand`.
- `lib/driver/` — Drive run machinery (worktrees, snapshots, postflight). The
  lean domain's completion loop should be expressible as a Drive postflight;
  confirm with `lib/driver/README.md` before designing a parallel mechanism.
- `domains/shared/skills/pi/SKILL.md` — Pi extension API (hooks, tools).
- `bundled/coding/prompts/cody.md` — the persona to trim for `lead`.
- `bundled/coding/skills/tdd/`, `git-workflow/`, `languages/` — skills the lean
  roles can load unchanged (skills are resolved by name; check whether a domain
  can reference another bundled domain's skills or whether they must be copied
  or moved to `domains/shared/skills/`; record the answer).

**Do not touch:**
- `bundled/coding/` (the comparison baseline).
- `lib/orchestration/quality-review-*.ts` and the existing report parsers.
- `missions/`, `memory/`, `knowledge/` content, except this brief and the
  evaluation report in section 7.

## 6. Work packages

Each package lists its deliverable, acceptance, and the files it owns.
Subagents work in separate worktrees; the coordinator merges. Repository rules
apply to every package (section 8).

**WP0 — Baseline measurement** *(no dependencies; start first)*
- Pick three real tasks from recent history: one direct fix, one feature, one
  refactor (candidates: look at `missions/archive/tasks/` and recent commits).
- Add stage timing and token accounting to chain runs if absent
  (`lib/orchestration/`, chain stats are described in `docs/orchestration.md`);
  keep the change additive and behind the existing stats surface.
- Run the three tasks through the current coding domain; record wall time,
  tokens, and defects caught. Output: `missions/reviews/lean-baseline.md`.
- Acceptance: numbers for all three tasks, reproducible commands.

**WP1 — Domain skeleton** *(depends on nothing; parallel with WP0)*
- `bundled/lean/domain.ts`, `cosmonauts.json`, `chains.ts`, four agent
  definitions, four prompts ≤400 words, `capabilities/` (only what a prompt
  cannot say in one line), `skills/contract/` with the two templates from 4.4.
- Tests in `tests/domains/lean-*.test.ts`: loader discovers the domain, every
  agent validates, prompt word counts stay under 400, chains resolve.
- Acceptance: `bun run test`, `bun run lint`, `bun run typecheck` green; the
  domain lists in the CLI alongside `coding`.

**WP2 — Envelope** *(depends on nothing)*
- `lib/envelope/`: typebox schema, parser (last non-empty JSON line, tolerant
  of fenced output), renderer for humans, tests in `tests/envelope/`.
- Acceptance: parses every example in 4.5, rejects malformed input with a
  reason, 100% of branches covered by tests.

**WP3 — Context pack and repo-map slice** *(depends on WP1 for the builder
prompt shape; can start on the slice immediately)*
- `repoMapSlice` over the architecture map graph with personalized PageRank
  and a token budget; a CLI entry (`cosmonauts architecture slice --touch ...`
  or similar, follow existing CLI patterns in `cli/`); the pack assembler.
- Acceptance: on this repository, a slice for `lib/driver/run-one-task.ts`
  under 1,500 tokens lists its direct dependencies and dependents with
  signatures; tests use fixtures, not the live repo.

**WP4 — Verification loop** *(depends on WP2 for results shape; the mutation
spike can start immediately)*
- 4a. **Mutation spike first.** Try Stryker (`@stryker-mutator/core` with the
  Vitest runner) restricted to changed functions and blast-radius tests.
  Measure wall time on the three WP0 tasks. If Stryker cannot be scoped or is
  too slow, design a minimal custom mutator (operator swaps, condition
  negation, return-value replacement) using throwaway worktrees as in
  `missions/archive/plans/framework-health/stage2-probes.md`. Report before
  building further.
- 4b. Post-edit hook extension (`bundled/lean/extensions/health-hook/`) calling
  a shared CLI check.
- 4c. Completion loop: verification commands, scoped fallow, blast radius,
  plan-versus-actual, scoped mutation, one re-entry. Prefer expressing it as a
  Drive postflight; otherwise a small runner in `lib/` used by the chain.
- Acceptance: on a deliberately broken builder output (test asserting nothing,
  unplanned file, complexity regression) the loop reports each signal and
  re-enters once; on clean output it is silent.

**WP5 — Graph functions and delivery** *(depends on WP3 for the graph access,
WP4 for verification facts)*
- `blastRadius`, `planVersusActual`, Mermaid rendering with change classes, PR
  body generator.
- Acceptance: for a sample diff in tests, the Mermaid output is deterministic
  and renders on GitHub (validate with the Mermaid CLI or a parser).

**WP6 — Evaluation** *(depends on all)*
- Run the three WP0 tasks through the lean domain. Compare wall time, tokens,
  defects caught, and count of contracts (grammars, protocol sections, prompt
  words). Output: `missions/reviews/lean-evaluation.md` with a recommendation.
- Acceptance: the report answers "should lean replace coding as default" with
  evidence, and lists what lean lost, if anything.

Parallelism: WP0, WP1, WP2 and the WP4a spike start together. WP3 and WP4b/4c
follow. WP5 after WP3 and WP4. WP6 last.

## 7. Non-goals (deferred, on purpose)

- A live plan-over-architecture dashboard (agents as cursors on the graph).
- LikeC4 or any second architecture model; drift is already checked by fallow
  boundaries.
- tree-sitter / polyglot analysis; TypeScript only for now.
- Jev or any hosted judgment model (4.10).
- Migrating or deleting `bundled/coding/`.
- Any change to the memory/knowledge subsystems.

## 8. Repository rules the coordinator must enforce

From `AGENTS.md`, restated for subagents:

- ESM, `import type` for types, `.ts` extensions in relative imports, `interface`
  for shapes, `as const` over enums, `unknown` over `any`, options objects for
  3+ parameters, small functions.
- Tests in `tests/` mirroring source; one concept per test; temp dirs for
  filesystem tests, cleaned in `afterEach`. Testing standards: `docs/testing.md`.
- Verify every package with `bun run test`, `bun run lint`, `bun run typecheck`.
- Changed-scope analysis uses the committed fallow baselines in
  `.fallow-baselines/`. Refresh only with
  `bun run refresh:fallow-baselines -- --base <revision> --reason '<reason>' --category <dead-code|health|dupes>`.
- New suppressions need a human-listed exception in
  `.cosmonauts/suppression-exceptions.json`; check with
  `bun run check:suppressions -- --base <revision>`.
- Pi packages stay in lockstep at one version; do not bump them here.
- Commit per work package, imperative subject under 72 characters, body says
  what and why. Branch: whatever the human designates; never push elsewhere.

## 9. Open decisions for the human

- **D-1** Domain name: `lean`, `coding-lite`, or something else.
- **D-2** Mutation runner: Stryker if it scopes and runs in minutes; custom
  mutator otherwise. Decide after WP4a's report.
- **D-3** Whether `builder` runs first on Pi (in-process) or on an external
  harness backend (Claude Code / Codex via Drive). Recommendation: Pi first for
  the hook; external second.
- **D-4** Thresholds for the completion loop (which signals re-enter the
  builder, which only inform the reviewer). Start: failing tests and surviving
  mutants re-enter; everything else informs.
- **D-5** Whether shared skills used by both domains move to
  `domains/shared/skills/` or are referenced across bundled domains.

## 10. Sources

- The Excalidraw vision (four phases, human/system contract, mottos), 2026-09-30.
- `missions/archive/plans/driver-hardening/` and
  `missions/reviews/improvements/project-health-audit.md` — the cost evidence.
- "Codebase Visual Feedback for AI Coding Agents: 2026 Landscape Scan" (human
  upload, not in the repo). Conclusions carried here: dependency graph as
  canonical JSON, Aider-style PageRank repo map, blast radius from diffs
  (code-review-graph), Mermaid as the rendering lingua franca, deterministic
  first / LLM second. Licensing note if code is ever pulled in: GitNexus is
  PolyForm Noncommercial, Claude Squad is AGPL; dependency-cruiser, Mermaid,
  code-review-graph and Understand-Anything are MIT.
- `docs/fallow.md`, `docs/analysis-capabilities.md`,
  `missions/architecture/code-structure-map.md`, `domains/shared/skills/pi/SKILL.md`.
