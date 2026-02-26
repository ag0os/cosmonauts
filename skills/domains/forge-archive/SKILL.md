---
name: forge-archive
description: Distill archived plans and tasks into concise memory files that capture decisions, patterns, and lessons.
---

# Forge Archive Distillation

After a plan is archived, its learnings should be distilled into a memory file — a concise record of what was built, why, and what the next person working in this area needs to know.

## When to Distill

Distill after `plan_archive` moves a completed plan and its tasks to `forge/archive/`. Not every archived plan needs distillation — skip it for trivial plans (single-task, no meaningful decisions). Distill when the work established patterns, made non-obvious decisions, or changed areas of the codebase others will touch.

## Distillation Procedure

### 1. Locate Archived Materials

Find the archived plan directory and its associated tasks:

- **Plan**: `forge/archive/plans/<slug>/plan.md` (and optional `spec.md`)
- **Tasks**: `forge/archive/tasks/` — look for task files containing a `plan:<slug>` label in their frontmatter

The slug is the plan's directory name (e.g., `response-cache`, `auth-system`).

### 2. Read All Source Materials

Read every file before writing anything:

- Read `plan.md` fully — understand the original design intent
- Read `spec.md` if it exists — the problem definition may contain context the plan omits
- Read each associated task file — pay attention to:
  - Acceptance criteria (what was actually verified)
  - Implementation notes appended during work
  - Status and any task-level decisions

### 3. Extract Learnings

Focus on what helps the next agent or human working in this area. Ask:

- **What was the outcome?** — Summarize what exists now that did not before. High-level, not a file listing.
- **What decisions were made?** — Why was X chosen over Y? What trade-offs were accepted?
- **What patterns were established?** — Conventions, naming, file organization, API shapes that future work should follow.
- **What files were affected?** — Which areas of the codebase changed, with enough context to know why.
- **What surprised you?** — Gotchas, edge cases, things that would bite someone unfamiliar with this area.

### 4. Write the Memory File

Write to `memory/<slug>.md` at the project root. Create the `memory/` directory if it does not exist.

## Memory File Format

```markdown
---
source: forge-archive
plan: <slug>
distilledAt: <ISO 8601 date>
---

# <Plan Title>

## What Was Built
[2-4 sentence summary of the outcome. What exists now that did not before.]

## Key Decisions
- [Decision: why X was chosen over Y]
- [Decision: trade-off that was accepted and why]

## Patterns Established
- [Pattern: convention or approach that future work should follow]
- [Pattern: naming, file organization, or API shape to reuse]

## Files Changed
- `path/to/file.ts` — [what changed and why]
- `path/to/other.ts` — [what changed and why]

## Gotchas & Lessons
- [Lesson: something that surprised you or would bite someone later]
- [Lesson: edge case or constraint that is not obvious from the code]
```

### Frontmatter Fields

- `source` — Always `forge-archive` for plan distillations. Tracks provenance.
- `plan` — The plan slug. Links the memory back to the archived plan.
- `distilledAt` — ISO 8601 timestamp of when the distillation was created.

### Section Guidelines

**What Was Built** — Outcome, not process. "Added an in-memory LRU cache to the API client with TTL-based expiration" not "Created cache.ts, modified client.ts, added tests."

**Key Decisions** — Each entry states the decision AND the reasoning. "Used LRU eviction over LFU because access patterns are recency-biased and LRU is simpler to implement correctly." Omit decisions that are obvious from the code.

**Patterns Established** — Things the next developer should follow. "All cache configuration uses an options object with defaults, matching the existing API client pattern." Only include patterns that are non-obvious or that you consciously chose.

**Files Changed** — Not every file, just the ones that matter. Group related changes. Include enough context that someone can find the right area of the codebase without reading git history.

**Gotchas & Lessons** — The most valuable section. Things that are true but not obvious. "The cache must be invalidated before the response is returned, not after — reversing this order causes stale reads in write-then-read patterns."

## Where Memory Files Go

- **Location**: `memory/` at the project root
- **Naming**: `<slug>.md` matching the plan slug (e.g., `memory/response-cache.md`)
- **Purpose**: Project-level context files consumed by agents alongside AGENTS.md and skills. They accumulate institutional knowledge about the codebase.

## Good vs Bad Distillation

**Good distillation is:**

- **Concise** — 50-150 lines. If it is longer, you are including too much detail.
- **Decision-focused** — "We chose X because Y", not "we implemented X."
- **Forward-looking** — Helps the next person working in this area. Written for a reader who has not seen the plan.
- **Actionable** — Contains patterns to follow and gotchas to avoid, not just history.

**Bad distillation is:**

- **A changelog** — That is what git history is for. Do not list commits or PRs.
- **A copy of the plan** — That is what the archive is for. Do not repeat the design section.
- **A file listing without context** — "Changed foo.ts, bar.ts, baz.ts" tells the reader nothing.
- **Vague** — "We learned a lot about testing" is not actionable. State what you learned.

**Litmus test**: If someone reads only the memory file (not the plan, not the tasks, not the git log), can they understand what was built, why the key decisions were made, and what to watch out for? If yes, the distillation is good.

## Source-Agnostic Design

The memory format is general. While forge archives are the primary source, the same structure works for any knowledge source:

- **Session transcripts** — Conversation logs distilled into memory
- **Design reviews** — Discussion notes distilled into decisions and patterns
- **Decision records** — ADRs distilled into the same sections

The `source` frontmatter field tracks provenance. Use `forge-archive` for plan distillations, and other values (e.g., `session`, `design-review`) for other sources. The memory format stays the same regardless of where the knowledge came from.
