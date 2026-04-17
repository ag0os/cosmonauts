# Spec: Interactive `cosmonauts init`

## Purpose

Bootstrap a project for use with Cosmonauts by scanning the codebase, interactively gathering context from the user, writing a practical `AGENTS.md`, and activating the right skills for the project's tech stack. This replaces the current fire-and-forget init with an interactive, re-runnable flow.

## Users

Developers adopting Cosmonauts in an existing project. They want their AI agents to have enough project-specific context to be useful from the first interaction — build commands, conventions, gotchas, architectural decisions — without manually writing an instruction file. They also want the right language/framework skills enabled without having to know what's available.

## User Experience

### First run (no AGENTS.md, no config)

The user runs `cosmonauts init` from their project root. The agent starts an interactive session:

**Phase 1 — Scan.** The agent silently explores the project: reads manifest files (package.json, Cargo.toml, pyproject.toml, go.mod, pom.xml, etc.), README, Makefile/build configs, CI config, and existing AI instruction files (CLAUDE.md, .cursor/rules, .cursorrules, .github/copilot-instructions.md, .windsurfrules, .clinerules, AGENTS.md). It detects:

- Languages, frameworks, and package manager
- Build, test, and lint commands (especially non-standard ones)
- Project structure (monorepo, multi-module, or single project)
- Code style rules that differ from language defaults
- Non-obvious gotchas, required env vars, or workflow quirks

**Phase 2 — Ask.** The agent asks the user to fill gaps the scan couldn't answer. Only things the code can't tell it — conventions not captured in config, gotchas developers know from experience, branch/PR conventions, testing quirks. The agent should not ask about things it already found in the scan.

**Phase 3 — Propose AGENTS.md.** The agent presents a summary of what it plans to write, section by section, and asks the user to confirm or adjust before writing. This prevents surprises — the user sees the content before it hits disk.

**Phase 4 — Suggest skills.** The agent checks what skills are available across installed domains and matches them against the detected tech stack. It presents the suggestions to the user: "I see this is a Python/Django project. I'd suggest enabling these skills: `python`, `engineering-principles`. Want to enable them?" The user confirms or adjusts.

**Phase 5 — Write.** The agent:
- Creates `AGENTS.md` at the project root (or updates it — see below)
- Creates `.cosmonauts/config.json` if it doesn't exist, with the chosen skills in the `skills` array
- If `.cosmonauts/config.json` already exists, updates the `skills` array to include the chosen skills (preserving other config)

**Phase 6 — Summary.** The agent recaps what was set up and points out next steps (e.g., "review AGENTS.md and tweak anything that doesn't look right", "run `cosmonauts init` again anytime to re-scan").

### Re-run (AGENTS.md already exists)

The user runs `cosmonauts init` again after their project has evolved (added a frontend, switched test frameworks, etc.). The agent:

1. Reads the existing `AGENTS.md` and scans the current project state
2. Identifies what has changed or what's missing from the existing file
3. Proposes specific improvements — describes what it would add, remove, or change, and why
4. Asks the user to confirm before applying changes
5. Checks if new skills should be enabled based on the updated tech stack
6. Updates the files

The agent never silently overwrites. It always shows the user what it intends to change.

### Error and edge cases

- **No domain installed:** The CLI (not the agent) catches this before the session starts and tells the user to install a domain first. This is existing behavior and stays unchanged.
- **User cancels mid-flow:** Since this is an interactive session, the user can exit at any time (Ctrl+C, `/exit`). No partial writes — the agent only writes files in Phase 5, after confirmation.
- **Existing AI config files (CLAUDE.md, .cursor/rules, etc.):** The agent reads these for content to inform AGENTS.md. It does not delete, rename, or modify them. They are input, not output.
- **Existing `.cosmonauts/config.json` with skills already set:** The agent merges — adds new suggestions, does not remove skills the user previously enabled. If the user wants to remove a skill, they can do so manually or tell the agent during the interactive flow.

## Acceptance Criteria

### AGENTS.md content quality

- When the user runs `init` on a project, the resulting `AGENTS.md` includes build/test/lint commands that are non-obvious (not standard `npm test` or `cargo test` if those are the actual commands)
- When the project uses code style rules that differ from language defaults, those rules appear in `AGENTS.md`
- `AGENTS.md` does not contain generic advice ("write clean code", "handle errors"), file-by-file structure listings, or standard language conventions the LLM already knows
- When CLAUDE.md, .cursor/rules, .cursorrules, .github/copilot-instructions.md, .windsurfrules, or .clinerules exist, their relevant content is incorporated into `AGENTS.md` (not copied verbatim — adapted and deduplicated)
- `AGENTS.md` is concise — a practical reference, not documentation

### Interactive flow

- The agent asks the user at least one question about the project before writing (Phase 2)
- The agent shows the user what it plans to write before creating/modifying `AGENTS.md` (Phase 3)
- The agent presents skill suggestions and waits for confirmation before updating config (Phase 4)
- The agent never writes files without user confirmation

### Skill activation

- When the project uses a language or framework that has a matching available skill, the agent suggests enabling it
- Skill suggestions are based on the actual scan results, not guesses
- Accepted skills are written to the `skills` array in `.cosmonauts/config.json`
- If `.cosmonauts/config.json` doesn't exist, the agent creates it with the skills array and sensible defaults (matching the current scaffold defaults for workflows)

### Re-run / idempotency

- When `AGENTS.md` already exists, the agent proposes improvements rather than overwriting
- The agent shows what it would change and asks for confirmation
- When the tech stack has changed since the last run, the agent suggests enabling newly relevant skills
- Previously enabled skills are not removed from config unless the user explicitly requests it

### Mode change

- `cosmonauts init` runs in interactive mode (not `--print` mode), allowing the agent to ask questions and receive answers

## Scope

### In scope

- Switching init from `--print` to interactive mode
- Agent-driven codebase scanning
- Interactive gap-filling questions
- Creating/updating `AGENTS.md`
- Creating/updating `.cosmonauts/config.json` (skills array only, plus defaults if creating)
- Detecting and reading existing AI instruction files as input
- A skill or prompt that teaches the agent the init workflow

### Out of scope

- `scaffold missions` functionality (creating missions/ directories, task system) — stays separate
- Domain installation (`cosmonauts install coding`) — stays separate, prerequisite for init
- Creating project-specific custom skills (future work)
- An `AskUserQuestion` tool — the agent uses the interactive session's natural conversation flow
- Adding new language/framework skills to the bundled domain (separate work; init works with whatever skills are currently available)

## Assumptions

- Running in interactive mode means the agent can ask questions by simply outputting them and waiting for the user's next message. No special tool needed — this is how `InteractiveMode` already works.
- The Cosmo agent has file-write tools and can create/edit both `AGENTS.md` and `.cosmonauts/config.json` directly.
- The set of available skills can be discovered by the agent by listing what's in the skill directories (or via the skill index it receives). *Verify: does the agent have visibility into the full skill catalogue, including skills not currently enabled?*
- The default config scaffolded when creating a new `config.json` should match the current defaults in `scaffoldProjectConfig()` (workflows, etc.), plus the user-confirmed skills.

## Open Questions

- **Skill discovery at init time:** The agent needs to know ALL available skills (not just enabled ones) to make suggestions. Currently, skill filtering happens before the agent sees the index. Does the init agent need a special mode or tool to see the full unfiltered skill catalogue? Or should it just read the skill directories on disk?
- **Init skill vs init prompt:** Should the init workflow be encoded as a skill the agent loads (allowing future refinement without code changes), or as a hardcoded prompt like today? The user suggested a skill — this seems right for maintainability, but needs design confirmation.
