---
name: skill-writing
description: How to write, adapt, and improve skills for cosmonauts agents. Use when creating new skills, importing skills from external sources, auditing skill quality, or improving existing skill descriptions. Do NOT load for using skills or managing skill exports — use the skills-cli skill instead.
---

# Skill Writing

Skills are on-demand knowledge files that teach agents HOW to do specific things. This skill covers how to write effective ones, adapt external skills, and maintain quality.

## Constraints

### Must

- Use `SKILL.md` as the filename (exact, case-sensitive).
- Use kebab-case for skill directory names.
- Include both `name` and `description` in YAML frontmatter.
- Keep `description` under 1024 characters.
- Keep `SKILL.md` under ~5,000 words. Move detailed content to `references/`.
- Put critical rules and constraints early in the file, not buried at the bottom.
- Include at least one concrete example or workflow.

### Must Not

- Put a `README.md` inside a skill directory — `SKILL.md` is the entry point.
- Use XML angle brackets (`<`, `>`) in frontmatter — they break parsers.
- Start `name` with `claude` or `anthropic` — reserved prefixes.
- Create rogue subdirectories — only `scripts/`, `references/`, `assets/` are recognized.
- Duplicate content that LLMs already know from training data (see Token Efficiency below).

## Skill Structure

### Flat skill (simple, single-file)

```
domains/{domain}/skills/my-skill.md
```

A single markdown file with frontmatter. Use for small skills under ~1,000 words.

### Directory skill (standard, supports references)

```
my-skill/
  SKILL.md              # Required: frontmatter + instructions
  references/           # Optional: detailed docs loaded on-demand
    advanced-topic.md
    another-topic.md
```

Use for skills that need progressive disclosure — core guidance in `SKILL.md`, detailed topics in `references/`.

### Frontmatter

```yaml
---
name: my-skill
description: What it does and when to use it.
---
```

Required fields: `name`, `description`.

Optional fields:
- `disable-model-invocation: true` — hides the skill from the LLM's skill index; only loadable via explicit `/skill:name` command.
- `allowed-tools` — declares tool access requirements (e.g., `Bash(playwright-cli:*)`).

## Writing the Description

The description is the most important field. It determines when agents load the skill. A bad description means the skill is never activated or activates for the wrong tasks.

### Structure

Every description needs three parts:

```
[WHAT it does] + [WHEN to use it] + [WHEN NOT to use it]
```

### WHAT: Functional summary

Lead with what the skill provides. Be specific — name the domain, tools, or patterns.

```
Bad:  "Helps with projects."
Good: "Code refactoring techniques and discipline."
```

### WHEN: Trigger phrases

Include phrases users and agents would actually say or encounter. These are the activation signals.

```
Bad:  "Load for TypeScript."
Good: "Use when working with types, generics, strict mode, module systems, or TypeScript-specific testing. Load for any TypeScript project."
```

Think about what the agent is doing when it needs this skill: "building components", "managing state", "creating tasks from a plan", "simplifying conditionals", "filling forms in a browser".

### WHEN NOT: Negative triggers

Add "Do NOT load for..." when the skill has a narrow scope that could over-trigger. This prevents token waste from loading irrelevant skills.

```
Good: "Do NOT load for straightforward bug fixes or implementation where the design is already clear."
Good: "Do NOT load for non-React frontend work (Vue, Svelte, vanilla JS)."
Good: "Do NOT load for task implementation or code changes — use the task skill instead."
```

Negative triggers are especially important when:
- Similar skills exist that could be confused (plan vs task vs roadmap).
- The skill name is a common word that appears in many contexts.
- The skill is domain-specific but the description sounds general.

### Description length

Stay well under the 1024-char limit. Aim for 150-300 characters — enough for WHAT + WHEN + WHEN NOT.

## Content Design

### Critical rules early

The agent may stop reading partway through a long skill. Put constraints, rules, and must-do/must-not-do items near the top, right after the frontmatter. Detailed explanations, examples, and reference tables go later.

Recommended section order:
1. Constraints (must/must not)
2. Core workflow or decision framework
3. Detailed guidance per topic
4. Common problems / failure modes
5. Reference table
6. Related skills

### Progressive disclosure

Keep `SKILL.md` focused on decisions and rules. Move detailed reference material to `references/`:

```markdown
## Reference Guides

| Topic | Reference | When to Load |
|-------|-----------|--------------|
| Advanced types | `references/type-patterns.md` | Generics, conditional types, branded types |
| Testing | `references/testing-patterns.md` | Mocking, async testing, parameterized tests |
```

The agent loads what it needs. This saves tokens compared to injecting everything into every session.

