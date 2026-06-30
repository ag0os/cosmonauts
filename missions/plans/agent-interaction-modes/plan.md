---
title: 'Agent Interaction Modes: Auto vs Interactive Behavioral Overlay'
status: draft
createdAt: '2026-06-25T12:57:29.000Z'
updatedAt: '2026-06-25T12:57:29.000Z'
---

## Overview

Give agents a selectable **interaction mode** — a cross-cutting behavioral
stance, separate from identity and capabilities — controlling how autonomously
they act:

- **`auto`** — the agent decides and proceeds, leaning on embedded knowledge
  (skills, memory, capabilities). It surfaces choices only when a decision is
  genuinely ambiguous or irreversible/destructive. Reports what it decided, not
  the menu it chose from.
- **`interactive`** — the agent collaborates. At meaningful decision points it
  presents 2-3 options with trade-offs and a recommendation, then lets the user
  steer before committing. Strongest effect on plan- and design-producing
  agents (planner, cosmo, cody).

A mode is a **behavioral overlay**, not a capability (Layer 1, domain knowledge)
or a persona (Layer 2, identity). It maps onto a new prompt layer assembled by
`lib/domains/prompt-assembly.ts`, exactly parallel to the existing sub-agent
runtime overlay (Layer 3). Selection is declarative-with-overrides: a per-agent
default in `AgentDefinition`, overridable by a CLI flag, project config, and a
live `/mode` slash command; detached/sub-agent runs are pinned to `auto`.

**Naming note (Pi-First):** Pi already uses "mode" for execution *transports*
(`InteractiveMode` / `PrintMode` / `RPCMode`) and `RuntimeContext.mode` already
means `top-level | sub-agent`. To avoid collision we name this axis
**`interactionMode`** with values `auto | interactive`. Pi provides nothing for
autonomy stance, so this is a Cosmonauts-level prompt overlay (no Pi change).

**Future extension (out of scope):** a middle `checkpoint` mode (decide alone
but pause at major/irreversible forks). The design keeps `interactionMode` a
small open string union so a third value is additive — a new `modes/checkpoint.md`
file plus one union member, no structural change.

## Architecture Context

This plan operates entirely within the established **four-layer prompt
composition** (`docs/prompts.md`):

```
Layer 0  lib/prompts/framework/base.md            (always)
Layer 1  {domain}/capabilities/{cap}.md           (declared capabilities)
Layer 2  {domain}/prompts/{agent-id}.md           (persona)
Layer 2.5  lib/prompts/framework/modes/{mode}.md  (NEW — interaction overlay)
Layer 3  lib/prompts/framework/runtime/sub-agent.md (sub-agent only)
```

