---
title: 'Superplanning Integration: Enhance Coding Agents + New Product Domain'
status: active
createdAt: '2026-03-30T18:35:47.508Z'
updatedAt: '2026-03-30T18:35:47.508Z'
---

## Summary

Integrate the best techniques from the superplanning repo (`/Users/cosmos/Resources/superplanning`) into Cosmonauts across two streams: (1) enhance existing coding domain agents with battle-tested planning disciplines — anti-sycophancy, shadow path tracing, premise challenge, handoff completeness, complexity thresholds, and Boil the Lake; (2) create a new `product` domain with agents for idea validation, product planning, and product review — workflows that don't exist in Cosmonauts today.

## Scope

**In scope:**
- New shared capability: anti-sycophancy rules
- Enhancements to existing capabilities: `architectural-design.md`, `base.md`
- Enhancement to existing skill: `plan/SKILL.md`
- New coding skill: `premise-challenge`
- New coding skill: `plan-review` (for reviewer/quality-manager)
- New product domain with 3 agents, 3 skills, 1 capability, and 3 workflows
- Wiring `cosmo` to be able to spawn product domain agents

**Out of scope:**
- Superplanning's test infrastructure (bash-based `claude -p` tests) — Cosmonauts uses Vitest
- Superplanning's Claude Code skill format (YAML frontmatter triggers) — Cosmonauts uses Pi skills
- Phase 6 (Deepen) sub-agent parallelism — requires `parallel-agent-spawning` roadmap item first
- Web search tool implementation — listed in roadmap as `web-search-tool`, not yet built. Product researcher agent will note web search as a future capability; for now it provides methodology the human or `cosmo` can execute manually
- Document creation tests (superplanning's Layer 4) — product domain agents produce plan artifacts via Cosmonauts' existing plan system, not raw markdown files

**Assumptions:**
- The domain loader auto-discovers new domains from `domains/` — adding `domains/product/domain.ts` is sufficient for registration
- Product domain agents use `tools: "readonly"` since they never write code
- The `product-to-code` cross-domain workflow can reference agents from both domains because the chain runner resolves agent IDs globally across loaded domains

## Design

### Module Structure

Two areas of change: enhancements to existing modules and a new domain directory.

**Existing module changes** (shared and coding domains):

| File | Single Responsibility | Change |
|------|----------------------|--------|
| `domains/shared/prompts/base.md` | Universal operating norms for all agents | Add Boil the Lake principle |
| `domains/shared/capabilities/anti-sycophancy.md` | **NEW** — Interaction discipline: take positions, ban hedging phrases, two-push rule | New capability file |
| `domains/coding/capabilities/architectural-design.md` | Design discipline for plan-producing agents | Add shadow path tracing + complexity smell threshold |
| `domains/shared/skills/plan/SKILL.md` | How to create well-structured plans | Add handoff completeness test + implementation unit enrichment |
| `domains/coding/skills/premise-challenge/SKILL.md` | **NEW** — On-demand skill for challenging requirements before planning | New skill |
| `domains/coding/skills/plan-review/SKILL.md` | **NEW** — Structured plan review with confidence scoring and scope modes | New skill |
| `domains/coding/prompts/planner.md` | Planner persona | Add reference to premise-challenge skill; add anti-sycophancy capability |
| `domains/coding/prompts/reviewer.md` | Reviewer persona | Add scope mode commitment section |
| `domains/coding/agents/planner.ts` | Planner agent definition | Add `anti-sycophancy` capability, `premise-challenge` skill |
| `domains/coding/agents/tdd-planner.ts` | TDD planner agent definition | Add `anti-sycophancy` capability |
| `domains/coding/agents/adaptation-planner.ts` | Adaptation planner agent definition | Add `anti-sycophancy` capability |
| `domains/coding/agents/reviewer.ts` | Reviewer agent definition | Add `plan-review` skill |
| `domains/coding/agents/cosmo.ts` | Lead agent definition | Add product domain agents to subagents list |

**New product domain** (`domains/product/`):

```
domains/product/
├── domain.ts                              # DomainManifest: id="product", lead="product-planner"
├── workflows.ts                           # 3 workflows: brainstorm, plan-product, product-to-code
├── agents/
│   ├── product-planner.ts                 # Main product planning agent
│   ├── product-reviewer.ts                # CEO + Design review gauntlet
│   └── product-researcher.ts              # Competitive landscape research sub-agent
├── prompts/
│   ├── product-planner.md                 # 7-phase flow (phases 0-3, 7) for brainstorm + new product
│   ├── product-reviewer.md                # Review gauntlet: scope modes, premise challenge, personas
│   └── product-researcher.md              # Competitive research methodology
├── capabilities/
│   └── product-planning.md                # Product planning discipline (stage awareness, document standards)
└── skills/
    ├── forcing-questions/
    │   └── SKILL.md                       # Q0-Q6, stage routing table, two-push rule, premise challenge
    ├── review-personas/
    │   └── SKILL.md                       # CEO, Design review persona definitions + cognitive patterns
    └── product-docs/
        └── SKILL.md                       # Templates: mission.md, mvp-plan.md, roadmap.md, tech-stack.md
```

### Dependency Graph

```
shared/base.md ──────────────────────────────────┐
shared/capabilities/core.md ─────────────────────┤
shared/capabilities/anti-sycophancy.md (NEW) ────┤
                                                  ├── ALL agents depend on these (Layer 0-1)
coding/capabilities/architectural-design.md ──┐   │
coding/capabilities/coding-readonly.md ───────┤   │
coding/capabilities/engineering-discipline.md ┘   │
                                                  │
product/capabilities/product-planning.md (NEW) ───┘
                                                  
shared/skills/plan/SKILL.md ─── coding planners + product-planner (on-demand)
coding/skills/premise-challenge/SKILL.md (NEW) ── coding planners (on-demand)
coding/skills/plan-review/SKILL.md (NEW) ──────── reviewer, quality-manager (on-demand)

product/skills/forcing-questions/SKILL.md (NEW) ── product-planner (on-demand)
product/skills/review-personas/SKILL.md (NEW) ──── product-reviewer (on-demand)
product/skills/product-docs/SKILL.md (NEW) ─────── product-planner (on-demand)

product-planner ──spawns──> product-researcher (sub-agent)
product-planner ──chains──> product-reviewer (downstream in workflow)
product-reviewer ──chains──> planner (cross-domain handoff in product-to-code workflow)
```

Dependencies point inward: product domain agents depend on shared capabilities. The coding domain's planner is downstream of the product domain in the `product-to-code` workflow, but there is no import-level dependency — they communicate through filesystem artifacts (`docs/product/` → planner reads them as requirements).

### Key Contracts

**Anti-sycophancy capability** — loaded by all planner agents as a prompt layer. No code interface; it's a behavioral directive in the system prompt.

**Product domain agents** — follow the same `AgentDefinition` interface all agents use:

```typescript
// domains/product/agents/product-planner.ts
const definition: AgentDefinition = {
  id: "product-planner",
  description: "Validates product ideas and produces product documents (mission, MVP plan, roadmap, tech stack). Never writes code.",
  capabilities: ["core", "anti-sycophancy", "product-planning", "coding-readonly", "spawning"],
  model: "anthropic/claude-opus-4-6",
  tools: "readonly",
  extensions: ["plans", "orchestration"],
  skills: ["plan", "forcing-questions", "product-docs"],
  subagents: ["product-researcher"],
  projectContext: true,
  session: "ephemeral",
  loop: false,
  thinkingLevel: "high",
};
```

```typescript
// domains/product/agents/product-reviewer.ts
const definition: AgentDefinition = {
  id: "product-reviewer",
  description: "Runs CEO and Design review gauntlet on product documents. Challenges premise, applies scope modes, rates UX quality.",
  capabilities: ["core", "anti-sycophancy", "product-planning", "coding-readonly"],
  model: "anthropic/claude-opus-4-6",
  tools: "readonly",
  extensions: ["plans"],
  skills: ["review-personas"],
  subagents: [],
  projectContext: true,
  session: "ephemeral",
  loop: false,
  thinkingLevel: "high",
};
```

```typescript
// domains/product/agents/product-researcher.ts
const definition: AgentDefinition = {
  id: "product-researcher",
  description: "Researches competitive landscape for product planning. Finds competitors, analyzes positioning, produces three-layer synthesis.",
  capabilities: ["core", "coding-readonly"],
  model: "anthropic/claude-sonnet-4-20250514",
  tools: "readonly",
  extensions: [],
  skills: [],
  subagents: [],
  projectContext: true,
  session: "ephemeral",
  loop: false,
};
```

**Cross-domain workflow** — the `product-to-code` workflow uses the chain DSL to cross domains:

```typescript
// domains/product/workflows.ts
{
  name: "product-to-code",
  description: "Full pipeline: product planning, review, then hand off to coding domain for implementation",
  chain: "product-planner -> product-reviewer -> planner -> task-manager -> coordinator -> quality-manager",
}
```

This works because the chain runner resolves agent IDs globally across all loaded domains. The `planner` resolves to `coding/planner`, `product-planner` resolves to `product/product-planner`.

**Artifact handoff** — product domain writes to `docs/product/` (mission.md, mvp-plan.md, roadmap.md, tech-stack.md). The coding domain's planner reads these as requirements input. No programmatic interface — filesystem is the contract.

### Seams for Change

- **Web search integration**: `product-researcher` currently operates with readonly tools (codebase exploration only). When `web-search-tool` is implemented, add it to the researcher's extensions. The researcher persona already describes competitive research methodology — the tool just enables it autonomously.
- **Phase 6 (Deepen)**: When `parallel-agent-spawning` ships, a `product-deepener` agent can be added to the product domain to run confidence gap scoring with parallel research agents. The scoring methodology is already documented in the `review-personas` skill.
- **New product stages**: The forcing-questions skill's stage routing table (pre-product / has-users / paying-customers / pure-eng) is extensible — new stages can be added without changing the product-planner persona.

## Approach

### Stream 1: Enhance Existing Agents

Each enhancement is a targeted addition to an existing file, following the conventions already established.

**Anti-sycophancy capability** (`domains/shared/capabilities/anti-sycophancy.md`):
- Adapted from superplanning's `skills/superplanning/references/anti-sycophancy-rules.md` (ref: `/Users/cosmos/Resources/superplanning/skills/superplanning/references/anti-sycophancy-rules.md`)
- Contains: the core rule (position + falsifiability), banned phrases table with replacements, two-push rule, pushback patterns, Boil the Lake note (cross-ref to base.md)
- Platform-tool references removed (no `AskUserQuestion` — Cosmonauts agents use Pi's interaction model)
- Scope mode commitment section omitted (that goes in the reviewer persona instead)

**Shadow path tracing + complexity threshold** (add to `domains/coding/capabilities/architectural-design.md`):
- Shadow path tracing adapted from superplanning's review-personas.md feasibility-reviewer section (ref: `/Users/cosmos/Resources/superplanning/skills/superplanning/references/review-personas.md`, "Feasibility Reviewer" section)
- Also sourced from design-rationale.md concept #5 (ref: `/Users/cosmos/Resources/superplanning/design-rationale.md`, "Shadow Path Tracing" section)
- Add as a new subsection under "Design the Structure": "For every new data flow, trace three shadow paths: nil input, empty/zero-length input, and upstream error. Plans that omit shadow paths defer failure handling to implementation — where it costs 3-5x more to design."
- Complexity smell threshold adapted from superplanning's review-personas.md engineering-review section (ref: `/Users/cosmos/Resources/superplanning/skills/superplanning/references/review-personas.md`, "Engineering Review" section)
- Add to the Architectural Checklist: "If the plan touches >8 files or introduces >2 new abstractions, run a scope reduction challenge before proceeding."

**Handoff completeness test** (add to `domains/shared/skills/plan/SKILL.md`):
- Adapted from superplanning's SKILL.md Phase Transition Protocol (ref: `/Users/cosmos/Resources/superplanning/skills/superplanning/SKILL.md`, "Phase Transition Protocol" section)
- Also sourced from existing-skills-insights.md concept #1 (ref: `/Users/cosmos/Resources/superplanning/existing-skills-insights.md`, "ce:brainstorm — The Handoff Completeness Test" section)
- Add as a new section "Plan Completeness Test" after "Scoping a Plan": "Before finalizing any plan, ask: 'What would the task manager or worker still have to invent if this plan were handed off now?' If the answer includes product behavior, scope boundaries, success criteria, or interface contracts — the plan is not done."
- Also enrich the plan body sections guidance with the implementation unit fields from superplanning's Phase 4 (ref: `/Users/cosmos/Resources/superplanning/skills/superplanning/SKILL.md`, "Implementation Unit Template" section): requirements trace, planning-time unknowns classification (blocker vs deferred)

**Boil the Lake** (add to `domains/shared/prompts/base.md`):
- Adapted from superplanning's anti-sycophancy-rules.md (ref: `/Users/cosmos/Resources/superplanning/skills/superplanning/references/anti-sycophancy-rules.md`, "Boil the Lake Principle" section)
- Also sourced from design-rationale.md concept #10 (ref: `/Users/cosmos/Resources/superplanning/design-rationale.md`, "Boil the Lake Reframing" section)
- Add to Operating Norms: "AI makes completeness cheap. When choosing between a shortcut and the complete version, prefer completeness — the delta is minutes, not days. Only accept shortcuts when the complete version is genuinely out of scope."

**Premise challenge skill** (`domains/coding/skills/premise-challenge/SKILL.md`):
- Adapted from superplanning's forcing-questions.md "Premise Challenge" section (ref: `/Users/cosmos/Resources/superplanning/skills/superplanning/references/forcing-questions.md`, "Premise Challenge" section)
- Contains the 6-step premise challenge sequence: reframing test, do-nothing test, assumption test, inversion test, scope test, distribution test
- Loadable on-demand by planners when requirements feel ambiguous or potentially wrong-headed
- Stripped of superplanning's product-stage routing (that belongs in the product domain) — focused purely on challenging technical requirements and feature premises

**Plan review skill** (`domains/coding/skills/plan-review/SKILL.md`):
- Adapted from superplanning's review-personas.md (ref: `/Users/cosmos/Resources/superplanning/skills/superplanning/references/review-personas.md`) and cognitive-patterns.md (ref: `/Users/cosmos/Resources/superplanning/skills/superplanning/references/cognitive-patterns.md`)
- Contains: confidence gap scoring algorithm (base + trigger count + risk bonus + critical section bonus), selective deepening methodology (top 2-5 weakest sections), scope mode commitment (expansion/hold/reduction), engineering review structure (4 sections: scope challenge, architecture, code quality, test review)
- Excludes CEO and Design review personas (those go in the product domain's review-personas skill)
- Loadable by reviewer and quality-manager agents

**Agent definition updates:**
- All three planner definitions (`planner.ts`, `tdd-planner.ts`, `adaptation-planner.ts`): add `"anti-sycophancy"` to capabilities array
- `planner.ts`: add `"premise-challenge"` to skills array
- `reviewer.ts` (need to check current definition): add `"plan-review"` to skills array
- `cosmo.ts`: add `"product-planner"` to subagents array so Cosmo can delegate to the product domain

### Stream 2: New Product Domain

**Domain manifest** (`domains/product/domain.ts`):
- `id: "product"`, `description: "Product strategy domain..."`, `lead: "product-planner"`
- Follows exact pattern of `domains/coding/domain.ts`

**Product-planner persona** (`domains/product/prompts/product-planner.md`):
- The largest new file. Adapted from superplanning's SKILL.md phases 0-3 and 7 (ref: `/Users/cosmos/Resources/superplanning/skills/superplanning/SKILL.md`)
- Phase 0 (Intake & Route): detect mode (brainstorm vs new product) from user input and codebase state. No "new feature" mode — that's the coding planner's job. If a codebase exists and the user wants a feature, tell them to use the coding domain's planner instead.
- Phase 1 (Ground): brainstorm → light scan; new product → competitive research (spawn product-researcher if web search available, otherwise describe methodology for manual research)
- Phase 2 (Challenge & Explore): load `/skill:forcing-questions`. Run stage-routed forcing questions (Q0-Q6) one at a time with two-push discipline. Run premise challenge. Synthesize job story. Gate: premise must survive or be reframed.
- Phase 3 (Define): brainstorm → requirements document with stable IDs (R1, R2...); new product → 4 documents (mission, mvp-plan, roadmap, tech-stack) using templates from `/skill:product-docs`. Each document approved before the next.
- Phase 7 (Hand Off): artifacts summary, next steps (continue to coding domain, validate with users, or done). Use Cosmonauts' plan system — create plan via `plan_create` that captures the product artifacts.
- Interaction rules throughout: one question at a time, anti-sycophancy, escape hatch
- Key adaptation from superplanning: replaced `AskUserQuestion`/`request_user_input`/`ask_user` references with Cosmonauts' natural conversation model. Removed platform-agnostic fallbacks (Cosmonauts is always Pi).
- Removed Phase 4 (Structure), Phase 5 (Validate), Phase 6 (Deepen) — Structure is coding planner's job, Validate is product-reviewer's job, Deepen requires parallel spawning not yet available

**Product-reviewer persona** (`domains/product/prompts/product-reviewer.md`):
- Adapted from superplanning's Phase 5 CEO Review + Design Review (ref: `/Users/cosmos/Resources/superplanning/skills/superplanning/SKILL.md`, "Phase 5: VALIDATE" section)
- CEO Review: scope mode selection (4 modes, chosen once, committed), Prime Directives (6 items), permission to scrap, premise challenge
- Design Review: 0-10 rating dimensions (Clarity, Hierarchy, Consistency, Feedback, Error recovery, Empty states, Accessibility signals), fix-to-10 methodology
- No Engineering Review — that belongs in coding domain
- Confidence gate: suppress < 0.50, store residuals, promote on cross-persona corroboration
- Autofix vs Present classification: terminology/formatting → autofix; strategic decisions → present to user
- Gate: no P0 unresolved, P1 addressed or explicitly accepted
- Cognitive patterns loaded on-demand via `/skill:review-personas`

**Product-researcher persona** (`domains/product/prompts/product-researcher.md`):
- Adapted from superplanning's Phase 1 New Product mode (ref: `/Users/cosmos/Resources/superplanning/skills/superplanning/SKILL.md`, "Phase 1: GROUND", "New Product Mode" section)
- Also sourced from mvp-creator's research methodology (ref: `/Users/cosmos/Resources/superplanning/SOURCES.md`, mvp-creator row)
- Three-layer synthesis: L1 tried-and-true, L2 new-and-popular, L3 first-principles
- 2-5 competitors, structured output: what they do well, where they fail, what's missing
- Currently operates with readonly tools (codebase exploration). When web-search-tool ships, add it.

**Product-planning capability** (`domains/product/capabilities/product-planning.md`):
- Product planning discipline: stage awareness (pre-product / has-users / paying / pure-eng), document quality standards, artifact storage conventions (`docs/product/`, `docs/brainstorms/`)
- The shared norms that all product domain agents internalize

**Forcing-questions skill** (`domains/product/skills/forcing-questions/SKILL.md`):
- Adapted from superplanning's references/forcing-questions.md (ref: `/Users/cosmos/Resources/superplanning/skills/superplanning/references/forcing-questions.md`)
- Contains: Q0 (Founder-Market Fit), Q1 (Demand Reality), Q2 (Status Quo), Q3 (Desperate Specificity), Q4 (Narrowest Wedge), Q5 (Observation & Surprise), Q6 (Future-Fit)
- Stage routing table with smart-skip logic
- Product Pressure Test (lightweight/standard/deep variants)
- Premise Challenge sequence (6 steps)
- Escape hatch protocol
- Red flags and pushback patterns for each question

**Review-personas skill** (`domains/product/skills/review-personas/SKILL.md`):
- Adapted from superplanning's references/review-personas.md and references/cognitive-patterns.md (ref: `/Users/cosmos/Resources/superplanning/skills/superplanning/references/review-personas.md` and `/Users/cosmos/Resources/superplanning/skills/superplanning/references/cognitive-patterns.md`)
- CEO review persona: 4 scope modes, 6 Prime Directives, 18 CEO/Product cognitive patterns
- Design review persona: 7 rating dimensions, fix-to-10 methodology, 12 design cognitive patterns
- Document review personas (for brainstorm mode): coherence-reviewer, feasibility-reviewer, product-lens, design-lens, security-lens, scope-guardian — with activation conditions
- Confidence gate rules and residual promotion logic
- Autofix vs Present classification rules

**Product-docs skill** (`domains/product/skills/product-docs/SKILL.md`):
- Adapted from superplanning's Phase 3 templates (ref: `/Users/cosmos/Resources/superplanning/skills/superplanning/SKILL.md`, "Phase 3: DEFINE" section)
- Contains exact templates for: mission.md (with Job Story, Why We're Right, Who We Serve, The Problem, Why Now, Success Criteria), mvp-plan.md (Core Value Prop, MVP Scope, Go-to-Market, What We'll Do Manually, Success Metrics, Risks), roadmap.md (3 phases with hypotheses and measurable exit criteria), tech-stack.md (Decision Principles, Stack table, Alternatives Rejected)
- Also contains requirements document template for brainstorm mode (with stable IDs R1, R2..., Key Decisions table, Outstanding Questions table)
- Artifact storage conventions: `docs/product/` for product docs, `docs/brainstorms/` for requirements docs

**Workflows** (`domains/product/workflows.ts`):
```typescript
export const workflows: WorkflowDefinition[] = [
  {
    name: "brainstorm",
    description: "Explore an idea: pressure-test, define requirements, decide if worth building",
    chain: "product-planner",
  },
  {
    name: "plan-product",
    description: "Full product planning: research, challenge, define, review",
    chain: "product-planner -> product-reviewer",
  },
  {
    name: "product-to-code",
    description: "Full pipeline: product planning, review, then hand off to coding domain for implementation",
    chain: "product-planner -> product-reviewer -> planner -> task-manager -> coordinator -> quality-manager",
  },
];
```

## Files to Change

### Existing files (modifications)

- `domains/shared/prompts/base.md` — add Boil the Lake principle to Operating Norms
- `domains/shared/capabilities/anti-sycophancy.md` — **NEW FILE** — anti-sycophancy capability
- `domains/coding/capabilities/architectural-design.md` — add shadow path tracing section + complexity smell threshold to checklist
- `domains/shared/skills/plan/SKILL.md` — add handoff completeness test section + enrich plan body guidance with implementation unit fields
- `domains/coding/skills/premise-challenge/SKILL.md` — **NEW FILE** — premise challenge skill
- `domains/coding/skills/plan-review/SKILL.md` — **NEW FILE** — plan review skill with confidence scoring and scope modes
- `domains/coding/prompts/planner.md` — add mention of premise-challenge skill availability in workflow step 2
- `domains/coding/prompts/reviewer.md` — add scope mode commitment section
- `domains/coding/agents/planner.ts` — add `"anti-sycophancy"` to capabilities, `"premise-challenge"` to skills
- `domains/coding/agents/tdd-planner.ts` — add `"anti-sycophancy"` to capabilities
- `domains/coding/agents/adaptation-planner.ts` — add `"anti-sycophancy"` to capabilities
- `domains/coding/agents/cosmo.ts` — add `"product-planner"` to subagents

### New files (product domain)

- `domains/product/domain.ts` — domain manifest
- `domains/product/workflows.ts` — 3 workflow definitions
- `domains/product/agents/product-planner.ts` — agent definition
- `domains/product/agents/product-reviewer.ts` — agent definition
- `domains/product/agents/product-researcher.ts` — agent definition
- `domains/product/prompts/product-planner.md` — phases 0-3, 7 persona prompt
- `domains/product/prompts/product-reviewer.md` — CEO + Design review persona prompt
- `domains/product/prompts/product-researcher.md` — competitive research persona prompt
- `domains/product/capabilities/product-planning.md` — product planning discipline
- `domains/product/skills/forcing-questions/SKILL.md` — Q0-Q6 + routing + premise challenge
- `domains/product/skills/review-personas/SKILL.md` — review personas + cognitive patterns
- `domains/product/skills/product-docs/SKILL.md` — document templates

## Risks

1. **Cross-domain workflow resolution**: The `product-to-code` workflow chains agents from two domains. This relies on the chain runner resolving agent IDs globally. If the chain runner scopes resolution per-domain, the cross-domain handoff will fail. Mitigation: verify the chain runner's `resolveAgent` function searches all loaded domains, not just the current one. The `loadDomains` function in `lib/domains/loader.ts` returns all domains flat, so this should work.

2. **Product-planner prompt size**: The product-planner persona is the largest prompt in the system (7-phase flow adapted from superplanning's ~500-line SKILL.md). Risk of context pressure on long sessions. Mitigation: heavy use of on-demand skills (`/skill:forcing-questions`, `/skill:product-docs`) to keep the persona focused on flow control, with reference material loaded only when needed.

3. **No web search yet**: The product-researcher agent is designed around competitive landscape research, which ideally uses web search. Without the `web-search-tool` roadmap item, the researcher is limited to codebase exploration and the user providing research manually. Mitigation: the researcher persona describes the methodology and output format so it's ready when web search ships. For now, the product-planner can note "competitive research requires manual input" and ask the user to provide landscape information.

4. **Anti-sycophancy across all planners**: Adding the anti-sycophancy capability to all three coding planners changes their interaction style. This is intentional but may feel jarring if users are accustomed to the current tone. The capability is behavioral (prompt-level), not mechanical, so the effect depends on model interpretation. Mitigation: the capability includes calibration guidance ("calibrated acknowledgment, not praise") and the escape hatch protocol from superplanning.

5. **Reviewer skill scope**: Adding `plan-review` to the reviewer agent expands its scope from code review to also being able to review plans. Currently the reviewer only reviews code diffs. The skill is on-demand (loaded via `/skill:plan-review`), so it won't activate unless explicitly requested. But the quality-manager may need updated instructions to know when to ask for plan review vs code review.

## Implementation Order

### Step 1: Shared enhancements (no new domain, no agent changes)

Add Boil the Lake to `base.md`, create `anti-sycophancy.md` capability, enhance `architectural-design.md` with shadow paths and complexity threshold, enhance `plan/SKILL.md` with handoff completeness test. These are pure content additions with no code changes and no dependency on anything else.

**Source references for implementers:**
- Boil the Lake: `/Users/cosmos/Resources/superplanning/skills/superplanning/references/anti-sycophancy-rules.md` ("Boil the Lake Principle" section) + `/Users/cosmos/Resources/superplanning/design-rationale.md` ("Boil the Lake Reframing" section)
- Anti-sycophancy: `/Users/cosmos/Resources/superplanning/skills/superplanning/references/anti-sycophancy-rules.md` (entire file, adapt to remove Claude Code platform references)
- Shadow path tracing: `/Users/cosmos/Resources/superplanning/skills/superplanning/references/review-personas.md` ("Feasibility Reviewer" section) + `/Users/cosmos/Resources/superplanning/design-rationale.md` ("Shadow Path Tracing" section)
- Complexity threshold: `/Users/cosmos/Resources/superplanning/skills/superplanning/references/review-personas.md` ("Engineering Review" section, "Scope Challenge" subsection)
- Handoff completeness: `/Users/cosmos/Resources/superplanning/existing-skills-insights.md` ("ce:brainstorm — The Handoff Completeness Test" section) + `/Users/cosmos/Resources/superplanning/skills/superplanning/SKILL.md` ("Phase Transition Protocol" section)
- Implementation unit enrichment: `/Users/cosmos/Resources/superplanning/skills/superplanning/SKILL.md` ("Implementation Unit Template" section)

### Step 2: New coding skills (premise-challenge + plan-review)

Create the two new skills in the coding domain. These are standalone markdown files with no code dependencies.

**Source references for implementers:**
- Premise challenge: `/Users/cosmos/Resources/superplanning/skills/superplanning/references/forcing-questions.md` ("Premise Challenge" section — the 6-step sequence)
- Plan review skill: `/Users/cosmos/Resources/superplanning/skills/superplanning/references/review-personas.md` (Engineering Review sections) + `/Users/cosmos/Resources/superplanning/skills/superplanning/references/cognitive-patterns.md` (Engineering Cognitive Patterns section) + `/Users/cosmos/Resources/superplanning/design-rationale.md` ("Confidence Gap Scoring" section)

### Step 3: Agent definition updates (coding domain)

Update planner, tdd-planner, adaptation-planner, reviewer, and cosmo agent definitions. Small `.ts` file edits (add strings to arrays). Depends on Step 1 (capability must exist) and Step 2 (skills must exist).

### Step 4: Coding domain persona updates

Update `planner.md` and `reviewer.md` prompts. Small markdown additions. Depends on Step 2 (skills referenced must exist).

### Step 5: Product domain foundation (manifest + capability + skills)

Create `domains/product/domain.ts`, `workflows.ts`, `capabilities/product-planning.md`, and all three skills (`forcing-questions`, `review-personas`, `product-docs`). This establishes the domain skeleton and all reference material before the agents that use them.

**Source references for implementers:**
- Domain manifest: follow pattern of `domains/coding/domain.ts`
- Workflows: follow pattern of `domains/coding/workflows.ts`
- Product-planning capability: synthesize from `/Users/cosmos/Resources/superplanning/skills/superplanning/SKILL.md` (Phase 0 scope classification, artifact storage conventions) + `/Users/cosmos/Resources/superplanning/design-rationale.md` ("Resolve Before Planning vs Deferred to Planning" section)
- Forcing-questions skill: `/Users/cosmos/Resources/superplanning/skills/superplanning/references/forcing-questions.md` (entire file)
- Review-personas skill: `/Users/cosmos/Resources/superplanning/skills/superplanning/references/review-personas.md` (CEO Review, Design Review, Document Review personas) + `/Users/cosmos/Resources/superplanning/skills/superplanning/references/cognitive-patterns.md` (CEO/Product patterns + Design patterns)
- Product-docs skill: `/Users/cosmos/Resources/superplanning/skills/superplanning/SKILL.md` ("Phase 3: DEFINE" section — all templates for mission.md, mvp-plan.md, roadmap.md, tech-stack.md, and brainstorm requirements doc)

### Step 6: Product domain agents (definitions + personas)

Create the three agent `.ts` definitions and their `.md` persona prompts. Depends on Step 5 (skills and capability must exist for the definitions to reference them).

**Source references for implementers:**
- Product-planner persona: `/Users/cosmos/Resources/superplanning/skills/superplanning/SKILL.md` (Phases 0, 1, 2, 3, 7 — adapt to remove "New Feature" mode, remove platform-agnostic tool fallbacks, use Cosmonauts plan system for artifact storage)
- Product-reviewer persona: `/Users/cosmos/Resources/superplanning/skills/superplanning/SKILL.md` ("Phase 5: VALIDATE" section — CEO Review and Design Review subsections only, no Engineering Review)
- Product-researcher persona: `/Users/cosmos/Resources/superplanning/skills/superplanning/SKILL.md` ("Phase 1: GROUND", "New Product Mode" section) + `/Users/cosmos/Resources/superplanning/SOURCES.md` (mvp-creator row for three-layer synthesis methodology)
- Agent definitions: follow pattern of `domains/coding/agents/planner.ts`

### Step 7: Integration verification

Verify the domain loader discovers the product domain. Verify `cosmo` can spawn `product-planner`. Verify the `product-to-code` workflow chain resolves all agents across both domains. This is manual verification — run `cosmonauts --list-domains` and test a workflow invocation.