### Failure modes and recovery

For workflow skills (sequential steps, iterative processes), include a "Common Problems" section with 3-5 recovery scenarios:

```markdown
## Common Problems

- **[Problem description.]** [Recovery action.]
- **[Problem description.]** [Recovery action.]
```

For iterative skills (refactoring, TDD), include explicit stop criteria:

```markdown
## When to Stop

Stop when:
- [Exit condition 1]
- [Exit condition 2]
```

### Cross-references

Skills should not be islands. Add a "Related Skills" section at the bottom pointing to complementary skills:

```markdown
## Related Skills

- `/skill:engineering-principles` — Design principles for the code you're building
- `/skill:typescript` — TypeScript-specific patterns and type safety
```

This helps agents navigate between skills and prevents loading the wrong skill for a task.

### Pattern-aware structure

Structure the skill body based on what pattern it teaches:

| Pattern | Structure emphasis |
|---------|-------------------|
| Sequential workflow | Explicit step ordering, validation gates between steps |
| Iterative refinement | Loop structure, quality threshold, stop criteria |
| Decision-making | Decision tables/trees with clear criteria and fallbacks |
| Domain knowledge | Rules enforced before actions, constraints up front |
| Tool reference | Command taxonomy, examples per command, when-to-use |

## Token Efficiency

The most common mistake in skill writing is restating what LLMs already know from training data. This wastes tokens without improving output quality.

### Principle: guide inference, don't duplicate training

LLMs have extensive knowledge of programming languages, frameworks, and tools from training. A skill should activate and steer that knowledge, not repeat it.

### What to include

- **Decision frameworks** — When to use X vs Y. LLMs know the syntax of both; they need help choosing.
- **Constraints and guardrails** — Must-do and must-not-do rules. These override the LLM's default behavior.
- **Common mistakes** — Things LLMs (and developers) frequently get wrong. Pitfalls, gotchas, ordering dependencies.
- **Non-obvious patterns** — Patterns where the right approach is counterintuitive or requires project-specific context.
- **Correct signatures for new APIs** — APIs released near or after the training cutoff. LLMs may hallucinate parameters or return types.

### What to omit

- **Basic syntax and usage** — Don't teach `useState`, `import`, `git commit`. The LLM knows.
- **Standard library reference** — Don't list every method on a class. The LLM knows the API.
- **Tutorial-style walkthroughs** — Don't explain how hooks work step by step. Provide a decision table for when to use which hook.
- **Code examples for well-known patterns** — A `useEffect` cleanup example is in every React tutorial. Instead, state the rule: "Always return a cleanup function from effects that create subscriptions."

### How to test

Ask: "If I removed this sentence, would the LLM produce worse output?" If the answer is no, cut it.

Ask: "Is this a decision the LLM needs help making, or a fact it already knows?" If it's a known fact, cut it.

## Adapting External Skills

When importing skills from external sources (other agent frameworks, skill marketplaces, community packages), apply a systematic adaptation process. For the full methodology, load `references/skill-adaptation.md`.

Quick checklist:
1. Study the source skill structure and content
2. Identify what's redundant with LLM training data — cut it
3. Extract decision frameworks, constraints, and non-obvious patterns — keep these
4. Restructure following cosmonauts conventions (frontmatter, section order, progressive disclosure)
5. Add trigger phrases, negative triggers, cross-references
6. Verify token efficiency — the adapted skill should be significantly smaller than the source

## Quality Checklist

Before shipping a skill, verify:

- [ ] `SKILL.md` filename is exact (case-sensitive)
- [ ] Directory name is kebab-case
- [ ] `name` and `description` in frontmatter
- [ ] Description has WHAT + WHEN + WHEN NOT
- [ ] Description includes trigger phrases users would actually say
- [ ] No XML angle brackets in frontmatter
- [ ] Constraints/rules appear early, not buried
- [ ] At least one concrete example or workflow
- [ ] Detailed docs in `references/` if SKILL.md exceeds ~3,000 words
- [ ] Common problems or stop criteria included (for workflow/iterative skills)
- [ ] Related skills section with cross-references
- [ ] No training-data duplication (syntax tutorials, standard API reference)
- [ ] Under 1024 chars for description, under ~5,000 words for SKILL.md

## Reference Guides

| Topic | Reference | When to Load |
|-------|-----------|--------------|
| Skill Adaptation | `references/skill-adaptation.md` | Importing and adapting skills from external sources |

## Related Skills

- `/skill:skills-cli` — Listing and exporting skills via the CLI
- `/skill:pi` — Pi framework API, including skill discovery and loading internals