The mode overlay sits **after the persona** (recency weight: a mode is a strong
behavioral default the persona's own rules may still refine) and **before** the
sub-agent runtime overlay. No durable architecture-of-record change; this is an
additive layer plus a declarative field.

## Behaviors

### B-001 - Auto mode injects the auto overlay after the persona

- Source: AC-001
- Context: a top-level session is assembled for an agent with `interactionMode: "auto"`
- Action: `assemblePrompts` runs with the interaction mode supplied
- Expected: the assembled prompt contains the contents of `lib/prompts/framework/modes/auto.md`, positioned after the Layer 2 persona and before any Layer 3 sub-agent overlay
- Seam: `lib/domains/prompt-assembly.ts` `assemblePrompts` (new mode layer)
- Test: `tests/domains/prompt-assembly.test.ts` > `injects the auto mode overlay after the persona`
- Marker: `@cosmo-behavior plan:agent-interaction-modes#B-001`

### B-002 - Interactive mode injects the interactive overlay

- Source: AC-001
- Context: a top-level session is assembled with `interactionMode: "interactive"`
- Action: `assemblePrompts` runs with the interaction mode supplied
- Expected: the assembled prompt contains the contents of `lib/prompts/framework/modes/interactive.md` in the Layer 2.5 position
- Seam: `lib/domains/prompt-assembly.ts` `assemblePrompts`
- Test: `tests/domains/prompt-assembly.test.ts` > `injects the interactive mode overlay after the persona`
- Marker: `@cosmo-behavior plan:agent-interaction-modes#B-002`

### B-003 - Omitting interaction mode preserves current prompts

- Source: AC-002
- Context: an existing caller assembles a prompt without specifying an interaction mode
- Action: `assemblePrompts` runs with `interactionMode` undefined
- Expected: no mode overlay is added; the assembled prompt is byte-identical to today's output (backward compatible)
- Seam: `lib/domains/prompt-assembly.ts` `assemblePrompts`
- Test: `tests/domains/prompt-assembly.test.ts` > `omits the mode overlay when no interaction mode is given`
- Marker: `@cosmo-behavior plan:agent-interaction-modes#B-003`

### B-004 - Resolution precedence: override beats agent default beats fallback

- Source: AC-003
- Context: `buildSessionParams` resolves the effective interaction mode for a session
- Action: it is given combinations of explicit override, agent `defaultMode`, and neither
- Expected: explicit override wins; otherwise `def.defaultMode`; otherwise the `auto` fallback
- Seam: `lib/agents/session-assembly.ts` `buildSessionParams` (mode resolution)
- Test: `tests/agents/session-assembly.test.ts` > `resolves interaction mode by override then default then auto fallback`
- Marker: `@cosmo-behavior plan:agent-interaction-modes#B-004`

### B-005 - Planner-class agents default to interactive

- Source: AC-004
- Context: a planner / tdd-planner / adaptation-planner / cosmo / cody definition is loaded
- Action: its `defaultMode` is read
- Expected: it equals `"interactive"`; execution-class agents (worker, fixer, etc.) resolve to `"auto"`
- Seam: `domains/*/agents/*.ts` and `bundled/coding/agents/*.ts` definitions
- Test: `tests/domains/coding-agents.test.ts` > `planner-class agents default to interactive mode`
- Marker: `@cosmo-behavior plan:agent-interaction-modes#B-005`

### B-006 - Detached and sub-agent runs are pinned to auto

- Source: AC-005
- Context: the orchestration session factory builds a session for a sub-agent or detached driver run
- Action: it resolves interaction mode regardless of the agent's `defaultMode`
- Expected: the effective mode is `auto` (no human channel to collaborate over), even when the agent's `defaultMode` is `interactive`
- Seam: `lib/orchestration/session-factory.ts` (force-auto for non-top-level)
- Test: `tests/orchestration/session-factory.test.ts` > `pins interaction mode to auto for sub-agent sessions`
- Marker: `@cosmo-behavior plan:agent-interaction-modes#B-006`

### B-007 - `/mode` slash command toggles the live session

- Source: AC-006
- Context: a user runs `/mode interactive` (or `/mode auto`) in an interactive CLI session
- Action: the command resolves and re-assembles the active session's system prompt with the new interaction mode
- Expected: subsequent turns use the new mode overlay; an invalid argument reports the valid values without changing mode
- Seam: `domains/shared/extensions/agent-switch/index.ts` (new `mode` command) — registered via `pi.registerCommand`
- Test: `tests/extensions/agent-switch.test.ts` > `/mode command switches the session interaction mode`
- Marker: `@cosmo-behavior plan:agent-interaction-modes#B-007`

### B-008 - `--mode` CLI flag seeds the launch interaction mode

- Source: AC-006
- Context: a session is launched with `cosmonauts -a <agent> --mode interactive`
- Action: CLI session creation reads the flag
- Expected: it is passed as the override into `buildSessionParams`, taking precedence over the agent default; absent flag falls through to the default
- Seam: `cli/session.ts` (flag plumbing into `buildSessionParams`)
- Test: `tests/cli/session-mode.test.ts` > `--mode flag overrides the agent default interaction mode`
- Marker: `@cosmo-behavior plan:agent-interaction-modes#B-008`

### B-009 - Interactive mode gives role collaboration skills a deterministic trigger

- Source: AC-007
- Context: a planner runs in `interactive` mode (overlay present); the
  `design-dialogue` skill currently self-detects whether to engage via runtime
  heuristics ("main agent in a REPL with no chain-stage parent")
- Action: the interactive overlay names the role's collaboration skill as the
  authoritative engage signal, and `design-dialogue` keys off the explicit mode
- Expected: in interactive mode the dialogue skill engages; in auto mode it does
  not; the decision no longer depends on inferring parent/REPL shape
- Seam: `lib/prompts/framework/modes/interactive.md` + `bundled/coding/skills/design-dialogue/SKILL.md` ("When to load")
- Test: `tests/prompts/interactive-overlay.test.ts` > `interactive overlay points at the role collaboration skill`
- Marker: `@cosmo-behavior plan:agent-interaction-modes#B-009`

## Design

The design is derived from the behaviors above; each piece exists to satisfy a
named seam.

### 1. Mode overlay prompt files (B-001, B-002)

Two new files under `lib/prompts/framework/modes/`:

- `auto.md` — directive: decide and proceed; default from embedded knowledge;
  surface only ambiguous or irreversible decisions; report decisions, not menus.
- `interactive.md` — directive: collaborate; present 2-3 options with trade-offs
  and a recommendation at each meaningful fork; let the user steer before
  committing; build the result in passes rather than dropping a finished
  artifact for terminal approval. **It triggers, but does not duplicate, a
  role's collaboration skill** — "if your role has a collaboration skill
  (planners: `/skill:design-dialogue`), load it and follow its cadence." The
  cadence content stays in the skill; the overlay is the switch.

They live under `lib/prompts/framework/` (framework overlays), not under a
domain `prompts/` directory (personas only) — consistent with the Layer 0 /
Layer 3 placement rule in `docs/prompts.md`. The overlays are short and
agent-agnostic: personas are **not** rewritten per mode (see §8) — the same few
lines apply to every agent, and role-specific cadence is carried by skills.

### 2. `assemblePrompts` mode layer (B-001, B-002, B-003)

Extend `AssemblePromptsOptions` and `RuntimeContext` with an optional
`interactionMode?: InteractionMode`. After pushing the Layer 2 persona and
before the Layer 3 sub-agent block, conditionally load and push
`join(frameworkPromptsDir, "modes", "${mode}.md")` — only when
`interactionMode` is defined (preserving B-003 backward compatibility). Reuse
`loadPromptFile` (frontmatter-stripped) exactly like the other layers.

`InteractionMode` is a new exported type: `type InteractionMode = "auto" | "interactive"`
(open to a future `"checkpoint"`), declared in `lib/agents/types.ts` and
imported where needed.

### 3. Resolution in `buildSessionParams` (B-004)

Add `interactionModeOverride?: InteractionMode` to `BuildSessionParamsOptions`.
Resolve `interactionMode = interactionModeOverride ?? def.defaultMode ?? "auto"`,
mirroring the existing `modelOverride ?? def.model ?? FALLBACK_MODEL` and
`thinkingLevelOverride ?? def.thinkingLevel` patterns already in the file. Pass
the resolved value into the `assemblePrompts` call (folding into the existing
`runtimeContext` it already forwards).

### 4. `AgentDefinition.defaultMode` (B-005)

Add `readonly defaultMode?: InteractionMode` to `AgentDefinition`. Set
`defaultMode: "interactive"` on planner, tdd-planner, adaptation-planner, cosmo,
and cody. Leave execution agents unset (they resolve to `auto`). This keeps the
correct behavior out-of-the-box and makes overrides the exception.

### 5. Force-auto for non-interactive runs (B-006)

`lib/orchestration/session-factory.ts` already special-cases
`runtimeContext.mode === "sub-agent"`. In the same place, set
`interactionModeOverride: "auto"` for sub-agent sessions and detached driver
runs, so a planner spawned headless never blocks waiting for input that cannot
arrive. Top-level interactive sessions (created via `cli/session.ts`) are the
only place `interactive` can take effect.

### 6. `/mode` live toggle (B-007)

Add a `mode` command in the existing `agent-switch` extension (which already
owns `/agent` and `/handoff` and knows how to re-assemble and replace the active
session). `/mode <auto|interactive>` re-runs the session build with the new
`interactionModeOverride` and swaps the session, reusing the same
replace-session path `/agent` uses. Invalid argument → usage message, no change.
A completions handler offers `auto` / `interactive`.

### 7. `--mode` CLI flag (B-008)

Add a `--mode` option to the CLI entry that creates sessions, threaded into the
`buildSessionParams({ interactionModeOverride })` call in `cli/session.ts`.

### 8. Persona / skill reconciliation (B-009) — personas are not rewritten per mode

The planner persona (`bundled/coding/prompts/planner.md`) **already** speaks both
stances — "In interactive mode, make sure the human has the complete picture…
In autonomous mode, apply the same discipline… document the trade-off in the
Decision Log" (persona line 22), and "interactive: ask and record the choice;
autonomous: record a planner-proposed decision… flag it in Assumptions" (line
73). Today nothing *sets* that stance: the agent infers it. The `design-dialogue`
skill detects interactivity heuristically — "you are the main agent in a REPL
with no chain-stage parent… if you cannot confirm at least one of these signals,
stay autonomous."

