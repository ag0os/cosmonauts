---
name: creating-skills
description: Author, adapt, audit, and improve agent skills for coding-domain work. Use when creating new SKILL.md files, designing progressive-disclosure skill directories, converting procedural docs into skills, or handling skills with conditional branches, profiles, or staged discovery. Do NOT load for simply using an existing skill.
---

# Creating Skills

A skill is a routing shell over a focused knowledge base. Keep the loaded file small, make the discovery metadata sharp, and move conditional or detailed guidance into one-level reference files.

## First Rules

- Put the skill in the right source tree before writing content. Coding-domain skills live under `bundled/coding/skills/`.
- Use `SKILL.md` for directory skills. The frontmatter `name` must match the directory name.
- Frontmatter must include `name` and `description`; keep the description specific, third-person, and under 1024 characters.
- Prefer a directory skill when the workflow has branches, profiles, scripts, or references.
- Keep `SKILL.md` as a dispatcher: setup, laws, routing table, and links. Put heavy guidance in `references/`.
- Keep every reference directly linked from `SKILL.md`; avoid reference files that point to deeper reference files.
- Use scripts only for deterministic, repetitive, stateful, or fragile work. Markdown owns judgment; scripts own mechanics.

## Route the Request

Load exactly the reference files needed for the task:

| Task | Read |
|---|---|
| Create a simple or standard skill | `references/foundations.md` |
| Convert external docs or repeated prompting into a skill | `references/foundations.md`, then `references/architecture.md` if it needs multiple files |
| Design a complex skill with commands, conditional branches, profiles, or staged discovery | `references/architecture.md` and `references/complex-skills.md` |
| Add project-local context, bootstrap files, or deterministic scripts | `references/architecture.md` |
| Audit or improve an existing skill | `references/foundations.md` and `references/evaluation.md` |
| Build test scenarios for a skill | `references/evaluation.md` |

If the user only says "make a skill", start with `references/foundations.md`. Escalate to the architecture references only when the skill has real branching, reusable disciplines, deterministic scripts, project-local context, or multiple operating profiles.

## Authoring Workflow

1. Identify the repeated agent behavior the skill should improve.
2. Choose the smallest shape that can carry it:
   - Flat `.md` skill for short, single-path guidance.
   - Directory skill for any references, scripts, assets, or branching.
   - Thin-dispatcher skill for command/profile-heavy work.
3. Write the frontmatter first. If the description would not trigger at the right time, fix it before writing the body.
4. Put constraints and routing early in `SKILL.md`.
5. Move examples, branch-specific procedures, profiles, and long checklists into `references/`.
6. Add deterministic scripts only when prose would be repeated, error-prone, or stateful.
7. Create or run at least three representative usage checks before calling the skill done.

## Shape Decision

Use the simplest viable structure:

```text
simple-skill/
└── SKILL.md
```

Use this for concise, linear guidance.

```text
standard-skill/
├── SKILL.md
└── references/
    ├── workflow.md
    └── patterns.md
```

Use this when details should load on demand.

```text
complex-skill/
├── SKILL.md
├── references/
│   ├── command-name.md
│   ├── profile-name.md
│   └── discipline-name.md
└── scripts/
    └── deterministic-helper.mjs
```

Use this when the skill has verbs, conditional forks, profiles, validation loops, or project-local context.

## Failure Modes

- **Verbose tutorial mode.** If the skill explains basics the model already knows, cut them.
- **Checklist without posture.** Replace vague advice with bans, named failure modes, and testable sanity checks.
- **Hidden branch logic.** If conditional paths dominate the body, split them into profiles or command references.
- **Deep reference maze.** If a reference sends the agent to another reference, flatten the structure.
- **Untested discovery.** If the skill does not trigger from realistic prompts, the description is wrong no matter how good the body is.

## Related Skills

- `/skill:skill-writing` - Cosmonauts shared skill conventions and frontmatter constraints.
- `/skill:agent-packaging` - Packaging agents and embedded skill selections.
- `/skill:engineering-principles` - Design discipline for code or scripts bundled with a skill.
