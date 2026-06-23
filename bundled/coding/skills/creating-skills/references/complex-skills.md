# Complex Skills with Conditional Discovery

Use this when a skill has conditional forks and should be discovered in phases so the agent keeps the right context loaded.

## When to Use This Shape

Use phased discovery when the skill has at least one of these:

- Multiple user-facing commands.
- Distinct operating profiles.
- Branches that require different facts, tools, or quality bars.
- Long references where only one branch is relevant per task.
- Project-local context that changes routing.
- Specialized subagents or scripts for side work.

Do not use this shape for short linear guidance. A complex shell around a simple skill is context overhead.

## Profiles

Profiles encode discrete operating modes. They are not vague preferences.

Good profiles:

- `brand` vs `product`.
- `omakase` vs `service-oriented` vs `api-first`.
- `simple` vs `standard` vs `complex`.
- `library` vs `application` vs `plugin`.

Bad profiles:

- `fast` vs `good`.
- `basic` vs `advanced` with no routing criteria.
- Every possible framework as a profile when only one tiny section changes.

Profile references should contain rules that change decisions across several commands. If a rule affects only one command, keep it in that command reference.

## Phased Discovery

Use this sequence:

1. Load `SKILL.md`.
2. Load project context or run the context loader if the skill needs repository-local policy.
3. Select one command or task route.
4. Select one profile only if the route needs profile-specific rules.
5. Load shared discipline references only when they affect the selected route.
6. Execute the workflow.
7. Run the sanity pass or validation loop.

The dominant failure mode is loading too much "just in case." If a file does not change the next decision, leave it unread.

## Conditional Routing Table

Make branch selection explicit:

| Signal | Route | Profile |
|---|---|---|
| User asks to create a new skill from scratch | `references/create.md` | infer shape from complexity |
| User provides long source docs | `references/adapt.md` | choose simple, standard, or complex |
| Skill has command verbs | `references/commands.md` | command-heavy |
| Skill behavior depends on project type | selected command | project profile |
| User asks for review or polish | `references/audit.md` | none unless profile affects rules |

If two routes seem equally plausible, choose the smaller one and note the assumption.

## Opinionated Rules

Complex skills need commitments, not neutral lists.

Use:

- **Bans:** "Do not put full command procedures in `SKILL.md`."
- **Rewrite triggers:** "If you wrote three conditional sections in the body, split them into references."
- **Named failure modes:** "Reference maze", "tutorial bloat", "profile soup".
- **Sanity checks:** "Could a fresh agent choose the right file after reading only `SKILL.md`?"

Avoid:

- "Consider using references."
- "Think about context."
- "Be concise."

Weak advice does not change behavior.

## Command References

Each command reference should have:

- When to use it.
- Inputs to inspect.
- Procedure.
- Validation or stop criteria.
- Output shape when relevant.

Command references may mention related disciplines, but `SKILL.md` should still directly link every reference file. Do not hide a needed file behind another file.

## Discipline References

Use a discipline reference when knowledge is reused across commands:

- Frontmatter design.
- Evaluation design.
- Security constraints.
- Visual QA.
- Testing philosophy.

If a discipline is only needed by one command, merge it into that command reference.

## Subagents

Use subagents only for focused side work that can run independently:

- Audit discovery metadata while the main agent writes the body.
- Validate examples against a fresh prompt.
- Inspect a codebase for conventions while the main agent drafts the skill.

Do not delegate the core design of the skill if the next main step depends on it.

## Sanity Pass

Run this before finishing a complex skill:

- Can the metadata trigger on realistic prompts without over-triggering?
- Can the agent choose one route from the dispatcher without reading every reference?
- Are profiles discrete and decision-changing?
- Are all references one level deep from `SKILL.md`?
- Did every script replace deterministic prose rather than add ceremony?
- Is there a named failure mode for the skill's most likely misuse?