The overlay turns that inference into a fact. So this plan **does not** add
per-mode persona variants. Instead:

- **`design-dialogue` keys off the explicit mode.** Replace its heuristic
  "When to load" signals with: load when `interactionMode` is `interactive`
  (the overlay names the skill); otherwise stay autonomous. Keep one heuristic
  fallback for older callers that pass no mode (defaults to `auto`), preserving
  current behavior.
- **Reconcile the "mode" word in the persona.** The planner's `## Modes` section
  uses "mode" for *routing* (workflow-tier / adaptation / dialogic). "Dialogic"
  is the same concept as `interactionMode: interactive`. Fold the dialogic
  routing note into a reference to the interaction overlay so one persona does
  not carry two unrelated meanings of "mode". The scattered "in interactive /
  in autonomous mode" conditionals stay — they now resolve deterministically.

Net persona change is *subtractive* (trim heuristics, disambiguate one word),
not a rewrite. This is the whole point of an overlay: behavior shifts via a
shared layer, not by forking every persona.

## Files to Change

### New files

- `lib/prompts/framework/modes/auto.md` — auto-mode behavioral overlay
- `lib/prompts/framework/modes/interactive.md` — interactive-mode behavioral overlay
- `tests/cli/session-mode.test.ts` — CLI `--mode` flag plumbing (B-008)
- `tests/orchestration/session-factory.test.ts` — force-auto behavior (B-006) *(extend if file already exists)*
- `tests/prompts/interactive-overlay.test.ts` — overlay names the role collaboration skill (B-009)

