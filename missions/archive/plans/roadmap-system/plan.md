---
title: Project Roadmap Document and Management Skill
status: active
createdAt: '2026-03-05T20:40:06.400Z'
updatedAt: '2026-03-05T20:40:06.400Z'
---

## Summary

Create an official `ROADMAP.md` at the project root as the single source of truth for "what's next," plus a skill that teaches agents how to read, pick up, and maintain roadmap items. The roadmap sits above plans in the work hierarchy — it's the prioritized backlog that feeds the existing `plan → tasks → archive → memory` lifecycle.

## Scope

**Included:**
- Create `ROADMAP.md` at the project root with a three-horizon structure (Now / Next / Later)
- Seed it with current state extracted from DESIGN.md Phase 1–4 items
- Create `skills/domains/roadmap/SKILL.md` teaching agents the roadmap conventions and update procedures
- Update DESIGN.md to reference ROADMAP.md instead of maintaining its own roadmap section (keep a brief pointer, remove the detailed items)

**Excluded:**
- No custom tools or extensions — agents use existing `read`/`edit`/`write` tools
- No automation (auto-move items between horizons, auto-remove on archive) — keep it manual and skill-driven for now
- No prompt changes to planner/cosmo — they can load the skill on demand

**Assumptions:**
- The roadmap is a human-curated, agent-maintained document. Humans decide priorities and add items. Agents update it as they pick up work and complete it.
- Items are removed from the roadmap when their plan is archived (not when the plan is created — the "Now" section tracks in-flight work).

## Approach

### The Three-Horizon Structure

The roadmap uses three horizons instead of numbered phases. Phases imply strict sequencing; horizons communicate priority and readiness:

- **Now** — Actively being worked on. Each item links to its plan. Items are removed when the plan is archived and memory is distilled.
- **Next** — Scoped and ready to pick up. An agent or human can start planning any of these. Ordered by priority (top = highest).
- **Later** — Directional ideas. Not yet scoped enough to plan. May have open questions or dependencies on earlier work.

This structure gives agents a clear answer to "what should I work on?" — scan Now for in-flight context, pick the top item from Next.

### Item Format

Each roadmap item is a markdown section with a slug, title, and brief description:

```markdown
### `response-cache`: HTTP Response Cache
Add an in-memory LRU cache to the API client to reduce redundant API calls. Cache by URL with configurable TTL.
```

The slug becomes the plan slug when the item is picked up. Items in "Now" also include a plan link:

```markdown
### `agent-thinking-levels`: Per-Agent Thinking Level Configuration
Add thinkingLevel support to agent definitions and orchestration pipeline.
**Plan**: [agent-thinking-levels](missions/plans/agent-thinking-levels/plan.md)
```

No YAML, no IDs, no status fields. The horizon *is* the status. The slug *is* the ID. Minimal ceremony.

### Lifecycle Integration

```
ROADMAP.md (Next)  →  pick up  →  ROADMAP.md (Now) + plan created
                                          ↓
                                   tasks created & implemented
                                          ↓
                                   plan archived → memory distilled
                                          ↓
                                   item removed from ROADMAP.md
```

When an agent picks up an item:
1. Read ROADMAP.md, select the top item from Next
2. Move the item from Next to Now
3. Add a plan link to the item
4. Create the plan via `plan_create`

When a plan completes:
1. Archive the plan via `plan_archive`
2. Distill memory (existing archive skill)
3. Remove the item from ROADMAP.md entirely

The roadmap always reflects current state: Now = in-flight, Next = ready, Later = future.

### The Skill

`skills/domains/roadmap/SKILL.md` teaches agents:
- The three-horizon structure and what each means
- How to read the roadmap and select the next item
- How to move items between horizons
- How to add new items (with proper slug/format)
- How to remove completed items
- The relationship between roadmap items and plans

The skill is loaded on demand via `/skill:roadmap`. The planner and cosmo agents are the primary consumers — the planner loads it when starting a new piece of work, cosmo loads it when the user asks "what's next?"

### Seeding the Roadmap

Extract from DESIGN.md Phases 1–4 and reorganize:

**Now:**
- `agent-thinking-levels` (already has an active plan)

**Next** (from Phase 1, most concrete):
- `deepwiki-tool` — deepwiki_ask tool for querying public GitHub repos
- `web-fetch-tool` — web_fetch tool for fetching and extracting web page content
- `language-skills` — Additional language skills (Rust, Python, Swift, Go)
- `domain-skills` — Domain skills for testing and code-review

**Later** (from Phases 2–4, less concrete):
- `memory-system` — Persistent memory across sessions (daily logs, MEMORY.md, search)
- `parallel-workers` — Fan-out independent tasks to multiple workers concurrently
- `browser-tool` — Browser automation via Playwright for UI testing
- `heartbeat` — Autonomous background work scheduling
- `channels` — External communication transports (Telegram, WhatsApp)

### DESIGN.md Update

Replace the detailed Phase 0–4 roadmap section in DESIGN.md with a brief pointer:

```markdown
## Roadmap

See [ROADMAP.md](ROADMAP.md) for the current prioritized backlog.

Phase 0 (core infrastructure) is complete. See `memory/` for distilled knowledge from completed work.
```

This eliminates the duplication between DESIGN.md and the new roadmap, and prevents the two from drifting out of sync.

## Files to Change

- `ROADMAP.md` (new) — The roadmap document with three-horizon structure, seeded from DESIGN.md phases
- `skills/domains/roadmap/SKILL.md` (new) — Skill teaching agents roadmap conventions and procedures
- `DESIGN.md` — Replace the detailed Roadmap section (Phases 0–4) with a pointer to ROADMAP.md

## Risks

- **Drift between ROADMAP.md and reality**: If agents don't consistently update the roadmap (forget to move items to Now, forget to remove completed items), it becomes stale. The skill mitigates this by making the procedure explicit, but there's no enforcement.
- **Granularity mismatch**: Some roadmap items may be too coarse (an entire "memory system") or too fine (a single tool). The skill should guide appropriate granularity — each item should map to roughly one plan (3–12 tasks).
- **DESIGN.md information loss**: Moving roadmap details out of DESIGN.md means DESIGN.md no longer tells the full story. This is intentional — DESIGN.md is architecture, ROADMAP.md is direction — but readers who only read DESIGN.md may miss the roadmap context.

## Implementation Order

1. **Create ROADMAP.md** — Write the roadmap document with the three-horizon structure, seeded from current DESIGN.md phases. This is the primary deliverable.
2. **Create the roadmap skill** — Write `skills/domains/roadmap/SKILL.md` teaching agents the conventions and procedures.
3. **Update DESIGN.md** — Replace the detailed roadmap section with a pointer to ROADMAP.md.
