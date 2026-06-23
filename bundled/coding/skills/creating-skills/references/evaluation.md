# Skill Evaluation

Use this when testing, auditing, or iterating on a skill.

## Evaluation-First Loop

Before writing extensive documentation:

1. Identify where the agent fails without the skill.
2. Create three representative scenarios.
3. Write minimal guidance that addresses those failures.
4. Run or mentally simulate the scenarios.
5. Refine only where behavior is still wrong.

Do not build a large skill around imagined failures.

## Scenario Shape

Use this lightweight format:

```json
{
  "skills": ["creating-skills"],
  "query": "Create a skill for reviewing database migrations.",
  "files": ["optional/path/to/input.md"],
  "expected_behavior": [
    "Chooses a directory skill because validation and references are needed",
    "Writes discoverable frontmatter with positive and negative triggers",
    "Includes a validation loop before destructive migration steps"
  ]
}
```

Three scenarios should cover:

- The obvious happy path.
- A boundary case where the skill should stay simple.
- A complex case with branches, profiles, scripts, or references.

## What to Observe

During testing, watch for:

- Skill does not trigger when it should: fix the description.
- Skill triggers too often: add negative triggers.
- Agent reads every reference: improve routing or split references.
- Agent misses an important file: make the link and "when to read" language more explicit.
- Agent repeats generic advice: cut tutorial content and add stronger rules.
- Agent forgets validation: move the validation gate earlier or make it mandatory.

## Audit Checklist

Core quality:

- Description says what the skill does and when to use it.
- Description is third-person and under the limit.
- Frontmatter name matches the directory name.
- Constraints appear near the top.
- `SKILL.md` is a dispatcher when the skill is complex.
- References are one level deep.
- No reference content is duplicated in the body.
- Terminology is consistent.

Complex-skill quality:

- Commands and disciplines are separated where useful.
- Profiles are discrete operating modes with clear routing criteria.
- Project-local context is explicit when needed.
- Scripts own deterministic mechanics.
- Sanity checks are falsifiable.
- Failure modes are named.

Testing quality:

- At least three representative scenarios exist.
- The scenarios include discovery behavior, not only output shape.
- The skill was tested from fresh context when practical.
- Observed failures drove revisions.

## Iteration Pattern

Use two roles when practical:

- Authoring agent: designs and edits the skill.
- Fresh testing agent: tries realistic prompts with only task-local context.

The testing agent should not receive the intended answer or hidden rationale. Its failures reveal gaps in metadata, routing, and instructions.

## Stop Criteria

A skill is ready when:

- It triggers for realistic target prompts.
- It avoids nearby non-target prompts.
- A fresh agent can choose the right reference file from `SKILL.md`.
- The smallest representative task succeeds without extra prompting.
- Known failure modes have explicit recovery guidance.
