---
source: archive
plan: init-command
distilledAt: 2026-04-15T15:04:46Z
---

# Interactive /init command — AGENTS.md bootstrap + skill activation

## What Was Built

`cosmonauts init` was changed from a one-shot print flow into an interactive bootstrap session. The command now starts Cosmo in `InteractiveMode`, points it at `/skill:init`, asks before writing, proposes updates when `AGENTS.md` already exists, and can suggest skills from the full installed skill catalogue without breaking normal post-init skill filtering.

The work also removed config-default drift by centralizing the canonical `.cosmonauts/config.json` template in code and reusing it for scaffolding, init prompt generation, and example docs.

## Key Decisions

- **Init workflow lives in a skill, not a hardcoded prompt.** The volatile scan/ask/propose/write behavior moved to `domains/shared/skills/init/SKILL.md` so the bootstrap flow can evolve without editing CLI code.
- **Init gets a temporary skill-filter bypass.** The init session ignores project skill filtering so Cosmo can see the full catalogue when suggesting skills.
- **Normal sessions preserve shared skills automatically.** Project `skills` filters no longer hide framework skills like `plan`, `task`, or `init`; session assembly unions shared-domain skill names with configured project skills.
- **Canonical config defaults come from one factory.** `createDefaultProjectConfig()` became the single source of truth so scaffolded config, init prompt examples, and docs do not drift.
- **Reruns are update flows, not hard stops.** Existing `AGENTS.md` or `.cosmonauts/config.json` should be reviewed and proposed for change before writing, never treated as a reason to abort init.

## Patterns Established

- **Thin-code / thick-skill split:** keep CLI and extension code minimal; put init procedure and content rules in `/skill:init`.
- **Bootstrap prompt contract:** the initial init message must tell Cosmo to load `/skill:init`, include the cwd, embed the canonical config template, and explicitly forbid writes before confirmation.
- **Skill filtering contract:** `ignoreProjectSkills: true` exposes the full catalogue for bootstrap-only sessions; normal filtered sessions use `shared skills ∪ project skills`.
- **Config creation contract:** new `.cosmonauts/config.json` files start from the canonical default template, while existing config is merged rather than replaced.
- **Interactive safety contract:** init must ask at least one question and show proposed `AGENTS.md` / skill changes before writing.

## Files Changed

- `cli/main.ts` — moved `cosmonauts init` onto `InteractiveMode`, kept the no-domain guard, and seeded the bootstrap prompt via a dedicated helper.
- `cli/session.ts` and `lib/agents/session-assembly.ts` — added `ignoreProjectSkills` plumbing and fixed filtered sessions to preserve shared-domain skills.
- `lib/config/defaults.ts` and `lib/config/loader.ts` — centralized canonical project-config defaults and reused them for scaffolding.
- `lib/init/prompt.ts` and `domains/shared/extensions/init/index.ts` — introduced a short shared bootstrap prompt and reduced the init extension to a thin wrapper.
- `domains/shared/skills/init/SKILL.md` — added the authoritative six-phase init workflow and rerun/merge rules.
- `.cosmonauts/config.example.json` and `README.md` — updated docs/examples to describe interactive init behavior and the canonical config shape.
- `tests/agents/session-assembly.test.ts`, `tests/cli/main.test.ts`, `tests/config/scaffold.test.ts`, `tests/extensions/init.test.ts`, `tests/init/prompt.test.ts` — locked in the new filtering, prompt, and interactive-init behavior.

## Gotchas & Lessons

- **A project `skills` array can accidentally break framework behavior.** Without the shared-skill union in session assembly, init-created config can hide core shared skills from planner/task flows immediately after bootstrap.
- **Prompt drift is easy if defaults are duplicated.** The init prompt, scaffolded config, and example config need the same source object or they silently diverge.
- **The init extension should not own workflow logic.** Embedding scan/write rules in the extension made rerun behavior stale and hard to change; keeping only dispatch code there is safer.
- **Bootstrap needs broader visibility than normal operation.** Skill suggestion requires the full installed catalogue, but that broader visibility should be limited to the init session only.
- **Rerun behavior matters as much as first-run behavior.** Treating existing `AGENTS.md` as a stop condition blocks the main maintenance use case: re-scanning an evolved project and proposing targeted updates.
