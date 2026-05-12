---
name: init
description: Interactive project bootstrap workflow for Cosmonauts. Use when running `cosmonauts init` or `/init` to scan a project, ask questions, propose AGENTS.md and config changes, suggest skills, and write files only after confirmation. Do NOT load for normal coding tasks or non-interactive file edits.
---

# Init

This skill defines the full interactive bootstrap workflow for Cosmonauts init.

## Hard Rules

- Treat init as interactive. Ask at least one user-facing question before writing any file.
- Never write or overwrite files without explicit user confirmation.
- If `AGENTS.md` or `.cosmonauts/config.json` already exists, do not stop. Review current content, propose changes, and wait for confirmation before writing.
- Keep workflow logic here, not in the bootstrap prompt.
- Use the injected `.cosmonauts/config.json` template as the canonical starting point for new config creation.

## Six-Phase Workflow

Proceed in this order.

### 1. Scan

Inspect the repository before proposing changes.

Read the strongest project signals first:
- `package.json`, `tsconfig.json`, lockfiles, language manifests
- build/test/lint config files
- existing AI guidance files such as `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `.cursor/rules`, or similar
- key top-level directories and representative entry points

Identify:
- language and framework
- package manager and runtime
- test, lint, and typecheck commands
- major app/library boundaries
- any existing agent instructions worth preserving

### 2. Ask

Ask focused questions before writing. Minimum: confirm the user wants init to proceed after the scan findings.

Ask only what is needed to unblock a good proposal, for example:
- whether to preserve or replace existing guidance files
- whether suggested skills should be conservative or broader
- whether project-specific commands or conventions should be emphasized

If the project is clear enough, ask one concise confirmation question and continue to proposal mode.

### 3. Propose `AGENTS.md`

Draft the proposed `AGENTS.md` content before writing it.

Content rules:
- Keep it concise and practical for AI coding agents.
- Prefer observed facts from the repo over generic advice.
- Preserve important conventions from existing guidance files.
- Do not duplicate large documentation sections.
- Focus on actionable guidance: project purpose, stack, commands, file layout, and working conventions.

Recommended structure:
1. project overview
2. key commands (build, test, lint, typecheck, run)
3. architecture or directory map
4. coding conventions and workflow expectations
5. any project-specific warnings or rules

If `AGENTS.md` already exists, show the delta you recommend. Summarize what will change and why. Propose before overwrite; never hard-stop just because the file exists.

If `CLAUDE.md` or other guidance exists, adapt the useful parts into `AGENTS.md` rather than copying blindly.

### 4. Suggest skills

Suggest a small, relevant `skills` list for `.cosmonauts/config.json` based on the scan.

Rules:
- Base suggestions on observed technologies and workflows.
- Prefer the minimum useful set.
- Shared/framework skills remain available automatically; do not add them just to preserve access.
- Present the suggested skills as a proposal the user can accept or modify.

Do **not** add a `workflows` block. The active domain's workflows (e.g. `plan-and-build`, `implement`, `verify`, `spec-and-build`, `adapt`) are inherited automatically — `cosmonauts --list-workflows` shows them with no config. A `workflows` entry in project config *overrides* the domain definition of that name, so only add one when the user explicitly wants to customize or add a chain. The canonical catalog lives in `docs/orchestration.md`.

### 5. Write

Only after explicit confirmation:
- create or update `AGENTS.md`
- create or update `.cosmonauts/config.json`

Config merge rules:
- If `.cosmonauts/config.json` does not exist, start from the injected canonical default template (which is intentionally minimal — typically just an empty object).
- If it exists, merge into the existing config instead of replacing it wholesale.
- Preserve existing `domain`, `skillPaths`, and custom `workflows` unless the user asked to change them.
- Update `skills` deliberately: keep existing relevant entries, add approved suggestions, and avoid removing user-defined values without confirmation.
- Do not introduce a `workflows` block on a fresh init — workflows are inherited from the domain (see phase 4). Only write one if the user is customizing a chain.
- Preserve valid user formatting when practical, but correctness matters more than formatting fidelity.

Rerun behavior:
- Treat reruns as update flows, not first-run flows.
- Read existing `AGENTS.md` and config, propose the changes, and wait for confirmation before writing.
- If nothing should change, say so instead of rewriting files.

### 6. Summarize

After writing or after a declined proposal, summarize:
- what you found
- what you proposed
- what was written or intentionally left unchanged
- any follow-up suggestions for future refinement

## Common Problems

- **Existing guidance files conflict.** Prefer the most project-specific and current instructions, mention the conflict, and ask which direction to keep if the choice is ambiguous.
- **Scan results are incomplete.** Ask one targeted question instead of guessing.
- **User declines writes.** Leave the repository unchanged and provide the proposal in-chat.
- **Config already has custom workflows or skill paths.** Preserve them unless the user explicitly approves changes.

## Related Skills

- `/skill:pi` — Pi framework behavior and built-in capabilities
- `/skill:skill-writing` — Writing or improving skills if init reveals missing skill documentation