### Modifications

- `lib/agents/types.ts` — add `InteractionMode` type and `AgentDefinition.defaultMode`
- `lib/domains/prompt-assembly.ts` — `interactionMode` in options + `RuntimeContext`; inject Layer 2.5 mode overlay
- `lib/agents/session-assembly.ts` — `interactionModeOverride` option + precedence resolution; pass to `assemblePrompts`
- `lib/orchestration/session-factory.ts` — pin `interactionModeOverride: "auto"` for sub-agent/detached sessions
- `cli/session.ts` — `--mode` flag plumbing into `buildSessionParams`
- `domains/shared/extensions/agent-switch/index.ts` — register `/mode` command + completions
- `domains/main/agents/cosmo.ts` — `defaultMode: "interactive"`
- `bundled/coding/agents/cody.ts` — `defaultMode: "interactive"`
- `bundled/coding/agents/planner.ts`, `tdd-planner.ts`, `adaptation-planner.ts` — `defaultMode: "interactive"` *(confirm exact paths during impl)*
- `bundled/coding/skills/design-dialogue/SKILL.md` — key "When to load" off explicit `interactionMode`; keep an `auto` fallback for mode-less callers (B-009)
- `bundled/coding/prompts/planner.md` — reconcile the `## Modes` "dialogic" routing note with the interaction overlay; trim now-redundant heuristic detection (§8)
- `docs/prompts.md` — document the Layer 2.5 interaction overlay
- `tests/domains/prompt-assembly.test.ts` — B-001/B-002/B-003
- `tests/agents/session-assembly.test.ts` — B-004
- `tests/domains/coding-agents.test.ts` — B-005
- `tests/extensions/agent-switch.test.ts` — B-007

