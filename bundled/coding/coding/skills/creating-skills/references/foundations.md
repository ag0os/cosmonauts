# Skill Authoring Foundations

Use this when creating a simple or standard skill, converting known procedures into a skill, or auditing basic quality.

## Frontmatter

Required:

```yaml
---
name: creating-skills
description: Author, adapt, audit, and improve agent skills...
---
```

Rules:

- `name`: lowercase letters, numbers, and hyphens only; maximum 64 characters.
- `name`: no XML tags and no reserved words such as `anthropic` or `claude`.
- `description`: non-empty, no XML tags, maximum 1024 characters.
- Directory skill names must match frontmatter names.
- Descriptions are third-person. Use "Creates..." or "Author..." style, never "I can..." or "You can...".

## Description Formula

Use this shape:

```text
[What the skill does]. Use when [specific triggers]. Do NOT load for [nearby but wrong cases].
```

Good descriptions include:

- The domain or artifact: "PDF files", "Rails services", "agent skills".
- User phrases and task phrases that should trigger loading.
- Negative triggers when another skill or normal reasoning is more appropriate.

Rewrite vague descriptions:

```yaml
description: Helps with skills.
```

into discoverable descriptions:

```yaml
description: Creates and improves agent skills with concise frontmatter, progressive disclosure, references, scripts, and evaluation scenarios. Use when writing SKILL.md files or converting repeated workflows into skills. Do NOT load for using existing skills.
```

## Context Budget

Default assumption: the agent is already capable. Include only context that changes its behavior.

Keep:

- Discovery triggers and negative triggers.
- Must-do and must-not-do constraints.
- Decision frameworks.
- Workflow order and validation gates.
- Non-obvious domain rules.
- Concrete examples where style or output quality depends on them.

Cut:

- Tutorial explanations of common concepts.
- Broad lists of obvious options.
- Standard language or library basics.
- Repeated content that belongs in a reference file.

## Degrees of Freedom

Match precision to risk:

- **High freedom:** use for judgment-heavy work where many paths are valid.
- **Medium freedom:** use templates, pseudocode, or parameterized scripts when a pattern should be followed but adapted.
- **Low freedom:** use exact commands or scripts when sequencing, validation, or consistency is fragile.

If a workflow can break user data or produce hard-to-detect errors, add a validation loop.

## Progressive Disclosure

Start with the smallest useful `SKILL.md`.

Use references when:

- The body approaches 300-500 lines.
- A branch applies only to some tasks.
- The skill has multiple domains, commands, profiles, or examples.
- A file is useful only after a decision point.

Keep all references one level from `SKILL.md`:

```text
skill-name/
├── SKILL.md
└── references/
    ├── workflow.md
    ├── examples.md
    └── profiles.md
```

Avoid:

```text
SKILL.md -> references/advanced.md -> references/deeper-details.md
```

## Workflow and Feedback Loops

For multi-step work, include the ordering and the loop:

```markdown
1. Draft the artifact.
2. Validate against the checklist or script.
3. If validation fails, fix the specific issue and validate again.
4. Proceed only when validation passes.
```

Use checklist blocks when the agent should track progress across a long task, but do not turn every skill into a checklist.

## Executable Resources

Use scripts for deterministic work:

- Filesystem lookup.
- Structured JSON generation or validation.
- Idempotent writes.
- Batch transformations.
- Environment detection.

State execution intent clearly:

- "Run `scripts/validate.mjs` and use its JSON output."
- "Read `scripts/algorithm.py` only if modifying the algorithm."

List dependencies when a script needs packages beyond the runtime baseline.

## Basic Quality Pass

Before finishing:

- Description is specific and includes triggers.
- `SKILL.md` is concise and front-loads constraints.
- References are directly linked from `SKILL.md`.
- Terminology is consistent.
- No Windows-style paths.
- No time-sensitive claims unless isolated as legacy context.
- At least one realistic usage scenario has been tested or written down.
