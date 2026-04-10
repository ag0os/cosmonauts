# Skill Adaptation

Methodology for importing skills from external sources and adapting them for cosmonauts. External sources include: other agent frameworks (Claude Code skills, Codex skills), skill marketplaces, community packages, or any SKILL.md-format knowledge file.

## When to Adapt vs Write From Scratch

**Adapt** when:
- A well-structured external skill exists for the domain you need.
- The source skill captures real expertise (decision frameworks, constraints, failure modes) — not just syntax reference.
- Adapting saves significant effort over writing from scratch.

**Write from scratch** when:
- The external skill is mostly training-data duplication (syntax tutorials, API listings).
- The domain is specific to your project with no external equivalent.
- The source skill's structure is so different that adapting is harder than starting fresh.

## Phase 1: Study the Source

Read every file in the source skill before changing anything.

### Inventory

- What files exist? (`SKILL.md`, `references/`, `scripts/`, metadata files)
- What frontmatter fields are used? Which are standard, which are framework-specific?
- How large is each file? (word count, rough token estimate)
- What's the total token cost if everything were loaded?

### Content audit

For each section and reference file, classify the content:

| Classification | Description | Action |
|----------------|-------------|--------|
| **Decision framework** | When to use X vs Y, decision tables, trade-off analysis | Keep — high value |
| **Constraints/guardrails** | Must-do, must-not-do, rules, invariants | Keep — high value |
| **Common mistakes** | Pitfalls, gotchas, things that frequently go wrong | Keep — high value |
| **Non-obvious patterns** | Counterintuitive approaches, project-specific conventions | Keep — high value |
| **New API signatures** | APIs near/after training cutoff with specific parameter details | Keep — LLMs may hallucinate these |
| **Syntax reference** | How to use a well-known API, basic usage examples | Cut — training data |
| **Tutorial walkthrough** | Step-by-step explanation of known concepts | Cut — training data |
| **Standard library docs** | Method listings, parameter tables for stable APIs | Cut — training data |
| **Boilerplate examples** | Setup code, configuration templates, import patterns | Cut — training data |

### Measure reduction potential

After classifying, estimate what percentage of the source is cut-worthy. Typical external skills are 50-70% training-data duplication. If the source is mostly decision frameworks and constraints, the reduction will be smaller.

## Phase 2: Extract the Valuable Core

From the "keep" classifications, extract:

### Decision frameworks

Convert narrative explanations into tables or structured lists:

```markdown
Before (narrative):
"When you have state that's local to one component, use useState. When
multiple components need the same state, lift it to their nearest common
ancestor. When you need app-wide state like theme or auth, use Context
for rarely-changing values or Zustand when updates are frequent..."

After (decision table):
| State type | Tool | Why |
|------------|------|-----|
| Local to one component | useState | Simplest, no overhead |
| Shared by a subtree | Lift state | Avoids global state for local concerns |
| App-wide, rarely changes | Context | Built-in, no library needed |
| App-wide, frequent updates | Zustand | Selective subscriptions, no re-render storm |
```

Tables are more token-efficient than prose and easier for LLMs to apply.

### Constraints

Collect all must/must-not rules into a dedicated section. Deduplicate — the same rule often appears in multiple places in verbose source skills.

### Common mistakes

Extract from examples, warnings, and anti-pattern sections. Rewrite as concise bullet points:

```markdown
Before (verbose example with explanation):
"One common mistake is to use Context for frequently-changing values.
Here's an example of what happens: [20 lines of code showing the problem]
The issue is that every consumer re-renders on every change..."

After (concise):
- Using Context for frequently-changing values — every consumer re-renders
  on every change. Use Zustand or useSyncExternalStore for selective
  subscriptions.
```

### Correct signatures

For new or recently-changed APIs, preserve the exact signature with parameter names and types. LLMs commonly get these wrong:

```markdown
## useActionState(action, initialState, permalink?)

- action: (previousState: State, formData: FormData) => State | Promise<State>
  — receives previous state as first argument, not just FormData
- Returns: [state, formAction, isPending]
```

The key detail here ("receives previous state as first argument") is the kind of thing LLMs hallucinate. Keep it.

## Phase 3: Restructure for Cosmonauts

### Frontmatter

Map external frontmatter to cosmonauts format:

| External field | Cosmonauts equivalent |
|----------------|----------------------|
| `name` | `name` (keep, ensure kebab-case) |
| `description` | `description` (rewrite with WHAT + WHEN + WHEN NOT) |
| `triggers` | Fold into description as trigger phrases |
| `role`, `scope`, `output-format` | Drop — cosmonauts doesn't use these |
| `version` | Drop — cosmonauts skills aren't versioned |
| `license`, `compatibility`, `metadata` | Keep if relevant |
| `disable-model-invocation` | Keep if applicable |
| `allowed-tools` | Keep if applicable |

### Section order

Restructure the body following cosmonauts conventions:

1. **Constraints** (must/must not) — moved to top
2. **Discover project conventions** — for language/framework skills
3. **Core decision frameworks** — tables, not tutorials
4. **Topic sections** — organized by concern, not by API surface
5. **Common problems / stop criteria** — for workflow/iterative skills
6. **Reference table** — pointers to `references/` files
7. **Related skills** — cross-references

### Progressive disclosure

If the adapted skill exceeds ~3,000 words, split:
- Keep decision frameworks, constraints, and common mistakes in `SKILL.md`
- Move detailed topic coverage to `references/` files
- Add a reference table in `SKILL.md` with "When to Load" guidance

### References reduction

External skills often have 5-7 reference files. After cutting training-data content, you'll typically end up with 1-3. Merge small references that cover related topics.

## Phase 4: Verify

### Token efficiency check

Compare total size (bytes or words) before and after adaptation. A good adaptation achieves 40-70% reduction. If reduction is less than 30%, the source was already efficient or you're keeping too much training-data content.

### Coverage check

For each major topic in the original, verify:
- The decision-relevant content is preserved (when to use X, what to avoid, what's non-obvious).
- The syntax/tutorial content is gone.
- The constraints are captured.

### Format check

Run through the quality checklist in the main `/skill:skill-writing` skill.

## Example: React Skill Adaptation

Source: `react-expert-0.1.0` (50.6KB, 8 files, 7 references)
Result: cosmonauts `react` skill (18.8KB, 3 files, 2 references) — 63% reduction

What was cut:
- `hooks-patterns.md` — Pure syntax (useState, useDebounce, useLocalStorage patterns). Replaced with hook rules and effect discipline in main skill.
- `state-management.md` — API examples for Zustand/Redux/TanStack. Replaced with a decision table.
- `testing-react.md` — RTL and MSW patterns. Replaced with testing principles.
- `performance.md` — memo/useMemo/useCallback syntax. Replaced with "Profile First" + structural optimizations.
- `migration-class-to-modern.md` (24KB, largest file) — Dropped entirely. Class-to-hooks migration is thoroughly in training data.

What was kept:
- `server-components.md` — Rewritten around boundary decisions. LLMs frequently place `'use client'` too high, pass non-serializable props, and forget Server Actions are public endpoints.
- `react-19.md` — Kept for correct API signatures (useActionState's previousState parameter, useFormStatus must be in a child component). These are common hallucination points.

What was added:
- Decision table for state management (not in original)
- Constraints section moved to top (was at bottom in original)
- Negative triggers, cross-references, trigger phrases in description
