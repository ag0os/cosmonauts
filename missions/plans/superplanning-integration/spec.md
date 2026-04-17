## Superplanning Source Repository

All techniques in this plan are adapted from the superplanning repository at `/Users/cosmos/Resources/superplanning`.

### Repository Structure

```
/Users/cosmos/Resources/superplanning/
├── README.md                          — Project overview, installation, usage
├── SOURCES.md                         — Attribution for every technique (16 source skills across 5 repos)
├── SKILLS-INVENTORY.md                — Inventory of all 48+ source skills analyzed
├── design-rationale.md                — Full justification for every design decision (15 concepts)
├── existing-skills-insights.md        — Unique insights extracted from each source skill
├── plan.md                            — Original implementation plan
├── skills/
│   └── superplanning/
│       ├── SKILL.md                   — Main skill: unified 7-phase flow (~500 lines)
│       └── references/
│           ├── forcing-questions.md   — Q0-Q6 + stage routing + premise challenge + escape hatch
│           ├── anti-sycophancy-rules.md — Banned phrases, two-push rule, Boil the Lake, pushback patterns
│           ├── review-personas.md     — 6 document review personas + CEO/Design/Eng review gauntlet
│           └── cognitive-patterns.md  — 45 cognitive patterns: 18 CEO, 15 Eng, 12 Design
└── tests/                             — 3-layer test suite (unit, triggering, explicit requests)
```

### Key Source Files and What to Extract From Each

**`skills/superplanning/SKILL.md`** — The main skill file. Contains:
- Phase 0: mode detection logic and scope classification (Lightweight/Standard/Deep)
- Phase 1: competitive research methodology (New Product), codebase scan (New Feature)
- Phase 2: challenge flow with forcing questions, premise challenge, job story synthesis
- Phase 3: document templates (requirements doc, mission.md, mvp-plan.md, roadmap.md, tech-stack.md)
- Phase 4: implementation unit template with structured fields
- Phase 5: review gauntlet (CEO → Design → Engineering)
- Phase 7: handoff protocol with next-step recommendations
- Interaction rules: one question at a time, blocking questions, escape hatch
- Phase Transition Protocol: gate announcements, handoff completeness test
- Artifact storage conventions

**`references/forcing-questions.md`** — The questioning framework. Contains:
- Product Pressure Test (lightweight/standard/deep variants)
- Q0: Founder-Market Fit (with engineering/infra reframe)
- Q1-Q6: Six forcing questions with push-until-hearing criteria and red flags
- Stage routing table (pre-product / has-users / paying / pure-eng)
- Premise Challenge 6-step sequence
- Escape hatch protocol
- Smart-skip logic

**`references/anti-sycophancy-rules.md`** — Interaction discipline. Contains:
- Core rule: position + falsifiability
- Banned phrases table (6 phrases with replacements)
- Required response posture
- 5 named pushback patterns
- Two-push rule
- Boil the Lake principle with effort reference table
- Scope mode commitment rules
- Interaction discipline rules (5 items)

**`references/review-personas.md`** — Review persona definitions. Contains:
- Always-on personas: coherence-reviewer, feasibility-reviewer
- Conditional personas: product-lens, design-lens, security-lens, scope-guardian (with activation conditions)
- CEO Review: 4 scope modes, 6 Prime Directives, permission to scrap
- Design Review: 7 rating dimensions, fix-to-10 methodology
- Engineering Review: 4 sections (scope challenge, architecture, code quality, test review)
- Confidence gate rules (0.50 threshold, residual promotion, contradiction resolution)
- Autofix vs Present classification

**`references/cognitive-patterns.md`** — Thinking lenses. Contains:
- 18 CEO/Product patterns (Bezos, Grove, Munger, Jobs, Altman, Horowitz, etc.)
- 15 Engineering patterns (Larson, McKinley, Fowler, Brooks, Beck, etc.)
- 12 Design patterns (Rams, Norman, Nielsen, Krug, Maeda, etc.)
- Application guidance (which patterns for which review scenario)

**`design-rationale.md`** — Justification for design decisions. Contains:
- Why each of the 15 integrated concepts works, how it helps product development, and how it makes users happy
- Key concepts: handoff completeness, stage-routed forcing questions, anti-sycophancy, confidence gap scoring, shadow path tracing, scope mode commitment, complexity smell threshold, mechanical vs taste decisions, confidence gate with residual promotion, Boil the Lake, resolve-before-planning vs deferred-to-planning, decomposition before clarification, planning-time vs execution-time unknowns, implementation units as structured objects, conditional external research

**`existing-skills-insights.md`** — Unique insights per source skill. Contains:
- Prioritized list of 15 concepts by uniqueness and value
- Detailed analysis of what makes each source skill uniquely valuable
- Cross-cutting insights table

**`SOURCES.md`** — Full attribution table. Contains:
- Source skill → repository → what was used → how adapted → which phases
- "What Was Not Used" section with exclusion rationale
- Design decisions section explaining structural choices