# Skill Architecture

Use this when a skill needs multiple commands, reference files, profiles, scripts, or project-local context.

## Distilled Model

A strong complex skill is:

```text
A thin dispatcher over a thick knowledge base, gated by project context.
```

The dispatcher chooses what to load. References carry the real guidance. Scripts handle deterministic mechanics.

## File Shape

```text
skill-name/
├── SKILL.md
├── references/
│   ├── command.md
│   ├── profile.md
│   └── discipline.md
├── scripts/
│   └── helper.mjs
└── assets/
    └── template.json
```

Only create directories the skill actually needs.

## Thin Dispatcher

`SKILL.md` should contain:

- Frontmatter.
- Non-negotiable rules.
- Setup or context-loading instructions.
- Routing table.
- One-line summaries of references.
- Failure modes and related skills.

It should not contain:

- Full command procedures.
- Long examples.
- Full schemas.
- Detailed API references.
- Repeated content from reference files.

If `SKILL.md` exceeds roughly 300 lines, split it unless the body is genuinely linear and always needed.

## Two Reference Axes

Split references by verbs and disciplines.

**Verbs** are user-facing actions:

- `create.md`
- `audit.md`
- `adapt.md`
- `package.md`

**Disciplines** are reusable bodies of judgment:

- `discovery.md`
- `evaluation.md`
- `frontmatter.md`
- `project-context.md`

When two command files repeat guidance, hoist the shared content into a discipline file and link both commands from `SKILL.md`.

## Routing Rules

Use a predictable order:

1. No explicit command: infer the task and route to the smallest matching reference.
2. First word matches a command: load that command reference.
3. First word does not match: apply the shared rules and only the references needed by the freeform request.

Add this rule when commands can call subcommands:

```markdown
Subcommands do not rerun setup. Load project context once, then route.
```

## Project-Local Context

Use project-local context when output depends meaningfully on the repository, product, team, or harness.

Good project context files:

- `SKILLS.md` for skill library policy.
- `AGENTS.md` for local agent instructions.
- `.agents/context/SKILLS.md` for harness-local context.
- `docs/skills.md` for project skill authoring rules.

If the context file is missing, either:

- Create a bootstrap command that writes a minimal stub after confirmation.
- Proceed with explicit assumptions for small tasks.

Do not bury project policy inside a global skill when it should live with the project.

## Scripts

Script deterministic work instead of describing it as a long prose ritual.

Good script jobs:

- Find project context across known locations.
- Validate frontmatter and directory names.
- Generate stable metadata.
- Pin or export skill shortcuts idempotently.
- Validate reference links.

Scripts should:

- Accept explicit inputs.
- Return structured output when practical.
- Print actionable errors.
- Be safe to rerun.

Do not add a script just to look sophisticated. Add it when it removes real variance.

## Assets

Use `assets/` for templates or files that are copied into outputs, not for reference prose. If the agent should read it, use `references/`.

## Architecture Pass

Before implementing a complex skill, answer:

- What behavior triggers this skill?
- Which branches are always needed, and which should load later?
- What are the verbs?
- What disciplines are shared by more than one verb?
- Does the skill need project-local context?
- Which mechanics should be scripts?
- What will prove the skill works?