## Risks

1. **Detached runs hang on interactive mode.** If force-auto (B-006) is missed,
   a planner with `defaultMode: "interactive"` spawned in a chain/Drive run waits
   for input that never comes. Mitigation: `auto` is the hard fallback; B-006 is
   a required gate; sub-agent path already branches in session-factory, so the
   override lands in code that's already exercised by tests. **Abort condition:**
   if any non-top-level path can reach `interactive`, stop and fix before merge.
2. **Naming collision with Pi's `mode` and the existing `RuntimeContext.mode`.**
   Mitigation: distinct field name `interactionMode`; documented in the Overview.
   Do not overload `RuntimeContext.mode`. Also reconcile the planner persona's
   `## Modes` section so "mode" does not mean both routing and stance (§8).
6. **Overlay/skill duplication or contradiction.** If the interactive overlay
   restates dialogue cadence that `design-dialogue` also owns, the two can drift.
   Mitigation: the overlay only *triggers* the skill (B-009); cadence content
   lives in exactly one place — the skill. **Pivot:** if a role has no
   collaboration skill, the overlay's generic 2-3-options directive stands alone.
3. **Behavioral, not mechanical.** Mode is prompt text; effect depends on model
   interpretation. Mitigation: tests assert overlay *presence/position*, not model
   behavior; keep overlay copy concrete and imperative; iterate copy after dogfooding.
4. **Live-toggle session replacement.** Re-assembling mid-session must preserve
   conversation/history the way `/agent` does. Mitigation: reuse the existing
   replace-session path rather than inventing a new one; if that path cannot carry
   history cleanly, **pivot** to a lighter injected system-message toggle and note it.

## Quality Contract

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | Project-native checks pass (`test`, `lint`, `typecheck`) | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | behavior-spine mechanical checks pass for B-001..B-008 | artifact evidence | hard fail |
| 3 | `regression` | bindable | bound | existing prompt-assembly / session-assembly suites stay green (B-003 backward compat) | project-discovered | hard fail |

## Implementation Order

1. **Types + overlay files (no wiring).** Add `InteractionMode` and
   `defaultMode` to `lib/agents/types.ts`; write `modes/auto.md` and
   `modes/interactive.md`. Pure additions, no behavior change yet.
2. **Prompt assembly layer (B-001, B-002, B-003).** Inject the Layer 2.5 overlay
   in `prompt-assembly.ts`; tests first. This is the core seam; everything else
   feeds it. If injecting here proves to entangle with the sub-agent block,
   reconsider layer ordering before proceeding.
3. **Resolution (B-004).** Add `interactionModeOverride` + precedence to
   `buildSessionParams`.
4. **Agent defaults (B-005).** Set `defaultMode: "interactive"` on planner-class
   agents and cosmo/cody.
5. **Force-auto (B-006).** Pin auto for sub-agent/detached in session-factory.
   Land this before exposing any interactive entry point (risk #1).
6. **Entry points (B-007, B-008).** `/mode` command and `--mode` flag.
7. **Persona/skill reconciliation (B-009, §8).** Point `design-dialogue`'s
   "When to load" at the explicit `interactionMode` (auto fallback retained);
   trim the planner persona's heuristic detection and disambiguate its `## Modes`
   wording. Subtractive change — do after the overlay exists so the skill has a
   real signal to key off.
8. **Docs.** Update `docs/prompts.md` with the Layer 2.5 overlay and the
   `interactionMode` axis; cross-link from the agent-definition reference.

If a stage surfaces unexpected complexity (e.g. live toggle can't reuse the
`/agent` replace path), pause and revise scope — the overlay + defaults
(steps 1-5) deliver standalone value even if the live toggle slips to a follow-up.
